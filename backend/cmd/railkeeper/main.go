package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"railkeeper2/backend/internal/api"
	"railkeeper2/backend/internal/application"
	"railkeeper2/backend/internal/infrastructure"
)

const (
	version               = "0.1.6"
	defaultUpdateCheckURL = "https://api.github.com/repos/ichwars/RailKeeper2/releases/latest"
)

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
	maxImageBytes := envMegabytes("RAILKEEPER_MAX_IMAGE_MB", 10)
	maxAttachmentBytes := envMegabytes("RAILKEEPER_MAX_ATTACHMENT_MB", 25)
	allowedAttachmentExtensions := envExtensionSet("RAILKEEPER_ALLOWED_ATTACHMENT_EXTENSIONS")
	updateCheckURL := env("RAILKEEPER_UPDATE_CHECK_URL", defaultUpdateCheckURL)

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
		Version:                     version,
		UpdateCheckURL:              updateCheckURL,
		StaticDir:                   staticDir,
		DataDir:                     dataDir,
		MaxImageBytes:               maxImageBytes,
		MaxAttachmentBytes:          maxAttachmentBytes,
		AllowedAttachmentExtensions: allowedAttachmentExtensions,
		Logger:                      logger,
		SetupService:                application.NewSetupService(db),
		AuthService:                 application.NewAuthService(db),
		VehicleService:              application.NewVehicleService(db),
		MasterDataService:           masterDataService,
		ArticleSearch:               application.NewArticleSearchService(),
		InventoryNumbers:            application.NewInventoryNumberService(db),
		BackupService:               application.NewBackupService(db, dataDir),
		ExhibitionService:           application.NewExhibitionService(db),
		ECoSService:                 application.NewECoSService(),
		RateLimitService:            application.NewRateLimitService(db),
		CookieSecure:                cookieSecure,
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

func envMegabytes(key string, fallback int64) int64 {
	value := env(key, "")
	if value == "" {
		return fallback * 1024 * 1024
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil || parsed <= 0 {
		return fallback * 1024 * 1024
	}
	return parsed * 1024 * 1024
}

func envExtensionSet(key string) map[string]struct{} {
	value := env(key, "")
	if value == "" {
		return nil
	}
	out := map[string]struct{}{}
	for _, part := range strings.Split(value, ",") {
		extension := strings.ToLower(strings.TrimSpace(part))
		if extension == "" {
			continue
		}
		if !strings.HasPrefix(extension, ".") {
			extension = "." + extension
		}
		out[extension] = struct{}{}
	}
	return out
}
