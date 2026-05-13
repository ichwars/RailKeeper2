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
	ErrInvalidLogin    = errors.New("invalid credentials")
	ErrUnauthorized    = errors.New("unauthorized")
	ErrInvalidCSRF     = errors.New("invalid csrf token")
	ErrForbidden       = errors.New("forbidden")
	ErrUserValidation  = errors.New("user validation failed")
	ErrUserNotFound    = errors.New("user not found")
	ErrSessionNotFound = errors.New("session not found")
	ErrDuplicateUser   = errors.New("user already exists")
	ErrLastAdmin       = errors.New("last admin cannot be removed")
)

type AuthService struct {
	db *sql.DB
}

type LoginInput struct {
	Username string
	Password string
}

type ChangePasswordInput struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

type SessionView struct {
	Username  string   `json:"username"`
	Roles     []string `json:"roles"`
	CSRFToken string   `json:"csrfToken"`
}

type RoleView struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type UserView struct {
	ID        string   `json:"id"`
	Username  string   `json:"username"`
	Roles     []string `json:"roles"`
	CreatedAt string   `json:"createdAt"`
}

type AuditLogEntry struct {
	ID            string `json:"id"`
	ActorUserID   string `json:"actorUserId,omitempty"`
	ActorUsername string `json:"actorUsername,omitempty"`
	Action        string `json:"action"`
	TargetType    string `json:"targetType,omitempty"`
	TargetID      string `json:"targetId,omitempty"`
	CreatedAt     string `json:"createdAt"`
	DetailsJSON   string `json:"detailsJson"`
}

type SessionRecord struct {
	ID        string `json:"id"`
	UserID    string `json:"userId"`
	Username  string `json:"username"`
	CreatedAt string `json:"createdAt"`
	ExpiresAt string `json:"expiresAt"`
	RevokedAt string `json:"revokedAt,omitempty"`
	Active    bool   `json:"active"`
}

type CreateUserInput struct {
	Username string   `json:"username"`
	Password string   `json:"password"`
	Roles    []string `json:"roles"`
}

type UpdateUserInput struct {
	Username string   `json:"username"`
	Password string   `json:"password"`
	Roles    []string `json:"roles"`
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

func (s *AuthService) ListUsers(ctx context.Context) ([]UserView, error) {
	rows, err := s.db.QueryContext(
		ctx,
		`SELECT id, username, created_at FROM users ORDER BY lower(username)`,
	)
	if err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	defer func() { _ = rows.Close() }()

	users := []UserView{}
	for rows.Next() {
		var user UserView
		if err := rows.Scan(&user.ID, &user.Username, &user.CreatedAt); err != nil {
			_ = rows.Close()
			return nil, fmt.Errorf("scan user: %w", err)
		}
		users = append(users, user)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read users: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close users: %w", err)
	}

	for index := range users {
		users[index].Roles, err = s.roles(ctx, users[index].ID)
		if err != nil {
			return nil, err
		}
	}
	return users, nil
}

func (s *AuthService) ListRoles(ctx context.Context) ([]RoleView, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, name FROM roles ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("list roles: %w", err)
	}
	defer func() { _ = rows.Close() }()

	roles := []RoleView{}
	for rows.Next() {
		var role RoleView
		if err := rows.Scan(&role.ID, &role.Name); err != nil {
			return nil, fmt.Errorf("scan role: %w", err)
		}
		roles = append(roles, role)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read roles: %w", err)
	}
	return roles, nil
}

