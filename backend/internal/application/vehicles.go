package application

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

var (
	ErrVehicleValidation = errors.New("vehicle validation failed")
	ErrVehicleNotFound   = errors.New("vehicle not found")
	ErrVehicleImageInUse = errors.New("vehicle image in use")
)

var allowedMaintenanceKinds = map[string]struct{}{
	"Decoder-Einbau":   {},
	"Ersatzteiltausch": {},
	"Reinigung":        {},
	"Reparatur":        {},
	"Schmierung":       {},
	"Superung":         {},
	"Umbau":            {},
	"Wartung":          {},
}

var allowedMaintenanceStatuses = map[string]struct{}{
	"erledigt": {},
	"faellig":  {},
	"geplant":  {},
}

var allowedConditionRatings = map[string]struct{}{
	"gebraucht":          {},
	"gut":                {},
	"neuwertig":          {},
	"reparaturbedürftig": {},
	"sehr gut":           {},
}

var allowedFunctionTypes = map[string]struct{}{
	"kupplung":       {},
	"licht":          {},
	"rauch":          {},
	"sonderfunktion": {},
	"sound":          {},
	"standard":       {},
}

var allowedFunctionModes = map[string]struct{}{
	"dauer":  {},
	"moment": {},
}

type VehicleService struct {
	db             *sql.DB
	imageLocalizer VehicleImageLocalizer
}

type VehicleImageLocalizer func(ctx context.Context, vehicleID string, images []VehicleImageInput) ([]VehicleImageInput, error)

type Vehicle struct {
	ID                        string               `json:"id"`
	InventoryNumber           string               `json:"inventoryNumber"`
	Manufacturer              string               `json:"manufacturer"`
	ArticleNumber             string               `json:"articleNumber,omitempty"`
	ArticleSourceURL          string               `json:"articleSourceUrl,omitempty"`
	Name                      string               `json:"name"`
	Gauge                     string               `json:"gauge"`
	Epoch                     string               `json:"epoch,omitempty"`
	RailwayCompany            string               `json:"railwayCompany,omitempty"`
	Category                  string               `json:"category,omitempty"`
	Gattung                   string               `json:"gattung,omitempty"`
	Description               string               `json:"description,omitempty"`
	Series                    string               `json:"series,omitempty"`
	VehicleNumber             string               `json:"vehicleNumber,omitempty"`
	Digital                   bool                 `json:"digital"`
	DigitalDecoderNumber      string               `json:"digitalDecoderNumber,omitempty"`
	DTDecoder                 bool                 `json:"dtDecoder"`
	DTDecoderNumber           string               `json:"dtDecoderNumber,omitempty"`
	ExhibitionReady           bool                 `json:"exhibitionReady"`
	ABCBrakes                 bool                 `json:"abcBrakes"`
	EAN                       string               `json:"ean,omitempty"`
	ProductionPeriod          string               `json:"productionPeriod,omitempty"`
	ListPrice                 string               `json:"listPrice,omitempty"`
	LengthMM                  string               `json:"lengthMm,omitempty"`
	WeightG                   string               `json:"weightG,omitempty"`
	Color                     string               `json:"color,omitempty"`
	Lettering                 string               `json:"lettering,omitempty"`
	Load                      string               `json:"load,omitempty"`
	Interior                  string               `json:"interior,omitempty"`
	Axles                     string               `json:"axles,omitempty"`
	AxleCount                 string               `json:"axleCount,omitempty"`
	TractionTireCount         string               `json:"tractionTireCount,omitempty"`
	Wheelset                  string               `json:"wheelset,omitempty"`
	CouplingSame              bool                 `json:"couplingSame"`
	CouplingFront             string               `json:"couplingFront,omitempty"`
	CouplingRear              string               `json:"couplingRear,omitempty"`
	PowerPickup               string               `json:"powerPickup,omitempty"`
	Adapter                   string               `json:"adapter,omitempty"`
	DriveEnabled              bool                 `json:"driveEnabled"`
	DriveDescription          string               `json:"driveDescription,omitempty"`
	HeadlightsEnabled         bool                 `json:"headlightsEnabled"`
	HeadlightsDescription     string               `json:"headlightsDescription,omitempty"`
	LightingEnabled           bool                 `json:"lightingEnabled"`
	LightingDescription       string               `json:"lightingDescription,omitempty"`
	SoundGeneratorEnabled     bool                 `json:"soundGeneratorEnabled"`
	SoundGeneratorDescription string               `json:"soundGeneratorDescription,omitempty"`
	SmokeGeneratorEnabled     bool                 `json:"smokeGeneratorEnabled"`
	SmokeGeneratorDescription string               `json:"smokeGeneratorDescription,omitempty"`
	AdditionalInfo            string               `json:"additionalInfo,omitempty"`
	QRCodeEnabled             bool                 `json:"qrCodeEnabled"`
	Images                    []VehicleImage       `json:"images,omitempty"`
	Attachments               []VehicleAttachment  `json:"attachments,omitempty"`
	Maintenance               []VehicleMaintenance `json:"maintenance,omitempty"`
	Functions                 []VehicleFunction    `json:"functions,omitempty"`
	CVValues                  []VehicleCVValue     `json:"cvValues,omitempty"`
	CVFiles                   []VehicleCVFile      `json:"cvFiles,omitempty"`
	CreatedAt                 string               `json:"createdAt"`
	UpdatedAt                 string               `json:"updatedAt"`
}

type VehicleImage struct {
	ID            string `json:"id"`
	VehicleID     string `json:"vehicleId"`
	URL           string `json:"url"`
	ThumbnailURL  string `json:"thumbnailUrl,omitempty"`
	Title         string `json:"title,omitempty"`
	SourceURL     string `json:"sourceUrl,omitempty"`
	FileName      string `json:"fileName,omitempty"`
	MimeType      string `json:"mimeType,omitempty"`
	StoragePath   string `json:"-"`
	ThumbnailPath string `json:"-"`
	MaintenanceID string `json:"maintenanceId,omitempty"`
	IsPrimary     bool   `json:"isPrimary"`
	SortOrder     int    `json:"sortOrder"`
	CreatedAt     string `json:"createdAt"`
	UpdatedAt     string `json:"updatedAt,omitempty"`
}

type VehicleImageInput struct {
	ID            string `json:"id"`
	URL           string `json:"url"`
	Title         string `json:"title"`
	SourceURL     string `json:"sourceUrl"`
	FileName      string `json:"-"`
	MimeType      string `json:"-"`
	StoragePath   string `json:"-"`
	ThumbnailPath string `json:"-"`
	MaintenanceID string `json:"maintenanceId"`
	IsPrimary     bool   `json:"isPrimary"`
	SortOrder     int    `json:"sortOrder"`
}

type VehicleAttachment struct {
	ID            string `json:"id"`
	VehicleID     string `json:"vehicleId"`
	FileName      string `json:"fileName"`
	OriginalName  string `json:"originalName"`
	Description   string `json:"description,omitempty"`
	Category      string `json:"category,omitempty"`
	MimeType      string `json:"mimeType,omitempty"`
	SizeBytes     int64  `json:"sizeBytes"`
	StoragePath   string `json:"-"`
	MaintenanceID string `json:"maintenanceId,omitempty"`
	CreatedAt     string `json:"createdAt"`
	UpdatedAt     string `json:"updatedAt"`
}

type VehicleAttachmentInput struct {
	FileName      string
	OriginalName  string
	Description   string
	Category      string
	MimeType      string
	SizeBytes     int64
	StoragePath   string
	MaintenanceID string
}

type VehicleAttachmentUpdateInput struct {
	Description   string `json:"description"`
	Category      string `json:"category"`
	MaintenanceID string `json:"maintenanceId"`
}

type VehicleMaintenance struct {
	ID              string `json:"id"`
	VehicleID       string `json:"vehicleId"`
	Kind            string `json:"kind"`
	Status          string `json:"status"`
	ConditionRating string `json:"conditionRating,omitempty"`
	DueDate         string `json:"dueDate,omitempty"`
	CompletedAt     string `json:"completedAt,omitempty"`
	Cost            string `json:"cost,omitempty"`
	Notes           string `json:"notes,omitempty"`
	CreatedAt       string `json:"createdAt"`
	UpdatedAt       string `json:"updatedAt"`
}

