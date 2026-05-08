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
	ID                        string `json:"id"`
	InventoryNumber           string `json:"inventoryNumber"`
	Manufacturer              string `json:"manufacturer"`
	ArticleNumber             string `json:"articleNumber,omitempty"`
	ArticleSourceURL          string `json:"articleSourceUrl,omitempty"`
	Name                      string `json:"name"`
	Gauge                     string `json:"gauge"`
	Epoch                     string `json:"epoch,omitempty"`
	RailwayCompany            string `json:"railwayCompany,omitempty"`
	Category                  string `json:"category,omitempty"`
	Gattung                   string `json:"gattung,omitempty"`
	Description               string `json:"description,omitempty"`
	Series                    string `json:"series,omitempty"`
	VehicleNumber             string `json:"vehicleNumber,omitempty"`
	Digital                   bool   `json:"digital"`
	DigitalDecoderNumber      string `json:"digitalDecoderNumber,omitempty"`
	DTDecoder                 bool   `json:"dtDecoder"`
	DTDecoderNumber           string `json:"dtDecoderNumber,omitempty"`
	ExhibitionReady           bool   `json:"exhibitionReady"`
	ABCBrakes                 bool   `json:"abcBrakes"`
	EAN                       string `json:"ean,omitempty"`
	ProductionPeriod          string `json:"productionPeriod,omitempty"`
	ListPrice                 string `json:"listPrice,omitempty"`
	LengthMM                  string `json:"lengthMm,omitempty"`
	WeightG                   string `json:"weightG,omitempty"`
	Color                     string `json:"color,omitempty"`
	Lettering                 string `json:"lettering,omitempty"`
	Load                      string `json:"load,omitempty"`
	Interior                  string `json:"interior,omitempty"`
	Axles                     string `json:"axles,omitempty"`
	AxleCount                 string `json:"axleCount,omitempty"`
	TractionTireCount         string `json:"tractionTireCount,omitempty"`
	Wheelset                  string `json:"wheelset,omitempty"`
	CouplingSame              bool   `json:"couplingSame"`
	CouplingFront             string `json:"couplingFront,omitempty"`
	CouplingRear              string `json:"couplingRear,omitempty"`
	PowerPickup               string `json:"powerPickup,omitempty"`
	Adapter                   string `json:"adapter,omitempty"`
	DriveEnabled              bool   `json:"driveEnabled"`
	DriveDescription          string `json:"driveDescription,omitempty"`
	HeadlightsEnabled         bool   `json:"headlightsEnabled"`
	HeadlightsDescription     string `json:"headlightsDescription,omitempty"`
	LightingEnabled           bool   `json:"lightingEnabled"`
	LightingDescription       string `json:"lightingDescription,omitempty"`
	SoundGeneratorEnabled     bool   `json:"soundGeneratorEnabled"`
	SoundGeneratorDescription string `json:"soundGeneratorDescription,omitempty"`
	SmokeGeneratorEnabled     bool   `json:"smokeGeneratorEnabled"`
	SmokeGeneratorDescription string `json:"smokeGeneratorDescription,omitempty"`
	AdditionalInfo            string `json:"additionalInfo,omitempty"`
	QRCodeEnabled             bool   `json:"qrCodeEnabled"`
	CreatedAt                 string `json:"createdAt"`
	UpdatedAt                 string `json:"updatedAt"`
}

