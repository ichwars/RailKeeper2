package api

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"unicode/utf16"
)

const (
	cfbFreeSect uint32 = 0xFFFFFFFF
	cfbEndSect  uint32 = 0xFFFFFFFE

	biffBOF        uint16 = 0x0809
	biffEOF        uint16 = 0x000A
	biffBound      uint16 = 0x0085
	biffSST        uint16 = 0x00FC
	biffContinue   uint16 = 0x003C
	biffLabel      uint16 = 0x0204
	biffLabelSST   uint16 = 0x00FD
	biffNumber     uint16 = 0x0203
	biffRK         uint16 = 0x027E
	biffBoolErr    uint16 = 0x0205
	biffFormula    uint16 = 0x0006
	biffBlank      uint16 = 0x0201
	biffMulBlank   uint16 = 0x00BE
	biffMulRK      uint16 = 0x00BD
	biffRString    uint16 = 0x00D6
	biffLabelBIFF2 uint16 = 0x0004
)

var (
	errInvalidCFB = errors.New("invalid xls compound document")
	errInvalidXLS = errors.New("invalid xls workbook")
)

type cfbDirectoryEntry struct {
	name        string
	objectType  byte
	startSector uint32
	size        uint64
}

type cfbDocument struct {
	data             []byte
	sectorSize       int
	miniSectorSize   int
	miniCutoff       uint32
	fat              []uint32
	miniFAT          []uint32
	miniStream       []byte
	directoryEntries []cfbDirectoryEntry
}

type biffRecord struct {
	id   uint16
	data []byte
	pos  int
}

type boundSheet struct {
	offset uint32
	typ    byte
}

func parseXLSRows(data []byte) ([][]string, error) {
	workbook, err := openXLSWorkbookStream(data)
	if err != nil {
		return nil, err
	}
	return parseBIFFWorkbookRows(workbook)
}

func openXLSWorkbookStream(data []byte) ([]byte, error) {
	document, err := parseCFBDocument(data)
	if err != nil {
		return nil, err
	}
	for _, entry := range document.directoryEntries {
		if entry.objectType != 2 {
			continue
		}
		name := strings.ToLower(entry.name)
		if name != "workbook" && name != "book" {
			continue
		}
		if entry.size < uint64(document.miniCutoff) {
			return document.readMiniStream(entry.startSector, entry.size)
		}
		return document.readRegularStream(entry.startSector, entry.size)
	}
	return nil, errInvalidXLS
}

func parseCFBDocument(data []byte) (*cfbDocument, error) {
	if len(data) < 512 || !bytes.Equal(data[:8], []byte{0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1}) {
		return nil, errInvalidCFB
	}
	sectorShift := binary.LittleEndian.Uint16(data[30:32])
	miniSectorShift := binary.LittleEndian.Uint16(data[32:34])
	sectorSize := 1 << sectorShift
	miniSectorSize := 1 << miniSectorShift
	if sectorSize < 512 || sectorSize > 4096 || miniSectorSize < 32 || miniSectorSize > 512 {
		return nil, errInvalidCFB
	}
	document := &cfbDocument{
		data:           data,
		sectorSize:     sectorSize,
		miniSectorSize: miniSectorSize,
		miniCutoff:     binary.LittleEndian.Uint32(data[56:60]),
	}

	fatSectors := document.initialFATSectors()
	if len(fatSectors) == 0 {
		return nil, errInvalidCFB
	}
	document.fat = document.readFAT(fatSectors)
	if len(document.fat) == 0 {
		return nil, errInvalidCFB
	}

	directoryStart := binary.LittleEndian.Uint32(data[48:52])
	directoryData, err := document.readRegularStream(directoryStart, 0)
	if err != nil {
		return nil, err
	}
	document.directoryEntries = parseCFBDirectory(directoryData)
	if len(document.directoryEntries) == 0 {
		return nil, errInvalidCFB
	}

	root := document.rootEntry()
	miniFATStart := binary.LittleEndian.Uint32(data[60:64])
	miniFATSectors := binary.LittleEndian.Uint32(data[64:68])
	if root != nil && miniFATStart != cfbEndSect && miniFATStart != cfbFreeSect && miniFATSectors > 0 {
		miniFATData, err := document.readRegularStreamBySectors(miniFATStart, int(miniFATSectors))
		if err == nil {
			document.miniFAT = uint32Entries(miniFATData)
			document.miniStream, _ = document.readRegularStream(root.startSector, root.size)
		}
	}

	return document, nil
}

