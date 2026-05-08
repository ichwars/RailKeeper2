package application

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
)

var (
	ErrMasterDataValidation = errors.New("master data validation failed")
	ErrMasterDataNotFound   = errors.New("master data not found")
)

type MasterDataService struct {
	db *sql.DB
}

type MasterDataEntry struct {
	ID        string         `json:"id"`
	Type      string         `json:"type"`
	Key       string         `json:"key"`
	Label     string         `json:"label"`
	Active    bool           `json:"active"`
	SortOrder int            `json:"sortOrder"`
	SourceURL string         `json:"sourceUrl,omitempty"`
	Metadata  map[string]any `json:"metadata"`
	CreatedAt string         `json:"createdAt"`
	UpdatedAt string         `json:"updatedAt"`
}

type MasterDataInput struct {
	Key       string         `json:"key"`
	Label     string         `json:"label"`
	Active    *bool          `json:"active"`
	SortOrder *int           `json:"sortOrder"`
	SourceURL string         `json:"sourceUrl"`
	Metadata  map[string]any `json:"metadata"`
}

type MasterDataRelation struct {
	ID         string `json:"id"`
	ParentType string `json:"parentType"`
	ParentKey  string `json:"parentKey"`
	ChildType  string `json:"childType"`
	ChildKey   string `json:"childKey"`
	SortOrder  int    `json:"sortOrder"`
}

func NewMasterDataService(db *sql.DB) *MasterDataService {
	return &MasterDataService{db: db}
}

func (s *MasterDataService) List(ctx context.Context, typeName string, activeOnly bool) ([]MasterDataEntry, error) {
	typeName = strings.TrimSpace(typeName)
	if typeName == "" {
		return nil, ErrMasterDataValidation
	}

	query := `
SELECT id, type, key, label, active, sort_order, COALESCE(source_url, ''), metadata_json, created_at, updated_at
FROM master_data_entries
WHERE type=?`
	args := []any{typeName}
	if activeOnly {
		query += " AND active=1"
	}
	query += " ORDER BY active DESC, sort_order ASC, label ASC"

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list master data: %w", err)
	}
	defer func() { _ = rows.Close() }()

	out := []MasterDataEntry{}
	for rows.Next() {
		item, err := scanMasterDataEntry(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate master data: %w", err)
	}
	return out, nil
}

func (s *MasterDataService) Create(ctx context.Context, typeName string, input MasterDataInput) (*MasterDataEntry, error) {
	typeName = strings.TrimSpace(typeName)
	input = cleanMasterDataInput(input)
	if typeName == "" || input.Label == "" {
		return nil, ErrMasterDataValidation
	}
	if input.Key == "" {
		input.Key = slugKey(input.Label)
	}
	active := true
	if input.Active != nil {
		active = *input.Active
	}
	sortOrder := 0
	if input.SortOrder != nil {
		sortOrder = *input.SortOrder
	}
	metadata, err := json.Marshal(input.Metadata)
	if err != nil {
		return nil, fmt.Errorf("marshal master data metadata: %w", err)
	}

	now := time.Now().UTC().Format(time.RFC3339)
	id := typeName + ":" + input.Key
	if _, err := s.db.ExecContext(ctx, `
INSERT INTO master_data_entries(id, type, key, label, active, sort_order, source_url, metadata_json, created_at, updated_at)
VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`, id, typeName, input.Key, input.Label, boolToInt(active), sortOrder, input.SourceURL, string(metadata), now, now); err != nil {
		return nil, fmt.Errorf("create master data: %w", err)
	}
	return s.Get(ctx, typeName, input.Key)
}

func (s *MasterDataService) Get(ctx context.Context, typeName, key string) (*MasterDataEntry, error) {
	var metadataJSON string
	var active int
	var item MasterDataEntry
	err := s.db.QueryRowContext(ctx, `
SELECT id, type, key, label, active, sort_order, COALESCE(source_url, ''), metadata_json, created_at, updated_at
FROM master_data_entries
WHERE type=? AND key=?
`, strings.TrimSpace(typeName), strings.TrimSpace(key)).Scan(
		&item.ID,
		&item.Type,
		&item.Key,
		&item.Label,
		&active,
		&item.SortOrder,
		&item.SourceURL,
		&metadataJSON,
		&item.CreatedAt,
		&item.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrMasterDataNotFound
		}
		return nil, fmt.Errorf("get master data: %w", err)
	}
	item.Active = active == 1
	item.Metadata = map[string]any{}
	if err := json.Unmarshal([]byte(metadataJSON), &item.Metadata); err != nil {
		return nil, fmt.Errorf("parse master data metadata: %w", err)
	}
	return &item, nil
}

