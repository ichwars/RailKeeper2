package api

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"errors"
	"io"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
)

const (
	maxVehicleImportBytes = 12 * 1024 * 1024
	maxImportRows         = 5000
	maxImportColumns      = 80
)

type vehicleImportPreviewResponse struct {
	Rows [][]string `json:"rows"`
}

func (a *App) previewVehicleImport(w http.ResponseWriter, r *http.Request) {
	data, fileName, ok := readVehicleImportUpload(w, r)
	if !ok {
		return
	}
	switch strings.ToLower(filepath.Ext(fileName)) {
	case ".xlsx":
		rows, err := parseXLSXRows(data)
		if err != nil {
			respondProblem(w, http.StatusBadRequest, "vehicle_import_invalid", "Excel-Datei konnte nicht ausgewertet werden.")
			return
		}
		respondJSON(w, http.StatusOK, vehicleImportPreviewResponse{Rows: rows})
	case ".ods":
		rows, err := parseODSRows(data)
		if err != nil {
			respondProblem(w, http.StatusBadRequest, "vehicle_import_invalid", "ODS-Datei konnte nicht ausgewertet werden.")
			return
		}
		respondJSON(w, http.StatusOK, vehicleImportPreviewResponse{Rows: rows})
	case ".xls":
		respondProblem(w, http.StatusBadRequest, "vehicle_import_unsupported", "Dieses Excel-Binärformat wird noch nicht unterstützt. Bitte als XLSX, ODS, CSV, TSV oder JSON speichern.")
	default:
		respondProblem(w, http.StatusBadRequest, "vehicle_import_unsupported", "Bitte eine XLSX- oder ODS-Datei hochladen.")
	}
}

func readVehicleImportUpload(w http.ResponseWriter, r *http.Request) ([]byte, string, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, maxVehicleImportBytes+1024*1024)
	if err := r.ParseMultipartForm(maxVehicleImportBytes); err != nil {
		respondProblem(w, http.StatusBadRequest, "vehicle_import_invalid", "Importdatei konnte nicht gelesen werden.")
		return nil, "", false
	}
	if r.MultipartForm != nil {
		defer func() { _ = r.MultipartForm.RemoveAll() }()
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		respondProblem(w, http.StatusBadRequest, "vehicle_import_file_missing", "Eine Importdatei ist erforderlich.")
		return nil, "", false
	}
	defer func() { _ = file.Close() }()
	if header.Size > maxVehicleImportBytes {
		respondProblem(w, http.StatusBadRequest, "vehicle_import_file_too_large", "Die Importdatei ist zu groß.")
		return nil, "", false
	}
	data, err := io.ReadAll(io.LimitReader(file, maxVehicleImportBytes+1))
	if err != nil || int64(len(data)) > maxVehicleImportBytes {
		respondProblem(w, http.StatusBadRequest, "vehicle_import_file_too_large", "Die Importdatei ist zu groß.")
		return nil, "", false
	}
	return data, header.Filename, true
}

func parseXLSXRows(data []byte) ([][]string, error) {
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, err
	}
	sharedStrings, err := parseXLSXSharedStrings(reader)
	if err != nil {
		return nil, err
	}
	sheetPath, err := firstXLSXSheetPath(reader)
	if err != nil {
		return nil, err
	}
	sheet, err := openZipFile(reader, sheetPath)
	if err != nil {
		return nil, err
	}
	defer func() { _ = sheet.Close() }()
	return parseXLSXSheet(sheet, sharedStrings)
}

func parseXLSXSharedStrings(reader *zip.Reader) ([]string, error) {
	file, err := openZipFile(reader, "xl/sharedStrings.xml")
	if err != nil {
		if errors.Is(err, fsNotFoundErr) {
			return nil, nil
		}
		return nil, err
	}
	defer func() { _ = file.Close() }()

	decoder := xml.NewDecoder(file)
	var values []string
	for {
		token, err := decoder.Token()
		if errors.Is(err, io.EOF) {
			return values, nil
		}
		if err != nil {
			return nil, err
		}
		start, ok := token.(xml.StartElement)
		if !ok || start.Name.Local != "si" {
			continue
		}
		value, err := readSharedString(decoder)
		if err != nil {
			return nil, err
		}
		values = append(values, value)
	}
}

func readSharedString(decoder *xml.Decoder) (string, error) {
	var builder strings.Builder
	for {
		token, err := decoder.Token()
		if err != nil {
			return "", err
		}
		switch value := token.(type) {
		case xml.StartElement:
			if value.Name.Local == "t" {
				text, err := readElementText(decoder, "t")
				if err != nil {
					return "", err
				}
				builder.WriteString(text)
			}
		case xml.EndElement:
			if value.Name.Local == "si" {
				return builder.String(), nil
			}
		}
	}
}

func firstXLSXSheetPath(reader *zip.Reader) (string, error) {
	relationID, err := firstWorkbookSheetRelation(reader)
	if err == nil && relationID != "" {
		if path, err := workbookRelationTarget(reader, relationID); err == nil && path != "" {
			return path, nil
		}
	}
	for _, file := range reader.File {
		if strings.HasPrefix(file.Name, "xl/worksheets/sheet") && strings.HasSuffix(file.Name, ".xml") {
			return file.Name, nil
		}
	}
	return "", errors.New("xlsx worksheet missing")
}

