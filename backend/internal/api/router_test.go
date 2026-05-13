package api

import (
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
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
	if !limiter.allow("login", "127.0.0.1", 2, time.Hour) {
		t.Fatalf("first attempt should be allowed")
	}
	if !limiter.allow("login", "127.0.0.1", 2, time.Hour) {
		t.Fatalf("second attempt should be allowed")
	}
	if limiter.allow("login", "127.0.0.1", 2, time.Hour) {
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