func (d *cfbDocument) initialFATSectors() []uint32 {
	var sectors []uint32
	for offset := 76; offset+4 <= 512 && len(sectors) < 109; offset += 4 {
		sector := binary.LittleEndian.Uint32(d.data[offset : offset+4])
		if sector != cfbFreeSect && sector != cfbEndSect {
			sectors = append(sectors, sector)
		}
	}
	return sectors
}

func (d *cfbDocument) readFAT(sectors []uint32) []uint32 {
	var fat []uint32
	for _, sector := range sectors {
		block, ok := d.sectorBytes(sector)
		if !ok {
			continue
		}
		fat = append(fat, uint32Entries(block)...)
	}
	return fat
}

func uint32Entries(data []byte) []uint32 {
	entries := make([]uint32, 0, len(data)/4)
	for offset := 0; offset+4 <= len(data); offset += 4 {
		entries = append(entries, binary.LittleEndian.Uint32(data[offset:offset+4]))
	}
	return entries
}

func (d *cfbDocument) sectorBytes(sector uint32) ([]byte, bool) {
	offset := (int64(sector) + 1) * int64(d.sectorSize)
	end := offset + int64(d.sectorSize)
	if offset < 0 || end > int64(len(d.data)) {
		return nil, false
	}
	return d.data[offset:end], true
}

func (d *cfbDocument) readRegularStream(start uint32, size uint64) ([]byte, error) {
	return d.readRegularStreamByLimit(start, size, 0)
}

func (d *cfbDocument) readRegularStreamBySectors(start uint32, sectors int) ([]byte, error) {
	return d.readRegularStreamByLimit(start, 0, sectors)
}

func (d *cfbDocument) readRegularStreamByLimit(start uint32, size uint64, maxSectors int) ([]byte, error) {
	if start == cfbEndSect || start == cfbFreeSect {
		return nil, errInvalidCFB
	}
	var output []byte
	seen := map[uint32]bool{}
	sector := start
	for sector != cfbEndSect {
		if int(sector) >= len(d.fat) || seen[sector] {
			return nil, errInvalidCFB
		}
		if maxSectors > 0 && len(seen) >= maxSectors {
			break
		}
		seen[sector] = true
		block, ok := d.sectorBytes(sector)
		if !ok {
			return nil, errInvalidCFB
		}
		output = append(output, block...)
		sector = d.fat[sector]
	}
	if size > 0 && uint64(len(output)) > size {
		output = output[:size]
	}
	return output, nil
}

func (d *cfbDocument) readMiniStream(start uint32, size uint64) ([]byte, error) {
	if len(d.miniFAT) == 0 || len(d.miniStream) == 0 {
		return nil, errInvalidCFB
	}
	var output []byte
	seen := map[uint32]bool{}
	sector := start
	for sector != cfbEndSect {
		if int(sector) >= len(d.miniFAT) || seen[sector] {
			return nil, errInvalidCFB
		}
		seen[sector] = true
		offset := int(sector) * d.miniSectorSize
		end := offset + d.miniSectorSize
		if offset < 0 || end > len(d.miniStream) {
			return nil, errInvalidCFB
		}
		output = append(output, d.miniStream[offset:end]...)
		sector = d.miniFAT[sector]
	}
	if size > 0 && uint64(len(output)) > size {
		output = output[:size]
	}
	return output, nil
}

func parseCFBDirectory(data []byte) []cfbDirectoryEntry {
	var entries []cfbDirectoryEntry
	for offset := 0; offset+128 <= len(data); offset += 128 {
		entry := data[offset : offset+128]
		nameLength := int(binary.LittleEndian.Uint16(entry[64:66]))
		if nameLength < 2 || nameLength > 64 {
			continue
		}
		nameData := entry[:nameLength-2]
		nameRunes := make([]uint16, 0, len(nameData)/2)
		for index := 0; index+2 <= len(nameData); index += 2 {
			nameRunes = append(nameRunes, binary.LittleEndian.Uint16(nameData[index:index+2]))
		}
		entries = append(entries, cfbDirectoryEntry{
			name:        string(utf16.Decode(nameRunes)),
			objectType:  entry[66],
			startSector: binary.LittleEndian.Uint32(entry[116:120]),
			size:        binary.LittleEndian.Uint64(entry[120:128]),
		})
	}
	return entries
}

func (d *cfbDocument) rootEntry() *cfbDirectoryEntry {
	for index := range d.directoryEntries {
		if d.directoryEntries[index].objectType == 5 {
			return &d.directoryEntries[index]
		}
	}
	return nil
}

