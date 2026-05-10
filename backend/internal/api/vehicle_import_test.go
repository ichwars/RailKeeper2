package api

import (
	"archive/zip"
	"bytes"
	"testing"
)

func TestParseXLSXRows(t *testing.T) {
	var buffer bytes.Buffer
	writer := zip.NewWriter(&buffer)
	writeZipFile(t, writer, "xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Bestand" sheetId="1" r:id="rId1"/></sheets>
</workbook>`)
	writeZipFile(t, writer, "xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8"?>
<Relationships>
  <Relationship Id="rId1" Target="worksheets/sheet1.xml"/>
</Relationships>`)
	writeZipFile(t, writer, "xl/sharedStrings.xml", `<?xml version="1.0" encoding="UTF-8"?>
<sst>
  <si><t>Hersteller</t></si>
  <si><t>Bezeichnung</t></si>
  <si><t>Spur</t></si>
  <si><t>Piko</t></si>
  <si><t>V 180</t></si>
  <si><t>TT</t></si>
</sst>`)
	writeZipFile(t, writer, "xl/worksheets/sheet1.xml", `<?xml version="1.0" encoding="UTF-8"?>
<worksheet>
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>0</v></c>
      <c r="B1" t="s"><v>1</v></c>
      <c r="C1" t="s"><v>2</v></c>
    </row>
    <row r="2">
      <c r="A2" t="s"><v>3</v></c>
      <c r="B2" t="s"><v>4</v></c>
      <c r="C2" t="s"><v>5</v></c>
    </row>
  </sheetData>
</worksheet>`)
	if err := writer.Close(); err != nil {
		t.Fatalf("close xlsx zip: %v", err)
	}

	rows, err := parseXLSXRows(buffer.Bytes())
	if err != nil {
		t.Fatalf("parse xlsx rows: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("expected 2 rows, got %#v", rows)
	}
	if rows[0][0] != "Hersteller" || rows[0][1] != "Bezeichnung" || rows[1][0] != "Piko" || rows[1][2] != "TT" {
		t.Fatalf("unexpected rows: %#v", rows)
	}
}

func TestParseODSRows(t *testing.T) {
	var buffer bytes.Buffer
	writer := zip.NewWriter(&buffer)
	writeZipFile(t, writer, "content.xml", `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
  <office:body>
    <office:spreadsheet>
      <table:table table:name="Bestand">
        <table:table-row>
          <table:table-cell office:value-type="string"><text:p>Hersteller</text:p></table:table-cell>
          <table:table-cell office:value-type="string"><text:p>Bezeichnung</text:p></table:table-cell>
          <table:table-cell office:value-type="string"><text:p>Spur</text:p></table:table-cell>
        </table:table-row>
        <table:table-row>
          <table:table-cell office:value-type="string"><text:p>Piko</text:p></table:table-cell>
          <table:table-cell office:value-type="string"><text:p>V 180</text:p></table:table-cell>
          <table:table-cell office:value-type="string"><text:p>TT</text:p></table:table-cell>
        </table:table-row>
        <table:table-row>
          <table:table-cell table:number-columns-repeated="2"/>
          <table:table-cell office:value-type="float" office:value="162"/>
        </table:table-row>
      </table:table>
    </office:spreadsheet>
  </office:body>
</office:document-content>`)
	if err := writer.Close(); err != nil {
		t.Fatalf("close ods zip: %v", err)
	}

	rows, err := parseODSRows(buffer.Bytes())
	if err != nil {
		t.Fatalf("parse ods rows: %v", err)
	}
	if len(rows) != 3 {
		t.Fatalf("expected 3 rows, got %#v", rows)
	}
	if rows[0][0] != "Hersteller" || rows[1][1] != "V 180" || rows[1][2] != "TT" || rows[2][2] != "162" {
		t.Fatalf("unexpected rows: %#v", rows)
	}
}

func writeZipFile(t *testing.T, writer *zip.Writer, name string, content string) {
	t.Helper()
	file, err := writer.Create(name)
	if err != nil {
		t.Fatalf("create zip file %s: %v", name, err)
	}
	if _, err := file.Write([]byte(content)); err != nil {
		t.Fatalf("write zip file %s: %v", name, err)
	}
}
