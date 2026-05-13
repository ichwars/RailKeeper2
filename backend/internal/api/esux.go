package api

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"encoding/binary"
	"encoding/csv"
	"encoding/xml"
	"errors"
	"fmt"
	"image"
	"io"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

type esuxMetadata struct {
	Name           string `xml:"name"`
	Address        string `xml:"address"`
	Type           string `xml:"type"`
	Decoder        string `xml:"decoder"`
	Manufacturer   string `xml:"manufacturer"`
	ManufacturerID string `xml:"manid"`
	LokProgrammer  string `xml:"lokprogrammer"`
}

type vehicleCVFilePreviewResponse struct {
	FileName                string                   `json:"fileName"`
	SizeBytes               int64                    `json:"sizeBytes"`
	MimeType                string                   `json:"mimeType"`
	HasMetadata             bool                     `json:"hasMetadata"`
	ProjectName             string                   `json:"projectName,omitempty"`
	Address                 string                   `json:"address,omitempty"`
	Type                    string                   `json:"type,omitempty"`
	Decoder                 string                   `json:"decoder,omitempty"`
	Manufacturer            string                   `json:"manufacturer,omitempty"`
	ManufacturerID          string                   `json:"manufacturerId,omitempty"`
	LokProgrammer           string                   `json:"lokProgrammer,omitempty"`
	SuggestedDecoderProfile string                   `json:"suggestedDecoderProfile,omitempty"`
	SuggestedDescription    string                   `json:"suggestedDescription,omitempty"`
	SuggestedCVValues       []cvValuePreview         `json:"suggestedCvValues,omitempty"`
	SuggestedFunctions      []functionMappingPreview `json:"suggestedFunctions,omitempty"`
	SuggestedPreviewImage   *decoderPreviewImage     `json:"suggestedPreviewImage,omitempty"`
}

type cvValuePreview struct {
	CVNumber    int    `json:"cvNumber"`
	Value       int    `json:"value"`
	Description string `json:"description,omitempty"`
	Category    string `json:"category,omitempty"`
}

type functionMappingPreview struct {
	FunctionKey  string `json:"functionKey"`
	Name         string `json:"name"`
	FunctionType string `json:"functionType,omitempty"`
}

type decoderPreviewImage struct {
	MimeType string `json:"mimeType"`
	Width    int    `json:"width"`
	Height   int    `json:"height"`
	DataURL  string `json:"dataUrl"`
}

var errESUXMetadataUnavailable = errors.New("esux metadata unavailable")

func parseESUXMetadata(filename string, data []byte) (*esuxMetadata, error) {
	extension := strings.ToLower(filepath.Ext(filename))
	if extension != ".esux" && extension != ".esu" && extension != ".lokprogrammer" {
		return nil, errESUXMetadataUnavailable
	}
	if len(data) < 18 || string(data[:4]) != "ESU " {
		return nil, errESUXMetadataUnavailable
	}
	metadataLength := int(binary.LittleEndian.Uint32(data[14:18]))
	if metadataLength <= 0 || metadataLength > len(data)-18 || metadataLength > 64*1024 {
		return nil, errESUXMetadataUnavailable
	}
	var metadata esuxMetadata
	if err := xml.Unmarshal(data[18:18+metadataLength], &metadata); err != nil {
		return nil, err
	}
	metadata.Name = strings.TrimSpace(metadata.Name)
	metadata.Address = strings.TrimSpace(metadata.Address)
	metadata.Type = strings.TrimSpace(metadata.Type)
	metadata.Decoder = strings.TrimSpace(metadata.Decoder)
	metadata.Manufacturer = strings.TrimSpace(metadata.Manufacturer)
	metadata.ManufacturerID = strings.TrimSpace(metadata.ManufacturerID)
	metadata.LokProgrammer = strings.TrimSpace(metadata.LokProgrammer)
	if metadata.Name == "" && metadata.Address == "" && metadata.Decoder == "" && metadata.LokProgrammer == "" {
		return nil, errESUXMetadataUnavailable
	}
	return &metadata, nil
}

func applyESUXMetadata(filename string, data []byte, decoderProfile string, description string) (string, string) {
	metadata, err := parseESUXMetadata(filename, data)
	if err != nil {
		return decoderProfile, description
	}
	if strings.TrimSpace(decoderProfile) == "" {
		decoderProfile = firstNonEmpty(metadata.Decoder, metadata.Name, "ESU LokProgrammer")
	}
	if strings.TrimSpace(description) == "" {
		description = metadata.Description()
	}
	return decoderProfile, description
}

