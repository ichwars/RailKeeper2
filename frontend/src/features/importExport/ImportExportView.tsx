import { ChangeEvent, Fragment, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Database, Download, FileInput, Save, Upload } from "lucide-react";
import { api, CreateVehicleRequest, Vehicle } from "../../shared/api";

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

const importFieldLabels = new Map(vehicleImportFields.map((field) => [field.key, field.label]));

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

function importRowsFromTable(table: string[][], existing: Vehicle[], mappings = defaultColumnMappings(table)) {
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
      if (!vehicle.manufacturer) issues.push("Hersteller fehlt");
      if (!vehicle.name) issues.push("Bezeichnung fehlt");
      if (!vehicle.gauge) issues.push("Spur fehlt");
    }
    if (duplicate) {
      issues.push("Bestehendes Fahrzeug gefunden");
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

function displayImportValue(value: unknown) {
  if (typeof value === "boolean") {
    return value ? "ja" : "nein";
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

function getImportChanges(row: ImportRow, existing?: Vehicle): ImportChange[] {
  if (!existing) {
    return [];
  }
  return row.importedKeys
    .filter((key) => key !== "images")
    .map((key) => {
      const current = existing[key as keyof Vehicle];
      const incoming = row.vehicle[key];
      const currentText = displayImportValue(current);
      const incomingText = displayImportValue(incoming);
      return {
        key,
        label: importFieldLabels.get(key) || String(key),
        current: currentText,
        incoming: incomingText,
        status: valuesEqual(current, incoming) ? "same" : currentText === "-" ? "fill" : "overwrite"
      };
    });
}

function vehiclesToCSV(vehicles: Vehicle[]) {
  const headers = ["Inventarnummer", "Hersteller", "Artikel-Nr.", "Bezeichnung", "Spur", "Epoche", "Bahngesellschaft", "Kategorie", "Gattung", "Digital", "Decoder-Nr.", "Listenpreis"];
  const rows = vehicles.map((vehicle) => [
    vehicle.inventoryNumber,
    vehicle.manufacturer,
    vehicle.articleNumber,
    vehicle.name,
    vehicle.gauge,
    vehicle.epoch,
    vehicle.railwayCompany,
    vehicle.category,
    vehicle.gattung,
    vehicle.digital ? "ja" : "nein",
    vehicle.digitalDecoderNumber,
    vehicle.listPrice
  ]);
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

export function ImportExportView() {
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
      setMessage("Die Datei enthält keine auswertbaren Zeilen.");
      return;
    }
    const mappings = defaultColumnMappings(table);
    const importedRows = importRowsFromTable(table, vehicles, mappings);
    const unmapped = mappings.filter((mapping) => !mapping.key && mapping.header.trim()).length;
    setImportTable({ fileName, table, mappings });
    setRows(importedRows);
    setMessage(unmapped > 0 ? `${unmapped} Spalten nicht automatisch zugeordnet. Bitte bei Bedarf in der Spaltenzuordnung auswählen.` : "");
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
    setRows(importRowsFromTable(importTable.table, vehicles, mappings));
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
        issues.push("Bestehendes Fahrzeug gefunden");
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
      if (!vehicle.manufacturer) issues.push("Hersteller fehlt");
      if (!vehicle.name) issues.push("Bezeichnung fehlt");
      if (!vehicle.gauge) issues.push("Spur fehlt");
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
        return { ...row, mode, selected: false, status: "error", issues: ["Inventarnummer existiert bereits"] };
      }
      if (mode === "update" && row.duplicateVehicleId) {
        return { ...row, mode, status: "warning", issues: ["Bestehendes Fahrzeug gefunden"] };
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
    if (extension === "xlsx" || extension === "ods") {
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
          setMessage("Die Tabellendatei enthält keine auswertbaren Zeilen.");
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Tabellendatei konnte nicht ausgewertet werden.");
      } finally {
        setPreviewLoading(false);
      }
      return;
    }
    if (extension === "xls") {
      setRows([]);
      setImportTable(null);
      setMessage("XLS ist als altes Excel-Binärformat vorgemerkt. Aktuell bitte als XLSX, ODS, CSV, TSV oder JSON speichern.");
      return;
    }

    const text = await file.text();
    if (extension === "json") {
      const parsed = JSON.parse(text) as Vehicle[] | { vehicles?: Vehicle[] };
      const source = Array.isArray(parsed) ? parsed : parsed.vehicles || [];
      const table = [
        ["Inventarnummer", "Hersteller", "Artikel-Nr.", "Bezeichnung", "Spur", "Epoche", "Bahngesellschaft", "Kategorie", "Gattung", "Digital", "Decoder-Nr.", "Listenpreis"],
        ...source.map((vehicle) => [vehicle.inventoryNumber, vehicle.manufacturer, vehicle.articleNumber || "", vehicle.name, vehicle.gauge, vehicle.epoch || "", vehicle.railwayCompany || "", vehicle.category || "", vehicle.gattung || "", vehicle.digital ? "ja" : "nein", vehicle.digitalDecoderNumber || "", vehicle.listPrice || ""])
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
        const message = error instanceof Error ? error.message : "Import fehlgeschlagen";
        setRows((current) => current.map((item) => item.id === row.id ? { ...item, status: "error", issues: [message] } : item));
      }
    }
    setSaving(false);
  };

  const importMasterData = async () => {
    if (!masterDataFile) {
      setMasterDataMessage("Bitte zuerst eine Stammdaten-Datei auswählen.");
      return;
    }
    if (!window.confirm("Stammdaten wirklich importieren? Bestehende Stammdaten und Kategorie/Gattung-Abhängigkeiten werden ersetzt. Bestand und Uploads bleiben unverändert.")) {
      return;
    }
    setMasterDataSaving(true);
    setMasterDataMessage("");
    try {
      const result = await api.importMasterData(masterDataFile);
      setMasterDataMessage(`Stammdaten importiert: ${result.importedEntries} Einträge, ${result.importedRelations} Abhängigkeiten.`);
    } catch (error) {
      setMasterDataMessage(error instanceof Error ? error.message : "Stammdaten-Import fehlgeschlagen.");
    } finally {
      setMasterDataSaving(false);
    }
  };

  return (
    <>
      <section className="page-head">
        <p className="eyebrow">Bestandsdaten</p>
        <h1>Import/Export</h1>
        <p>Bestandslisten auswerten, korrigieren und kontrolliert in die lokale Datenbank übernehmen.</p>
      </section>

      {message && <p className="form-message">{message}</p>}

      <section className="import-export-grid">
        <article className="panel transfer-panel">
          <div className="panel-head">
            <div>
              <h2>Import</h2>
              <p>CSV, TSV, XLSX, ODS und RailKeeper-JSON werden ausgewertet. XLS ist vorgemerkt.</p>
            </div>
            <FileInput size={20} aria-hidden="true" />
          </div>
          <label className="file-drop compact-drop">
            <Upload size={18} aria-hidden="true" />
            Datei auswählen
            <input type="file" accept=".csv,.tsv,.json,.xlsx,.xls,.ods" onChange={handleFile} />
          </label>
          <div className="import-summary">
            <span>{importSummary.total} Zeilen</span>
            <span>{previewLoading ? "liest Datei..." : `${importSummary.selected} bereit`}</span>
            <span>{importSummary.updates} Updates</span>
            <span className={importSummary.errors ? "danger" : ""}>{importSummary.errors} Hinweise</span>
            <span>{importSummary.saved} gespeichert</span>
            {importTable && <span>{mappingSummary.mapped} Spalten erkannt</span>}
            {importTable && <span className={mappingSummary.unmapped ? "danger" : ""}>{mappingSummary.unmapped} offen</span>}
          </div>
        </article>

        <article className="panel transfer-panel">
          <div className="panel-head">
            <div>
              <h2>Export</h2>
              <p>CSV für Tabellenprogramme oder JSON als verlustärmeres RailKeeper-Format.</p>
            </div>
            <Download size={20} aria-hidden="true" />
          </div>
          <div className="export-actions">
            <button type="button" className="secondary-button" disabled={loading || vehicles.length === 0} onClick={() => downloadText("railkeeper-bestand.csv", vehiclesToCSV(vehicles), "text/csv;charset=utf-8")}>
              <Download size={15} aria-hidden="true" />
              CSV exportieren
            </button>
            <button type="button" className="secondary-button" disabled={loading || vehicles.length === 0} onClick={() => downloadText("railkeeper-bestand.json", JSON.stringify({ format: "railkeeper-vehicles", version: 1, vehicles }, null, 2), "application/json;charset=utf-8")}>
              <Download size={15} aria-hidden="true" />
              JSON exportieren
            </button>
          </div>
        </article>
      </section>

      {importTable && (
        <section className="panel column-mapping-panel">
          <div className="panel-head">
            <div>
              <h2>Spaltenzuordnung</h2>
              <p>{importTable.fileName}: nicht erkannte Tabellenköpfe können hier vor dem Speichern manuell zugeordnet werden.</p>
            </div>
            <Database size={20} aria-hidden="true" />
          </div>
          <div className="column-mapping-grid">
            {importTable.mappings.map((mapping) => (
              <label key={mapping.index} className={mapping.key ? "" : "unmapped"}>
                <span>
                  <strong title={mapping.header}>{mapping.header || `Spalte ${mapping.index + 1}`}</strong>
                  <small>{mapping.key ? "zugeordnet" : "nicht erkannt"}</small>
                </span>
                <select value={mapping.key} onChange={(event) => setColumnMapping(mapping.index, event.target.value as VehicleImportField | "")}>
                  <option value="">Ignorieren</option>
                  {vehicleImportFields.map((field) => (
                    <option key={field.key} value={field.key}>{field.label}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <p className="source-note backup-note">Wenn zwei Spalten demselben Zielfeld zugeordnet werden, bleibt die zuletzt gewählte Zuordnung aktiv. Die Importprüfung wird sofort neu berechnet.</p>
        </section>
      )}

      <section className="panel transfer-panel master-transfer-panel">
        <div className="panel-head">
          <div>
            <h2>Stammdaten</h2>
            <p>Hersteller, Spurweiten, Epochen, Kategorien, Gattungen, Bahngesellschaften, Symbole und Abhängigkeiten als RailKeeper-JSON sichern oder wiederherstellen.</p>
          </div>
          <Database size={20} aria-hidden="true" />
        </div>
        <div className="master-transfer-actions">
          <a className="secondary-button" href={api.masterDataExportUrl()}>
            <Download size={15} aria-hidden="true" />
            Stammdaten herunterladen
          </a>
          <label className="file-drop inline-file-drop">
            <Upload size={16} aria-hidden="true" />
            {masterDataFile ? masterDataFile.name : "Stammdaten-Datei auswählen"}
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
              "Importiert..."
            ) : (
              <>
                <Upload size={15} aria-hidden="true" />
                Stammdaten einspielen
              </>
            )}
          </button>
        </div>
        <p className="source-note backup-note">Der Stammdaten-Import ersetzt nur Stammdaten und deren Abhängigkeiten. Bestand, Wartung, Bilder, Dateien und Backups bleiben unberührt.</p>
        {masterDataMessage && <p className="form-message">{masterDataMessage}</p>}
      </section>

      <section className="panel import-review-panel">
        <div className="panel-head">
          <div>
            <h2>Importprüfung</h2>
            <p>Jede Zeile kann vor dem Speichern korrigiert oder abgewählt werden.</p>
          </div>
          <button type="button" className="primary-button" disabled={saving || importSummary.selected === 0} onClick={saveSelected}>
            <Save size={15} aria-hidden="true" />
            Auswahl speichern
          </button>
        </div>

        {rows.length === 0 ? (
          <p className="empty-state">Noch keine Bestandsliste ausgewählt.</p>
        ) : (
          <div className="table-wrap import-table">
            <table>
              <thead>
                <tr>
                  <th>Übernehmen</th>
                  <th>Aktion</th>
                  <th>Inventar</th>
                  <th>Hersteller</th>
                  <th>Artikel</th>
                  <th>Bezeichnung</th>
                  <th>Spur</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const existing = row.duplicateVehicleId ? vehicles.find((vehicle) => vehicle.id === row.duplicateVehicleId) : undefined;
                  const changes = getImportChanges(row, existing);
                  return (
                    <Fragment key={row.id}>
                      <tr className={row.status === "error" ? "import-row-error" : row.status === "warning" ? "import-row-warning" : row.status === "saved" ? "import-row-saved" : ""}>
                        <td><input type="checkbox" checked={row.selected} disabled={row.status === "saved" || row.status === "error"} onChange={(event) => setRowSelected(row.id, event.target.checked)} /></td>
                        <td>
                          <select value={row.mode} disabled={row.status === "saved"} onChange={(event) => setRowMode(row.id, event.target.value as ImportRow["mode"])}>
                            <option value="create">Neu</option>
                            <option value="update" disabled={!row.duplicateVehicleId}>Aktualisieren</option>
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
                            {row.status === "saved" ? "gespeichert" : row.issues[0] || "bereit"}
                          </span>
                        </td>
                      </tr>
                      {existing && row.mode === "update" && (
                        <tr className="import-change-row">
                          <td colSpan={8}>
                            <div className="import-change-panel">
                              <div>
                                <strong>Feldvorschau für Update</strong>
                                <span>{changes.filter((change) => change.status === "overwrite").length} Überschreibungen, {changes.filter((change) => change.status === "fill").length} Ergänzungen</span>
                              </div>
                              {changes.length === 0 ? (
                                <p>Keine importierten Feldwerte für diese Update-Zeile.</p>
                              ) : (
                                <table>
                                  <thead>
                                    <tr>
                                      <th>Feld</th>
                                      <th>Aktuell</th>
                                      <th>Import</th>
                                      <th>Status</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {changes.map((change) => (
                                      <tr key={change.key} className={`change-${change.status}`}>
                                        <td>{change.label}</td>
                                        <td>{change.current}</td>
                                        <td>{change.incoming}</td>
                                        <td>{change.status === "same" ? "gleich" : change.status === "fill" ? "ergänzt leeres Feld" : "überschreibt"}</td>
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
