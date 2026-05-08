package infrastructure

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

type masterDataSeed struct {
	Entries   []seedEntry    `json:"entries"`
	Relations []seedRelation `json:"relations"`
}

type seedEntry struct {
	ID        string         `json:"id"`
	Type      string         `json:"type"`
	Key       string         `json:"key"`
	Label     string         `json:"label"`
	Active    bool           `json:"active"`
	SortOrder int            `json:"sortOrder"`
	SourceURL string         `json:"sourceUrl"`
	Metadata  map[string]any `json:"metadata"`
}

type seedRelation struct {
	ID         string `json:"id"`
	ParentType string `json:"parentType"`
	ParentKey  string `json:"parentKey"`
	ChildType  string `json:"childType"`
	ChildKey   string `json:"childKey"`
	SortOrder  int    `json:"sortOrder"`
}

func SeedMasterData(db *sql.DB, seedsDir string) error {
	if seedsDir == "" {
		return errors.New("seeds directory is required")
	}

	path := filepath.Join(seedsDir, "master_data.json")
	body, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return fmt.Errorf("read master data seed: %w", err)
	}

	var seed masterDataSeed
	if err := json.Unmarshal(body, &seed); err != nil {
		return fmt.Errorf("parse master data seed: %w", err)
	}

	now := time.Now().UTC().Format(time.RFC3339)
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("begin master data seed: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	for _, item := range seed.Entries {
		metadata, err := json.Marshal(item.Metadata)
		if err != nil {
			return fmt.Errorf("marshal metadata for %s: %w", item.ID, err)
		}
		if _, err = tx.Exec(`
INSERT INTO master_data_entries(id, type, key, label, active, sort_order, source_url, metadata_json, created_at, updated_at)
VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(type, key) DO NOTHING
`, item.ID, item.Type, item.Key, item.Label, boolToInt(item.Active), item.SortOrder, item.SourceURL, string(metadata), now, now); err != nil {
			return fmt.Errorf("seed master data %s: %w", item.ID, err)
		}
	}

	for _, relation := range seed.Relations {
		if _, err = tx.Exec(`
INSERT INTO master_data_relations(id, parent_type, parent_key, child_type, child_key, sort_order, created_at)
VALUES(?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(parent_type, parent_key, child_type, child_key) DO NOTHING
`, relation.ID, relation.ParentType, relation.ParentKey, relation.ChildType, relation.ChildKey, relation.SortOrder, now); err != nil {
			return fmt.Errorf("seed master data relation %s: %w", relation.ID, err)
		}
	}

	if err = tx.Commit(); err != nil {
		return fmt.Errorf("commit master data seed: %w", err)
	}
	return nil
}
