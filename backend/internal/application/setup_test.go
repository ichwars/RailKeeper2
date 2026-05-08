package application_test

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"testing"

	"railkeeper2/backend/internal/application"
	"railkeeper2/backend/internal/infrastructure"
)

func TestCreateAdminCompletesSetup(t *testing.T) {
	db := testDB(t)
	service := application.NewSetupService(db)
	ctx := context.Background()

	required, err := service.SetupRequired(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if !required {
		t.Fatal("setup should be required before creating the first admin")
	}

	err = service.CreateAdmin(ctx, application.CreateAdminInput{
		Username: "admin",
		Password: "very-secure-password",
	})
	if err != nil {
		t.Fatal(err)
	}

	required, err = service.SetupRequired(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if required {
		t.Fatal("setup should be completed after creating the first admin")
	}

	var roleCount int
	if err := db.QueryRow(`
SELECT COUNT(*)
FROM user_roles
JOIN roles ON roles.id = user_roles.role_id
WHERE roles.name IN ('Admin', 'Editor', 'Viewer')
`).Scan(&roleCount); err != nil {
		t.Fatal(err)
	}
	if roleCount != 3 {
		t.Fatalf("admin should have all three roles, got %d", roleCount)
	}
}

func TestCreateAdminRejectsWeakInput(t *testing.T) {
	db := testDB(t)
	service := application.NewSetupService(db)

	err := service.CreateAdmin(context.Background(), application.CreateAdminInput{
		Username: "ad",
		Password: "short",
	})
	if !errors.Is(err, application.ErrWeakSetup) {
		t.Fatalf("expected weak setup error, got %v", err)
	}
}

func TestCreateAdminRejectsSecondSetup(t *testing.T) {
	db := testDB(t)
	service := application.NewSetupService(db)
	ctx := context.Background()

	if err := service.CreateAdmin(ctx, application.CreateAdminInput{
		Username: "admin",
		Password: "very-secure-password",
	}); err != nil {
		t.Fatal(err)
	}

	err := service.CreateAdmin(ctx, application.CreateAdminInput{
		Username: "other-admin",
		Password: "another-secure-password",
	})
	if !errors.Is(err, application.ErrAlreadySetup) {
		t.Fatalf("expected already setup error, got %v", err)
	}
}

func testDB(t *testing.T) *sql.DB {
	t.Helper()

	db, err := infrastructure.OpenSQLite(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })

	migrationsDir := filepath.Join("..", "..", "migrations")
	if err := infrastructure.Migrate(db, migrationsDir); err != nil {
		t.Fatal(err)
	}
	if err := infrastructure.SeedRoles(db); err != nil {
		t.Fatal(err)
	}

	return db
}
