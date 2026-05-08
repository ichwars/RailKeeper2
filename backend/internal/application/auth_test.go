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

func TestRequireRoleAllowsViewerForAnyAssignedRole(t *testing.T) {
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

	userID, err := auth.RequireRole(ctx, result.SessionToken, "Viewer")
	if err != nil {
		t.Fatal(err)
	}
	if userID == "" {
		t.Fatal("expected actor user id")
	}
}
