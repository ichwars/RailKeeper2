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
		InventoryNumber: created.InventoryNumber,
		Manufacturer:    "Piko",
		ArticleNumber:   "52700",
		Name:            "BR 118 DR",
		Gauge:           "H0",
		Epoch:           "IV",
		Gattung:         "Diesellok",
	}, "actor-1")
	if err != nil {
		t.Fatal(err)
	}
	if updated.Name != "BR 118 DR" || updated.ArticleNumber != "52700" || updated.Epoch != "IV" || updated.Gattung != "Diesellok" {
		t.Fatalf("unexpected update: %#v", updated)
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