func esuxPreviewResponse(filename string, sizeBytes int64, mimeType string, data []byte) vehicleCVFilePreviewResponse {
	response := vehicleCVFilePreviewResponse{
		FileName:  filename,
		SizeBytes: sizeBytes,
		MimeType:  mimeType,
	}
	response.SuggestedCVValues = previewCVValues(filename, data)
	response.SuggestedFunctions = previewFunctionMappings(filename, data)
	response.SuggestedPreviewImage = previewDecoderImage(filename, data)
	metadata, err := parseESUXMetadata(filename, data)
	if err != nil {
		return response
	}
	response.HasMetadata = true
	response.ProjectName = metadata.Name
	response.Address = metadata.Address
	response.Type = metadata.Type
	response.Decoder = metadata.Decoder
	response.Manufacturer = metadata.Manufacturer
	response.ManufacturerID = metadata.ManufacturerID
	response.LokProgrammer = metadata.LokProgrammer
	response.SuggestedDecoderProfile = firstNonEmpty(metadata.Decoder, metadata.Name, "ESU LokProgrammer")
	response.SuggestedDescription = metadata.Description()
	return response
}

func (m esuxMetadata) Description() string {
	parts := []string{"ESU LokProgrammer-Projekt"}
	if m.Name != "" {
		parts = append(parts, fmt.Sprintf("Name: %s", m.Name))
	}
	if m.Decoder != "" && m.Decoder != m.Name {
		parts = append(parts, fmt.Sprintf("Decoder: %s", m.Decoder))
	}
	if m.Address != "" {
		parts = append(parts, fmt.Sprintf("Adresse: %s", m.Address))
	}
	if m.Type != "" {
		parts = append(parts, fmt.Sprintf("Typ: %s", m.Type))
	}
	if m.Manufacturer != "" {
		parts = append(parts, fmt.Sprintf("Hersteller: %s", m.Manufacturer))
	}
	if m.LokProgrammer != "" {
		parts = append(parts, fmt.Sprintf("LokProgrammer: %s", m.LokProgrammer))
	}
	return strings.Join(parts, " | ")
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

const maxDecoderPreviewRows = 32
const maxDecoderPreviewImageBytes = 512 * 1024
const maxDecoderPreviewImageDimension = 4096

var (
	cvTextPattern       = regexp.MustCompile(`(?i)\bcv\s*([0-9]{1,4})\D+([0-9]{1,4})`)
	functionTextPattern = regexp.MustCompile(`(?i)\bF\s*([0-9]{1,2})\s*[:=;-]\s*(.+)`)
	pngSignature        = []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}
	jpegSignature       = []byte{0xff, 0xd8, 0xff}
)

func previewDecoderImage(filename string, data []byte) *decoderPreviewImage {
	extension := strings.ToLower(filepath.Ext(filename))
	switch extension {
	case ".esux", ".esu", ".lokprogrammer", ".zip":
	default:
		return nil
	}
	if len(data) == 0 || len(data) > 25*1024*1024 {
		return nil
	}
	if extension == ".zip" || bytes.HasPrefix(data, []byte("PK\x03\x04")) {
		if preview := previewImageFromZip(data); preview != nil {
			return preview
		}
	}
	return previewEmbeddedImage(data)
}

func previewImageFromZip(data []byte) *decoderPreviewImage {
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil
	}
	for _, file := range reader.File {
		if file.FileInfo().IsDir() || !isPreviewImageName(file.Name) || file.UncompressedSize64 > maxDecoderPreviewImageBytes {
			continue
		}
		handle, err := file.Open()
		if err != nil {
			continue
		}
		imageData, readErr := io.ReadAll(io.LimitReader(handle, maxDecoderPreviewImageBytes+1))
		_ = handle.Close()
		if readErr != nil || len(imageData) > maxDecoderPreviewImageBytes {
			continue
		}
		if preview := validatePreviewImage(imageData); preview != nil {
			return preview
		}
	}
	return nil
}

func isPreviewImageName(name string) bool {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".jpg", ".jpeg", ".png", ".webp":
		return true
	default:
		return false
	}
}

func previewEmbeddedImage(data []byte) *decoderPreviewImage {
	for _, imageData := range candidateEmbeddedImages(data) {
		if preview := validatePreviewImage(imageData); preview != nil {
			return preview
		}
	}
	return nil
}

func candidateEmbeddedImages(data []byte) [][]byte {
	candidates := [][]byte{}
	candidates = append(candidates, candidatePNGImages(data)...)
	candidates = append(candidates, candidateJPEGImages(data)...)
	candidates = append(candidates, candidateWebPImages(data)...)
	return candidates
}