func (s *MasterDataService) Update(ctx context.Context, typeName, key string, input MasterDataInput) (*MasterDataEntry, error) {
	typeName = strings.TrimSpace(typeName)
	key = strings.TrimSpace(key)
	input = cleanMasterDataInput(input)
	if typeName == "" || key == "" || input.Label == "" {
		return nil, ErrMasterDataValidation
	}
	active := true
	if input.Active != nil {
		active = *input.Active
	}
	sortOrder := 0
	if input.SortOrder != nil {
		sortOrder = *input.SortOrder
	}
	metadata, err := json.Marshal(input.Metadata)
	if err != nil {
		return nil, fmt.Errorf("marshal master data metadata: %w", err)
	}
	result, err := s.db.ExecContext(ctx, `
UPDATE master_data_entries
SET label=?, active=?, sort_order=?, source_url=?, metadata_json=?, updated_at=?
WHERE type=? AND key=?
`, input.Label, boolToInt(active), sortOrder, input.SourceURL, string(metadata), time.Now().UTC().Format(time.RFC3339), typeName, key)
	if err != nil {
		return nil, fmt.Errorf("update master data: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return nil, fmt.Errorf("read master data update result: %w", err)
	}
	if affected == 0 {
		return nil, ErrMasterDataNotFound
	}
	return s.Get(ctx, typeName, key)
}

func (s *MasterDataService) Delete(ctx context.Context, typeName, key string) error {
	result, err := s.db.ExecContext(ctx, `DELETE FROM master_data_entries WHERE type=? AND key=?`, strings.TrimSpace(typeName), strings.TrimSpace(key))
	if err != nil {
		return fmt.Errorf("delete master data: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read master data delete result: %w", err)
	}
	if affected == 0 {
		return ErrMasterDataNotFound
	}
	return nil
}

func (s *MasterDataService) Relations(ctx context.Context, parentType, childType string) ([]MasterDataRelation, error) {
	rows, err := s.db.QueryContext(ctx, `
SELECT id, parent_type, parent_key, child_type, child_key, sort_order
FROM master_data_relations
WHERE parent_type=? AND child_type=?
ORDER BY sort_order ASC
`, strings.TrimSpace(parentType), strings.TrimSpace(childType))
	if err != nil {
		return nil, fmt.Errorf("list master data relations: %w", err)
	}
	defer func() { _ = rows.Close() }()

	out := []MasterDataRelation{}
	for rows.Next() {
		var relation MasterDataRelation
		if err := rows.Scan(&relation.ID, &relation.ParentType, &relation.ParentKey, &relation.ChildType, &relation.ChildKey, &relation.SortOrder); err != nil {
			return nil, fmt.Errorf("scan master data relation: %w", err)
		}
		out = append(out, relation)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate master data relations: %w", err)
	}
	return out, nil
}

type masterDataScanner interface {
	Scan(dest ...any) error
}

func scanMasterDataEntry(scanner masterDataScanner) (MasterDataEntry, error) {
	var item MasterDataEntry
	var active int
	var metadataJSON string
	if err := scanner.Scan(
		&item.ID,
		&item.Type,
		&item.Key,
		&item.Label,
		&active,
		&item.SortOrder,
		&item.SourceURL,
		&metadataJSON,
		&item.CreatedAt,
		&item.UpdatedAt,
	); err != nil {
		return item, fmt.Errorf("scan master data: %w", err)
	}
	item.Active = active == 1
	item.Metadata = map[string]any{}
	if err := json.Unmarshal([]byte(metadataJSON), &item.Metadata); err != nil {
		return item, fmt.Errorf("parse master data metadata: %w", err)
	}
	return item, nil
}

func cleanMasterDataInput(input MasterDataInput) MasterDataInput {
	input.Key = strings.TrimSpace(input.Key)
	input.Label = strings.TrimSpace(input.Label)
	input.SourceURL = strings.TrimSpace(input.SourceURL)
	if input.Metadata == nil {
		input.Metadata = map[string]any{}
	}
	return input
}

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

var slugPattern = regexp.MustCompile(`[^a-z0-9]+`)

func slugKey(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.NewReplacer("\u00e4", "ae", "\u00f6", "oe", "\u00fc", "ue", "\u00df", "ss").Replace(value)
	value = slugPattern.ReplaceAllString(value, "-")
	return strings.Trim(value, "-")
}
