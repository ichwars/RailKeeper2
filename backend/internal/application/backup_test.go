package application_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"railkeeper2/backend/internal/application"
	"railkeeper2/backend/internal/infrastructure"
)

func TestBackupExportsAndRestoresAppDataAndUploads(t *testing.T) {
	dataDir := t.TempDir()
	db := backupTestDB(t, dataDir)
	ctx := context.Background()

	vehicles := application.NewVehicleService(db)
	exhibitions := application.NewExhibitionService(db)
	created, err := vehicles.Create(ctx, application.CreateVehicleInput{
		Manufacturer: "Piko",
		Name:         "BR 118",
		Gauge:        "H0",
	}, "actor-1")
	if err != nil {
		t.Fatal(err)
	}
	_, err = vehicles.CreateAttachment(ctx, created.ID, application.VehicleAttachmentInput{
		FileName:     "manual.pdf",
		OriginalName: "manual.pdf",
		MimeType:     "application/pdf",
		SizeBytes:    6,
		StoragePath:  "uploads/vehicles/" + created.ID + "/manual.pdf",
	})
	if err != nil {
		t.Fatal(err)
	}
	uploadPath := filepath.Join(dataDir, "uploads", "vehicles", created.ID, "manual.pdf")
	if err := os.MkdirAll(filepath.Dir(uploadPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(uploadPath, []byte("manual"), 0o600); err != nil {
		t.Fatal(err)
	}
	list, err := exhibitions.Create(ctx, application.ExhibitionListInput{
		Designation: "Leipzig 2026",
		Date:        "2026-05-12",
	})
	if err != nil {
		t.Fatal(err)
	}
	entry, err := exhibitions.CreateEntry(ctx, list.ID, application.ExhibitionEntryInput{
		Owner:          "Daniel",
		LocomotiveName: "V180",
		DTDecoder:      true,
		DecoderNumber:  "1001",
		FunctionKeys:   `[{"key":"F0","name":"Licht","type":"licht","symbolKey":"esu-f006-spitzensignal"}]`,
	})
	if err != nil {
		t.Fatal(err)
	}

	backupService := application.NewBackupService(db, dataDir)
	backup, err := backupService.Export(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(backup.Tables["vehicles"]) != 1 {
		t.Fatalf("expected one vehicle in backup, got %d", len(backup.Tables["vehicles"]))
	}
	if len(backup.Files) != 1 {
		t.Fatalf("expected one file in backup, got %d", len(backup.Files))
	}
	if len(backup.Tables["exhibition_lists"]) != 1 || len(backup.Tables["exhibition_entries"]) != 1 {
		t.Fatalf("expected exhibition data in backup, got lists=%d entries=%d", len(backup.Tables["exhibition_lists"]), len(backup.Tables["exhibition_entries"]))
	}
	validation, err := backupService.Validate(ctx, backup)
	if err != nil {
		t.Fatal(err)
	}
	if !validation.Compatible || validation.RowCount == 0 || validation.FileCount != 1 {
		t.Fatalf("expected backup to validate, got %#v", validation)
	}

	if _, err := db.Exec(`DELETE FROM vehicle_attachments`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`DELETE FROM exhibition_entries`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`DELETE FROM exhibition_lists`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`DELETE FROM vehicles`); err != nil {
		t.Fatal(err)
	}
	if err := os.RemoveAll(filepath.Join(dataDir, "uploads")); err != nil {
		t.Fatal(err)
	}

	result, err := backupService.Import(ctx, backup)
	if err != nil {
		t.Fatal(err)
	}
	if result.RestoredRows == 0 || result.RestoredFiles != 1 {
		t.Fatalf("unexpected restore result: %#v", result)
	}

	restored, err := vehicles.Get(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if restored.InventoryNumber != created.InventoryNumber || len(restored.Attachments) != 1 {
		t.Fatalf("unexpected restored vehicle: %#v", restored)
	}
	if _, err := os.Stat(uploadPath); err != nil {
		t.Fatalf("expected upload file restored: %v", err)
	}
	restoredList, err := exhibitions.Get(ctx, list.ID)
	if err != nil {
		t.Fatal(err)
	}
	if restoredList.Designation != list.Designation || len(restoredList.Entries) != 1 || restoredList.Entries[0].ID != entry.ID {
		t.Fatalf("unexpected restored exhibition list: %#v", restoredList)
	}
}

func TestBackupExcludesAuthenticationTables(t *testing.T) {
	dataDir := t.TempDir()
	db := backupTestDB(t, dataDir)
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
		Password: "very-secure-password",
	}); err != nil {
		t.Fatal(err)
	}

	backupService := application.NewBackupService(db, dataDir)
	backup, err := backupService.Export(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, table := range []string{"users", "user_roles", "sessions", "audit_log", "rate_limit_attempts"} {
		if _, ok := backup.Tables[table]; ok {
			t.Fatalf("backup should not export authentication table %q", table)
		}
	}
	data, err := json.Marshal(backup)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "password_hash") {
		t.Fatal("backup should not contain password hashes")
	}
}

func TestBackupCoversAllApplicationDataTables(t *testing.T) {
	dataDir := t.TempDir()
	db := backupTestDB(t, dataDir)
	backupService := application.NewBackupService(db, dataDir)
	backup, err := backupService.Export(context.Background())
	if err != nil {
		t.Fatal(err)
	}

	rows, err := db.Query(`
SELECT name
FROM sqlite_master
WHERE type='table'
  AND name NOT LIKE 'sqlite_%'
ORDER BY name
`)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = rows.Close() }()

	excluded := map[string]bool{
		"audit_logs":          true,
		"rate_limit_attempts": true,
		"roles":               true,
		"schema_migrations":   true,
		"sessions":            true,
		"user_roles":          true,
		"users":               true,
	}
	for rows.Next() {
		var table string
		if err := rows.Scan(&table); err != nil {
			t.Fatal(err)
		}
		if excluded[table] {
			continue
		}
		if _, ok := backup.Tables[table]; !ok {
			t.Fatalf("application data table %q is missing from backup export", table)
		}
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
}

func TestBackupValidationWarnsAboutIgnoredAuthenticationTables(t *testing.T) {
	db := backupTestDB(t, t.TempDir())
	service := application.NewBackupService(db, t.TempDir())
	doc := &application.BackupDocument{
		Format:  "railkeeper2-backup",
		Version: 1,
		Tables:  map[string][]map[string]any{},
	}
	for _, table := range []string{
		"master_data_entries",
		"master_data_relations",
		"inventory_number_schemes",
		"vehicles",
		"inventory_number_history",
		"vehicle_images",
		"vehicle_attachments",
		"vehicle_maintenance",
		"vehicle_functions",
		"vehicle_cv_files",
		"vehicle_cv_values",
		"vehicle_cv_value_history",
		"exhibition_lists",
		"exhibition_entries",
	} {
		doc.Tables[table] = []map[string]any{}
	}
	doc.Tables["users"] = []map[string]any{{"id": "user-1", "password_hash": "secret"}}

	result, err := service.Validate(context.Background(), doc)
	if err != nil {
		t.Fatal(err)
	}
	if !result.Compatible {
		t.Fatalf("expected backup to remain compatible with ignored auth table, got %#v", result)
	}
	if !containsWarning(result.Warnings, "Unbekannte Tabelle users") {
		t.Fatalf("expected ignored users table warning, got %#v", result.Warnings)
	}
}

func TestBackupRejectsUnsafeFilePath(t *testing.T) {
	db := testDB(t)
	service := application.NewBackupService(db, t.TempDir())

	_, err := service.Import(context.Background(), &application.BackupDocument{
		Format:  "railkeeper2-backup",
		Version: 1,
		Tables:  map[string][]map[string]any{},
		Files: []application.BackupFile{{
			Path:          "../outside.txt",
			ContentBase64: "dGVzdA==",
		}},
	})
	if !errors.Is(err, application.ErrBackupPath) {
		t.Fatalf("expected unsafe backup path error, got %v", err)
	}
}

func TestBackupValidationReportsIncompatibleDocuments(t *testing.T) {
	db := testDB(t)
	service := application.NewBackupService(db, t.TempDir())

	result, err := service.Validate(context.Background(), &application.BackupDocument{
		Format:  "other",
		Version: 99,
		Tables:  map[string][]map[string]any{"vehicles": {}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Compatible {
		t.Fatalf("expected incompatible backup")
	}
	if len(result.Errors) == 0 {
		t.Fatalf("expected validation errors")
	}
}

func containsWarning(warnings []string, needle string) bool {
	for _, warning := range warnings {
		if strings.Contains(warning, needle) {
			return true
		}
	}
	return false
}

func backupTestDB(t *testing.T, dataDir string) *sql.DB {
	t.Helper()

	db, err := infrastructure.OpenSQLite(dataDir)
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