func candidatePNGImages(data []byte) [][]byte {
	candidates := [][]byte{}
	for offset := 0; offset < len(data); {
		index := bytes.Index(data[offset:], pngSignature)
		if index < 0 {
			break
		}
		start := offset + index
		endMarker := bytes.Index(data[start:], []byte("IEND"))
		if endMarker >= 0 {
			end := start + endMarker + 8
			if end <= len(data) && end-start <= maxDecoderPreviewImageBytes {
				candidates = append(candidates, data[start:end])
			}
		}
		offset = start + len(pngSignature)
	}
	return candidates
}

func candidateJPEGImages(data []byte) [][]byte {
	candidates := [][]byte{}
	for offset := 0; offset < len(data); {
		index := bytes.Index(data[offset:], jpegSignature)
		if index < 0 {
			break
		}
		start := offset + index
		endMarker := bytes.Index(data[start+len(jpegSignature):], []byte{0xff, 0xd9})
		if endMarker >= 0 {
			end := start + len(jpegSignature) + endMarker + 2
			if end <= len(data) && end-start <= maxDecoderPreviewImageBytes {
				candidates = append(candidates, data[start:end])
			}
		}
		offset = start + len(jpegSignature)
	}
	return candidates
}

func candidateWebPImages(data []byte) [][]byte {
	candidates := [][]byte{}
	for offset := 0; offset+12 <= len(data); {
		index := bytes.Index(data[offset:], []byte("RIFF"))
		if index < 0 {
			break
		}
		start := offset + index
		if start+12 <= len(data) && string(data[start+8:start+12]) == "WEBP" {
			size := int(binary.LittleEndian.Uint32(data[start+4 : start+8]))
			end := start + 8 + size
			if end <= len(data) && end-start <= maxDecoderPreviewImageBytes {
				candidates = append(candidates, data[start:end])
			}
		}
		offset = start + 4
	}
	return candidates
}