func parseBIFFWorkbookRows(data []byte) ([][]string, error) {
	records := readBIFFRecords(data)
	if len(records) == 0 {
		return nil, errInvalidXLS
	}
	sst := parseBIFFSST(records)
	sheetOffset := firstWorksheetOffset(records)
	if sheetOffset < 0 || sheetOffset >= len(data) {
		return nil, errInvalidXLS
	}
	rows, err := parseBIFFSheet(data[sheetOffset:], sst)
	if err != nil {
		return nil, err
	}
	return trimEmptyImportRows(rows), nil
}

func readBIFFRecords(data []byte) []biffRecord {
	var records []biffRecord
	for offset := 0; offset+4 <= len(data); {
		id := binary.LittleEndian.Uint16(data[offset : offset+2])
		length := int(binary.LittleEndian.Uint16(data[offset+2 : offset+4]))
		if offset+4+length > len(data) {
			break
		}
		records = append(records, biffRecord{id: id, data: data[offset+4 : offset+4+length], pos: offset})
		offset += 4 + length
	}
	return records
}

func firstWorksheetOffset(records []biffRecord) int {
	var sheets []boundSheet
	for _, record := range records {
		if record.id != biffBound || len(record.data) < 8 {
			continue
		}
		sheets = append(sheets, boundSheet{
			offset: binary.LittleEndian.Uint32(record.data[0:4]),
			typ:    record.data[5],
		})
	}
	sort.Slice(sheets, func(i, j int) bool { return sheets[i].offset < sheets[j].offset })
	for _, sheet := range sheets {
		if sheet.typ == 0 {
			return int(sheet.offset)
		}
	}
	for _, record := range records {
		if record.id == biffBOF {
			return record.pos
		}
	}
	return -1
}

func parseBIFFSST(records []biffRecord) []string {
	var values []string
	for index := 0; index < len(records); index++ {
		if records[index].id != biffSST || len(records[index].data) < 8 {
			continue
		}
		sstData := append([]byte{}, records[index].data...)
		for next := index + 1; next < len(records) && records[next].id == biffContinue; next++ {
			sstData = append(sstData, records[next].data...)
			index = next
		}
		uniqueCount := int(binary.LittleEndian.Uint32(sstData[4:8]))
		reader := biffStringReader{data: sstData[8:]}
		for len(values) < uniqueCount && reader.remaining() > 0 {
			text, ok := reader.readString()
			if !ok {
				break
			}
			values = append(values, text)
		}
	}
	return values
}

func parseBIFFSheet(data []byte, sst []string) ([][]string, error) {
	var rows [][]string
	records := readBIFFRecords(data)
	for _, record := range records {
		if record.id == biffEOF {
			return rows, nil
		}
		if len(rows) >= maxImportRows {
			return rows, nil
		}
		switch record.id {
		case biffLabelSST:
			if len(record.data) < 10 {
				continue
			}
			row, column := biffRowColumn(record.data)
			index := int(binary.LittleEndian.Uint32(record.data[6:10]))
			if index >= 0 && index < len(sst) {
				setBIFFCell(&rows, row, column, sst[index])
			}
		case biffNumber:
			if len(record.data) >= 14 {
				row, column := biffRowColumn(record.data)
				value := math.Float64frombits(binary.LittleEndian.Uint64(record.data[6:14]))
				setBIFFCell(&rows, row, column, formatImportNumber(value))
			}
		case biffRK:
			if len(record.data) >= 10 {
				row, column := biffRowColumn(record.data)
				setBIFFCell(&rows, row, column, formatImportNumber(decodeRK(binary.LittleEndian.Uint32(record.data[6:10]))))
			}
		case biffMulRK:
			readBIFFMulRK(&rows, record.data)
		case biffBoolErr:
			if len(record.data) >= 8 && record.data[7] == 0 {
				row, column := biffRowColumn(record.data)
				if record.data[6] == 0 {
					setBIFFCell(&rows, row, column, "false")
				} else {
					setBIFFCell(&rows, row, column, "true")
				}
			}
		case biffFormula:
			if len(record.data) >= 14 {
				row, column := biffRowColumn(record.data)
				value := math.Float64frombits(binary.LittleEndian.Uint64(record.data[6:14]))
				if !math.IsNaN(value) && !math.IsInf(value, 0) {
					setBIFFCell(&rows, row, column, formatImportNumber(value))
				}
			}
		case biffLabel, biffRString:
			if len(record.data) >= 8 {
				row, column := biffRowColumn(record.data)
				if text, ok := readBIFFUnicodeString(record.data[6:]); ok {
					setBIFFCell(&rows, row, column, text)
				}
			}
		case biffLabelBIFF2:
			if len(record.data) >= 7 {
				row, column := biffRowColumn(record.data)
				length := int(record.data[6])
				if len(record.data) >= 7+length {
					setBIFFCell(&rows, row, column, strings.TrimSpace(string(record.data[7:7+length])))
				}
			}
		case biffBlank, biffMulBlank:
			continue
		}
	}
	return rows, nil
}

