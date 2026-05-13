package application_test

import (
	"context"
	"errors"
	"testing"

	"railkeeper2/backend/internal/application"
)

func TestLoginCreatesReadableSession(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	setup := application.NewSetupService(db)
	auth := application.NewAuthService(db)

	if err := setup.CreateAdmin(ctx, application.CreateAdminInput{
		Username: "admin",
		Password: "very-secure-password",
	}); err != nil {
		t.Fatal(err)
	}

	result, err := auth.Login(ctx, application.LoginInput{
		Username: "admin",
		Password: "very-secure-password",
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.SessionToken == "" || result.CSRFToken == "" {
		t.Fatal("login should return session and csrf tokens")
	}
	if result.Session.Username != "admin" {
		t.Fatalf("unexpected username %q", result.Session.Username)
	}

	session, err := auth.CurrentSession(ctx, result.SessionToken)
	if err != nil {
		t.Fatal(err)
	}
	if session.CSRFToken != result.CSRFToken {
		t.Fatal("session should return the stored csrf token")
	}
	if len(session.Roles) != 3 {
		t.Fatalf("expected 3 roles, got %d", len(session.Roles))
	}
}

func TestLoginRejectsInvalidPassword(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	setup := application.NewSetupService(db)
	auth := application.NewAuthService(db)

	if err := setup.CreateAdmin(ctx, application.CreateAdminInput{
		Username: "admin",
		Password: "very-secure-password",
	}); err != nil {
		t.Fatal(err)
	}

	_, err := auth.Login(ctx, application.LoginInput{
		Username: "admin",
		Password: "wrong-password",
	})
	if !errors.Is(err, application.ErrInvalidLogin) {
		t.Fatalf("expected invalid login error, got %v", err)
	}
}

func TestLogoutRevokesSession(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	setup := application.NewSetupService(db)
	auth := application.NewAuthService(db)

	if err := setup.CreateAdmin(ctx, application.CreateAdminInput{
		Username: "admin",
		Password: "very-secure-password",
	}); err != nil {
		t.Fatal(err)
	}

	result, err := auth.Login(ctx, application.LoginInput{
		Username: "admin",
		Password: "very-secure-password",
	})
	if err != nil {
		t.Fatal(err)
	}

	if err := auth.ValidateCSRF(ctx, result.SessionToken, result.CSRFToken); err != nil {
		t.Fatal(err)
	}

	if err := auth.Logout(ctx, result.SessionToken); err != nil {
		t.Fatal(err)
	}

	_, err = auth.CurrentSession(ctx, result.SessionToken)
	if !errors.Is(err, application.ErrUnauthorized) {
		t.Fatalf("expected unauthorized after logout, got %v", err)
	}
}

func TestListAndRevokeSessions(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	setup := application.NewSetupService(db)
	auth := application.NewAuthService(db)

	if err := setup.CreateAdmin(ctx, application.CreateAdminInput{
		Username: "admin",
		Password: "very-secure-password",
	}); err != nil {
		t.Fatal(err)
	}
	result, err := auth.Login(ctx, application.LoginInput{
		Username: "admin",
		Password: "very-secure-password",
	})
	if err != nil {
		t.Fatal(err)
	}
	sessions, err := auth.ListSessions(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(sessions) != 1 || !sessions[0].Active || sessions[0].Username != "admin" {
		t.Fatalf("expected active admin session, got %#v", sessions)
	}
	if err := auth.RevokeSession(ctx, "", sessions[0].ID); err != nil {
		t.Fatal(err)
	}
	if _, err := auth.CurrentSession(ctx, result.SessionToken); !errors.Is(err, application.ErrUnauthorized) {
		t.Fatalf("expected revoked session to be unauthorized, got %v", err)
	}
}

func TestChangeOwnPasswordKeepsCurrentSessionAndRevokesOthers(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	setup := application.NewSetupService(db)
	auth := application.NewAuthService(db)

	if err := setup.CreateAdmin(ctx, application.CreateAdminInput{
		Username: "admin",
		Password: "very-secure-password",
	}); err != nil {
		t.Fatal(err)
	}
	current, err := auth.Login(ctx, application.LoginInput{
		Username: "admin",
		Password: "very-secure-password",
	})
	if err != nil {
		t.Fatal(err)
	}
	other, err := auth.Login(ctx, application.LoginInput{
		Username: "admin",
		Password: "very-secure-password",
	})
	if err != nil {
		t.Fatal(err)
	}
	sessions, err := auth.ListSessions(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(sessions) != 2 {
		t.Fatalf("expected two sessions, got %#v", sessions)
	}

	if err := auth.ChangeOwnPassword(ctx, sessions[0].UserID, current.SessionToken, application.ChangePasswordInput{
		CurrentPassword: "very-secure-password",
		NewPassword:     "even-more-secure-password",
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := auth.CurrentSession(ctx, current.SessionToken); err != nil {
		t.Fatalf("current session should remain valid, got %v", err)
	}
	if _, err := auth.CurrentSession(ctx, other.SessionToken); !errors.Is(err, application.ErrUnauthorized) {
		t.Fatalf("other session should be revoked, got %v", err)
	}
	if _, err := auth.Login(ctx, application.LoginInput{Username: "admin", Password: "very-secure-password"}); !errors.Is(err, application.ErrInvalidLogin) {
		t.Fatalf("old password should fail, got %v", err)
	}
	if _, err := auth.Login(ctx, application.LoginInput{Username: "admin", Password: "even-more-secure-password"}); err != nil {
		t.Fatalf("new password should work, got %v", err)
	}
}

func TestListAuditLogReturnsRecentSecurityEvents(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	setup := application.NewSetupService(db)
	auth := application.NewAuthService(db)

	if err := setup.CreateAdmin(ctx, application.CreateAdminInput{
		Username: "admin",
		Password: "very-secure-password",
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := auth.Login(ctx, application.LoginInput{
		Username: "admin",
		Password: "wrong-password",
	}); !errors.Is(err, application.ErrInvalidLogin) {
		t.Fatalf("expected invalid login, got %v", err)
	}
	if _, err := auth.Login(ctx, application.LoginInput{
		Username: "admin",
		Password: "very-secure-password",
	}); err != nil {
		t.Fatal(err)
	}

	entries, err := auth.ListAuditLog(ctx, 3)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 3 {
		t.Fatalf("expected three audit entries, got %d", len(entries))
	}
	actions := map[string]application.AuditLogEntry{}
	for _, entry := range entries {
		actions[entry.Action] = entry
	}
	if actions["Login"].ActorUsername != "admin" {
		t.Fatalf("expected login entry for admin, got %#v", actions["Login"])
	}
	if actions["LoginFailed"].TargetID != "admin" {
		t.Fatalf("expected failed login target, got %#v", actions["LoginFailed"])
	}
}

func TestValidateCSRFRejectsWrongToken(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	setup := application.NewSetupService(db)
	auth := application.NewAuthService(db)

	if err := setup.CreateAdmin(ctx, application.CreateAdminInput{
		Username: "admin",
		Password: "very-secure-password",
	}); err != nil {
		t.Fatal(err)
	}

	result, err := auth.Login(ctx, application.LoginInput{
		Username: "admin",
		Password: "very-secure-password",
	})
	if err != nil {
		t.Fatal(err)
	}

	err = auth.ValidateCSRF(ctx, result.SessionToken, "wrong-token")
	if !errors.Is(err, application.ErrInvalidCSRF) {
		t.Fatalf("expected invalid csrf error, got %v", err)
	}
}

func TestRequireRoleAllowsEditorForViewerEndpoints(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	setup := application.NewSetupService(db)
	auth := application.NewAuthService(db)

	if err := setup.CreateAdmin(ctx, application.CreateAdminInput{
		Username: "admin",
		Password: "very-secure-password",
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := auth.CreateUser(ctx, "", application.CreateUserInput{
		Username: "editor",
		Password: "editor-secure-password",
		Roles:    []string{"Editor"},
	}); err != nil {
		t.Fatal(err)
	}

	result, err := auth.Login(ctx, application.LoginInput{
		Username: "editor",
		Password: "editor-secure-password",
	})
	if err != nil {
		t.Fatal(err)
	}

	userID, err := auth.RequireRole(ctx, result.SessionToken, "Viewer")
	if err != nil {
		t.Fatal(err)
	}
	if userID == "" {
		t.Fatal("expected actor user id")
	}
}

func TestRequireRoleDoesNotTreatMesseAsViewer(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	setup := application.NewSetupService(db)
	auth := application.NewAuthService(db)

	if err := setup.CreateAdmin(ctx, application.CreateAdminInput{
		Username: "admin",
		Password: "very-secure-password",
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := auth.CreateUser(ctx, "", application.CreateUserInput{
		Username: "messe",
		Password: "messe-secure-password",
		Roles:    []string{"Messe"},
	}); err != nil {
		t.Fatal(err)
	}

	result, err := auth.Login(ctx, application.LoginInput{
		Username: "messe",
		Password: "messe-secure-password",
	})
	if err != nil {
		t.Fatal(err)
	}

	if _, err := auth.RequireRole(ctx, result.SessionToken, "Viewer"); !errors.Is(err, application.ErrForbidden) {
		t.Fatalf("expected messe user to be forbidden from viewer role, got %v", err)
	}
	if userID, err := auth.RequireAnyRole(ctx, result.SessionToken, "Viewer", "Messe"); err != nil || userID == "" {
		t.Fatalf("expected messe user to pass explicit messe fallback, userID=%q err=%v", userID, err)
	}
}

func TestCreateUserAssignsMesseRole(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	setup := application.NewSetupService(db)
	auth := application.NewAuthService(db)

	if err := setup.CreateAdmin(ctx, application.CreateAdminInput{
		Username: "admin",
		Password: "very-secure-password",
	}); err != nil {
		t.Fatal(err)
	}

	user, err := auth.CreateUser(ctx, "", application.CreateUserInput{
		Username: "messe",
		Password: "very-secure-password",
		Roles:    []string{"Messe"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if user.Username != "messe" || !testHasRole(user.Roles, "Messe") {
		t.Fatalf("expected messe user with Messe role, got %#v", user)
	}
}

func TestUpdateUserProtectsLastAdmin(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	setup := application.NewSetupService(db)
	auth := application.NewAuthService(db)

	if err := setup.CreateAdmin(ctx, application.CreateAdminInput{
		Username: "admin",
		Password: "very-secure-password",
	}); err != nil {
		t.Fatal(err)
	}
	users, err := auth.ListUsers(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(users) != 1 {
		t.Fatalf("expected one admin, got %d", len(users))
	}

	_, err = auth.UpdateUser(ctx, "", users[0].ID, application.UpdateUserInput{
		Username: "admin",
		Roles:    []string{"Viewer"},
	})
	if !errors.Is(err, application.ErrLastAdmin) {
		t.Fatalf("expected last admin error, got %v", err)
	}
}

func TestUpdateUserPasswordRevokesExistingSessions(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	setup := application.NewSetupService(db)
	auth := application.NewAuthService(db)

	if err := setup.CreateAdmin(ctx, application.CreateAdminInput{
		Username: "admin",
		Password: "very-secure-password",
	}); err != nil {
		t.Fatal(err)
	}
	user, err := auth.CreateUser(ctx, "", application.CreateUserInput{
		Username: "viewer",
		Password: "very-secure-password",
		Roles:    []string{"Viewer"},
	})
	if err != nil {
		t.Fatal(err)
	}
	viewerSession, err := auth.Login(ctx, application.LoginInput{
		Username: "viewer",
		Password: "very-secure-password",
	})
	if err != nil {
		t.Fatal(err)
	}

	if _, err := auth.UpdateUser(ctx, "", user.ID, application.UpdateUserInput{
		Username: "viewer",
		Password: "new-secure-password",
		Roles:    []string{"Viewer"},
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := auth.CurrentSession(ctx, viewerSession.SessionToken); !errors.Is(err, application.ErrUnauthorized) {
		t.Fatalf("expected old session to be revoked, got %v", err)
	}
	if _, err := auth.Login(ctx, application.LoginInput{Username: "viewer", Password: "very-secure-password"}); !errors.Is(err, application.ErrInvalidLogin) {
		t.Fatalf("old password should fail, got %v", err)
	}
	if _, err := auth.Login(ctx, application.LoginInput{Username: "viewer", Password: "new-secure-password"}); err != nil {
		t.Fatalf("new password should work, got %v", err)
	}
}

func TestDeleteUserAllowsRemovingSecondAdmin(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	setup := application.NewSetupService(db)
	auth := application.NewAuthService(db)

	if err := setup.CreateAdmin(ctx, application.CreateAdminInput{
		Username: "admin",
		Password: "very-secure-password",
	}); err != nil {
		t.Fatal(err)
	}
	second, err := auth.CreateUser(ctx, "", application.CreateUserInput{
		Username: "second-admin",
		Password: "very-secure-password",
		Roles:    []string{"Admin", "Editor", "Viewer"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := auth.DeleteUser(ctx, "", second.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := auth.GetUser(ctx, second.ID); !errors.Is(err, application.ErrUserNotFound) {
		t.Fatalf("expected user not found after delete, got %v", err)
	}
}

func testHasRole(roles []string, role string) bool {
	for _, current := range roles {
		if current == role {
			return true
		}
	}
	return false
}
