package main

import (
	"log/slog"
	"net/http"
	"os"
	"time"

	"railkeeper2/backend/internal/api"
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
	staticDir := env("RAILKEEPER_STATIC_DIR", "../../frontend/dist")

	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	handler := api.NewRouter(api.Config{
		Version:   version,
		StaticDir: staticDir,
		Logger:    logger,
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
