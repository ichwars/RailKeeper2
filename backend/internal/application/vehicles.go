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
	ErrVehicleValidation = errors.New("vehicle validation failed")
	ErrVehicleNotFound   = errors.New("vehicle not found")
)

type VehicleService struct {
	db *sql.DB
}

type Vehicle struct {
	ID              string `json:"id"`
	InventoryNumber string `json:"inventoryNumber"`
	Manufacturer    string `json:"manufacturer"`
	ArticleNumber   string `json:"articleNumber,omitempty"`
	Name            string `json:"name"`
	Gauge           string `json:"gauge"`
	Epoch           string `json:"epoch,omitempty"`
	RailwayCompany  string `json:"railwayCompany,omitempty"`
	Category        string `json:"category,omitempty"`
	CreatedAt       string `json:"createdAt"`
	UpdatedAt       string `json:"updatedAt"`
}

type CreateVehicleInput struct {
	InventoryNumber string `json:"inventoryNumber"`
	Manufacturer    string `json:"manufacturer"`
	ArticleNumber   string `json:"articleNumber"`
	Name            string `json:"name"`
	Gauge           string `json:"gauge"`
	Epoch           string `json:"epoch"`
	RailwayCompany  string `json:"railwayCompany"`
	Category        string `json:"category"`
}

func NewVehicleService(db *sql.DB) *VehicleService {
	return &VehicleService{db: db}
}

func (s *VehicleService) List(ctx context.Context, query string) ([]Vehicle, error) {
	like := "%" + strings.TrimSpace(query) + "%"
	rows, err := s.db.QueryContext(ctx, `
SELECT id, inventory_number, manufacturer, COALESCE(article_number, ''), name, gauge,
       COALESCE(epoch, ''), COALESCE(railway_company, ''), COALESCE(category, ''),
       created_at, updated_at
FROM vehicles
WHERE ? = '%%'
   OR inventory_number LIKE ?
   OR manufacturer LIKE ?
   OR article_number LIKE ?
   OR name LIKE ?
ORDER BY updated_at DESC, inventory_number ASC
`, like, like, like, like, like)
	if err != nil {
		return nil, fmt.Errorf("list vehicles: %w", err)
	}
	defer func() { _ = rows.Close() }()

	vehicles := []Vehicle{}
	for rows.Next() {
		var vehicle Vehicle
		if err := rows.Scan(
			&vehicle.ID,
			&vehicle.InventoryNumber,
			&vehicle.Manufacturer,
			&vehicle.ArticleNumber,
			&vehicle.Name,
			&vehicle.Gauge,
			&vehicle.Epoch,
			&vehicle.RailwayCompany,
			&vehicle.Category,
			&vehicle.CreatedAt,
			&vehicle.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan vehicle: %w", err)
		}
		vehicles = append(vehicles, vehicle)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate vehicles: %w", err)
	}
	return vehicles, nil
}

func (s *VehicleService) Create(ctx context.Context, input CreateVehicleInput, actorUserID string) (*Vehicle, error) {
	input = cleanVehicleInput(input)
	if input.Manufacturer == "" || input.Name == "" || input.Gauge == "" {
		return nil, ErrVehicleValidation
	}
	if input.InventoryNumber == "" {
		next, err := s.nextInventoryNumber(ctx)
		if err != nil {
			return nil, err
		}
		input.InventoryNumber = next
	}

	now := time.Now().UTC().Format(time.RFC3339)
	vehicle := Vehicle{
		ID:              randomID(),
		InventoryNumber: input.InventoryNumber,
		Manufacturer:    input.Manufacturer,
		ArticleNumber:   input.ArticleNumber,
		Name:            input.Name,
		Gauge:           input.Gauge,
		Epoch:           input.Epoch,
		RailwayCompany:  input.RailwayCompany,
		Category:        input.Category,
		CreatedAt:       now,
		UpdatedAt:       now,
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin create vehicle: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	if _, err = tx.ExecContext(ctx, `
INSERT INTO vehicles(id, inventory_number, manufacturer, article_number, name, gauge, epoch, railway_company, category, created_at, updated_at)
VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`, vehicle.ID, vehicle.InventoryNumber, vehicle.Manufacturer, vehicle.ArticleNumber, vehicle.Name, vehicle.Gauge, vehicle.Epoch, vehicle.RailwayCompany, vehicle.Category, vehicle.CreatedAt, vehicle.UpdatedAt); err != nil {
		return nil, fmt.Errorf("insert vehicle: %w", err)
	}

	if _, err = tx.ExecContext(ctx, `
INSERT INTO audit_logs(id, actor_user_id, action, target_type, target_id, created_at, details_json)
VALUES(?, ?, 'VehicleCreated', 'vehicle', ?, ?, '{}')
`, randomID(), actorUserID, vehicle.ID, now); err != nil {
		return nil, fmt.Errorf("write vehicle audit log: %w", err)
	}

	if err = tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit create vehicle: %w", err)
	}

	return &vehicle, nil
}

func (s *VehicleService) nextInventoryNumber(ctx context.Context) (string, error) {
	var next int
	if err := s.db.QueryRowContext(ctx, `
SELECT COALESCE(MAX(CAST(SUBSTR(inventory_number, 8) AS INTEGER)), 0) + 1
FROM vehicles
WHERE inventory_number LIKE 'RK-FAH-%'
`).Scan(&next); err != nil {
		return "", fmt.Errorf("next inventory number: %w", err)
	}
	return fmt.Sprintf("RK-FAH-%06d", next), nil
}

func cleanVehicleInput(input CreateVehicleInput) CreateVehicleInput {
	input.InventoryNumber = strings.TrimSpace(input.InventoryNumber)
	input.Manufacturer = strings.TrimSpace(input.Manufacturer)
	input.ArticleNumber = strings.TrimSpace(input.ArticleNumber)
	input.Name = strings.TrimSpace(input.Name)
	input.Gauge = strings.TrimSpace(input.Gauge)
	input.Epoch = strings.TrimSpace(input.Epoch)
	input.RailwayCompany = strings.TrimSpace(input.RailwayCompany)
	input.Category = strings.TrimSpace(input.Category)
	return input
}