type CreateVehicleInput struct {
	InventoryNumber           string `json:"inventoryNumber"`
	Manufacturer              string `json:"manufacturer"`
	ArticleNumber             string `json:"articleNumber"`
	ArticleSourceURL          string `json:"articleSourceUrl"`
	Name                      string `json:"name"`
	Gauge                     string `json:"gauge"`
	Epoch                     string `json:"epoch"`
	RailwayCompany            string `json:"railwayCompany"`
	Category                  string `json:"category"`
	Gattung                   string `json:"gattung"`
	Description               string `json:"description"`
	Series                    string `json:"series"`
	VehicleNumber             string `json:"vehicleNumber"`
	Digital                   bool   `json:"digital"`
	DigitalDecoderNumber      string `json:"digitalDecoderNumber"`
	DTDecoder                 bool   `json:"dtDecoder"`
	DTDecoderNumber           string `json:"dtDecoderNumber"`
	ExhibitionReady           bool   `json:"exhibitionReady"`
	ABCBrakes                 bool   `json:"abcBrakes"`
	EAN                       string `json:"ean"`
	ProductionPeriod          string `json:"productionPeriod"`
	ListPrice                 string `json:"listPrice"`
	LengthMM                  string `json:"lengthMm"`
	WeightG                   string `json:"weightG"`
	Color                     string `json:"color"`
	Lettering                 string `json:"lettering"`
	Load                      string `json:"load"`
	Interior                  string `json:"interior"`
	Axles                     string `json:"axles"`
	AxleCount                 string `json:"axleCount"`
	TractionTireCount         string `json:"tractionTireCount"`
	Wheelset                  string `json:"wheelset"`
	CouplingSame              bool   `json:"couplingSame"`
	CouplingFront             string `json:"couplingFront"`
	CouplingRear              string `json:"couplingRear"`
	PowerPickup               string `json:"powerPickup"`
	Adapter                   string `json:"adapter"`
	DriveEnabled              bool   `json:"driveEnabled"`
	DriveDescription          string `json:"driveDescription"`
	HeadlightsEnabled         bool   `json:"headlightsEnabled"`
	HeadlightsDescription     string `json:"headlightsDescription"`
	LightingEnabled           bool   `json:"lightingEnabled"`
	LightingDescription       string `json:"lightingDescription"`
	SoundGeneratorEnabled     bool   `json:"soundGeneratorEnabled"`
	SoundGeneratorDescription string `json:"soundGeneratorDescription"`
	SmokeGeneratorEnabled     bool   `json:"smokeGeneratorEnabled"`
	SmokeGeneratorDescription string `json:"smokeGeneratorDescription"`
	AdditionalInfo            string `json:"additionalInfo"`
	QRCodeEnabled             bool   `json:"qrCodeEnabled"`
}

func NewVehicleService(db *sql.DB) *VehicleService {
	return &VehicleService{db: db}
}

