package application

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"

	"golang.org/x/crypto/argon2"
)

var (
	ErrInvalidLogin = errors.New("invalid credentials")
	ErrUnauthorized = errors.New("unauthorized")
	ErrInvalidCSRF  = errors.New("invalid csrf token")
	ErrForbidden    = errors.New("forbidden")
)

type AuthService struct {
	db *sql.DB
}

type LoginInput struct {
	Username string
	Password string
}

type SessionView struct {
	Username  string   `json:"username"`
	Roles     []string `json:"roles"`
	CSRFToken string   `json:"csrfToken"`
}

type LoginResult struct {
	SessionToken string
	CSRFToken    string
	ExpiresAt    time.Time
	Session      SessionView
}

func NewAuthService(db *sql.DB) *AuthService {
	return &AuthService{db: db}
}

func (s *AuthService) Login(ctx context.Context, input LoginInput) (*LoginResult, error) {
	username := strings.TrimSpace(input.Username)

	var userID, storedUsername, passwordHash string
	err := s.db.QueryRowContext(
		ctx,
		`SELECT id, username, password_hash FROM users WHERE username=?`,
		username,
	).Scan(&userID, &storedUsername, &passwordHash)
	if err != nil || !verifyPassword(input.Password, passwordHash) {
		_ = s.audit(ctx, "", "LoginFailed", "user", username, "{}")
		return nil, ErrInvalidLogin
	}

	roles, err := s.roles(ctx, userID)
	if err != nil {
		return nil, err
	}

	sessionToken := randomToken()
	csrfToken := randomToken()
	expiresAt := time.Now().UTC().Add(12 * time.Hour)
	now := time.Now().UTC().Format(time.RFC3339)

	if _, err := s.db.ExecContext(
		ctx,
		`INSERT INTO sessions(id, user_id, token_hash, csrf_token, expires_at, created_at)
		 VALUES(?, ?, ?, ?, ?, ?)`,
		randomID(),
		userID,
		hashToken(sessionToken),
		csrfToken,
		expiresAt.Format(time.RFC3339),
		now,
	); err != nil {
		return nil, fmt.Errorf("create session: %w", err)
	}

	if err := s.audit(ctx, userID, "Login", "user", userID, "{}"); err != nil {
		return nil, err
	}

	return &LoginResult{
		SessionToken: sessionToken,
		CSRFToken:    csrfToken,
		ExpiresAt:    expiresAt,
		Session: SessionView{
			Username:  storedUsername,
			Roles:     roles,
			CSRFToken: csrfToken,
		},
	}, nil
}

func (s *AuthService) CurrentSession(ctx context.Context, sessionToken string) (*SessionView, error) {
	userID, csrfToken, err := s.sessionUser(ctx, sessionToken)
	if err != nil {
		return nil, err
	}

	var username string
	if err := s.db.QueryRowContext(ctx, `SELECT username FROM users WHERE id=?`, userID).Scan(&username); err != nil {
		return nil, fmt.Errorf("read session user: %w", err)
	}

	roles, err := s.roles(ctx, userID)
	if err != nil {
		return nil, err
	}

	return &SessionView{
		Username:  username,
		Roles:     roles,
		CSRFToken: csrfToken,
	}, nil
}

func (s *AuthService) RequireRole(ctx context.Context, sessionToken, role string) (string, error) {
	userID, _, err := s.sessionUser(ctx, sessionToken)
	if err != nil {
		return "", err
	}

	if role == "" {
		return userID, nil
	}

	roles, err := s.roles(ctx, userID)
	if err != nil {
		return "", err
	}

	if hasRole(roles, role) || hasRole(roles, "Admin") {
		return userID, nil
	}

	return "", ErrForbidden
}

func (s *AuthService) ValidateCSRF(ctx context.Context, sessionToken, csrfToken string) error {
	_, storedToken, err := s.sessionUser(ctx, sessionToken)
	if err != nil {
		return err
	}
	if csrfToken == "" || subtle.ConstantTimeCompare([]byte(csrfToken), []byte(storedToken)) != 1 {
		return ErrInvalidCSRF
	}
	return nil
}

func hasRole(roles []string, role string) bool {
	if role == "Viewer" && len(roles) > 0 {
		return true
	}
	for _, current := range roles {
		if current == role {
			return true
		}
	}
	return false
}

func (s *AuthService) Logout(ctx context.Context, sessionToken string) error {
	userID, _, err := s.sessionUser(ctx, sessionToken)
	if err != nil {
		return nil
	}

	if _, err := s.db.ExecContext(
		ctx,
		`UPDATE sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL`,
		time.Now().UTC().Format(time.RFC3339),
		hashToken(sessionToken),
	); err != nil {
		return fmt.Errorf("revoke session: %w", err)
	}

	return s.audit(ctx, userID, "Logout", "user", userID, "{}")
}

func (s *AuthService) sessionUser(ctx context.Context, sessionToken string) (string, string, error) {
	if sessionToken == "" {
		return "", "", ErrUnauthorized
	}

	var userID, csrfToken string
	if err := s.db.QueryRowContext(
		ctx,
		`SELECT user_id, csrf_token
		 FROM sessions
		 WHERE token_hash=? AND revoked_at IS NULL AND expires_at > ?`,
		hashToken(sessionToken),
		time.Now().UTC().Format(time.RFC3339),
	).Scan(&userID, &csrfToken); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", "", ErrUnauthorized
		}
		return "", "", fmt.Errorf("read session: %w", err)
	}

	return userID, csrfToken, nil
}

func (s *AuthService) roles(ctx context.Context, userID string) ([]string, error) {
	rows, err := s.db.QueryContext(
		ctx,
		`SELECT roles.name
		 FROM roles
		 JOIN user_roles ON user_roles.role_id = roles.id
		 WHERE user_roles.user_id=?
		 ORDER BY roles.name`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("read roles: %w", err)
	}
	defer func() { _ = rows.Close() }()

	roles := []string{}
	for rows.Next() {
		var role string
		if err := rows.Scan(&role); err != nil {
			return nil, fmt.Errorf("scan role: %w", err)
		}
		roles = append(roles, role)
	}
	return roles, nil
}

func (s *AuthService) audit(ctx context.Context, actorUserID, action, targetType, targetID, detailsJSON string) error {
	if _, err := s.db.ExecContext(
		ctx,
		`INSERT INTO audit_logs(id, actor_user_id, action, target_type, target_id, created_at, details_json)
		 VALUES(?, ?, ?, ?, ?, ?, ?)`,
		randomID(),
		actorUserID,
		action,
		targetType,
		targetID,
		time.Now().UTC().Format(time.RFC3339),
		detailsJSON,
	); err != nil {
		return fmt.Errorf("write audit log: %w", err)
	}
	return nil
}

func verifyPassword(password, encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false
	}

	got := argon2.IDKey([]byte(password), salt, 1, 64*1024, 4, 32)
	return subtle.ConstantTimeCompare(got, want) == 1
}

func randomToken() string {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(bytes)
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}
