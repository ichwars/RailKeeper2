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
