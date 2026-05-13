import { ChangeEvent, Fragment, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Database, Download, FileInput, Printer, Save, Upload } from "lucide-react";
import { api, CreateVehicleRequest, ECoSConnectionResult, ECoSLocomotivePreview, Vehicle } from "../../shared/api";
import { useI18n } from "../../shared/i18n";

type ImportRow = {
  id: string;
  selected: boolean;
  mode: "create" | "update";
  status: "ok" | "warning" | "error" | "saved";
  issues: string[];
  importedKeys: (keyof CreateVehicleRequest)[];
  duplicateVehicleId?: string;
  vehicle: CreateVehicleRequest;
};

type VehicleImportField = keyof CreateVehicleRequest;

type ColumnMapping = {
  index: number;
  header: string;
  normalized: string;
  key: VehicleImportField | "";
};

type ImportTablePreview = {
  fileName: string;
  table: string[][];
  mappings: ColumnMapping[];
};

type ImportChange = {
  key: VehicleImportField;
  label: string;
  current: string;
  incoming: string;
  status: "same" | "fill" | "overwrite";
};

const vehicleImportFields: { key: VehicleImportField; label: string }[] = [
  { key: "inventoryNumber", label: "Inventarnummer" },
  { key: "manufacturer", label: "Hersteller" },
  { key: "articleNumber", label: "Artikel-Nr." },
  { key: "articleSourceUrl", label: "Quelle / URL" },
  { key: "name", label: "Bezeichnung" },
  { key: "gauge", label: "Spurweite" },
  { key: "epoch", label: "Epoche" },
  { key: "railwayCompany", label: "Bahngesellschaft" },
  { key: "category", label: "Kategorie" },
  { key: "gattung", label: "Gattung" },
  { key: "description", label: "Beschreibung" },
  { key: "series", label: "Baureihe" },
  { key: "vehicleNumber", label: "Fahrzeug-Nr." },
  { key: "digital", label: "Digital" },
  { key: "digitalDecoderNumber", label: "Digital / Decoder-Nr." },
  { key: "dtDecoder", label: "DT / Decoder" },
  { key: "dtDecoderNumber", label: "DT / Decoder-Nr." },
  { key: "exhibitionReady", label: "Messe tauglich" },
  { key: "abcBrakes", label: "ABC-Bremsen" },
  { key: "ean", label: "EAN" },
  { key: "productionPeriod", label: "Produktionszeit" },
  { key: "listPrice", label: "Listenpreis" },
  { key: "lengthMm", label: "Länge (mm)" },
  { key: "weightG", label: "Gewicht (g)" },
  { key: "color", label: "Farbe" },
  { key: "lettering", label: "Beschriftung" },
  { key: "load", label: "Beladung" },
  { key: "interior", label: "Inneneinrichtung" },
  { key: "axles", label: "Achsen" },
  { key: "axleCount", label: "Anzahl Achsen" },
  { key: "tractionTireCount", label: "Anzahl Haftreifen" },
  { key: "wheelset", label: "Radsatz" },
  { key: "couplingSame", label: "Kupplung (V=H)" },
  { key: "couplingFront", label: "Kupplung vorne" },
  { key: "couplingRear", label: "Kupplung hinten" },
  { key: "powerPickup", label: "Stromabnahme" },
  { key: "adapter", label: "Adapter / Schnittstelle" },
  { key: "driveEnabled", label: "Antrieb" },
  { key: "driveDescription", label: "Antrieb Beschreibung" },
  { key: "headlightsEnabled", label: "Fahrlicht" },
  { key: "headlightsDescription", label: "Fahrlicht Beschreibung" },
  { key: "lightingEnabled", label: "Beleuchtung" },
  { key: "lightingDescription", label: "Beleuchtung Beschreibung" },
  { key: "soundGeneratorEnabled", label: "Soundgenerator" },
  { key: "soundGeneratorDescription", label: "Soundgenerator Beschreibung" },
  { key: "smokeGeneratorEnabled", label: "Rauchgenerator" },
  { key: "smokeGeneratorDescription", label: "Rauchgenerator Beschreibung" },
  { key: "additionalInfo", label: "Zusatzinformationen" },
  { key: "qrCodeEnabled", label: "QR-Code erstellen" }
];

const booleanImportFields = new Set<VehicleImportField>([
  "digital",
  "dtDecoder",
  "exhibitionReady",
  "abcBrakes",
  "couplingSame",
  "driveEnabled",
  "headlightsEnabled",
  "lightingEnabled",
  "soundGeneratorEnabled",
  "smokeGeneratorEnabled",
  "qrCodeEnabled"
]);

