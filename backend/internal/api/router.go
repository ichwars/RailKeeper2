package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	_ "image/png"
	"io"
	"log/slog"
	"mime"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"

	_ "golang.org/x/image/webp"

	"railkeeper2/backend/internal/application"
)

type Config struct {
	Version                     string
	UpdateCheckURL              string
	StaticDir                   string
	DataDir                     string
	MaxImageBytes               int64
	MaxAttachmentBytes          int64
	AllowedAttachmentExtensions map[string]struct{}
	Logger                      *slog.Logger
	SetupService                *application.SetupService
	AuthService                 *application.AuthService
	VehicleService              *application.VehicleService
	MasterDataService           *application.MasterDataService
	ArticleSearch               *application.ArticleSearchService
	InventoryNumbers            *application.InventoryNumberService
	BackupService               *application.BackupService
	ExhibitionService           *application.ExhibitionService
	RateLimitService            *application.RateLimitService
	CookieSecure                bool
}

type App struct {
	version                     string
	updateCheckURL              string
	staticDir                   string
	dataDir                     string
	maxImageBytes               int64
	maxAttachmentBytes          int64
	allowedAttachmentExtensions map[string]struct{}
	logger                      *slog.Logger
	setupService                *application.SetupService
	authService                 *application.AuthService
	vehicleService              *application.VehicleService
	masterDataService           *application.MasterDataService
	articleSearch               *application.ArticleSearchService
	inventoryNumbers            *application.InventoryNumberService
	backupService               *application.BackupService
	exhibitionService           *application.ExhibitionService
	cookieSecure                bool
	rateLimits                  rateLimitStore
}

func NewRouter(config Config) http.Handler {
	if config.Logger == nil {
		config.Logger = slog.Default()
	}
	if config.DataDir == "" {
		config.DataDir = "./data"
	}
	app := &App{
		version:                     config.Version,
		updateCheckURL:              config.UpdateCheckURL,
		staticDir:                   config.StaticDir,
		dataDir:                     config.DataDir,
		maxImageBytes:               effectiveLimit(config.MaxImageBytes, defaultMaxImageBytes),
		maxAttachmentBytes:          effectiveLimit(config.MaxAttachmentBytes, defaultMaxAttachmentBytes),
		allowedAttachmentExtensions: effectiveAttachmentExtensions(config.AllowedAttachmentExtensions),
		logger:                      config.Logger,
		setupService:                config.SetupService,
		authService:                 config.AuthService,
		vehicleService:              config.VehicleService,
		masterDataService:           config.MasterDataService,
		articleSearch:               config.ArticleSearch,
		inventoryNumbers:            config.InventoryNumbers,
		backupService:               config.BackupService,
		exhibitionService:           config.ExhibitionService,
		cookieSecure:                config.CookieSecure,
		rateLimits:                  config.RateLimitService,
	}
	if app.rateLimits == nil {
		app.rateLimits = newRateLimiter()
	}
	if app.articleSearch == nil {
		app.articleSearch = application.NewArticleSearchService()
	}
	if app.backupService == nil {
		app.backupService = application.NewBackupService(nil, app.dataDir)
	}
	if app.vehicleService != nil {
		app.vehicleService.SetImageLocalizer(app.localizeVehicleImages)
	}

	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	mux.HandleFunc("GET /api/v1/version", app.versionInfo)
	mux.HandleFunc("GET /api/v1/system/storage", app.require("Admin", app.systemStorage))
	mux.HandleFunc("GET /api/v1/system/printers", app.require("Admin", app.systemPrinters))
	mux.HandleFunc("GET /api/v1/system/audit-log", app.require("Admin", app.systemAuditLog))

	mux.HandleFunc("GET /api/v1/setup/status", app.setupStatus)
	mux.HandleFunc("POST /api/v1/setup/admin", app.createAdmin)
	mux.HandleFunc("POST /api/v1/auth/login", app.login)
	mux.HandleFunc("POST /api/v1/auth/logout", app.logout)
	mux.HandleFunc("GET /api/v1/auth/session", app.session)
	mux.HandleFunc("GET /api/v1/roles", app.require("Admin", app.listRoles))
	mux.HandleFunc("GET /api/v1/users", app.require("Admin", app.listUsers))
	mux.HandleFunc("POST /api/v1/users", app.require("Admin", app.createUser))
	mux.HandleFunc("PUT /api/v1/users/{id}", app.require("Admin", app.updateUser))
	mux.HandleFunc("DELETE /api/v1/users/{id}", app.require("Admin", app.deleteUser))
	mux.HandleFunc("GET /api/v1/sessions", app.require("Admin", app.listSessions))
	mux.HandleFunc("PUT /api/v1/sessions/{id}/revoke", app.require("Admin", app.revokeSession))
	mux.HandleFunc("GET /api/v1/vehicles", app.require("Viewer", app.listVehicles))
	mux.HandleFunc("POST /api/v1/vehicle-import/preview", app.require("Editor", app.previewVehicleImport))
	mux.HandleFunc("POST /api/v1/vehicles", app.require("Editor", app.createVehicle))
	mux.HandleFunc("GET /api/v1/vehicles/{id}", app.require("Viewer", app.getVehicle))
	mux.HandleFunc("PUT /api/v1/vehicles/{id}", app.require("Editor", app.updateVehicle))
	mux.HandleFunc("DELETE /api/v1/vehicles/{id}", app.require("Editor", app.deleteVehicle))
	mux.HandleFunc("POST /api/v1/vehicles/{id}/images", app.require("Editor", app.uploadVehicleImage))
	mux.HandleFunc("DELETE /api/v1/vehicles/{id}/images/{imageID}", app.require("Editor", app.deleteVehicleImage))
	mux.HandleFunc("GET /api/v1/vehicles/{id}/images/{imageID}/file", app.require("Viewer", app.downloadVehicleImage))
	mux.HandleFunc("GET /api/v1/vehicles/{id}/images/{imageID}/thumbnail", app.require("Viewer", app.downloadVehicleImageThumbnail))
	mux.HandleFunc("POST /api/v1/vehicles/{id}/attachments", app.require("Editor", app.uploadVehicleAttachment))
	mux.HandleFunc("PUT /api/v1/vehicles/{id}/attachments/{attachmentID}", app.require("Editor", app.updateVehicleAttachment))
	mux.HandleFunc("DELETE /api/v1/vehicles/{id}/attachments/{attachmentID}", app.require("Editor", app.deleteVehicleAttachment))
	mux.HandleFunc("GET /api/v1/vehicles/{id}/attachments/{attachmentID}/download", app.require("Viewer", app.downloadVehicleAttachment))
	mux.HandleFunc("GET /api/v1/vehicles/{id}/maintenance", app.require("Viewer", app.listVehicleMaintenance))
	mux.HandleFunc("POST /api/v1/vehicles/{id}/maintenance", app.require("Editor", app.createVehicleMaintenance))
	mux.HandleFunc("PUT /api/v1/vehicles/{id}/maintenance/{maintenanceID}", app.require("Editor", app.updateVehicleMaintenance))
	mux.HandleFunc("DELETE /api/v1/vehicles/{id}/maintenance/{maintenanceID}", app.require("Editor", app.deleteVehicleMaintenance))
	mux.HandleFunc("GET /api/v1/vehicles/{id}/functions", app.require("Viewer", app.listVehicleFunctions))
	mux.HandleFunc("PUT /api/v1/vehicles/{id}/functions/{functionKey}", app.require("Editor", app.upsertVehicleFunction))
	mux.HandleFunc("DELETE /api/v1/vehicles/{id}/functions/{functionKey}", app.require("Editor", app.deleteVehicleFunction))
	mux.HandleFunc("GET /api/v1/vehicles/{id}/cv-values", app.require("Viewer", app.listVehicleCVValues))
	mux.HandleFunc("POST /api/v1/vehicles/{id}/cv-values", app.require("Editor", app.createVehicleCVValue))
	mux.HandleFunc("PUT /api/v1/vehicles/{id}/cv-values/{cvValueID}", app.require("Editor", app.updateVehicleCVValue))
	mux.HandleFunc("DELETE /api/v1/vehicles/{id}/cv-values/{cvValueID}", app.require("Editor", app.deleteVehicleCVValue))
	mux.HandleFunc("POST /api/v1/cv-files/preview", app.require("Editor", app.previewVehicleCVFile))
	mux.HandleFunc("POST /api/v1/vehicles/{id}/cv-files", app.require("Editor", app.uploadVehicleCVFile))
	mux.HandleFunc("DELETE /api/v1/vehicles/{id}/cv-files/{cvFileID}", app.require("Editor", app.deleteVehicleCVFile))
	mux.HandleFunc("GET /api/v1/vehicles/{id}/cv-files/{cvFileID}/download", app.require("Viewer", app.downloadVehicleCVFile))
	mux.HandleFunc("POST /api/v1/article-search", app.require("Viewer", app.searchArticleData))
	mux.HandleFunc("GET /api/v1/inventory-number-schemes", app.require("Viewer", app.listInventoryNumberSchemes))
	mux.HandleFunc("PUT /api/v1/inventory-number-schemes/{category}", app.require("Editor", app.updateInventoryNumberScheme))
	mux.HandleFunc("GET /api/v1/master-data-all", app.require("Viewer", app.listAllMasterData))
	mux.HandleFunc("GET /api/v1/master-data/export", app.require("Admin", app.exportMasterData))
	mux.HandleFunc("POST /api/v1/master-data/import", app.require("Admin", app.importMasterData))
	mux.HandleFunc("GET /api/v1/master-data/{type}", app.require("Viewer", app.listMasterData))
	mux.HandleFunc("POST /api/v1/master-data/{type}", app.require("Editor", app.createMasterData))
	mux.HandleFunc("PUT /api/v1/master-data/{type}/{key}", app.require("Editor", app.updateMasterData))
	mux.HandleFunc("DELETE /api/v1/master-data/{type}/{key}", app.require("Editor", app.deleteMasterData))
	mux.HandleFunc("GET /api/v1/master-data-relations", app.require("Viewer", app.listMasterDataRelations))
	mux.HandleFunc("GET /api/v1/backup/export", app.require("Admin", app.exportBackup))
	mux.HandleFunc("POST /api/v1/backup/validate", app.require("Admin", app.validateBackup))
	mux.HandleFunc("POST /api/v1/backup/restore", app.require("Admin", app.restoreBackup))
	mux.HandleFunc("GET /api/v1/exhibition-lists", app.require("Messe", app.listExhibitionLists))
	mux.HandleFunc("POST /api/v1/exhibition-lists", app.require("Admin", app.createExhibitionList))
	mux.HandleFunc("GET /api/v1/exhibition-lists/{id}", app.require("Messe", app.getExhibitionList))
	mux.HandleFunc("PUT /api/v1/exhibition-lists/{id}", app.require("Admin", app.updateExhibitionList))
	mux.HandleFunc("DELETE /api/v1/exhibition-lists/{id}", app.require("Admin", app.deleteExhibitionList))
	mux.HandleFunc("PUT /api/v1/exhibition-lists/{id}/lock", app.require("Admin", app.setExhibitionListLocked))
	mux.HandleFunc("GET /api/v1/exhibition-lists/{id}/entries", app.require("Messe", app.listExhibitionEntries))
	mux.HandleFunc("POST /api/v1/exhibition-lists/{id}/entries", app.require("Messe", app.createExhibitionEntry))
	mux.HandleFunc("PUT /api/v1/exhibition-lists/{id}/entries/{entryID}", app.require("Messe", app.updateExhibitionEntry))
	mux.HandleFunc("DELETE /api/v1/exhibition-lists/{id}/entries/{entryID}", app.require("Admin", app.deleteExhibitionEntry))

	mux.Handle("/", staticHandler(app.staticDir))

	return securityHeaders(app.csrf(mux))
}