func validatePreviewImage(data []byte) *decoderPreviewImage {
	if len(data) == 0 || len(data) > maxDecoderPreviewImageBytes {
		return nil
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || config.Width <= 0 || config.Height <= 0 {
		return nil
	}
	if config.Width > maxDecoderPreviewImageDimension || config.Height > maxDecoderPreviewImageDimension {
		return nil
	}
	mimeType := previewImageMimeType(format)
	if mimeType == "" {
		return nil
	}
	return &decoderPreviewImage{
		MimeType: mimeType,
		Width:    config.Width,
		Height:   config.Height,
		DataURL:  "data:" + mimeType + ";base64," + base64.StdEncoding.EncodeToString(data),
	}
}

func previewImageMimeType(format string) string {
	switch format {
	case "jpeg":
		return "image/jpeg"
	case "png":
		return "image/png"
	case "webp":
		return "image/webp"
	default:
		return ""
	}
}

func previewCVValues(filename string, data []byte) []cvValuePreview {
	text, ok := decoderPreviewText(filename, data)
	if !ok {
		return nil
	}
	if strings.HasPrefix(strings.TrimSpace(text), "<") {
		return previewCVValuesXML(text)
	}
	return previewCVValuesTable(text)
}

func previewFunctionMappings(filename string, data []byte) []functionMappingPreview {
	text, ok := decoderPreviewText(filename, data)
	if !ok {
		return nil
	}
	if strings.HasPrefix(strings.TrimSpace(text), "<") {
		return previewFunctionMappingsXML(text)
	}
	return previewFunctionMappingsTable(text)
}

func decoderPreviewText(filename string, data []byte) (string, bool) {
	extension := strings.ToLower(filepath.Ext(filename))
	switch extension {
	case ".csv", ".txt", ".xml", ".json", ".z21":
	default:
		return "", false
	}
	if len(data) == 0 || len(data) > 2*1024*1024 || bytes.IndexByte(data, 0) >= 0 {
		return "", false
	}
	return strings.TrimPrefix(string(data), "\ufeff"), true
}

func previewCVValuesTable(text string) []cvValuePreview {
	records := readDelimitedRecords(text)
	if len(records) > 0 {
		if rows := cvValuesFromRecords(records); len(rows) > 0 {
			return rows
		}
	}
	rows := []cvValuePreview{}
	for _, match := range cvTextPattern.FindAllStringSubmatch(text, -1) {
		cvNumber, cvOK := boundedAtoi(match[1], 1, 1024)
		value, valueOK := boundedAtoi(match[2], 0, 255)
		if !cvOK || !valueOK {
			continue
		}
		rows = append(rows, cvValuePreview{CVNumber: cvNumber, Value: value})
		if len(rows) >= maxDecoderPreviewRows {
			break
		}
	}
	return rows
}

func cvValuesFromRecords(records [][]string) []cvValuePreview {
	if len(records) == 0 {
		return nil
	}
	header := normalizedHeader(records[0])
	start := 1
	cvIndex := firstHeaderIndex(header, "cv", "cvnumber", "cvnummer", "cvnr", "cvid")
	valueIndex := firstHeaderIndex(header, "value", "wert", "cvvalue")
	descriptionIndex := firstHeaderIndex(header, "description", "beschreibung", "name", "bezeichnung")
	categoryIndex := firstHeaderIndex(header, "category", "kategorie")
	if cvIndex < 0 || valueIndex < 0 {
		start = 0
		cvIndex = 0
		valueIndex = 1
		descriptionIndex = 2
		categoryIndex = 3
	}

	rows := []cvValuePreview{}
	for _, record := range records[start:] {
		cvNumber, cvOK := cellInt(record, cvIndex, 1, 1024)
		value, valueOK := cellInt(record, valueIndex, 0, 255)
		if !cvOK || !valueOK {
			continue
		}
		rows = append(rows, cvValuePreview{
			CVNumber:    cvNumber,
			Value:       value,
			Description: cell(record, descriptionIndex),
			Category:    cell(record, categoryIndex),
		})
		if len(rows) >= maxDecoderPreviewRows {
			break
		}
	}
	return rows
}

func previewFunctionMappingsTable(text string) []functionMappingPreview {
	records := readDelimitedRecords(text)
	if len(records) > 0 {
		if rows := functionMappingsFromRecords(records); len(rows) > 0 {
			return rows
		}
	}
	rows := []functionMappingPreview{}
	for _, match := range functionTextPattern.FindAllStringSubmatch(text, -1) {
		number, ok := boundedAtoi(match[1], 0, 31)
		name := strings.TrimSpace(match[2])
		if !ok || name == "" {
			continue
		}
		rows = append(rows, functionMappingPreview{
			FunctionKey:  fmt.Sprintf("F%d", number),
			Name:         name,
			FunctionType: inferFunctionType(name),
		})
		if len(rows) >= maxDecoderPreviewRows {
			break
		}
	}
	return rows
}

func functionMappingsFromRecords(records [][]string) []functionMappingPreview {
	if len(records) == 0 {
		return nil
	}
	header := normalizedHeader(records[0])
	start := 1
	keyIndex := firstHeaderIndex(header, "functionkey", "funktion", "taste", "key", "f")
	nameIndex := firstHeaderIndex(header, "name", "funktionsname", "beschreibung", "function")
	typeIndex := firstHeaderIndex(header, "functiontype", "typ", "type")
	hasHeader := keyIndex >= 0 && nameIndex >= 0
	if keyIndex < 0 || nameIndex < 0 {
		start = 0
		keyIndex = 0
		nameIndex = 1
		typeIndex = 2
	}

	rows := []functionMappingPreview{}
	for _, record := range records[start:] {
		if !hasHeader && !strings.Contains(strings.ToUpper(cell(record, keyIndex)), "F") {
			continue
		}
		key := normalizeFunctionPreviewKey(cell(record, keyIndex))
		name := cell(record, nameIndex)
		if key == "" || name == "" {
			continue
		}
		functionType := cell(record, typeIndex)
		if functionType == "" {
			functionType = inferFunctionType(name)
		}
		rows = append(rows, functionMappingPreview{
			FunctionKey:  key,
			Name:         name,
			FunctionType: functionType,
		})
		if len(rows) >= maxDecoderPreviewRows {
			break
		}
	}
	return rows
}

func readDelimitedRecords(text string) [][]string {
	lines := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	for _, separator := range []rune{';', ',', '\t'} {
		reader := csv.NewReader(strings.NewReader(strings.Join(lines, "\n")))
		reader.Comma = separator
		reader.FieldsPerRecord = -1
		reader.TrimLeadingSpace = true
		records, err := reader.ReadAll()
		if err == nil && hasMultiColumnRecord(records) {
			return records
		}
	}
	return nil
}

func hasMultiColumnRecord(records [][]string) bool {
	for _, record := range records {
		if len(record) > 1 {
			return true
		}
	}
	return false
}

func previewCVValuesXML(text string) []cvValuePreview {
	decoder := xml.NewDecoder(strings.NewReader(text))
	rows := []cvValuePreview{}
	for {
		token, err := decoder.Token()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil
		}
		start, ok := token.(xml.StartElement)
		if !ok {
			continue
		}
		attrs := xmlAttrs(start)
		cvNumber, cvOK := attrBoundedInt(attrs, 1, 1024, "cv", "number", "nr", "id")
		value, valueOK := attrBoundedInt(attrs, 0, 255, "value", "wert")
		if !cvOK || !valueOK {
			continue
		}
		rows = append(rows, cvValuePreview{
			CVNumber:    cvNumber,
			Value:       value,
			Description: firstAttr(attrs, "description", "beschreibung", "name"),
			Category:    firstAttr(attrs, "category", "kategorie"),
		})
		if len(rows) >= maxDecoderPreviewRows {
			break
		}
	}
	return rows
}

