package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime"
	"net"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"railkeeper2/backend/internal/application"
)

type Config struct {
	Version           string
	StaticDir         string
	DataDir           string
	Logger            *slog.Logger
	SetupService      *application.SetupService
	AuthService       *application.AuthService
	VehicleService    *application.VehicleService
	MasterDataService *application.MasterDataService
	ArticleSearch     *application.ArticleSearchService
	InventoryNumbers  *application.InventoryNumberService
	CookieSecure      bool
}

type App struct {
	version           string
	staticDir         string
	dataDir           string
	logger            *slog.Logger
	setupService      *application.SetupService
	authService       *application.AuthService
	vehicleService    *application.VehicleService
	masterDataService *application.MasterDataService
	articleSearch     *application.ArticleSearchService
	inventoryNumbers  *application.InventoryNumberService
	cookieSecure      bool
	rateLimits        *rateLimiter
}

func NewRouter(config Config) http.Handler {
	if config.Logger == nil {
		config.Logger = slog.Default()
	}
	if config.DataDir == "" {
		config.DataDir = "./data"
	}
	app := &App{
		version:           config.Version,
		staticDir:         config.StaticDir,
		dataDir:           config.DataDir,
		logger:            config.Logger,
		setupService:      config.SetupService,
		authService:       config.AuthService,
		vehicleService:    config.VehicleService,
		masterDataService: config.MasterDataService,
		articleSearch:     config.ArticleSearch,
		inventoryNumbers:  config.InventoryNumbers,
		cookieSecure:      config.CookieSecure,
		rateLimits:        newRateLimiter(),
	}
	if app.articleSearch == nil {
		app.articleSearch = application.NewArticleSearchService()
	}

	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	mux.HandleFunc("GET /api/v1/version", func(w http.ResponseWriter, r *http.Request) {
		respondJSON(w, http.StatusOK, map[string]string{"version": app.version})
	})

	mux.HandleFunc("GET /api/v1/setup/status", app.setupStatus)
	mux.HandleFunc("POST /api/v1/setup/admin", app.createAdmin)
	mux.HandleFunc("POST /api/v1/auth/login", app.login)
	mux.HandleFunc("POST /api/v1/auth/logout", app.logout)
	mux.HandleFunc("GET /api/v1/auth/session", app.session)
	mux.HandleFunc("GET /api/v1/vehicles", app.require("Viewer", app.listVehicles))
	mux.HandleFunc("POST /api/v1/vehicles", app.require("Editor", app.createVehicle))
	mux.HandleFunc("GET /api/v1/vehicles/{id}", app.require("Viewer", app.getVehicle))
	mux.HandleFunc("PUT /api/v1/vehicles/{id}", app.require("Editor", app.updateVehicle))
	mux.HandleFunc("DELETE /api/v1/vehicles/{id}", app.require("Editor", app.deleteVehicle))
	mux.HandleFunc("POST /api/v1/vehicles/{id}/images", app.require("Editor", app.uploadVehicleImage))
	mux.HandleFunc("DELETE /api/v1/vehicles/{id}/images/{imageID}", app.require("Editor", app.deleteVehicleImage))
	mux.HandleFunc("GET /api/v1/vehicles/{id}/images/{imageID}/file", app.require("Viewer", app.downloadVehicleImage))
	mux.HandleFunc("POST /api/v1/vehicles/{id}/attachments", app.require("Editor", app.uploadVehicleAttachment))
	mux.HandleFunc("PUT /api/v1/vehicles/{id}/attachments/{attachmentID}", app.require("Editor", app.updateVehicleAttachment))
	mux.HandleFunc("DELETE /api/v1/vehicles/{id}/attachments/{attachmentID}", app.require("Editor", app.deleteVehicleAttachment))
	mux.HandleFunc("GET /api/v1/vehicles/{id}/attachments/{attachmentID}/download", app.require("Viewer", app.downloadVehicleAttachment))
	mux.HandleFunc("POST /api/v1/article-search", app.require("Viewer", app.searchArticleData))
	mux.HandleFunc("GET /api/v1/inventory-number-schemes", app.require("Viewer", app.listInventoryNumberSchemes))
	mux.HandleFunc("PUT /api/v1/inventory-number-schemes/{category}", app.require("Editor", app.updateInventoryNumberScheme))
	mux.HandleFunc("GET /api/v1/master-data-all", app.require("Viewer", app.listAllMasterData))
	mux.HandleFunc("GET /api/v1/master-data/{type}", app.require("Viewer", app.listMasterData))
	mux.HandleFunc("POST /api/v1/master-data/{type}", app.require("Editor", app.createMasterData))
	mux.HandleFunc("PUT /api/v1/master-data/{type}/{key}", app.require("Editor", app.updateMasterData))
	mux.HandleFunc("DELETE /api/v1/master-data/{type}/{key}", app.require("Editor", app.deleteMasterData))
	mux.HandleFunc("GET /api/v1/master-data-relations", app.require("Viewer", app.listMasterDataRelations))

	mux.Handle("/", staticHandler(app.staticDir))

	return securityHeaders(app.csrf(mux))
}