func biffRowColumn(data []byte) (int, int) {
	return int(binary.LittleEndian.Uint16(data[0:2])), int(binary.LittleEndian.Uint16(data[2:4]))
}

func readBIFFMulRK(rows *[][]string, data []byte) {
	if len(data) < 10 {
		return
	}
	row := int(binary.LittleEndian.Uint16(data[0:2]))
	firstColumn := int(binary.LittleEndian.Uint16(data[2:4]))
	lastColumn := int(binary.LittleEndian.Uint16(data[len(data)-2:]))
	offset := 4
	for column := firstColumn; column <= lastColumn && offset+6 <= len(data)-2; column++ {
		value := decodeRK(binary.LittleEndian.Uint32(data[offset+2 : offset+6]))
		setBIFFCell(rows, row, column, formatImportNumber(value))
		offset += 6
	}
}

func setBIFFCell(rows *[][]string, row int, column int, value string) {
	if row < 0 || row >= maxImportRows || column < 0 || column >= maxImportColumns {
		return
	}
	for len(*rows) <= row {
		*rows = append(*rows, nil)
	}
	for len((*rows)[row]) <= column {
		(*rows)[row] = append((*rows)[row], "")
	}
	(*rows)[row][column] = strings.TrimSpace(value)
}

func decodeRK(raw uint32) float64 {
	div100 := raw&0x01 != 0
	isInteger := raw&0x02 != 0
	var value float64
	if isInteger {
		value = float64(int32(raw) >> 2)
	} else {
		bits := uint64(raw&0xFFFFFFFC) << 32
		value = math.Float64frombits(bits)
	}
	if div100 {
		value /= 100
	}
	return value
}

func formatImportNumber(value float64) string {
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return ""
	}
	if math.Abs(value-math.Round(value)) < 0.0000001 {
		return fmt.Sprintf("%.0f", value)
	}
	return strings.TrimRight(strings.TrimRight(fmt.Sprintf("%.8f", value), "0"), ".")
}

type biffStringReader struct {
	data []byte
	pos  int
}

func (r *biffStringReader) remaining() int {
	return len(r.data) - r.pos
}

func (r *biffStringReader) readString() (string, bool) {
	if r.remaining() < 3 {
		return "", false
	}
	length := int(binary.LittleEndian.Uint16(r.data[r.pos : r.pos+2]))
	flags := r.data[r.pos+2]
	r.pos += 3
	richRuns := 0
	phoneticSize := 0
	if flags&0x08 != 0 {
		if r.remaining() < 2 {
			return "", false
		}
		richRuns = int(binary.LittleEndian.Uint16(r.data[r.pos : r.pos+2]))
		r.pos += 2
	}
	if flags&0x04 != 0 {
		if r.remaining() < 4 {
			return "", false
		}
		phoneticSize = int(binary.LittleEndian.Uint32(r.data[r.pos : r.pos+4]))
		r.pos += 4
	}
	text, ok := r.readCharacters(length, flags&0x01 != 0)
	if !ok {
		return "", false
	}
	skip := richRuns*4 + phoneticSize
	if skip > r.remaining() {
		return "", false
	}
	r.pos += skip
	return strings.TrimSpace(text), true
}

func (r *biffStringReader) readCharacters(length int, unicodeString bool) (string, bool) {
	if unicodeString {
		bytesNeeded := length * 2
		if bytesNeeded > r.remaining() {
			return "", false
		}
		chars := make([]uint16, 0, length)
		for index := 0; index < bytesNeeded; index += 2 {
			chars = append(chars, binary.LittleEndian.Uint16(r.data[r.pos+index:r.pos+index+2]))
		}
		r.pos += bytesNeeded
		return string(utf16.Decode(chars)), true
	}
	if length > r.remaining() {
		return "", false
	}
	text := string(r.data[r.pos : r.pos+length])
	r.pos += length
	return text, true
}

func readBIFFUnicodeString(data []byte) (string, bool) {
	reader := biffStringReader{data: data}
	return reader.readString()
}