func (s *VehicleService) List(ctx context.Context, query string) ([]Vehicle, error) {
	like := "%" + strings.TrimSpace(query) + "%"
	rows, err := s.db.QueryContext(ctx, `
SELECT id, inventory_number, manufacturer, COALESCE(article_number, ''), COALESCE(article_source_url, ''), name, gauge,
       COALESCE(epoch, ''), COALESCE(railway_company, ''), COALESCE(category, ''), COALESCE(gattung, ''),
       COALESCE(description, ''), COALESCE(series, ''), COALESCE(vehicle_number, ''),
       digital, COALESCE(digital_decoder_number, ''), dt_decoder, COALESCE(dt_decoder_number, ''),
       exhibition_ready, abc_brakes, COALESCE(ean, ''), COALESCE(production_period, ''), COALESCE(list_price, ''),
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
		var digital int
		var dtDecoder int
		var exhibitionReady int
		var abcBrakes int
		if err := rows.Scan(
			&vehicle.ID,
			&vehicle.InventoryNumber,
			&vehicle.Manufacturer,
			&vehicle.ArticleNumber,
			&vehicle.ArticleSourceURL,
			&vehicle.Name,
			&vehicle.Gauge,
			&vehicle.Epoch,
			&vehicle.RailwayCompany,
			&vehicle.Category,
			&vehicle.Gattung,
			&vehicle.Description,
			&vehicle.Series,
			&vehicle.VehicleNumber,
			&digital,
			&vehicle.DigitalDecoderNumber,
			&dtDecoder,
			&vehicle.DTDecoderNumber,
			&exhibitionReady,
			&abcBrakes,
			&vehicle.EAN,
			&vehicle.ProductionPeriod,
			&vehicle.ListPrice,
			&vehicle.CreatedAt,
			&vehicle.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan vehicle: %w", err)
		}
		vehicle.Digital = digital == 1
		vehicle.DTDecoder = dtDecoder == 1
		vehicle.ExhibitionReady = exhibitionReady == 1
		vehicle.ABCBrakes = abcBrakes == 1
		vehicles = append(vehicles, vehicle)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate vehicles: %w", err)
	}
	return vehicles, nil
}

func (s *VehicleService) Get(ctx context.Context, id string) (*Vehicle, error) {
	vehicle, err := s.get(ctx, strings.TrimSpace(id))
	if err != nil {
		return nil, err
	}
	return vehicle, nil
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
		ID:                        randomID(),
		InventoryNumber:           input.InventoryNumber,
		Manufacturer:              input.Manufacturer,
		ArticleNumber:             input.ArticleNumber,
		ArticleSourceURL:          input.ArticleSourceURL,
		Name:                      input.Name,
		Gauge:                     input.Gauge,
		Epoch:                     input.Epoch,
		RailwayCompany:            input.RailwayCompany,
		Category:                  input.Category,
		Gattung:                   input.Gattung,
		Description:               input.Description,
		Series:                    input.Series,
		VehicleNumber:             input.VehicleNumber,
		Digital:                   input.Digital,
		DigitalDecoderNumber:      input.DigitalDecoderNumber,
		DTDecoder:                 input.DTDecoder,
		DTDecoderNumber:           input.DTDecoderNumber,
		ExhibitionReady:           input.ExhibitionReady,
		ABCBrakes:                 input.ABCBrakes,
		EAN:                       input.EAN,
		ProductionPeriod:          input.ProductionPeriod,
		ListPrice:                 input.ListPrice,
		LengthMM:                  input.LengthMM,
		WeightG:                   input.WeightG,
		Color:                     input.Color,
		Lettering:                 input.Lettering,
		Load:                      input.Load,
		Interior:                  input.Interior,
		Axles:                     input.Axles,
		AxleCount:                 input.AxleCount,
		TractionTireCount:         input.TractionTireCount,
		Wheelset:                  input.Wheelset,
		CouplingSame:              input.CouplingSame,
		CouplingFront:             input.CouplingFront,
		CouplingRear:              input.CouplingRear,
		PowerPickup:               input.PowerPickup,
		Adapter:                   input.Adapter,
		DriveEnabled:              input.DriveEnabled,
		DriveDescription:          input.DriveDescription,
		HeadlightsEnabled:         input.HeadlightsEnabled,
		HeadlightsDescription:     input.HeadlightsDescription,
		LightingEnabled:           input.LightingEnabled,
		LightingDescription:       input.LightingDescription,
		SoundGeneratorEnabled:     input.SoundGeneratorEnabled,
		SoundGeneratorDescription: input.SoundGeneratorDescription,
		SmokeGeneratorEnabled:     input.SmokeGeneratorEnabled,
		SmokeGeneratorDescription: input.SmokeGeneratorDescription,
		AdditionalInfo:            input.AdditionalInfo,
		QRCodeEnabled:             input.QRCodeEnabled,
		CreatedAt:                 now,
		UpdatedAt:                 now,
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
INSERT INTO vehicles(
  id, inventory_number, manufacturer, article_number, article_source_url, name, gauge, epoch, railway_company, category, gattung,
  description, series, vehicle_number, digital, digital_decoder_number, dt_decoder, dt_decoder_number,
  exhibition_ready, abc_brakes, ean, production_period, list_price,
  length_mm, weight_g, color, lettering, load, interior, axles, axle_count, traction_tire_count, wheelset,
  coupling_same, coupling_front, coupling_rear, power_pickup, adapter,
  drive_enabled, drive_description, headlights_enabled, headlights_description, lighting_enabled, lighting_description,
  sound_generator_enabled, sound_generator_description, smoke_generator_enabled, smoke_generator_description,
  additional_info, qr_code_enabled, created_at, updated_at
)
VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`, vehicle.ID, vehicle.InventoryNumber, vehicle.Manufacturer, vehicle.ArticleNumber, vehicle.ArticleSourceURL, vehicle.Name, vehicle.Gauge, vehicle.Epoch, vehicle.RailwayCompany, vehicle.Category, vehicle.Gattung, vehicle.Description, vehicle.Series, vehicle.VehicleNumber, boolToInt(vehicle.Digital), vehicle.DigitalDecoderNumber, boolToInt(vehicle.DTDecoder), vehicle.DTDecoderNumber, boolToInt(vehicle.ExhibitionReady), boolToInt(vehicle.ABCBrakes), vehicle.EAN, vehicle.ProductionPeriod, vehicle.ListPrice, vehicle.LengthMM, vehicle.WeightG, vehicle.Color, vehicle.Lettering, vehicle.Load, vehicle.Interior, vehicle.Axles, vehicle.AxleCount, vehicle.TractionTireCount, vehicle.Wheelset, boolToInt(vehicle.CouplingSame), vehicle.CouplingFront, vehicle.CouplingRear, vehicle.PowerPickup, vehicle.Adapter, boolToInt(vehicle.DriveEnabled), vehicle.DriveDescription, boolToInt(vehicle.HeadlightsEnabled), vehicle.HeadlightsDescription, boolToInt(vehicle.LightingEnabled), vehicle.LightingDescription, boolToInt(vehicle.SoundGeneratorEnabled), vehicle.SoundGeneratorDescription, boolToInt(vehicle.SmokeGeneratorEnabled), vehicle.SmokeGeneratorDescription, vehicle.AdditionalInfo, boolToInt(vehicle.QRCodeEnabled), vehicle.CreatedAt, vehicle.UpdatedAt); err != nil {
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

func (s *VehicleService) Update(ctx context.Context, id string, input CreateVehicleInput, actorUserID string) (*Vehicle, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return nil, ErrVehicleNotFound
	}

	existing, err := s.get(ctx, id)
	if err != nil {
		return nil, err
	}

	input = cleanVehicleInput(input)
	if input.InventoryNumber == "" {
		input.InventoryNumber = existing.InventoryNumber
	}
	if input.Manufacturer == "" || input.Name == "" || input.Gauge == "" {
		return nil, ErrVehicleValidation
	}

	now := time.Now().UTC().Format(time.RFC3339)
	vehicle := Vehicle{
		ID:                        id,
		InventoryNumber:           input.InventoryNumber,
		Manufacturer:              input.Manufacturer,
		ArticleNumber:             input.ArticleNumber,
		ArticleSourceURL:          input.ArticleSourceURL,
		Name:                      input.Name,
		Gauge:                     input.Gauge,
		Epoch:                     input.Epoch,
		RailwayCompany:            input.RailwayCompany,
		Category:                  input.Category,
		Gattung:                   input.Gattung,
		Description:               input.Description,
		Series:                    input.Series,
		VehicleNumber:             input.VehicleNumber,
		Digital:                   input.Digital,
		DigitalDecoderNumber:      input.DigitalDecoderNumber,
		DTDecoder:                 input.DTDecoder,
		DTDecoderNumber:           input.DTDecoderNumber,
		ExhibitionReady:           input.ExhibitionReady,
		ABCBrakes:                 input.ABCBrakes,
		EAN:                       input.EAN,
		ProductionPeriod:          input.ProductionPeriod,
		ListPrice:                 input.ListPrice,
		LengthMM:                  input.LengthMM,
		WeightG:                   input.WeightG,
		Color:                     input.Color,
		Lettering:                 input.Lettering,
		Load:                      input.Load,
		Interior:                  input.Interior,
		Axles:                     input.Axles,
		AxleCount:                 input.AxleCount,
		TractionTireCount:         input.TractionTireCount,
		Wheelset:                  input.Wheelset,
		CouplingSame:              input.CouplingSame,
		CouplingFront:             input.CouplingFront,
		CouplingRear:              input.CouplingRear,
		PowerPickup:               input.PowerPickup,
		Adapter:                   input.Adapter,
		DriveEnabled:              input.DriveEnabled,
		DriveDescription:          input.DriveDescription,
		HeadlightsEnabled:         input.HeadlightsEnabled,
		HeadlightsDescription:     input.HeadlightsDescription,
		LightingEnabled:           input.LightingEnabled,
		LightingDescription:       input.LightingDescription,
		SoundGeneratorEnabled:     input.SoundGeneratorEnabled,
		SoundGeneratorDescription: input.SoundGeneratorDescription,
		SmokeGeneratorEnabled:     input.SmokeGeneratorEnabled,
		SmokeGeneratorDescription: input.SmokeGeneratorDescription,
		AdditionalInfo:            input.AdditionalInfo,
		QRCodeEnabled:             input.QRCodeEnabled,
		CreatedAt:                 existing.CreatedAt,
		UpdatedAt:                 now,
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin update vehicle: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	result, err := tx.ExecContext(ctx, `
UPDATE vehicles
SET inventory_number=?, manufacturer=?, article_number=?, article_source_url=?, name=?, gauge=?, epoch=?, railway_company=?, category=?, gattung=?,
    description=?, series=?, vehicle_number=?, digital=?, digital_decoder_number=?, dt_decoder=?, dt_decoder_number=?,
    exhibition_ready=?, abc_brakes=?, ean=?, production_period=?, list_price=?,
    length_mm=?, weight_g=?, color=?, lettering=?, load=?, interior=?, axles=?, axle_count=?, traction_tire_count=?, wheelset=?,
    coupling_same=?, coupling_front=?, coupling_rear=?, power_pickup=?, adapter=?,
    drive_enabled=?, drive_description=?, headlights_enabled=?, headlights_description=?, lighting_enabled=?, lighting_description=?,
    sound_generator_enabled=?, sound_generator_description=?, smoke_generator_enabled=?, smoke_generator_description=?,
    additional_info=?, qr_code_enabled=?, updated_at=?
WHERE id=?
`, vehicle.InventoryNumber, vehicle.Manufacturer, vehicle.ArticleNumber, vehicle.ArticleSourceURL, vehicle.Name, vehicle.Gauge, vehicle.Epoch, vehicle.RailwayCompany, vehicle.Category, vehicle.Gattung, vehicle.Description, vehicle.Series, vehicle.VehicleNumber, boolToInt(vehicle.Digital), vehicle.DigitalDecoderNumber, boolToInt(vehicle.DTDecoder), vehicle.DTDecoderNumber, boolToInt(vehicle.ExhibitionReady), boolToInt(vehicle.ABCBrakes), vehicle.EAN, vehicle.ProductionPeriod, vehicle.ListPrice, vehicle.LengthMM, vehicle.WeightG, vehicle.Color, vehicle.Lettering, vehicle.Load, vehicle.Interior, vehicle.Axles, vehicle.AxleCount, vehicle.TractionTireCount, vehicle.Wheelset, boolToInt(vehicle.CouplingSame), vehicle.CouplingFront, vehicle.CouplingRear, vehicle.PowerPickup, vehicle.Adapter, boolToInt(vehicle.DriveEnabled), vehicle.DriveDescription, boolToInt(vehicle.HeadlightsEnabled), vehicle.HeadlightsDescription, boolToInt(vehicle.LightingEnabled), vehicle.LightingDescription, boolToInt(vehicle.SoundGeneratorEnabled), vehicle.SoundGeneratorDescription, boolToInt(vehicle.SmokeGeneratorEnabled), vehicle.SmokeGeneratorDescription, vehicle.AdditionalInfo, boolToInt(vehicle.QRCodeEnabled), vehicle.UpdatedAt, vehicle.ID)
	if err != nil {
		return nil, fmt.Errorf("update vehicle: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return nil, fmt.Errorf("read update result: %w", err)
	}
	if affected == 0 {
		_ = tx.Rollback()
		return nil, ErrVehicleNotFound
	}

	if _, err = tx.ExecContext(ctx, `
INSERT INTO audit_logs(id, actor_user_id, action, target_type, target_id, created_at, details_json)
VALUES(?, ?, 'VehicleUpdated', 'vehicle', ?, ?, '{}')
`, randomID(), actorUserID, vehicle.ID, now); err != nil {
		return nil, fmt.Errorf("write vehicle audit log: %w", err)
	}

	if err = tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit update vehicle: %w", err)
	}

	return &vehicle, nil
}

func (s *VehicleService) Delete(ctx context.Context, id, actorUserID string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return ErrVehicleNotFound
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin delete vehicle: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	result, err := tx.ExecContext(ctx, `DELETE FROM vehicles WHERE id=?`, id)
	if err != nil {
		return fmt.Errorf("delete vehicle: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read delete result: %w", err)
	}
	if affected == 0 {
		_ = tx.Rollback()
		return ErrVehicleNotFound
	}

	if _, err = tx.ExecContext(ctx, `
INSERT INTO audit_logs(id, actor_user_id, action, target_type, target_id, created_at, details_json)
VALUES(?, ?, 'VehicleDeleted', 'vehicle', ?, ?, '{}')
`, randomID(), actorUserID, id, time.Now().UTC().Format(time.RFC3339)); err != nil {
		return fmt.Errorf("write vehicle audit log: %w", err)
	}

	if err = tx.Commit(); err != nil {
		return fmt.Errorf("commit delete vehicle: %w", err)
	}

	return nil
}

func (s *VehicleService) get(ctx context.Context, id string) (*Vehicle, error) {
	var vehicle Vehicle
	var digital int
	var dtDecoder int
	var exhibitionReady int
	var abcBrakes int
	var couplingSame int
	var driveEnabled int
	var headlightsEnabled int
	var lightingEnabled int
	var soundGeneratorEnabled int
	var smokeGeneratorEnabled int
	var qrCodeEnabled int
	if err := s.db.QueryRowContext(ctx, `
SELECT id, inventory_number, manufacturer, COALESCE(article_number, ''), COALESCE(article_source_url, ''), name, gauge,
       COALESCE(epoch, ''), COALESCE(railway_company, ''), COALESCE(category, ''), COALESCE(gattung, ''),
       COALESCE(description, ''), COALESCE(series, ''), COALESCE(vehicle_number, ''),
       digital, COALESCE(digital_decoder_number, ''), dt_decoder, COALESCE(dt_decoder_number, ''),
       exhibition_ready, abc_brakes, COALESCE(ean, ''), COALESCE(production_period, ''), COALESCE(list_price, ''),
       COALESCE(length_mm, ''), COALESCE(weight_g, ''), COALESCE(color, ''), COALESCE(lettering, ''),
       COALESCE(load, ''), COALESCE(interior, ''), COALESCE(axles, ''), COALESCE(axle_count, ''),
       COALESCE(traction_tire_count, ''), COALESCE(wheelset, ''),
       coupling_same, COALESCE(coupling_front, ''), COALESCE(coupling_rear, ''), COALESCE(power_pickup, ''), COALESCE(adapter, ''),
       drive_enabled, COALESCE(drive_description, ''), headlights_enabled, COALESCE(headlights_description, ''),
       lighting_enabled, COALESCE(lighting_description, ''), sound_generator_enabled, COALESCE(sound_generator_description, ''),
       smoke_generator_enabled, COALESCE(smoke_generator_description, ''), COALESCE(additional_info, ''), qr_code_enabled,
       created_at, updated_at
FROM vehicles
WHERE id=?
`, id).Scan(
		&vehicle.ID,
		&vehicle.InventoryNumber,
		&vehicle.Manufacturer,
		&vehicle.ArticleNumber,
		&vehicle.ArticleSourceURL,
		&vehicle.Name,
		&vehicle.Gauge,
		&vehicle.Epoch,
		&vehicle.RailwayCompany,
		&vehicle.Category,
		&vehicle.Gattung,
		&vehicle.Description,
		&vehicle.Series,
		&vehicle.VehicleNumber,
		&digital,
		&vehicle.DigitalDecoderNumber,
		&dtDecoder,
		&vehicle.DTDecoderNumber,
		&exhibitionReady,
		&abcBrakes,
		&vehicle.EAN,
		&vehicle.ProductionPeriod,
		&vehicle.ListPrice,
		&vehicle.LengthMM,
		&vehicle.WeightG,
		&vehicle.Color,
		&vehicle.Lettering,
		&vehicle.Load,
		&vehicle.Interior,
		&vehicle.Axles,
		&vehicle.AxleCount,
		&vehicle.TractionTireCount,
		&vehicle.Wheelset,
		&couplingSame,
		&vehicle.CouplingFront,
		&vehicle.CouplingRear,
		&vehicle.PowerPickup,
		&vehicle.Adapter,
		&driveEnabled,
		&vehicle.DriveDescription,
		&headlightsEnabled,
		&vehicle.HeadlightsDescription,
		&lightingEnabled,
		&vehicle.LightingDescription,
		&soundGeneratorEnabled,
		&vehicle.SoundGeneratorDescription,
		&smokeGeneratorEnabled,
		&vehicle.SmokeGeneratorDescription,
		&vehicle.AdditionalInfo,
		&qrCodeEnabled,
		&vehicle.CreatedAt,
		&vehicle.UpdatedAt,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrVehicleNotFound
		}
		return nil, fmt.Errorf("get vehicle: %w", err)
	}
	vehicle.Digital = digital == 1
	vehicle.DTDecoder = dtDecoder == 1
	vehicle.ExhibitionReady = exhibitionReady == 1
	vehicle.ABCBrakes = abcBrakes == 1
	vehicle.CouplingSame = couplingSame == 1
	vehicle.DriveEnabled = driveEnabled == 1
	vehicle.HeadlightsEnabled = headlightsEnabled == 1
	vehicle.LightingEnabled = lightingEnabled == 1
	vehicle.SoundGeneratorEnabled = soundGeneratorEnabled == 1
	vehicle.SmokeGeneratorEnabled = smokeGeneratorEnabled == 1
	vehicle.QRCodeEnabled = qrCodeEnabled == 1

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
	input.ArticleSourceURL = strings.TrimSpace(input.ArticleSourceURL)
	input.Name = strings.TrimSpace(input.Name)
	input.Gauge = strings.TrimSpace(input.Gauge)
	input.Epoch = strings.TrimSpace(input.Epoch)
	input.RailwayCompany = strings.TrimSpace(input.RailwayCompany)
	input.Category = strings.TrimSpace(input.Category)
	input.Gattung = strings.TrimSpace(input.Gattung)
	input.Description = strings.TrimSpace(input.Description)
	input.Series = strings.TrimSpace(input.Series)
	input.VehicleNumber = strings.TrimSpace(input.VehicleNumber)
	input.DigitalDecoderNumber = strings.TrimSpace(input.DigitalDecoderNumber)
	input.DTDecoderNumber = strings.TrimSpace(input.DTDecoderNumber)
	input.EAN = strings.TrimSpace(input.EAN)
	input.ProductionPeriod = strings.TrimSpace(input.ProductionPeriod)
	input.ListPrice = strings.TrimSpace(input.ListPrice)
	input.LengthMM = strings.TrimSpace(input.LengthMM)
	input.WeightG = strings.TrimSpace(input.WeightG)
	input.Color = strings.TrimSpace(input.Color)
	input.Lettering = strings.TrimSpace(input.Lettering)
	input.Load = strings.TrimSpace(input.Load)
	input.Interior = strings.TrimSpace(input.Interior)
	input.Axles = strings.TrimSpace(input.Axles)
	input.AxleCount = strings.TrimSpace(input.AxleCount)
	input.TractionTireCount = strings.TrimSpace(input.TractionTireCount)
	input.Wheelset = strings.TrimSpace(input.Wheelset)
	input.CouplingFront = strings.TrimSpace(input.CouplingFront)
	input.CouplingRear = strings.TrimSpace(input.CouplingRear)
	input.PowerPickup = strings.TrimSpace(input.PowerPickup)
	input.Adapter = strings.TrimSpace(input.Adapter)
	input.DriveDescription = strings.TrimSpace(input.DriveDescription)
	input.HeadlightsDescription = strings.TrimSpace(input.HeadlightsDescription)
	input.LightingDescription = strings.TrimSpace(input.LightingDescription)
	input.SoundGeneratorDescription = strings.TrimSpace(input.SoundGeneratorDescription)
	input.SmokeGeneratorDescription = strings.TrimSpace(input.SmokeGeneratorDescription)
	input.AdditionalInfo = strings.TrimSpace(input.AdditionalInfo)
	if input.CouplingSame {
		input.CouplingRear = input.CouplingFront
	}
	return input
}
