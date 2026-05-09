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
	if len(created.Images) != 2 || !created.Images[1].IsPrimary {
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
