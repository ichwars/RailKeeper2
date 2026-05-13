package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"railkeeper2/backend/internal/application"
)

func (a *App) listUsers(w http.ResponseWriter, r *http.Request) {
	users, err := a.authService.ListUsers(r.Context())
	if err != nil {
		a.logger.Error("user list failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "user_list_failed", "Benutzer konnten nicht gelesen werden.")
		return
	}
	respondJSON(w, http.StatusOK, users)
}

func (a *App) listRoles(w http.ResponseWriter, r *http.Request) {
	roles, err := a.authService.ListRoles(r.Context())
	if err != nil {
		a.logger.Error("role list failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "role_list_failed", "Rollen konnten nicht gelesen werden.")
		return
	}
	respondJSON(w, http.StatusOK, roles)
}

func (a *App) createUser(w http.ResponseWriter, r *http.Request) {
	var input application.CreateUserInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondProblem(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}
	user, err := a.authService.CreateUser(r.Context(), actorUserID(r), input)
	if err != nil {
		handleUserError(a, w, err, "user_create_failed", "Benutzer konnte nicht angelegt werden.")
		return
	}
	respondJSON(w, http.StatusCreated, user)
}

func (a *App) updateUser(w http.ResponseWriter, r *http.Request) {
	var input application.UpdateUserInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondProblem(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}
	user, err := a.authService.UpdateUser(r.Context(), actorUserID(r), r.PathValue("id"), input)
	if err != nil {
		handleUserError(a, w, err, "user_update_failed", "Benutzer konnte nicht gespeichert werden.")
		return
	}
	respondJSON(w, http.StatusOK, user)
}

func (a *App) deleteUser(w http.ResponseWriter, r *http.Request) {
	if err := a.authService.DeleteUser(r.Context(), actorUserID(r), r.PathValue("id")); err != nil {
		handleUserError(a, w, err, "user_delete_failed", "Benutzer konnte nicht gelöscht werden.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func handleUserError(a *App, w http.ResponseWriter, err error, code, message string) {
	switch {
	case errors.Is(err, application.ErrUserValidation):
		respondProblem(w, http.StatusBadRequest, "user_validation", "Benutzername, gueltige E-Mail, Rollen und ein Passwort mit mindestens 12 Zeichen sind erforderlich.")
	case errors.Is(err, application.ErrDuplicateUser):
		respondProblem(w, http.StatusConflict, "user_duplicate", "Dieser Benutzername ist bereits vergeben.")
	case errors.Is(err, application.ErrUserNotFound):
		respondProblem(w, http.StatusNotFound, "user_not_found", "Benutzer wurde nicht gefunden.")
	case errors.Is(err, application.ErrLastAdmin):
		respondProblem(w, http.StatusConflict, "last_admin", "Der letzte Admin darf nicht entfernt werden.")
	default:
		a.logger.Error(message, "error", err)
		respondProblem(w, http.StatusInternalServerError, code, message)
	}
}
