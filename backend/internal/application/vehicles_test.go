package application_test

import (
	"context"
	"errors"
	"testing"

	"railkeeper2/backend/internal/application"
)

func TestCreateVehicleAssignsInventoryNumber(t *testing.T) {
	db := testDB(t)
	service := application.NewVehicleService(db)

	vehicle, err := service.Create(context.Background(), application.CreateVehicleInput{
		Manufacturer: "Piko",
		Name:         "BR 118",
		Gauge:        "H0",
	}, "actor-1")
	if err != nil {
		t.Fatal(err)
	}
	if vehicle.InventoryNumber != "RK-FAH-000001" {
		t.Fatalf("unexpected inventory number %q", vehicle.InventoryNumber)
	}
}

func TestCreateVehicleUsesCategoryInventoryNumberScheme(t *testing.T) {
	db := testDB(t)
	service := application.NewVehicleService(db)

	vehicle, err := service.Create(context.Background(), application.CreateVehicleInput{
		Manufacturer: "Piko",
		Name:         "BR 118",
		Gauge:        "H0",
		Category:     "Lokomotive",
	}, "actor-1")
	if err != nil {
		t.Fatal(err)
	}
	if vehicle.InventoryNumber != "RK-LOK-000001" {
		t.Fatalf("unexpected inventory number %q", vehicle.InventoryNumber)
	}
}

func TestCreateVehicleDoesNotUseAccessoryInventoryNumberScheme(t *testing.T) {
	db := testDB(t)
	service := application.NewVehicleService(db)

	vehicle, err := service.Create(context.Background(), application.CreateVehicleInput{
		Manufacturer: "Piko",
		Name:         "Kiste",
		Gauge:        "H0",
		Category:     "Zubehör",
	}, "actor-1")
	if err != nil {
		t.Fatal(err)
	}
	if vehicle.InventoryNumber != "RK-FAH-000001" {
		t.Fatalf("accessory-like category should fall back to vehicle scheme, got %q", vehicle.InventoryNumber)
	}
}

func TestCreateVehicleRejectsDuplicateManualInventoryNumber(t *testing.T) {
	db := testDB(t)
	service := application.NewVehicleService(db)
	ctx := context.Background()

	_, err := service.Create(ctx, application.CreateVehicleInput{
		InventoryNumber: "RK-MAN-000001",
		Manufacturer:    "Piko",
		Name:            "BR 118",
		Gauge:           "H0",
	}, "actor-1")
	if err != nil {
		t.Fatal(err)
	}
	_, err = service.Create(ctx, application.CreateVehicleInput{
		InventoryNumber: "RK-MAN-000001",
		Manufacturer:    "Roco",
		Name:            "V 200",
		Gauge:           "H0",
	}, "actor-1")
	if !errors.Is(err, application.ErrInventoryNumberConflict) {
		t.Fatalf("expected inventory number conflict, got %v", err)
	}
}

func TestCreateVehicleValidatesRequiredFields(t *testing.T) {
	db := testDB(t)
	service := application.NewVehicleService(db)

	_, err := service.Create(context.Background(), application.CreateVehicleInput{
		Manufacturer: "Piko",
		Name:         "",
		Gauge:        "H0",
	}, "actor-1")
	if !errors.Is(err, application.ErrVehicleValidation) {
		t.Fatalf("expected validation error, got %v", err)
	}
}

func TestListVehiclesFiltersByQuery(t *testing.T) {
	db := testDB(t)
	service := application.NewVehicleService(db)
	ctx := context.Background()

	_, err := service.Create(ctx, application.CreateVehicleInput{
		Manufacturer:  "Piko",
		ArticleNumber: "4711",
		Name:          "BR 118",
		Gauge:         "H0",
	}, "actor-1")
	if err != nil {
		t.Fatal(err)
	}
	_, err = service.Create(ctx, application.CreateVehicleInput{
		Manufacturer:  "Roco",
		ArticleNumber: "1234",
		Name:          "V 200",
		Gauge:         "H0",
	}, "actor-1")
	if err != nil {
		t.Fatal(err)
	}

	vehicles, err := service.List(ctx, "4711")
	if err != nil {
		t.Fatal(err)
	}
	if len(vehicles) != 1 || vehicles[0].ArticleNumber != "4711" {
		t.Fatalf("unexpected filter result: %#v", vehicles)
	}
}

