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
	ID                        string         `json:"id"`
	InventoryNumber           string         `json:"inventoryNumber"`
	Manufacturer              string         `json:"manufacturer"`
	ArticleNumber             string         `json:"articleNumber,omitempty"`
	ArticleSourceURL          string         `json:"articleSourceUrl,omitempty"`
	Name                      string         `json:"name"`
	Gauge                     string         `json:"gauge"`
	Epoch                     string         `json:"epoch,omitempty"`
	RailwayCompany            string         `json:"railwayCompany,omitempty"`
	Category                  string         `json:"category,omitempty"`
	Gattung                   string         `json:"gattung,omitempty"`
	Description               string         `json:"description,omitempty"`
	Series                    string         `json:"series,omitempty"`
	VehicleNumber             string         `json:"vehicleNumber,omitempty"`
	Digital                   bool           `json:"digital"`
	DigitalDecoderNumber      string         `json:"digitalDecoderNumber,omitempty"`
	DTDecoder                 bool           `json:"dtDecoder"`
	DTDecoderNumber           string         `json:"dtDecoderNumber,omitempty"`
	ExhibitionReady           bool           `json:"exhibitionReady"`
	ABCBrakes                 bool           `json:"abcBrakes"`
	EAN                       string         `json:"ean,omitempty"`
	ProductionPeriod          string         `json:"productionPeriod,omitempty"`
	ListPrice                 string         `json:"listPrice,omitempty"`
	LengthMM                  string         `json:"lengthMm,omitempty"`
	WeightG                   string         `json:"weightG,omitempty"`
	Color                     string         `json:"color,omitempty"`
	Lettering                 string         `json:"lettering,omitempty"`
	Load                      string         `json:"load,omitempty"`
	Interior                  string         `json:"interior,omitempty"`
	Axles                     string         `json:"axles,omitempty"`
	AxleCount                 string         `json:"axleCount,omitempty"`
	TractionTireCount         string         `json:"tractionTireCount,omitempty"`
	Wheelset                  string         `json:"wheelset,omitempty"`
	CouplingSame              bool           `json:"couplingSame"`
	CouplingFront             string         `json:"couplingFront,omitempty"`
	CouplingRear              string         `json:"couplingRear,omitempty"`
	PowerPickup               string         `json:"powerPickup,omitempty"`
	Adapter                   string         `json:"adapter,omitempty"`
	DriveEnabled              bool           `json:"driveEnabled"`
	DriveDescription          string         `json:"driveDescription,omitempty"`
	HeadlightsEnabled         bool           `json:"headlightsEnabled"`
	HeadlightsDescription     string         `json:"headlightsDescription,omitempty"`
	LightingEnabled           bool           `json:"lightingEnabled"`
	LightingDescription       string         `json:"lightingDescription,omitempty"`
	SoundGeneratorEnabled     bool           `json:"soundGeneratorEnabled"`
	SoundGeneratorDescription string         `json:"soundGeneratorDescription,omitempty"`
	SmokeGeneratorEnabled     bool           `json:"smokeGeneratorEnabled"`
	SmokeGeneratorDescription string         `json:"smokeGeneratorDescription,omitempty"`
	AdditionalInfo            string         `json:"additionalInfo,omitempty"`
	QRCodeEnabled             bool           `json:"qrCodeEnabled"`
	Images                    []VehicleImage `json:"images,omitempty"`
	CreatedAt                 string         `json:"createdAt"`
	UpdatedAt                 string         `json:"updatedAt"`
}

type VehicleImage struct {
	ID        string `json:"id"`
	VehicleID string `json:"vehicleId"`
	URL       string `json:"url"`
	Title     string `json:"title,omitempty"`
	SourceURL string `json:"sourceUrl,omitempty"`
	IsPrimary bool   `json:"isPrimary"`
	SortOrder int    `json:"sortOrder"`
	CreatedAt string `json:"createdAt"`
}

type VehicleImageInput struct {
	URL       string `json:"url"`
	Title     string `json:"title"`
	SourceURL string `json:"sourceUrl"`
	IsPrimary bool   `json:"isPrimary"`
	SortOrder int    `json:"sortOrder"`
}