func (a *App) setupStatus(w http.ResponseWriter, r *http.Request) {
	required, err := a.setupService.SetupRequired(r.Context())
	if err != nil {
		a.logger.Error("setup status failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "setup_status_failed", "Could not read setup state.")
		return
	}

	respondJSON(w, http.StatusOK, map[string]bool{"setupRequired": required})
}

func (a *App) createAdmin(w http.ResponseWriter, r *http.Request) {
	if !a.rateLimits.allow("setup", clientIP(r), 5, 10*time.Minute) {
		respondProblem(w, http.StatusTooManyRequests, "rate_limited", "Too many setup attempts. Please try again later.")
		return
	}

	var input application.CreateAdminInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondProblem(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}

	if err := a.setupService.CreateAdmin(r.Context(), input); err != nil {
		switch {
		case errors.Is(err, application.ErrWeakSetup):
			respondProblem(w, http.StatusBadRequest, "weak_setup", "Username must have at least 3 characters and password at least 12 characters.")
		case errors.Is(err, application.ErrAlreadySetup):
			respondProblem(w, http.StatusConflict, "already_setup", "Setup has already been completed.")
		default:
			a.logger.Error("admin setup failed", "error", err)
			respondProblem(w, http.StatusInternalServerError, "setup_failed", "Could not create admin user.")
		}
		return
	}

	respondJSON(w, http.StatusCreated, map[string]string{"status": "created"})
}

func (a *App) login(w http.ResponseWriter, r *http.Request) {
	if !a.rateLimits.allow("login", clientIP(r), 10, 5*time.Minute) {
		respondProblem(w, http.StatusTooManyRequests, "rate_limited", "Too many login attempts. Please try again later.")
		return
	}

	var input application.LoginInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondProblem(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}

	result, err := a.authService.Login(r.Context(), input)
	if err != nil {
		if errors.Is(err, application.ErrInvalidLogin) {
			respondProblem(w, http.StatusUnauthorized, "invalid_login", "Invalid username or password.")
			return
		}
		a.logger.Error("login failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "login_failed", "Could not create session.")
		return
	}

	setCookie(w, "rk_session", result.SessionToken, int(timeUntil(result.ExpiresAt).Seconds()), true, a.cookieSecure)
	setCookie(w, "rk_csrf", result.CSRFToken, int(timeUntil(result.ExpiresAt).Seconds()), false, a.cookieSecure)
	respondJSON(w, http.StatusOK, result.Session)
}

func (a *App) logout(w http.ResponseWriter, r *http.Request) {
	sessionToken := cookieValue(r, "rk_session")
	if err := a.authService.Logout(r.Context(), sessionToken); err != nil {
		a.logger.Error("logout failed", "error", err)
	}

	clearCookie(w, "rk_session", true, a.cookieSecure)
	clearCookie(w, "rk_csrf", false, a.cookieSecure)
	w.WriteHeader(http.StatusNoContent)
}

func (a *App) session(w http.ResponseWriter, r *http.Request) {
	sessionToken := cookieValue(r, "rk_session")
	session, err := a.authService.CurrentSession(r.Context(), sessionToken)
	if err != nil {
		if errors.Is(err, application.ErrUnauthorized) {
			respondProblem(w, http.StatusUnauthorized, "unauthorized", "Not logged in.")
			return
		}
		a.logger.Error("session lookup failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "session_failed", "Could not read current session.")
		return
	}

	respondJSON(w, http.StatusOK, session)
}

func (a *App) listVehicles(w http.ResponseWriter, r *http.Request) {
	vehicles, err := a.vehicleService.List(r.Context(), r.URL.Query().Get("q"))
	if err != nil {
		a.logger.Error("vehicle list failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "vehicle_list_failed", "Could not list vehicles.")
		return
	}

	respondJSON(w, http.StatusOK, vehicles)
}

func (a *App) createVehicle(w http.ResponseWriter, r *http.Request) {
	var input application.CreateVehicleInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondProblem(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}

	vehicle, err := a.vehicleService.Create(r.Context(), input, actorUserID(r))
	if err != nil {
		switch {
		case errors.Is(err, application.ErrVehicleValidation), errors.Is(err, application.ErrInventoryNumberValidation):
			respondProblem(w, http.StatusBadRequest, "vehicle_validation", "Manufacturer, name and gauge are required.")
		case errors.Is(err, application.ErrInventoryNumberConflict):
			respondProblem(w, http.StatusConflict, "inventory_number_conflict", "Inventory number already exists.")
		case errors.Is(err, application.ErrInventoryNumberNotFound):
			respondProblem(w, http.StatusBadRequest, "inventory_number_scheme_missing", "No active inventory number scheme is available.")
		default:
			a.logger.Error("vehicle create failed", "error", err)
			respondProblem(w, http.StatusInternalServerError, "vehicle_create_failed", "Could not create vehicle.")
		}
		return
	}

	respondJSON(w, http.StatusCreated, vehicle)
}

func (a *App) getVehicle(w http.ResponseWriter, r *http.Request) {
	vehicle, err := a.vehicleService.Get(r.Context(), r.PathValue("id"))
	if err != nil {
		if errors.Is(err, application.ErrVehicleNotFound) {
			respondProblem(w, http.StatusNotFound, "vehicle_not_found", "Vehicle not found.")
			return
		}
		a.logger.Error("vehicle get failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "vehicle_get_failed", "Could not read vehicle.")
		return
	}

	respondJSON(w, http.StatusOK, vehicle)
}

func (a *App) updateVehicle(w http.ResponseWriter, r *http.Request) {
	var input application.CreateVehicleInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondProblem(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}

	vehicle, err := a.vehicleService.Update(r.Context(), r.PathValue("id"), input, actorUserID(r))
	if err != nil {
		switch {
		case errors.Is(err, application.ErrVehicleValidation), errors.Is(err, application.ErrInventoryNumberValidation):
			respondProblem(w, http.StatusBadRequest, "vehicle_validation", "Manufacturer, name and gauge are required.")
		case errors.Is(err, application.ErrInventoryNumberConflict):
			respondProblem(w, http.StatusConflict, "inventory_number_conflict", "Inventory number already exists.")
		case errors.Is(err, application.ErrVehicleNotFound):
			respondProblem(w, http.StatusNotFound, "vehicle_not_found", "Vehicle not found.")
		default:
			a.logger.Error("vehicle update failed", "error", err)
			respondProblem(w, http.StatusInternalServerError, "vehicle_update_failed", "Could not update vehicle.")
		}
		return
	}

	respondJSON(w, http.StatusOK, vehicle)
}

func (a *App) deleteVehicle(w http.ResponseWriter, r *http.Request) {
	if err := a.vehicleService.Delete(r.Context(), r.PathValue("id"), actorUserID(r)); err != nil {
		if errors.Is(err, application.ErrVehicleNotFound) {
			respondProblem(w, http.StatusNotFound, "vehicle_not_found", "Vehicle not found.")
			return
		}
		a.logger.Error("vehicle delete failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "vehicle_delete_failed", "Could not delete vehicle.")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

const (
	maxAttachmentBytes = 25 * 1024 * 1024
	maxImageBytes      = 10 * 1024 * 1024
)

var safeFileNamePattern = regexp.MustCompile(`[^a-zA-Z0-9._-]+`)

func (a *App) uploadVehicleImage(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxImageBytes+1024*1024)
	if err := r.ParseMultipartForm(maxImageBytes); err != nil {
		respondProblem(w, http.StatusBadRequest, "image_upload_invalid", "Bild konnte nicht gelesen werden.")
		return
	}
	if r.MultipartForm != nil {
		defer func() { _ = r.MultipartForm.RemoveAll() }()
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		respondProblem(w, http.StatusBadRequest, "image_missing", "Eine Bilddatei ist erforderlich.")
		return
	}
	defer func() { _ = file.Close() }()
	if header.Size > maxImageBytes {
		respondProblem(w, http.StatusBadRequest, "image_too_large", "Das Bild ist zu gross.")
		return
	}
	data, err := io.ReadAll(io.LimitReader(file, maxImageBytes+1))
	if err != nil || int64(len(data)) > maxImageBytes {
		respondProblem(w, http.StatusBadRequest, "image_too_large", "Das Bild ist zu gross.")
		return
	}
	mimeType := http.DetectContentType(data)
	if !isAllowedImageMime(mimeType) {
		respondProblem(w, http.StatusBadRequest, "image_type_blocked", "Erlaubt sind JPG, PNG und WebP.")
		return
	}
	vehicleID := r.PathValue("id")
	storageName := fmt.Sprintf("%d-%s", time.Now().UTC().UnixNano(), safeAttachmentFileName(header.Filename))
	storagePath := filepath.Join("uploads", "vehicles", safePathSegment(vehicleID), "images", storageName)
	fullPath, err := confinedDataPath(a.dataDir, storagePath)
	if err != nil {
		respondProblem(w, http.StatusBadRequest, "image_path_invalid", "Bild konnte nicht gespeichert werden.")
		return
	}
	if err = os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
		a.logger.Error("image directory create failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "image_upload_failed", "Bild konnte nicht gespeichert werden.")
		return
	}
	if err = os.WriteFile(fullPath, data, 0o600); err != nil {
		a.logger.Error("image write failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "image_upload_failed", "Bild konnte nicht gespeichert werden.")
		return
	}
	image, err := a.vehicleService.CreateImage(r.Context(), vehicleID, application.VehicleImageInput{
		Title:       r.FormValue("title"),
		SourceURL:   r.FormValue("sourceUrl"),
		FileName:    storageName,
		MimeType:    mimeType,
		StoragePath: storagePath,
		IsPrimary:   strings.EqualFold(r.FormValue("isPrimary"), "true"),
	})
	if err != nil {
		_ = os.Remove(fullPath)
		if errors.Is(err, application.ErrVehicleNotFound) {
			respondProblem(w, http.StatusNotFound, "vehicle_not_found", "Vehicle not found.")
			return
		}
		a.logger.Error("image metadata create failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "image_upload_failed", "Bild konnte nicht gespeichert werden.")
		return
	}
	respondJSON(w, http.StatusCreated, image)
}

func (a *App) deleteVehicleImage(w http.ResponseWriter, r *http.Request) {
	image, err := a.vehicleService.DeleteImage(r.Context(), r.PathValue("id"), r.PathValue("imageID"))
	if err != nil {
		if errors.Is(err, application.ErrVehicleNotFound) {
			respondProblem(w, http.StatusNotFound, "image_not_found", "Image not found.")
			return
		}
		a.logger.Error("image delete failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "image_delete_failed", "Bild konnte nicht geloescht werden.")
		return
	}
	if image.StoragePath != "" {
		if fullPath, err := confinedDataPath(a.dataDir, image.StoragePath); err == nil {
			_ = os.Remove(fullPath)
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *App) downloadVehicleImage(w http.ResponseWriter, r *http.Request) {
	image, err := a.vehicleService.GetImage(r.Context(), r.PathValue("id"), r.PathValue("imageID"))
	if err != nil {
		if errors.Is(err, application.ErrVehicleNotFound) {
			respondProblem(w, http.StatusNotFound, "image_not_found", "Image not found.")
			return
		}
		a.logger.Error("image lookup failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "image_download_failed", "Bild konnte nicht geladen werden.")
		return
	}
	if image.StoragePath == "" {
		respondProblem(w, http.StatusNotFound, "image_file_missing", "Bilddatei ist nicht lokal gespeichert.")
		return
	}
	fullPath, err := confinedDataPath(a.dataDir, image.StoragePath)
	if err != nil {
		respondProblem(w, http.StatusInternalServerError, "image_path_invalid", "Bild konnte nicht geladen werden.")
		return
	}
	if image.MimeType != "" {
		w.Header().Set("Content-Type", image.MimeType)
	}
	w.Header().Set("Content-Disposition", mime.FormatMediaType("inline", map[string]string{"filename": path.Base(image.FileName)}))
	http.ServeFile(w, r, fullPath)
}

func (a *App) uploadVehicleAttachment(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxAttachmentBytes+1024*1024)
	if err := r.ParseMultipartForm(maxAttachmentBytes); err != nil {
		respondProblem(w, http.StatusBadRequest, "attachment_upload_invalid", "Beilage konnte nicht gelesen werden.")
		return
	}
	if r.MultipartForm != nil {
		defer func() { _ = r.MultipartForm.RemoveAll() }()
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		respondProblem(w, http.StatusBadRequest, "attachment_missing", "Eine Datei ist erforderlich.")
		return
	}
	defer func() { _ = file.Close() }()
	if header.Size > maxAttachmentBytes {
		respondProblem(w, http.StatusBadRequest, "attachment_too_large", "Die Datei ist zu gross.")
		return
	}
	if isBlockedAttachmentName(header.Filename) {
		respondProblem(w, http.StatusBadRequest, "attachment_type_blocked", "Ausfuehrbare Dateien sind nicht erlaubt.")
		return
	}
	data, err := io.ReadAll(io.LimitReader(file, maxAttachmentBytes+1))
	if err != nil || int64(len(data)) > maxAttachmentBytes {
		respondProblem(w, http.StatusBadRequest, "attachment_too_large", "Die Datei ist zu gross.")
		return
	}
	mimeType := http.DetectContentType(data)
	if isBlockedAttachmentMime(mimeType) {
		respondProblem(w, http.StatusBadRequest, "attachment_type_blocked", "Ausfuehrbare Dateien sind nicht erlaubt.")
		return
	}
	vehicleID := r.PathValue("id")
	storageName := fmt.Sprintf("%d-%s", time.Now().UTC().UnixNano(), safeAttachmentFileName(header.Filename))
	storagePath := filepath.Join("uploads", "vehicles", safePathSegment(vehicleID), storageName)
	fullPath, err := confinedDataPath(a.dataDir, storagePath)
	if err != nil {
		respondProblem(w, http.StatusBadRequest, "attachment_path_invalid", "Beilage konnte nicht gespeichert werden.")
		return
	}
	if err = os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
		a.logger.Error("attachment directory create failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "attachment_upload_failed", "Beilage konnte nicht gespeichert werden.")
		return
	}
	if err = os.WriteFile(fullPath, data, 0o600); err != nil {
		a.logger.Error("attachment write failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "attachment_upload_failed", "Beilage konnte nicht gespeichert werden.")
		return
	}
	attachment, err := a.vehicleService.CreateAttachment(r.Context(), vehicleID, application.VehicleAttachmentInput{
		FileName:     storageName,
		OriginalName: header.Filename,
		Description:  r.FormValue("description"),
		Category:     r.FormValue("category"),
		MimeType:     mimeType,
		SizeBytes:    int64(len(data)),
		StoragePath:  storagePath,
	})
	if err != nil {
		_ = os.Remove(fullPath)
		if errors.Is(err, application.ErrVehicleNotFound) {
			respondProblem(w, http.StatusNotFound, "vehicle_not_found", "Vehicle not found.")
			return
		}
		a.logger.Error("attachment metadata create failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "attachment_upload_failed", "Beilage konnte nicht gespeichert werden.")
		return
	}
	respondJSON(w, http.StatusCreated, attachment)
}

func (a *App) updateVehicleAttachment(w http.ResponseWriter, r *http.Request) {
	var input application.VehicleAttachmentUpdateInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondProblem(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}
	attachment, err := a.vehicleService.UpdateAttachment(r.Context(), r.PathValue("id"), r.PathValue("attachmentID"), input)
	if err != nil {
		if errors.Is(err, application.ErrVehicleNotFound) {
			respondProblem(w, http.StatusNotFound, "attachment_not_found", "Attachment not found.")
			return
		}
		a.logger.Error("attachment update failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "attachment_update_failed", "Beilage konnte nicht aktualisiert werden.")
		return
	}
	respondJSON(w, http.StatusOK, attachment)
}

func (a *App) deleteVehicleAttachment(w http.ResponseWriter, r *http.Request) {
	attachment, err := a.vehicleService.DeleteAttachment(r.Context(), r.PathValue("id"), r.PathValue("attachmentID"))
	if err != nil {
		if errors.Is(err, application.ErrVehicleNotFound) {
			respondProblem(w, http.StatusNotFound, "attachment_not_found", "Attachment not found.")
			return
		}
		a.logger.Error("attachment delete failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "attachment_delete_failed", "Beilage konnte nicht geloescht werden.")
		return
	}
	if fullPath, err := confinedDataPath(a.dataDir, attachment.StoragePath); err == nil {
		_ = os.Remove(fullPath)
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *App) downloadVehicleAttachment(w http.ResponseWriter, r *http.Request) {
	attachment, err := a.vehicleService.GetAttachment(r.Context(), r.PathValue("id"), r.PathValue("attachmentID"))
	if err != nil {
		if errors.Is(err, application.ErrVehicleNotFound) {
			respondProblem(w, http.StatusNotFound, "attachment_not_found", "Attachment not found.")
			return
		}
		a.logger.Error("attachment download lookup failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "attachment_download_failed", "Beilage konnte nicht geladen werden.")
		return
	}
	fullPath, err := confinedDataPath(a.dataDir, attachment.StoragePath)
	if err != nil {
		respondProblem(w, http.StatusInternalServerError, "attachment_path_invalid", "Beilage konnte nicht geladen werden.")
		return
	}
	if attachment.MimeType != "" {
		w.Header().Set("Content-Type", attachment.MimeType)
	}
	disposition := "attachment"
	if r.URL.Query().Get("inline") == "true" && strings.Contains(strings.ToLower(attachment.MimeType), "pdf") {
		disposition = "inline"
	}
	w.Header().Set("Content-Disposition", mime.FormatMediaType(disposition, map[string]string{"filename": path.Base(attachment.OriginalName)}))
	http.ServeFile(w, r, fullPath)
}

func safeAttachmentFileName(value string) string {
	value = strings.TrimSpace(filepath.Base(value))
	if value == "" {
		return "beilage"
	}
	value = safeFileNamePattern.ReplaceAllString(value, "-")
	value = strings.Trim(value, ".-")
	if value == "" {
		return "beilage"
	}
	return value
}

func safePathSegment(value string) string {
	value = safeFileNamePattern.ReplaceAllString(strings.TrimSpace(value), "-")
	value = strings.Trim(value, ".-")
	if value == "" {
		return "unknown"
	}
	return value
}

func confinedDataPath(dataDir, relativePath string) (string, error) {
	base, err := filepath.Abs(dataDir)
	if err != nil {
		return "", err
	}
	target, err := filepath.Abs(filepath.Join(base, relativePath))
	if err != nil {
		return "", err
	}
	if target != base && !strings.HasPrefix(target, base+string(os.PathSeparator)) {
		return "", errors.New("path escapes data directory")
	}
	return target, nil
}

func isBlockedAttachmentName(value string) bool {
	switch strings.ToLower(filepath.Ext(value)) {
	case ".exe", ".bat", ".cmd", ".com", ".scr", ".msi", ".dll", ".ps1", ".vbs", ".js", ".jar", ".sh":
		return true
	default:
		return false
	}
}

func isBlockedAttachmentMime(value string) bool {
	value = strings.ToLower(strings.TrimSpace(value))
	return strings.Contains(value, "x-msdownload") ||
		strings.Contains(value, "x-dosexec") ||
		strings.Contains(value, "x-sh") ||
		strings.Contains(value, "javascript") ||
		strings.Contains(value, "ecmascript") ||
		strings.Contains(value, "x-msdos-program")
}

func isAllowedImageMime(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "image/jpeg", "image/png", "image/webp":
		return true
	default:
		return false
	}
}

type rateLimiter struct {
	mu       sync.Mutex
	attempts map[string][]time.Time
}

func newRateLimiter() *rateLimiter {
	return &rateLimiter{attempts: map[string][]time.Time{}}
}

func (r *rateLimiter) allow(scope, key string, limit int, window time.Duration) bool {
	if r == nil {
		return true
	}
	now := time.Now()
	cutoff := now.Add(-window)
	r.mu.Lock()
	defer r.mu.Unlock()

	compoundKey := scope + ":" + key
	current := r.attempts[compoundKey]
	filtered := current[:0]
	for _, attempt := range current {
		if attempt.After(cutoff) {
			filtered = append(filtered, attempt)
		}
	}
	if len(filtered) >= limit {
		r.attempts[compoundKey] = filtered
		return false
	}
	r.attempts[compoundKey] = append(filtered, now)
	return true
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil && host != "" {
		return host
	}
	if r.RemoteAddr == "" {
		return "unknown"
	}
	return r.RemoteAddr
}

func (a *App) searchArticleData(w http.ResponseWriter, r *http.Request) {
	var input application.ArticleSearchInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondProblem(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}

	result, err := a.articleSearch.Search(r.Context(), input)
	if err != nil {
		if errors.Is(err, application.ErrArticleSearchValidation) {
			respondProblem(w, http.StatusBadRequest, "article_search_validation", "At least one search field is required.")
			return
		}
		a.logger.Error("article search failed", "error", err)
		respondProblem(w, http.StatusGatewayTimeout, "article_search_failed", "Artikeldaten-Websuche konnte nicht abgeschlossen werden.")
		return
	}

	respondJSON(w, http.StatusOK, result)
}

func (a *App) listInventoryNumberSchemes(w http.ResponseWriter, r *http.Request) {
	schemes, err := a.inventoryNumbers.List(r.Context())
	if err != nil {
		a.logger.Error("inventory number scheme list failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "inventory_number_scheme_list_failed", "Could not list inventory number schemes.")
		return
	}

	respondJSON(w, http.StatusOK, schemes)
}

func (a *App) updateInventoryNumberScheme(w http.ResponseWriter, r *http.Request) {
	var input application.InventoryNumberSchemeInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondProblem(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}

	scheme, err := a.inventoryNumbers.Update(r.Context(), r.PathValue("category"), input)
	if err != nil {
		switch {
		case errors.Is(err, application.ErrInventoryNumberValidation):
			respondProblem(w, http.StatusBadRequest, "inventory_number_validation", "Prefix, next number and padding are required.")
		case errors.Is(err, application.ErrInventoryNumberNotFound):
			respondProblem(w, http.StatusNotFound, "inventory_number_scheme_not_found", "Inventory number scheme not found.")
		default:
			a.logger.Error("inventory number scheme update failed", "error", err)
			respondProblem(w, http.StatusInternalServerError, "inventory_number_scheme_update_failed", "Could not update inventory number scheme.")
		}
		return
	}

	respondJSON(w, http.StatusOK, scheme)
}

func (a *App) listMasterData(w http.ResponseWriter, r *http.Request) {
	activeOnly := r.URL.Query().Get("active") == "true"
	items, err := a.masterDataService.List(r.Context(), r.PathValue("type"), activeOnly)
	if err != nil {
		if errors.Is(err, application.ErrMasterDataValidation) {
			respondProblem(w, http.StatusBadRequest, "master_data_validation", "Master data type is required.")
			return
		}
		a.logger.Error("master data list failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "master_data_list_failed", "Could not list master data.")
		return
	}

	respondJSON(w, http.StatusOK, items)
}

func (a *App) listAllMasterData(w http.ResponseWriter, r *http.Request) {
	activeOnly := r.URL.Query().Get("active") == "true"
	items, err := a.masterDataService.ListAll(r.Context(), activeOnly)
	if err != nil {
		a.logger.Error("master data list all failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "master_data_list_failed", "Could not list master data.")
		return
	}

	respondJSON(w, http.StatusOK, items)
}

func (a *App) createMasterData(w http.ResponseWriter, r *http.Request) {
	var input application.MasterDataInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondProblem(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}

	item, err := a.masterDataService.Create(r.Context(), r.PathValue("type"), input)
	if err != nil {
		if errors.Is(err, application.ErrMasterDataValidation) {
			respondProblem(w, http.StatusBadRequest, "master_data_validation", "Label is required.")
			return
		}
		a.logger.Error("master data create failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "master_data_create_failed", "Could not create master data.")
		return
	}

	respondJSON(w, http.StatusCreated, item)
}

func (a *App) updateMasterData(w http.ResponseWriter, r *http.Request) {
	var input application.MasterDataInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondProblem(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}

	item, err := a.masterDataService.Update(r.Context(), r.PathValue("type"), r.PathValue("key"), input)
	if err != nil {
		switch {
		case errors.Is(err, application.ErrMasterDataValidation):
			respondProblem(w, http.StatusBadRequest, "master_data_validation", "Label is required.")
		case errors.Is(err, application.ErrMasterDataNotFound):
			respondProblem(w, http.StatusNotFound, "master_data_not_found", "Master data entry not found.")
		default:
			a.logger.Error("master data update failed", "error", err)
			respondProblem(w, http.StatusInternalServerError, "master_data_update_failed", "Could not update master data.")
		}
		return
	}

	respondJSON(w, http.StatusOK, item)
}

func (a *App) deleteMasterData(w http.ResponseWriter, r *http.Request) {
	if err := a.masterDataService.Delete(r.Context(), r.PathValue("type"), r.PathValue("key")); err != nil {
		if errors.Is(err, application.ErrMasterDataNotFound) {
			respondProblem(w, http.StatusNotFound, "master_data_not_found", "Master data entry not found.")
			return
		}
		a.logger.Error("master data delete failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "master_data_delete_failed", "Could not delete master data.")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (a *App) listMasterDataRelations(w http.ResponseWriter, r *http.Request) {
	relations, err := a.masterDataService.Relations(
		r.Context(),
		r.URL.Query().Get("parentType"),
		r.URL.Query().Get("childType"),
	)
	if err != nil {
		a.logger.Error("master data relations list failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "master_data_relations_failed", "Could not list master data relations.")
		return
	}

	respondJSON(w, http.StatusOK, relations)
}

func respondJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func respondProblem(w http.ResponseWriter, status int, code, message string) {
	respondJSON(w, status, map[string]string{
		"error":   code,
		"message": message,
	})
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "same-origin")
		w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; connect-src 'self'; img-src 'self' data: blob: http: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'")
		next.ServeHTTP(w, r)
	})
}

func (a *App) csrf(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}
		if r.URL.Path == "/api/v1/setup/admin" ||
			r.URL.Path == "/api/v1/auth/login" ||
			r.URL.Path == "/api/v1/auth/logout" {
			next.ServeHTTP(w, r)
			return
		}
		if !strings.HasPrefix(r.URL.Path, "/api/") {
			next.ServeHTTP(w, r)
			return
		}

		if err := a.authService.ValidateCSRF(r.Context(), cookieValue(r, "rk_session"), r.Header.Get("X-CSRF-Token")); err != nil {
			respondProblem(w, http.StatusForbidden, "csrf_required", "CSRF token is missing or invalid.")
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (a *App) require(role string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, err := a.authService.RequireRole(r.Context(), cookieValue(r, "rk_session"), role)
		if err != nil {
			if errors.Is(err, application.ErrUnauthorized) {
				respondProblem(w, http.StatusUnauthorized, "unauthorized", "Not logged in.")
				return
			}
			if errors.Is(err, application.ErrForbidden) {
				respondProblem(w, http.StatusForbidden, "forbidden", "Insufficient role.")
				return
			}
			a.logger.Error("role check failed", "error", err)
			respondProblem(w, http.StatusInternalServerError, "role_check_failed", "Could not verify permissions.")
			return
		}

		next.ServeHTTP(w, withActorUserID(r, userID))
	}
}

func setCookie(w http.ResponseWriter, name, value string, maxAge int, httpOnly, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     "/",
		MaxAge:   maxAge,
		HttpOnly: httpOnly,
		SameSite: http.SameSiteLaxMode,
		Secure:   secure,
	})
}

func clearCookie(w http.ResponseWriter, name string, httpOnly, secure bool) {
	setCookie(w, name, "", -1, httpOnly, secure)
}

func cookieValue(r *http.Request, name string) string {
	cookie, err := r.Cookie(name)
	if err != nil {
		return ""
	}
	return cookie.Value
}

func timeUntil(t time.Time) time.Duration {
	duration := time.Until(t)
	if duration < time.Second {
		return time.Second
	}
	return duration
}

type actorUserIDKey struct{}

func withActorUserID(r *http.Request, userID string) *http.Request {
	return r.WithContext(context.WithValue(r.Context(), actorUserIDKey{}, userID))
}

func actorUserID(r *http.Request) string {
	value, _ := r.Context().Value(actorUserIDKey{}).(string)
	return value
}

func staticHandler(staticDir string) http.Handler {
	fileServer := http.FileServer(http.Dir(staticDir))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			respondJSON(w, http.StatusNotFound, map[string]string{
				"error":   "not_found",
				"message": "API route not found",
			})
			return
		}

		path := filepath.Join(staticDir, filepath.Clean(r.URL.Path))
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			if strings.HasPrefix(r.URL.Path, "/assets/") {
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			} else {
				w.Header().Set("Cache-Control", "no-cache")
			}
			fileServer.ServeHTTP(w, r)
			return
		}

		w.Header().Set("Cache-Control", "no-store")
		http.ServeFile(w, r, filepath.Join(staticDir, "index.html"))
	})
}