func (s *AuthService) ListAuditLog(ctx context.Context, limit int) ([]AuditLogEntry, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}

	rows, err := s.db.QueryContext(
		ctx,
		`SELECT audit_logs.id,
		        COALESCE(audit_logs.actor_user_id, ''),
		        COALESCE(users.username, ''),
		        audit_logs.action,
		        COALESCE(audit_logs.target_type, ''),
		        COALESCE(audit_logs.target_id, ''),
		        audit_logs.created_at,
		        COALESCE(audit_logs.details_json, '{}')
		   FROM audit_logs
		   LEFT JOIN users ON users.id = audit_logs.actor_user_id
		  ORDER BY audit_logs.created_at DESC, audit_logs.id DESC
		  LIMIT ?`,
		limit,
	)
	if err != nil {
		return nil, fmt.Errorf("list audit log: %w", err)
	}
	defer func() { _ = rows.Close() }()

	entries := []AuditLogEntry{}
	for rows.Next() {
		var entry AuditLogEntry
		if err := rows.Scan(
			&entry.ID,
			&entry.ActorUserID,
			&entry.ActorUsername,
			&entry.Action,
			&entry.TargetType,
			&entry.TargetID,
			&entry.CreatedAt,
			&entry.DetailsJSON,
		); err != nil {
			return nil, fmt.Errorf("scan audit log: %w", err)
		}
		entries = append(entries, entry)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read audit log: %w", err)
	}
	return entries, nil
}

func (s *AuthService) ListSessions(ctx context.Context) ([]SessionRecord, error) {
	rows, err := s.db.QueryContext(
		ctx,
		`SELECT sessions.id,
		        sessions.user_id,
		        users.username,
		        sessions.created_at,
		        sessions.expires_at,
		        COALESCE(sessions.revoked_at, ''),
		        CASE WHEN sessions.revoked_at IS NULL AND sessions.expires_at > ? THEN 1 ELSE 0 END AS active
		   FROM sessions
		   JOIN users ON users.id = sessions.user_id
		  ORDER BY active DESC, sessions.created_at DESC
		  LIMIT 200`,
		time.Now().UTC().Format(time.RFC3339),
	)
	if err != nil {
		return nil, fmt.Errorf("list sessions: %w", err)
	}
	defer func() { _ = rows.Close() }()

	sessions := []SessionRecord{}
	for rows.Next() {
		var session SessionRecord
		var active int
		if err := rows.Scan(&session.ID, &session.UserID, &session.Username, &session.CreatedAt, &session.ExpiresAt, &session.RevokedAt, &active); err != nil {
			return nil, fmt.Errorf("scan session: %w", err)
		}
		session.Active = active == 1
		sessions = append(sessions, session)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read sessions: %w", err)
	}
	return sessions, nil
}

func (s *AuthService) RevokeSession(ctx context.Context, actorUserID, sessionID string) error {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return ErrSessionNotFound
	}
	result, err := s.db.ExecContext(
		ctx,
		`UPDATE sessions SET revoked_at=? WHERE id=? AND revoked_at IS NULL`,
		time.Now().UTC().Format(time.RFC3339),
		sessionID,
	)
	if err != nil {
		return fmt.Errorf("revoke session: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read revoked session count: %w", err)
	}
	if affected == 0 {
		return ErrSessionNotFound
	}
	return s.audit(ctx, actorUserID, "SessionRevoked", "session", sessionID, "{}")
}

func (s *AuthService) ChangeOwnPassword(ctx context.Context, userID, sessionToken string, input ChangePasswordInput) error {
	if len(input.NewPassword) < 12 {
		return ErrUserValidation
	}
	var currentHash string
	if err := s.db.QueryRowContext(ctx, `SELECT password_hash FROM users WHERE id=?`, userID).Scan(&currentHash); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrUserNotFound
		}
		return fmt.Errorf("read password hash: %w", err)
	}
	if !verifyPassword(input.CurrentPassword, currentHash) {
		_ = s.audit(ctx, userID, "PasswordChangeFailed", "user", userID, "{}")
		return ErrInvalidLogin
	}

	nextHash, err := hashPassword(input.NewPassword)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin password change: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	if _, err = tx.ExecContext(ctx, `UPDATE users SET password_hash=? WHERE id=?`, nextHash, userID); err != nil {
		return fmt.Errorf("update password: %w", err)
	}
	if _, err = tx.ExecContext(
		ctx,
		`UPDATE sessions SET revoked_at=? WHERE user_id=? AND token_hash<>? AND revoked_at IS NULL`,
		time.Now().UTC().Format(time.RFC3339),
		userID,
		hashToken(sessionToken),
	); err != nil {
		return fmt.Errorf("revoke other sessions: %w", err)
	}
	if err = s.auditTx(ctx, tx, userID, "PasswordChanged", "user", userID, "{}"); err != nil {
		return err
	}
	if err = tx.Commit(); err != nil {
		return fmt.Errorf("commit password change: %w", err)
	}
	return nil
}