type CreateVehicleInput struct {
	InventoryNumber           string              `json:"inventoryNumber"`
	Manufacturer              string              `json:"manufacturer"`
	ArticleNumber             string              `json:"articleNumber"`
	ArticleSourceURL          string              `json:"articleSourceUrl"`
	Name                      string              `json:"name"`
	Gauge                     string              `json:"gauge"`
	Epoch                     string              `json:"epoch"`
	RailwayCompany            string              `json:"railwayCompany"`
	Category                  string              `json:"category"`
	Gattung                   string              `json:"gattung"`
	Description               string              `json:"description"`
	Series                    string              `json:"series"`
	VehicleNumber             string              `json:"vehicleNumber"`
	Digital                   bool                `json:"digital"`
	DigitalDecoderNumber      string              `json:"digitalDecoderNumber"`
	DTDecoder                 bool                `json:"dtDecoder"`
	DTDecoderNumber           string              `json:"dtDecoderNumber"`
	ExhibitionReady           bool                `json:"exhibitionReady"`
	ABCBrakes                 bool                `json:"abcBrakes"`
	EAN                       string              `json:"ean"`
	ProductionPeriod          string              `json:"productionPeriod"`
	ListPrice                 string              `json:"listPrice"`
	LengthMM                  string              `json:"lengthMm"`
	WeightG                   string              `json:"weightG"`
	Color                     string              `json:"color"`
	Lettering                 string              `json:"lettering"`
	Load                      string              `json:"load"`
	Interior                  string              `json:"interior"`
	Axles                     string              `json:"axles"`
	AxleCount                 string              `json:"axleCount"`
	TractionTireCount         string              `json:"tractionTireCount"`
	Wheelset                  string              `json:"wheelset"`
	CouplingSame              bool                `json:"couplingSame"`
	CouplingFront             string              `json:"couplingFront"`
	CouplingRear              string              `json:"couplingRear"`
	PowerPickup               string              `json:"powerPickup"`
	Adapter                   string              `json:"adapter"`
	DriveEnabled              bool                `json:"driveEnabled"`
	DriveDescription          string              `json:"driveDescription"`
	HeadlightsEnabled         bool                `json:"headlightsEnabled"`
	HeadlightsDescription     string              `json:"headlightsDescription"`
	LightingEnabled           bool                `json:"lightingEnabled"`
	LightingDescription       string              `json:"lightingDescription"`
	SoundGeneratorEnabled     bool                `json:"soundGeneratorEnabled"`
	SoundGeneratorDescription string              `json:"soundGeneratorDescription"`
	SmokeGeneratorEnabled     bool                `json:"smokeGeneratorEnabled"`
	SmokeGeneratorDescription string              `json:"smokeGeneratorDescription"`
	AdditionalInfo            string              `json:"additionalInfo"`
	QRCodeEnabled             bool                `json:"qrCodeEnabled"`
	Images                    []VehicleImageInput `json:"images"`
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
	if err := s.attachImages(ctx, vehicles); err != nil {
		return nil, err
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

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin create vehicle: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	if input.InventoryNumber == "" {
		input.InventoryNumber, err = s.nextInventoryNumber(ctx, tx, input.Category)
		if err != nil {
			return nil, err
		}
	} else if err = s.ensureInventoryNumberAvailable(ctx, tx, input.InventoryNumber, ""); err != nil {
		return nil, err
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
		Images:                    vehicleImagesFromInput("", input.Images, now),
		CreatedAt:                 now,
		UpdatedAt:                 now,
	}

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
	if err = saveVehicleImages(ctx, tx, vehicle.ID, input.Images, now); err != nil {
		return nil, err
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
		Images:                    vehicleImagesFromInput(id, input.Images, now),
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

	if vehicle.InventoryNumber != existing.InventoryNumber {
		if err = s.ensureInventoryNumberAvailable(ctx, tx, vehicle.InventoryNumber, vehicle.ID); err != nil {
			return nil, err
		}
	}

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

	if vehicle.InventoryNumber != existing.InventoryNumber {
		if _, err = tx.ExecContext(ctx, `
INSERT INTO inventory_number_history(id, vehicle_id, old_number, new_number, changed_by_user_id, changed_at, reason)
VALUES(?, ?, ?, ?, ?, ?, 'manual_update')
`, randomID(), vehicle.ID, existing.InventoryNumber, vehicle.InventoryNumber, actorUserID, now); err != nil {
			return nil, fmt.Errorf("write inventory number history: %w", err)
		}
	}

	if _, err = tx.ExecContext(ctx, `
INSERT INTO audit_logs(id, actor_user_id, action, target_type, target_id, created_at, details_json)
VALUES(?, ?, 'VehicleUpdated', 'vehicle', ?, ?, '{}')
`, randomID(), actorUserID, vehicle.ID, now); err != nil {
		return nil, fmt.Errorf("write vehicle audit log: %w", err)
	}
	if err = saveVehicleImages(ctx, tx, vehicle.ID, input.Images, now); err != nil {
		return nil, err
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
	images, err := s.loadVehicleImages(ctx, id)
	if err != nil {
		return nil, err
	}
	vehicle.Images = images

	return &vehicle, nil
}

func (s *VehicleService) attachImages(ctx context.Context, vehicles []Vehicle) error {
	for index := range vehicles {
		images, err := s.loadVehicleImages(ctx, vehicles[index].ID)
		if err != nil {
			return err
		}
		vehicles[index].Images = images
	}
	return nil
}

func (s *VehicleService) loadVehicleImages(ctx context.Context, vehicleID string) ([]VehicleImage, error) {
	rows, err := s.db.QueryContext(ctx, `
SELECT id, vehicle_id, url, COALESCE(title, ''), COALESCE(source_url, ''), is_primary, sort_order, created_at
FROM vehicle_images
WHERE vehicle_id=?
ORDER BY is_primary DESC, sort_order ASC, created_at ASC
`, vehicleID)
	if err != nil {
		return nil, fmt.Errorf("list vehicle images: %w", err)
	}
	defer func() { _ = rows.Close() }()

	images := []VehicleImage{}
	for rows.Next() {
		var image VehicleImage
		var isPrimary int
		if err := rows.Scan(&image.ID, &image.VehicleID, &image.URL, &image.Title, &image.SourceURL, &isPrimary, &image.SortOrder, &image.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan vehicle image: %w", err)
		}
		image.IsPrimary = isPrimary == 1
		images = append(images, image)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate vehicle images: %w", err)
	}
	return images, nil
}

func saveVehicleImages(ctx context.Context, tx *sql.Tx, vehicleID string, images []VehicleImageInput, now string) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM vehicle_images WHERE vehicle_id=?`, vehicleID); err != nil {
		return fmt.Errorf("clear vehicle images: %w", err)
	}
	cleaned := cleanVehicleImageInputs(images)
	for index, image := range cleaned {
		sortOrder := image.SortOrder
		if sortOrder == 0 {
			sortOrder = index
		}
		if _, err := tx.ExecContext(ctx, `
INSERT INTO vehicle_images(id, vehicle_id, url, title, source_url, is_primary, sort_order, created_at)
VALUES(?, ?, ?, ?, ?, ?, ?, ?)
`, randomID(), vehicleID, image.URL, image.Title, image.SourceURL, boolToInt(image.IsPrimary), sortOrder, now); err != nil {
			return fmt.Errorf("insert vehicle image: %w", err)
		}
	}
	return nil
}

func (s *VehicleService) nextInventoryNumber(ctx context.Context, tx *sql.Tx, vehicleCategory string) (string, error) {
	category := inventoryCategoryForVehicle(vehicleCategory)
	scheme, err := s.inventoryNumberSchemeForUpdate(ctx, tx, category)
	if err != nil {
		return "", err
	}

	next := scheme.NextNumber
	for attempts := 0; attempts < 500; attempts++ {
		candidate := formatInventoryNumber(scheme.Prefix, next, scheme.Padding)
		if err := s.ensureInventoryNumberAvailable(ctx, tx, candidate, ""); err == nil {
			if _, err = tx.ExecContext(ctx, `
UPDATE inventory_number_schemes
SET next_number=?, updated_at=?
WHERE category=?
`, next+1, time.Now().UTC().Format(time.RFC3339), scheme.Category); err != nil {
				return "", fmt.Errorf("advance inventory number scheme: %w", err)
			}
			return candidate, nil
		} else if !errors.Is(err, ErrInventoryNumberConflict) {
			return "", err
		}
		next++
	}

	return "", fmt.Errorf("next inventory number: exhausted attempts for %s", category)
}

func (s *VehicleService) inventoryNumberSchemeForUpdate(ctx context.Context, tx *sql.Tx, category string) (*InventoryNumberScheme, error) {
	var scheme InventoryNumberScheme
	var active int
	err := tx.QueryRowContext(ctx, `
SELECT id, category, prefix, next_number, padding, active, created_at, updated_at
FROM inventory_number_schemes
WHERE category=? AND active=1
`, category).Scan(
		&scheme.ID,
		&scheme.Category,
		&scheme.Prefix,
		&scheme.NextNumber,
		&scheme.Padding,
		&active,
		&scheme.CreatedAt,
		&scheme.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) && category != "Fahrzeug" {
		err = tx.QueryRowContext(ctx, `
SELECT id, category, prefix, next_number, padding, active, created_at, updated_at
FROM inventory_number_schemes
WHERE category='Fahrzeug' AND active=1
`).Scan(
			&scheme.ID,
			&scheme.Category,
			&scheme.Prefix,
			&scheme.NextNumber,
			&scheme.Padding,
			&active,
			&scheme.CreatedAt,
			&scheme.UpdatedAt,
		)
	}
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrInventoryNumberNotFound
		}
		return nil, fmt.Errorf("read inventory number scheme: %w", err)
	}
	scheme.Active = active == 1
	return &scheme, nil
}

func (s *VehicleService) ensureInventoryNumberAvailable(ctx context.Context, tx *sql.Tx, inventoryNumber, excludeVehicleID string) error {
	inventoryNumber = strings.TrimSpace(inventoryNumber)
	if inventoryNumber == "" {
		return ErrInventoryNumberValidation
	}
	var count int
	if err := tx.QueryRowContext(ctx, `
SELECT COUNT(*)
FROM vehicles
WHERE inventory_number=? AND (? = '' OR id <> ?)
`, inventoryNumber, excludeVehicleID, excludeVehicleID).Scan(&count); err != nil {
		return fmt.Errorf("check inventory number availability: %w", err)
	}
	if count > 0 {
		return ErrInventoryNumberConflict
	}
	return nil
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
	input.Images = cleanVehicleImageInputs(input.Images)
	if input.CouplingSame {
		input.CouplingRear = input.CouplingFront
	}
	return input
}

func cleanVehicleImageInputs(images []VehicleImageInput) []VehicleImageInput {
	seen := map[string]bool{}
	cleaned := []VehicleImageInput{}
	hasPrimary := false
	for _, image := range images {
		image.URL = strings.TrimSpace(image.URL)
		image.Title = strings.TrimSpace(image.Title)
		image.SourceURL = strings.TrimSpace(image.SourceURL)
		if image.URL == "" {
			continue
		}
		key := strings.ToLower(image.URL)
		if seen[key] {
			continue
		}
		seen[key] = true
		if image.IsPrimary {
			if hasPrimary {
				image.IsPrimary = false
			} else {
				hasPrimary = true
			}
		}
		cleaned = append(cleaned, image)
		if len(cleaned) >= 12 {
			break
		}
	}
	if len(cleaned) > 0 && !hasPrimary {
		cleaned[0].IsPrimary = true
	}
	return cleaned
}

func vehicleImagesFromInput(vehicleID string, images []VehicleImageInput, now string) []VehicleImage {
	cleaned := cleanVehicleImageInputs(images)
	out := make([]VehicleImage, 0, len(cleaned))
	for index, image := range cleaned {
		sortOrder := image.SortOrder
		if sortOrder == 0 {
			sortOrder = index
		}
		out = append(out, VehicleImage{
			VehicleID: vehicleID,
			URL:       image.URL,
			Title:     image.Title,
			SourceURL: image.SourceURL,
			IsPrimary: image.IsPrimary,
			SortOrder: sortOrder,
			CreatedAt: now,
		})
	}
	return out
}