func firstWorkbookSheetRelation(reader *zip.Reader) (string, error) {
	file, err := openZipFile(reader, "xl/workbook.xml")
	if err != nil {
		return "", err
	}
	defer func() { _ = file.Close() }()
	decoder := xml.NewDecoder(file)
	for {
		token, err := decoder.Token()
		if errors.Is(err, io.EOF) {
			return "", errors.New("workbook sheet missing")
		}
		if err != nil {
			return "", err
		}
		start, ok := token.(xml.StartElement)
		if !ok || start.Name.Local != "sheet" {
			continue
		}
		for _, attr := range start.Attr {
			if attr.Name.Local == "id" {
				return attr.Value, nil
			}
		}
	}
}

func workbookRelationTarget(reader *zip.Reader, relationID string) (string, error) {
	file, err := openZipFile(reader, "xl/_rels/workbook.xml.rels")
	if err != nil {
		return "", err
	}
	defer func() { _ = file.Close() }()
	decoder := xml.NewDecoder(file)
	for {
		token, err := decoder.Token()
		if errors.Is(err, io.EOF) {
			return "", errors.New("workbook relation missing")
		}
		if err != nil {
			return "", err
		}
		start, ok := token.(xml.StartElement)
		if !ok || start.Name.Local != "Relationship" {
			continue
		}
		var id, target string
		for _, attr := range start.Attr {
			if attr.Name.Local == "Id" {
				id = attr.Value
			}
			if attr.Name.Local == "Target" {
				target = attr.Value
			}
		}
		if id == relationID {
			return normalizeXLSXPath(target), nil
		}
	}
}

func normalizeXLSXPath(target string) string {
	target = strings.TrimSpace(strings.ReplaceAll(target, "\\", "/"))
	target = strings.TrimPrefix(target, "/")
	if strings.HasPrefix(target, "xl/") {
		return filepath.ToSlash(filepath.Clean(target))
	}
	return filepath.ToSlash(filepath.Clean("xl/" + target))
}

func parseXLSXSheet(reader io.Reader, sharedStrings []string) ([][]string, error) {
	decoder := xml.NewDecoder(reader)
	var rows [][]string
	for {
		token, err := decoder.Token()
		if errors.Is(err, io.EOF) {
			return trimEmptyImportRows(rows), nil
		}
		if err != nil {
			return nil, err
		}
		start, ok := token.(xml.StartElement)
		if !ok || start.Name.Local != "row" {
			continue
		}
		row, err := readXLSXRow(decoder, sharedStrings)
		if err != nil {
			return nil, err
		}
		if len(rows) < maxImportRows {
			rows = append(rows, row)
		}
	}
}

func readXLSXRow(decoder *xml.Decoder, sharedStrings []string) ([]string, error) {
	var row []string
	nextColumn := 0
	for {
		token, err := decoder.Token()
		if err != nil {
			return nil, err
		}
		switch value := token.(type) {
		case xml.StartElement:
			if value.Name.Local != "c" {
				continue
			}
			cellType := attrValue(value, "t")
			column := cellColumnIndex(attrValue(value, "r"))
			if column < 0 {
				column = nextColumn
			}
			cellValue, err := readXLSXCell(decoder, cellType, sharedStrings)
			if err != nil {
				return nil, err
			}
			if column < maxImportColumns {
				for len(row) <= column {
					row = append(row, "")
				}
				row[column] = cellValue
			}
			nextColumn = column + 1
		case xml.EndElement:
			if value.Name.Local == "row" {
				return trimTrailingCells(row), nil
			}
		}
	}
}

func readXLSXCell(decoder *xml.Decoder, cellType string, sharedStrings []string) (string, error) {
	var raw, inline string
	for {
		token, err := decoder.Token()
		if err != nil {
			return "", err
		}
		switch value := token.(type) {
		case xml.StartElement:
			switch value.Name.Local {
			case "v":
				text, err := readElementText(decoder, "v")
				if err != nil {
					return "", err
				}
				raw = text
			case "t":
				text, err := readElementText(decoder, "t")
				if err != nil {
					return "", err
				}
				inline += text
			}
		case xml.EndElement:
			if value.Name.Local == "c" {
				if inline != "" {
					return strings.TrimSpace(inline), nil
				}
				raw = strings.TrimSpace(raw)
				if cellType == "s" {
					index, err := strconv.Atoi(raw)
					if err == nil && index >= 0 && index < len(sharedStrings) {
						return sharedStrings[index], nil
					}
				}
				return raw, nil
			}
		}
	}
}

func parseODSRows(data []byte) ([][]string, error) {
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, err
	}
	content, err := openZipFile(reader, "content.xml")
	if err != nil {
		return nil, err
	}
	defer func() { _ = content.Close() }()
	return parseODSContent(content)
}