type storageUsageResponse struct {
	TotalBytes int64                  `json:"totalBytes"`
	Categories []storageUsageCategory `json:"categories"`
	UpdatedAt  string                 `json:"updatedAt"`
}

type storageUsageCategory struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Bytes int64  `json:"bytes"`
	Files int    `json:"files"`
}

type systemPrintersResponse struct {
	Status         string          `json:"status"`
	Message        string          `json:"message"`
	DefaultPrinter string          `json:"defaultPrinter,omitempty"`
	Printers       []systemPrinter `json:"printers"`
}

type systemPrinter struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	IsDefault bool   `json:"isDefault"`
}

type versionInfoResponse struct {
	Version         string `json:"version"`
	LatestVersion   string `json:"latestVersion,omitempty"`
	UpdateAvailable bool   `json:"updateAvailable"`
	SourceURL       string `json:"sourceUrl,omitempty"`
	ReleaseURL      string `json:"releaseUrl,omitempty"`
	CheckedAt       string `json:"checkedAt"`
	Status          string `json:"status"`
	Message         string `json:"message"`
}

type updateReleaseResponse struct {
	Version    string `json:"version"`
	TagName    string `json:"tag_name"`
	Name       string `json:"name"`
	HTMLURL    string `json:"html_url"`
	Prerelease bool   `json:"prerelease"`
	Draft      bool   `json:"draft"`
}

func (a *App) versionInfo(w http.ResponseWriter, r *http.Request) {
	response := versionInfoResponse{
		Version:   a.version,
		CheckedAt: time.Now().UTC().Format(time.RFC3339),
		Status:    "local",
		Message:   "Lokale RailKeeper-Version gelesen.",
	}

	if r.URL.Query().Get("check") != "true" {
		respondJSON(w, http.StatusOK, response)
		return
	}

	updateURL := strings.TrimSpace(a.updateCheckURL)
	if updateURL == "" {
		response.Status = "not_configured"
		response.Message = "Keine externe Updatequelle konfiguriert."
		respondJSON(w, http.StatusOK, response)
		return
	}
	if !isAllowedUpdateURL(updateURL) {
		response.Status = "unavailable"
		response.SourceURL = updateURL
		response.Message = "Updatequelle ist nicht erlaubt. Bitte eine HTTP- oder HTTPS-URL konfigurieren."
		respondJSON(w, http.StatusOK, response)
		return
	}

	includePrerelease := r.URL.Query().Get("prerelease") == "true"
	release, err := fetchUpdateRelease(r.Context(), updateURL, includePrerelease)
	response.SourceURL = updateURL
	if err != nil {
		a.logger.Warn("update check failed", "url", updateURL, "error", err)
		response.Status = "unavailable"
		response.Message = "Updatequelle konnte nicht erreicht werden."
		respondJSON(w, http.StatusOK, response)
		return
	}

	response.LatestVersion = firstUpdateVersion(release.Version, release.TagName, release.Name)
	response.ReleaseURL = release.HTMLURL
	if response.LatestVersion == "" {
		response.Status = "unavailable"
		response.Message = "Updatequelle enthielt keine auswertbare Version."
		respondJSON(w, http.StatusOK, response)
		return
	}

	if compareVersionStrings(response.LatestVersion, a.version) > 0 {
		response.UpdateAvailable = true
		response.Status = "update_available"
		response.Message = "Eine neuere RailKeeper-Version ist verfügbar."
	} else {
		response.Status = "current"
		response.Message = "RailKeeper ist aktuell."
	}
	respondJSON(w, http.StatusOK, response)
}

func isAllowedUpdateURL(rawURL string) bool {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	return parsed.Scheme == "https" || parsed.Scheme == "http"
}

func fetchUpdateRelease(ctx context.Context, updateURL string, includePrerelease bool) (*updateReleaseResponse, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	if includePrerelease {
		updateURL = releaseListURL(updateURL)
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, updateURL, nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("User-Agent", "RailKeeper2")

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer func() { _ = response.Body.Close() }()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, fmt.Errorf("unexpected update status %d", response.StatusCode)
	}

	data, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if release := decodeReleaseList(data, includePrerelease); release != nil {
		return release, nil
	}

	var release updateReleaseResponse
	if err := json.Unmarshal(data, &release); err != nil {
		return nil, err
	}
	return &release, nil
}