type VehicleMaintenanceInput struct {
	Kind            string `json:"kind"`
	Status          string `json:"status"`
	ConditionRating string `json:"conditionRating"`
	DueDate         string `json:"dueDate"`
	CompletedAt     string `json:"completedAt"`
	Cost            string `json:"cost"`
	Notes           string `json:"notes"`
}

type VehicleFunction struct {
	ID                 string `json:"id"`
	VehicleID          string `json:"vehicleId"`
	FunctionKey        string `json:"functionKey"`
	Name               string `json:"name,omitempty"`
	SymbolKey          string `json:"symbolKey,omitempty"`
	FunctionType       string `json:"functionType"`
	Mode               string `json:"mode"`
	DirectionDependent bool   `json:"directionDependent"`
	Notes              string `json:"notes,omitempty"`
	SortOrder          int    `json:"sortOrder"`
	CreatedAt          string `json:"createdAt"`
	UpdatedAt          string `json:"updatedAt"`
}

type VehicleFunctionInput struct {
	Name               string `json:"name"`
	SymbolKey          string `json:"symbolKey"`
	FunctionType       string `json:"functionType"`
	Mode               string `json:"mode"`
	DirectionDependent bool   `json:"directionDependent"`
	Notes              string `json:"notes"`
}

type VehicleCVValue struct {
	ID             string                  `json:"id"`
	VehicleID      string                  `json:"vehicleId"`
	CVNumber       int                     `json:"cvNumber"`
	Value          int                     `json:"value"`
	Description    string                  `json:"description,omitempty"`
	Category       string                  `json:"category,omitempty"`
	DecoderProfile string                  `json:"decoderProfile,omitempty"`
	SourceFileID   string                  `json:"sourceFileId,omitempty"`
	CreatedAt      string                  `json:"createdAt"`
	UpdatedAt      string                  `json:"updatedAt"`
	History        []VehicleCVValueHistory `json:"history,omitempty"`
}

type VehicleCVValueHistory struct {
	ID        string `json:"id"`
	CVValueID string `json:"cvValueId"`
	VehicleID string `json:"vehicleId"`
	OldValue  int    `json:"oldValue"`
	NewValue  int    `json:"newValue"`
	ChangedAt string `json:"changedAt"`
}

type VehicleCVValueInput struct {
	CVNumber       int    `json:"cvNumber"`
	Value          int    `json:"value"`
	Description    string `json:"description"`
	Category       string `json:"category"`
	DecoderProfile string `json:"decoderProfile"`
	SourceFileID   string `json:"sourceFileId"`
}

type VehicleCVFile struct {
	ID             string `json:"id"`
	VehicleID      string `json:"vehicleId"`
	FileName       string `json:"fileName"`
	OriginalName   string `json:"originalName"`
	Description    string `json:"description,omitempty"`
	DecoderProfile string `json:"decoderProfile,omitempty"`
	MimeType       string `json:"mimeType,omitempty"`
	SizeBytes      int64  `json:"sizeBytes"`
	StoragePath    string `json:"-"`
	CreatedAt      string `json:"createdAt"`
	UpdatedAt      string `json:"updatedAt"`
}

