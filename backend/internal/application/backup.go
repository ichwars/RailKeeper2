package application

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const backupFormat = "railkeeper2-backup"

var (
	ErrBackupInvalid = errors.New("backup invalid")
	ErrBackupPath    = errors.New("backup path invalid")
)

type BackupService struct {
	db      *sql.DB
	dataDir string
}

type BackupDocument struct {
	Format    string                      `json:"format"`
	Version   int                         `json:"version"`
	CreatedAt string                      `json:"createdAt"`
	Tables    map[string][]map[string]any `json:"tables"`
	Files     []BackupFile                `json:"files"`
}

type BackupFile struct {
	Path          string `json:"path"`
	SizeBytes     int64  `json:"sizeBytes"`
	SHA256        string `json:"sha256"`
	ContentBase64 string `json:"contentBase64"`
}

type BackupImportResult struct {
	RestoredTables int `json:"restoredTables"`
	RestoredRows   int `json:"restoredRows"`
	RestoredFiles  int `json:"restoredFiles"`
}

type BackupValidationResult struct {
	Compatible bool                    `json:"compatible"`
	Format     string                  `json:"format,omitempty"`
	Version    int                     `json:"version"`
	CreatedAt  string                  `json:"createdAt,omitempty"`
	TableCount int                     `json:"tableCount"`
	RowCount   int                     `json:"rowCount"`
	FileCount  int                     `json:"fileCount"`
	FileBytes  int64                   `json:"fileBytes"`
	Tables     []BackupValidationTable `json:"tables"`
	Warnings   []string                `json:"warnings"`
	Errors     []string                `json:"errors"`
}

type BackupValidationTable struct {
	Name           string   `json:"name"`
	Rows           int      `json:"rows"`
	Missing        bool     `json:"missing"`
	UnknownColumns []string `json:"unknownColumns,omitempty"`
}

var backupTableOrder = []string{
	"master_data_entries",
	"master_data_relations",
	"inventory_number_schemes",
	"vehicles",
	"inventory_number_history",
	"vehicle_images",
	"vehicle_attachments",
	"vehicle_maintenance",
	"vehicle_functions",
	"vehicle_cv_files",
	"vehicle_cv_values",
	"vehicle_cv_value_history",
	"exhibition_lists",
	"exhibition_entries",
}

var optionalBackupTables = map[string]struct{}{
	"exhibition_lists":   {},
	"exhibition_entries": {},
}

func NewBackupService(db *sql.DB, dataDir string) *BackupService {
	return &BackupService{db: db, dataDir: dataDir}
}

func (s *BackupService) Export(ctx context.Context) (*BackupDocument, error) {
	if s == nil || s.db == nil {
		return nil, errors.New("backup service is not configured")
	}

	doc := &BackupDocument{
		Format:    backupFormat,
		Version:   1,
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
		Tables:    map[string][]map[string]any{},
		Files:     []BackupFile{},
	}

	for _, table := range backupTableOrder {
		rows, err := s.exportTable(ctx, table)
		if err != nil {
			return nil, err
		}
		doc.Tables[table] = rows
	}

	files, err := s.exportFiles()
	if err != nil {
		return nil, err
	}
	doc.Files = files

	return doc, nil
}

