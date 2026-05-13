package api

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"encoding/binary"
	"strings"
	"testing"
)

func TestApplyESUXMetadata(t *testing.T) {
	xml := `<?xml version="1.0" encoding="utf-8"?><meta xmlns="http://www.esu.eu/2010/LOKPROGRAMMER/Metadata"><name>V180</name><address>1002</address><type>diesel</type><decoder>LokPilot micro V4.0 DCC</decoder><manufacturer>Piko</manufacturer><manid></manid><lokprogrammer>5.2.15</lokprogrammer></meta>`
	data := make([]byte, 18+len(xml))
	copy(data[:4], []byte("ESU "))
	data[6] = 2
	data[10] = 1
	data[12] = 16
	binary.LittleEndian.PutUint32(data[14:18], uint32(len(xml)))
	copy(data[18:], []byte(xml))

	profile, description := applyESUXMetadata("V180.esux", data, "", "")
	if profile != "LokPilot micro V4.0 DCC" {
		t.Fatalf("unexpected profile %q", profile)
	}
	if description == "" || !containsAll(description, "ESU LokProgrammer-Projekt", "Name: V180", "Adresse: 1002", "Hersteller: Piko") {
		t.Fatalf("unexpected description %q", description)
	}
}

func TestApplyESUXMetadataPreservesUserInput(t *testing.T) {
	xml := `<meta><name>Projekt</name><decoder>Decoder</decoder></meta>`
	data := make([]byte, 18+len(xml))
	copy(data[:4], []byte("ESU "))
	binary.LittleEndian.PutUint32(data[14:18], uint32(len(xml)))
	copy(data[18:], []byte(xml))

	profile, description := applyESUXMetadata("projekt.esux", data, "Manuell", "Eigene Notiz")
	if profile != "Manuell" || description != "Eigene Notiz" {
		t.Fatalf("user input was not preserved: %q %q", profile, description)
	}
}

func TestESUXPreviewResponse(t *testing.T) {
	xml := `<meta><name>BR106</name><address>768</address><type>diesel</type><decoder>LokPilot 5 micro DCC</decoder><manufacturer>Tillig</manufacturer><lokprogrammer>5.2.15</lokprogrammer></meta>`
	data := make([]byte, 18+len(xml))
	copy(data[:4], []byte("ESU "))
	binary.LittleEndian.PutUint32(data[14:18], uint32(len(xml)))
	copy(data[18:], []byte(xml))

	preview := esuxPreviewResponse("BR106.esux", int64(len(data)), "application/octet-stream", data)
	if !preview.HasMetadata {
		t.Fatal("expected metadata in preview")
	}
	if preview.ProjectName != "BR106" || preview.Address != "768" || preview.Decoder != "LokPilot 5 micro DCC" {
		t.Fatalf("unexpected preview metadata: %+v", preview)
	}
	if preview.SuggestedDecoderProfile != "LokPilot 5 micro DCC" {
		t.Fatalf("unexpected decoder profile suggestion %q", preview.SuggestedDecoderProfile)
	}
	if !containsAll(preview.SuggestedDescription, "ESU LokProgrammer-Projekt", "Name: BR106", "Adresse: 768", "Hersteller: Tillig") {
		t.Fatalf("unexpected description suggestion %q", preview.SuggestedDescription)
	}
}

func TestESUXPreviewResponseWithoutMetadata(t *testing.T) {
	data := []byte("plain cv file")

	preview := esuxPreviewResponse("cv.txt", int64(len(data)), "text/plain", data)
	if preview.HasMetadata {
		t.Fatalf("expected no metadata: %+v", preview)
	}
	if preview.FileName != "cv.txt" || preview.SizeBytes != int64(len(data)) || preview.MimeType != "text/plain" {
		t.Fatalf("unexpected preview base data: %+v", preview)
	}
}