func TestGetVehicleReturnsDetail(t *testing.T) {
	db := testDB(t)
	service := application.NewVehicleService(db)
	ctx := context.Background()

	created, err := service.Create(ctx, application.CreateVehicleInput{
		Manufacturer: "Piko",
		Name:         "BR 118",
		Gauge:        "H0",
	}, "actor-1")
	if err != nil {
		t.Fatal(err)
	}

	vehicle, err := service.Get(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if vehicle.ID != created.ID || vehicle.Name != "BR 118" {
		t.Fatalf("unexpected detail: %#v", vehicle)
	}
}

func TestUpdateVehicleChangesFields(t *testing.T) {
	db := testDB(t)
	service := application.NewVehicleService(db)
	ctx := context.Background()

	created, err := service.Create(ctx, application.CreateVehicleInput{
		Manufacturer: "Piko",
		Name:         "BR 118",
		Gauge:        "H0",
	}, "actor-1")
	if err != nil {
		t.Fatal(err)
	}

	updated, err := service.Update(ctx, created.ID, application.CreateVehicleInput{
		InventoryNumber:       created.InventoryNumber,
		Manufacturer:          "Piko",
		ArticleNumber:         "52700",
		ArticleSourceURL:      "https://example.test/article",
		Name:                  "BR 118 DR",
		Gauge:                 "H0",
		Epoch:                 "IV",
		Gattung:               "Diesellok",
		Description:           "Testbeschreibung",
		Series:                "118",
		VehicleNumber:         "118 552-9",
		Digital:               true,
		DigitalDecoderNumber:  "1234",
		ExhibitionReady:       true,
		ABCBrakes:             true,
		EAN:                   "4015615527000",
		ProductionPeriod:      "1998-2001",
		ListPrice:             "129.90",
		LengthMM:              "183",
		WeightG:               "420",
		Color:                 "rot",
		CouplingSame:          true,
		CouplingFront:         "Kurzkupplung",
		DriveEnabled:          true,
		DriveDescription:      "Kardan",
		HeadlightsEnabled:     true,
		HeadlightsDescription: "wechselnd",
		AdditionalInfo:        "Testnotiz",
		QRCodeEnabled:         true,
	}, "actor-1")
	if err != nil {
		t.Fatal(err)
	}
	if updated.Name != "BR 118 DR" || updated.ArticleNumber != "52700" || updated.ArticleSourceURL != "https://example.test/article" || updated.Epoch != "IV" || updated.Gattung != "Diesellok" {
		t.Fatalf("unexpected update: %#v", updated)
	}
	if !updated.Digital || !updated.ExhibitionReady || !updated.ABCBrakes || updated.Series != "118" || updated.ListPrice != "129.90" {
		t.Fatalf("unexpected update: %#v", updated)
	}
	if !updated.CouplingSame || updated.CouplingRear != "Kurzkupplung" || !updated.DriveEnabled || updated.DriveDescription != "Kardan" || !updated.QRCodeEnabled {
		t.Fatalf("unexpected technical details: %#v", updated)
	}
}

func TestUpdateVehicleRecordsInventoryNumberHistory(t *testing.T) {
	db := testDB(t)
	service := application.NewVehicleService(db)
	ctx := context.Background()

	created, err := service.Create(ctx, application.CreateVehicleInput{
		Manufacturer: "Piko",
		Name:         "BR 118",
		Gauge:        "H0",
	}, "actor-1")
	if err != nil {
		t.Fatal(err)
	}

	updated, err := service.Update(ctx, created.ID, application.CreateVehicleInput{
		InventoryNumber: "RK-LOK-999999",
		Manufacturer:    "Piko",
		Name:            "BR 118",
		Gauge:           "H0",
	}, "actor-2")
	if err != nil {
		t.Fatal(err)
	}
	if updated.InventoryNumber != "RK-LOK-999999" {
		t.Fatalf("unexpected inventory number %q", updated.InventoryNumber)
	}

	var historyCount int
	if err := db.QueryRow(`SELECT COUNT(*) FROM inventory_number_history WHERE vehicle_id=? AND old_number=? AND new_number=?`, created.ID, created.InventoryNumber, "RK-LOK-999999").Scan(&historyCount); err != nil {
		t.Fatal(err)
	}
	if historyCount != 1 {
		t.Fatalf("expected one history entry, got %d", historyCount)
	}
}

func TestVehiclePersistsImages(t *testing.T) {
	db := testDB(t)
	service := application.NewVehicleService(db)
	ctx := context.Background()

	created, err := service.Create(ctx, application.CreateVehicleInput{
		Manufacturer: "Piko",
		Name:         "BR 118",
		Gauge:        "TT",
		Images: []application.VehicleImageInput{
			{URL: "https://example.test/side.jpg", Title: "Seite"},
			{URL: "https://example.test/front.jpg", Title: "Front", IsPrimary: true},
		},
	}, "actor-1")
	if err != nil {
		t.Fatal(err)
	}
	if len(created.Images) != 2 || created.Images[0].URL != "https://example.test/front.jpg" || !created.Images[0].IsPrimary {
		t.Fatalf("unexpected created images: %#v", created.Images)
	}

	detail, err := service.Get(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(detail.Images) != 2 || detail.Images[0].URL != "https://example.test/front.jpg" || !detail.Images[0].IsPrimary {
		t.Fatalf("unexpected detail images: %#v", detail.Images)
	}

	updated, err := service.Update(ctx, created.ID, application.CreateVehicleInput{
		InventoryNumber: created.InventoryNumber,
		Manufacturer:    "Piko",
		Name:            "BR 118",
		Gauge:           "TT",
		Images: []application.VehicleImageInput{
			{URL: "https://example.test/new.jpg", Title: "Neu"},
		},
	}, "actor-1")
	if err != nil {
		t.Fatal(err)
	}
	if len(updated.Images) != 1 || updated.Images[0].URL != "https://example.test/new.jpg" || !updated.Images[0].IsPrimary {
		t.Fatalf("unexpected updated images: %#v", updated.Images)
	}
}

func TestVehicleCreatesAndDeletesLocalImages(t *testing.T) {
	db := testDB(t)
	service := application.NewVehicleService(db)
	ctx := context.Background()

	created, err := service.Create(ctx, application.CreateVehicleInput{
		Manufacturer: "Piko",
		Name:         "BR 118",
		Gauge:        "TT",
	}, "actor-1")
	if err != nil {
		t.Fatal(err)
	}

	image, err := service.CreateImage(ctx, created.ID, application.VehicleImageInput{
		Title:       "Seitenansicht",
		FileName:    "side.webp",
		MimeType:    "image/webp",
		StoragePath: "uploads/vehicles/test/images/side.webp",
	})
	if err != nil {
		t.Fatal(err)
	}
	if image.URL == "" || !image.IsPrimary || image.StoragePath == "" {
		t.Fatalf("unexpected local image: %#v", image)
	}

	detail, err := service.Get(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(detail.Images) != 1 || detail.Images[0].ID != image.ID || detail.Images[0].MimeType != "image/webp" {
		t.Fatalf("local image not attached to detail: %#v", detail.Images)
	}

	deleted, err := service.DeleteImage(ctx, created.ID, image.ID)
	if err != nil {
		t.Fatal(err)
	}
	if deleted.StoragePath == "" {
		t.Fatal("deleted image should return storage path for file cleanup")
	}
}

func TestVehiclePersistsAttachments(t *testing.T) {
	db := testDB(t)
	service := application.NewVehicleService(db)
	ctx := context.Background()

	created, err := service.Create(ctx, application.CreateVehicleInput{
		Manufacturer: "Piko",
		Name:         "BR 118",
		Gauge:        "TT",
	}, "actor-1")
	if err != nil {
		t.Fatal(err)
	}

	attachment, err := service.CreateAttachment(ctx, created.ID, application.VehicleAttachmentInput{
		FileName:     "manual.pdf",
		OriginalName: "Anleitung.pdf",
		Description:  "Original Anleitung",
		Category:     "Anleitung",
		MimeType:     "application/pdf",
		SizeBytes:    1234,
		StoragePath:  "uploads/vehicles/test/manual.pdf",
	})
	if err != nil {
		t.Fatal(err)
	}
	if attachment.OriginalName != "Anleitung.pdf" || attachment.Category != "Anleitung" {
		t.Fatalf("unexpected attachment: %#v", attachment)
	}

	detail, err := service.Get(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(detail.Attachments) != 1 || detail.Attachments[0].Description != "Original Anleitung" {
		t.Fatalf("unexpected detail attachments: %#v", detail.Attachments)
	}

	updated, err := service.UpdateAttachment(ctx, created.ID, attachment.ID, application.VehicleAttachmentUpdateInput{
		Description: "Neue Bemerkung",
		Category:    "Dokumentation",
	})
	if err != nil {
		t.Fatal(err)
	}
	if updated.Description != "Neue Bemerkung" || updated.Category != "Dokumentation" {
		t.Fatalf("unexpected attachment update: %#v", updated)
	}

	deleted, err := service.DeleteAttachment(ctx, created.ID, attachment.ID)
	if err != nil {
		t.Fatal(err)
	}
	if deleted.StoragePath == "" {
		t.Fatal("deleted attachment should return storage path for file cleanup")
	}
}

func TestVehiclePersistsMaintenance(t *testing.T) {
	db := testDB(t)
	service := application.NewVehicleService(db)
	ctx := context.Background()

	created, err := service.Create(ctx, application.CreateVehicleInput{
		Manufacturer: "Piko",
		Name:         "BR 118",
		Gauge:        "TT",
	}, "actor-1")
	if err != nil {
		t.Fatal(err)
	}

	entry, err := service.CreateMaintenance(ctx, created.ID, application.VehicleMaintenanceInput{
		Kind:            "Schmierung",
		Status:          "geplant",
		ConditionRating: "gut",
		DueDate:         "2026-06-01",
		Cost:            "12,50",
		Notes:           "Getriebe pruefen",
	})
	if err != nil {
		t.Fatal(err)
	}
	if entry.Kind != "Schmierung" || entry.Status != "geplant" {
		t.Fatalf("unexpected maintenance entry: %#v", entry)
	}

	detail, err := service.Get(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(detail.Maintenance) != 1 || detail.Maintenance[0].Notes != "Getriebe pruefen" {
		t.Fatalf("unexpected detail maintenance: %#v", detail.Maintenance)
	}

	updated, err := service.UpdateMaintenance(ctx, created.ID, entry.ID, application.VehicleMaintenanceInput{
		Kind:            "Schmierung",
		Status:          "erledigt",
		ConditionRating: "sehr gut",
		DueDate:         "2026-06-01",
		CompletedAt:     "2026-05-09",
		Cost:            "12,50",
		Notes:           "Erledigt",
	})
	if err != nil {
		t.Fatal(err)
	}
	if updated.Status != "erledigt" || updated.CompletedAt != "2026-05-09" {
		t.Fatalf("unexpected maintenance update: %#v", updated)
	}

	normalized, err := service.CreateMaintenance(ctx, created.ID, application.VehicleMaintenanceInput{
		Kind:    "Wartung",
		Status:  "fällig",
		DueDate: "2026-07-01",
		Cost:    "5,00 €",
	})
	if err != nil {
		t.Fatal(err)
	}
	if normalized.Status != "faellig" || normalized.Cost != "5,00" {
		t.Fatalf("expected normalized maintenance fields, got %#v", normalized)
	}

	if _, err := service.CreateMaintenance(ctx, created.ID, application.VehicleMaintenanceInput{
		Kind:    "Wartung",
		Status:  "geplant",
		DueDate: "01.07.2026",
	}); !errors.Is(err, application.ErrVehicleValidation) {
		t.Fatalf("expected invalid date to be rejected, got %v", err)
	}

	if _, err := service.DeleteMaintenance(ctx, created.ID, entry.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.DeleteMaintenance(ctx, created.ID, normalized.ID); err != nil {
		t.Fatal(err)
	}
	entries, err := service.ListMaintenance(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("expected maintenance deletion, got %#v", entries)
	}
}

func TestVehicleLinksMediaToMaintenance(t *testing.T) {
	db := testDB(t)
	service := application.NewVehicleService(db)
	ctx := context.Background()

	created, err := service.Create(ctx, application.CreateVehicleInput{
		Manufacturer: "Piko",
		Name:         "BR 118",
		Gauge:        "TT",
	}, "actor-1")
	if err != nil {
		t.Fatal(err)
	}
	entry, err := service.CreateMaintenance(ctx, created.ID, application.VehicleMaintenanceInput{
		Kind:    "Wartung",
		Status:  "geplant",
		DueDate: "2026-06-01",
	})
	if err != nil {
		t.Fatal(err)
	}

	image, err := service.CreateImage(ctx, created.ID, application.VehicleImageInput{
		Title:         "Wartungsbild",
		FileName:      "service.webp",
		MimeType:      "image/webp",
		StoragePath:   "uploads/vehicles/test/images/service.webp",
		MaintenanceID: entry.ID,
	})
	if err != nil {
		t.Fatal(err)
	}
	if image.MaintenanceID != entry.ID {
		t.Fatalf("expected image maintenance link, got %#v", image)
	}

	attachment, err := service.CreateAttachment(ctx, created.ID, application.VehicleAttachmentInput{
		FileName:      "invoice.pdf",
		OriginalName:  "Rechnung.pdf",
		Category:      "Rechnung",
		MimeType:      "application/pdf",
		SizeBytes:     123,
		StoragePath:   "uploads/vehicles/test/invoice.pdf",
		MaintenanceID: entry.ID,
	})
	if err != nil {
		t.Fatal(err)
	}
	if attachment.MaintenanceID != entry.ID {
		t.Fatalf("expected attachment maintenance link, got %#v", attachment)
	}

	detail, err := service.Get(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(detail.Images) != 1 || detail.Images[0].MaintenanceID != entry.ID {
		t.Fatalf("maintenance image link missing in detail: %#v", detail.Images)
	}
	if len(detail.Attachments) != 1 || detail.Attachments[0].MaintenanceID != entry.ID {
		t.Fatalf("maintenance attachment link missing in detail: %#v", detail.Attachments)
	}
	if _, err := service.CreateImage(ctx, created.ID, application.VehicleImageInput{
		Title:         "Falsch",
		FileName:      "invalid.webp",
		MimeType:      "image/webp",
		StoragePath:   "uploads/vehicles/test/images/invalid.webp",
		MaintenanceID: "missing",
	}); !errors.Is(err, application.ErrVehicleValidation) {
		t.Fatalf("expected invalid maintenance link to be rejected, got %v", err)
	}
	if _, err := service.DeleteImage(ctx, created.ID, image.ID); !errors.Is(err, application.ErrVehicleImageInUse) {
		t.Fatalf("expected linked image deletion to be blocked, got %v", err)
	}
	if _, err := service.Update(ctx, created.ID, application.CreateVehicleInput{
		InventoryNumber: created.InventoryNumber,
		Manufacturer:    "Piko",
		Name:            "BR 118",
		Gauge:           "TT",
		Images: []application.VehicleImageInput{
			{
				ID:        image.ID,
				URL:       image.URL,
				Title:     image.Title,
				IsPrimary: true,
			},
		},
	}, "actor-1"); err != nil {
		t.Fatal(err)
	}
	deleted, err := service.DeleteImage(ctx, created.ID, image.ID)
	if err != nil {
		t.Fatal(err)
	}
	if deleted.ID != image.ID {
		t.Fatalf("unexpected deleted image: %#v", deleted)
	}
}

func TestVehiclePersistsFunctions(t *testing.T) {
	db := testDB(t)
	service := application.NewVehicleService(db)
	ctx := context.Background()

	created, err := service.Create(ctx, application.CreateVehicleInput{
		Manufacturer: "Piko",
		Name:         "BR 118",
		Gauge:        "TT",
	}, "actor-1")
	if err != nil {
		t.Fatal(err)
	}

	function, err := service.UpsertFunction(ctx, created.ID, "F1", application.VehicleFunctionInput{
		Name:               "Sound",
		SymbolKey:          "sound",
		FunctionType:       "sound",
		Mode:               "moment",
		DirectionDependent: true,
		Notes:              "Lokpfeife",
	})
	if err != nil {
		t.Fatal(err)
	}
	if function.FunctionKey != "F1" || function.SymbolKey != "sound" || !function.DirectionDependent {
		t.Fatalf("unexpected function: %#v", function)
	}

	detail, err := service.Get(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(detail.Functions) != 1 || detail.Functions[0].Name != "Sound" {
		t.Fatalf("unexpected detail functions: %#v", detail.Functions)
	}

	updated, err := service.UpsertFunction(ctx, created.ID, "f1", application.VehicleFunctionInput{
		Name:         "Licht",
		SymbolKey:    "light",
		FunctionType: "licht",
		Mode:         "dauer",
	})
	if err != nil {
		t.Fatal(err)
	}
	if updated.FunctionKey != "F1" || updated.Name != "Licht" || updated.DirectionDependent {
		t.Fatalf("unexpected function update: %#v", updated)
	}

	normalized, err := service.UpsertFunction(ctx, created.ID, "F01", application.VehicleFunctionInput{
		Name:         "Rangiergang",
		FunctionType: "SOUND",
		Mode:         "MOMENT",
	})
	if err != nil {
		t.Fatal(err)
	}
	if normalized.FunctionKey != "F1" || normalized.FunctionType != "sound" || normalized.Mode != "moment" {
		t.Fatalf("expected normalized function fields, got %#v", normalized)
	}

	if _, err := service.UpsertFunction(ctx, created.ID, "F32", application.VehicleFunctionInput{}); !errors.Is(err, application.ErrVehicleValidation) {
		t.Fatalf("expected validation for invalid function key, got %v", err)
	}
	if _, err := service.UpsertFunction(ctx, created.ID, "F2", application.VehicleFunctionInput{
		FunctionType: "unknown",
		Mode:         "dauer",
	}); !errors.Is(err, application.ErrVehicleValidation) {
		t.Fatalf("expected validation for invalid function type, got %v", err)
	}

	if _, err := service.DeleteFunction(ctx, created.ID, "F1"); err != nil {
		t.Fatal(err)
	}
	functions, err := service.ListFunctions(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(functions) != 0 {
		t.Fatalf("expected function deletion, got %#v", functions)
	}
}

func TestVehiclePersistsCVValuesAndFiles(t *testing.T) {
	db := testDB(t)
	service := application.NewVehicleService(db)
	ctx := context.Background()

	created, err := service.Create(ctx, application.CreateVehicleInput{
		Manufacturer: "Piko",
		Name:         "BR 118",
		Gauge:        "TT",
	}, "actor-1")
	if err != nil {
		t.Fatal(err)
	}

	file, err := service.CreateCVFile(ctx, created.ID, application.VehicleCVFileInput{
		FileName:       "decoder.json",
		OriginalName:   "decoder.json",
		Description:    "Decoder Export",
		DecoderProfile: "ESU LokPilot",
		MimeType:       "application/json",
		SizeBytes:      42,
		StoragePath:    "uploads/vehicles/test/cv/decoder.json",
	})
	if err != nil {
		t.Fatal(err)
	}
	if file.DecoderProfile != "ESU LokPilot" || file.StoragePath == "" {
		t.Fatalf("unexpected cv file: %#v", file)
	}

	value, err := service.CreateCVValue(ctx, created.ID, application.VehicleCVValueInput{
		CVNumber:       1,
		Value:          3,
		Description:    "Adresse",
		Category:       "Adresse",
		DecoderProfile: "ESU LokPilot",
		SourceFileID:   file.ID,
	})
	if err != nil {
		t.Fatal(err)
	}
	if value.CVNumber != 1 || value.Value != 3 || value.SourceFileID != file.ID {
		t.Fatalf("unexpected cv value: %#v", value)
	}

	updated, err := service.UpdateCVValue(ctx, created.ID, value.ID, application.VehicleCVValueInput{
		CVNumber:       1,
		Value:          4,
		Description:    "Adresse geaendert",
		Category:       "Adresse",
		DecoderProfile: "ESU LokPilot",
		SourceFileID:   file.ID,
	})
	if err != nil {
		t.Fatal(err)
	}
	if updated.Value != 4 {
		t.Fatalf("unexpected cv update: %#v", updated)
	}
	if len(updated.History) != 1 || updated.History[0].OldValue != 3 || updated.History[0].NewValue != 4 {
		t.Fatalf("unexpected cv history: %#v", updated.History)
	}

	var historyCount int
	if err := db.QueryRow(`SELECT COUNT(*) FROM vehicle_cv_value_history WHERE cv_value_id=? AND old_value=3 AND new_value=4`, value.ID).Scan(&historyCount); err != nil {
		t.Fatal(err)
	}
	if historyCount != 1 {
		t.Fatalf("expected one cv history entry, got %d", historyCount)
	}

	if _, err := service.CreateCVValue(ctx, created.ID, application.VehicleCVValueInput{CVNumber: 0, Value: 1}); !errors.Is(err, application.ErrVehicleValidation) {
		t.Fatalf("expected validation for invalid cv number, got %v", err)
	}
	if _, err := service.CreateCVValue(ctx, created.ID, application.VehicleCVValueInput{CVNumber: 1, Value: 256}); !errors.Is(err, application.ErrVehicleValidation) {
		t.Fatalf("expected validation for invalid cv value, got %v", err)
	}
	if _, err := service.CreateCVValue(ctx, created.ID, application.VehicleCVValueInput{CVNumber: 2, Value: 1, SourceFileID: "missing"}); !errors.Is(err, application.ErrVehicleValidation) {
		t.Fatalf("expected validation for foreign cv source file, got %v", err)
	}

	detail, err := service.Get(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(detail.CVValues) != 1 || len(detail.CVFiles) != 1 {
		t.Fatalf("unexpected cv detail: values=%#v files=%#v", detail.CVValues, detail.CVFiles)
	}
}

func TestDeleteVehicleRemovesRecord(t *testing.T) {
	db := testDB(t)
	service := application.NewVehicleService(db)
	ctx := context.Background()

	created, err := service.Create(ctx, application.CreateVehicleInput{
		Manufacturer: "Piko",
		Name:         "BR 118",
		Gauge:        "H0",
	}, "actor-1")
	if err != nil {
		t.Fatal(err)
	}

	if err := service.Delete(ctx, created.ID, "actor-1"); err != nil {
		t.Fatal(err)
	}

	_, err = service.Get(ctx, created.ID)
	if !errors.Is(err, application.ErrVehicleNotFound) {
		t.Fatalf("expected not found after delete, got %v", err)
	}
}
