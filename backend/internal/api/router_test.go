package api

import (
	"bytes"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"railkeeper2/backend/internal/application"
	"railkeeper2/backend/internal/infrastructure"
)

func TestSecurityHeaders(t *testing.T) {
	handler := securityHeaders(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/health", nil))

	headers := recorder.Result().Header
	if headers.Get("X-Content-Type-Options") != "nosniff" {
		t.Fatalf("missing nosniff header")
	}
	if headers.Get("X-Frame-Options") != "DENY" {
		t.Fatalf("missing frame blocking header")
	}
	if headers.Get("Content-Security-Policy") == "" {
		t.Fatalf("missing content security policy")
	}
}

func TestConfinedDataPathRejectsEscapes(t *testing.T) {
	dataDir := t.TempDir()
	if _, err := confinedDataPath(dataDir, "uploads/vehicle/manual.pdf"); err != nil {
		t.Fatalf("expected valid confined path: %v", err)
	}
	if _, err := confinedDataPath(dataDir, "../outside.pdf"); err == nil {
		t.Fatalf("expected path escape to be rejected")
	}
}

func TestAttachmentSafetyHelpers(t *testing.T) {
	if !isBlockedAttachmentName("setup.exe") {
		t.Fatalf("expected executable extension to be blocked")
	}
	if isBlockedAttachmentName("manual.pdf") {
		t.Fatalf("expected pdf extension to be allowed")
	}
	if !isBlockedAttachmentMime("application/x-msdownload") {
		t.Fatalf("expected executable mime type to be blocked")
	}
	if isBlockedAttachmentMime("application/pdf") {
		t.Fatalf("expected pdf mime type to be allowed")
	}
	if cleanOriginalFileName(`C:\Users\daniel\Downloads\manual.pdf`) != "manual.pdf" {
		t.Fatalf("expected original filename cleanup to strip client path")
	}
	if !isAllowedAttachmentUpload("manual.pdf", "application/pdf") {
		t.Fatalf("expected pdf upload to be allowed")
	}
	if !isAllowedAttachmentUpload("daten.json", "text/plain; charset=utf-8") {
		t.Fatalf("expected text-like json upload to be allowed")
	}
	if isAllowedAttachmentUpload("manual.pdf", "text/plain; charset=utf-8") {
		t.Fatalf("expected mismatched pdf mime type to be rejected")
	}
	if isAllowedAttachmentUpload("script.js", "text/plain; charset=utf-8") {
		t.Fatalf("expected blocked executable-like extension to be rejected")
	}
	if isAllowedAttachmentUpload("unknown.bin", "application/octet-stream") {
		t.Fatalf("expected unknown attachment type to be rejected")
	}
	onlyPDF := map[string]struct{}{".pdf": {}}
	if !isAllowedAttachmentUploadWithExtensions("manual.pdf", "application/pdf", onlyPDF) {
		t.Fatalf("expected configured pdf extension to be allowed")
	}
	if isAllowedAttachmentUploadWithExtensions("daten.json", "application/json", onlyPDF) {
		t.Fatalf("expected non-configured json extension to be rejected")
	}
	unsafeOnly := effectiveAttachmentExtensions(map[string]struct{}{".exe": {}})
	if _, ok := unsafeOnly[".exe"]; ok {
		t.Fatalf("expected unsafe configured extension to be ignored")
	}
}

func TestCreateVehicleImageThumbnailSupportsWebP(t *testing.T) {
	data, err := base64.StdEncoding.DecodeString("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA")
	if err != nil {
		t.Fatal(err)
	}
	app := &App{dataDir: t.TempDir()}

	thumbnailPath, err := app.createVehicleImageThumbnail(data, "vehicle-1", "side.webp")
	if err != nil {
		t.Fatalf("expected webp thumbnail: %v", err)
	}
	if !strings.HasSuffix(thumbnailPath, "-thumb.jpg") {
		t.Fatalf("expected jpeg thumbnail path, got %q", thumbnailPath)
	}
	if _, err := os.Stat(filepath.Join(app.dataDir, thumbnailPath)); err != nil {
		t.Fatalf("expected thumbnail file: %v", err)
	}
}

func TestRateLimiterBlocksAfterLimit(t *testing.T) {
	limiter := newRateLimiter()
	allowed, err := limiter.Allow(t.Context(), "login", "127.0.0.1", 2, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	if !allowed {
		t.Fatalf("first attempt should be allowed")
	}
	allowed, err = limiter.Allow(t.Context(), "login", "127.0.0.1", 2, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	if !allowed {
		t.Fatalf("second attempt should be allowed")
	}
	allowed, err = limiter.Allow(t.Context(), "login", "127.0.0.1", 2, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	if allowed {
		t.Fatalf("third attempt should be blocked")
	}
}

func TestPrinterHelpers(t *testing.T) {
	if got := parseLPStatDefault("system default destination: Office_Printer"); got != "Office_Printer" {
		t.Fatalf("unexpected default printer %q", got)
	}
	printers := printersFromNames([]string{"Office Printer", "Office Printer", "Label"}, "Label")
	if len(printers) != 2 {
		t.Fatalf("expected deduplicated printers, got %#v", printers)
	}
	if printers[0].ID != "office-printer" || printers[1].ID != "label" || !printers[1].IsDefault {
		t.Fatalf("unexpected printers: %#v", printers)
	}
}

func TestAuditLimit(t *testing.T) {
	cases := map[string]int{
		"":    50,
		"-1":  50,
		"25":  25,
		"500": 200,
	}
	for input, want := range cases {
		if got := auditLimit(input); got != want {
			t.Fatalf("auditLimit(%q) = %d, want %d", input, got, want)
		}
	}
}

func TestChangePasswordEndpoint(t *testing.T) {
	db := testRouterDB(t)
	setup := application.NewSetupService(db)
	auth := application.NewAuthService(db)
	if err := setup.CreateAdmin(t.Context(), application.CreateAdminInput{
		Username: "admin",
		Password: "very-secure-password",
	}); err != nil {
		t.Fatal(err)
	}

	router := NewRouter(Config{SetupService: setup, AuthService: auth})
	loginBody := bytes.NewBufferString(`{"username":"admin","password":"very-secure-password"}`)
	loginRequest := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", loginBody)
	loginRequest.Header.Set("Content-Type", "application/json")
	loginResponse := httptest.NewRecorder()
	router.ServeHTTP(loginResponse, loginRequest)
	if loginResponse.Code != http.StatusOK {
		t.Fatalf("expected login success, got %d", loginResponse.Code)
	}
	var session application.SessionView
	if err := json.NewDecoder(loginResponse.Body).Decode(&session); err != nil {
		t.Fatal(err)
	}

	changeBody := bytes.NewBufferString(`{"currentPassword":"very-secure-password","newPassword":"new-secure-password"}`)
	changeRequest := httptest.NewRequest(http.MethodPut, "/api/v1/auth/password", changeBody)
	changeRequest.Header.Set("Content-Type", "application/json")
	changeRequest.Header.Set("X-CSRF-Token", session.CSRFToken)
	for _, cookie := range loginResponse.Result().Cookies() {
		changeRequest.AddCookie(cookie)
	}
	changeResponse := httptest.NewRecorder()
	router.ServeHTTP(changeResponse, changeRequest)
	if changeResponse.Code != http.StatusNoContent {
		t.Fatalf("expected password change success, got %d: %s", changeResponse.Code, changeResponse.Body.String())
	}

	oldLogin := httptest.NewRecorder()
	router.ServeHTTP(oldLogin, httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewBufferString(`{"username":"admin","password":"very-secure-password"}`)))
	if oldLogin.Code != http.StatusUnauthorized {
		t.Fatalf("expected old password to fail, got %d", oldLogin.Code)
	}
	newLogin := httptest.NewRecorder()
	router.ServeHTTP(newLogin, httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewBufferString(`{"username":"admin","password":"new-secure-password"}`)))
	if newLogin.Code != http.StatusOK {
		t.Fatalf("expected new password to work, got %d", newLogin.Code)
	}
}

func TestSessionListAndRevokeEndpoints(t *testing.T) {
	db := testRouterDB(t)
	setup := application.NewSetupService(db)
	auth := application.NewAuthService(db)
	if err := setup.CreateAdmin(t.Context(), application.CreateAdminInput{
		Username: "admin",
		Password: "very-secure-password",
	}); err != nil {
		t.Fatal(err)
	}

	router := NewRouter(Config{SetupService: setup, AuthService: auth})
	loginBody := bytes.NewBufferString(`{"username":"admin","password":"very-secure-password"}`)
	loginRequest := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", loginBody)
	loginResponse := httptest.NewRecorder()
	router.ServeHTTP(loginResponse, loginRequest)
	if loginResponse.Code != http.StatusOK {
		t.Fatalf("expected login success, got %d", loginResponse.Code)
	}
	var session application.SessionView
	if err := json.NewDecoder(loginResponse.Body).Decode(&session); err != nil {
		t.Fatal(err)
	}

	listRequest := httptest.NewRequest(http.MethodGet, "/api/v1/sessions", nil)
	for _, cookie := range loginResponse.Result().Cookies() {
		listRequest.AddCookie(cookie)
	}
	listResponse := httptest.NewRecorder()
	router.ServeHTTP(listResponse, listRequest)
	if listResponse.Code != http.StatusOK {
		t.Fatalf("expected session list success, got %d: %s", listResponse.Code, listResponse.Body.String())
	}
	var sessions []application.SessionRecord
	if err := json.NewDecoder(listResponse.Body).Decode(&sessions); err != nil {
		t.Fatal(err)
	}
	if len(sessions) != 1 || !sessions[0].Active {
		t.Fatalf("expected one active session, got %#v", sessions)
	}

	revokeRequest := httptest.NewRequest(http.MethodPut, "/api/v1/sessions/"+sessions[0].ID+"/revoke", nil)
	revokeRequest.Header.Set("X-CSRF-Token", session.CSRFToken)
	for _, cookie := range loginResponse.Result().Cookies() {
		revokeRequest.AddCookie(cookie)
	}
	revokeResponse := httptest.NewRecorder()
	router.ServeHTTP(revokeResponse, revokeRequest)
	if revokeResponse.Code != http.StatusNoContent {
		t.Fatalf("expected revoke success, got %d: %s", revokeResponse.Code, revokeResponse.Body.String())
	}

	currentRequest := httptest.NewRequest(http.MethodGet, "/api/v1/auth/session", nil)
	for _, cookie := range loginResponse.Result().Cookies() {
		currentRequest.AddCookie(cookie)
	}
	currentResponse := httptest.NewRecorder()
	router.ServeHTTP(currentResponse, currentRequest)
	if currentResponse.Code != http.StatusUnauthorized {
		t.Fatalf("expected revoked session to be unauthorized, got %d", currentResponse.Code)
	}
}

func TestExhibitionEndpointsAllowMesseRole(t *testing.T) {
	db := testRouterDB(t)
	setup := application.NewSetupService(db)
	auth := application.NewAuthService(db)
	exhibition := application.NewExhibitionService(db)
	masterData := application.NewMasterDataService(db)
	if err := setup.CreateAdmin(t.Context(), application.CreateAdminInput{
		Username: "admin",
		Password: "very-secure-password",
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := auth.CreateUser(t.Context(), "", application.CreateUserInput{
		Username: "messe",
		Password: "messe-secure-password",
		Roles:    []string{"Messe"},
	}); err != nil {
		t.Fatal(err)
	}

	router := NewRouter(Config{SetupService: setup, AuthService: auth, ExhibitionService: exhibition, MasterDataService: masterData})
	session, cookies := loginTestUser(t, router, "messe", "messe-secure-password")

	listRequest := httptest.NewRequest(http.MethodGet, "/api/v1/exhibition-lists", nil)
	for _, cookie := range cookies {
		listRequest.AddCookie(cookie)
	}
	listResponse := httptest.NewRecorder()
	router.ServeHTTP(listResponse, listRequest)
	if listResponse.Code != http.StatusOK {
		t.Fatalf("expected messe user to list exhibition lists, got %d: %s", listResponse.Code, listResponse.Body.String())
	}

	createRequest := httptest.NewRequest(http.MethodPost, "/api/v1/exhibition-lists", bytes.NewBufferString(`{"designation":"Leipzig","date":"2026-05-12"}`))
	createRequest.Header.Set("Content-Type", "application/json")
	createRequest.Header.Set("X-CSRF-Token", session.CSRFToken)
	for _, cookie := range cookies {
		createRequest.AddCookie(cookie)
	}
	createResponse := httptest.NewRecorder()
	router.ServeHTTP(createResponse, createRequest)
	if createResponse.Code != http.StatusForbidden {
		t.Fatalf("expected messe user to be forbidden from creating lists, got %d", createResponse.Code)
	}

	vehicleRequest := httptest.NewRequest(http.MethodGet, "/api/v1/vehicles", nil)
	for _, cookie := range cookies {
		vehicleRequest.AddCookie(cookie)
	}
	vehicleResponse := httptest.NewRecorder()
	router.ServeHTTP(vehicleResponse, vehicleRequest)
	if vehicleResponse.Code != http.StatusForbidden {
		t.Fatalf("expected messe user to be forbidden from viewer inventory endpoints, got %d", vehicleResponse.Code)
	}

	symbolRequest := httptest.NewRequest(http.MethodGet, "/api/v1/master-data/symbols?active=true", nil)
	for _, cookie := range cookies {
		symbolRequest.AddCookie(cookie)
	}
	symbolResponse := httptest.NewRecorder()
	router.ServeHTTP(symbolResponse, symbolRequest)
	if symbolResponse.Code != http.StatusOK {
		t.Fatalf("expected messe user to read symbols for exhibition picker, got %d: %s", symbolResponse.Code, symbolResponse.Body.String())
	}
}

func TestExhibitionLockedListRejectsEntryWrites(t *testing.T) {
	db := testRouterDB(t)
	setup := application.NewSetupService(db)
	auth := application.NewAuthService(db)
	exhibition := application.NewExhibitionService(db)
	if err := setup.CreateAdmin(t.Context(), application.CreateAdminInput{
		Username: "admin",
		Password: "very-secure-password",
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := auth.CreateUser(t.Context(), "", application.CreateUserInput{
		Username: "messe",
		Password: "messe-secure-password",
		Roles:    []string{"Messe"},
	}); err != nil {
		t.Fatal(err)
	}
	list, err := exhibition.Create(t.Context(), application.ExhibitionListInput{
		Designation: "Leipzig 2026",
		Date:        "2026-05-12",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := exhibition.SetLocked(t.Context(), list.ID, true); err != nil {
		t.Fatal(err)
	}

	router := NewRouter(Config{SetupService: setup, AuthService: auth, ExhibitionService: exhibition})
	session, cookies := loginTestUser(t, router, "messe", "messe-secure-password")
	body := bytes.NewBufferString(`{"owner":"Daniel","locomotiveName":"V180","dtDecoder":true,"decoderNumber":"1001"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/v1/exhibition-lists/"+list.ID+"/entries", body)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-CSRF-Token", session.CSRFToken)
	for _, cookie := range cookies {
		request.AddCookie(cookie)
	}
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusConflict {
		t.Fatalf("expected locked list conflict, got %d: %s", response.Code, response.Body.String())
	}
}

func loginTestUser(t *testing.T, router http.Handler, username, password string) (application.SessionView, []*http.Cookie) {
	t.Helper()
	loginBody := bytes.NewBufferString(`{"username":"` + username + `","password":"` + password + `"}`)
	loginRequest := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", loginBody)
	loginRequest.Header.Set("Content-Type", "application/json")
	loginResponse := httptest.NewRecorder()
	router.ServeHTTP(loginResponse, loginRequest)
	if loginResponse.Code != http.StatusOK {
		t.Fatalf("expected login success, got %d: %s", loginResponse.Code, loginResponse.Body.String())
	}
	var session application.SessionView
	if err := json.NewDecoder(loginResponse.Body).Decode(&session); err != nil {
		t.Fatal(err)
	}
	return session, loginResponse.Result().Cookies()
}

func testRouterDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := infrastructure.OpenSQLite(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := infrastructure.Migrate(db, filepath.Join("..", "..", "migrations")); err != nil {
		t.Fatal(err)
	}
	if err := infrastructure.SeedRoles(db); err != nil {
		t.Fatal(err)
	}
	return db
}