func (s *BackupService) Import(ctx context.Context, doc *BackupDocument) (*BackupImportResult, error) {
	if s == nil || s.db == nil {
		return nil, errors.New("backup service is not configured")
	}
	if doc == nil {
		return nil, ErrBackupInvalid
	}
	if err := validateBackupFiles(doc.Files); err != nil {
		return nil, err
	}
	validation, err := s.Validate(ctx, doc)
	if err != nil {
		return nil, err
	}
	if !validation.Compatible {
		return nil, ErrBackupInvalid
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin backup restore: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	for i := len(backupTableOrder) - 1; i >= 0; i-- {
		table := backupTableOrder[i]
		if _, err = tx.ExecContext(ctx, "DELETE FROM "+quoteIdentifier(table)); err != nil {
			return nil, fmt.Errorf("clear %s: %w", table, err)
		}
	}

	result := &BackupImportResult{}
	for _, table := range backupTableOrder {
		rows := doc.Tables[table]
		if len(rows) == 0 {
			continue
		}
		columns, err := tableColumns(ctx, tx, table)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			inserted, err := insertBackupRow(ctx, tx, table, columns, row)
			if err != nil {
				return nil, err
			}
			if inserted {
				result.RestoredRows++
			}
		}
		result.RestoredTables++
	}

	if err = tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit backup restore: %w", err)
	}

	restoredFiles, err := s.restoreFiles(doc.Files)
	if err != nil {
		return nil, err
	}
	result.RestoredFiles = restoredFiles

	return result, nil
}