func TestDecoderCSVPreviewFindsCVValuesAndFunctions(t *testing.T) {
	data := []byte("CV;Wert;Beschreibung\n1;3;Adresse\n29;14;Konfiguration\nFunktion;Name;Typ\nF0;Licht vorne;licht\nF1;Sound an;sound\n")

	preview := esuxPreviewResponse("lokprogrammer.csv", int64(len(data)), "text/csv", data)
	if len(preview.SuggestedCVValues) != 2 {
		t.Fatalf("expected cv suggestions, got %#v", preview.SuggestedCVValues)
	}
	if preview.SuggestedCVValues[0].CVNumber != 1 || preview.SuggestedCVValues[0].Value != 3 {
		t.Fatalf("unexpected cv suggestion: %#v", preview.SuggestedCVValues[0])
	}
	if len(preview.SuggestedFunctions) != 2 {
		t.Fatalf("expected function suggestions, got %#v", preview.SuggestedFunctions)
	}
	if preview.SuggestedFunctions[0].FunctionKey != "F0" || preview.SuggestedFunctions[0].Name != "Licht vorne" {
		t.Fatalf("unexpected function suggestion: %#v", preview.SuggestedFunctions[0])
	}
}

func TestDecoderXMLPreviewFindsCVValuesAndFunctions(t *testing.T) {
	data := []byte(`<decoder>
  <cv number="1" value="3" description="Adresse" />
  <cv nr="29" wert="14" beschreibung="Konfiguration" />
  <function key="F0" name="Licht vorne" />
  <function taste="F1" description="Sound an" />
</decoder>`)

	preview := esuxPreviewResponse("lokprogrammer.xml", int64(len(data)), "text/xml", data)
	if len(preview.SuggestedCVValues) != 2 {
		t.Fatalf("expected cv suggestions, got %#v", preview.SuggestedCVValues)
	}
	if preview.SuggestedCVValues[1].CVNumber != 29 || preview.SuggestedCVValues[1].Value != 14 {
		t.Fatalf("unexpected cv suggestion: %#v", preview.SuggestedCVValues[1])
	}
	if len(preview.SuggestedFunctions) != 2 {
		t.Fatalf("expected function suggestions, got %#v", preview.SuggestedFunctions)
	}
	if preview.SuggestedFunctions[1].FunctionKey != "F1" || preview.SuggestedFunctions[1].FunctionType != "sound" {
		t.Fatalf("unexpected function suggestion: %#v", preview.SuggestedFunctions[1])
	}
}

func TestESUXPreviewFindsEmbeddedPreviewImage(t *testing.T) {
	pngData := testPNG(t)
	data := append([]byte("ESU binary preview "), pngData...)

	preview := esuxPreviewResponse("projekt.esux", int64(len(data)), "application/octet-stream", data)
	if preview.SuggestedPreviewImage == nil {
		t.Fatal("expected embedded preview image")
	}
	if preview.SuggestedPreviewImage.MimeType != "image/png" || preview.SuggestedPreviewImage.Width != 1 || preview.SuggestedPreviewImage.Height != 1 {
		t.Fatalf("unexpected preview image: %#v", preview.SuggestedPreviewImage)
	}
	if !strings.HasPrefix(preview.SuggestedPreviewImage.DataURL, "data:image/png;base64,") {
		t.Fatalf("unexpected data url %q", preview.SuggestedPreviewImage.DataURL)
	}
}

func TestZIPPreviewFindsImageEntry(t *testing.T) {
	var buffer bytes.Buffer
	writer := zip.NewWriter(&buffer)
	entry, err := writer.Create("preview/thumb.png")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := entry.Write(testPNG(t)); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}

	preview := esuxPreviewResponse("lokprogrammer.zip", int64(buffer.Len()), "application/zip", buffer.Bytes())
	if preview.SuggestedPreviewImage == nil {
		t.Fatal("expected zip preview image")
	}
	if preview.SuggestedPreviewImage.MimeType != "image/png" {
		t.Fatalf("unexpected preview image: %#v", preview.SuggestedPreviewImage)
	}
}

func containsAll(value string, parts ...string) bool {
	for _, part := range parts {
		if !strings.Contains(value, part) {
			return false
		}
	}
	return true
}

func testPNG(t *testing.T) []byte {
	t.Helper()
	data, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")
	if err != nil {
		t.Fatal(err)
	}
	return data
}