const columnAliases: Record<string, VehicleImportField> = {
  inventar: "inventoryNumber",
  inventarnummer: "inventoryNumber",
  inventarnr: "inventoryNumber",
  "inventar-nr": "inventoryNumber",
  "inventar-nr-": "inventoryNumber",
  inv: "inventoryNumber",
  invnr: "inventoryNumber",
  "inv-nr": "inventoryNumber",
  "inv-nr-": "inventoryNumber",
  inventarid: "inventoryNumber",
  bestandsnummer: "inventoryNumber",
  nummer: "inventoryNumber",
  hersteller: "manufacturer",
  fabrikat: "manufacturer",
  marke: "manufacturer",
  firma: "manufacturer",
  produzent: "manufacturer",
  artikel: "articleNumber",
  artikelnummer: "articleNumber",
  artikelnr: "articleNumber",
  "artikel-nr": "articleNumber",
  "artikel-nr-": "articleNumber",
  "artikel-nr-alt": "articleNumber",
  artnr: "articleNumber",
  "art-nr": "articleNumber",
  "art-nr-": "articleNumber",
  bestellnummer: "articleNumber",
  bestellnr: "articleNumber",
  "bestell-nr": "articleNumber",
  "bestell-nr-": "articleNumber",
  katalognummer: "articleNumber",
  katalognr: "articleNumber",
  "katalog-nr": "articleNumber",
  "katalog-nr-": "articleNumber",
  url: "articleSourceUrl",
  quelle: "articleSourceUrl",
  source: "articleSourceUrl",
  link: "articleSourceUrl",
  website: "articleSourceUrl",
  webseite: "articleSourceUrl",
  artikelquelle: "articleSourceUrl",
  bezeichnung: "name",
  name: "name",
  modell: "name",
  modellname: "name",
  fahrzeug: "name",
  fahrzeugname: "name",
  titel: "name",
  typ: "name",
  spur: "gauge",
  spurweite: "gauge",
  gauge: "gauge",
  nenngroesse: "gauge",
  nenngrosse: "gauge",
  nenngroessemassstab: "gauge",
  massstab: "gauge",
  masstab: "gauge",
  scale: "gauge",
  epoche: "epoch",
  era: "epoch",
  bahngesellschaft: "railwayCompany",
  bahn: "railwayCompany",
  evu: "railwayCompany",
  verwaltung: "railwayCompany",
  gesellschaft: "railwayCompany",
  kategorie: "category",
  fahrzeugkategorie: "category",
  art: "category",
  gattung: "gattung",
  bauart: "gattung",
  "bauart-gattung": "gattung",
  beschreibung: "description",
  notiz: "description",
  notizen: "description",
  kommentar: "description",
  bemerkung: "description",
  baureihe: "series",
  br: "series",
  reihe: "series",
  fahrzeugnummer: "vehicleNumber",
  fahrzeugnr: "vehicleNumber",
  "fahrzeug-nr": "vehicleNumber",
  digital: "digital",
  decoderja: "digital",
  decoder: "digitalDecoderNumber",
  decodernummer: "digitalDecoderNumber",
  decodernr: "digitalDecoderNumber",
  "decoder-nr": "digitalDecoderNumber",
  digitaldecoder: "digitalDecoderNumber",
  "digital-decoder": "digitalDecoderNumber",
  "digital-decoder-nr": "digitalDecoderNumber",
  digitaldecodernummer: "digitalDecoderNumber",
  dtdecoder: "dtDecoder",
  "dt-decoder": "dtDecoder",
  "dt-decoder-nr": "dtDecoderNumber",
  dtnummer: "dtDecoderNumber",
  dtdecodernummer: "dtDecoderNumber",
  messe: "exhibitionReady",
  messetauglich: "exhibitionReady",
  abcbremse: "abcBrakes",
  abcbremsen: "abcBrakes",
  ean: "ean",
  barcode: "ean",
  produktionszeit: "productionPeriod",
  produktion: "productionPeriod",
  baujahr: "productionPeriod",
  bauzeit: "productionPeriod",
  listenpreis: "listPrice",
  herstellerpreis: "listPrice",
  herstellerlistenpreis: "listPrice",
  "herstellerpreis-listenpreis": "listPrice",
  preis: "listPrice",
  uvp: "listPrice",
  laenge: "lengthMm",
  lange: "lengthMm",
  "laenge-mm": "lengthMm",
  "lange-mm": "lengthMm",
  laengemm: "lengthMm",
  langemm: "lengthMm",
  "laenge-in-mm": "lengthMm",
  "lange-in-mm": "lengthMm",
  mass: "lengthMm",
  mas: "lengthMm",
  "mass-mm": "lengthMm",
  "mas-mm": "lengthMm",
  "mass-mm-": "lengthMm",
  "mas-mm-": "lengthMm",
  masse: "lengthMm",
  "masse-mm": "lengthMm",
  gewicht: "weightG",
  "gewicht-g": "weightG",
  gewichtg: "weightG",
  farbe: "color",
  beschriftung: "lettering",
  beladung: "load",
  inneneinrichtung: "interior",
  einrichtung: "interior",
  achsen: "axles",
  anzahl: "axleCount",
  achsanzahl: "axleCount",
  anzahlachsen: "axleCount",
  "anzahl-achsen": "axleCount",
  haftreifen: "tractionTireCount",
  anzahlhaftreifen: "tractionTireCount",
  "anzahl-haftreifen": "tractionTireCount",
  radsatz: "wheelset",
  stromabnahme: "powerPickup",
  stromsystem: "powerPickup",
  strom: "powerPickup",
  adapter: "adapter",
  schnittstelle: "adapter",
  digitaleschnittstelle: "adapter",
  kupplung: "couplingFront",
  kupplungvorne: "couplingFront",
  "kupplung-vorne": "couplingFront",
  kupplunghinten: "couplingRear",
  "kupplung-hinten": "couplingRear",
  kupplungvh: "couplingSame",
  "kupplung-v-h": "couplingSame",
  "kupplung-v=h": "couplingSame",
  antrieb: "driveEnabled",
  antriebbeschreibung: "driveDescription",
  "antrieb-beschreibung": "driveDescription",
  fahrlicht: "headlightsEnabled",
  fahrlichtbeschreibung: "headlightsDescription",
  "fahrlicht-beschreibung": "headlightsDescription",
  beleuchtung: "lightingEnabled",
  licht: "lightingEnabled",
  beleuchtungsbeschreibung: "lightingDescription",
  "beleuchtung-beschreibung": "lightingDescription",
  lichtbeschreibung: "lightingDescription",
  "licht-beschreibung": "lightingDescription",
  sound: "soundGeneratorEnabled",
  soundgenerator: "soundGeneratorEnabled",
  soundmodul: "soundGeneratorEnabled",
  soundbeschreibung: "soundGeneratorDescription",
  "sound-beschreibung": "soundGeneratorDescription",
  soundgeneratorbeschreibung: "soundGeneratorDescription",
  "soundgenerator-beschreibung": "soundGeneratorDescription",
  rauch: "smokeGeneratorEnabled",
  rauchgenerator: "smokeGeneratorEnabled",
  rauchbeschreibung: "smokeGeneratorDescription",
  "rauch-beschreibung": "smokeGeneratorDescription",
  rauchgeneratorbeschreibung: "smokeGeneratorDescription",
  "rauchgenerator-beschreibung": "smokeGeneratorDescription",
  zusatzinfo: "additionalInfo",
  zusatzinformationen: "additionalInfo",
  zusatz: "additionalInfo",
  qrcode: "qrCodeEnabled",
  "qr-code": "qrCodeEnabled"
};

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/\s+/g, "")
    .replace(/[._/:()[\]]/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseBoolean(value: string) {
  return ["1", "ja", "yes", "true", "wahr", "digital", "d", "x", "vorhanden"].includes(value.trim().toLowerCase());
}

function defaultColumnMappings(table: string[][]): ColumnMapping[] {
  return (table[0] || []).map((header, index) => {
    const normalized = normalizeHeader(header);
    return {
      index,
      header: header || `Spalte ${index + 1}`,
      normalized,
      key: columnAliases[normalized] || ""
    };
  });
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseDelimited(text: string, delimiter: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(current.trim());
      current = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(current.trim());
      if (row.some(Boolean)) {
        rows.push(row);
      }
      row = [];
      current = "";
    } else {
      current += char;
    }
  }
  row.push(current.trim());
  if (row.some(Boolean)) {
    rows.push(row);
  }
  return rows;
}

function detectDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/).find(Boolean) || "";
  const semicolon = (firstLine.match(/;/g) || []).length;
  const comma = (firstLine.match(/,/g) || []).length;
  const tab = (firstLine.match(/\t/g) || []).length;
  if (tab > semicolon && tab > comma) {
    return "\t";
  }
  return semicolon >= comma ? ";" : ",";
}

function importRowsFromTable(
  table: string[][],
  existing: Vehicle[],
  mappings = defaultColumnMappings(table),
  labels = {
    missingManufacturer: "Hersteller fehlt",
    missingName: "Bezeichnung fehlt",
    missingGauge: "Spur fehlt",
    duplicate: "Bestehendes Fahrzeug gefunden"
  }
) {
  const existingByInventory = new Map(existing.map((vehicle) => [vehicle.inventoryNumber.toLowerCase(), vehicle]));
  return table.slice(1).map((cells, index) => {
    const vehicle: CreateVehicleRequest = { manufacturer: "", name: "", gauge: "" };
    const importedKeys: (keyof CreateVehicleRequest)[] = [];
    mappings.forEach((mapping) => {
      const key = mapping.key;
      if (!key) {
        return;
      }
      const value = cells[mapping.index]?.trim() || "";
      if (!value) {
        return;
      }
      if (booleanImportFields.has(key)) {
        (vehicle as Record<string, unknown>)[key] = parseBoolean(value);
      } else {
        (vehicle as Record<string, unknown>)[key] = value;
      }
      importedKeys.push(key);
    });

    const issues: string[] = [];
    const duplicate = vehicle.inventoryNumber ? existingByInventory.get(vehicle.inventoryNumber.toLowerCase()) : undefined;
    if (!duplicate) {
      if (!vehicle.manufacturer) issues.push(labels.missingManufacturer);
      if (!vehicle.name) issues.push(labels.missingName);
      if (!vehicle.gauge) issues.push(labels.missingGauge);
    }
    if (duplicate) {
      issues.push(labels.duplicate);
    }

    return {
      id: `row-${index + 1}`,
      selected: !duplicate && issues.length === 0,
      mode: duplicate ? "update" as const : "create" as const,
      status: duplicate ? "warning" as const : issues.length === 0 ? "ok" as const : "error" as const,
      issues,
      importedKeys: Array.from(new Set(importedKeys)),
      duplicateVehicleId: duplicate?.id,
      vehicle
    };
  });
}

function vehicleToRequest(vehicle: Vehicle): CreateVehicleRequest {
  return {
    inventoryNumber: vehicle.inventoryNumber,
    manufacturer: vehicle.manufacturer,
    articleNumber: vehicle.articleNumber,
    articleSourceUrl: vehicle.articleSourceUrl,
    name: vehicle.name,
    gauge: vehicle.gauge,
    epoch: vehicle.epoch,
    railwayCompany: vehicle.railwayCompany,
    category: vehicle.category,
    gattung: vehicle.gattung,
    description: vehicle.description,
    series: vehicle.series,
    vehicleNumber: vehicle.vehicleNumber,
    digital: vehicle.digital,
    digitalDecoderNumber: vehicle.digitalDecoderNumber,
    dtDecoder: vehicle.dtDecoder,
    dtDecoderNumber: vehicle.dtDecoderNumber,
    exhibitionReady: vehicle.exhibitionReady,
    abcBrakes: vehicle.abcBrakes,
    ean: vehicle.ean,
    productionPeriod: vehicle.productionPeriod,
    listPrice: vehicle.listPrice,
    lengthMm: vehicle.lengthMm,
    weightG: vehicle.weightG,
    color: vehicle.color,
    lettering: vehicle.lettering,
    load: vehicle.load,
    interior: vehicle.interior,
    axles: vehicle.axles,
    axleCount: vehicle.axleCount,
    tractionTireCount: vehicle.tractionTireCount,
    wheelset: vehicle.wheelset,
    couplingSame: vehicle.couplingSame,
    couplingFront: vehicle.couplingFront,
    couplingRear: vehicle.couplingRear,
    powerPickup: vehicle.powerPickup,
    adapter: vehicle.adapter,
    driveEnabled: vehicle.driveEnabled,
    driveDescription: vehicle.driveDescription,
    headlightsEnabled: vehicle.headlightsEnabled,
    headlightsDescription: vehicle.headlightsDescription,
    lightingEnabled: vehicle.lightingEnabled,
    lightingDescription: vehicle.lightingDescription,
    soundGeneratorEnabled: vehicle.soundGeneratorEnabled,
    soundGeneratorDescription: vehicle.soundGeneratorDescription,
    smokeGeneratorEnabled: vehicle.smokeGeneratorEnabled,
    smokeGeneratorDescription: vehicle.smokeGeneratorDescription,
    additionalInfo: vehicle.additionalInfo,
    qrCodeEnabled: vehicle.qrCodeEnabled,
    images: vehicle.images?.map((image) => ({
      id: image.id,
      url: image.url,
      title: image.title,
      sourceUrl: image.sourceUrl,
      maintenanceId: image.maintenanceId,
      isPrimary: image.isPrimary,
      sortOrder: image.sortOrder
    }))
  };
}

