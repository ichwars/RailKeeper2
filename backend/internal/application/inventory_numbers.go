package application

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

var (
	ErrInventoryNumberValidation = errors.New("inventory number validation failed")
	ErrInventoryNumberConflict   = errors.New("inventory number already exists")
	ErrInventoryNumberNotFound   = errors.New("inventory number scheme not found")
)

type InventoryNumberService struct {
	db *sql.DB
}

type InventoryNumberScheme struct {
	ID         string `json:"id"`
	Category   string `json:"category"`
	Prefix     string `json:"prefix"`
	NextNumber int    `json:"nextNumber"`
	Padding    int    `json:"padding"`
	Active     bool   `json:"active"`
	Preview    string `json:"preview"`
	CreatedAt  string `json:"createdAt"`
	UpdatedAt  string `json:"updatedAt"`
}

type InventoryNumberSchemeInput struct {
	Prefix     string `json:"prefix"`
	NextNumber int    `json:"nextNumber"`
	Padding    int    `json:"padding"`
	Active     bool   `json:"active"`
}

func NewInventoryNumberService(db *sql.DB) *InventoryNumberService {
	return &InventoryNumberService{db: db}
}

func (s *InventoryNumberService) List(ctx context.Context) ([]InventoryNumberScheme, error) {
	rows, err := s.db.QueryContext(ctx, `
SELECT id, category, prefix, next_number, padding, active, created_at, updated_at
FROM inventory_number_schemes
ORDER BY
  CASE category
    WHEN 'Fahrzeug' THEN 0
    WHEN 'Lokomotive' THEN 1
    WHEN 'Wagen' THEN 2
    ELSE 3
  END,
  category ASC
`)
	if err != nil {
		return nil, fmt.Errorf("list inventory number schemes: %w", err)
	}
	defer func() { _ = rows.Close() }()

	out := []InventoryNumberScheme{}
	for rows.Next() {
		scheme, err := scanInventoryNumberScheme(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, scheme)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate inventory number schemes: %w", err)
	}
	return out, nil
}

func (s *InventoryNumberService) Update(ctx context.Context, category string, input InventoryNumberSchemeInput) (*InventoryNumberScheme, error) {
	category = cleanInventoryCategory(category)
	input = cleanInventoryNumberSchemeInput(input)
	if category == "" || input.Prefix == "" || input.NextNumber < 1 || input.Padding < 1 || input.Padding > 12 {
		return nil, ErrInventoryNumberValidation
	}

	now := time.Now().UTC().Format(time.RFC3339)
	result, err := s.db.ExecContext(ctx, `
UPDATE inventory_number_schemes
SET prefix=?, next_number=?, padding=?, active=?, updated_at=?
WHERE category=?
`, input.Prefix, input.NextNumber, input.Padding, boolToInt(input.Active), now, category)
	if err != nil {
		return nil, fmt.Errorf("update inventory number scheme: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return nil, fmt.Errorf("read inventory number scheme update result: %w", err)
	}
	if affected == 0 {
		return nil, ErrInventoryNumberNotFound
	}

	return s.get(ctx, category)
}

func (s *InventoryNumberService) get(ctx context.Context, category string) (*InventoryNumberScheme, error) {
	var scheme InventoryNumberScheme
	var active int
	if err := s.db.QueryRowContext(ctx, `
SELECT id, category, prefix, next_number, padding, active, created_at, updated_at
FROM inventory_number_schemes
WHERE category=?
`, category).Scan(
		&scheme.ID,
		&scheme.Category,
		&scheme.Prefix,
		&scheme.NextNumber,
		&scheme.Padding,
		&active,
		&scheme.CreatedAt,
		&scheme.UpdatedAt,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrInventoryNumberNotFound
		}
		return nil, fmt.Errorf("get inventory number scheme: %w", err)
	}
	scheme.Active = active == 1
	scheme.Preview = formatInventoryNumber(scheme.Prefix, scheme.NextNumber, scheme.Padding)
	return &scheme, nil
}

type inventoryNumberScanner interface {
	Scan(dest ...any) error
}

func scanInventoryNumberScheme(scanner inventoryNumberScanner) (InventoryNumberScheme, error) {
	var scheme InventoryNumberScheme
	var active int
	if err := scanner.Scan(
		&scheme.ID,
		&scheme.Category,
		&scheme.Prefix,
		&scheme.NextNumber,
		&scheme.Padding,
		&active,
		&scheme.CreatedAt,
		&scheme.UpdatedAt,
	); err != nil {
		return InventoryNumberScheme{}, fmt.Errorf("scan inventory number scheme: %w", err)
	}
	scheme.Active = active == 1
	scheme.Preview = formatInventoryNumber(scheme.Prefix, scheme.NextNumber, scheme.Padding)
	return scheme, nil
}

func cleanInventoryNumberSchemeInput(input InventoryNumberSchemeInput) InventoryNumberSchemeInput {
	input.Prefix = strings.ToUpper(strings.TrimSpace(input.Prefix))
	input.Prefix = strings.ReplaceAll(input.Prefix, " ", "-")
	if input.Padding == 0 {
		input.Padding = 6
	}
	if input.NextNumber == 0 {
		input.NextNumber = 1
	}
	return input
}

func cleanInventoryCategory(category string) string {
	category = strings.TrimSpace(category)
	switch strings.ToLower(category) {
	case "fahrzeug", "lokomotive", "wagen":
		return category
	default:
		return category
	}
}

func inventoryCategoryForVehicle(category string) string {
	value := strings.ToLower(strings.TrimSpace(category))
	switch {
	case strings.Contains(value, "lok"):
		return "Lokomotive"
	case strings.Contains(value, "wagen"), strings.Contains(value, "waggon"):
		return "Wagen"
	default:
		return "Fahrzeug"
	}
}

func formatInventoryNumber(prefix string, number int, padding int) string {
	if padding < 1 {
		padding = 6
	}
	if number < 1 {
		number = 1
	}
	return fmt.Sprintf("%s-%0*d", prefix, padding, number)
}
