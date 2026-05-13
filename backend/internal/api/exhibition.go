package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"railkeeper2/backend/internal/application"
)

type exhibitionLockInput struct {
	Locked bool `json:"locked"`
}

func (a *App) listExhibitionLists(w http.ResponseWriter, r *http.Request) {
	lists, err := a.exhibitionService.List(r.Context())
	if err != nil {
		a.logger.Error("exhibition list failed", "error", err)
		respondProblem(w, http.StatusInternalServerError, "exhibition_list_failed", "Could not list exhibition lists.")
		return
	}
	respondJSON(w, http.StatusOK, lists)
}

func (a *App) createExhibitionList(w http.ResponseWriter, r *http.Request) {
	var input application.ExhibitionListInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondProblem(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}
	list, err := a.exhibitionService.Create(r.Context(), input)
	if err != nil {
		handleExhibitionError(a, w, err, "exhibition_create_failed", "Could not create exhibition list.")
		return
	}
	a.recordAudit(r, "ExhibitionListCreated", "exhibition_list", list.ID)
	respondJSON(w, http.StatusCreated, list)
}

func (a *App) getExhibitionList(w http.ResponseWriter, r *http.Request) {
	list, err := a.exhibitionService.Get(r.Context(), r.PathValue("id"))
	if err != nil {
		handleExhibitionError(a, w, err, "exhibition_get_failed", "Could not read exhibition list.")
		return
	}
	respondJSON(w, http.StatusOK, list)
}

func (a *App) updateExhibitionList(w http.ResponseWriter, r *http.Request) {
	var input application.ExhibitionListInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondProblem(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}
	list, err := a.exhibitionService.Update(r.Context(), r.PathValue("id"), input)
	if err != nil {
		handleExhibitionError(a, w, err, "exhibition_update_failed", "Could not update exhibition list.")
		return
	}
	a.recordAudit(r, "ExhibitionListUpdated", "exhibition_list", list.ID)
	respondJSON(w, http.StatusOK, list)
}

func (a *App) deleteExhibitionList(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := a.exhibitionService.Delete(r.Context(), id); err != nil {
		handleExhibitionError(a, w, err, "exhibition_delete_failed", "Could not delete exhibition list.")
		return
	}
	a.recordAudit(r, "ExhibitionListDeleted", "exhibition_list", id)
	w.WriteHeader(http.StatusNoContent)
}

func (a *App) setExhibitionListLocked(w http.ResponseWriter, r *http.Request) {
	var input exhibitionLockInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondProblem(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}
	list, err := a.exhibitionService.SetLocked(r.Context(), r.PathValue("id"), input.Locked)
	if err != nil {
		handleExhibitionError(a, w, err, "exhibition_lock_failed", "Could not update exhibition lock state.")
		return
	}
	if list.Locked {
		a.recordAudit(r, "ExhibitionListLocked", "exhibition_list", list.ID)
	} else {
		a.recordAudit(r, "ExhibitionListUnlocked", "exhibition_list", list.ID)
	}
	respondJSON(w, http.StatusOK, list)
}

func (a *App) listExhibitionEntries(w http.ResponseWriter, r *http.Request) {
	entries, err := a.exhibitionService.ListEntries(r.Context(), r.PathValue("id"))
	if err != nil {
		handleExhibitionError(a, w, err, "exhibition_entries_failed", "Could not list exhibition entries.")
		return
	}
	respondJSON(w, http.StatusOK, entries)
}

func (a *App) createExhibitionEntry(w http.ResponseWriter, r *http.Request) {
	var input application.ExhibitionEntryInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondProblem(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}
	entry, err := a.exhibitionService.CreateEntry(r.Context(), r.PathValue("id"), input)
	if err != nil {
		handleExhibitionError(a, w, err, "exhibition_entry_create_failed", "Could not create exhibition entry.")
		return
	}
	a.recordAudit(r, "ExhibitionEntryCreated", "exhibition_entry", entry.ID)
	respondJSON(w, http.StatusCreated, entry)
}

func (a *App) updateExhibitionEntry(w http.ResponseWriter, r *http.Request) {
	var input application.ExhibitionEntryInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondProblem(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}
	entry, err := a.exhibitionService.UpdateEntry(r.Context(), r.PathValue("id"), r.PathValue("entryID"), input)
	if err != nil {
		handleExhibitionError(a, w, err, "exhibition_entry_update_failed", "Could not update exhibition entry.")
		return
	}
	a.recordAudit(r, "ExhibitionEntryUpdated", "exhibition_entry", entry.ID)
	respondJSON(w, http.StatusOK, entry)
}

func (a *App) deleteExhibitionEntry(w http.ResponseWriter, r *http.Request) {
	entryID := r.PathValue("entryID")
	if err := a.exhibitionService.DeleteEntry(r.Context(), r.PathValue("id"), entryID); err != nil {
		handleExhibitionError(a, w, err, "exhibition_entry_delete_failed", "Could not delete exhibition entry.")
		return
	}
	a.recordAudit(r, "ExhibitionEntryDeleted", "exhibition_entry", entryID)
	w.WriteHeader(http.StatusNoContent)
}

func (a *App) recordAudit(r *http.Request, action, targetType, targetID string) {
	if a.authService == nil {
		return
	}
	if err := a.authService.RecordAudit(r.Context(), actorUserID(r), action, targetType, targetID, "{}"); err != nil {
		a.logger.Warn("audit write failed", "action", action, "targetType", targetType, "targetID", targetID, "error", err)
	}
}

func handleExhibitionError(a *App, w http.ResponseWriter, err error, code, message string) {
	switch {
	case errors.Is(err, application.ErrExhibitionValidation):
		respondProblem(w, http.StatusBadRequest, "exhibition_validation", "Bezeichnung, Datum, Besitzer und Lok-Bezeichnung sind erforderlich.")
	case errors.Is(err, application.ErrExhibitionNotFound):
		respondProblem(w, http.StatusNotFound, "exhibition_not_found", "Exhibition list or entry not found.")
	case errors.Is(err, application.ErrExhibitionLocked):
		respondProblem(w, http.StatusConflict, "exhibition_locked", "Diese Messeliste ist gesperrt.")
	default:
		a.logger.Error(message, "error", err)
		respondProblem(w, http.StatusInternalServerError, code, message)
	}
}