func (s *BackupService) Validate(ctx context.Context, doc *BackupDocument) (*BackupValidationResult, error) {
	if s == nil || s.db == nil {
		return nil, errors.New("backup service is not configured")
	}

	result := &BackupValidationResult{
		Tables:   []BackupValidationTable{},
		Warnings: []string{},
		Errors:   []string{},
	}
	if doc == nil {
		result.Errors = append(result.Errors, "Backup-Dokument fehlt.")
		return finishBackupValidation(result), nil
	}

	result.Format = doc.Format
	result.Version = doc.Version
	result.CreatedAt = doc.CreatedAt
	result.FileCount = len(doc.Files)
	for _, file := range doc.Files {
		result.FileBytes += file.SizeBytes
	}
	if doc.Format != backupFormat {
		result.Errors = append(result.Errors, "Backup-Format wird nicht unterstützt.")
	}
	if doc.Version != 1 {
		result.Errors = append(result.Errors, "Backup-Version wird nicht unterstützt.")
	}
	if err := validateBackupFiles(doc.Files); err != nil {
		result.Errors = append(result.Errors, "Backup-Dateien sind unvollständig oder beschädigt.")
	}

	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return nil, fmt.Errorf("begin backup validation: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	knownTables := map[string]struct{}{}
	for _, table := range backupTableOrder {
		knownTables[table] = struct{}{}
		rows, exists := doc.Tables[table]
		item := BackupValidationTable{Name: table, Rows: len(rows), Missing: !exists}
		if !exists {
			if _, optional := optionalBackupTables[table]; optional {
				result.Warnings = append(result.Warnings, fmt.Sprintf("Optionale Tabelle %s fehlt im Backup und wird leer wiederhergestellt.", table))
			} else {
				result.Errors = append(result.Errors, fmt.Sprintf("Tabelle %s fehlt im Backup.", table))
			}
			result.Tables = append(result.Tables, item)
			continue
		}
		result.TableCount++
		result.RowCount += len(rows)

		columns, err := tableColumns(ctx, tx, table)
		if err != nil {
			return nil, err
		}
		unknownColumns := map[string]struct{}{}
		for _, row := range rows {
			for column := range row {
				if !columns[column] {
					unknownColumns[column] = struct{}{}
				}
			}
		}
		item.UnknownColumns = sortedKeys(unknownColumns)
		if len(item.UnknownColumns) > 0 {
			result.Warnings = append(result.Warnings, fmt.Sprintf("Tabelle %s enthält unbekannte Spalten, die beim Restore ignoriert werden.", table))
		}
		result.Tables = append(result.Tables, item)
	}
	for table := range doc.Tables {
		if _, ok := knownTables[table]; !ok {
			result.Warnings = append(result.Warnings, fmt.Sprintf("Unbekannte Tabelle %s wird beim Restore ignoriert.", table))
		}
	}

	return finishBackupValidation(result), nil
}

func (s *BackupService) exportTable(ctx context.Context, table string) ([]map[string]any, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT * FROM "+quoteIdentifier(table))
	if err != nil {
		return nil, fmt.Errorf("export %s: %w", table, err)
	}
	defer func() { _ = rows.Close() }()

	columns, err := rows.Columns()
	if err != nil {
		return nil, fmt.Errorf("read %s columns: %w", table, err)
	}

	out := []map[string]any{}
	for rows.Next() {
		values := make([]any, len(columns))
		targets := make([]any, len(columns))
		for i := range values {
			targets[i] = &values[i]
		}
		if err := rows.Scan(targets...); err != nil {
			return nil, fmt.Errorf("scan %s: %w", table, err)
		}
		row := map[string]any{}
		for i, column := range columns {
			row[column] = normalizeBackupValue(values[i])
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate %s: %w", table, err)
	}
	return out, nil
}

func (s *BackupService) exportFiles() ([]BackupFile, error) {
	uploadsDir := filepath.Join(s.dataDir, "uploads")
	if _, err := os.Stat(uploadsDir); errors.Is(err, os.ErrNotExist) {
		return []BackupFile{}, nil
	}

	files := []BackupFile{}
	if err := filepath.WalkDir(uploadsDir, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			return nil
		}
		relative, err := filepath.Rel(s.dataDir, path)
		if err != nil {
			return err
		}
		relative = filepath.ToSlash(relative)
		if err := validateBackupFilePath(relative); err != nil {
			return err
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		sum := sha256.Sum256(data)
		files = append(files, BackupFile{
			Path:          relative,
			SizeBytes:     int64(len(data)),
			SHA256:        hex.EncodeToString(sum[:]),
			ContentBase64: base64.StdEncoding.EncodeToString(data),
		})
		return nil
	}); err != nil {
		return nil, fmt.Errorf("export backup files: %w", err)
	}
	sort.Slice(files, func(i, j int) bool { return files[i].Path < files[j].Path })
	return files, nil
}

func (s *BackupService) restoreFiles(files []BackupFile) (int, error) {
	uploadsDir := filepath.Join(s.dataDir, "uploads")
	if err := os.RemoveAll(uploadsDir); err != nil {
		return 0, fmt.Errorf("clear uploads: %w", err)
	}

	restored := 0
	for _, file := range files {
		if err := validateBackupFilePath(file.Path); err != nil {
			return restored, err
		}
		data, err := base64.StdEncoding.DecodeString(file.ContentBase64)
		if err != nil {
			return restored, ErrBackupInvalid
		}
		sum := sha256.Sum256(data)
		if file.SHA256 != "" && !strings.EqualFold(file.SHA256, hex.EncodeToString(sum[:])) {
			return restored, ErrBackupInvalid
		}
		target := filepath.Join(s.dataDir, filepath.FromSlash(file.Path))
		base, err := filepath.Abs(s.dataDir)
		if err != nil {
			return restored, err
		}
		absTarget, err := filepath.Abs(target)
		if err != nil {
			return restored, err
		}
		if absTarget != base && !strings.HasPrefix(absTarget, base+string(os.PathSeparator)) {
			return restored, ErrBackupPath
		}
		if err := os.MkdirAll(filepath.Dir(absTarget), 0o755); err != nil {
			return restored, fmt.Errorf("create restore directory: %w", err)
		}
		if err := os.WriteFile(absTarget, data, 0o600); err != nil {
			return restored, fmt.Errorf("restore file: %w", err)
		}
		restored++
	}
	return restored, nil
}

func tableColumns(ctx context.Context, tx *sql.Tx, table string) (map[string]bool, error) {
	rows, err := tx.QueryContext(ctx, "PRAGMA table_info("+quoteIdentifier(table)+")")
	if err != nil {
		return nil, fmt.Errorf("read %s schema: %w", table, err)
	}
	defer func() { _ = rows.Close() }()

	columns := map[string]bool{}
	for rows.Next() {
		var cid int
		var name, columnType string
		var notNull int
		var defaultValue any
		var pk int
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultValue, &pk); err != nil {
			return nil, fmt.Errorf("scan %s schema: %w", table, err)
		}
		columns[name] = true
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate %s schema: %w", table, err)
	}
	return columns, nil
}

