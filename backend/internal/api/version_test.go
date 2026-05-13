package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestVersionInfoWithoutConfiguredUpdateSource(t *testing.T) {
	router := NewRouter(Config{Version: "0.1.0"})
	request := httptest.NewRequest(http.MethodGet, "/api/v1/version?check=true", nil)
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", response.Code)
	}
	var body versionInfoResponse
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Status != "not_configured" {
		t.Fatalf("expected not_configured status, got %q", body.Status)
	}
	if body.UpdateAvailable {
		t.Fatal("expected no update when no update source is configured")
	}
}

func TestVersionInfoDetectsUpdate(t *testing.T) {
	updateServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"tag_name":"v0.2.0","html_url":"https://example.test/releases/v0.2.0"}`))
	}))
	defer updateServer.Close()

	router := NewRouter(Config{Version: "0.1.0", UpdateCheckURL: updateServer.URL})
	request := httptest.NewRequest(http.MethodGet, "/api/v1/version?check=true", nil)
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", response.Code)
	}
	var body versionInfoResponse
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Status != "update_available" {
		t.Fatalf("expected update_available status, got %q", body.Status)
	}
	if !body.UpdateAvailable {
		t.Fatal("expected update to be detected")
	}
	if body.LatestVersion != "v0.2.0" {
		t.Fatalf("expected latest version v0.2.0, got %q", body.LatestVersion)
	}
}

func TestVersionInfoCanIncludePrereleases(t *testing.T) {
	updateServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[
			{"tag_name":"v0.3.0-beta.1","html_url":"https://example.test/releases/v0.3.0-beta.1","prerelease":true},
			{"tag_name":"v0.2.0","html_url":"https://example.test/releases/v0.2.0","prerelease":false}
		]`))
	}))
	defer updateServer.Close()

	router := NewRouter(Config{Version: "0.2.0", UpdateCheckURL: updateServer.URL})
	request := httptest.NewRequest(http.MethodGet, "/api/v1/version?check=true&prerelease=true", nil)
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", response.Code)
	}
	var body versionInfoResponse
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.LatestVersion != "v0.3.0-beta.1" {
		t.Fatalf("expected prerelease version, got %q", body.LatestVersion)
	}
	if !body.UpdateAvailable {
		t.Fatal("expected prerelease update to be detected")
	}
}

func TestVersionInfoHandlesMissingGithubRelease(t *testing.T) {
	updateServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	}))
	defer updateServer.Close()

	router := NewRouter(Config{Version: "0.1.0", UpdateCheckURL: updateServer.URL})
	request := httptest.NewRequest(http.MethodGet, "/api/v1/version?check=true", nil)
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", response.Code)
	}
	var body versionInfoResponse
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Status != "no_release" {
		t.Fatalf("expected no_release status, got %q", body.Status)
	}
	if body.Message != "Keine Release-Information verfügbar." {
		t.Fatalf("unexpected message %q", body.Message)
	}
	if body.UpdateAvailable {
		t.Fatal("expected no update when no release exists")
	}
}

func TestVersionInfoHandlesEmptyReleaseList(t *testing.T) {
	updateServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[]`))
	}))
	defer updateServer.Close()

	router := NewRouter(Config{Version: "0.1.0", UpdateCheckURL: updateServer.URL})
	request := httptest.NewRequest(http.MethodGet, "/api/v1/version?check=true&prerelease=true", nil)
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", response.Code)
	}
	var body versionInfoResponse
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Status != "no_release" || body.Message != "Keine Release-Information verfügbar." {
		t.Fatalf("expected no-release response, got %#v", body)
	}
}

func TestReleaseListURLConvertsGithubLatestEndpoint(t *testing.T) {
	got := releaseListURL("https://api.github.com/repos/ichwars/RailKeeper2/releases/latest")
	want := "https://api.github.com/repos/ichwars/RailKeeper2/releases"
	if got != want {
		t.Fatalf("releaseListURL() = %q, want %q", got, want)
	}
}

func TestCompareVersionStringsTreatsReleaseNewerThanSamePrerelease(t *testing.T) {
	if compareVersionStrings("v0.3.0-beta.1", "v0.3.0") >= 0 {
		t.Fatal("expected final release to be newer than matching prerelease")
	}
}