func (s *AuthService) CreateUser(ctx context.Context, actorUserID string, input CreateUserInput) (*UserView, error) {
	username := strings.TrimSpace(input.Username)
	roleNames := cleanRoleNames(input.Roles)
	if len(username) < 3 || len(input.Password) < 12 || len(roleNames) == 0 {
		return nil, ErrUserValidation
	}

	hash, err := hashPassword(input.Password)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin user create: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	if err = s.ensureRolesExist(ctx, tx, roleNames); err != nil {
		return nil, err
	}

	userID := randomID()
	now := time.Now().UTC().Format(time.RFC3339)
	if _, err = tx.ExecContext(
		ctx,
		`INSERT INTO users(id, username, password_hash, created_at) VALUES(?, ?, ?, ?)`,
		userID,
		username,
		hash,
		now,
	); err != nil {
		if isUniqueConstraint(err) {
			return nil, ErrDuplicateUser
		}
		return nil, fmt.Errorf("insert user: %w", err)
	}

	if err = s.assignRoles(ctx, tx, userID, roleNames); err != nil {
		return nil, err
	}
	if err = s.auditTx(ctx, tx, actorUserID, "UserCreated", "user", userID, "{}"); err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit user create: %w", err)
	}

	return s.GetUser(ctx, userID)
}

