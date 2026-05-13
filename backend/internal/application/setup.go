package application

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"golang.org/x/crypto/argon2"
)

var (
	ErrAlreadySetup = errors.New("setup already completed")
	ErrWeakSetup    = errors.New("username or password is too short")
)

type SetupService struct {
	db *sql.DB
}

type CreateAdminInput struct {
	Username string
	Email    string
	Password string
}

func NewSetupService(db *sql.DB) *SetupService {
	return &SetupService{db: db}
}

func (s *SetupService) SetupRequired(ctx context.Context) (bool, error) {
	var count int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&count); err != nil {
		return false, fmt.Errorf("count users: %w", err)
	}
	return count == 0, nil
}

func (s *SetupService) CreateAdmin(ctx context.Context, input CreateAdminInput) error {
	username := strings.TrimSpace(input.Username)
	email := strings.TrimSpace(input.Email)
	if len(username) < 3 || len(input.Password) < 12 || !isValidEmail(email) {
		return ErrWeakSetup
	}

	required, err := s.SetupRequired(ctx)
	if err != nil {
		return err
	}
	if !required {
		return ErrAlreadySetup
	}

	hash, err := hashPassword(input.Password)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin setup transaction: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	userID := randomID()
	now := time.Now().UTC().Format(time.RFC3339)
	if _, err = tx.ExecContext(
		ctx,
		`INSERT INTO users(id, username, email, password_hash, created_at) VALUES(?, ?, ?, ?, ?)`,
		userID,
		username,
		email,
		hash,
		now,
	); err != nil {
		return fmt.Errorf("insert admin user: %w", err)
	}

	if _, err = tx.ExecContext(
		ctx,
		`INSERT INTO user_roles(user_id, role_id)
		 SELECT ?, id FROM roles WHERE name IN ('Admin', 'Editor', 'Viewer')`,
		userID,
	); err != nil {
		return fmt.Errorf("assign admin roles: %w", err)
	}

	if _, err = tx.ExecContext(
		ctx,
		`INSERT INTO audit_logs(id, actor_user_id, action, target_type, target_id, created_at, details_json)
		 VALUES(?, ?, 'SetupAdminCreated', 'user', ?, ?, '{}')`,
		randomID(),
		userID,
		userID,
		now,
	); err != nil {
		return fmt.Errorf("write setup audit log: %w", err)
	}

	if err = tx.Commit(); err != nil {
		return fmt.Errorf("commit setup transaction: %w", err)
	}

	return nil
}

func hashPassword(password string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}

	hash := argon2.IDKey([]byte(password), salt, 1, 64*1024, 4, 32)
	return "$argon2id$v=19$m=65536,t=1,p=4$" +
		base64.RawStdEncoding.EncodeToString(salt) + "$" +
		base64.RawStdEncoding.EncodeToString(hash), nil
}

func randomID() string {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		panic(err)
	}
	return hex.EncodeToString(bytes[:])
}
