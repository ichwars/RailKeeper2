package infrastructure_test

import (
	"path/filepath"
	"testing"

	"railkeeper2/backend/internal/infrastructure"
)

func TestSeedMasterDataLoadsGeneratedSeed(t *testing.T) {
	db, err := infrastructure.OpenSQLite(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })

	migrationsDir := filepath.Join("..", "..", "migrations")
	if err := infrastructure.Migrate(db, migrationsDir); err != nil {
		t.Fatal(err)
	}

	seedsDir := filepath.Join("..", "..", "seeds")
	if err := infrastructure.SeedMasterData(db, seedsDir); err != nil {
		t.Fatal(err)
	}

	var manufacturers int
	if err := db.QueryRow(`SELECT COUNT(*) FROM master_data_entries WHERE type='manufacturer'`).Scan(&manufacturers); err != nil {
		t.Fatal(err)
	}
	if manufacturers < 500 {
		t.Fatalf("expected generated manufacturer seed, got %d entries", manufacturers)
	}

	var relations int
	if err := db.QueryRow(`SELECT COUNT(*) FROM master_data_relations WHERE parent_type='vehicle_category' AND child_type='vehicle_gattung'`).Scan(&relations); err != nil {
		t.Fatal(err)
	}
	if relations == 0 {
		t.Fatal("expected category to gattung relations")
	}
}