func parseODSContent(reader io.Reader) ([][]string, error) {
	decoder := xml.NewDecoder(reader)
	var rows [][]string
	inFirstTable := false
	for {
		token, err := decoder.Token()
		if errors.Is(err, io.EOF) {
			return trimEmptyImportRows(rows), nil
		}
		if err != nil {
			return nil, err
		}
		switch value := token.(type) {
		case xml.StartElement:
			if value.Name.Local == "table" && !inFirstTable {
				inFirstTable = true
				continue
			}
			if !inFirstTable || value.Name.Local != "table-row" {
				continue
			}
			row, err := readODSRow(decoder)
			if err != nil {
				return nil, err
			}
			repeated := boundedRepeat(attrInt(value, "number-rows-repeated", 1), maxImportRows-len(rows))
			for i := 0; i < repeated; i++ {
				rows = append(rows, row)
			}
		case xml.EndElement:
			if inFirstTable && value.Name.Local == "table" {
				return trimEmptyImportRows(rows), nil
			}
		}
	}
}

func readODSRow(decoder *xml.Decoder) ([]string, error) {
	var row []string
	for {
		token, err := decoder.Token()
		if err != nil {
			return nil, err
		}
		switch value := token.(type) {
		case xml.StartElement:
			if value.Name.Local != "table-cell" && value.Name.Local != "covered-table-cell" {
				continue
			}
			cellValue := ""
			if value.Name.Local == "table-cell" {
				var err error
				cellValue, err = readODSCell(decoder, value)
				if err != nil {
					return nil, err
				}
			}
			repeated := boundedRepeat(attrInt(value, "number-columns-repeated", 1), maxImportColumns-len(row))
			for i := 0; i < repeated; i++ {
				row = append(row, cellValue)
			}
		case xml.EndElement:
			if value.Name.Local == "table-row" {
				return trimTrailingCells(row), nil
			}
		}
	}
}

func readODSCell(decoder *xml.Decoder, start xml.StartElement) (string, error) {
	for _, attrName := range []string{"string-value", "value", "date-value", "time-value", "boolean-value"} {
		if value := strings.TrimSpace(attrValue(start, attrName)); value != "" {
			if err := skipUntilEnd(decoder, "table-cell"); err != nil {
				return "", err
			}
			return value, nil
		}
	}
	var builder strings.Builder
	for {
		token, err := decoder.Token()
		if err != nil {
			return "", err
		}
		switch value := token.(type) {
		case xml.CharData:
			builder.Write([]byte(value))
		case xml.EndElement:
			if value.Name.Local == "table-cell" {
				return strings.Join(strings.Fields(builder.String()), " "), nil
			}
		}
	}
}

func skipUntilEnd(decoder *xml.Decoder, endName string) error {
	depth := 1
	for depth > 0 {
		token, err := decoder.Token()
		if err != nil {
			return err
		}
		switch value := token.(type) {
		case xml.StartElement:
			if value.Name.Local == endName {
				depth++
			}
		case xml.EndElement:
			if value.Name.Local == endName {
				depth--
			}
		}
	}
	return nil
}

func readElementText(decoder *xml.Decoder, endName string) (string, error) {
	var builder strings.Builder
	for {
		token, err := decoder.Token()
		if err != nil {
			return "", err
		}
		switch value := token.(type) {
		case xml.CharData:
			builder.Write([]byte(value))
		case xml.EndElement:
			if value.Name.Local == endName {
				return builder.String(), nil
			}
		}
	}
}

func attrInt(start xml.StartElement, name string, fallback int) int {
	raw := strings.TrimSpace(attrValue(start, name))
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < 1 {
		return fallback
	}
	return value
}

func boundedRepeat(repeated int, remaining int) int {
	if remaining <= 0 {
		return 0
	}
	if repeated > remaining {
		return remaining
	}
	return repeated
}

func attrValue(start xml.StartElement, name string) string {
	for _, attr := range start.Attr {
		if attr.Name.Local == name {
			return attr.Value
		}
	}
	return ""
}

func cellColumnIndex(reference string) int {
	if reference == "" {
		return -1
	}
	column := 0
	found := false
	for _, char := range strings.ToUpper(reference) {
		if char < 'A' || char > 'Z' {
			break
		}
		found = true
		column = column*26 + int(char-'A'+1)
	}
	if !found {
		return -1
	}
	return column - 1
}

func trimEmptyImportRows(rows [][]string) [][]string {
	trimmed := rows[:0]
	for _, row := range rows {
		if rowHasValue(row) {
			trimmed = append(trimmed, row)
		}
	}
	return trimmed
}

func rowHasValue(row []string) bool {
	for _, cell := range row {
		if strings.TrimSpace(cell) != "" {
			return true
		}
	}
	return false
}

func trimTrailingCells(row []string) []string {
	for len(row) > 0 && strings.TrimSpace(row[len(row)-1]) == "" {
		row = row[:len(row)-1]
	}
	return row
}

var fsNotFoundErr = errors.New("zip file not found")

func openZipFile(reader *zip.Reader, name string) (io.ReadCloser, error) {
	for _, file := range reader.File {
		if file.Name == name {
			return file.Open()
		}
	}
	return nil, fsNotFoundErr
}
