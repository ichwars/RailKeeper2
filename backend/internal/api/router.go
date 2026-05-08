package api

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"railkeeper2/backend/internal/application"
)

type Config struct {
	Version           string
	StaticDir         string
	Logger            *slog.Logger
	SetupService      *application.SetupService
	AuthService       *application.AuthService
	VehicleService    *application.VehicleService
	MasterDataService *application.MasterDataService
	CookieSecure      bool
}

type App struct {
	version           string
	staticDir         string
	logger            *slog.Logger
	setupService      *application.SetupService
	authService       *application.AuthService
	vehicleService    *application.VehicleService
	masterDataService *application.MasterDataService
	cookieSecure      bool
}

func NewRouter(config Config) http.Handler {
	if config.Logger == nil {
		config.Logger = slog.Default()
	}
	app := &App{
		version:           config.Version,
		staticDir:         config.StaticDir,
		logger:            config.Logger,
		setupService:      config.SetupService,
		authService:       config.AuthService,
		vehicleService:    config.VehicleService,
		masterDataService: config.MasterDataService,
		cookieSecure:      config.CookieSecure,
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
		if errors.Is(err, application.ErrVehicleValidation) {
			respondProblem(w, http.StatusBadRequest, "vehicle_validation", "Manufacturer, name and gauge are required.")
			return
		}
		a.logger.Error("vehicle create failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "vehicle_create_failed", "Could not create vehicle.")
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
		case errors.Is(err, application.ErrVehicleValidation):
			respondProblem(w, http.StatusBadRequest, "vehicle_validation", "Manufacturer, name and gauge are required.")
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
			fileServer.ServeHTTP(w, r)
			return
		}

		http.ServeFile(w, r, filepath.Join(staticDir, "index.html"))
	})
}
