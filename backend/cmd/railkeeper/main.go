package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"time"

	"railkeeper2/backend/internal/api"
	"railkeeper2/backend/internal/application"
	"railkeeper2/backend/internal/infrastructure"
)

const version = "0.1.0-dev"

func main() {
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		resp, err := http.Get("http://127.0.0.1:8080/health")
		if err != nil || resp.StatusCode > http.StatusOK {
			os.Exit(1)
		}
		return
	}

	addr := env("RAILKEEPER_ADDR", ":8080")
	dataDir := env("RAILKEEPER_DATA_DIR", "./data")
	migrationsDir := env("RAILKEEPER_MIGRATIONS_DIR", "./migrations")
	seedsDir := env("RAILKEEPER_SEEDS_DIR", "./seeds")
	staticDir := env("RAILKEEPER_STATIC_DIR", "../../frontend/dist")
	cookieSecure := env("RAILKEEPER_COOKIE_SECURE", "false") == "true"

	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	db, err := infrastructure.OpenSQLite(dataDir)
	if err != nil {
		logger.Error("database open failed", "error", err)
		os.Exit(1)
	}
	defer func() { _ = db.Close() }()

	if err = infrastructure.Migrate(db, migrationsDir); err != nil {
		logger.Error("database migration failed", "error", err)
		os.Exit(1)
	}
	if err = infrastructure.SeedRoles(db); err != nil {
		logger.Error("role seed failed", "error", err)
		os.Exit(1)
	}
	if err = infrastructure.SeedMasterData(db, seedsDir); err != nil {
		logger.Error("master data seed failed", "error", err)
		os.Exit(1)
	}

	masterDataService := application.NewMasterDataService(db)
	if err = masterDataService.WarmCache(context.Background()); err != nil {
		logger.Error("master data cache warmup failed", "error", err)
		os.Exit(1)
	}

	handler := api.NewRouter(api.Config{
		Version:           version,
		StaticDir:         staticDir,
		DataDir:           dataDir,
		Logger:            logger,
		SetupService:      application.NewSetupService(db),
		AuthService:       application.NewAuthService(db),
		VehicleService:    application.NewVehicleService(db),
		MasterDataService: masterDataService,
		ArticleSearch:     application.NewArticleSearchService(),
		InventoryNumbers:  application.NewInventoryNumberService(db),
		BackupService:     application.NewBackupService(db, dataDir),
		CookieSecure:      cookieSecure,
	})

	server := &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}

	logger.Info("railkeeper2 started", "addr", addr, "version", version)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		logger.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

func env(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}