function mergeImportedVehicle(existing: Vehicle, incoming: CreateVehicleRequest, importedKeys: (keyof CreateVehicleRequest)[]) {
  const merged = vehicleToRequest(existing);
  importedKeys.forEach((key) => {
    const value = incoming[key];
    if (typeof value === "boolean" || (typeof value === "string" && value.trim() !== "")) {
      (merged as Record<string, unknown>)[key] = value;
    }
  });
  return merged;
}

function displayImportValue(value: unknown, yes = "ja", no = "nein") {
  if (typeof value === "boolean") {
    return value ? yes : no;
  }
  if (typeof value === "string") {
    return value.trim() || "-";
  }
  return "-";
}

function valuesEqual(current: unknown, incoming: unknown) {
  if (typeof current === "boolean" || typeof incoming === "boolean") {
    return Boolean(current) === Boolean(incoming);
  }
  return String(current ?? "").trim() === String(incoming ?? "").trim();
}

function getImportChanges(
  row: ImportRow,
  existing: Vehicle | undefined,
  fieldLabel: (key: VehicleImportField) => string,
  yes: string,
  no: string
): ImportChange[] {
  if (!existing) {
    return [];
  }
  return row.importedKeys
    .filter((key) => key !== "images")
    .map((key) => {
      const current = existing[key as keyof Vehicle];
      const incoming = row.vehicle[key];
      const currentText = displayImportValue(current, yes, no);
      const incomingText = displayImportValue(incoming, yes, no);
      return {
        key,
        label: fieldLabel(key),
        current: currentText,
        incoming: incomingText,
        status: valuesEqual(current, incoming) ? "same" : currentText === "-" ? "fill" : "overwrite"
      };
    });
}

function vehiclesToCSV(vehicles: Vehicle[], fieldLabel: (key: VehicleImportField) => string, yes: string, no: string) {
  const headers = vehicleImportFields.map((field) => fieldLabel(field.key));
  const rows = vehicles.map((vehicle) => {
    const request = vehicleToRequest(vehicle);
    return vehicleImportFields.map((field) => displayImportValue(request[field.key], yes, no).replace(/^-$/, ""));
  });
  return [headers, ...rows].map((row) => row.map(csvEscape).join(";")).join("\n");
}