func (s *AuthService) GetUser(ctx context.Context, userID string) (*UserView, error) {
	var user UserView
	if err := s.db.QueryRowContext(
		ctx,
		`SELECT id, username, created_at FROM users WHERE id=?`,
		userID,
	).Scan(&user.ID, &user.Username, &user.CreatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("read user: %w", err)
	}
	var err error
	user.Roles, err = s.roles(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (s *AuthService) UpdateUser(ctx context.Context, actorUserID, userID string, input UpdateUserInput) (*UserView, error) {
	username := strings.TrimSpace(input.Username)
	roleNames := cleanRoleNames(input.Roles)
	if len(username) < 3 || len(roleNames) == 0 {
		return nil, ErrUserValidation
	}
	if input.Password != "" && len(input.Password) < 12 {
		return nil, ErrUserValidation
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin user update: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	var existingID string
	if err = tx.QueryRowContext(ctx, `SELECT id FROM users WHERE id=?`, userID).Scan(&existingID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("read user for update: %w", err)
	}
	if err = s.ensureRolesExist(ctx, tx, roleNames); err != nil {
		return nil, err
	}
	if !hasRole(roleNames, "Admin") {
		if err = s.ensureAnotherAdmin(ctx, tx, userID); err != nil {
			return nil, err
		}
	}

	if input.Password != "" {
		hash, hashErr := hashPassword(input.Password)
		if hashErr != nil {
			err = fmt.Errorf("hash password: %w", hashErr)
			return nil, err
		}
		_, err = tx.ExecContext(ctx, `UPDATE users SET username=?, password_hash=? WHERE id=?`, username, hash, userID)
	} else {
		_, err = tx.ExecContext(ctx, `UPDATE users SET username=? WHERE id=?`, username, userID)
	}
	if err != nil {
		if isUniqueConstraint(err) {
			return nil, ErrDuplicateUser
		}
		return nil, fmt.Errorf("update user: %w", err)
	}

	if err = s.assignRoles(ctx, tx, userID, roleNames); err != nil {
		return nil, err
	}
	if err = s.auditTx(ctx, tx, actorUserID, "UserUpdated", "user", userID, "{}"); err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit user update: %w", err)
	}

	return s.GetUser(ctx, userID)
}

func (s *AuthService) DeleteUser(ctx context.Context, actorUserID, userID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin user delete: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	var count int
	if err = tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE id=?`, userID).Scan(&count); err != nil {
		return fmt.Errorf("read user for delete: %w", err)
	}
	if count == 0 {
		return ErrUserNotFound
	}
	roles, err := s.rolesTx(ctx, tx, userID)
	if err != nil {
		return err
	}
	if hasRole(roles, "Admin") {
		if err = s.ensureAnotherAdmin(ctx, tx, userID); err != nil {
			return err
		}
	}
	if err = s.auditTx(ctx, tx, actorUserID, "UserDeleted", "user", userID, "{}"); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM users WHERE id=?`, userID); err != nil {
		return fmt.Errorf("delete user: %w", err)
	}
	if err = tx.Commit(); err != nil {
		return fmt.Errorf("commit user delete: %w", err)
	}
	return nil
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

func (s *AuthService) rolesTx(ctx context.Context, tx *sql.Tx, userID string) ([]string, error) {
	rows, err := tx.QueryContext(
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
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read roles: %w", err)
	}
	return roles, nil
}

func cleanRoleNames(values []string) []string {
	seen := map[string]struct{}{}
	out := []string{}
	for _, value := range values {
		role := strings.TrimSpace(value)
		if role == "" {
			continue
		}
		if _, ok := seen[role]; ok {
			continue
		}
		seen[role] = struct{}{}
		out = append(out, role)
	}
	return out
}

func (s *AuthService) ensureRolesExist(ctx context.Context, tx *sql.Tx, roleNames []string) error {
	if len(roleNames) == 0 {
		return ErrUserValidation
	}
	for _, role := range roleNames {
		var count int
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM roles WHERE name=?`, role).Scan(&count); err != nil {
			return fmt.Errorf("check role %s: %w", role, err)
		}
		if count == 0 {
			return ErrUserValidation
		}
	}
	return nil
}

func (s *AuthService) assignRoles(ctx context.Context, tx *sql.Tx, userID string, roleNames []string) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM user_roles WHERE user_id=?`, userID); err != nil {
		return fmt.Errorf("clear user roles: %w", err)
	}
	for _, role := range roleNames {
		if _, err := tx.ExecContext(
			ctx,
			`INSERT INTO user_roles(user_id, role_id)
			 SELECT ?, id FROM roles WHERE name=?`,
			userID,
			role,
		); err != nil {
			return fmt.Errorf("assign role %s: %w", role, err)
		}
	}
	return nil
}

func (s *AuthService) ensureAnotherAdmin(ctx context.Context, tx *sql.Tx, userID string) error {
	var count int
	if err := tx.QueryRowContext(
		ctx,
		`SELECT COUNT(DISTINCT users.id)
		 FROM users
		 JOIN user_roles ON user_roles.user_id = users.id
		 JOIN roles ON roles.id = user_roles.role_id
		 WHERE roles.name='Admin' AND users.id<>?`,
		userID,
	).Scan(&count); err != nil {
		return fmt.Errorf("count other admins: %w", err)
	}
	if count == 0 {
		return ErrLastAdmin
	}
	return nil
}

func isUniqueConstraint(err error) bool {
	return strings.Contains(strings.ToLower(err.Error()), "unique")
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

func (s *AuthService) auditTx(ctx context.Context, tx *sql.Tx, actorUserID, action, targetType, targetID, detailsJSON string) error {
	if _, err := tx.ExecContext(
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