func releaseListURL(updateURL string) string {
	if strings.HasSuffix(updateURL, "/releases/latest") {
		return strings.TrimSuffix(updateURL, "/latest")
	}
	return updateURL
}

func decodeReleaseList(data []byte, includePrerelease bool) *updateReleaseResponse {
	var releases []updateReleaseResponse
	if err := json.Unmarshal(data, &releases); err != nil {
		return nil
	}
	for index := range releases {
		release := releases[index]
		if release.Draft || (!includePrerelease && release.Prerelease) {
			continue
		}
		if firstUpdateVersion(release.Version, release.TagName, release.Name) == "" {
			continue
		}
		return &release
	}
	return nil
}

func firstUpdateVersion(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func compareVersionStrings(latest, current string) int {
	latestParts := numericVersionParts(latest)
	currentParts := numericVersionParts(current)
	if len(latestParts) == 0 || len(currentParts) == 0 {
		return strings.Compare(strings.TrimSpace(latest), strings.TrimSpace(current))
	}

	length := len(latestParts)
	if len(currentParts) > length {
		length = len(currentParts)
	}
	for i := 0; i < length; i++ {
		var left, right int
		if i < len(latestParts) {
			left = latestParts[i]
		}
		if i < len(currentParts) {
			right = currentParts[i]
		}
		if left > right {
			return 1
		}
		if left < right {
			return -1
		}
	}
	latestPrerelease := versionPrerelease(latest)
	currentPrerelease := versionPrerelease(current)
	if latestPrerelease != "" && currentPrerelease == "" {
		return -1
	}
	if latestPrerelease == "" && currentPrerelease != "" {
		return 1
	}
	if latestPrerelease != "" || currentPrerelease != "" {
		return strings.Compare(latestPrerelease, currentPrerelease)
	}
	return 0
}

func numericVersionParts(value string) []int {
	cleaned := versionCore(value)
	matches := regexp.MustCompile(`\d+`).FindAllString(cleaned, -1)
	parts := make([]int, 0, len(matches))
	for _, match := range matches {
		var part int
		if _, err := fmt.Sscanf(match, "%d", &part); err == nil {
			parts = append(parts, part)
		}
	}
	return parts
}

func versionCore(value string) string {
	cleaned := strings.TrimPrefix(strings.TrimSpace(value), "v")
	if index := strings.IndexAny(cleaned, "-+"); index >= 0 {
		return cleaned[:index]
	}
	return cleaned
}

func versionPrerelease(value string) string {
	cleaned := strings.TrimPrefix(strings.TrimSpace(value), "v")
	start := strings.Index(cleaned, "-")
	if start < 0 {
		return ""
	}
	prerelease := cleaned[start+1:]
	if end := strings.Index(prerelease, "+"); end >= 0 {
		prerelease = prerelease[:end]
	}
	return prerelease
}

func (a *App) systemStorage(w http.ResponseWriter, r *http.Request) {
	categories := map[string]*storageUsageCategory{
		"database":     {Key: "database", Label: "Datenbank"},
		"images":       {Key: "images", Label: "Bilder"},
		"thumbnails":   {Key: "thumbnails", Label: "Vorschaubilder"},
		"attachments":  {Key: "attachments", Label: "Beilagen"},
		"decoderFiles": {Key: "decoderFiles", Label: "Decoder-Dateien"},
		"other":        {Key: "other", Label: "Sonstiges"},
	}

	var total int64
	err := filepath.WalkDir(a.dataDir, func(filePath string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}

		relativePath, err := filepath.Rel(a.dataDir, filePath)
		if err != nil {
			relativePath = filePath
		}
		key := storageCategoryKey(relativePath)
		category := categories[key]
		category.Bytes += info.Size()
		category.Files += 1
		total += info.Size()
		return nil
	})
	if err != nil {
		a.logger.Error("storage usage scan failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "storage_usage_failed", "Speichernutzung konnte nicht gelesen werden.")
		return
	}

	order := []string{"database", "images", "thumbnails", "attachments", "decoderFiles", "other"}
	result := make([]storageUsageCategory, 0, len(order))
	for _, key := range order {
		category := categories[key]
		if category.Files == 0 && key != "database" {
			continue
		}
		result = append(result, *category)
	}

	respondJSON(w, http.StatusOK, storageUsageResponse{
		TotalBytes: total,
		Categories: result,
		UpdatedAt:  time.Now().UTC().Format(time.RFC3339),
	})
}

func (a *App) systemPrinters(w http.ResponseWriter, r *http.Request) {
	response := discoverSystemPrinters()
	respondJSON(w, http.StatusOK, response)
}

func discoverSystemPrinters() systemPrintersResponse {
	if response := printersFromEnv(); len(response.Printers) > 0 {
		return response
	}

	switch runtime.GOOS {
	case "linux", "darwin":
		return printersFromLPStat()
	case "windows":
		return printersFromPowerShell()
	default:
		return systemPrintersResponse{
			Status:   "unavailable",
			Message:  "Druckerabfrage ist auf dieser Plattform nicht verfügbar. Der Browser-Systemdialog bleibt aktiv.",
			Printers: []systemPrinter{},
		}
	}
}

func printersFromEnv() systemPrintersResponse {
	configured := strings.TrimSpace(os.Getenv("RAILKEEPER_PRINTERS"))
	if configured == "" {
		return systemPrintersResponse{}
	}
	defaultPrinter := strings.TrimSpace(os.Getenv("RAILKEEPER_DEFAULT_PRINTER"))
	printers := []systemPrinter{}
	seen := map[string]struct{}{}
	for _, part := range strings.Split(configured, ",") {
		name := strings.TrimSpace(part)
		if name == "" {
			continue
		}
		id := printerID(name)
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		printers = append(printers, systemPrinter{
			ID:        id,
			Name:      name,
			IsDefault: defaultPrinter != "" && strings.EqualFold(defaultPrinter, name),
		})
	}
	if defaultPrinter == "" && len(printers) > 0 {
		printers[0].IsDefault = true
		defaultPrinter = printers[0].Name
	}
	return systemPrintersResponse{
		Status:         "configured",
		Message:        "Druckerliste wurde aus der RailKeeper-Konfiguration gelesen.",
		DefaultPrinter: defaultPrinter,
		Printers:       printers,
	}
}

func printersFromLPStat() systemPrintersResponse {
	namesOut, err := exec.Command("lpstat", "-e").Output()
	if err != nil {
		return systemPrintersResponse{
			Status:   "unavailable",
			Message:  "Keine Systemdrucker im Container oder auf dem Host ermittelbar. Der Browser-Systemdialog bleibt aktiv.",
			Printers: []systemPrinter{},
		}
	}
	defaultPrinter := ""
	if defaultOut, err := exec.Command("lpstat", "-d").Output(); err == nil {
		defaultPrinter = parseLPStatDefault(string(defaultOut))
	}
	printers := printersFromNames(strings.Fields(string(namesOut)), defaultPrinter)
	return systemPrintersResponse{
		Status:         "available",
		Message:        "Systemdrucker wurden über CUPS gelesen.",
		DefaultPrinter: defaultPrinter,
		Printers:       printers,
	}
}

func printersFromPowerShell() systemPrintersResponse {
	script := `Get-CimInstance Win32_Printer | Select-Object Name,Default | ConvertTo-Json -Compress`
	output, err := exec.Command("powershell", "-NoProfile", "-Command", script).Output()
	if err != nil {
		return systemPrintersResponse{
			Status:   "unavailable",
			Message:  "Windows-Drucker konnten nicht gelesen werden. Der Browser-Systemdialog bleibt aktiv.",
			Printers: []systemPrinter{},
		}
	}
	type windowsPrinter struct {
		Name    string `json:"Name"`
		Default bool   `json:"Default"`
	}
	var many []windowsPrinter
	if err := json.Unmarshal(output, &many); err != nil {
		var one windowsPrinter
		if err := json.Unmarshal(output, &one); err != nil {
			return systemPrintersResponse{
				Status:   "unavailable",
				Message:  "Windows-Druckerantwort konnte nicht ausgewertet werden.",
				Printers: []systemPrinter{},
			}
		}
		many = []windowsPrinter{one}
	}
	printers := []systemPrinter{}
	defaultPrinter := ""
	for _, printer := range many {
		name := strings.TrimSpace(printer.Name)
		if name == "" {
			continue
		}
		if printer.Default {
			defaultPrinter = name
		}
		printers = append(printers, systemPrinter{
			ID:        printerID(name),
			Name:      name,
			IsDefault: printer.Default,
		})
	}
	return systemPrintersResponse{
		Status:         "available",
		Message:        "Windows-Systemdrucker wurden gelesen.",
		DefaultPrinter: defaultPrinter,
		Printers:       printers,
	}
}

func parseLPStatDefault(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if index := strings.LastIndex(value, ":"); index >= 0 {
		return strings.TrimSpace(value[index+1:])
	}
	return ""
}

func printersFromNames(names []string, defaultPrinter string) []systemPrinter {
	printers := []systemPrinter{}
	seen := map[string]struct{}{}
	for _, rawName := range names {
		name := strings.TrimSpace(rawName)
		if name == "" {
			continue
		}
		id := printerID(name)
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		printers = append(printers, systemPrinter{
			ID:        id,
			Name:      name,
			IsDefault: defaultPrinter != "" && strings.EqualFold(defaultPrinter, name),
		})
	}
	return printers
}

func printerID(name string) string {
	id := strings.ToLower(strings.TrimSpace(name))
	id = regexp.MustCompile(`[^a-z0-9._-]+`).ReplaceAllString(id, "-")
	id = strings.Trim(id, "-")
	if id == "" {
		return "printer"
	}
	return id
}

func storageCategoryKey(relativePath string) string {
	clean := filepath.ToSlash(relativePath)
	name := path.Base(clean)
	if name == "railkeeper.db" || name == "railkeeper.db-wal" || name == "railkeeper.db-shm" {
		return "database"
	}
	parts := strings.Split(clean, "/")
	if pathContains(parts, "thumbs") {
		return "thumbnails"
	}
	if pathContains(parts, "images") {
		return "images"
	}
	if pathContains(parts, "cv") {
		return "decoderFiles"
	}
	if len(parts) > 0 && parts[0] == "uploads" {
		return "attachments"
	}
	return "other"
}

func pathContains(parts []string, needle string) bool {
	for _, part := range parts {
		if part == needle {
			return true
		}
	}
	return false
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
	allowed, ok := a.allowRequest(w, r, "setup", clientIP(r), 5, 10*time.Minute)
	if !ok {
		return
	}
	if !allowed {
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
	allowed, ok := a.allowRequest(w, r, "login", clientIP(r), 10, 5*time.Minute)
	if !ok {
		return
	}
	if !allowed {
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
	defaultMaxAttachmentBytes = 25 * 1024 * 1024
	defaultMaxImageBytes      = 10 * 1024 * 1024
)

func effectiveLimit(value, fallback int64) int64 {
	if value <= 0 {
		return fallback
	}
	return value
}

var safeFileNamePattern = regexp.MustCompile(`[^a-zA-Z0-9._-]+`)

var allowedAttachmentExtensions = map[string]struct{}{
	".csv":  {},
	".jpeg": {},
	".jpg":  {},
	".json": {},
	".pdf":  {},
	".png":  {},
	".txt":  {},
	".webp": {},
	".xml":  {},
	".zip":  {},
}

func effectiveAttachmentExtensions(input map[string]struct{}) map[string]struct{} {
	if len(input) == 0 {
		return allowedAttachmentExtensions
	}
	out := map[string]struct{}{}
	for extension := range input {
		extension = strings.ToLower(strings.TrimSpace(extension))
		if extension == "" {
			continue
		}
		if !strings.HasPrefix(extension, ".") {
			extension = "." + extension
		}
		if isBlockedAttachmentName("file" + extension) {
			continue
		}
		out[extension] = struct{}{}
	}
	if len(out) == 0 {
		return allowedAttachmentExtensions
	}
	return out
}

func (a *App) localizeVehicleImages(ctx context.Context, vehicleID string, images []application.VehicleImageInput) ([]application.VehicleImageInput, error) {
	out := make([]application.VehicleImageInput, len(images))
	copy(out, images)
	for index, image := range out {
		if image.StoragePath != "" || !strings.HasPrefix(strings.ToLower(image.URL), "http") {
			continue
		}
		localized, err := a.localizeVehicleImage(ctx, vehicleID, image)
		if err != nil {
			a.logger.Warn("article image localization skipped", "url", image.URL, "error", err)
			continue
		}
		out[index] = localized
	}
	return out, nil
}

func (a *App) localizeVehicleImage(ctx context.Context, vehicleID string, image application.VehicleImageInput) (application.VehicleImageInput, error) {
	if !isPublicImageURL(ctx, image.URL) {
		return image, fmt.Errorf("image url is not public http(s)")
	}
	requestCtx, cancel := context.WithTimeout(ctx, 6*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(requestCtx, http.MethodGet, image.URL, nil)
	if err != nil {
		return image, err
	}
	req.Header.Set("User-Agent", "RailKeeper2/0.1 image-fetch")
	req.Header.Set("Accept", "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8")
	client := &http.Client{Timeout: 6 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return image, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return image, fmt.Errorf("image fetch returned status %d", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, a.maxImageBytes+1))
	if err != nil || len(data) == 0 || int64(len(data)) > a.maxImageBytes {
		return image, fmt.Errorf("image size invalid")
	}
	mimeType := http.DetectContentType(data)
	if !isAllowedImageMime(mimeType) {
		return image, fmt.Errorf("image type %s is not allowed", mimeType)
	}
	storageName := fmt.Sprintf("%d-%s", time.Now().UTC().UnixNano(), remoteImageFileName(image, mimeType))
	storagePath := filepath.Join("uploads", "vehicles", safePathSegment(vehicleID), "images", storageName)
	fullPath, err := confinedDataPath(a.dataDir, storagePath)
	if err != nil {
		return image, err
	}
	if err = os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
		return image, err
	}
	if err = os.WriteFile(fullPath, data, 0o600); err != nil {
		return image, err
	}
	thumbnailPath, err := a.createVehicleImageThumbnail(data, vehicleID, storageName)
	if err != nil {
		a.logger.Warn("image thumbnail skipped", "url", image.URL, "error", err)
	}
	if image.SourceURL == "" {
		image.SourceURL = image.URL
	}
	image.FileName = storageName
	image.MimeType = mimeType
	image.StoragePath = storagePath
	image.ThumbnailPath = thumbnailPath
	return image, nil
}

func remoteImageFileName(image application.VehicleImageInput, mimeType string) string {
	extension := ".jpg"
	switch mimeType {
	case "image/png":
		extension = ".png"
	case "image/webp":
		extension = ".webp"
	}
	base := strings.TrimSpace(image.Title)
	if base == "" {
		if parsed, err := url.Parse(image.URL); err == nil {
			base = path.Base(parsed.Path)
		}
	}
	base = strings.TrimSuffix(base, filepath.Ext(base))
	if base == "" || base == "." || base == "/" {
		base = "artikelbild"
	}
	return safeAttachmentFileName(base + extension)
}

func isPublicImageURL(ctx context.Context, value string) bool {
	parsed, err := url.Parse(value)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Hostname() == "" {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	if host == "localhost" || strings.HasSuffix(host, ".localhost") {
		return false
	}
	if ip := net.ParseIP(host); ip != nil {
		return isPublicIP(ip)
	}
	lookupCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	addresses, err := net.DefaultResolver.LookupIPAddr(lookupCtx, host)
	if err != nil || len(addresses) == 0 {
		return false
	}
	for _, address := range addresses {
		if !isPublicIP(address.IP) {
			return false
		}
	}
	return true
}

func isPublicIP(ip net.IP) bool {
	return ip != nil &&
		!ip.IsLoopback() &&
		!ip.IsPrivate() &&
		!ip.IsLinkLocalUnicast() &&
		!ip.IsLinkLocalMulticast() &&
		!ip.IsMulticast() &&
		!ip.IsUnspecified()
}

func (a *App) uploadVehicleImage(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, a.maxImageBytes+1024*1024)
	if err := r.ParseMultipartForm(a.maxImageBytes); err != nil {
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
	if header.Size > a.maxImageBytes {
		respondProblem(w, http.StatusBadRequest, "image_too_large", "Das Bild ist zu gross.")
		return
	}
	data, err := io.ReadAll(io.LimitReader(file, a.maxImageBytes+1))
	if err != nil || int64(len(data)) > a.maxImageBytes {
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
	thumbnailPath, err := a.createVehicleImageThumbnail(data, vehicleID, storageName)
	if err != nil {
		a.logger.Warn("image thumbnail skipped", "file", header.Filename, "error", err)
	}
	image, err := a.vehicleService.CreateImage(r.Context(), vehicleID, application.VehicleImageInput{
		Title:         r.FormValue("title"),
		SourceURL:     r.FormValue("sourceUrl"),
		FileName:      storageName,
		MimeType:      mimeType,
		StoragePath:   storagePath,
		ThumbnailPath: thumbnailPath,
		MaintenanceID: r.FormValue("maintenanceId"),
		IsPrimary:     strings.EqualFold(r.FormValue("isPrimary"), "true"),
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
		if errors.Is(err, application.ErrVehicleImageInUse) {
			respondProblem(w, http.StatusConflict, "image_in_use", "Bild ist mit einem Wartungseintrag verknüpft. Bitte zuerst die Verknüpfung entfernen.")
			return
		}
		a.logger.Error("image delete failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "image_delete_failed", "Bild konnte nicht gelöscht werden.")
		return
	}
	a.removeVehicleImageFileIfUnreferenced(r.Context(), image.StoragePath)
	a.removeVehicleImageFileIfUnreferenced(r.Context(), image.ThumbnailPath)
	w.WriteHeader(http.StatusNoContent)
}

func (a *App) removeVehicleImageFileIfUnreferenced(ctx context.Context, storagePath string) {
	if storagePath == "" {
		return
	}
	references, err := a.vehicleService.ImageFileReferenceCount(ctx, storagePath)
	if err != nil {
		a.logger.Warn("image file reference check failed", "path", storagePath, "error", err)
		return
	}
	if references > 0 {
		return
	}
	if fullPath, err := confinedDataPath(a.dataDir, storagePath); err == nil {
		_ = os.Remove(fullPath)
	}
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

func (a *App) downloadVehicleImageThumbnail(w http.ResponseWriter, r *http.Request) {
	image, err := a.vehicleService.GetImage(r.Context(), r.PathValue("id"), r.PathValue("imageID"))
	if err != nil {
		if errors.Is(err, application.ErrVehicleNotFound) {
			respondProblem(w, http.StatusNotFound, "image_not_found", "Image not found.")
			return
		}
		a.logger.Error("image thumbnail lookup failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "image_thumbnail_failed", "Bildvorschau konnte nicht geladen werden.")
		return
	}
	if image.ThumbnailPath == "" {
		a.downloadVehicleImage(w, r)
		return
	}
	fullPath, err := confinedDataPath(a.dataDir, image.ThumbnailPath)
	if err != nil {
		respondProblem(w, http.StatusInternalServerError, "image_path_invalid", "Bildvorschau konnte nicht geladen werden.")
		return
	}
	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Content-Disposition", mime.FormatMediaType("inline", map[string]string{"filename": strings.TrimSuffix(path.Base(image.FileName), path.Ext(image.FileName)) + "-thumb.jpg"}))
	http.ServeFile(w, r, fullPath)
}

func (a *App) createVehicleImageThumbnail(data []byte, vehicleID, storageName string) (string, error) {
	src, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return "", err
	}
	thumb := scaleImageToFit(src, 360, 240)
	thumbnailName := strings.TrimSuffix(storageName, path.Ext(storageName)) + "-thumb.jpg"
	thumbnailPath := filepath.Join("uploads", "vehicles", safePathSegment(vehicleID), "images", "thumbs", thumbnailName)
	fullPath, err := confinedDataPath(a.dataDir, thumbnailPath)
	if err != nil {
		return "", err
	}
	if err = os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
		return "", err
	}
	out, err := os.Create(fullPath)
	if err != nil {
		return "", err
	}
	defer func() { _ = out.Close() }()
	if err = jpeg.Encode(out, thumb, &jpeg.Options{Quality: 82}); err != nil {
		return "", err
	}
	return thumbnailPath, nil
}

func scaleImageToFit(src image.Image, maxWidth, maxHeight int) image.Image {
	bounds := src.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()
	if width <= 0 || height <= 0 || (width <= maxWidth && height <= maxHeight) {
		return src
	}
	ratioW := float64(maxWidth) / float64(width)
	ratioH := float64(maxHeight) / float64(height)
	ratio := ratioW
	if ratioH < ratio {
		ratio = ratioH
	}
	dstWidth := max(1, int(float64(width)*ratio))
	dstHeight := max(1, int(float64(height)*ratio))
	dst := image.NewRGBA(image.Rect(0, 0, dstWidth, dstHeight))
	for y := range dstHeight {
		srcY := bounds.Min.Y + y*height/dstHeight
		for x := range dstWidth {
			srcX := bounds.Min.X + x*width/dstWidth
			dst.Set(x, y, src.At(srcX, srcY))
		}
	}
	return dst
}

func (a *App) uploadVehicleAttachment(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, a.maxAttachmentBytes+1024*1024)
	if err := r.ParseMultipartForm(a.maxAttachmentBytes); err != nil {
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
	originalName := cleanOriginalFileName(header.Filename)
	if header.Size > a.maxAttachmentBytes {
		respondProblem(w, http.StatusBadRequest, "attachment_too_large", "Die Datei ist zu gross.")
		return
	}
	if isBlockedAttachmentName(originalName) {
		respondProblem(w, http.StatusBadRequest, "attachment_type_blocked", "Ausführbare Dateien sind nicht erlaubt.")
		return
	}
	data, err := io.ReadAll(io.LimitReader(file, a.maxAttachmentBytes+1))
	if err != nil || int64(len(data)) > a.maxAttachmentBytes {
		respondProblem(w, http.StatusBadRequest, "attachment_too_large", "Die Datei ist zu gross.")
		return
	}
	if len(data) == 0 {
		respondProblem(w, http.StatusBadRequest, "attachment_empty", "Leere Dateien sind nicht erlaubt.")
		return
	}
	mimeType := http.DetectContentType(data)
	if isBlockedAttachmentMime(mimeType) {
		respondProblem(w, http.StatusBadRequest, "attachment_type_blocked", "Ausführbare Dateien sind nicht erlaubt.")
		return
	}
	if !a.isAllowedAttachmentUpload(originalName, mimeType) {
		respondProblem(w, http.StatusBadRequest, "attachment_type_blocked", "Erlaubt sind PDF, TXT, CSV, JSON, XML, ZIP sowie JPG, PNG und WebP.")
		return
	}
	vehicleID := r.PathValue("id")
	storageName := fmt.Sprintf("%d-%s", time.Now().UTC().UnixNano(), safeAttachmentFileName(originalName))
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
		FileName:      storageName,
		OriginalName:  originalName,
		Description:   r.FormValue("description"),
		Category:      r.FormValue("category"),
		MimeType:      mimeType,
		SizeBytes:     int64(len(data)),
		StoragePath:   storagePath,
		MaintenanceID: r.FormValue("maintenanceId"),
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
		respondProblem(w, http.StatusInternalServerError, "attachment_delete_failed", "Beilage konnte nicht gelöscht werden.")
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
	w.Header().Set("Content-Disposition", mime.FormatMediaType(disposition, map[string]string{"filename": cleanOriginalFileName(attachment.OriginalName)}))
	http.ServeFile(w, r, fullPath)
}

func (a *App) listVehicleMaintenance(w http.ResponseWriter, r *http.Request) {
	entries, err := a.vehicleService.ListMaintenance(r.Context(), r.PathValue("id"))
	if err != nil {
		if errors.Is(err, application.ErrVehicleNotFound) {
			respondProblem(w, http.StatusNotFound, "vehicle_not_found", "Vehicle not found.")
			return
		}
		a.logger.Error("maintenance list failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "maintenance_list_failed", "Wartungseintraege konnten nicht geladen werden.")
		return
	}
	respondJSON(w, http.StatusOK, entries)
}

func (a *App) createVehicleMaintenance(w http.ResponseWriter, r *http.Request) {
	var input application.VehicleMaintenanceInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondProblem(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}
	entry, err := a.vehicleService.CreateMaintenance(r.Context(), r.PathValue("id"), input)
	if err != nil {
		switch {
		case errors.Is(err, application.ErrVehicleValidation):
			respondProblem(w, http.StatusBadRequest, "maintenance_invalid", "Wartungseintrag ist unvollstaendig.")
		case errors.Is(err, application.ErrVehicleNotFound):
			respondProblem(w, http.StatusNotFound, "vehicle_not_found", "Vehicle not found.")
		default:
			a.logger.Error("maintenance create failed", "error", err)
			respondProblem(w, http.StatusInternalServerError, "maintenance_create_failed", "Wartungseintrag konnte nicht gespeichert werden.")
		}
		return
	}
	respondJSON(w, http.StatusCreated, entry)
}

func (a *App) updateVehicleMaintenance(w http.ResponseWriter, r *http.Request) {
	var input application.VehicleMaintenanceInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondProblem(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}
	entry, err := a.vehicleService.UpdateMaintenance(r.Context(), r.PathValue("id"), r.PathValue("maintenanceID"), input)
	if err != nil {
		switch {
		case errors.Is(err, application.ErrVehicleValidation):
			respondProblem(w, http.StatusBadRequest, "maintenance_invalid", "Wartungseintrag ist unvollstaendig.")
		case errors.Is(err, application.ErrVehicleNotFound):
			respondProblem(w, http.StatusNotFound, "maintenance_not_found", "Maintenance entry not found.")
		default:
			a.logger.Error("maintenance update failed", "error", err)
			respondProblem(w, http.StatusInternalServerError, "maintenance_update_failed", "Wartungseintrag konnte nicht aktualisiert werden.")
		}
		return
	}
	respondJSON(w, http.StatusOK, entry)
}

func (a *App) deleteVehicleMaintenance(w http.ResponseWriter, r *http.Request) {
	if _, err := a.vehicleService.DeleteMaintenance(r.Context(), r.PathValue("id"), r.PathValue("maintenanceID")); err != nil {
		if errors.Is(err, application.ErrVehicleNotFound) {
			respondProblem(w, http.StatusNotFound, "maintenance_not_found", "Maintenance entry not found.")
			return
		}
		a.logger.Error("maintenance delete failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "maintenance_delete_failed", "Wartungseintrag konnte nicht gelöscht werden.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *App) listVehicleFunctions(w http.ResponseWriter, r *http.Request) {
	functions, err := a.vehicleService.ListFunctions(r.Context(), r.PathValue("id"))
	if err != nil {
		if errors.Is(err, application.ErrVehicleNotFound) {
			respondProblem(w, http.StatusNotFound, "vehicle_not_found", "Vehicle not found.")
			return
		}
		a.logger.Error("function list failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "function_list_failed", "Digitalfunktionen konnten nicht geladen werden.")
		return
	}
	respondJSON(w, http.StatusOK, functions)
}

func (a *App) upsertVehicleFunction(w http.ResponseWriter, r *http.Request) {
	var input application.VehicleFunctionInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondProblem(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}
	function, err := a.vehicleService.UpsertFunction(r.Context(), r.PathValue("id"), r.PathValue("functionKey"), input)
	if err != nil {
		switch {
		case errors.Is(err, application.ErrVehicleValidation):
			respondProblem(w, http.StatusBadRequest, "function_invalid", "Digitalfunktion ist ungültig.")
		case errors.Is(err, application.ErrVehicleNotFound):
			respondProblem(w, http.StatusNotFound, "vehicle_not_found", "Vehicle not found.")
		default:
			a.logger.Error("function save failed", "error", err)
			respondProblem(w, http.StatusInternalServerError, "function_save_failed", "Digitalfunktion konnte nicht gespeichert werden.")
		}
		return
	}
	respondJSON(w, http.StatusOK, function)
}

func (a *App) deleteVehicleFunction(w http.ResponseWriter, r *http.Request) {
	if _, err := a.vehicleService.DeleteFunction(r.Context(), r.PathValue("id"), r.PathValue("functionKey")); err != nil {
		if errors.Is(err, application.ErrVehicleNotFound) {
			respondProblem(w, http.StatusNotFound, "function_not_found", "Function entry not found.")
			return
		}
		a.logger.Error("function delete failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "function_delete_failed", "Digitalfunktion konnte nicht gelöscht werden.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *App) listVehicleCVValues(w http.ResponseWriter, r *http.Request) {
	values, err := a.vehicleService.ListCVValues(r.Context(), r.PathValue("id"))
	if err != nil {
		if errors.Is(err, application.ErrVehicleNotFound) {
			respondProblem(w, http.StatusNotFound, "vehicle_not_found", "Vehicle not found.")
			return
		}
		a.logger.Error("cv value list failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "cv_value_list_failed", "CV-Werte konnten nicht geladen werden.")
		return
	}
	respondJSON(w, http.StatusOK, values)
}

func (a *App) createVehicleCVValue(w http.ResponseWriter, r *http.Request) {
	var input application.VehicleCVValueInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondProblem(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}
	value, err := a.vehicleService.CreateCVValue(r.Context(), r.PathValue("id"), input)
	if err != nil {
		switch {
		case errors.Is(err, application.ErrVehicleValidation):
			respondProblem(w, http.StatusBadRequest, "cv_value_invalid", "CV-Nummer muss 1-1024 und Wert 0-255 sein.")
		case errors.Is(err, application.ErrVehicleNotFound):
			respondProblem(w, http.StatusNotFound, "vehicle_not_found", "Vehicle not found.")
		default:
			a.logger.Error("cv value create failed", "error", err)
			respondProblem(w, http.StatusInternalServerError, "cv_value_create_failed", "CV-Wert konnte nicht gespeichert werden.")
		}
		return
	}
	respondJSON(w, http.StatusCreated, value)
}

func (a *App) updateVehicleCVValue(w http.ResponseWriter, r *http.Request) {
	var input application.VehicleCVValueInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondProblem(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}
	value, err := a.vehicleService.UpdateCVValue(r.Context(), r.PathValue("id"), r.PathValue("cvValueID"), input)
	if err != nil {
		switch {
		case errors.Is(err, application.ErrVehicleValidation):
			respondProblem(w, http.StatusBadRequest, "cv_value_invalid", "CV-Nummer muss 1-1024 und Wert 0-255 sein.")
		case errors.Is(err, application.ErrVehicleNotFound):
			respondProblem(w, http.StatusNotFound, "cv_value_not_found", "CV value not found.")
		default:
			a.logger.Error("cv value update failed", "error", err)
			respondProblem(w, http.StatusInternalServerError, "cv_value_update_failed", "CV-Wert konnte nicht aktualisiert werden.")
		}
		return
	}
	respondJSON(w, http.StatusOK, value)
}

func (a *App) deleteVehicleCVValue(w http.ResponseWriter, r *http.Request) {
	if _, err := a.vehicleService.DeleteCVValue(r.Context(), r.PathValue("id"), r.PathValue("cvValueID")); err != nil {
		if errors.Is(err, application.ErrVehicleNotFound) {
			respondProblem(w, http.StatusNotFound, "cv_value_not_found", "CV value not found.")
			return
		}
		a.logger.Error("cv value delete failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "cv_value_delete_failed", "CV-Wert konnte nicht gelöscht werden.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *App) previewVehicleCVFile(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, a.maxAttachmentBytes+1024*1024)
	if err := r.ParseMultipartForm(a.maxAttachmentBytes); err != nil {
		respondProblem(w, http.StatusBadRequest, "cv_file_preview_invalid", "CV-Datei konnte nicht gelesen werden.")
		return
	}
	if r.MultipartForm != nil {
		defer func() { _ = r.MultipartForm.RemoveAll() }()
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		respondProblem(w, http.StatusBadRequest, "cv_file_missing", "Eine Datei ist erforderlich.")
		return
	}
	defer func() { _ = file.Close() }()
	originalName := cleanOriginalFileName(header.Filename)
	if header.Size > a.maxAttachmentBytes || isBlockedAttachmentName(originalName) {
		respondProblem(w, http.StatusBadRequest, "cv_file_blocked", "Diese CV-Datei ist nicht erlaubt.")
		return
	}
	data, err := io.ReadAll(io.LimitReader(file, a.maxAttachmentBytes+1))
	if err != nil || int64(len(data)) > a.maxAttachmentBytes {
		respondProblem(w, http.StatusBadRequest, "cv_file_too_large", "Die Datei ist zu groß.")
		return
	}
	if len(data) == 0 {
		respondProblem(w, http.StatusBadRequest, "cv_file_empty", "Leere Dateien sind nicht erlaubt.")
		return
	}
	mimeType := http.DetectContentType(data)
	if isBlockedAttachmentMime(mimeType) {
		respondProblem(w, http.StatusBadRequest, "cv_file_blocked", "Diese CV-Datei ist nicht erlaubt.")
		return
	}
	respondJSON(w, http.StatusOK, esuxPreviewResponse(originalName, int64(len(data)), mimeType, data))
}

func (a *App) uploadVehicleCVFile(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, a.maxAttachmentBytes+1024*1024)
	if err := r.ParseMultipartForm(a.maxAttachmentBytes); err != nil {
		respondProblem(w, http.StatusBadRequest, "cv_file_upload_invalid", "CV-Datei konnte nicht gelesen werden.")
		return
	}
	if r.MultipartForm != nil {
		defer func() { _ = r.MultipartForm.RemoveAll() }()
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		respondProblem(w, http.StatusBadRequest, "cv_file_missing", "Eine Datei ist erforderlich.")
		return
	}
	defer func() { _ = file.Close() }()
	originalName := cleanOriginalFileName(header.Filename)
	if header.Size > a.maxAttachmentBytes || isBlockedAttachmentName(originalName) {
		respondProblem(w, http.StatusBadRequest, "cv_file_blocked", "Diese CV-Datei ist nicht erlaubt.")
		return
	}
	data, err := io.ReadAll(io.LimitReader(file, a.maxAttachmentBytes+1))
	if err != nil || int64(len(data)) > a.maxAttachmentBytes {
		respondProblem(w, http.StatusBadRequest, "cv_file_too_large", "Die Datei ist zu gross.")
		return
	}
	if len(data) == 0 {
		respondProblem(w, http.StatusBadRequest, "cv_file_empty", "Leere Dateien sind nicht erlaubt.")
		return
	}
	mimeType := http.DetectContentType(data)
	if isBlockedAttachmentMime(mimeType) {
		respondProblem(w, http.StatusBadRequest, "cv_file_blocked", "Diese CV-Datei ist nicht erlaubt.")
		return
	}
	vehicleID := r.PathValue("id")
	storageName := fmt.Sprintf("%d-%s", time.Now().UTC().UnixNano(), safeAttachmentFileName(originalName))
	storagePath := filepath.Join("uploads", "vehicles", safePathSegment(vehicleID), "cv", storageName)
	fullPath, err := confinedDataPath(a.dataDir, storagePath)
	if err != nil {
		respondProblem(w, http.StatusBadRequest, "cv_file_path_invalid", "CV-Datei konnte nicht gespeichert werden.")
		return
	}
	if err = os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
		a.logger.Error("cv file directory create failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "cv_file_upload_failed", "CV-Datei konnte nicht gespeichert werden.")
		return
	}
	if err = os.WriteFile(fullPath, data, 0o600); err != nil {
		a.logger.Error("cv file write failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "cv_file_upload_failed", "CV-Datei konnte nicht gespeichert werden.")
		return
	}
	decoderProfile, description := applyESUXMetadata(originalName, data, r.FormValue("decoderProfile"), r.FormValue("description"))
	cvFile, err := a.vehicleService.CreateCVFile(r.Context(), vehicleID, application.VehicleCVFileInput{
		FileName:       storageName,
		OriginalName:   originalName,
		Description:    description,
		DecoderProfile: decoderProfile,
		MimeType:       mimeType,
		SizeBytes:      int64(len(data)),
		StoragePath:    storagePath,
	})
	if err != nil {
		_ = os.Remove(fullPath)
		if errors.Is(err, application.ErrVehicleNotFound) {
			respondProblem(w, http.StatusNotFound, "vehicle_not_found", "Vehicle not found.")
			return
		}
		a.logger.Error("cv file metadata create failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "cv_file_upload_failed", "CV-Datei konnte nicht gespeichert werden.")
		return
	}
	respondJSON(w, http.StatusCreated, cvFile)
}

func (a *App) deleteVehicleCVFile(w http.ResponseWriter, r *http.Request) {
	file, err := a.vehicleService.DeleteCVFile(r.Context(), r.PathValue("id"), r.PathValue("cvFileID"))
	if err != nil {
		if errors.Is(err, application.ErrVehicleNotFound) {
			respondProblem(w, http.StatusNotFound, "cv_file_not_found", "CV file not found.")
			return
		}
		a.logger.Error("cv file delete failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "cv_file_delete_failed", "CV-Datei konnte nicht gelöscht werden.")
		return
	}
	if fullPath, err := confinedDataPath(a.dataDir, file.StoragePath); err == nil {
		_ = os.Remove(fullPath)
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *App) downloadVehicleCVFile(w http.ResponseWriter, r *http.Request) {
	file, err := a.vehicleService.GetCVFile(r.Context(), r.PathValue("id"), r.PathValue("cvFileID"))
	if err != nil {
		if errors.Is(err, application.ErrVehicleNotFound) {
			respondProblem(w, http.StatusNotFound, "cv_file_not_found", "CV file not found.")
			return
		}
		a.logger.Error("cv file download lookup failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "cv_file_download_failed", "CV-Datei konnte nicht geladen werden.")
		return
	}
	fullPath, err := confinedDataPath(a.dataDir, file.StoragePath)
	if err != nil {
		respondProblem(w, http.StatusInternalServerError, "cv_file_path_invalid", "CV-Datei konnte nicht geladen werden.")
		return
	}
	if file.MimeType != "" {
		w.Header().Set("Content-Type", file.MimeType)
	}
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": cleanOriginalFileName(file.OriginalName)}))
	http.ServeFile(w, r, fullPath)
}

const maxBackupBytes = 250 * 1024 * 1024
const maxMasterDataImportBytes = 25 * 1024 * 1024

func (a *App) exportBackup(w http.ResponseWriter, r *http.Request) {
	backup, err := a.backupService.Export(r.Context())
	if err != nil {
		a.logger.Error("backup export failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "backup_export_failed", "Backup konnte nicht erstellt werden.")
		return
	}

	filename := "railkeeper2-backup-" + time.Now().UTC().Format("20060102-150405") + ".json"
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": filename}))
	if err := json.NewEncoder(w).Encode(backup); err != nil {
		a.logger.Error("backup encode failed", "error", err)
	}
}

func (a *App) restoreBackup(w http.ResponseWriter, r *http.Request) {
	backup, ok := a.readBackupUpload(w, r)
	if !ok {
		return
	}

	result, err := a.backupService.Import(r.Context(), backup)
	if err != nil {
		switch {
		case errors.Is(err, application.ErrBackupInvalid), errors.Is(err, application.ErrBackupPath):
			respondProblem(w, http.StatusBadRequest, "backup_restore_invalid", "Backup-Datei ist ungültig.")
		default:
			a.logger.Error("backup restore failed", "error", err)
			respondProblem(w, http.StatusInternalServerError, "backup_restore_failed", "Backup konnte nicht wiederhergestellt werden.")
		}
		return
	}
	if a.masterDataService != nil {
		if err := a.masterDataService.WarmCache(r.Context()); err != nil {
			a.logger.Error("master data cache refresh after backup restore failed", "error", err)
		}
	}
	respondJSON(w, http.StatusOK, result)
}

func (a *App) validateBackup(w http.ResponseWriter, r *http.Request) {
	backup, ok := a.readBackupUpload(w, r)
	if !ok {
		return
	}
	result, err := a.backupService.Validate(r.Context(), backup)
	if err != nil {
		a.logger.Error("backup validation failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "backup_validation_failed", "Backup konnte nicht geprüft werden.")
		return
	}
	respondJSON(w, http.StatusOK, result)
}

func (a *App) readBackupUpload(w http.ResponseWriter, r *http.Request) (*application.BackupDocument, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, maxBackupBytes+1024*1024)
	if err := r.ParseMultipartForm(maxBackupBytes); err != nil {
		respondProblem(w, http.StatusBadRequest, "backup_restore_invalid", "Backup-Datei konnte nicht gelesen werden.")
		return nil, false
	}
	if r.MultipartForm != nil {
		defer func() { _ = r.MultipartForm.RemoveAll() }()
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		respondProblem(w, http.StatusBadRequest, "backup_file_missing", "Eine Backup-Datei ist erforderlich.")
		return nil, false
	}
	defer func() { _ = file.Close() }()
	if header.Size > maxBackupBytes {
		respondProblem(w, http.StatusBadRequest, "backup_file_too_large", "Die Backup-Datei ist zu gross.")
		return nil, false
	}
	data, err := io.ReadAll(io.LimitReader(file, maxBackupBytes+1))
	if err != nil || int64(len(data)) > maxBackupBytes {
		respondProblem(w, http.StatusBadRequest, "backup_file_too_large", "Die Backup-Datei ist zu gross.")
		return nil, false
	}

	backup, err := application.DecodeBackup(data)
	if err != nil {
		respondProblem(w, http.StatusBadRequest, "backup_restore_invalid", "Backup-Datei ist ungültig.")
		return nil, false
	}
	return backup, true
}

func (a *App) exportMasterData(w http.ResponseWriter, r *http.Request) {
	doc, err := a.masterDataService.Export(r.Context())
	if err != nil {
		a.logger.Error("master data export failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "master_data_export_failed", "Stammdaten konnten nicht exportiert werden.")
		return
	}
	filename := "railkeeper2-stammdaten-" + time.Now().UTC().Format("20060102-150405") + ".json"
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": filename}))
	if err := json.NewEncoder(w).Encode(doc); err != nil {
		a.logger.Error("master data encode failed", "error", err)
	}
}

func (a *App) importMasterData(w http.ResponseWriter, r *http.Request) {
	doc, ok := a.readMasterDataImportUpload(w, r)
	if !ok {
		return
	}
	result, err := a.masterDataService.Import(r.Context(), doc)
	if err != nil {
		if errors.Is(err, application.ErrMasterDataValidation) {
			respondProblem(w, http.StatusBadRequest, "master_data_import_invalid", "Stammdaten-Datei ist ungültig.")
			return
		}
		a.logger.Error("master data import failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "master_data_import_failed", "Stammdaten konnten nicht importiert werden.")
		return
	}
	if err := a.masterDataService.WarmCache(r.Context()); err != nil {
		a.logger.Error("master data cache refresh after import failed", "error", err)
	}
	respondJSON(w, http.StatusOK, result)
}

func (a *App) readMasterDataImportUpload(w http.ResponseWriter, r *http.Request) (*application.MasterDataDocument, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, maxMasterDataImportBytes+1024*1024)
	if err := r.ParseMultipartForm(maxMasterDataImportBytes); err != nil {
		respondProblem(w, http.StatusBadRequest, "master_data_import_invalid", "Stammdaten-Datei konnte nicht gelesen werden.")
		return nil, false
	}
	if r.MultipartForm != nil {
		defer func() { _ = r.MultipartForm.RemoveAll() }()
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		respondProblem(w, http.StatusBadRequest, "master_data_file_missing", "Eine Stammdaten-Datei ist erforderlich.")
		return nil, false
	}
	defer func() { _ = file.Close() }()
	if header.Size > maxMasterDataImportBytes {
		respondProblem(w, http.StatusBadRequest, "master_data_file_too_large", "Die Stammdaten-Datei ist zu gross.")
		return nil, false
	}
	data, err := io.ReadAll(io.LimitReader(file, maxMasterDataImportBytes+1))
	if err != nil || int64(len(data)) > maxMasterDataImportBytes {
		respondProblem(w, http.StatusBadRequest, "master_data_file_too_large", "Die Stammdaten-Datei ist zu gross.")
		return nil, false
	}
	var doc application.MasterDataDocument
	if err := json.Unmarshal(data, &doc); err != nil {
		respondProblem(w, http.StatusBadRequest, "master_data_import_invalid", "Stammdaten-Datei ist ungültig.")
		return nil, false
	}
	return &doc, true
}

func cleanOriginalFileName(value string) string {
	value = strings.TrimSpace(strings.ReplaceAll(value, "\\", "/"))
	value = strings.TrimSpace(path.Base(value))
	if value == "" || value == "." || value == "/" {
		return "beilage"
	}
	return value
}

func safeAttachmentFileName(value string) string {
	value = cleanOriginalFileName(value)
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

func isAllowedAttachmentUpload(filename, mimeType string) bool {
	return isAllowedAttachmentUploadWithExtensions(filename, mimeType, allowedAttachmentExtensions)
}

func (a *App) isAllowedAttachmentUpload(filename, mimeType string) bool {
	return isAllowedAttachmentUploadWithExtensions(filename, mimeType, a.allowedAttachmentExtensions)
}

func isAllowedAttachmentUploadWithExtensions(filename, mimeType string, extensions map[string]struct{}) bool {
	if isBlockedAttachmentName(filename) || isBlockedAttachmentMime(mimeType) {
		return false
	}
	extension := strings.ToLower(filepath.Ext(filename))
	if _, ok := extensions[extension]; !ok {
		return false
	}
	mimeType = strings.ToLower(strings.TrimSpace(strings.Split(mimeType, ";")[0]))
	switch extension {
	case ".pdf":
		return mimeType == "application/pdf"
	case ".jpg", ".jpeg":
		return mimeType == "image/jpeg"
	case ".png":
		return mimeType == "image/png"
	case ".webp":
		return mimeType == "image/webp"
	case ".zip":
		return mimeType == "application/zip" || mimeType == "application/x-zip-compressed" || mimeType == "application/octet-stream"
	case ".txt", ".csv", ".json", ".xml":
		return strings.HasPrefix(mimeType, "text/") ||
			mimeType == "application/json" ||
			mimeType == "application/xml"
	default:
		return false
	}
}

func isAllowedImageMime(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "image/jpeg", "image/png", "image/webp":
		return true
	default:
		return false
	}
}

type rateLimitStore interface {
	Allow(ctx context.Context, scope, key string, limit int, window time.Duration) (bool, error)
}

type rateLimiter struct {
	mu       sync.Mutex
	attempts map[string][]time.Time
}

func newRateLimiter() *rateLimiter {
	return &rateLimiter{attempts: map[string][]time.Time{}}
}

func (r *rateLimiter) Allow(ctx context.Context, scope, key string, limit int, window time.Duration) (bool, error) {
	if r == nil {
		return true, nil
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
		return false, nil
	}
	r.attempts[compoundKey] = append(filtered, now)
	return true, nil
}

func (a *App) allowRequest(w http.ResponseWriter, r *http.Request, scope, key string, limit int, window time.Duration) (bool, bool) {
	allowed, err := a.rateLimits.Allow(r.Context(), scope, key, limit, window)
	if err != nil {
		a.logger.Error("rate limit check failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "rate_limit_failed", "Could not verify request rate limit.")
		return false, false
	}
	return allowed, true
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