function downloadText(fileName: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function htmlEscape(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function printInventory(
  vehicles: Vehicle[],
  fieldLabel: (key: VehicleImportField) => string,
  language: string,
  t: (key: string, values?: Record<string, string | number>) => string
) {
  const printWindow = window.open("", "railkeeper-bestand-druck");
  if (!printWindow) {
    window.alert(t("importExport.print.blocked"));
    return;
  }

  const digital = vehicles.filter((vehicle) => vehicle.digital).length;
  const analog = vehicles.length - digital;
  const rows = vehicles.map((vehicle) => `
    <tr>
      <td>${htmlEscape(vehicle.inventoryNumber)}</td>
      <td>${htmlEscape(vehicle.manufacturer)}</td>
      <td>${htmlEscape(vehicle.articleNumber)}</td>
      <td>${htmlEscape(vehicle.name)}</td>
      <td>${htmlEscape(vehicle.gauge)}</td>
      <td>${htmlEscape(vehicle.epoch)}</td>
      <td>${htmlEscape(vehicle.category)}</td>
      <td>${vehicle.digital ? "digital" : "analog"}</td>
      <td>${htmlEscape(vehicle.listPrice)}</td>
    </tr>
  `).join("");

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
    <html lang="${htmlEscape(language)}">
      <head>
        <meta charset="utf-8" />
        <title>${htmlEscape(t("importExport.print.title"))}</title>
        <style>
          @page { size: A4 landscape; margin: 14mm; }
          * { box-sizing: border-box; }
          body { margin: 0; color: #0b1e26; font-family: "Segoe UI", Arial, sans-serif; font-size: 11px; }
          header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 2px solid #1c621b; }
          h1 { margin: 0 0 4px; font-size: 24px; line-height: 1.1; }
          p { margin: 0; color: #4f6869; }
          .stats { display: grid; grid-template-columns: repeat(3, auto); gap: 8px; text-align: right; }
          .stats span { display: block; padding: 6px 8px; border: 1px solid #d5dfdc; border-radius: 6px; background: #f5f8f6; font-weight: 700; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 6px 7px; border-bottom: 1px solid #d5dfdc; text-align: left; vertical-align: top; }
          th { background: #edf2f1; color: #4f6869; font-size: 10px; text-transform: uppercase; }
          tr:nth-child(even) td { background: #f8faf9; }
          footer { margin-top: 12px; color: #4f6869; font-size: 10px; }
        </style>
      </head>
      <body>
        <header>
          <div>
            <h1>${htmlEscape(t("importExport.print.title"))}</h1>
            <p>${htmlEscape(t("importExport.print.footer", { date: new Date().toLocaleString(language === "en" ? "en-US" : "de-DE") }))}</p>
          </div>
          <div class="stats">
            <span>${htmlEscape(t("importExport.print.summary", { total: vehicles.length, digital, analog }))}</span>
            <span>${digital} digital</span>
            <span>${analog} analog</span>
          </div>
        </header>
        <table>
          <thead>
            <tr>
              <th>${htmlEscape(t("importExport.review.inventory"))}</th>
              <th>${htmlEscape(fieldLabel("manufacturer"))}</th>
              <th>${htmlEscape(t("importExport.review.article"))}</th>
              <th>${htmlEscape(fieldLabel("name"))}</th>
              <th>${htmlEscape(fieldLabel("gauge"))}</th>
              <th>${htmlEscape(fieldLabel("epoch"))}</th>
              <th>${htmlEscape(fieldLabel("category"))}</th>
              <th>${htmlEscape(fieldLabel("digital"))}</th>
              <th>${htmlEscape(fieldLabel("listPrice"))}</th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="9">${htmlEscape(t("importExport.review.empty"))}</td></tr>`}</tbody>
        </table>
        <footer>${htmlEscape(t("importExport.export.print"))}</footer>
        <script>
          window.addEventListener("load", () => {
            window.focus();
            window.print();
          });
        </script>
      </body>
    </html>`);
  printWindow.document.close();
}

export function ImportExportView() {
  const { language, t } = useI18n();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [importTable, setImportTable] = useState<ImportTablePreview | null>(null);
  const [masterDataFile, setMasterDataFile] = useState<File | null>(null);
  const [masterDataSaving, setMasterDataSaving] = useState(false);
  const [masterDataMessage, setMasterDataMessage] = useState("");
  const [ecosHost, setEcosHost] = useState(window.localStorage.getItem("railkeeper.ecos.host") || "");
  const [ecosPort, setEcosPort] = useState(window.localStorage.getItem("railkeeper.ecos.port") || "15471");
  const [ecosBusy, setEcosBusy] = useState(false);
  const [ecosResult, setEcosResult] = useState<ECoSConnectionResult | null>(null);
  const [ecosPreview, setEcosPreview] = useState<ECoSLocomotivePreview | null>(null);
  const [ecosMessage, setEcosMessage] = useState("");
  const fieldLabel = (key: VehicleImportField) => t(`vehicle.field.${key}`);
  const issueLabels = {
    missingManufacturer: t("importExport.issue.missingManufacturer"),
    missingName: t("importExport.issue.missingName"),
    missingGauge: t("importExport.issue.missingGauge"),
    duplicate: t("importExport.issue.duplicate")
  };

  useEffect(() => {
    api.vehicles().then(setVehicles).catch((error: Error) => setMessage(error.message)).finally(() => setLoading(false));
  }, []);

  const importSummary = useMemo(() => ({
    total: rows.length,
    selected: rows.filter((row) => row.selected && row.status !== "saved").length,
    errors: rows.filter((row) => row.status === "error").length,
    updates: rows.filter((row) => row.mode === "update" && row.status !== "saved").length,
    saved: rows.filter((row) => row.status === "saved").length
  }), [rows]);

  const mappingSummary = useMemo(() => {
    if (!importTable) {
      return { mapped: 0, unmapped: 0 };
    }
    const visibleMappings = importTable.mappings.filter((mapping) => mapping.header.trim());
    return {
      mapped: visibleMappings.filter((mapping) => mapping.key).length,
      unmapped: visibleMappings.filter((mapping) => !mapping.key).length
    };
  }, [importTable]);

  const loadImportTable = (table: string[][], fileName: string) => {
    if (table.length === 0) {
      setImportTable(null);
      setRows([]);
      setMessage(t("importExport.error.emptyFile"));
      return;
    }
    const mappings = defaultColumnMappings(table);
    const importedRows = importRowsFromTable(table, vehicles, mappings, issueLabels);
    const unmapped = mappings.filter((mapping) => !mapping.key && mapping.header.trim()).length;
    setImportTable({ fileName, table, mappings });
    setRows(importedRows);
    setMessage(unmapped > 0 ? t("importExport.message.unmapped", { count: unmapped }) : "");
  };

  const setColumnMapping = (columnIndex: number, key: VehicleImportField | "") => {
    if (!importTable) {
      return;
    }
    const mappings: ColumnMapping[] = importTable.mappings.map((mapping) => {
      if (mapping.index === columnIndex) {
        return { ...mapping, key };
      }
      return key && mapping.key === key ? { ...mapping, key: "" } : mapping;
    });
    setImportTable({ ...importTable, mappings });
    setRows(importRowsFromTable(importTable.table, vehicles, mappings, issueLabels));
  };

  const updateRow = (rowID: string, patch: Partial<ImportRow["vehicle"]>) => {
    setRows((current) => current.map((row) => {
      if (row.id !== rowID) {
        return row;
      }
      const vehicle = { ...row.vehicle, ...patch };
      const issues: string[] = [];
      const duplicate = vehicle.inventoryNumber ? vehicles.find((existing) => existing.inventoryNumber.toLowerCase() === vehicle.inventoryNumber?.toLowerCase()) : undefined;
      const importedKeys = Array.from(new Set([...row.importedKeys, ...Object.keys(patch) as (keyof CreateVehicleRequest)[]]));
      if (duplicate) {
        issues.push(t("importExport.issue.duplicate"));
        return {
          ...row,
          vehicle,
          importedKeys,
          duplicateVehicleId: duplicate.id,
          mode: "update",
          issues,
          status: "warning",
          selected: row.selected
        };
      }
      if (!vehicle.manufacturer) issues.push(t("importExport.issue.missingManufacturer"));
      if (!vehicle.name) issues.push(t("importExport.issue.missingName"));
      if (!vehicle.gauge) issues.push(t("importExport.issue.missingGauge"));
      return {
        ...row,
        vehicle,
        importedKeys,
        duplicateVehicleId: undefined,
        mode: "create",
        issues,
        status: issues.length ? "error" : "ok",
        selected: issues.length ? false : row.selected
      };
    }));
  };

  const setRowSelected = (rowID: string, selected: boolean) => {
    setRows((current) => current.map((item) => item.id === rowID ? { ...item, selected } : item));
  };

  const setRowMode = (rowID: string, mode: ImportRow["mode"]) => {
    setRows((current) => current.map((row) => {
      if (row.id !== rowID) return row;
      if (mode === "create" && row.duplicateVehicleId) {
        return { ...row, mode, selected: false, status: "error", issues: [t("importExport.issue.inventoryExists")] };
      }
      if (mode === "update" && row.duplicateVehicleId) {
        return { ...row, mode, status: "warning", issues: [t("importExport.issue.duplicate")] };
      }
      return { ...row, mode };
    }));
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setMessage("");
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    if (extension === "xlsx" || extension === "xls" || extension === "ods") {
      setRows([]);
      setImportTable(null);
      setPreviewLoading(true);
      try {
        const preview = await api.previewVehicleImport(file);
        if (preview.rows.length) {
          loadImportTable(preview.rows, file.name);
        } else {
          setRows([]);
          setImportTable(null);
          setMessage(t("importExport.error.emptyTable"));
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t("importExport.error.tableRead"));
      } finally {
        setPreviewLoading(false);
      }
      return;
    }

    const text = await file.text();
    if (extension === "json") {
      const parsed = JSON.parse(text) as Vehicle[] | { vehicles?: Vehicle[] };
      const source = Array.isArray(parsed) ? parsed : parsed.vehicles || [];
      const table = [
        [
          fieldLabel("inventoryNumber"),
          fieldLabel("manufacturer"),
          fieldLabel("articleNumber"),
          fieldLabel("name"),
          fieldLabel("gauge"),
          fieldLabel("epoch"),
          fieldLabel("railwayCompany"),
          fieldLabel("category"),
          fieldLabel("gattung"),
          fieldLabel("digital"),
          fieldLabel("digitalDecoderNumber"),
          fieldLabel("listPrice")
        ],
        ...source.map((vehicle) => [vehicle.inventoryNumber, vehicle.manufacturer, vehicle.articleNumber || "", vehicle.name, vehicle.gauge, vehicle.epoch || "", vehicle.railwayCompany || "", vehicle.category || "", vehicle.gattung || "", vehicle.digital ? t("common.yes") : t("common.no"), vehicle.digitalDecoderNumber || "", vehicle.listPrice || ""])
      ];
      loadImportTable(table, file.name);
      return;
    }

    const delimiter = extension === "tsv" ? "\t" : detectDelimiter(text);
    loadImportTable(parseDelimited(text, delimiter), file.name);
  };

  const saveSelected = async () => {
    setSaving(true);
    setMessage("");
    for (const row of rows) {
      if (!row.selected || row.status === "saved" || row.status === "error") {
        continue;
      }
      try {
        const existing = row.duplicateVehicleId ? vehicles.find((vehicle) => vehicle.id === row.duplicateVehicleId) : undefined;
        const saved = row.mode === "update" && existing
          ? await api.updateVehicle(existing.id, mergeImportedVehicle(existing, row.vehicle, row.importedKeys))
          : await api.createVehicle(row.vehicle);
        setVehicles((current) => {
          if (row.mode === "update") {
            return current.map((vehicle) => vehicle.id === saved.id ? saved : vehicle);
          }
          return [...current, saved];
        });
        setRows((current) => current.map((item) => item.id === row.id ? { ...item, selected: false, status: "saved", issues: [] } : item));
      } catch (error) {
        const message = error instanceof Error ? error.message : t("importExport.error.importFailed");
        setRows((current) => current.map((item) => item.id === row.id ? { ...item, status: "error", issues: [message] } : item));
      }
    }
    setSaving(false);
  };

  const ecosInput = () => ({
    host: ecosHost.trim(),
    port: Number(ecosPort) || 15471
  });

  const rememberECoSSettings = () => {
    window.localStorage.setItem("railkeeper.ecos.host", ecosHost.trim());
    window.localStorage.setItem("railkeeper.ecos.port", ecosPort.trim() || "15471");
  };

  const testECoSConnection = async () => {
    setEcosBusy(true);
    setEcosMessage("");
    setEcosResult(null);
    setEcosPreview(null);
    try {
      rememberECoSSettings();
      const result = await api.testECoSConnection(ecosInput());
      setEcosResult(result);
      setEcosMessage(result.message);
    } catch (error) {
      setEcosMessage(error instanceof Error ? error.message : t("importExport.ecos.error"));
    } finally {
      setEcosBusy(false);
    }
  };

  const previewECoSLocomotives = async () => {
    setEcosBusy(true);
    setEcosMessage("");
    setEcosPreview(null);
    try {
      rememberECoSSettings();
      const preview = await api.previewECoSLocomotives(ecosInput());
      setEcosPreview(preview);
      setEcosMessage(preview.message);
    } catch (error) {
      setEcosMessage(error instanceof Error ? error.message : t("importExport.ecos.error"));
    } finally {
      setEcosBusy(false);
    }
  };

  const importMasterData = async () => {
    if (!masterDataFile) {
      setMasterDataMessage(t("importExport.error.masterMissing"));
      return;
    }
    if (!window.confirm(t("importExport.master.confirm"))) {
      return;
    }
    setMasterDataSaving(true);
    setMasterDataMessage("");
    try {
      const result = await api.importMasterData(masterDataFile);
      setMasterDataMessage(t("importExport.master.done", { entries: result.importedEntries, relations: result.importedRelations }));
    } catch (error) {
      setMasterDataMessage(error instanceof Error ? error.message : t("importExport.error.masterFailed"));
    } finally {
      setMasterDataSaving(false);
    }
  };

  return (
    <>
      <section className="page-head">
        <p className="eyebrow">{t("importExport.eyebrow")}</p>
        <h1>{t("importExport.title")}</h1>
        <p>{t("importExport.subtitle")}</p>
      </section>

      {message && <p className="form-message">{message}</p>}

      <section className="import-export-grid">
        <article className="panel transfer-panel">
          <div className="panel-head">
            <div>
              <h2>{t("importExport.import.title")}</h2>
              <p>{t("importExport.import.subtitle")}</p>
            </div>
            <FileInput size={20} aria-hidden="true" />
          </div>
          <label className="file-drop compact-drop">
            <Upload size={18} aria-hidden="true" />
            {t("importExport.file.choose")}
            <input type="file" accept=".csv,.tsv,.json,.xlsx,.xls,.ods" onChange={handleFile} />
          </label>
          <div className="import-summary">
            <span>{t("importExport.summary.rows", { count: importSummary.total })}</span>
            <span>{previewLoading ? t("importExport.summary.reading") : t("importExport.summary.ready", { count: importSummary.selected })}</span>
            <span>{t("importExport.summary.updates", { count: importSummary.updates })}</span>
            <span className={importSummary.errors ? "danger" : ""}>{t("importExport.summary.notes", { count: importSummary.errors })}</span>
            <span>{t("importExport.summary.saved", { count: importSummary.saved })}</span>
            {importTable && <span>{t("importExport.summary.mapped", { count: mappingSummary.mapped })}</span>}
            {importTable && <span className={mappingSummary.unmapped ? "danger" : ""}>{t("importExport.summary.open", { count: mappingSummary.unmapped })}</span>}
          </div>
        </article>

        <article className="panel transfer-panel">
          <div className="panel-head">
            <div>
              <h2>{t("importExport.export.title")}</h2>
              <p>{t("importExport.export.subtitle")}</p>
            </div>
            <Download size={20} aria-hidden="true" />
          </div>
          <div className="export-actions">
            <button type="button" className="secondary-button" disabled={loading || vehicles.length === 0} onClick={() => downloadText("railkeeper-bestand.csv", `\uFEFF${vehiclesToCSV(vehicles, fieldLabel, t("common.yes"), t("common.no"))}`, "text/csv;charset=utf-8")}>
              <Download size={15} aria-hidden="true" />
              {t("importExport.export.csv")}
            </button>
            <button type="button" className="secondary-button" disabled={loading || vehicles.length === 0} onClick={() => downloadText("railkeeper-bestand.json", JSON.stringify({ format: "railkeeper-vehicles", version: 1, vehicles }, null, 2), "application/json;charset=utf-8")}>
              <Download size={15} aria-hidden="true" />
              {t("importExport.export.json")}
            </button>
            <button type="button" className="secondary-button" disabled={loading || vehicles.length === 0} onClick={() => printInventory(vehicles, fieldLabel, language, t)}>
              <Printer size={15} aria-hidden="true" />
              {t("importExport.export.print")}
            </button>
          </div>
        </article>
      </section>

      <section className="panel transfer-panel ecos-panel">
        <div className="panel-head">
          <div>
            <h2>{t("importExport.ecos.title")}</h2>
            <p>{t("importExport.ecos.subtitle")}</p>
          </div>
          <Database size={20} aria-hidden="true" />
        </div>
        <div className="ecos-connection-grid">
          <label>
            {t("importExport.ecos.host")}
            <input value={ecosHost} onChange={(event) => setEcosHost(event.target.value)} placeholder={t("importExport.ecos.hostPlaceholder")} />
          </label>
          <label>
            {t("importExport.ecos.port")}
            <input value={ecosPort} onChange={(event) => setEcosPort(event.target.value)} inputMode="numeric" placeholder="15471" />
          </label>
          <div className="ecos-actions">
            <button type="button" className="secondary-button" onClick={testECoSConnection} disabled={ecosBusy || !ecosHost.trim()}>
              <Check size={15} aria-hidden="true" />
              {t("importExport.ecos.test")}
            </button>
            <button type="button" className="primary-button" onClick={previewECoSLocomotives} disabled={ecosBusy || !ecosHost.trim()}>
              <Download size={15} aria-hidden="true" />
              {t("importExport.ecos.readLocos")}
            </button>
          </div>
        </div>
        <div className="ecos-status-strip">
          <span className={ecosResult?.connected ? "status-ok" : ecosResult ? "status-error" : ""}>
            {ecosResult ? (ecosResult.connected ? t("importExport.ecos.connected") : t("importExport.ecos.notConnected")) : t("importExport.ecos.idle")}
          </span>
          {ecosResult?.status && <span>{t("importExport.ecos.status", { status: ecosResult.status })}</span>}
          {ecosResult?.protocolVersion && <span>{t("importExport.ecos.protocol", { version: ecosResult.protocolVersion })}</span>}
          {ecosResult?.applicationVersion && <span>{t("importExport.ecos.application", { version: ecosResult.applicationVersion })}</span>}
          {ecosPreview && <span>{t("importExport.ecos.locoCount", { count: ecosPreview.locomotives.length })}</span>}
        </div>
        {ecosMessage && <p className="form-message">{ecosMessage}</p>}
        <p className="source-note backup-note">{t("importExport.ecos.note")}</p>
        {ecosPreview && (
          <div className="table-wrap ecos-loco-preview">
            <table>
              <thead>
                <tr>
                  <th>{t("importExport.ecos.objectId")}</th>
                  <th>{t("importExport.ecos.name")}</th>
                  <th>{t("importExport.ecos.address")}</th>
                  <th>{t("importExport.ecos.protocolColumn")}</th>
                  <th>{t("importExport.ecos.match")}</th>
                </tr>
              </thead>
              <tbody>
                {ecosPreview.locomotives.length === 0 ? (
                  <tr><td colSpan={5}>{t("importExport.ecos.empty")}</td></tr>
                ) : ecosPreview.locomotives.map((locomotive) => {
                  const match = vehicles.find((vehicle) => vehicle.name.toLowerCase() === (locomotive.name || "").toLowerCase() || vehicle.digitalDecoderNumber === String(locomotive.address || ""));
                  return (
                    <tr key={locomotive.objectId}>
                      <td>{locomotive.objectId}</td>
                      <td>{locomotive.name || "-"}</td>
                      <td>{locomotive.address || "-"}</td>
                      <td>{locomotive.protocol || "-"}</td>
                      <td>{match ? `${match.inventoryNumber} · ${match.name}` : t("importExport.ecos.noMatch")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {importTable && (
        <section className="panel column-mapping-panel">
          <div className="panel-head">
            <div>
              <h2>{t("importExport.mapping.title")}</h2>
              <p>{t("importExport.mapping.subtitle", { file: importTable.fileName })}</p>
            </div>
            <Database size={20} aria-hidden="true" />
          </div>
          <div className="column-mapping-grid">
            {importTable.mappings.map((mapping) => (
              <label key={mapping.index} className={mapping.key ? "" : "unmapped"}>
                <span>
                  <strong title={mapping.header}>{mapping.header || t("importExport.mapping.column", { number: mapping.index + 1 })}</strong>
                  <small>{mapping.key ? t("importExport.mapping.mapped") : t("importExport.mapping.unmapped")}</small>
                </span>
                <select value={mapping.key} onChange={(event) => setColumnMapping(mapping.index, event.target.value as VehicleImportField | "")}>
                  <option value="">{t("importExport.mapping.ignore")}</option>
                  {vehicleImportFields.map((field) => (
                    <option key={field.key} value={field.key}>{fieldLabel(field.key)}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <p className="source-note backup-note">{t("importExport.mapping.note")}</p>
        </section>
      )}

      <section className="panel transfer-panel master-transfer-panel">
        <div className="panel-head">
          <div>
            <h2>{t("importExport.master.title")}</h2>
            <p>{t("importExport.master.subtitle")}</p>
          </div>
          <Database size={20} aria-hidden="true" />
        </div>
        <div className="master-transfer-actions">
          <a className="secondary-button" href={api.masterDataExportUrl()}>
            <Download size={15} aria-hidden="true" />
            {t("importExport.master.download")}
          </a>
          <label className="file-drop inline-file-drop">
            <Upload size={16} aria-hidden="true" />
            {masterDataFile ? masterDataFile.name : t("importExport.master.choose")}
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                setMasterDataFile(event.target.files?.[0] || null);
                setMasterDataMessage("");
              }}
            />
          </label>
          <button type="button" className="primary-button" onClick={importMasterData} disabled={masterDataSaving || !masterDataFile}>
            {masterDataSaving ? (
              t("importExport.master.importing")
            ) : (
              <>
                <Upload size={15} aria-hidden="true" />
                {t("importExport.master.import")}
              </>
            )}
          </button>
        </div>
        <p className="source-note backup-note">{t("importExport.master.note")}</p>
        {masterDataMessage && <p className="form-message">{masterDataMessage}</p>}
      </section>

      <section className="panel import-review-panel">
        <div className="panel-head">
          <div>
            <h2>{t("importExport.review.title")}</h2>
            <p>{t("importExport.review.subtitle")}</p>
          </div>
          <button type="button" className="primary-button" disabled={saving || importSummary.selected === 0} onClick={saveSelected}>
            <Save size={15} aria-hidden="true" />
            {t("importExport.review.saveSelection")}
          </button>
        </div>

        {rows.length === 0 ? (
          <p className="empty-state">{t("importExport.review.empty")}</p>
        ) : (
          <div className="table-wrap import-table">
            <table>
              <thead>
                <tr>
                  <th>{t("importExport.review.apply")}</th>
                  <th>{t("importExport.review.action")}</th>
                  <th>{t("importExport.review.inventory")}</th>
                  <th>{fieldLabel("manufacturer")}</th>
                  <th>{t("importExport.review.article")}</th>
                  <th>{fieldLabel("name")}</th>
                  <th>{fieldLabel("gauge")}</th>
                  <th>{t("exhibition.status")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const existing = row.duplicateVehicleId ? vehicles.find((vehicle) => vehicle.id === row.duplicateVehicleId) : undefined;
                  const changes = getImportChanges(row, existing, fieldLabel, t("common.yes"), t("common.no"));
                  return (
                    <Fragment key={row.id}>
                      <tr className={row.status === "error" ? "import-row-error" : row.status === "warning" ? "import-row-warning" : row.status === "saved" ? "import-row-saved" : ""}>
                        <td><input type="checkbox" checked={row.selected} disabled={row.status === "saved" || row.status === "error"} onChange={(event) => setRowSelected(row.id, event.target.checked)} /></td>
                        <td>
                          <select value={row.mode} disabled={row.status === "saved"} onChange={(event) => setRowMode(row.id, event.target.value as ImportRow["mode"])}>
                            <option value="create">{t("importExport.review.create")}</option>
                            <option value="update" disabled={!row.duplicateVehicleId}>{t("importExport.review.update")}</option>
                          </select>
                        </td>
                        <td><input value={row.vehicle.inventoryNumber || ""} onChange={(event) => updateRow(row.id, { inventoryNumber: event.target.value })} /></td>
                        <td><input value={row.vehicle.manufacturer} onChange={(event) => updateRow(row.id, { manufacturer: event.target.value })} /></td>
                        <td><input value={row.vehicle.articleNumber || ""} onChange={(event) => updateRow(row.id, { articleNumber: event.target.value })} /></td>
                        <td><input value={row.vehicle.name} onChange={(event) => updateRow(row.id, { name: event.target.value })} /></td>
                        <td><input value={row.vehicle.gauge} onChange={(event) => updateRow(row.id, { gauge: event.target.value })} /></td>
                        <td>
                          <span className={`import-status ${row.status}`}>
                            {row.status === "saved" ? <Check size={14} /> : row.status === "error" || row.status === "warning" ? <AlertTriangle size={14} /> : <Check size={14} />}
                            {row.status === "saved" ? t("common.saved") : row.issues[0] || t("common.ready")}
                          </span>
                        </td>
                      </tr>
                      {existing && row.mode === "update" && (
                        <tr className="import-change-row">
                          <td colSpan={8}>
                            <div className="import-change-panel">
                              <div>
                                <strong>{t("importExport.review.updatePreview")}</strong>
                                <span>{t("importExport.review.overwrites", { count: changes.filter((change) => change.status === "overwrite").length })}, {t("importExport.review.fills", { count: changes.filter((change) => change.status === "fill").length })}</span>
                              </div>
                              {changes.length === 0 ? (
                                <p>{t("importExport.review.noValues")}</p>
                              ) : (
                                <table>
                                  <thead>
                                    <tr>
                                      <th>{t("importExport.review.field")}</th>
                                      <th>{t("importExport.review.current")}</th>
                                      <th>{t("importExport.review.import")}</th>
                                      <th>{t("exhibition.status")}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {changes.map((change) => (
                                      <tr key={change.key} className={`change-${change.status}`}>
                                        <td>{change.label}</td>
                                        <td>{change.current}</td>
                                        <td>{change.incoming}</td>
                                        <td>{t(`importExport.review.status.${change.status}`)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