func insertBackupRow(ctx context.Context, tx *sql.Tx, table string, allowedColumns map[string]bool, row map[string]any) (bool, error) {
	columns := make([]string, 0, len(row))
	for column := range row {
		if allowedColumns[column] {
			columns = append(columns, column)
		}
	}
	sort.Strings(columns)
	if len(columns) == 0 {
		return false, nil
	}

	placeholders := make([]string, len(columns))
	values := make([]any, len(columns))
	for i, column := range columns {
		placeholders[i] = "?"
		values[i] = normalizeImportValue(row[column])
	}

	query := "INSERT INTO " + quoteIdentifier(table) +
		" (" + strings.Join(quoteIdentifiers(columns), ", ") + ")" +
		" VALUES (" + strings.Join(placeholders, ", ") + ")"
	if _, err := tx.ExecContext(ctx, query, values...); err != nil {
		return false, fmt.Errorf("insert %s: %w", table, err)
	}
	return true, nil
}

func normalizeBackupValue(value any) any {
	switch typed := value.(type) {
	case []byte:
		return string(typed)
	default:
		return typed
	}
}

func normalizeImportValue(value any) any {
	switch typed := value.(type) {
	case json.Number:
		if intValue, err := typed.Int64(); err == nil {
			return intValue
		}
		if floatValue, err := typed.Float64(); err == nil {
			return floatValue
		}
		return typed.String()
	default:
		return typed
	}
}

func finishBackupValidation(result *BackupValidationResult) *BackupValidationResult {
	result.Compatible = len(result.Errors) == 0
	return result
}

func sortedKeys(values map[string]struct{}) []string {
	out := make([]string, 0, len(values))
	for value := range values {
		out = append(out, value)
	}
	sort.Strings(out)
	return out
}

func quoteIdentifiers(values []string) []string {
	out := make([]string, len(values))
	for i, value := range values {
		out[i] = quoteIdentifier(value)
	}
	return out
}

func quoteIdentifier(value string) string {
	return `"` + strings.ReplaceAll(value, `"`, `""`) + `"`
}

func validateBackupFilePath(value string) error {
	value = filepath.ToSlash(strings.TrimSpace(value))
	if value == "" || filepath.IsAbs(value) || strings.Contains(value, "\x00") {
		return ErrBackupPath
	}
	cleaned := pathClean(value)
	if cleaned != value || strings.HasPrefix(cleaned, "../") || cleaned == ".." {
		return ErrBackupPath
	}
	if !strings.HasPrefix(cleaned, "uploads/") {
		return ErrBackupPath
	}
	return nil
}

func validateBackupFiles(files []BackupFile) error {
	for _, file := range files {
		if err := validateBackupFilePath(file.Path); err != nil {
			return err
		}
		data, err := base64.StdEncoding.DecodeString(file.ContentBase64)
		if err != nil {
			return ErrBackupInvalid
		}
		if file.SizeBytes > 0 && int64(len(data)) != file.SizeBytes {
			return ErrBackupInvalid
		}
		sum := sha256.Sum256(data)
		if file.SHA256 != "" && !strings.EqualFold(file.SHA256, hex.EncodeToString(sum[:])) {
			return ErrBackupInvalid
		}
	}
	return nil
}

func pathClean(value string) string {
	cleaned := filepath.ToSlash(filepath.Clean(filepath.FromSlash(value)))
	if cleaned == "." {
		return ""
	}
	return cleaned
}

func DecodeBackup(data []byte) (*BackupDocument, error) {
	var doc BackupDocument
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	if err := decoder.Decode(&doc); err != nil {
		return nil, ErrBackupInvalid
	}
	return &doc, nil
}
