package api

import (
	"net/http"
	"net/http/httptest"
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