func previewFunctionMappingsXML(text string) []functionMappingPreview {
	decoder := xml.NewDecoder(strings.NewReader(text))
	rows := []functionMappingPreview{}
	for {
		token, err := decoder.Token()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil
		}
		start, ok := token.(xml.StartElement)
		if !ok {
			continue
		}
		attrs := xmlAttrs(start)
		key := normalizeFunctionPreviewKey(firstAttr(attrs, "functionkey", "key", "taste", "function", "id"))
		name := firstAttr(attrs, "name", "description", "beschreibung", "label")
		if key == "" || name == "" {
			continue
		}
		functionType := firstAttr(attrs, "functiontype", "type", "typ")
		if functionType == "" {
			functionType = inferFunctionType(name)
		}
		rows = append(rows, functionMappingPreview{
			FunctionKey:  key,
			Name:         name,
			FunctionType: functionType,
		})
		if len(rows) >= maxDecoderPreviewRows {
			break
		}
	}
	return rows
}

func xmlAttrs(start xml.StartElement) map[string]string {
	attrs := map[string]string{}
	for _, attr := range start.Attr {
		attrs[normalizeHeaderName(attr.Name.Local)] = strings.TrimSpace(attr.Value)
	}
	return attrs
}

func normalizedHeader(record []string) []string {
	out := make([]string, len(record))
	for index, value := range record {
		out[index] = normalizeHeaderName(value)
	}
	return out
}

func normalizeHeaderName(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	replacer := strings.NewReplacer("ä", "ae", "ö", "oe", "ü", "ue", "ß", "ss")
	value = replacer.Replace(value)
	return regexp.MustCompile(`[^a-z0-9]`).ReplaceAllString(value, "")
}

func firstHeaderIndex(header []string, names ...string) int {
	for _, name := range names {
		needle := normalizeHeaderName(name)
		for index, value := range header {
			if value == needle {
				return index
			}
		}
	}
	return -1
}

func cell(record []string, index int) string {
	if index < 0 || index >= len(record) {
		return ""
	}
	return strings.TrimSpace(record[index])
}

func cellInt(record []string, index, min, max int) (int, bool) {
	return boundedAtoi(cell(record, index), min, max)
}

func boundedAtoi(value string, min, max int) (int, bool) {
	value = strings.TrimSpace(strings.TrimPrefix(strings.ToUpper(value), "CV"))
	value = strings.TrimPrefix(value, "F")
	number, err := strconv.Atoi(value)
	if err != nil || number < min || number > max {
		return 0, false
	}
	return number, true
}

func attrBoundedInt(attrs map[string]string, min, max int, names ...string) (int, bool) {
	for _, name := range names {
		if value := firstAttr(attrs, name); value != "" {
			if number, ok := boundedAtoi(value, min, max); ok {
				return number, true
			}
		}
	}
	return 0, false
}

func firstAttr(attrs map[string]string, names ...string) string {
	for _, name := range names {
		if value := strings.TrimSpace(attrs[normalizeHeaderName(name)]); value != "" {
			return value
		}
	}
	return ""
}

func normalizeFunctionPreviewKey(value string) string {
	value = strings.TrimSpace(strings.ToUpper(value))
	if strings.HasPrefix(value, "F") {
		if number, ok := boundedAtoi(value, 0, 31); ok {
			return fmt.Sprintf("F%d", number)
		}
	}
	if number, ok := boundedAtoi(value, 0, 31); ok {
		return fmt.Sprintf("F%d", number)
	}
	return ""
}

func inferFunctionType(name string) string {
	lower := strings.ToLower(name)
	switch {
	case strings.Contains(lower, "licht") || strings.Contains(lower, "light"):
		return "licht"
	case strings.Contains(lower, "sound") || strings.Contains(lower, "horn") || strings.Contains(lower, "pfiff"):
		return "sound"
	case strings.Contains(lower, "rauch"):
		return "rauch"
	case strings.Contains(lower, "kuppl"):
		return "kupplung"
	default:
		return "standard"
	}
}