type VehicleCVFileInput struct {
	FileName       string
	OriginalName   string
	Description    string
	DecoderProfile string
	MimeType       string
	SizeBytes      int64
	StoragePath    string
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

func (s *VehicleService) SetImageLocalizer(localizer VehicleImageLocalizer) {
	s.imageLocalizer = localizer
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
	if err := s.attachAttachments(ctx, vehicles); err != nil {
		return nil, err
	}
	if err := s.attachMaintenance(ctx, vehicles); err != nil {
		return nil, err
	}
	if err := s.attachFunctions(ctx, vehicles); err != nil {
		return nil, err
	}
	if err := s.attachCVData(ctx, vehicles); err != nil {
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
	vehicleID := randomID()
	var err error
	if s.imageLocalizer != nil && len(input.Images) > 0 {
		input.Images, err = s.imageLocalizer(ctx, vehicleID, input.Images)
		if err != nil {
			return nil, err
		}
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
		ID:                        vehicleID,
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
		Images:                    vehicleImagesFromInput(vehicleID, input.Images, now),
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
	images, err := s.loadVehicleImages(ctx, vehicle.ID)
	if err != nil {
		return nil, err
	}
	vehicle.Images = images

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
	if s.imageLocalizer != nil && len(input.Images) > 0 {
		input.Images, err = s.imageLocalizer(ctx, id, input.Images)
		if err != nil {
			return nil, err
		}
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
	images, err := s.loadVehicleImages(ctx, vehicle.ID)
	if err != nil {
		return nil, err
	}
	vehicle.Images = images
	attachments, err := s.loadVehicleAttachments(ctx, vehicle.ID)
	if err != nil {
		return nil, err
	}
	vehicle.Attachments = attachments
	maintenance, err := s.loadVehicleMaintenance(ctx, vehicle.ID)
	if err != nil {
		return nil, err
	}
	vehicle.Maintenance = maintenance
	functions, err := s.loadVehicleFunctions(ctx, vehicle.ID)
	if err != nil {
		return nil, err
	}
	vehicle.Functions = functions
	cvValues, err := s.loadVehicleCVValues(ctx, vehicle.ID)
	if err != nil {
		return nil, err
	}
	vehicle.CVValues = cvValues
	cvFiles, err := s.loadVehicleCVFiles(ctx, vehicle.ID)
	if err != nil {
		return nil, err
	}
	vehicle.CVFiles = cvFiles

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
	attachments, err := s.loadVehicleAttachments(ctx, id)
	if err != nil {
		return nil, err
	}
	vehicle.Attachments = attachments
	maintenance, err := s.loadVehicleMaintenance(ctx, id)
	if err != nil {
		return nil, err
	}
	vehicle.Maintenance = maintenance
	functions, err := s.loadVehicleFunctions(ctx, id)
	if err != nil {
		return nil, err
	}
	vehicle.Functions = functions
	cvValues, err := s.loadVehicleCVValues(ctx, id)
	if err != nil {
		return nil, err
	}
	vehicle.CVValues = cvValues
	cvFiles, err := s.loadVehicleCVFiles(ctx, id)
	if err != nil {
		return nil, err
	}
	vehicle.CVFiles = cvFiles

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
SELECT id, vehicle_id, url, COALESCE(title, ''), COALESCE(source_url, ''), COALESCE(file_name, ''), COALESCE(mime_type, ''), COALESCE(storage_path, ''), COALESCE(thumbnail_path, ''), COALESCE(maintenance_id, ''), is_primary, sort_order, created_at, COALESCE(updated_at, '')
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
		if err := rows.Scan(&image.ID, &image.VehicleID, &image.URL, &image.Title, &image.SourceURL, &image.FileName, &image.MimeType, &image.StoragePath, &image.ThumbnailPath, &image.MaintenanceID, &isPrimary, &image.SortOrder, &image.CreatedAt, &image.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan vehicle image: %w", err)
		}
		image.IsPrimary = isPrimary == 1
		image = withVehicleImageURLs(image)
		images = append(images, image)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate vehicle images: %w", err)
	}
	return images, nil
}

func (s *VehicleService) attachAttachments(ctx context.Context, vehicles []Vehicle) error {
	for index := range vehicles {
		attachments, err := s.loadVehicleAttachments(ctx, vehicles[index].ID)
		if err != nil {
			return err
		}
		vehicles[index].Attachments = attachments
	}
	return nil
}

func (s *VehicleService) attachMaintenance(ctx context.Context, vehicles []Vehicle) error {
	for index := range vehicles {
		maintenance, err := s.loadVehicleMaintenance(ctx, vehicles[index].ID)
		if err != nil {
			return err
		}
		vehicles[index].Maintenance = maintenance
	}
	return nil
}

func (s *VehicleService) attachFunctions(ctx context.Context, vehicles []Vehicle) error {
	for index := range vehicles {
		functions, err := s.loadVehicleFunctions(ctx, vehicles[index].ID)
		if err != nil {
			return err
		}
		vehicles[index].Functions = functions
	}
	return nil
}

func (s *VehicleService) attachCVData(ctx context.Context, vehicles []Vehicle) error {
	for index := range vehicles {
		values, err := s.loadVehicleCVValues(ctx, vehicles[index].ID)
		if err != nil {
			return err
		}
		vehicles[index].CVValues = values
		files, err := s.loadVehicleCVFiles(ctx, vehicles[index].ID)
		if err != nil {
			return err
		}
		vehicles[index].CVFiles = files
	}
	return nil
}

func (s *VehicleService) CreateImage(ctx context.Context, vehicleID string, input VehicleImageInput) (*VehicleImage, error) {
	vehicleID = strings.TrimSpace(vehicleID)
	input = cleanVehicleImageInput(input)
	if vehicleID == "" || input.FileName == "" || input.MimeType == "" || input.StoragePath == "" {
		return nil, ErrVehicleValidation
	}
	if _, err := s.Get(ctx, vehicleID); err != nil {
		return nil, err
	}
	if err := ensureVehicleMaintenanceID(ctx, s.db, vehicleID, input.MaintenanceID); err != nil {
		return nil, err
	}

	now := time.Now().UTC().Format(time.RFC3339)
	imageID := randomID()
	image := VehicleImage{
		ID:            imageID,
		VehicleID:     vehicleID,
		URL:           "/api/v1/vehicles/" + vehicleID + "/images/" + imageID + "/file",
		ThumbnailURL:  "/api/v1/vehicles/" + vehicleID + "/images/" + imageID + "/thumbnail",
		Title:         input.Title,
		SourceURL:     input.SourceURL,
		FileName:      input.FileName,
		MimeType:      input.MimeType,
		StoragePath:   input.StoragePath,
		ThumbnailPath: input.ThumbnailPath,
		MaintenanceID: input.MaintenanceID,
		IsPrimary:     input.IsPrimary,
		SortOrder:     input.SortOrder,
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin vehicle image create: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var existingCount int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM vehicle_images WHERE vehicle_id=?`, vehicleID).Scan(&existingCount); err != nil {
		return nil, fmt.Errorf("count vehicle images: %w", err)
	}
	if existingCount == 0 {
		image.IsPrimary = true
	}
	if image.IsPrimary {
		if _, err := tx.ExecContext(ctx, `UPDATE vehicle_images SET is_primary=0, updated_at=? WHERE vehicle_id=?`, now, vehicleID); err != nil {
			return nil, fmt.Errorf("clear vehicle image primary flag: %w", err)
		}
	}
	if image.SortOrder == 0 {
		image.SortOrder = existingCount
	}
	if _, err := tx.ExecContext(ctx, `
INSERT INTO vehicle_images(id, vehicle_id, url, title, source_url, file_name, mime_type, storage_path, thumbnail_path, maintenance_id, is_primary, sort_order, created_at, updated_at)
VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`, image.ID, image.VehicleID, image.URL, image.Title, image.SourceURL, image.FileName, image.MimeType, image.StoragePath, image.ThumbnailPath, image.MaintenanceID, boolToInt(image.IsPrimary), image.SortOrder, image.CreatedAt, image.UpdatedAt); err != nil {
		return nil, fmt.Errorf("create vehicle image: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit vehicle image create: %w", err)
	}
	return &image, nil
}

func (s *VehicleService) GetImage(ctx context.Context, vehicleID, imageID string) (*VehicleImage, error) {
	var image VehicleImage
	var isPrimary int
	err := s.db.QueryRowContext(ctx, `
SELECT id, vehicle_id, url, COALESCE(title, ''), COALESCE(source_url, ''), COALESCE(file_name, ''), COALESCE(mime_type, ''), COALESCE(storage_path, ''), COALESCE(thumbnail_path, ''), COALESCE(maintenance_id, ''), is_primary, sort_order, created_at, COALESCE(updated_at, '')
FROM vehicle_images
WHERE id=? AND vehicle_id=?
`, strings.TrimSpace(imageID), strings.TrimSpace(vehicleID)).Scan(
		&image.ID,
		&image.VehicleID,
		&image.URL,
		&image.Title,
		&image.SourceURL,
		&image.FileName,
		&image.MimeType,
		&image.StoragePath,
		&image.ThumbnailPath,
		&image.MaintenanceID,
		&isPrimary,
		&image.SortOrder,
		&image.CreatedAt,
		&image.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrVehicleNotFound
		}
		return nil, fmt.Errorf("get vehicle image: %w", err)
	}
	image.IsPrimary = isPrimary == 1
	image = withVehicleImageURLs(image)
	return &image, nil
}

func (s *VehicleService) DeleteImage(ctx context.Context, vehicleID, imageID string) (*VehicleImage, error) {
	image, err := s.GetImage(ctx, vehicleID, imageID)
	if err != nil {
		return nil, err
	}
	if image.MaintenanceID != "" {
		return nil, ErrVehicleImageInUse
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin vehicle image delete: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	result, err := tx.ExecContext(ctx, `DELETE FROM vehicle_images WHERE id=? AND vehicle_id=?`, strings.TrimSpace(imageID), strings.TrimSpace(vehicleID))
	if err != nil {
		return nil, fmt.Errorf("delete vehicle image: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return nil, fmt.Errorf("read vehicle image delete result: %w", err)
	}
	if affected == 0 {
		return nil, ErrVehicleNotFound
	}
	if image.IsPrimary {
		now := time.Now().UTC().Format(time.RFC3339)
		if _, err := tx.ExecContext(ctx, `
UPDATE vehicle_images
SET is_primary=1, updated_at=?
WHERE id = (
  SELECT id FROM vehicle_images WHERE vehicle_id=? ORDER BY sort_order ASC, created_at ASC LIMIT 1
)
`, now, strings.TrimSpace(vehicleID)); err != nil {
			return nil, fmt.Errorf("promote vehicle image primary flag: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit vehicle image delete: %w", err)
	}
	return image, nil
}

func (s *VehicleService) ImageFileReferenceCount(ctx context.Context, storagePath string) (int, error) {
	storagePath = strings.TrimSpace(storagePath)
	if storagePath == "" {
		return 0, nil
	}
	var count int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM vehicle_images WHERE storage_path=? OR thumbnail_path=?`, storagePath, storagePath).Scan(&count); err != nil {
		return 0, fmt.Errorf("count vehicle image file references: %w", err)
	}
	return count, nil
}

func (s *VehicleService) loadVehicleAttachments(ctx context.Context, vehicleID string) ([]VehicleAttachment, error) {
	rows, err := s.db.QueryContext(ctx, `
SELECT id, vehicle_id, file_name, original_name, COALESCE(description, ''), COALESCE(category, ''),
       COALESCE(mime_type, ''), size_bytes, storage_path, COALESCE(maintenance_id, ''), created_at, updated_at
FROM vehicle_attachments
WHERE vehicle_id=?
ORDER BY created_at ASC
`, vehicleID)
	if err != nil {
		return nil, fmt.Errorf("list vehicle attachments: %w", err)
	}
	defer func() { _ = rows.Close() }()

	attachments := []VehicleAttachment{}
	for rows.Next() {
		var attachment VehicleAttachment
		if err := rows.Scan(
			&attachment.ID,
			&attachment.VehicleID,
			&attachment.FileName,
			&attachment.OriginalName,
			&attachment.Description,
			&attachment.Category,
			&attachment.MimeType,
			&attachment.SizeBytes,
			&attachment.StoragePath,
			&attachment.MaintenanceID,
			&attachment.CreatedAt,
			&attachment.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan vehicle attachment: %w", err)
		}
		attachments = append(attachments, attachment)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate vehicle attachments: %w", err)
	}
	return attachments, nil
}

func (s *VehicleService) CreateAttachment(ctx context.Context, vehicleID string, input VehicleAttachmentInput) (*VehicleAttachment, error) {
	vehicleID = strings.TrimSpace(vehicleID)
	input = cleanVehicleAttachmentInput(input)
	if vehicleID == "" || input.FileName == "" || input.OriginalName == "" || input.StoragePath == "" {
		return nil, ErrVehicleValidation
	}
	if _, err := s.Get(ctx, vehicleID); err != nil {
		return nil, err
	}
	if err := ensureVehicleMaintenanceID(ctx, s.db, vehicleID, input.MaintenanceID); err != nil {
		return nil, err
	}

	now := time.Now().UTC().Format(time.RFC3339)
	attachment := VehicleAttachment{
		ID:            randomID(),
		VehicleID:     vehicleID,
		FileName:      input.FileName,
		OriginalName:  input.OriginalName,
		Description:   input.Description,
		Category:      input.Category,
		MimeType:      input.MimeType,
		SizeBytes:     input.SizeBytes,
		StoragePath:   input.StoragePath,
		MaintenanceID: input.MaintenanceID,
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	if _, err := s.db.ExecContext(ctx, `
INSERT INTO vehicle_attachments(id, vehicle_id, file_name, original_name, description, category, mime_type, size_bytes, storage_path, maintenance_id, created_at, updated_at)
VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`, attachment.ID, attachment.VehicleID, attachment.FileName, attachment.OriginalName, attachment.Description, attachment.Category, attachment.MimeType, attachment.SizeBytes, attachment.StoragePath, attachment.MaintenanceID, attachment.CreatedAt, attachment.UpdatedAt); err != nil {
		return nil, fmt.Errorf("create vehicle attachment: %w", err)
	}
	return &attachment, nil
}

func (s *VehicleService) UpdateAttachment(ctx context.Context, vehicleID, attachmentID string, input VehicleAttachmentUpdateInput) (*VehicleAttachment, error) {
	vehicleID = strings.TrimSpace(vehicleID)
	attachmentID = strings.TrimSpace(attachmentID)
	input.Description = strings.TrimSpace(input.Description)
	input.Category = strings.TrimSpace(input.Category)
	input.MaintenanceID = strings.TrimSpace(input.MaintenanceID)
	if err := ensureVehicleMaintenanceID(ctx, s.db, vehicleID, input.MaintenanceID); err != nil {
		return nil, err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	result, err := s.db.ExecContext(ctx, `
UPDATE vehicle_attachments
SET description=?, category=?, maintenance_id=?, updated_at=?
WHERE id=? AND vehicle_id=?
`, input.Description, input.Category, input.MaintenanceID, now, attachmentID, vehicleID)
	if err != nil {
		return nil, fmt.Errorf("update vehicle attachment: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return nil, fmt.Errorf("read vehicle attachment update result: %w", err)
	}
	if affected == 0 {
		return nil, ErrVehicleNotFound
	}
	return s.GetAttachment(ctx, vehicleID, attachmentID)
}

func (s *VehicleService) GetAttachment(ctx context.Context, vehicleID, attachmentID string) (*VehicleAttachment, error) {
	var attachment VehicleAttachment
	err := s.db.QueryRowContext(ctx, `
SELECT id, vehicle_id, file_name, original_name, COALESCE(description, ''), COALESCE(category, ''),
       COALESCE(mime_type, ''), size_bytes, storage_path, COALESCE(maintenance_id, ''), created_at, updated_at
FROM vehicle_attachments
WHERE id=? AND vehicle_id=?
`, strings.TrimSpace(attachmentID), strings.TrimSpace(vehicleID)).Scan(
		&attachment.ID,
		&attachment.VehicleID,
		&attachment.FileName,
		&attachment.OriginalName,
		&attachment.Description,
		&attachment.Category,
		&attachment.MimeType,
		&attachment.SizeBytes,
		&attachment.StoragePath,
		&attachment.MaintenanceID,
		&attachment.CreatedAt,
		&attachment.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrVehicleNotFound
		}
		return nil, fmt.Errorf("get vehicle attachment: %w", err)
	}
	return &attachment, nil
}

func (s *VehicleService) DeleteAttachment(ctx context.Context, vehicleID, attachmentID string) (*VehicleAttachment, error) {
	attachment, err := s.GetAttachment(ctx, vehicleID, attachmentID)
	if err != nil {
		return nil, err
	}
	result, err := s.db.ExecContext(ctx, `DELETE FROM vehicle_attachments WHERE id=? AND vehicle_id=?`, attachmentID, vehicleID)
	if err != nil {
		return nil, fmt.Errorf("delete vehicle attachment: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return nil, fmt.Errorf("read vehicle attachment delete result: %w", err)
	}
	if affected == 0 {
		return nil, ErrVehicleNotFound
	}
	return attachment, nil
}

func (s *VehicleService) ListMaintenance(ctx context.Context, vehicleID string) ([]VehicleMaintenance, error) {
	vehicleID = strings.TrimSpace(vehicleID)
	if vehicleID == "" {
		return nil, ErrVehicleNotFound
	}
	if _, err := s.Get(ctx, vehicleID); err != nil {
		return nil, err
	}
	return s.loadVehicleMaintenance(ctx, vehicleID)
}

func (s *VehicleService) CreateMaintenance(ctx context.Context, vehicleID string, input VehicleMaintenanceInput) (*VehicleMaintenance, error) {
	vehicleID = strings.TrimSpace(vehicleID)
	input = cleanVehicleMaintenanceInput(input)
	if vehicleID == "" || !isValidVehicleMaintenanceInput(input) {
		return nil, ErrVehicleValidation
	}
	if _, err := s.Get(ctx, vehicleID); err != nil {
		return nil, err
	}

	now := time.Now().UTC().Format(time.RFC3339)
	maintenance := VehicleMaintenance{
		ID:              randomID(),
		VehicleID:       vehicleID,
		Kind:            input.Kind,
		Status:          input.Status,
		ConditionRating: input.ConditionRating,
		DueDate:         input.DueDate,
		CompletedAt:     input.CompletedAt,
		Cost:            input.Cost,
		Notes:           input.Notes,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	if _, err := s.db.ExecContext(ctx, `
INSERT INTO vehicle_maintenance(id, vehicle_id, kind, status, condition_rating, due_date, completed_at, cost, notes, created_at, updated_at)
VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`, maintenance.ID, maintenance.VehicleID, maintenance.Kind, maintenance.Status, maintenance.ConditionRating, maintenance.DueDate, maintenance.CompletedAt, maintenance.Cost, maintenance.Notes, maintenance.CreatedAt, maintenance.UpdatedAt); err != nil {
		return nil, fmt.Errorf("create vehicle maintenance: %w", err)
	}
	return &maintenance, nil
}

func (s *VehicleService) UpdateMaintenance(ctx context.Context, vehicleID, maintenanceID string, input VehicleMaintenanceInput) (*VehicleMaintenance, error) {
	vehicleID = strings.TrimSpace(vehicleID)
	maintenanceID = strings.TrimSpace(maintenanceID)
	input = cleanVehicleMaintenanceInput(input)
	if vehicleID == "" || maintenanceID == "" || !isValidVehicleMaintenanceInput(input) {
		return nil, ErrVehicleValidation
	}
	now := time.Now().UTC().Format(time.RFC3339)
	result, err := s.db.ExecContext(ctx, `
UPDATE vehicle_maintenance
SET kind=?, status=?, condition_rating=?, due_date=?, completed_at=?, cost=?, notes=?, updated_at=?
WHERE id=? AND vehicle_id=?
`, input.Kind, input.Status, input.ConditionRating, input.DueDate, input.CompletedAt, input.Cost, input.Notes, now, maintenanceID, vehicleID)
	if err != nil {
		return nil, fmt.Errorf("update vehicle maintenance: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return nil, fmt.Errorf("read vehicle maintenance update result: %w", err)
	}
	if affected == 0 {
		return nil, ErrVehicleNotFound
	}
	return s.GetMaintenance(ctx, vehicleID, maintenanceID)
}

func (s *VehicleService) GetMaintenance(ctx context.Context, vehicleID, maintenanceID string) (*VehicleMaintenance, error) {
	var maintenance VehicleMaintenance
	err := s.db.QueryRowContext(ctx, `
SELECT id, vehicle_id, kind, status, COALESCE(condition_rating, ''), COALESCE(due_date, ''), COALESCE(completed_at, ''),
       COALESCE(cost, ''), COALESCE(notes, ''), created_at, updated_at
FROM vehicle_maintenance
WHERE id=? AND vehicle_id=?
`, strings.TrimSpace(maintenanceID), strings.TrimSpace(vehicleID)).Scan(
		&maintenance.ID,
		&maintenance.VehicleID,
		&maintenance.Kind,
		&maintenance.Status,
		&maintenance.ConditionRating,
		&maintenance.DueDate,
		&maintenance.CompletedAt,
		&maintenance.Cost,
		&maintenance.Notes,
		&maintenance.CreatedAt,
		&maintenance.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrVehicleNotFound
		}
		return nil, fmt.Errorf("get vehicle maintenance: %w", err)
	}
	return &maintenance, nil
}

func (s *VehicleService) DeleteMaintenance(ctx context.Context, vehicleID, maintenanceID string) (*VehicleMaintenance, error) {
	maintenance, err := s.GetMaintenance(ctx, vehicleID, maintenanceID)
	if err != nil {
		return nil, err
	}
	result, err := s.db.ExecContext(ctx, `DELETE FROM vehicle_maintenance WHERE id=? AND vehicle_id=?`, strings.TrimSpace(maintenanceID), strings.TrimSpace(vehicleID))
	if err != nil {
		return nil, fmt.Errorf("delete vehicle maintenance: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return nil, fmt.Errorf("read vehicle maintenance delete result: %w", err)
	}
	if affected == 0 {
		return nil, ErrVehicleNotFound
	}
	return maintenance, nil
}

func (s *VehicleService) loadVehicleMaintenance(ctx context.Context, vehicleID string) ([]VehicleMaintenance, error) {
	rows, err := s.db.QueryContext(ctx, `
SELECT id, vehicle_id, kind, status, COALESCE(condition_rating, ''), COALESCE(due_date, ''), COALESCE(completed_at, ''),
       COALESCE(cost, ''), COALESCE(notes, ''), created_at, updated_at
FROM vehicle_maintenance
WHERE vehicle_id=?
ORDER BY
  CASE WHEN status='erledigt' THEN 1 ELSE 0 END ASC,
  CASE WHEN due_date='' THEN 1 ELSE 0 END ASC,
  due_date ASC,
  created_at DESC
`, strings.TrimSpace(vehicleID))
	if err != nil {
		return nil, fmt.Errorf("list vehicle maintenance: %w", err)
	}
	defer func() { _ = rows.Close() }()

	entries := []VehicleMaintenance{}
	for rows.Next() {
		var maintenance VehicleMaintenance
		if err := rows.Scan(
			&maintenance.ID,
			&maintenance.VehicleID,
			&maintenance.Kind,
			&maintenance.Status,
			&maintenance.ConditionRating,
			&maintenance.DueDate,
			&maintenance.CompletedAt,
			&maintenance.Cost,
			&maintenance.Notes,
			&maintenance.CreatedAt,
			&maintenance.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan vehicle maintenance: %w", err)
		}
		entries = append(entries, maintenance)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate vehicle maintenance: %w", err)
	}
	return entries, nil
}

func (s *VehicleService) ListFunctions(ctx context.Context, vehicleID string) ([]VehicleFunction, error) {
	vehicleID = strings.TrimSpace(vehicleID)
	if vehicleID == "" {
		return nil, ErrVehicleNotFound
	}
	if _, err := s.Get(ctx, vehicleID); err != nil {
		return nil, err
	}
	return s.loadVehicleFunctions(ctx, vehicleID)
}

func (s *VehicleService) UpsertFunction(ctx context.Context, vehicleID, functionKey string, input VehicleFunctionInput) (*VehicleFunction, error) {
	vehicleID = strings.TrimSpace(vehicleID)
	functionKey = normalizeFunctionKey(functionKey)
	input = cleanVehicleFunctionInput(input)
	if vehicleID == "" || !validFunctionKey(functionKey) || !isValidVehicleFunctionInput(input) {
		return nil, ErrVehicleValidation
	}
	if _, err := s.Get(ctx, vehicleID); err != nil {
		return nil, err
	}

	now := time.Now().UTC().Format(time.RFC3339)
	sortOrder := functionSortOrder(functionKey)
	id := vehicleID + ":" + functionKey
	if _, err := s.db.ExecContext(ctx, `
INSERT INTO vehicle_functions(id, vehicle_id, function_key, name, symbol_key, function_type, mode, direction_dependent, notes, sort_order, created_at, updated_at)
VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(vehicle_id, function_key) DO UPDATE SET
  name=excluded.name,
  symbol_key=excluded.symbol_key,
  function_type=excluded.function_type,
  mode=excluded.mode,
  direction_dependent=excluded.direction_dependent,
  notes=excluded.notes,
  sort_order=excluded.sort_order,
  updated_at=excluded.updated_at
`, id, vehicleID, functionKey, input.Name, input.SymbolKey, input.FunctionType, input.Mode, boolToInt(input.DirectionDependent), input.Notes, sortOrder, now, now); err != nil {
		return nil, fmt.Errorf("upsert vehicle function: %w", err)
	}
	return s.GetFunction(ctx, vehicleID, functionKey)
}

func (s *VehicleService) GetFunction(ctx context.Context, vehicleID, functionKey string) (*VehicleFunction, error) {
	var item VehicleFunction
	var directionDependent int
	err := s.db.QueryRowContext(ctx, `
SELECT id, vehicle_id, function_key, COALESCE(name, ''), COALESCE(symbol_key, ''), function_type, mode,
       direction_dependent, COALESCE(notes, ''), sort_order, created_at, updated_at
FROM vehicle_functions
WHERE vehicle_id=? AND function_key=?
`, strings.TrimSpace(vehicleID), normalizeFunctionKey(functionKey)).Scan(
		&item.ID,
		&item.VehicleID,
		&item.FunctionKey,
		&item.Name,
		&item.SymbolKey,
		&item.FunctionType,
		&item.Mode,
		&directionDependent,
		&item.Notes,
		&item.SortOrder,
		&item.CreatedAt,
		&item.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrVehicleNotFound
		}
		return nil, fmt.Errorf("get vehicle function: %w", err)
	}
	item.DirectionDependent = directionDependent == 1
	return &item, nil
}

func (s *VehicleService) DeleteFunction(ctx context.Context, vehicleID, functionKey string) (*VehicleFunction, error) {
	function, err := s.GetFunction(ctx, vehicleID, functionKey)
	if err != nil {
		return nil, err
	}
	result, err := s.db.ExecContext(ctx, `DELETE FROM vehicle_functions WHERE vehicle_id=? AND function_key=?`, strings.TrimSpace(vehicleID), normalizeFunctionKey(functionKey))
	if err != nil {
		return nil, fmt.Errorf("delete vehicle function: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return nil, fmt.Errorf("read vehicle function delete result: %w", err)
	}
	if affected == 0 {
		return nil, ErrVehicleNotFound
	}
	return function, nil
}

func (s *VehicleService) loadVehicleFunctions(ctx context.Context, vehicleID string) ([]VehicleFunction, error) {
	rows, err := s.db.QueryContext(ctx, `
SELECT id, vehicle_id, function_key, COALESCE(name, ''), COALESCE(symbol_key, ''), function_type, mode,
       direction_dependent, COALESCE(notes, ''), sort_order, created_at, updated_at
FROM vehicle_functions
WHERE vehicle_id=?
ORDER BY sort_order ASC, function_key ASC
`, strings.TrimSpace(vehicleID))
	if err != nil {
		return nil, fmt.Errorf("list vehicle functions: %w", err)
	}
	defer func() { _ = rows.Close() }()

	out := []VehicleFunction{}
	for rows.Next() {
		var item VehicleFunction
		var directionDependent int
		if err := rows.Scan(
			&item.ID,
			&item.VehicleID,
			&item.FunctionKey,
			&item.Name,
			&item.SymbolKey,
			&item.FunctionType,
			&item.Mode,
			&directionDependent,
			&item.Notes,
			&item.SortOrder,
			&item.CreatedAt,
			&item.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan vehicle function: %w", err)
		}
		item.DirectionDependent = directionDependent == 1
		out = append(out, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate vehicle functions: %w", err)
	}
	return out, nil
}

func (s *VehicleService) ListCVValues(ctx context.Context, vehicleID string) ([]VehicleCVValue, error) {
	vehicleID = strings.TrimSpace(vehicleID)
	if vehicleID == "" {
		return nil, ErrVehicleNotFound
	}
	if _, err := s.Get(ctx, vehicleID); err != nil {
		return nil, err
	}
	return s.loadVehicleCVValues(ctx, vehicleID)
}

func (s *VehicleService) CreateCVValue(ctx context.Context, vehicleID string, input VehicleCVValueInput) (*VehicleCVValue, error) {
	vehicleID = strings.TrimSpace(vehicleID)
	input = cleanVehicleCVValueInput(input)
	if vehicleID == "" || !isValidVehicleCVValueInput(input) {
		return nil, ErrVehicleValidation
	}
	if _, err := s.Get(ctx, vehicleID); err != nil {
		return nil, err
	}
	if input.SourceFileID != "" {
		if _, err := s.GetCVFile(ctx, vehicleID, input.SourceFileID); err != nil {
			if errors.Is(err, ErrVehicleNotFound) {
				return nil, ErrVehicleValidation
			}
			return nil, err
		}
	}
	now := time.Now().UTC().Format(time.RFC3339)
	item := VehicleCVValue{
		ID:             randomID(),
		VehicleID:      vehicleID,
		CVNumber:       input.CVNumber,
		Value:          input.Value,
		Description:    input.Description,
		Category:       input.Category,
		DecoderProfile: input.DecoderProfile,
		SourceFileID:   input.SourceFileID,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	if _, err := s.db.ExecContext(ctx, `
INSERT INTO vehicle_cv_values(id, vehicle_id, cv_number, value, description, category, decoder_profile, source_file_id, created_at, updated_at)
VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`, item.ID, item.VehicleID, item.CVNumber, item.Value, item.Description, item.Category, item.DecoderProfile, item.SourceFileID, item.CreatedAt, item.UpdatedAt); err != nil {
		return nil, fmt.Errorf("create vehicle cv value: %w", err)
	}
	return &item, nil
}

func (s *VehicleService) UpdateCVValue(ctx context.Context, vehicleID, cvValueID string, input VehicleCVValueInput) (*VehicleCVValue, error) {
	vehicleID = strings.TrimSpace(vehicleID)
	cvValueID = strings.TrimSpace(cvValueID)
	input = cleanVehicleCVValueInput(input)
	if vehicleID == "" || cvValueID == "" || !isValidVehicleCVValueInput(input) {
		return nil, ErrVehicleValidation
	}
	existing, err := s.GetCVValue(ctx, vehicleID, cvValueID)
	if err != nil {
		return nil, err
	}
	if input.SourceFileID != "" {
		if _, err := s.GetCVFile(ctx, vehicleID, input.SourceFileID); err != nil {
			if errors.Is(err, ErrVehicleNotFound) {
				return nil, ErrVehicleValidation
			}
			return nil, err
		}
	}
	now := time.Now().UTC().Format(time.RFC3339)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin cv value update: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()
	result, err := tx.ExecContext(ctx, `
UPDATE vehicle_cv_values
SET cv_number=?, value=?, description=?, category=?, decoder_profile=?, source_file_id=?, updated_at=?
WHERE id=? AND vehicle_id=?
`, input.CVNumber, input.Value, input.Description, input.Category, input.DecoderProfile, input.SourceFileID, now, cvValueID, vehicleID)
	if err != nil {
		return nil, fmt.Errorf("update vehicle cv value: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return nil, fmt.Errorf("read vehicle cv value update result: %w", err)
	}
	if affected == 0 {
		return nil, ErrVehicleNotFound
	}
	if existing.Value != input.Value {
		if _, err = tx.ExecContext(ctx, `
INSERT INTO vehicle_cv_value_history(id, cv_value_id, vehicle_id, old_value, new_value, changed_at)
VALUES(?, ?, ?, ?, ?, ?)
`, randomID(), cvValueID, vehicleID, existing.Value, input.Value, now); err != nil {
			return nil, fmt.Errorf("write cv value history: %w", err)
		}
	}
	if err = tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit cv value update: %w", err)
	}
	return s.GetCVValue(ctx, vehicleID, cvValueID)
}

func (s *VehicleService) GetCVValue(ctx context.Context, vehicleID, cvValueID string) (*VehicleCVValue, error) {
	var item VehicleCVValue
	err := s.db.QueryRowContext(ctx, `
SELECT id, vehicle_id, cv_number, value, COALESCE(description, ''), COALESCE(category, ''),
       COALESCE(decoder_profile, ''), COALESCE(source_file_id, ''), created_at, updated_at
FROM vehicle_cv_values
WHERE id=? AND vehicle_id=?
`, strings.TrimSpace(cvValueID), strings.TrimSpace(vehicleID)).Scan(
		&item.ID,
		&item.VehicleID,
		&item.CVNumber,
		&item.Value,
		&item.Description,
		&item.Category,
		&item.DecoderProfile,
		&item.SourceFileID,
		&item.CreatedAt,
		&item.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrVehicleNotFound
		}
		return nil, fmt.Errorf("get vehicle cv value: %w", err)
	}
	history, err := s.loadVehicleCVValueHistory(ctx, item.ID)
	if err != nil {
		return nil, err
	}
	item.History = history
	return &item, nil
}

func (s *VehicleService) DeleteCVValue(ctx context.Context, vehicleID, cvValueID string) (*VehicleCVValue, error) {
	item, err := s.GetCVValue(ctx, vehicleID, cvValueID)
	if err != nil {
		return nil, err
	}
	result, err := s.db.ExecContext(ctx, `DELETE FROM vehicle_cv_values WHERE id=? AND vehicle_id=?`, strings.TrimSpace(cvValueID), strings.TrimSpace(vehicleID))
	if err != nil {
		return nil, fmt.Errorf("delete vehicle cv value: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return nil, fmt.Errorf("read vehicle cv value delete result: %w", err)
	}
	if affected == 0 {
		return nil, ErrVehicleNotFound
	}
	return item, nil
}

func (s *VehicleService) loadVehicleCVValues(ctx context.Context, vehicleID string) ([]VehicleCVValue, error) {
	rows, err := s.db.QueryContext(ctx, `
SELECT id, vehicle_id, cv_number, value, COALESCE(description, ''), COALESCE(category, ''),
       COALESCE(decoder_profile, ''), COALESCE(source_file_id, ''), created_at, updated_at
FROM vehicle_cv_values
WHERE vehicle_id=?
ORDER BY decoder_profile ASC, cv_number ASC
`, strings.TrimSpace(vehicleID))
	if err != nil {
		return nil, fmt.Errorf("list vehicle cv values: %w", err)
	}
	defer func() { _ = rows.Close() }()

	out := []VehicleCVValue{}
	for rows.Next() {
		var item VehicleCVValue
		if err := rows.Scan(
			&item.ID,
			&item.VehicleID,
			&item.CVNumber,
			&item.Value,
			&item.Description,
			&item.Category,
			&item.DecoderProfile,
			&item.SourceFileID,
			&item.CreatedAt,
			&item.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan vehicle cv value: %w", err)
		}
		out = append(out, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate vehicle cv values: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close vehicle cv values: %w", err)
	}
	for index := range out {
		history, err := s.loadVehicleCVValueHistory(ctx, out[index].ID)
		if err != nil {
			return nil, err
		}
		out[index].History = history
	}
	return out, nil
}

func (s *VehicleService) loadVehicleCVValueHistory(ctx context.Context, cvValueID string) ([]VehicleCVValueHistory, error) {
	rows, err := s.db.QueryContext(ctx, `
SELECT id, cv_value_id, vehicle_id, old_value, new_value, changed_at
FROM vehicle_cv_value_history
WHERE cv_value_id=?
ORDER BY changed_at DESC
`, strings.TrimSpace(cvValueID))
	if err != nil {
		return nil, fmt.Errorf("list vehicle cv value history: %w", err)
	}
	defer func() { _ = rows.Close() }()

	out := []VehicleCVValueHistory{}
	for rows.Next() {
		var item VehicleCVValueHistory
		if err := rows.Scan(
			&item.ID,
			&item.CVValueID,
			&item.VehicleID,
			&item.OldValue,
			&item.NewValue,
			&item.ChangedAt,
		); err != nil {
			return nil, fmt.Errorf("scan vehicle cv value history: %w", err)
		}
		out = append(out, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate vehicle cv value history: %w", err)
	}
	return out, nil
}

func (s *VehicleService) ListCVFiles(ctx context.Context, vehicleID string) ([]VehicleCVFile, error) {
	vehicleID = strings.TrimSpace(vehicleID)
	if vehicleID == "" {
		return nil, ErrVehicleNotFound
	}
	if _, err := s.Get(ctx, vehicleID); err != nil {
		return nil, err
	}
	return s.loadVehicleCVFiles(ctx, vehicleID)
}

func (s *VehicleService) CreateCVFile(ctx context.Context, vehicleID string, input VehicleCVFileInput) (*VehicleCVFile, error) {
	vehicleID = strings.TrimSpace(vehicleID)
	input = cleanVehicleCVFileInput(input)
	if vehicleID == "" || input.FileName == "" || input.OriginalName == "" || input.StoragePath == "" {
		return nil, ErrVehicleValidation
	}
	if _, err := s.Get(ctx, vehicleID); err != nil {
		return nil, err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	file := VehicleCVFile{
		ID:             randomID(),
		VehicleID:      vehicleID,
		FileName:       input.FileName,
		OriginalName:   input.OriginalName,
		Description:    input.Description,
		DecoderProfile: input.DecoderProfile,
		MimeType:       input.MimeType,
		SizeBytes:      input.SizeBytes,
		StoragePath:    input.StoragePath,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	if _, err := s.db.ExecContext(ctx, `
INSERT INTO vehicle_cv_files(id, vehicle_id, file_name, original_name, description, decoder_profile, mime_type, size_bytes, storage_path, created_at, updated_at)
VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`, file.ID, file.VehicleID, file.FileName, file.OriginalName, file.Description, file.DecoderProfile, file.MimeType, file.SizeBytes, file.StoragePath, file.CreatedAt, file.UpdatedAt); err != nil {
		return nil, fmt.Errorf("create vehicle cv file: %w", err)
	}
	return &file, nil
}

func (s *VehicleService) GetCVFile(ctx context.Context, vehicleID, fileID string) (*VehicleCVFile, error) {
	var file VehicleCVFile
	err := s.db.QueryRowContext(ctx, `
SELECT id, vehicle_id, file_name, original_name, COALESCE(description, ''), COALESCE(decoder_profile, ''),
       COALESCE(mime_type, ''), size_bytes, storage_path, created_at, updated_at
FROM vehicle_cv_files
WHERE id=? AND vehicle_id=?
`, strings.TrimSpace(fileID), strings.TrimSpace(vehicleID)).Scan(
		&file.ID,
		&file.VehicleID,
		&file.FileName,
		&file.OriginalName,
		&file.Description,
		&file.DecoderProfile,
		&file.MimeType,
		&file.SizeBytes,
		&file.StoragePath,
		&file.CreatedAt,
		&file.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrVehicleNotFound
		}
		return nil, fmt.Errorf("get vehicle cv file: %w", err)
	}
	return &file, nil
}

func (s *VehicleService) DeleteCVFile(ctx context.Context, vehicleID, fileID string) (*VehicleCVFile, error) {
	file, err := s.GetCVFile(ctx, vehicleID, fileID)
	if err != nil {
		return nil, err
	}
	result, err := s.db.ExecContext(ctx, `DELETE FROM vehicle_cv_files WHERE id=? AND vehicle_id=?`, strings.TrimSpace(fileID), strings.TrimSpace(vehicleID))
	if err != nil {
		return nil, fmt.Errorf("delete vehicle cv file: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return nil, fmt.Errorf("read vehicle cv file delete result: %w", err)
	}
	if affected == 0 {
		return nil, ErrVehicleNotFound
	}
	return file, nil
}

func (s *VehicleService) loadVehicleCVFiles(ctx context.Context, vehicleID string) ([]VehicleCVFile, error) {
	rows, err := s.db.QueryContext(ctx, `
SELECT id, vehicle_id, file_name, original_name, COALESCE(description, ''), COALESCE(decoder_profile, ''),
       COALESCE(mime_type, ''), size_bytes, storage_path, created_at, updated_at
FROM vehicle_cv_files
WHERE vehicle_id=?
ORDER BY created_at ASC
`, strings.TrimSpace(vehicleID))
	if err != nil {
		return nil, fmt.Errorf("list vehicle cv files: %w", err)
	}
	defer func() { _ = rows.Close() }()

	out := []VehicleCVFile{}
	for rows.Next() {
		var file VehicleCVFile
		if err := rows.Scan(
			&file.ID,
			&file.VehicleID,
			&file.FileName,
			&file.OriginalName,
			&file.Description,
			&file.DecoderProfile,
			&file.MimeType,
			&file.SizeBytes,
			&file.StoragePath,
			&file.CreatedAt,
			&file.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan vehicle cv file: %w", err)
		}
		out = append(out, file)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate vehicle cv files: %w", err)
	}
	return out, nil
}

func saveVehicleImages(ctx context.Context, tx *sql.Tx, vehicleID string, images []VehicleImageInput, now string) error {
	existing, err := existingVehicleImageMeta(ctx, tx, vehicleID)
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM vehicle_images WHERE vehicle_id=?`, vehicleID); err != nil {
		return fmt.Errorf("clear vehicle images: %w", err)
	}
	cleaned := cleanVehicleImageInputs(images)
	for index, image := range cleaned {
		image.MaintenanceID = strings.TrimSpace(image.MaintenanceID)
		if err := ensureVehicleMaintenanceID(ctx, tx, vehicleID, image.MaintenanceID); err != nil {
			return err
		}
		meta, hasMeta := existing[image.ID]
		if !hasMeta {
			meta = existing[image.URL]
		}
		imageID := randomID()
		createdAt := now
		if hasMeta || meta.ID != "" {
			imageID = meta.ID
			createdAt = meta.CreatedAt
			image.FileName = meta.FileName
			image.MimeType = meta.MimeType
			image.StoragePath = meta.StoragePath
			image.ThumbnailPath = meta.ThumbnailPath
		}
		sortOrder := image.SortOrder
		if sortOrder == 0 {
			sortOrder = index
		}
		imageURL := image.URL
		if image.StoragePath != "" {
			imageURL = "/api/v1/vehicles/" + vehicleID + "/images/" + imageID + "/file"
		}
		if _, err := tx.ExecContext(ctx, `
INSERT INTO vehicle_images(id, vehicle_id, url, title, source_url, file_name, mime_type, storage_path, thumbnail_path, maintenance_id, is_primary, sort_order, created_at, updated_at)
VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`, imageID, vehicleID, imageURL, image.Title, image.SourceURL, image.FileName, image.MimeType, image.StoragePath, image.ThumbnailPath, image.MaintenanceID, boolToInt(image.IsPrimary), sortOrder, createdAt, now); err != nil {
			return fmt.Errorf("insert vehicle image: %w", err)
		}
	}
	return nil
}

type queryRower interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func ensureVehicleMaintenanceID(ctx context.Context, query queryRower, vehicleID, maintenanceID string) error {
	maintenanceID = strings.TrimSpace(maintenanceID)
	if maintenanceID == "" {
		return nil
	}
	var count int
	if err := query.QueryRowContext(ctx, `SELECT COUNT(*) FROM vehicle_maintenance WHERE id=? AND vehicle_id=?`, maintenanceID, vehicleID).Scan(&count); err != nil {
		return fmt.Errorf("validate vehicle maintenance link: %w", err)
	}
	if count == 0 {
		return ErrVehicleValidation
	}
	return nil
}

type vehicleImageMeta struct {
	ID            string
	URL           string
	FileName      string
	MimeType      string
	StoragePath   string
	ThumbnailPath string
	MaintenanceID string
	CreatedAt     string
}

func existingVehicleImageMeta(ctx context.Context, tx *sql.Tx, vehicleID string) (map[string]vehicleImageMeta, error) {
	rows, err := tx.QueryContext(ctx, `
SELECT id, url, COALESCE(file_name, ''), COALESCE(mime_type, ''), COALESCE(storage_path, ''), COALESCE(thumbnail_path, ''), COALESCE(maintenance_id, ''), created_at
FROM vehicle_images
WHERE vehicle_id=?
`, vehicleID)
	if err != nil {
		return nil, fmt.Errorf("list existing vehicle image metadata: %w", err)
	}
	defer func() { _ = rows.Close() }()
	out := map[string]vehicleImageMeta{}
	for rows.Next() {
		var meta vehicleImageMeta
		if err := rows.Scan(&meta.ID, &meta.URL, &meta.FileName, &meta.MimeType, &meta.StoragePath, &meta.ThumbnailPath, &meta.MaintenanceID, &meta.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan existing vehicle image metadata: %w", err)
		}
		out[meta.ID] = meta
		out[meta.URL] = meta
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate existing vehicle image metadata: %w", err)
	}
	return out, nil
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
		image = cleanVehicleImageInput(image)
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

func cleanVehicleImageInput(image VehicleImageInput) VehicleImageInput {
	image.ID = strings.TrimSpace(image.ID)
	image.URL = strings.TrimSpace(image.URL)
	image.Title = strings.TrimSpace(image.Title)
	image.SourceURL = strings.TrimSpace(image.SourceURL)
	image.FileName = strings.TrimSpace(image.FileName)
	image.MimeType = strings.TrimSpace(image.MimeType)
	image.StoragePath = strings.TrimSpace(image.StoragePath)
	image.ThumbnailPath = strings.TrimSpace(image.ThumbnailPath)
	image.MaintenanceID = strings.TrimSpace(image.MaintenanceID)
	return image
}

func cleanVehicleAttachmentInput(input VehicleAttachmentInput) VehicleAttachmentInput {
	input.FileName = strings.TrimSpace(input.FileName)
	input.OriginalName = strings.TrimSpace(input.OriginalName)
	input.Description = strings.TrimSpace(input.Description)
	input.Category = strings.TrimSpace(input.Category)
	input.MimeType = strings.TrimSpace(input.MimeType)
	input.StoragePath = strings.TrimSpace(input.StoragePath)
	input.MaintenanceID = strings.TrimSpace(input.MaintenanceID)
	return input
}

func cleanVehicleMaintenanceInput(input VehicleMaintenanceInput) VehicleMaintenanceInput {
	input.Kind = strings.TrimSpace(input.Kind)
	input.Status = normalizeMaintenanceStatus(input.Status)
	input.ConditionRating = strings.TrimSpace(input.ConditionRating)
	input.DueDate = strings.TrimSpace(input.DueDate)
	input.CompletedAt = strings.TrimSpace(input.CompletedAt)
	input.Cost = cleanMaintenanceCost(input.Cost)
	input.Notes = strings.TrimSpace(input.Notes)
	if input.Kind == "" {
		input.Kind = "Wartung"
	}
	if input.Status == "" {
		input.Status = "geplant"
	}
	return input
}

func normalizeMaintenanceStatus(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	switch value {
	case "fällig", "faellig":
		return "faellig"
	case "erledigt":
		return "erledigt"
	case "geplant", "":
		return value
	default:
		return value
	}
}

func cleanMaintenanceCost(value string) string {
	value = strings.TrimSpace(value)
	value = strings.TrimSuffix(value, "€")
	value = strings.TrimSpace(value)
	value = strings.ReplaceAll(value, " ", "")
	return value
}

func isValidVehicleMaintenanceInput(input VehicleMaintenanceInput) bool {
	if _, ok := allowedMaintenanceKinds[input.Kind]; !ok {
		return false
	}
	if _, ok := allowedMaintenanceStatuses[input.Status]; !ok {
		return false
	}
	if input.ConditionRating != "" {
		if _, ok := allowedConditionRatings[input.ConditionRating]; !ok {
			return false
		}
	}
	return isValidDateOnly(input.DueDate) &&
		isValidDateOnly(input.CompletedAt) &&
		isValidMaintenanceCost(input.Cost) &&
		len(input.Notes) <= 4000
}

func isValidDateOnly(value string) bool {
	if value == "" {
		return true
	}
	parsed, err := time.Parse("2006-01-02", value)
	return err == nil && parsed.Format("2006-01-02") == value
}

func isValidMaintenanceCost(value string) bool {
	if value == "" {
		return true
	}
	normalized := strings.ReplaceAll(value, ",", ".")
	amount, err := strconv.ParseFloat(normalized, 64)
	return err == nil && amount >= 0
}

func cleanVehicleFunctionInput(input VehicleFunctionInput) VehicleFunctionInput {
	input.Name = strings.TrimSpace(input.Name)
	input.SymbolKey = strings.TrimSpace(input.SymbolKey)
	input.FunctionType = strings.ToLower(strings.TrimSpace(input.FunctionType))
	input.Mode = strings.ToLower(strings.TrimSpace(input.Mode))
	input.Notes = strings.TrimSpace(input.Notes)
	if input.FunctionType == "" {
		input.FunctionType = "standard"
	}
	if input.Mode == "" {
		input.Mode = "dauer"
	}
	return input
}

func isValidVehicleFunctionInput(input VehicleFunctionInput) bool {
	if _, ok := allowedFunctionTypes[input.FunctionType]; !ok {
		return false
	}
	if _, ok := allowedFunctionModes[input.Mode]; !ok {
		return false
	}
	return len(input.Name) <= 120 &&
		len(input.SymbolKey) <= 80 &&
		len(input.Notes) <= 1000
}

func cleanVehicleCVValueInput(input VehicleCVValueInput) VehicleCVValueInput {
	input.Description = strings.TrimSpace(input.Description)
	input.Category = strings.TrimSpace(input.Category)
	input.DecoderProfile = strings.TrimSpace(input.DecoderProfile)
	input.SourceFileID = strings.TrimSpace(input.SourceFileID)
	return input
}

func isValidVehicleCVValueInput(input VehicleCVValueInput) bool {
	return validCVNumber(input.CVNumber) &&
		validCVValue(input.Value) &&
		len(input.Description) <= 1000 &&
		len(input.Category) <= 80 &&
		len(input.DecoderProfile) <= 160 &&
		len(input.SourceFileID) <= 80
}

func cleanVehicleCVFileInput(input VehicleCVFileInput) VehicleCVFileInput {
	input.FileName = strings.TrimSpace(input.FileName)
	input.OriginalName = strings.TrimSpace(input.OriginalName)
	input.Description = strings.TrimSpace(input.Description)
	input.DecoderProfile = strings.TrimSpace(input.DecoderProfile)
	input.MimeType = strings.TrimSpace(input.MimeType)
	input.StoragePath = strings.TrimSpace(input.StoragePath)
	return input
}

func normalizeFunctionKey(value string) string {
	value = strings.ToUpper(strings.TrimSpace(value))
	if !strings.HasPrefix(value, "F") {
		return value
	}
	number, err := strconv.Atoi(strings.TrimPrefix(value, "F"))
	if err != nil {
		return value
	}
	return fmt.Sprintf("F%d", number)
}

func validFunctionKey(value string) bool {
	value = normalizeFunctionKey(value)
	if !strings.HasPrefix(value, "F") {
		return false
	}
	number, err := strconv.Atoi(strings.TrimPrefix(value, "F"))
	return err == nil && number >= 0 && number <= 31
}

func functionSortOrder(value string) int {
	number, err := strconv.Atoi(strings.TrimPrefix(normalizeFunctionKey(value), "F"))
	if err != nil {
		return 999
	}
	return number
}

func validCVNumber(value int) bool {
	return value >= 1 && value <= 1024
}

func validCVValue(value int) bool {
	return value >= 0 && value <= 255
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
			ID:            image.ID,
			VehicleID:     vehicleID,
			URL:           image.URL,
			Title:         image.Title,
			SourceURL:     image.SourceURL,
			FileName:      image.FileName,
			MimeType:      image.MimeType,
			StoragePath:   image.StoragePath,
			ThumbnailPath: image.ThumbnailPath,
			MaintenanceID: image.MaintenanceID,
			IsPrimary:     image.IsPrimary,
			SortOrder:     sortOrder,
			CreatedAt:     now,
		})
	}
	return out
}

func withVehicleImageURLs(image VehicleImage) VehicleImage {
	if image.StoragePath != "" {
		image.URL = "/api/v1/vehicles/" + image.VehicleID + "/images/" + image.ID + "/file"
	}
	if image.ThumbnailPath != "" {
		image.ThumbnailURL = "/api/v1/vehicles/" + image.VehicleID + "/images/" + image.ID + "/thumbnail"
	}
	return image
}
