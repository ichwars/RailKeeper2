import { DragEvent, FormEvent, Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  AlertTriangle,
  ArrowUpDown,
  Barcode,
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  Cloud,
  Grid2X2,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Gauge,
  Image,
  Lightbulb,
  Link,
  Megaphone,
  MoreVertical,
  PackageSearch,
  Pencil,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Save,
  Search,
  Star,
  Table2,
  Trash2,
  Volume2,
  Upload,
  Wrench,
  X
} from "lucide-react";
import {
  api,
  ArticleSearchImage,
  ArticleSearchInput,
  ArticleSearchResponse,
  ArticleSearchResult,
  CreateVehicleRequest,
  MasterDataEntry,
  MasterDataRelation,
  VehicleAttachment,
  VehicleImage as VehicleImageRecord,
  VehicleCVFile,
  VehicleCVFilePreview,
  VehicleCVValue,
  VehicleCVValueInput,
  VehicleFunction,
  VehicleFunctionInput,
  VehicleMaintenance,
  VehicleMaintenanceInput,
  Vehicle
} from "../../shared/api";

const emptyVehicle: CreateVehicleRequest = {
  manufacturer: "",
  articleNumber: "",
  articleSourceUrl: "",
  name: "",
  gauge: "H0",
  epoch: "",
  railwayCompany: "",
  category: "",
  gattung: "",
  description: "",
  series: "",
  vehicleNumber: "",
  digital: false,
  digitalDecoderNumber: "",
  dtDecoder: false,
  dtDecoderNumber: "",
  exhibitionReady: false,
  abcBrakes: false,
  ean: "",
  productionPeriod: "",
  listPrice: "",
  lengthMm: "",
  weightG: "",
  color: "",
  lettering: "",
  load: "",
  interior: "",
  axles: "",
  axleCount: "",
  tractionTireCount: "",
  wheelset: "",
  couplingSame: false,
  couplingFront: "",
  couplingRear: "",
  powerPickup: "",
  adapter: "",
  driveEnabled: false,
  driveDescription: "",
  headlightsEnabled: false,
  headlightsDescription: "",
  lightingEnabled: false,
  lightingDescription: "",
  soundGeneratorEnabled: false,
  soundGeneratorDescription: "",
  smokeGeneratorEnabled: false,
  smokeGeneratorDescription: "",
  additionalInfo: "",
  qrCodeEnabled: false
};

type ModalMode = "create" | "view" | "edit";
type ModalTab = "model" | "control" | "cv" | "uploads" | "maintenance";
type SortKey = "inventoryNumber" | "manufacturer" | "articleNumber" | "name" | "gauge" | "epoch" | "category";
type SortDirection = "asc" | "desc";
type InventoryViewMode = "table" | "cards";
type InventoryReportMode = "summary" | "details";
type ArticleFieldKey = keyof CreateVehicleRequest;
type PendingArticleImage = ArticleSearchImage & {
  id: string;
  isPrimary?: boolean;
  persisted?: boolean;
  mimeType?: string;
  thumbnailUrl?: string;
  maintenanceId?: string;
};

type MaintenanceReminder = {
  vehicle: Vehicle;
  entry: VehicleMaintenance;
  daysUntilDue: number;
};

type AttachmentEditState = Record<string, { description: string; category: string; maintenanceId: string }>;
type FunctionEditState = Record<string, VehicleFunctionInput & { persisted?: boolean }>;
type FunctionMappingImport = VehicleFunctionInput & { functionKey: string };
type CVImportStatus = "new" | "changed" | "same" | "invalid";
type CVImportRow = {
  id: string;
  input: VehicleCVValueInput;
  existing?: VehicleCVValue;
  status: CVImportStatus;
  selected: boolean;
  message: string;
};
type CVImportPreview = {
  fileName: string;
  rows: CVImportRow[];
};
type CVFileUploadPreview = {
  files: File[];
  previews: VehicleCVFilePreview[];
};

const emptyMaintenanceForm: VehicleMaintenanceInput = {
  kind: "Wartung",
  status: "geplant",
  conditionRating: "",
  dueDate: "",
  completedAt: "",
  cost: "",
  notes: ""
};

const emptyCVForm: VehicleCVValueInput = {
  cvNumber: 1,
  value: 0,
  description: "",
  category: "",
  decoderProfile: "",
  sourceFileId: ""
};

type MasterDataOptions = {
  manufacturers: MasterDataEntry[];
  gauges: MasterDataEntry[];
  epochs: MasterDataEntry[];
  railwayCompanies: MasterDataEntry[];
  categories: MasterDataEntry[];
  gattungen: MasterDataEntry[];
  symbols: MasterDataEntry[];
  categoryRelations: MasterDataRelation[];
};

const emptyOptions: MasterDataOptions = {
  manufacturers: [],
  gauges: [],
  epochs: [],
  railwayCompanies: [],
  categories: [],
  gattungen: [],
  symbols: [],
  categoryRelations: []
};

const sortLabels: Record<SortKey, string> = {
  inventoryNumber: "Inventar",
  manufacturer: "Hersteller",
  articleNumber: "Artikel",
  name: "Bezeichnung",
  gauge: "Spur",
  epoch: "Epoche",
  category: "Kategorie"
};

const wheelsetOptions = ["2-Leiter DC", "3-Leiter AC", "NEM", "RP25", "Metall", "Kunststoff"];
const couplingOptions = ["NEM-Schacht", "Kurzkupplung", "Bügelkupplung", "Klauenkupplung", "Schraubenkupplung"];
const powerPickupOptions = ["Schiene", "Oberleitung", "Batterie", "Akku"];
const adapterOptions = ["NEM 651", "NEM 652", "PluX16", "PluX22", "MTC21", "Next18", "8-polig", "21-polig"];
const attachmentCategories = ["Anleitung", "Rechnung", "Decoder-Datei", "Dokumentation", "Ersatzteilliste", "Zertifikat", "Sonstiges"];
const maintenanceKinds = ["Wartung", "Reparatur", "Umbau", "Superung", "Reinigung", "Schmierung", "Decoder-Einbau", "Ersatzteiltausch"];
const maintenanceStatuses = [
  { value: "geplant", label: "geplant" },
  { value: "faellig", label: "fällig" },
  { value: "erledigt", label: "erledigt" }
];
const conditionRatings = ["neuwertig", "sehr gut", "gut", "gebraucht", "reparaturbedürftig"];
const functionKeys = Array.from({ length: 32 }, (_, index) => `F${index}`);
const functionTypes = ["standard", "sound", "licht", "kupplung", "rauch", "sonderfunktion"];
const functionModes = ["dauer", "moment"];
const commonDecoderProfiles = ["ESU LokPilot 5", "ESU LokSound 5", "Zimo MS", "Zimo MX", "D&H SD", "D&H DH", "Märklin mLD3", "Märklin mSD3", "Lenz Standard+"];
const fallbackFunctionSymbols = [
  { key: "light", label: "Licht" },
  { key: "sound", label: "Sound" },
  { key: "horn", label: "Horn" },
  { key: "coupling", label: "Kupplung" },
  { key: "smoke", label: "Rauch" },
  { key: "drive", label: "Fahrt" },
  { key: "warning", label: "Warnung" }
];
const cvCategories = ["Adresse", "Fahrverhalten", "Motor", "Licht", "Sound", "Funktion", "Decoder", "Sonstiges"];
const attachmentAccept = ".pdf,.jpg,.jpeg,.png,.webp,.txt,.csv,.json,.xml,.zip";
const cvFileAccept = ".json,.csv,.txt,.xml,.z21,.esu,.esux,.lokprogrammer,.zip";
const imageAccept = ".jpg,.jpeg,.png,.webp";
const blockedAttachmentExtensions = new Set(["exe", "bat", "cmd", "com", "scr", "msi", "dll", "ps1", "vbs", "js", "jar", "sh"]);
const allowedAttachmentExtensions = new Set(["pdf", "jpg", "jpeg", "png", "webp", "txt", "csv", "json", "xml", "zip"]);
const allowedCVFileExtensions = new Set(["json", "csv", "txt", "xml", "z21", "esu", "esux", "lokprogrammer", "zip"]);
const allowedImageExtensions = new Set(["jpg", "jpeg", "png", "webp"]);
const articleSearchSettingKey = "railkeeper.articleSearchEnabled";
const inventoryViewSettingKey = "railkeeper.inventoryViewMode";

const articleFieldLabels: Partial<Record<ArticleFieldKey, string>> = {
  manufacturer: "Hersteller",
  articleNumber: "Artikel-Nr.",
  articleSourceUrl: "Quelle",
  name: "Bezeichnung",
  gauge: "Spurweite",
  epoch: "Epoche",
  railwayCompany: "Bahngesellschaft",
  category: "Kategorie",
  gattung: "Gattung",
  description: "Beschreibung",
  series: "Baureihe",
  vehicleNumber: "Fahrzeug-Nr.",
  digitalDecoderNumber: "Digital / Decoder-Nr.",
  dtDecoderNumber: "DT / Decoder-Nr.",
  ean: "EAN-Nr.",
  productionPeriod: "Produktionszeit",
  listPrice: "Listenpreis",
  lengthMm: "Länge (mm)",
  weightG: "Gewicht (g)",
  color: "Farbe",
  lettering: "Beschriftung",
  load: "Beladung",
  interior: "Inneneinrichtung",
  axles: "Achsen",
  axleCount: "Anzahl",
  tractionTireCount: "Anzahl Haftreifen",
  wheelset: "Radsatz",
  couplingFront: "Kupplung vorne",
  couplingRear: "Kupplung hinten",
  powerPickup: "Stromabnahme",
  adapter: "Adapter",
  digital: "Digital",
  soundGeneratorEnabled: "Soundgenerator",
  headlightsEnabled: "Fahrlicht",
  lightingEnabled: "Beleuchtung",
  driveDescription: "Antrieb Beschreibung",
  headlightsDescription: "Fahrlicht Beschreibung",
  lightingDescription: "Beleuchtung Beschreibung",
  soundGeneratorDescription: "Soundgenerator Beschreibung",
  smokeGeneratorDescription: "Rauchgenerator Beschreibung",
  additionalInfo: "Zusatzinformationen"
};

const articleFieldGroups: { title: string; keys: ArticleFieldKey[] }[] = [
  {
    title: "Modell",
    keys: ["name", "articleNumber", "manufacturer", "gauge", "ean", "railwayCompany", "epoch", "series", "vehicleNumber", "gattung", "category"]
  },
  {
    title: "Masse / Bauart",
    keys: ["lengthMm", "weightG", "color", "lettering", "load", "interior", "axles", "axleCount", "tractionTireCount"]
  },
  {
    title: "Technik",
    keys: ["adapter", "powerPickup", "digital", "digitalDecoderNumber", "dtDecoderNumber", "soundGeneratorEnabled", "headlightsEnabled", "lightingEnabled", "driveDescription", "headlightsDescription", "lightingDescription", "soundGeneratorDescription", "smokeGeneratorDescription"]
  },
  {
    title: "Weitere Daten",
    keys: ["description", "additionalInfo", "productionPeriod", "listPrice", "articleSourceUrl"]
  }
];

const booleanArticleFields = new Set<ArticleFieldKey>([
  "digital",
  "dtDecoder",
  "exhibitionReady",
  "abcBrakes",
  "driveEnabled",
  "headlightsEnabled",
  "lightingEnabled",
  "soundGeneratorEnabled",
  "smokeGeneratorEnabled",
  "qrCodeEnabled"
]);

const searchableFieldKeys: ArticleFieldKey[] = [
  "manufacturer",
  "articleNumber",
  "name",
  "gauge",
  "epoch",
  "railwayCompany",
  "category",
  "gattung",
  "description",
  "series",
  "vehicleNumber",
  "digitalDecoderNumber",
  "dtDecoderNumber",
  "ean",
  "productionPeriod",
  "lengthMm",
  "weightG",
  "color",
  "lettering",
  "load",
  "interior",
  "axles",
  "axleCount",
  "tractionTireCount",
  "wheelset",
  "couplingFront",
  "couplingRear",
  "powerPickup",
  "adapter",
  "driveDescription",
  "headlightsDescription",
  "lightingDescription",
  "soundGeneratorDescription",
  "smokeGeneratorDescription",
  "additionalInfo"
];

function vehicleToForm(vehicle: Vehicle): CreateVehicleRequest {
  return {
    inventoryNumber: vehicle.inventoryNumber,
    manufacturer: vehicle.manufacturer,
    articleNumber: vehicle.articleNumber || "",
    articleSourceUrl: vehicle.articleSourceUrl || "",
    name: vehicle.name,
    gauge: vehicle.gauge,
    epoch: vehicle.epoch || "",
    railwayCompany: vehicle.railwayCompany || "",
    category: vehicle.category || "",
    gattung: vehicle.gattung || "",
    description: vehicle.description || "",
    series: vehicle.series || "",
    vehicleNumber: vehicle.vehicleNumber || "",
    digital: vehicle.digital,
    digitalDecoderNumber: vehicle.digitalDecoderNumber || "",
    dtDecoder: vehicle.dtDecoder,
    dtDecoderNumber: vehicle.dtDecoderNumber || "",
    exhibitionReady: vehicle.exhibitionReady,
    abcBrakes: vehicle.abcBrakes,
    ean: vehicle.ean || "",
    productionPeriod: vehicle.productionPeriod || "",
    listPrice: vehicle.listPrice || "",
    lengthMm: vehicle.lengthMm || "",
    weightG: vehicle.weightG || "",
    color: vehicle.color || "",
    lettering: vehicle.lettering || "",
    load: vehicle.load || "",
    interior: vehicle.interior || "",
    axles: vehicle.axles || "",
    axleCount: vehicle.axleCount || "",
    tractionTireCount: vehicle.tractionTireCount || "",
    wheelset: vehicle.wheelset || "",
    couplingSame: vehicle.couplingSame,
    couplingFront: vehicle.couplingFront || "",
    couplingRear: vehicle.couplingRear || "",
    powerPickup: vehicle.powerPickup || "",
    adapter: vehicle.adapter || "",
    driveEnabled: vehicle.driveEnabled,
    driveDescription: vehicle.driveDescription || "",
    headlightsEnabled: vehicle.headlightsEnabled,
    headlightsDescription: vehicle.headlightsDescription || "",
    lightingEnabled: vehicle.lightingEnabled,
    lightingDescription: vehicle.lightingDescription || "",
    soundGeneratorEnabled: vehicle.soundGeneratorEnabled,
    soundGeneratorDescription: vehicle.soundGeneratorDescription || "",
    smokeGeneratorEnabled: vehicle.smokeGeneratorEnabled,
    smokeGeneratorDescription: vehicle.smokeGeneratorDescription || "",
    additionalInfo: vehicle.additionalInfo || "",
    qrCodeEnabled: vehicle.qrCodeEnabled
  };
}

function optionValue(entry: MasterDataEntry) {
  return entry.label;
}

function valueForSort(vehicle: Vehicle, key: SortKey) {
  return (vehicle[key] || "").toLocaleLowerCase("de-DE");
}

function articleSearchEnabled() {
  return window.localStorage.getItem(articleSearchSettingKey) !== "false";
}

function inventoryViewMode(): InventoryViewMode {
  return window.localStorage.getItem(inventoryViewSettingKey) === "cards" ? "cards" : "table";
}

function vehicleFieldsForSearch(form: CreateVehicleRequest) {
  return Object.fromEntries(
    searchableFieldKeys
      .map((key) => [key, String(form[key] || "").trim()])
      .filter(([, value]) => value)
  ) as Record<string, string>;
}

function fieldValue(form: CreateVehicleRequest, key: string) {
  return String(form[key as ArticleFieldKey] || "").trim();
}

function isArticleFieldKey(key: string): key is ArticleFieldKey {
  return key in articleFieldLabels;
}

function articleResultKey(result: ArticleSearchResult, index = 0) {
  return `${result.url || result.title}-${index}`;
}

function articleSelectionKey(result: ArticleSearchResult, key: string, index = 0) {
  return `${articleResultKey(result, index)}::${key}`;
}

function imageSelectionKey(result: ArticleSearchResult, image: ArticleSearchImage, index = 0) {
  return `${articleResultKey(result, index)}::image::${image.url}`;
}

function booleanFromArticleValue(value: string) {
  return ["ja", "true", "1", "yes", "vorhanden", "digital"].includes(value.trim().toLocaleLowerCase("de-DE"));
}

function articleValueForForm(key: ArticleFieldKey, value: string) {
  if (booleanArticleFields.has(key)) {
    return booleanFromArticleValue(value);
  }
  return value;
}

function currentArticleValue(form: CreateVehicleRequest, key: ArticleFieldKey) {
  const value = form[key];
  if (typeof value === "boolean") {
    return value ? "Ja" : "Nein";
  }
  return String(value || "").trim();
}

function articleFieldStatus(current: string, found: string) {
  if (!current) return "leer";
  if (current.toLocaleLowerCase("de-DE") === found.toLocaleLowerCase("de-DE")) return "bereits gleich";
  return "Konflikt";
}

function sourceDisplayName(rawUrl: string) {
  try {
    const host = new URL(rawUrl).hostname.replace(/^www\./, "");
    const [name] = host.split(".");
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : host;
  } catch {
    return "Quelle";
  }
}

function isBadArticleValue(key: string, value: string) {
  const normalized = value.trim();
  const lower = normalized.toLocaleLowerCase("de-DE");
  if (!normalized) return true;
  if (key === "lengthMm") {
    const number = Number(normalized.replace(",", "."));
    return !Number.isFinite(number) || number < 20 || number > 600;
  }
  if (key === "description") {
    return [
      "die absicht ist",
      "anzeigen zu zeigen",
      "personalisierte anzeigen",
      "cookie",
      "google_analytics",
      "altersempfehlung",
      "downloads",
      "bedienungsanleitung"
    ].some((token) => lower.includes(token));
  }
  if (key === "lightingDescription") {
    return lower.includes("fahrtrichtung") || lower.includes("lichtwechsel") || lower.includes("spitzenlicht") || lower.includes("schlusslicht");
  }
  if (key === "headlightsDescription") {
    return lower.includes("altersempfehlung") || lower.includes("downloads") || lower.includes("bedienungsanleitung");
  }
  if (key === "soundGeneratorDescription") {
    return lower.includes("menu") || lower.includes("menü") || lower.includes("menue") || lower.includes("sprunggröße") || lower.includes("sprunggroesse") || lower.includes("wählen sie") || lower.includes("waehlen sie");
  }
  return false;
}

function sanitizeArticleSearchResponse(response: ArticleSearchResponse): ArticleSearchResponse {
  return {
    ...response,
    results: response.results.map((result) => {
      const fields = Object.fromEntries(
        Object.entries(result.fields).filter(([key, field]) => !isBadArticleValue(key, field.value))
      );
      return { ...result, fields };
    })
  };
}

function primaryImage(images?: { url: string; thumbnailUrl?: string; isPrimary?: boolean }[]) {
  return images?.find((image) => image.isPrimary) || images?.[0];
}

function previewImageUrl(image?: { url: string; thumbnailUrl?: string }) {
  return image?.thumbnailUrl || image?.url || "";
}

function vehicleImagesToPending(vehicle: Vehicle): PendingArticleImage[] {
  return (vehicle.images || []).map((image) => ({
    id: image.id || image.url,
    url: image.url,
    thumbnailUrl: image.thumbnailUrl,
    title: image.title || "",
    source: image.sourceUrl || image.url,
    isPrimary: image.isPrimary,
    persisted: true,
    mimeType: image.mimeType || "",
    maintenanceId: image.maintenanceId || ""
  }));
}

function uploadedImageToPending(image: VehicleImageRecord): PendingArticleImage {
  return {
    id: image.id || image.url,
    url: image.url,
    thumbnailUrl: image.thumbnailUrl,
    title: image.title || "",
    source: image.sourceUrl || image.url,
    isPrimary: image.isPrimary,
    persisted: true,
    mimeType: image.mimeType || "",
    maintenanceId: image.maintenanceId || ""
  };
}

function attachmentsToEditState(attachments?: VehicleAttachment[]): AttachmentEditState {
  return Object.fromEntries(
    (attachments || []).map((attachment) => [
      attachment.id,
      {
        description: attachment.description || "",
        category: attachment.category || "",
        maintenanceId: attachment.maintenanceId || ""
      }
    ])
  );
}

function functionsToEditState(functions?: VehicleFunction[]): FunctionEditState {
  return Object.fromEntries(
    (functions || []).map((item) => [
      item.functionKey,
      {
        name: item.name || "",
        symbolKey: item.symbolKey || "",
        functionType: item.functionType || "standard",
        mode: item.mode || "dauer",
        directionDependent: item.directionDependent,
        notes: item.notes || "",
        persisted: true
      }
    ])
  );
}

function emptyFunctionEdit(functionKey: string): VehicleFunctionInput & { persisted?: boolean } {
  return {
    name: functionKey === "F0" ? "Fahrlicht" : "",
    symbolKey: functionKey === "F0" ? "light" : "",
    functionType: functionKey === "F0" ? "licht" : "standard",
    mode: "dauer",
    directionDependent: false,
    notes: "",
    persisted: false
  };
}

function functionSymbolIcon(symbolKey?: string, functionType?: string) {
  const key = symbolKey || functionType || "standard";
  const props = { size: 16, "aria-hidden": true };
  switch (key) {
    case "light":
    case "licht":
      return <Lightbulb {...props} />;
    case "sound":
      return <Volume2 {...props} />;
    case "horn":
      return <Megaphone {...props} />;
    case "coupling":
    case "kupplung":
      return <Link {...props} />;
    case "smoke":
    case "rauch":
      return <Cloud {...props} />;
    case "drive":
      return <Gauge {...props} />;
    case "warning":
      return <AlertTriangle {...props} />;
    default:
      return <Circle {...props} />;
  }
}

function functionSymbolOptions(symbols: MasterDataEntry[]) {
  const merged = new Map<string, { key: string; label: string }>();
  for (const symbol of fallbackFunctionSymbols) {
    merged.set(symbol.key, symbol);
  }
  for (const symbol of symbols) {
    if (symbol.active) {
      merged.set(symbol.key, { key: symbol.key, label: symbol.label });
    }
  }
  return [...merged.values()];
}

function FunctionSymbolPicker({
  value,
  functionType,
  symbols,
  disabled,
  label,
  onChange
}: {
  value?: string;
  functionType?: string;
  symbols: MasterDataEntry[];
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
}) {
  const options = functionSymbolOptions(symbols);
  const selected = options.find((symbol) => symbol.key === value);
  return (
    <details className="function-symbol-picker">
      <summary aria-label={label}>
        {functionSymbolIcon(value, functionType)}
        <span>{selected?.label || "Symbol"}</span>
      </summary>
      <div className="function-symbol-menu">
        <button type="button" className={!value ? "active" : ""} onClick={() => onChange("")} disabled={disabled}>
          <Circle size={16} aria-hidden="true" />
          <span>Kein Symbol</span>
        </button>
        {options.map((symbol) => (
          <button type="button" key={symbol.key} className={value === symbol.key ? "active" : ""} onClick={() => onChange(symbol.key)} disabled={disabled} title={symbol.label}>
            {functionSymbolIcon(symbol.key, functionType)}
            <span>{symbol.label}</span>
          </button>
        ))}
      </div>
    </details>
  );
}

function cvValuesFromImport(text: string): VehicleCVValueInput[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    const rows = Array.isArray(parsed) ? parsed : parsed.cvValues || [];
    return rows.map((row: Partial<VehicleCVValueInput>) => ({
      cvNumber: Number(row.cvNumber),
      value: Number(row.value),
      description: String(row.description || ""),
      category: String(row.category || ""),
      decoderProfile: String(row.decoderProfile || ""),
      sourceFileId: String(row.sourceFileId || "")
    }));
  }
  return trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.toLocaleLowerCase("de-DE").startsWith("cv"))
    .map((line) => {
      const [cvNumber, value, description = "", category = "", decoderProfile = ""] = line.split(/[;,]/).map((part) => part.trim());
      return {
        cvNumber: Number(cvNumber),
        value: Number(value),
        description,
        category,
        decoderProfile,
        sourceFileId: ""
      };
    });
}

function functionMappingsFromImport(text: string): FunctionMappingImport[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed);
  const rows = Array.isArray(parsed) ? parsed : parsed.functions || parsed.functionMappings || [];
  return rows.map((row: Partial<FunctionMappingImport>) => ({
    functionKey: String(row.functionKey || "").toUpperCase(),
    name: String(row.name || ""),
    symbolKey: String(row.symbolKey || ""),
    functionType: String(row.functionType || "standard"),
    mode: String(row.mode || "dauer"),
    directionDependent: Boolean(row.directionDependent),
    notes: String(row.notes || "")
  }));
}

function isValidFunctionMapping(value: FunctionMappingImport) {
  return functionKeys.includes(value.functionKey) &&
    functionTypes.includes(value.functionType || "standard") &&
    functionModes.includes(value.mode || "dauer");
}

function cvValueKey(value: Pick<VehicleCVValueInput, "cvNumber" | "decoderProfile">) {
  return `${Number(value.cvNumber)}::${(value.decoderProfile || "").trim().toLocaleLowerCase("de-DE")}`;
}

function normalizeCVText(value?: string) {
  return (value || "").trim();
}

function cvImportChanges(existing: VehicleCVValue, input: VehicleCVValueInput) {
  const changes = [];
  if (Number(existing.value) !== Number(input.value)) changes.push("Wert");
  if (normalizeCVText(existing.description) !== normalizeCVText(input.description)) changes.push("Beschreibung");
  if (normalizeCVText(existing.category) !== normalizeCVText(input.category)) changes.push("Kategorie");
  if (normalizeCVText(existing.sourceFileId) !== normalizeCVText(input.sourceFileId)) changes.push("Quelldatei");
  return changes;
}

function buildCVImportPreview(fileName: string, values: VehicleCVValueInput[], existingValues: VehicleCVValue[]): CVImportPreview {
  const existing = new Map(existingValues.map((entry) => [cvValueKey(entry), entry]));
  const seen = new Set<string>();
  const rows = values.map((input, index) => {
    const key = cvValueKey(input);
    if (!isValidCVValueInput(input)) {
      return {
        id: `${index}-${key}`,
        input,
        status: "invalid" as CVImportStatus,
        selected: false,
        message: "ungültig"
      };
    }
    if (seen.has(key)) {
      return {
        id: `${index}-${key}`,
        input,
        status: "invalid" as CVImportStatus,
        selected: false,
        message: "doppelt im Import"
      };
    }
    seen.add(key);
    const match = existing.get(key);
    if (!match) {
      return {
        id: `${index}-${key}`,
        input,
        status: "new" as CVImportStatus,
        selected: true,
        message: "neu"
      };
    }
    const changes = cvImportChanges(match, input);
    if (changes.length === 0) {
      return {
        id: `${index}-${key}`,
        input,
        existing: match,
        status: "same" as CVImportStatus,
        selected: false,
        message: "bereits gleich"
      };
    }
    return {
      id: `${index}-${key}`,
      input,
      existing: match,
      status: "changed" as CVImportStatus,
      selected: true,
      message: `ändert ${changes.join(", ")}`
    };
  });
  return { fileName, rows };
}

function isValidCVValueInput(value: VehicleCVValueInput) {
  return Number.isInteger(Number(value.cvNumber)) &&
    Number(value.cvNumber) >= 1 &&
    Number(value.cvNumber) <= 1024 &&
    Number.isInteger(Number(value.value)) &&
    Number(value.value) >= 0 &&
    Number(value.value) <= 255;
}

function formatFileSize(size: number) {
  if (!size) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("de-DE");
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toLocaleDateString("de-DE")} ${date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
}

function maintenanceOptionLabel(entry: VehicleMaintenance) {
  const due = entry.dueDate ? ` · ${formatDate(entry.dueDate)}` : "";
  const notes = entry.notes ? ` · ${entry.notes}` : "";
  return `${entry.kind}${due}${notes}`;
}

function reportValue(value?: string | number | boolean) {
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (value === 0) return "0";
  return String(value || "-");
}

function escapeHtml(value?: string | number | boolean) {
  return reportValue(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function reportField(label: string, value?: string | number | boolean) {
  return `
    <div class="field">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function reportImage(vehicle: Vehicle) {
  const image = primaryImage(vehicle.images);
  if (!image?.url) {
    return `<div class="image-placeholder">Keine Vorschau</div>`;
  }
  return `<img class="vehicle-image" src="${escapeHtml(image.url)}" alt="">`;
}

function inventoryReportHtml(vehicles: Vehicle[], query: string, sort: { key: SortKey; direction: SortDirection }, mode: InventoryReportMode) {
  const now = new Date();
  const totalAttachments = vehicles.reduce((sum, vehicle) => sum + (vehicle.attachments || []).length, 0);
  const totalImages = vehicles.reduce((sum, vehicle) => sum + (vehicle.images || []).length, 0);
  const totalCVValues = vehicles.reduce((sum, vehicle) => sum + (vehicle.cvValues || []).length, 0);
  const rows = vehicles
    .map(
      (vehicle) => `
        <tr>
          <td>${escapeHtml(vehicle.inventoryNumber)}</td>
          <td>${escapeHtml(vehicle.manufacturer)}</td>
          <td>${escapeHtml(vehicle.articleNumber)}</td>
          <td>${escapeHtml(vehicle.name)}</td>
          <td>${escapeHtml(vehicle.gauge)}</td>
          <td>${escapeHtml(vehicle.epoch)}</td>
          <td>${escapeHtml(vehicle.category)}</td>
        </tr>
      `
    )
    .join("");
  const details = vehicles
    .map((vehicle) => {
      const dueMaintenance = (vehicle.maintenance || []).filter(maintenanceIsDue).length;
      const activeFunctions = (vehicle.functions || []).filter((item) => item.name || item.symbolKey || item.notes).length;
      return `
        <section class="vehicle-card">
          <div class="vehicle-card-head">
            ${reportImage(vehicle)}
            <div>
              <h2>${escapeHtml(vehicle.inventoryNumber)} · ${escapeHtml(vehicle.name)}</h2>
              <p>${escapeHtml([vehicle.manufacturer, vehicle.articleNumber, vehicle.gauge, vehicle.epoch].filter(Boolean).join(" · "))}</p>
            </div>
          </div>
          <div class="field-grid">
            ${reportField("Kategorie", vehicle.category)}
            ${reportField("Gattung", vehicle.gattung)}
            ${reportField("Bahngesellschaft", vehicle.railwayCompany)}
            ${reportField("Baureihe", vehicle.series)}
            ${reportField("Fahrzeug-Nr.", vehicle.vehicleNumber)}
            ${reportField("EAN", vehicle.ean)}
            ${reportField("Länge", vehicle.lengthMm ? `${vehicle.lengthMm} mm` : "")}
            ${reportField("Gewicht", vehicle.weightG ? `${vehicle.weightG} g` : "")}
            ${reportField("Farbe", vehicle.color)}
            ${reportField("Beschriftung", vehicle.lettering)}
            ${reportField("Digital", vehicle.digital)}
            ${reportField("Decoder-Nr.", vehicle.digitalDecoderNumber || vehicle.dtDecoderNumber)}
            ${reportField("Soundgenerator", vehicle.soundGeneratorEnabled)}
            ${reportField("Fahrlicht", vehicle.headlightsEnabled)}
            ${reportField("Beleuchtung", vehicle.lightingEnabled)}
            ${reportField("Rauchgenerator", vehicle.smokeGeneratorEnabled)}
            ${reportField("Bilder", (vehicle.images || []).length)}
            ${reportField("Beilagen", (vehicle.attachments || []).length)}
            ${reportField("Wartung fällig", dueMaintenance)}
            ${reportField("Funktionen", activeFunctions)}
            ${reportField("CV-Werte", (vehicle.cvValues || []).length)}
          </div>
          ${vehicle.description ? `<p class="description">${escapeHtml(vehicle.description)}</p>` : ""}
          ${vehicle.additionalInfo ? `<p class="description">${escapeHtml(vehicle.additionalInfo)}</p>` : ""}
        </section>
      `;
    })
    .join("");

  const detailSection = mode === "details" ? `
    <h2>Details</h2>
    ${details}
  ` : "";

  return `
<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8">
    <title>RailKeeper2 Bestand</title>
    <style>
      :root { color: #0b1e26; font-family: "SF Pro Display", "Segoe UI", Arial, sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 24px; background: #fff; }
      header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; padding-bottom: 18px; border-bottom: 2px solid #1c621b; }
      h1 { margin: 0; font-size: 26px; }
      h2 { margin: 0; font-size: 18px; }
      p { margin: 6px 0 0; color: #487070; }
      .meta { text-align: right; font-size: 12px; color: #487070; }
      .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0; }
      .summary div { border: 1px solid #d9e4df; border-radius: 8px; padding: 10px; background: #f7faf8; }
      .summary span, .field span { display: block; color: #487070; font-size: 11px; font-weight: 700; text-transform: uppercase; }
      .summary strong { display: block; margin-top: 4px; font-size: 22px; }
      table { width: 100%; border-collapse: collapse; margin: 12px 0 24px; font-size: 12px; }
      th, td { border-bottom: 1px solid #d9e4df; padding: 8px; text-align: left; vertical-align: top; }
      th { background: #eef5f1; color: #24474a; font-size: 10px; text-transform: uppercase; }
      .vehicle-card { page-break-inside: avoid; border: 1px solid #d9e4df; border-radius: 8px; padding: 12px; margin: 12px 0; }
      .vehicle-card-head { display: grid; grid-template-columns: 76px 1fr; gap: 12px; align-items: center; margin-bottom: 10px; }
      .vehicle-image, .image-placeholder { width: 76px; height: 54px; border: 1px solid #d9e4df; border-radius: 7px; object-fit: cover; background: #f2f6f5; }
      .image-placeholder { display: grid; place-items: center; color: #789; font-size: 10px; text-align: center; padding: 4px; }
      .field-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
      .field { min-height: 48px; border: 1px solid #e1e9e5; border-radius: 7px; padding: 8px; }
      .field strong { display: block; margin-top: 4px; font-size: 12px; overflow-wrap: anywhere; }
      .description { border-left: 3px solid #a5ec60; padding-left: 10px; margin-top: 10px; color: #0b1e26; white-space: pre-wrap; }
      .screen-actions { position: sticky; top: 0; display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 12px; }
      button { border: 0; border-radius: 7px; padding: 10px 14px; background: #3c8eff; color: white; font-weight: 800; cursor: pointer; }
      @page { margin: 14mm; }
      @media print {
        body { margin: 0; }
        .screen-actions { display: none; }
        header { break-after: avoid; }
      }
    </style>
  </head>
  <body>
    <div class="screen-actions">
      <button onclick="window.print()">Drucken / Als PDF speichern</button>
    </div>
    <header>
      <div>
        <h1>RailKeeper2 Bestand</h1>
        <p>${query.trim() ? `Filter: ${escapeHtml(query.trim())}` : "Alle Fahrzeuge"} · ${mode === "details" ? "Detailreport" : "Kurzliste"}</p>
      </div>
      <div class="meta">
        <strong>${escapeHtml(now.toLocaleDateString("de-DE"))}</strong><br>
        ${escapeHtml(now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }))}<br>
        Sortierung: ${escapeHtml(sortLabels[sort.key])} ${sort.direction === "asc" ? "aufsteigend" : "absteigend"}
      </div>
    </header>
    <section class="summary">
      <div><span>Fahrzeuge</span><strong>${vehicles.length}</strong></div>
      <div><span>Bilder</span><strong>${totalImages}</strong></div>
      <div><span>Beilagen</span><strong>${totalAttachments}</strong></div>
      <div><span>CV-Werte</span><strong>${totalCVValues}</strong></div>
    </section>
    <h2>Übersicht</h2>
    <table>
      <thead>
        <tr>
          <th>Inventar</th>
          <th>Hersteller</th>
          <th>Artikel</th>
          <th>Bezeichnung</th>
          <th>Spur</th>
          <th>Epoche</th>
          <th>Kategorie</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${detailSection}
  </body>
</html>
`;
}

function maintenanceIsDue(entry: VehicleMaintenance) {
  if (!entry.dueDate || entry.status === "erledigt") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${entry.dueDate}T00:00:00`);
  return !Number.isNaN(due.getTime()) && due <= today;
}

function maintenanceDaysUntilDue(entry: VehicleMaintenance) {
  if (!entry.dueDate || entry.status === "erledigt") return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${entry.dueDate}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  return Math.ceil((due.getTime() - today.getTime()) / 86400000);
}

function maintenanceReminderText(daysUntilDue: number) {
  if (daysUntilDue < 0) return `seit ${Math.abs(daysUntilDue)} Tag${Math.abs(daysUntilDue) === 1 ? "" : "en"} überfällig`;
  if (daysUntilDue === 0) return "heute fällig";
  if (daysUntilDue === 1) return "morgen fällig";
  return `in ${daysUntilDue} Tagen fällig`;
}

function maintenanceStatusLabel(status: string) {
  return status === "faellig" || status === "fällig" ? "fällig" : status;
}

function maintenanceStatusClass(status: string) {
  return status === "fällig" ? "faellig" : status;
}

function todayISODate() {
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  return today.toISOString().slice(0, 10);
}

function formatMaintenanceCost(cost?: string) {
  if (!cost) return "-";
  const value = Number(cost.replace(",", "."));
  if (Number.isNaN(value)) return cost;
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function fileExtension(fileName: string) {
  return fileName.split(".").pop()?.toLocaleLowerCase("de-DE") || "";
}

function isBlockedAttachmentFile(file: File) {
  const extension = fileExtension(file.name);
  return blockedAttachmentExtensions.has(extension) || !allowedAttachmentExtensions.has(extension);
}

function isBlockedCVFile(file: File) {
  const extension = fileExtension(file.name);
  return blockedAttachmentExtensions.has(extension) || !allowedCVFileExtensions.has(extension);
}

function isAllowedImageFile(file: File) {
  return allowedImageExtensions.has(fileExtension(file.name));
}

function attachmentCategoryForFile(file: File) {
  const lower = file.name.toLocaleLowerCase("de-DE");
  if (lower.includes("rechnung") || lower.includes("invoice")) return "Rechnung";
  if (lower.includes("decoder") || lower.endsWith(".json") || lower.endsWith(".xml")) return "Decoder-Datei";
  if (lower.includes("ersatzteil")) return "Ersatzteilliste";
  if (lower.includes("zertifikat") || lower.includes("certificate")) return "Zertifikat";
  if (lower.includes("anleitung") || lower.includes("manual") || lower.includes("bedienung")) return "Anleitung";
  if (lower.endsWith(".pdf")) return "Dokumentation";
  return "Sonstiges";
}

function qrPayload(vehicle: Vehicle | null, form: CreateVehicleRequest) {
  const inventory = form.inventoryNumber || vehicle?.inventoryNumber || "";
  const name = form.name || vehicle?.name || "";
  const decoder = form.digitalDecoderNumber || form.dtDecoderNumber || vehicle?.digitalDecoderNumber || vehicle?.dtDecoderNumber || "";
  const detailURL = vehicle?.id ? `${window.location.origin}/?vehicle=${encodeURIComponent(vehicle.id)}` : window.location.origin;
  return [
    `URL: ${detailURL}`,
    `INV-Nr.: ${inventory}`,
    `Bezeichnung: ${name}`,
    `Decodernummer: ${decoder || "-"}`
  ].join("\n");
}

function composeBrandedQrSvg(svg: string) {
  const mark = `<rect x="111" y="111" width="34" height="34" rx="8" fill="#fff"/><image href="/brand/railkeeper-mark.png" x="115" y="115" width="26" height="26" preserveAspectRatio="xMidYMid meet"/>`;
  return svg.replace("</svg>", `${mark}</svg>`);
}

function renderStaticOptions(items: string[], emptyLabel = "Bitte wählen") {
  return (
    <>
      <option value="">{emptyLabel}</option>
      {items.map((item) => (
        <option key={item} value={item}>
          {item}
        </option>
      ))}
    </>
  );
}

function VehicleDetailsFields({
  form,
  readonly,
  onOpenQr,
  update,
  updateCouplingFront,
  updateCouplingSame
}: {
  form: CreateVehicleRequest;
  readonly: boolean;
  onOpenQr: () => void;
  update: (patch: Partial<CreateVehicleRequest>) => void;
  updateCouplingFront: (couplingFront: string) => void;
  updateCouplingSame: (couplingSame: boolean) => void;
}) {
  return (
    <>
      <div className="form-row four-columns">
        <label>
          Länge (mm)
          <input value={form.lengthMm || ""} onChange={(event) => update({ lengthMm: event.target.value })} disabled={readonly} inputMode="decimal" />
        </label>
        <label>
          Gewicht (g)
          <input value={form.weightG || ""} onChange={(event) => update({ weightG: event.target.value })} disabled={readonly} inputMode="decimal" />
        </label>
        <label>
          Farbe
          <input value={form.color || ""} onChange={(event) => update({ color: event.target.value })} disabled={readonly} />
        </label>
        <label>
          Beschriftung
          <input value={form.lettering || ""} onChange={(event) => update({ lettering: event.target.value })} disabled={readonly} />
        </label>
      </div>

      <div className="form-row three-columns">
        <label>
          Beladung
          <input value={form.load || ""} onChange={(event) => update({ load: event.target.value })} disabled={readonly} />
        </label>
        <label>
          Inneneinrichtung
          <input value={form.interior || ""} onChange={(event) => update({ interior: event.target.value })} disabled={readonly} />
        </label>
        <label>
          Achsen
          <input value={form.axles || ""} onChange={(event) => update({ axles: event.target.value })} disabled={readonly} />
        </label>
      </div>

      <div className="form-row four-columns">
        <label>
          Anzahl
          <input value={form.axleCount || ""} onChange={(event) => update({ axleCount: event.target.value })} disabled={readonly} inputMode="numeric" />
        </label>
        <label>
          Anzahl Haftreifen
          <input value={form.tractionTireCount || ""} onChange={(event) => update({ tractionTireCount: event.target.value })} disabled={readonly} inputMode="numeric" />
        </label>
        <label>
          Radsatz
          <select value={form.wheelset || ""} onChange={(event) => update({ wheelset: event.target.value })} disabled={readonly}>
            {renderStaticOptions(wheelsetOptions)}
          </select>
        </label>
        <label>
          Stromabnahme
          <select value={form.powerPickup || ""} onChange={(event) => update({ powerPickup: event.target.value })} disabled={readonly}>
            {renderStaticOptions(powerPickupOptions)}
          </select>
        </label>
      </div>

      <div className="form-row details-coupling-row">
        <label>
          Adapter
          <select value={form.adapter || ""} onChange={(event) => update({ adapter: event.target.value })} disabled={readonly}>
            {renderStaticOptions(adapterOptions)}
          </select>
        </label>
        <label className="coupling-same-field">
          <span>Kupplung (V=H)</span>
          <span className="switch-field">
            <input type="checkbox" checked={Boolean(form.couplingSame)} onChange={(event) => updateCouplingSame(event.target.checked)} disabled={readonly} />
            <span />
          </span>
        </label>
        <label>
          Kupplung vorne
          <select value={form.couplingFront || ""} onChange={(event) => updateCouplingFront(event.target.value)} disabled={readonly}>
            {renderStaticOptions(couplingOptions)}
          </select>
        </label>
        <label>
          Kupplung hinten
          <select value={form.couplingSame ? form.couplingFront || "" : form.couplingRear || ""} onChange={(event) => update({ couplingRear: event.target.value })} disabled={readonly || Boolean(form.couplingSame)}>
            {renderStaticOptions(couplingOptions)}
          </select>
        </label>
      </div>

      <div className="form-row switch-description-row">
        <label>
          Fahrlicht Beschreibung
          <span className="inline-switch-input">
            <span className="switch-field" aria-label="Fahrlicht">
              <input type="checkbox" checked={Boolean(form.headlightsEnabled)} onChange={(event) => update({ headlightsEnabled: event.target.checked })} disabled={readonly} />
              <span />
            </span>
            <input value={form.headlightsDescription || ""} onChange={(event) => update({ headlightsDescription: event.target.value })} disabled={readonly || !form.headlightsEnabled} />
          </span>
        </label>
        <label>
          Antrieb Beschreibung
          <span className="inline-switch-input">
            <span className="switch-field" aria-label="Antrieb">
              <input type="checkbox" checked={Boolean(form.driveEnabled)} onChange={(event) => update({ driveEnabled: event.target.checked })} disabled={readonly} />
              <span />
            </span>
            <input value={form.driveDescription || ""} onChange={(event) => update({ driveDescription: event.target.value })} disabled={readonly || !form.driveEnabled} />
          </span>
        </label>
      </div>

      <div className="form-row switch-description-row">
        <label>
          Beleuchtung Beschreibung
          <span className="inline-switch-input">
            <span className="switch-field" aria-label="Beleuchtung">
              <input type="checkbox" checked={Boolean(form.lightingEnabled)} onChange={(event) => update({ lightingEnabled: event.target.checked })} disabled={readonly} />
              <span />
            </span>
            <input value={form.lightingDescription || ""} onChange={(event) => update({ lightingDescription: event.target.value })} disabled={readonly || !form.lightingEnabled} />
          </span>
        </label>
        <label>
          Soundgenerator Beschreibung
          <span className="inline-switch-input">
            <span className="switch-field" aria-label="Soundgenerator">
              <input type="checkbox" checked={Boolean(form.soundGeneratorEnabled)} onChange={(event) => update({ soundGeneratorEnabled: event.target.checked })} disabled={readonly} />
              <span />
            </span>
            <input value={form.soundGeneratorDescription || ""} onChange={(event) => update({ soundGeneratorDescription: event.target.value })} disabled={readonly || !form.soundGeneratorEnabled} />
          </span>
        </label>
      </div>

      <div className="form-row switch-description-row">
        <label>
          Rauchgenerator Beschreibung
          <span className="inline-switch-input">
            <span className="switch-field" aria-label="Rauchgenerator">
              <input type="checkbox" checked={Boolean(form.smokeGeneratorEnabled)} onChange={(event) => update({ smokeGeneratorEnabled: event.target.checked })} disabled={readonly} />
              <span />
            </span>
            <input value={form.smokeGeneratorDescription || ""} onChange={(event) => update({ smokeGeneratorDescription: event.target.value })} disabled={readonly || !form.smokeGeneratorEnabled} />
          </span>
        </label>
        <label className="qr-switch-field">
          <span>QR-Code erstellen</span>
          <span className="qr-card-actions">
            <span className="switch-field">
              <input type="checkbox" checked={Boolean(form.qrCodeEnabled)} onChange={(event) => update({ qrCodeEnabled: event.target.checked })} disabled={readonly} />
              <span />
            </span>
            <button type="button" className="icon-button" onClick={onOpenQr} aria-label="QR-Code anzeigen" title="QR-Code anzeigen" disabled={!form.qrCodeEnabled}>
              <QrCode size={16} />
            </button>
          </span>
        </label>
      </div>

      <label>
        Zusatzinformationen
        <textarea value={form.additionalInfo || ""} onChange={(event) => update({ additionalInfo: event.target.value })} disabled={readonly} rows={4} />
      </label>
    </>
  );
}

function ArticleSearchDialog({
  form,
  loading,
  response,
  error,
  selectedFields,
  selectedImages,
  onApply,
  onClose,
  onToggleField,
  onToggleImage,
  onSelectEmptyFields,
  onSelectAllFields,
  onClearFields
}: {
  form: CreateVehicleRequest;
  loading: boolean;
  response: ArticleSearchResponse | null;
  error: string;
  selectedFields: Record<string, boolean>;
  selectedImages: Record<string, boolean>;
  onApply: (result: ArticleSearchResult) => void;
  onClose: () => void;
  onToggleField: (result: ArticleSearchResult, index: number, key: string, checked: boolean) => void;
  onToggleImage: (result: ArticleSearchResult, index: number, image: ArticleSearchImage, checked: boolean) => void;
  onSelectEmptyFields: () => void;
  onSelectAllFields: () => void;
  onClearFields: () => void;
}) {
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setFailedImages({});
  }, [response?.query]);

  const markImageFailed = useCallback((url: string) => {
    setFailedImages((current) => current[url] ? current : { ...current, [url]: true });
  }, []);

  return (
    <div className="confirm-layer article-search-layer" role="dialog" aria-modal="true" aria-label="Artikeldaten-Websuche">
      <section className="article-search-dialog">
        <div className="panel-head form-head">
          <div>
            <h2>Artikeldaten-Websuche</h2>
            <p>{response?.query ? `Suchanfrage: ${response.query}` : "Webseiten werden als Vorschläge ausgewertet."}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Schließen" title="Schließen">
            <X size={17} />
          </button>
        </div>

        <div className="article-dialog-state">
          {loading && <p className="empty-state compact">Suche läuft mit Timeout und ohne automatische Übernahme...</p>}
          {error && <p className="form-message">{error}</p>}
          {!loading && !error && response && response.results.length === 0 && (
            <p className="empty-state compact">Keine passenden Artikeldaten gefunden.</p>
          )}
        </div>

        <div className="article-result-list">
          {response?.results.map((result, index) => {
            const resultKey = articleResultKey(result, index);
            const selectableKeys = Object.keys(result.fields).filter(isArticleFieldKey);
            const visibleImages = (result.images || []).filter((image) => image.url && !failedImages[image.url]);
            const resultImage = visibleImages[0];
            return (
              <article key={resultKey} className="article-result-card article-result-table-card">
                <header>
                  {resultImage && (
                    <img className="article-result-thumb" src={previewImageUrl(resultImage)} alt="" onError={() => markImageFailed(resultImage.url)} />
                  )}
                  <div>
                    <strong>{result.title}</strong>
                    <span>{result.source} - {Object.keys(result.fields).length} Felder - Trefferwert {result.score}</span>
                    {result.snippet && <p>{result.snippet}</p>}
                  </div>
                  <a className="secondary-button article-source-button" href={result.url} target="_blank" rel="noreferrer" aria-label="Quelle öffnen" title="Quelle öffnen">
                    <ExternalLink size={15} />
                    Quelle öffnen
                  </a>
                </header>

                {visibleImages.length > 0 && (
                  <div className="article-image-strip" aria-label="Gefundene Bilder">
                    {visibleImages.map((image) => {
                      const selectionKey = imageSelectionKey(result, image, index);
                      return (
                      <label key={image.url} className="article-image-option">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedImages[selectionKey])}
                          onChange={(event) => onToggleImage(result, index, image, event.target.checked)}
                        />
                        <img
                          src={previewImageUrl(image)}
                          alt=""
                          onError={() => {
                            markImageFailed(image.url);
                            if (selectedImages[selectionKey]) {
                              onToggleImage(result, index, image, false);
                            }
                          }}
                        />
                      </label>
                    )})}
                  </div>
                )}

                {result.conflicts && result.conflicts.length > 0 && (
                  <div className="conflict-note">
                    <AlertTriangle size={15} aria-hidden="true" />
                    Konflikte mit bestehenden Feldern: {result.conflicts.map((key) => articleFieldLabels[key as ArticleFieldKey] || key).join(", ")}
                  </div>
                )}

                <div className="article-field-groups">
                  {articleFieldGroups.map((group) => {
                    const rows = group.keys
                      .filter((key) => result.fields[key])
                      .map((key) => ({ key, field: result.fields[key] }));
                    if (rows.length === 0) return null;
                    return (
                      <section key={group.title} className="article-field-group">
                        <h3>{group.title}</h3>
                        <table>
                          <thead>
                            <tr>
                              <th>Übernehmen</th>
                              <th>Feld</th>
                              <th>Aktuell</th>
                              <th>Gefunden</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map(({ key, field }) => {
                              const current = currentArticleValue(form, key);
                              const status = articleFieldStatus(current, field.value);
                              const foundDisplay = key === "articleSourceUrl" ? sourceDisplayName(field.value) : field.value;
                              const currentDisplay = key === "articleSourceUrl" && current ? sourceDisplayName(current) : current;
                              const selectionKey = articleSelectionKey(result, key, index);
                              return (
                                <tr key={key} className={status === "Konflikt" ? "conflict" : ""}>
                                  <td>
                                    <input
                                      type="checkbox"
                                      checked={Boolean(selectedFields[selectionKey])}
                                      onChange={(event) => onToggleField(result, index, key, event.target.checked)}
                                    />
                                  </td>
                                  <td><strong>{articleFieldLabels[key] || field.label}</strong></td>
                                  <td>{currentDisplay || "-"}</td>
                                  <td>
                                    {key === "articleSourceUrl" && field.value ? (
                                      <a className="inline-source-link" href={field.value} target="_blank" rel="noreferrer" title={field.value}>
                                        {foundDisplay || "Quelle"}
                                        <ExternalLink size={13} aria-hidden="true" />
                                      </a>
                                    ) : (
                                      foundDisplay || "-"
                                    )}
                                  </td>
                                  <td><span className={`article-status ${status === "Konflikt" ? "conflict" : status === "bereits gleich" ? "same" : "empty"}`}>{status}</span></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </section>
                    );
                  })}
                </div>

                <footer>
                  <span>{selectableKeys.length} übernehmbare Felder</span>
                  <button type="button" className="primary-button" onClick={() => onApply(result)}>
                    <Check size={16} aria-hidden="true" />
                    Ausgewählte Felder übernehmen
                  </button>
                </footer>
              </article>
            );
          })}
        </div>

        <footer className="article-dialog-actions">
          <button type="button" className="secondary-button" onClick={onSelectEmptyFields}>Nur leere Felder</button>
          <button type="button" className="secondary-button" onClick={onSelectAllFields}>Alles auswählen</button>
          <button type="button" className="secondary-button" onClick={onClearFields}>Nichts auswählen</button>
        </footer>
      </section>
    </div>
  );
}

function QrDialog({
  form,
  qrSvg,
  error,
  onClose,
  onDownloadPng,
  onDownloadSvg,
  onPrint
}: {
  form: CreateVehicleRequest;
  qrSvg: string;
  error: string;
  onClose: () => void;
  onDownloadPng: () => void;
  onDownloadSvg: () => void;
  onPrint: () => void;
}) {
  return (
    <div className="confirm-layer qr-layer" role="dialog" aria-modal="true" aria-label="QR-Code">
      <section className="qr-dialog">
        <div className="panel-head form-head">
          <div>
            <h2>QR-Code</h2>
            <p>{form.inventoryNumber || "Ohne Inventarnummer"} - {form.name || "Ohne Bezeichnung"}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Schließen" title="Schließen">
            <X size={17} />
          </button>
        </div>
        {error && <p className="form-message">{error}</p>}
        <button type="button" className="qr-preview-button" onClick={onPrint} disabled={!qrSvg} title="Druckansicht öffnen">
          {qrSvg ? <span dangerouslySetInnerHTML={{ __html: qrSvg }} /> : "QR-Code wird erstellt..."}
        </button>
        <div className="qr-dialog-actions">
          <button type="button" className="secondary-button" onClick={onDownloadPng} disabled={!qrSvg}>
            <Download size={16} aria-hidden="true" />
            PNG
          </button>
          <button type="button" className="secondary-button" onClick={onDownloadSvg} disabled={!qrSvg}>
            <Download size={16} aria-hidden="true" />
            SVG
          </button>
          <button type="button" className="primary-button" onClick={onPrint} disabled={!qrSvg}>
            <Printer size={16} aria-hidden="true" />
            Drucken
          </button>
        </div>
      </section>
    </div>
  );
}

function ImagePreviewDialog({
  image,
  onClose
}: {
  image: PendingArticleImage;
  onClose: () => void;
}) {
  return (
    <div className="confirm-layer image-preview-layer" role="dialog" aria-modal="true" aria-label="Bildvorschau">
      <section className="image-preview-dialog">
        <div className="panel-head form-head">
          <div>
            <h2>Bildvorschau</h2>
            <p className="image-preview-source">
              {image.title || "Artikeldaten-Bild"} - {sourceDisplayName(image.source)}
              <a className="icon-button image-title-link" href={image.source} target="_blank" rel="noreferrer" aria-label="Quelle öffnen" title="Quelle öffnen">
                <ExternalLink size={15} />
              </a>
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Schließen" title="Schließen">
            <X size={17} />
          </button>
        </div>
        <img src={image.url} alt="" />
      </section>
    </div>
  );
}

type BarcodeSearchDialogProps = {
  value: string;
  onValueChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function BarcodeSearchDialog({ value, onValueChange, onClose, onSubmit }: BarcodeSearchDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div className="confirm-layer barcode-search-layer" role="dialog" aria-modal="true" aria-label="Strichcode suchen">
      <form className="barcode-search-dialog" onSubmit={onSubmit}>
        <header className="panel-head form-head">
          <div>
            <h2>Strichcode suchen</h2>
            <p>Scanner-App oder Tastatur-Scanner nutzen, Code einfügen und als EAN suchen.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Schließen" title="Schließen">
            <X size={17} />
          </button>
        </header>

        <label className="barcode-input-label">
          Barcode / EAN
          <span className="barcode-input-shell">
            <Barcode size={20} aria-hidden="true" />
            <input
              ref={inputRef}
              value={value}
              onChange={(event) => onValueChange(event.target.value)}
              inputMode="numeric"
              autoComplete="off"
              placeholder="Scanner-Code"
            />
          </span>
        </label>

        <p className="barcode-hint">
          Der Code wird als EAN-Nr. im Modell eingetragen. Artikelnummern bleiben unverändert.
        </p>

        <footer className="barcode-search-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" className="primary-button">
            <PackageSearch size={15} aria-hidden="true" />
            Artikeldaten suchen
          </button>
        </footer>
      </form>
    </div>
  );
}

export function VehiclesView() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [form, setForm] = useState<CreateVehicleRequest>(emptyVehicle);
  const [options, setOptions] = useState<MasterDataOptions>(emptyOptions);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [mode, setMode] = useState<ModalMode>("create");
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ModalTab>("model");
  const [openSections, setOpenSections] = useState({
    model: true,
    details: false
  });
  const [deleteCandidate, setDeleteCandidate] = useState<Vehicle | null>(null);
  const [articleSearchOpen, setArticleSearchOpen] = useState(false);
  const [articleSearchLoading, setArticleSearchLoading] = useState(false);
  const [articleSearchResponse, setArticleSearchResponse] = useState<ArticleSearchResponse | null>(null);
  const [articleSearchError, setArticleSearchError] = useState("");
  const [barcodeSearchOpen, setBarcodeSearchOpen] = useState(false);
  const [barcodeSearchValue, setBarcodeSearchValue] = useState("");
  const [selectedArticleFields, setSelectedArticleFields] = useState<Record<string, boolean>>({});
  const [selectedArticleImages, setSelectedArticleImages] = useState<Record<string, boolean>>({});
  const [pendingArticleImages, setPendingArticleImages] = useState<PendingArticleImage[]>([]);
  const [previewImage, setPreviewImage] = useState<PendingArticleImage | null>(null);
  const [attachmentEdits, setAttachmentEdits] = useState<AttachmentEditState>({});
  const [imageUploadMaintenanceID, setImageUploadMaintenanceID] = useState("");
  const [attachmentUploadCategory, setAttachmentUploadCategory] = useState("");
  const [attachmentUploadDescription, setAttachmentUploadDescription] = useState("");
  const [attachmentUploadMaintenanceID, setAttachmentUploadMaintenanceID] = useState("");
  const [attachmentDragActive, setAttachmentDragActive] = useState(false);
  const [maintenanceForm, setMaintenanceForm] = useState<VehicleMaintenanceInput>(emptyMaintenanceForm);
  const [editingMaintenanceID, setEditingMaintenanceID] = useState<string | null>(null);
  const [functionEdits, setFunctionEdits] = useState<FunctionEditState>({});
  const [showConfiguredFunctionsOnly, setShowConfiguredFunctionsOnly] = useState(false);
  const [cvForm, setCVForm] = useState<VehicleCVValueInput>(emptyCVForm);
  const [editingCVID, setEditingCVID] = useState<string | null>(null);
  const [cvFileProfile, setCVFileProfile] = useState("");
  const [cvFileDescription, setCVFileDescription] = useState("");
  const [cvImportPreview, setCVImportPreview] = useState<CVImportPreview | null>(null);
  const [cvFileUploadPreview, setCVFileUploadPreview] = useState<CVFileUploadPreview | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const cvFileInputRef = useRef<HTMLInputElement | null>(null);
  const cvImportInputRef = useRef<HTMLInputElement | null>(null);
  const functionImportInputRef = useRef<HTMLInputElement | null>(null);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrSvg, setQrSvg] = useState("");
  const [qrError, setQrError] = useState("");
  const [inventoryView, setInventoryView] = useState<InventoryViewMode>(inventoryViewMode);
  const [quickMenuVehicleID, setQuickMenuVehicleID] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: "inventoryNumber",
    direction: "asc"
  });

  const load = useCallback(() => {
    setLoading(true);
    setMessage("");
    api
      .vehicles(query)
      .then(setVehicles)
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setLoading(false));
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const reloadVisible = () => {
      if (!document.hidden) {
        load();
      }
    };

    window.addEventListener("focus", reloadVisible);
    window.addEventListener("online", reloadVisible);
    document.addEventListener("visibilitychange", reloadVisible);

    return () => {
      window.removeEventListener("focus", reloadVisible);
      window.removeEventListener("online", reloadVisible);
      document.removeEventListener("visibilitychange", reloadVisible);
    };
  }, [load]);

  useEffect(() => {
    Promise.all([
      api.masterDataAll(true),
      api.masterDataRelations("vehicle_category", "vehicle_gattung")
    ])
      .then(([entriesByType, categoryRelations]) => {
        setOptions({
          manufacturers: entriesByType.manufacturer || [],
          gauges: entriesByType.gauge || [],
          epochs: entriesByType.epoch || [],
          railwayCompanies: entriesByType.railway_company || [],
          categories: entriesByType.vehicle_category || [],
          gattungen: entriesByType.vehicle_gattung || [],
          symbols: entriesByType.symbols || [],
          categoryRelations
        });
      })
      .catch((error: Error) => setMessage(error.message));
  }, []);

  const sortedVehicles = useMemo(() => {
    return [...vehicles].sort((left, right) => {
      const result = valueForSort(left, sort.key).localeCompare(valueForSort(right, sort.key), "de-DE", {
        numeric: true,
        sensitivity: "base"
      });
      return sort.direction === "asc" ? result : -result;
    });
  }, [vehicles, sort]);

  const maintenanceReminders = useMemo<MaintenanceReminder[]>(() => {
    return vehicles
      .flatMap((vehicle) =>
        (vehicle.maintenance || []).flatMap((entry) => {
          const daysUntilDue = maintenanceDaysUntilDue(entry);
          if (daysUntilDue === null || daysUntilDue > 14) return [];
          return [{ vehicle, entry, daysUntilDue }];
        })
      )
      .sort((left, right) => left.daysUntilDue - right.daysUntilDue || left.vehicle.inventoryNumber.localeCompare(right.vehicle.inventoryNumber, "de-DE"));
  }, [vehicles]);

  const maintenanceReminderSummary = {
    due: maintenanceReminders.filter((item) => item.daysUntilDue <= 0).length,
    upcoming: maintenanceReminders.filter((item) => item.daysUntilDue > 0).length
  };
  const nextMaintenanceReminder = maintenanceReminders[0];
  const inventorySummary = useMemo(() => {
    const categories = new Set(vehicles.map((vehicle) => vehicle.category).filter(Boolean));
    const digital = vehicles.filter((vehicle) => vehicle.digital).length;
    const withImages = vehicles.filter((vehicle) => (vehicle.images || []).length > 0).length;
    return {
      categories: categories.size,
      digital,
      analog: vehicles.length - digital,
      withImages
    };
  }, [vehicles]);

  const filteredGattungen = useMemo(() => {
    const categoryKey = options.categories.find((entry) => optionValue(entry) === form.category)?.key;
    if (!categoryKey) {
      return options.gattungen;
    }
    const allowed = new Set(
      options.categoryRelations
        .filter((relation) => relation.parentKey === categoryKey)
        .map((relation) => relation.childKey)
    );
    return options.gattungen.filter((entry) => allowed.has(entry.key));
  }, [form.category, options]);

  const readonly = mode === "view";

  const update = (patch: Partial<CreateVehicleRequest>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const setSelectedDetail = (detail: Vehicle) => {
    setSelected(detail);
    setForm(vehicleToForm(detail));
    setPendingArticleImages(vehicleImagesToPending(detail));
    setAttachmentEdits(attachmentsToEditState(detail.attachments));
    setFunctionEdits(functionsToEditState(detail.functions));
    setEditingMaintenanceID(null);
    setMaintenanceForm(emptyMaintenanceForm);
    setEditingCVID(null);
    setCVForm(emptyCVForm);
    setCVImportPreview(null);
    setCVFileUploadPreview(null);
  };

  const updateCategory = (category: string) => {
    const categoryKey = options.categories.find((entry) => optionValue(entry) === category)?.key;
    const allowed = new Set(
      options.categoryRelations
        .filter((relation) => relation.parentKey === categoryKey)
        .map((relation) => relation.childKey)
    );
    const currentGattung = options.gattungen.find((entry) => optionValue(entry) === form.gattung);
    update({
      category,
      gattung: currentGattung && allowed.has(currentGattung.key) ? form.gattung : ""
    });
  };

  const updateCouplingFront = (couplingFront: string) => {
    update({
      couplingFront,
      couplingRear: form.couplingSame ? couplingFront : form.couplingRear
    });
  };

  const updateCouplingSame = (couplingSame: boolean) => {
    update({
      couplingSame,
      couplingRear: couplingSame ? form.couplingFront : form.couplingRear
    });
  };

  const runArticleSearch = (searchForm = form, searchInput?: ArticleSearchInput) => {
    if (!articleSearchEnabled()) {
      setArticleSearchError("Die Artikeldaten-Websuche ist in den Einstellungen deaktiviert.");
      setArticleSearchOpen(true);
      setArticleSearchResponse(null);
      return;
    }

    setArticleSearchOpen(true);
    setArticleSearchLoading(true);
    setArticleSearchError("");
    setArticleSearchResponse(null);
    setSelectedArticleFields({});
    setSelectedArticleImages({});

    api
      .articleSearch(searchInput ?? {
        manufacturer: searchForm.manufacturer,
        articleNumber: searchForm.articleNumber,
        name: searchForm.name,
        gauge: searchForm.gauge,
        fields: vehicleFieldsForSearch(searchForm)
      })
      .then((response) => {
        const sanitized = sanitizeArticleSearchResponse(response);
        setArticleSearchResponse(sanitized);
        const initialSelection: Record<string, boolean> = {};
        sanitized.results.forEach((result, index) => {
          Object.keys(result.fields).filter(isArticleFieldKey).forEach((key) => {
            initialSelection[articleSelectionKey(result, key, index)] = !currentArticleValue(searchForm, key);
          });
        });
        setSelectedArticleFields(initialSelection);
      })
      .catch((error: Error) => setArticleSearchError(error.message))
      .finally(() => setArticleSearchLoading(false));
  };

  const openBarcodeSearch = () => {
    setBarcodeSearchValue(form.ean || "");
    setBarcodeSearchOpen(true);
  };

  const submitBarcodeSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = barcodeSearchValue.trim();
    if (!code) {
      setMessage("Bitte einen Barcode oder eine EAN eingeben.");
      return;
    }
    const nextForm = { ...form, ean: code };
    setForm(nextForm);
    setBarcodeSearchOpen(false);
    runArticleSearch(nextForm, {
      fields: {
        ean: code
      }
    });
  };

  const toggleArticleField = (result: ArticleSearchResult, index: number, key: string, checked: boolean) => {
    setSelectedArticleFields((current) => ({ ...current, [articleSelectionKey(result, key, index)]: checked }));
  };

  const toggleArticleImage = (result: ArticleSearchResult, index: number, image: ArticleSearchImage, checked: boolean) => {
    setSelectedArticleImages((current) => ({ ...current, [imageSelectionKey(result, image, index)]: checked }));
  };

  const setArticleFieldSelection = (modeName: "empty" | "all" | "none") => {
    if (!articleSearchResponse) return;
    const next: Record<string, boolean> = {};
    articleSearchResponse.results.forEach((result, index) => {
      Object.keys(result.fields).filter(isArticleFieldKey).forEach((key) => {
        const selectionKey = articleSelectionKey(result, key, index);
        next[selectionKey] = modeName === "all" || (modeName === "empty" && !currentArticleValue(form, key));
      });
    });
    setSelectedArticleFields(next);
  };

  const applyArticleResult = (result: ArticleSearchResult) => {
    const patch: Partial<CreateVehicleRequest> = {};
    const foundResultIndex = articleSearchResponse?.results.findIndex((entry) => entry.url === result.url) ?? 0;
    const resultIndex = foundResultIndex >= 0 ? foundResultIndex : 0;
    Object.entries(result.fields).forEach(([key, field]) => {
      if (!isArticleFieldKey(key) || !selectedArticleFields[articleSelectionKey(result, key, resultIndex)]) return;
      if (isBadArticleValue(key, field.value)) return;
      Object.assign(patch, { [key]: articleValueForForm(key, field.value) });
    });
    const selectedImages = (result.images || [])
      .filter((image) => selectedArticleImages[imageSelectionKey(result, image, resultIndex)])
      .map((image, imageIndex) => ({ ...image, id: `${result.url}-${image.url}`, isPrimary: pendingArticleImages.length === 0 && imageIndex === 0 }));
    if (selectedImages.length > 0) {
      setPendingArticleImages((current) => {
        const existing = new Set(current.map((image) => image.url));
        const next = [...current, ...selectedImages.filter((image) => !existing.has(image.url))];
        if (!next.some((image) => image.isPrimary) && next.length > 0) {
          next[0] = { ...next[0], isPrimary: true };
        }
        return next;
      });
    }
    update(patch);
    setArticleSearchOpen(false);
  };

  const setPrimaryPendingImage = (id: string) => {
    setPendingArticleImages((current) => current.map((image) => ({ ...image, isPrimary: image.id === id })));
  };

  const updatePendingImageTitle = (id: string, title: string) => {
    setPendingArticleImages((current) => current.map((image) => (image.id === id ? { ...image, title } : image)));
  };

  const updatePendingImageMaintenance = (id: string, maintenanceId: string) => {
    setPendingArticleImages((current) => current.map((image) => (image.id === id ? { ...image, maintenanceId } : image)));
  };

  const movePendingImage = (id: string, direction: -1 | 1) => {
    setPendingArticleImages((current) => {
      const index = current.findIndex((image) => image.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const removePendingImage = (image: PendingArticleImage) => {
    if (image.maintenanceId) {
      setMessage("Bild ist mit einer Wartung verknüpft. Bitte zuerst die Verknüpfung entfernen und speichern.");
      return;
    }
    const removeFromState = () => {
      setPendingArticleImages((current) => {
        const next = current.filter((entry) => entry.id !== image.id);
        if (next.length > 0 && !next.some((entry) => entry.isPrimary)) {
          next[0] = { ...next[0], isPrimary: true };
        }
        return next;
      });
    };

    if (selected && image.persisted) {
      setSaving(true);
      api
        .deleteVehicleImage(selected.id, image.id)
        .then(() => {
          removeFromState();
          refreshSelectedVehicle(selected.id);
        })
        .catch((error: Error) => setMessage(error.message))
        .finally(() => setSaving(false));
      return;
    }
    removeFromState();
  };

  const refreshSelectedVehicle = (vehicleID = selected?.id) => {
    if (!vehicleID) return;
    api
      .vehicle(vehicleID)
      .then((detail) => {
        setSelectedDetail(detail);
        load();
      })
      .catch((error: Error) => setMessage(error.message));
  };

  const uploadImages = (files: FileList | null) => {
    if (!selected || !files || files.length === 0) return;
    const uploadFiles = Array.from(files);
    const invalid = uploadFiles.find((file) => !isAllowedImageFile(file));
    if (invalid) {
      setMessage(`${invalid.name} ist kein erlaubtes Bildformat.`);
      if (imageInputRef.current) {
        imageInputRef.current.value = "";
      }
      return;
    }
    setSaving(true);
    setMessage("");
    (async () => {
      for (const file of uploadFiles) {
        const image = await api.uploadVehicleImage(selected.id, file, file.name, pendingArticleImages.length === 0, imageUploadMaintenanceID);
        setPendingArticleImages((current) => {
          const next = [...current, uploadedImageToPending(image)];
          if (!next.some((entry) => entry.isPrimary) && next.length > 0) {
            next[0] = { ...next[0], isPrimary: true };
          }
          return next;
        });
      }
    })()
      .then(() => refreshSelectedVehicle(selected.id))
      .then(() => {
        setCVFileProfile("");
        setCVFileDescription("");
      })
      .catch((error: Error) => setMessage(error.message))
      .finally(() => {
        setSaving(false);
        if (imageInputRef.current) {
          imageInputRef.current.value = "";
        }
      });
  };

  const uploadAttachment = (files: FileList | null) => {
    if (!selected || !files || files.length === 0) return;
    const uploadFiles = Array.from(files);
    const blocked = uploadFiles.find(isBlockedAttachmentFile);
    if (blocked) {
      setMessage(`${blocked.name} ist als Beilage nicht erlaubt. Erlaubt sind PDF, TXT, CSV, JSON, XML, ZIP sowie JPG, PNG und WebP.`);
      if (attachmentInputRef.current) {
        attachmentInputRef.current.value = "";
      }
      return;
    }
    setSaving(true);
    setMessage("");
    (async () => {
      for (const file of uploadFiles) {
        await api.uploadVehicleAttachment(
          selected.id,
          file,
          attachmentUploadCategory || attachmentCategoryForFile(file),
          attachmentUploadDescription,
          attachmentUploadMaintenanceID
        );
      }
    })()
      .then(() => refreshSelectedVehicle(selected.id))
      .catch((error: Error) => setMessage(error.message))
      .finally(() => {
        setSaving(false);
        if (attachmentInputRef.current) {
          attachmentInputRef.current.value = "";
        }
      });
  };

  const onAttachmentDrag = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (readonly || !selected || saving) return;
    setAttachmentDragActive(event.type === "dragenter" || event.type === "dragover");
  };

  const onAttachmentDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setAttachmentDragActive(false);
    if (readonly || !selected || saving) return;
    uploadAttachment(event.dataTransfer.files);
  };

  const updateAttachmentEdit = (attachmentID: string, patch: Partial<{ description: string; category: string; maintenanceId: string }>) => {
    setAttachmentEdits((current) => ({
      ...current,
      [attachmentID]: {
        description: current[attachmentID]?.description || "",
        category: current[attachmentID]?.category || "",
        maintenanceId: current[attachmentID]?.maintenanceId || "",
        ...patch
      }
    }));
  };

  const saveAttachment = (attachment: VehicleAttachment) => {
    if (!selected) return;
    const edit = attachmentEdits[attachment.id] || { description: "", category: "", maintenanceId: "" };
    setSaving(true);
    api
      .updateVehicleAttachment(selected.id, attachment.id, edit)
      .then(() => refreshSelectedVehicle(selected.id))
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setSaving(false));
  };

  const deleteAttachment = (attachment: VehicleAttachment) => {
    if (!selected) return;
    setSaving(true);
    api
      .deleteVehicleAttachment(selected.id, attachment.id)
      .then(() => refreshSelectedVehicle(selected.id))
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setSaving(false));
  };

  const updateMaintenanceForm = (patch: Partial<VehicleMaintenanceInput>) => {
    setMaintenanceForm((current) => ({ ...current, ...patch }));
  };

  const resetMaintenanceForm = () => {
    setMaintenanceForm(emptyMaintenanceForm);
    setEditingMaintenanceID(null);
  };

  const editMaintenance = (entry: VehicleMaintenance) => {
    setMaintenanceForm({
      kind: entry.kind || "Wartung",
      status: entry.status || "geplant",
      conditionRating: entry.conditionRating || "",
      dueDate: entry.dueDate || "",
      completedAt: entry.completedAt || "",
      cost: entry.cost || "",
      notes: entry.notes || ""
    });
    setEditingMaintenanceID(entry.id);
  };

  const saveMaintenance = () => {
    if (!selected) return;
    setSaving(true);
    setMessage("");
    const payload: VehicleMaintenanceInput = {
      ...maintenanceForm,
      status: maintenanceForm.status === "fällig" ? "faellig" : maintenanceForm.status,
      cost: maintenanceForm.cost?.trim().replace(/\s*€$/, "") || "",
      completedAt: maintenanceForm.status === "erledigt" && !maintenanceForm.completedAt ? todayISODate() : maintenanceForm.completedAt
    };
    const action = editingMaintenanceID
      ? api.updateVehicleMaintenance(selected.id, editingMaintenanceID, payload)
      : api.createVehicleMaintenance(selected.id, payload);
    action
      .then(() => refreshSelectedVehicle(selected.id))
      .then(() => resetMaintenanceForm())
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setSaving(false));
  };

  const completeMaintenance = (entry: VehicleMaintenance) => {
    if (!selected) return;
    setSaving(true);
    setMessage("");
    api
      .updateVehicleMaintenance(selected.id, entry.id, {
        kind: entry.kind,
        status: "erledigt",
        conditionRating: entry.conditionRating || "",
        dueDate: entry.dueDate || "",
        completedAt: entry.completedAt || todayISODate(),
        cost: entry.cost || "",
        notes: entry.notes || ""
      })
      .then(() => refreshSelectedVehicle(selected.id))
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setSaving(false));
  };

  const deleteMaintenance = (entry: VehicleMaintenance) => {
    if (!selected) return;
    setSaving(true);
    setMessage("");
    api
      .deleteVehicleMaintenance(selected.id, entry.id)
      .then(() => refreshSelectedVehicle(selected.id))
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setSaving(false));
  };

  const functionEdit = (functionKey: string) => functionEdits[functionKey] || emptyFunctionEdit(functionKey);

  const updateFunctionEdit = (functionKey: string, patch: Partial<VehicleFunctionInput>) => {
    setFunctionEdits((current) => ({
      ...current,
      [functionKey]: {
        ...emptyFunctionEdit(functionKey),
        ...current[functionKey],
        ...patch
      }
    }));
  };

  const saveFunction = (functionKey: string) => {
    if (!selected) return;
    const edit = functionEdit(functionKey);
    if (!edit.persisted && !edit.name?.trim() && !edit.symbolKey && !edit.notes?.trim()) {
      setMessage(`${functionKey}: Bitte Funktionsname, Symbol oder Notiz eintragen.`);
      return;
    }
    setSaving(true);
    setMessage("");
    api
      .updateVehicleFunction(selected.id, functionKey, {
        name: edit.name || "",
        symbolKey: edit.symbolKey || "",
        functionType: edit.functionType || "standard",
        mode: edit.mode || "dauer",
        directionDependent: Boolean(edit.directionDependent),
        notes: edit.notes || ""
      })
      .then(() => refreshSelectedVehicle(selected.id))
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setSaving(false));
  };

  const deleteFunction = (functionKey: string) => {
    if (!selected) return;
    setSaving(true);
    setMessage("");
    api
      .deleteVehicleFunction(selected.id, functionKey)
      .then(() => refreshSelectedVehicle(selected.id))
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setSaving(false));
  };

  const exportFunctions = () => {
    if (!selected) return;
    const functionMappings = configuredFunctionKeys.map((functionKey) => {
      const edit = functionEdit(functionKey);
      return {
        functionKey,
        name: edit.name || "",
        symbolKey: edit.symbolKey || "",
        functionType: edit.functionType || "standard",
        mode: edit.mode || "dauer",
        directionDependent: Boolean(edit.directionDependent),
        notes: edit.notes || ""
      };
    });
    const payload = {
      vehicle: {
        inventoryNumber: selected.inventoryNumber,
        name: selected.name,
        decoder: form.digitalDecoderNumber || form.dtDecoderNumber || ""
      },
      functions: functionMappings
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selected.inventoryNumber || "railkeeper"}-funktionen.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importFunctions = (files: FileList | null) => {
    if (!selected || !files || files.length === 0) return;
    const [file] = Array.from(files);
    setSaving(true);
    setMessage("");
    file
      .text()
      .then(functionMappingsFromImport)
      .then(async (rows) => {
        const valid = rows.filter(isValidFunctionMapping);
        if (valid.length === 0) {
          throw new Error("Keine gültigen Funktionszuordnungen gefunden.");
        }
        for (const row of valid) {
          await api.updateVehicleFunction(selected.id, row.functionKey, {
            name: row.name || "",
            symbolKey: row.symbolKey || "",
            functionType: row.functionType || "standard",
            mode: row.mode || "dauer",
            directionDependent: Boolean(row.directionDependent),
            notes: row.notes || ""
          });
        }
      })
      .then(() => refreshSelectedVehicle(selected.id))
      .catch((error: Error) => setMessage(error.message))
      .finally(() => {
        setSaving(false);
        if (functionImportInputRef.current) {
          functionImportInputRef.current.value = "";
        }
      });
  };

  const updateCVForm = (patch: Partial<VehicleCVValueInput>) => {
    setCVForm((current) => ({ ...current, ...patch }));
  };

  const resetCVForm = () => {
    setCVForm(emptyCVForm);
    setEditingCVID(null);
  };

  const editCVValue = (value: VehicleCVValue) => {
    setCVForm({
      cvNumber: value.cvNumber,
      value: value.value,
      description: value.description || "",
      category: value.category || "",
      decoderProfile: value.decoderProfile || "",
      sourceFileId: value.sourceFileId || ""
    });
    setEditingCVID(value.id);
  };

  const saveCVValue = () => {
    if (!selected) return;
    const payload = {
      ...cvForm,
      cvNumber: Number(cvForm.cvNumber),
      value: Number(cvForm.value)
    };
    if (!isValidCVValueInput(payload)) {
      setMessage("CV-Nummer muss 1-1024 und Wert 0-255 sein.");
      return;
    }
    setSaving(true);
    setMessage("");
    const existing = !editingCVID
      ? (selected.cvValues || []).find((entry) => cvValueKey(entry) === cvValueKey(payload))
      : undefined;
    const action = editingCVID
      ? api.updateVehicleCVValue(selected.id, editingCVID, payload)
      : existing
        ? api.updateVehicleCVValue(selected.id, existing.id, payload)
        : api.createVehicleCVValue(selected.id, payload);
    action
      .then(() => refreshSelectedVehicle(selected.id))
      .then(() => resetCVForm())
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setSaving(false));
  };

  const deleteCVValue = (value: VehicleCVValue) => {
    if (!selected) return;
    setSaving(true);
    setMessage("");
    api
      .deleteVehicleCVValue(selected.id, value.id)
      .then(() => refreshSelectedVehicle(selected.id))
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setSaving(false));
  };

  const exportCVValues = () => {
    if (!selected) return;
    const payload = {
      vehicle: {
        inventoryNumber: selected.inventoryNumber,
        name: selected.name,
        decoder: form.digitalDecoderNumber || form.dtDecoderNumber || ""
      },
      cvValues: selected.cvValues || []
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selected.inventoryNumber || "railkeeper"}-cv.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importCVValues = (files: FileList | null) => {
    if (!selected || !files || files.length === 0) return;
    const [file] = Array.from(files);
    setSaving(true);
    setMessage("");
    file
      .text()
      .then(cvValuesFromImport)
      .then((values) => {
        const preview = buildCVImportPreview(file.name, values, selected.cvValues || []);
        if (!preview.rows.some((row) => row.status !== "invalid")) {
          throw new Error("Keine gültigen CV-Werte gefunden.");
        }
        setCVImportPreview(preview);
      })
      .catch((error: Error) => setMessage(error.message))
      .finally(() => {
        setSaving(false);
        if (cvImportInputRef.current) {
          cvImportInputRef.current.value = "";
        }
      });
  };

  const toggleCVImportRow = (id: string, selectedRow: boolean) => {
    setCVImportPreview((current) => current ? {
      ...current,
      rows: current.rows.map((row) => row.id === id ? { ...row, selected: selectedRow } : row)
    } : current);
  };

  const selectCVImportRows = (modeName: "all" | "none" | "empty") => {
    setCVImportPreview((current) => current ? {
      ...current,
      rows: current.rows.map((row) => ({
        ...row,
        selected: row.status !== "invalid" && (
          modeName === "all" ||
          (modeName === "empty" && row.status === "new")
        )
      }))
    } : current);
  };

  const applyCVImportPreview = () => {
    if (!selected || !cvImportPreview) return;
    const rows = cvImportPreview.rows.filter((row) => row.selected && row.status !== "invalid");
    if (rows.length === 0) {
      setMessage("Keine CV-Werte für den Import ausgewählt.");
      return;
    }
    setSaving(true);
    setMessage("");
    (async () => {
      for (const row of rows) {
        if (row.existing) {
          await api.updateVehicleCVValue(selected.id, row.existing.id, row.input);
        } else {
          await api.createVehicleCVValue(selected.id, row.input);
        }
      }
    })()
      .then(() => refreshSelectedVehicle(selected.id))
      .then(() => {
        setCVImportPreview(null);
        setMessage(`${rows.length} CV-Wert${rows.length === 1 ? "" : "e"} übernommen.`);
      })
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setSaving(false));
  };

  const uploadCVFiles = (files: FileList | null) => {
    if (!selected || !files || files.length === 0) return;
    const uploadFiles = Array.from(files);
    const blocked = uploadFiles.find(isBlockedCVFile);
    if (blocked) {
      setMessage(`${blocked.name} ist als CV-Datei nicht erlaubt. Erlaubt sind JSON, CSV, TXT, XML, Z21, ESU, ESUX, LokProgrammer und ZIP.`);
      return;
    }
    setSaving(true);
    setMessage("");
    Promise.all(uploadFiles.map((file) => api.previewVehicleCVFile(file)))
      .then((previews) => {
        setCVFileUploadPreview({ files: uploadFiles, previews });
      })
      .catch((error: Error) => setMessage(error.message))
      .finally(() => {
        setSaving(false);
        if (cvFileInputRef.current) {
          cvFileInputRef.current.value = "";
        }
      });
  };

  const applyFirstCVFileSuggestion = () => {
    const suggestion = cvFileUploadPreview?.previews.find((preview) => preview.hasMetadata);
    if (!suggestion) return;
    if (suggestion.suggestedDecoderProfile) {
      setCVFileProfile(suggestion.suggestedDecoderProfile);
    }
    if (suggestion.suggestedDescription) {
      setCVFileDescription(suggestion.suggestedDescription);
    }
  };

  const confirmCVFileUpload = () => {
    if (!selected || !cvFileUploadPreview) return;
    const uploadFiles = cvFileUploadPreview.files;
    setSaving(true);
    setMessage("");
    (async () => {
      for (const file of uploadFiles) {
        await api.uploadVehicleCVFile(selected.id, file, cvFileProfile, cvFileDescription);
      }
    })()
      .then(() => refreshSelectedVehicle(selected.id))
      .then(() => {
        setCVFileUploadPreview(null);
        setMessage(`${uploadFiles.length} CV-Datei${uploadFiles.length === 1 ? "" : "en"} gespeichert.`);
      })
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setSaving(false));
  };

  const deleteCVFile = (file: VehicleCVFile) => {
    if (!selected) return;
    setSaving(true);
    setMessage("");
    api
      .deleteVehicleCVFile(selected.id, file.id)
      .then(() => refreshSelectedVehicle(selected.id))
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setSaving(false));
  };

  const generateQr = async () => {
    setQrDialogOpen(true);
    setQrError("");
    try {
      const svg = await QRCode.toString(qrPayload(selected, form), {
        type: "svg",
        width: 256,
        margin: 2,
        color: {
          dark: "#0b1e26",
          light: "#ffffff"
        }
      });
      setQrSvg(composeBrandedQrSvg(svg));
    } catch (error) {
      setQrError(error instanceof Error ? error.message : "QR-Code konnte nicht erstellt werden.");
    }
  };

  const downloadQrSvg = () => {
    if (!qrSvg) return;
    const blob = new Blob([qrSvg], { type: "image/svg+xml" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${form.inventoryNumber || "railkeeper"}-qr.svg`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const downloadQrPng = async () => {
    const dataURL = await QRCode.toDataURL(qrPayload(selected, form), {
      width: 768,
      margin: 2,
      color: {
        dark: "#0b1e26",
        light: "#ffffff"
      }
    });
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 768;
    const context = canvas.getContext("2d");
    if (!context) return;
    const qrImage = new window.Image();
    const logoImage = new window.Image();
    await new Promise<void>((resolve, reject) => {
      qrImage.onload = () => resolve();
      qrImage.onerror = () => reject(new Error("QR-Code konnte nicht geladen werden."));
      qrImage.src = dataURL;
    });
    context.drawImage(qrImage, 0, 0);
    await new Promise<void>((resolve) => {
      logoImage.onload = () => resolve();
      logoImage.onerror = () => resolve();
      logoImage.src = "/brand/railkeeper-mark.png";
    });
    context.fillStyle = "#fff";
    context.roundRect(333, 333, 102, 102, 20);
    context.fill();
    if (logoImage.complete) {
      context.drawImage(logoImage, 345, 345, 78, 78);
    }
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `${form.inventoryNumber || "railkeeper"}-qr.png`;
    link.click();
  };

  const printQr = () => {
    if (!qrSvg) return;
    const printWindow = window.open("", "railkeeper-qr-print", "width=520,height=680");
    if (!printWindow) {
      setQrError("Druckfenster konnte nicht geöffnet werden.");
      return;
    }
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>RailKeeper QR-Code</title>
          <style>
            body { font-family: system-ui, sans-serif; margin: 24px; color: #0b1e26; }
            .label { width: 62mm; min-height: 38mm; border: 1px solid #d7e1dc; padding: 5mm; display: grid; grid-template-columns: 26mm 1fr; gap: 4mm; align-items: center; }
            svg { width: 26mm; height: 26mm; }
            strong { display: block; font-size: 12pt; }
            span { display: block; font-size: 9pt; margin-top: 2mm; }
            @media print { body { margin: 0; } .label { border: 0; } }
          </style>
        </head>
        <body>
          <div class="label">
            ${qrSvg}
            <div>
              <strong>${form.inventoryNumber || ""}</strong>
              <span>${form.name || ""}</span>
              <span>${form.digitalDecoderNumber || form.dtDecoderNumber || ""}</span>
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const printInventoryReport = (reportMode: InventoryReportMode) => {
    if (sortedVehicles.length === 0) {
      setMessage("Es gibt keine Fahrzeuge für den PDF-Report.");
      return;
    }
    const printWindow = window.open("", `railkeeper-inventory-${reportMode}`, "width=1180,height=860");
    if (!printWindow) {
      setMessage("Druckfenster konnte nicht geöffnet werden.");
      return;
    }
    printWindow.document.write(inventoryReportHtml(sortedVehicles, query, sort, reportMode));
    printWindow.document.close();
    printWindow.focus();
  };

  const toggleSort = (key: SortKey) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
    }));
  };

  const setInventoryViewMode = (modeName: InventoryViewMode) => {
    setInventoryView(modeName);
    window.localStorage.setItem(inventoryViewSettingKey, modeName);
  };

  const openCreate = () => {
    setSelected(null);
    setMode("create");
    setForm(emptyVehicle);
    setPendingArticleImages([]);
    setAttachmentEdits({});
    setImageUploadMaintenanceID("");
    setAttachmentUploadCategory("");
    setAttachmentUploadDescription("");
    setAttachmentUploadMaintenanceID("");
    setAttachmentDragActive(false);
    setFunctionEdits({});
    resetMaintenanceForm();
    resetCVForm();
    setCVImportPreview(null);
    setCVFileUploadPreview(null);
    setActiveTab("model");
    setOpenSections({ model: true, details: false });
    setModalOpen(true);
    setMessage("");
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelected(null);
    setMode("create");
    setForm(emptyVehicle);
    setPendingArticleImages([]);
    setAttachmentEdits({});
    setImageUploadMaintenanceID("");
    setAttachmentUploadCategory("");
    setAttachmentUploadDescription("");
    setAttachmentUploadMaintenanceID("");
    setAttachmentDragActive(false);
    setFunctionEdits({});
    resetMaintenanceForm();
    resetCVForm();
    setCVImportPreview(null);
    setCVFileUploadPreview(null);
    setPreviewImage(null);
    setMessage("");
  };

  const openDetail = (vehicle: Vehicle, tab: ModalTab = "model") => {
    api
      .vehicle(vehicle.id)
      .then((detail) => {
        setSelectedDetail(detail);
        setMode("view");
        setActiveTab(tab);
        setOpenSections({ model: true, details: false });
        setModalOpen(true);
        setMessage("");
      })
      .catch((error: Error) => setMessage(error.message));
  };

  const openEdit = (vehicle: Vehicle) => {
    api
      .vehicle(vehicle.id)
      .then((detail) => {
        setSelectedDetail(detail);
        setMode("edit");
        setActiveTab("model");
        setOpenSections({ model: true, details: false });
        setModalOpen(true);
        setMessage("");
      })
      .catch((error: Error) => setMessage(error.message));
  };

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const images = pendingArticleImages.map((image, index) => ({
      id: image.persisted ? image.id : undefined,
      url: image.url,
      title: image.title,
      sourceUrl: image.source,
      maintenanceId: image.maintenanceId || "",
      isPrimary: Boolean(image.isPrimary),
      sortOrder: index
    }));
    const payload = { ...form, images };
    const action = mode === "edit" && selected
      ? api.updateVehicle(selected.id, payload)
      : api.createVehicle(payload);

    action
      .then((vehicle) => {
        setSelectedDetail(vehicle);
        setMode("view");
        load();
        if (mode === "create") {
          closeModal();
        }
      })
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setSaving(false));
  };

  const confirmDelete = () => {
    if (!deleteCandidate) return;

    api
      .deleteVehicle(deleteCandidate.id)
      .then(() => {
        if (selected?.id === deleteCandidate.id) {
          closeModal();
        }
        setDeleteCandidate(null);
        load();
      })
      .catch((error: Error) => setMessage(error.message));
  };

  const sortHeader = (key: SortKey) => (
    <button
      type="button"
      className={`sort-button ${sort.key === key ? "active" : ""}`}
      onClick={() => toggleSort(key)}
      title={`${sortLabels[key]} sortieren`}
    >
      {sortLabels[key]}
      {sort.key === key
        ? sort.direction === "asc"
          ? <ChevronUp size={14} />
          : <ChevronDown size={14} />
        : <ArrowUpDown size={13} />}
    </button>
  );

  const vehicleQuickMenu = (vehicle: Vehicle) => (
    <div className="quick-menu-wrap">
      <button
        type="button"
        className={quickMenuVehicleID === vehicle.id ? "icon-button active" : "icon-button"}
        onClick={() => setQuickMenuVehicleID((current) => current === vehicle.id ? "" : vehicle.id)}
        aria-label="Kurzmenü"
        title="Kurzmenü"
      >
        <MoreVertical size={16} />
      </button>
      {quickMenuVehicleID === vehicle.id && (
        <div className="quick-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => { setQuickMenuVehicleID(""); openDetail(vehicle); }}>Anzeigen</button>
          <button type="button" role="menuitem" onClick={() => { setQuickMenuVehicleID(""); openEdit(vehicle); }}>Bearbeiten</button>
          <button type="button" role="menuitem" onClick={() => { setQuickMenuVehicleID(""); openDetail(vehicle, "uploads"); }}>Uploads</button>
          <button type="button" role="menuitem" onClick={() => { setQuickMenuVehicleID(""); openDetail(vehicle, "maintenance"); }}>Wartung</button>
          <button type="button" role="menuitem" className="danger" onClick={() => { setQuickMenuVehicleID(""); setDeleteCandidate(vehicle); }}>Löschen</button>
        </div>
      )}
    </div>
  );

  const selectOptions = (items: MasterDataEntry[], emptyLabel = "Keine Auswahl") => (
    <>
      <option value="">{emptyLabel}</option>
      {items.map((entry) => (
        <option key={entry.key} value={optionValue(entry)}>
          {entry.label}
        </option>
      ))}
    </>
  );

  const maintenanceEntries = selected?.maintenance || [];
  const maintenanceSummary = {
    due: maintenanceEntries.filter(maintenanceIsDue).length,
    planned: maintenanceEntries.filter((entry) => entry.status !== "erledigt").length,
    done: maintenanceEntries.filter((entry) => entry.status === "erledigt").length
  };
  const configuredFunctionKeys = functionKeys.filter((functionKey) => {
    const edit = functionEdit(functionKey);
    return Boolean(edit.persisted || edit.name || edit.symbolKey || edit.notes);
  });
  const visibleFunctionKeys = showConfiguredFunctionsOnly ? configuredFunctionKeys : functionKeys;
  const functionSummary = {
    configured: configuredFunctionKeys.length,
    sound: configuredFunctionKeys.filter((functionKey) => functionEdit(functionKey).functionType === "sound").length,
    light: configuredFunctionKeys.filter((functionKey) => functionEdit(functionKey).functionType === "licht").length
  };
  const cvSummary = {
    values: selected?.cvValues?.length || 0,
    files: selected?.cvFiles?.length || 0,
    profiles: new Set([
      ...(selected?.cvValues || []).map((value) => value.decoderProfile).filter((profile): profile is string => Boolean(profile)),
      ...(selected?.cvFiles || []).map((file) => file.decoderProfile).filter((profile): profile is string => Boolean(profile))
    ]).size
  };
  const cvImportStats = {
    selected: cvImportPreview?.rows.filter((row) => row.selected && row.status !== "invalid").length || 0,
    new: cvImportPreview?.rows.filter((row) => row.status === "new").length || 0,
    changed: cvImportPreview?.rows.filter((row) => row.status === "changed").length || 0,
    same: cvImportPreview?.rows.filter((row) => row.status === "same").length || 0,
    invalid: cvImportPreview?.rows.filter((row) => row.status === "invalid").length || 0
  };
  const storedDecoderProfiles = Array.from(new Set([
    ...(selected?.cvValues || []).map((value) => value.decoderProfile).filter((profile): profile is string => Boolean(profile)),
    ...(selected?.cvFiles || []).map((file) => file.decoderProfile).filter((profile): profile is string => Boolean(profile))
  ])).sort((a, b) => a.localeCompare(b, "de-DE"));
  const decoderProfileOptions = Array.from(new Set([...commonDecoderProfiles, ...storedDecoderProfiles]));

  return (
    <>
      <section className="inventory-head">
        <div>
          <h1>Bestand</h1>
          <p>Fahrzeuge verwalten</p>
        </div>
        <button type="button" className="primary-button new-vehicle-button" onClick={openCreate}>
          <Plus size={16} aria-hidden="true" />
          Neues Fahrzeug
        </button>
      </section>

      <section className="inventory-status-row" aria-label="Bestandsstatus">
        <article className="inventory-status-card">
          <span><PackageSearch size={16} aria-hidden="true" /></span>
          <small>Gesamtbestand</small>
          <strong>{vehicles.length}</strong>
          <em>{inventorySummary.categories} Kategorien</em>
        </article>
        <article className="inventory-status-card">
          <span><Gauge size={16} aria-hidden="true" /></span>
          <small>Digitalisierung</small>
          <strong>{vehicles.length ? Math.round((inventorySummary.digital / vehicles.length) * 100) : 0}%</strong>
          <em>{inventorySummary.digital} digital · {inventorySummary.analog} analog</em>
        </article>
        <article className={maintenanceReminderSummary.due > 0 ? "inventory-status-card attention" : "inventory-status-card"}>
          <span>{maintenanceReminderSummary.due > 0 ? <AlertTriangle size={16} aria-hidden="true" /> : <Wrench size={16} aria-hidden="true" />}</span>
          <small>Wartung</small>
          <strong>{maintenanceReminderSummary.due}</strong>
          <em>{maintenanceReminderSummary.upcoming} geplant</em>
        </article>
        <article className="inventory-status-card wide">
          <span><Wrench size={16} aria-hidden="true" /></span>
          <small>Nächster Termin</small>
          {nextMaintenanceReminder ? (
            <button type="button" onClick={() => openDetail(nextMaintenanceReminder.vehicle, "maintenance")}>
              <strong>{nextMaintenanceReminder.vehicle.inventoryNumber}</strong>
              <em>{nextMaintenanceReminder.entry.kind} · {maintenanceReminderText(nextMaintenanceReminder.daysUntilDue)} · {formatDate(nextMaintenanceReminder.entry.dueDate)}</em>
            </button>
          ) : (
            <>
              <strong>Alles ruhig</strong>
              <em>Keine fälligen Wartungen in den nächsten 14 Tagen</em>
            </>
          )}
        </article>
        <article className="inventory-status-card">
          <span><Image size={16} aria-hidden="true" /></span>
          <small>Bildpflege</small>
          <strong>{vehicles.length ? Math.round((inventorySummary.withImages / vehicles.length) * 100) : 0}%</strong>
          <em>{inventorySummary.withImages} mit Bild</em>
        </article>
      </section>

      <section className="panel inventory-panel">
        <div className="panel-head inventory-list-head">
          <div className="inventory-title-line">
            <div>
              <h2>Fahrzeuge</h2>
              <p>{sortedVehicles.length} von {vehicles.length} Fahrzeugen</p>
            </div>
          </div>
          <div className="inventory-toolbar" aria-label="Bestandswerkzeuge">
            <label className="search-field inventory-search">
              <span>
                <Search size={16} aria-hidden="true" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Inventarnummer, Hersteller, Artikel oder Bezeichnung"
                  aria-label="Bestand durchsuchen"
                />
              </span>
            </label>
            <div className="table-actions inventory-toolbar-actions">
              <span className="inventory-view-tools" aria-label="Ansicht wechseln">
                <button type="button" className={inventoryView === "table" ? "icon-button active" : "icon-button"} onClick={() => setInventoryViewMode("table")} aria-label="Tabellenansicht" title="Tabellenansicht">
                  <Table2 size={16} />
                </button>
                <button type="button" className={inventoryView === "cards" ? "icon-button active" : "icon-button"} onClick={() => setInventoryViewMode("cards")} aria-label="Kartenansicht" title="Kartenansicht">
                  <Grid2X2 size={16} />
                </button>
              </span>
              <button type="button" className="icon-button" onClick={() => printInventoryReport("summary")} aria-label="Kurzliste als PDF drucken" title="Kurzliste als PDF drucken" disabled={loading || vehicles.length === 0}>
                <Printer size={16} />
              </button>
              <button type="button" className="icon-button" onClick={() => printInventoryReport("details")} aria-label="Detailreport als PDF drucken" title="Detailreport als PDF drucken" disabled={loading || vehicles.length === 0}>
                <FileText size={16} />
              </button>
              <button type="button" className="icon-button" onClick={load} aria-label="Aktualisieren" title="Aktualisieren" disabled={loading}>
                <RefreshCw size={16} />
              </button>
            </div>
          </div>
        </div>

        {message && <p className="form-message">{message}</p>}

        {!loading && vehicles.length > 0 && (
          <div className="inventory-mobile-list" aria-label="Kompakte Fahrzeugliste">
            {sortedVehicles.map((vehicle) => {
              const image = primaryImage(vehicle.images);
              return (
                <article key={vehicle.id} className="inventory-mobile-item">
                  <button type="button" className="inventory-mobile-media" onClick={() => openDetail(vehicle)} aria-label={`${vehicle.inventoryNumber} anzeigen`}>
                    {image ? (
                      <img src={previewImageUrl(image)} alt="" />
                    ) : (
                      <div className="image-placeholder">Keine Vorschau</div>
                    )}
                  </button>
                  <button type="button" className="inventory-mobile-main" onClick={() => openDetail(vehicle)}>
                    <span>{vehicle.inventoryNumber}</span>
                    <strong>{vehicle.name}</strong>
                    <small>{vehicle.manufacturer || "-"} · {vehicle.articleNumber || "-"} · {vehicle.category || "-"}</small>
                  </button>
                  <div className="inventory-mobile-meta">
                    <span>{vehicle.gauge || "-"}</span>
                    <small>{vehicle.epoch || "-"}</small>
                  </div>
                  <div className="inventory-mobile-actions">
                    <button type="button" className="icon-button" onClick={() => openEdit(vehicle)} aria-label="Bearbeiten" title="Bearbeiten">
                      <Pencil size={16} />
                    </button>
                    <button type="button" className="icon-button danger" onClick={() => setDeleteCandidate(vehicle)} aria-label="Löschen" title="Löschen">
                      <Trash2 size={16} />
                    </button>
                    {vehicleQuickMenu(vehicle)}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {loading && vehicles.length === 0 ? (
          <p className="empty-state">Lade Fahrzeuge aus lokaler Datenbank...</p>
        ) : vehicles.length === 0 ? (
          <p className="empty-state">Noch keine Fahrzeuge vorhanden.</p>
        ) : (
          <div className="inventory-desktop-content">
            {inventoryView === "cards" ? (
          <div className="inventory-card-grid">
            {sortedVehicles.map((vehicle) => {
              const image = primaryImage(vehicle.images);
              return (
                <article key={vehicle.id} className="inventory-card">
                  <button type="button" className="inventory-card-media" onClick={() => openDetail(vehicle)} aria-label={`${vehicle.inventoryNumber} anzeigen`}>
                    {image ? (
                      <img src={previewImageUrl(image)} alt="" />
                    ) : (
                      <div className="image-placeholder">Keine Vorschau</div>
                    )}
                  </button>
                  <div className="inventory-card-body">
                    <div className="inventory-card-title">
                      <div>
                        <strong>{vehicle.inventoryNumber}</strong>
                        <span>{vehicle.manufacturer || "-"}</span>
                      </div>
                      <span className="inventory-card-gauge">{vehicle.gauge || "-"}</span>
                    </div>
                    <h3>{vehicle.name}</h3>
                    <dl>
                      <div>
                        <dt>Artikel</dt>
                        <dd>{vehicle.articleNumber || "-"}</dd>
                      </div>
                      <div>
                        <dt>Epoche</dt>
                        <dd>{vehicle.epoch || "-"}</dd>
                      </div>
                      <div>
                        <dt>Kategorie</dt>
                        <dd>{vehicle.category || "-"}</dd>
                      </div>
                    </dl>
                    <div className="inventory-card-actions">
                      <button type="button" className="icon-button" onClick={() => openDetail(vehicle)} aria-label="Anzeigen" title="Anzeigen">
                        <Eye size={16} />
                      </button>
                      <button type="button" className="icon-button" onClick={() => openEdit(vehicle)} aria-label="Bearbeiten" title="Bearbeiten">
                        <Pencil size={16} />
                      </button>
                      <button type="button" className="icon-button danger" onClick={() => setDeleteCandidate(vehicle)} aria-label="Löschen" title="Löschen">
                        <Trash2 size={16} />
                      </button>
                      {vehicleQuickMenu(vehicle)}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Bild</th>
                  <th>{sortHeader("inventoryNumber")}</th>
                  <th>{sortHeader("manufacturer")}</th>
                  <th>{sortHeader("articleNumber")}</th>
                  <th>{sortHeader("name")}</th>
                  <th>{sortHeader("gauge")}</th>
                  <th>{sortHeader("epoch")}</th>
                  <th>{sortHeader("category")}</th>
                  <th className="actions-cell">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {sortedVehicles.map((vehicle) => (
                  <tr key={vehicle.id}>
                    <td>
                      {primaryImage(vehicle.images) ? (
                        <img className="inventory-thumb" src={previewImageUrl(primaryImage(vehicle.images))} alt="" />
                      ) : (
                        <div className="image-placeholder">Keine Vorschau</div>
                      )}
                    </td>
                    <td>{vehicle.inventoryNumber}</td>
                    <td>{vehicle.manufacturer}</td>
                    <td>{vehicle.articleNumber || "-"}</td>
                    <td>{vehicle.name}</td>
                    <td>{vehicle.gauge}</td>
                    <td>{vehicle.epoch || "-"}</td>
                    <td>{vehicle.category || "-"}</td>
                    <td className="actions-cell">
                      <div className="table-actions">
                        <button type="button" className="icon-button" onClick={() => openDetail(vehicle)} aria-label="Anzeigen" title="Anzeigen">
                          <Eye size={16} />
                        </button>
                        <button type="button" className="icon-button" onClick={() => openEdit(vehicle)} aria-label="Bearbeiten" title="Bearbeiten">
                          <Pencil size={16} />
                        </button>
                        <button type="button" className="icon-button danger" onClick={() => setDeleteCandidate(vehicle)} aria-label="Löschen" title="Löschen">
                          <Trash2 size={16} />
                        </button>
                        {vehicleQuickMenu(vehicle)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            )}
          </div>
        )}
      </section>

      {modalOpen && (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-label="Fahrzeugdaten bearbeiten">
          <form className="vehicle-modal" onSubmit={submit}>
            <header className="modal-head">
              <h2>{mode === "create" ? "Fahrzeugdaten erfassen" : mode === "edit" ? "Fahrzeugdaten bearbeiten" : "Fahrzeugdaten"}</h2>
              <button type="button" className="icon-button" onClick={closeModal} aria-label="Schließen" title="Schließen">
                <X size={18} />
              </button>
            </header>

            <nav className="modal-tabs" aria-label="Fahrzeugbereiche">
              <button type="button" className={activeTab === "model" ? "active" : ""} onClick={() => setActiveTab("model")}>
                Modell
              </button>
              <button type="button" className={activeTab === "control" ? "active" : ""} onClick={() => setActiveTab("control")}>
                Steuerung
              </button>
              <button type="button" className={activeTab === "cv" ? "active" : ""} onClick={() => setActiveTab("cv")}>
                CV
              </button>
              <button type="button" className={activeTab === "uploads" ? "active" : ""} onClick={() => setActiveTab("uploads")}>
                Uploads
              </button>
              <button type="button" className={activeTab === "maintenance" ? "active" : ""} onClick={() => setActiveTab("maintenance")}>
                Wartung
              </button>
            </nav>

            <div className="modal-body">
              {activeTab === "model" && (
                <div className="accordion-stack">
                  <section className="accordion-section">
                    <button type="button" className="accordion-trigger" onClick={() => toggleSection("model")}>
                      {openSections.model ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      Modell
                    </button>
                    {openSections.model && (
                      <div className="accordion-content vehicle-form">
                        <div className="article-search-box">
                          <div>
                            <strong>Artikelsuche</strong>
                            <span>Nach Hersteller, Artikel-Nr., Bezeichnung und Detaildaten suchen</span>
                          </div>
                          <div className="article-search-actions">
                            <button type="button" className="secondary-button" onClick={openBarcodeSearch} disabled={readonly || articleSearchLoading} title="Strichcode oder EAN suchen">
                              <Barcode size={15} aria-hidden="true" />
                              Strichcode suchen
                            </button>
                            <button type="button" className="secondary-button" onClick={() => runArticleSearch()} disabled={readonly || articleSearchLoading}>
                              <PackageSearch size={15} aria-hidden="true" />
                              {articleSearchLoading ? "Sucht..." : "Artikeldaten suchen"}
                            </button>
                          </div>
                        </div>

                        {form.articleSourceUrl && (
                          <p className="source-note compact-source-note">
                            <ExternalLink size={15} aria-hidden="true" />
                            <span>
                              Quelle: <a href={form.articleSourceUrl} target="_blank" rel="noreferrer">{sourceDisplayName(form.articleSourceUrl)}</a>
                            </span>
                          </p>
                        )}

                        <div className="form-row">
                          <label>
                            Inventar-Nr.
                            <input value={form.inventoryNumber || ""} onChange={(event) => update({ inventoryNumber: event.target.value })} disabled={readonly} placeholder="wird automatisch vergeben" />
                          </label>
                          <label>
                            Artikel-Nr.
                            <input value={form.articleNumber || ""} onChange={(event) => update({ articleNumber: event.target.value })} disabled={readonly} />
                          </label>
                        </div>

                        <div className="form-row">
                          <label>
                            Hersteller *
                            <select value={form.manufacturer} onChange={(event) => update({ manufacturer: event.target.value })} disabled={readonly} required>
                              {selectOptions(options.manufacturers, "Bitte wählen")}
                            </select>
                          </label>
                          <label>
                            Spurweite *
                            <select value={form.gauge} onChange={(event) => update({ gauge: event.target.value })} disabled={readonly} required>
                              {selectOptions(options.gauges, "Bitte wählen")}
                            </select>
                          </label>
                        </div>

                        <label>
                          Bezeichnung *
                          <input value={form.name} onChange={(event) => update({ name: event.target.value })} disabled={readonly} required />
                        </label>

                        <div className="form-row">
                          <label>
                            Bahngesellschaft
                            <select value={form.railwayCompany || ""} onChange={(event) => update({ railwayCompany: event.target.value })} disabled={readonly}>
                              {selectOptions(options.railwayCompanies)}
                            </select>
                          </label>
                          <label>
                            Epoche
                            <select value={form.epoch || ""} onChange={(event) => update({ epoch: event.target.value })} disabled={readonly}>
                              {selectOptions(options.epochs)}
                            </select>
                          </label>
                        </div>

                        <div className="form-row">
                          <label>
                            Kategorie
                            <select value={form.category || ""} onChange={(event) => updateCategory(event.target.value)} disabled={readonly}>
                              {selectOptions(options.categories)}
                            </select>
                          </label>
                          <label>
                            Gattung
                            <select value={form.gattung || ""} onChange={(event) => update({ gattung: event.target.value })} disabled={readonly || filteredGattungen.length === 0}>
                              {selectOptions(filteredGattungen)}
                            </select>
                          </label>
                        </div>

                        <label>
                          Beschreibung
                          <textarea value={form.description || ""} onChange={(event) => update({ description: event.target.value })} disabled={readonly} rows={4} />
                        </label>

                        <div className="form-row">
                          <label>
                            Baureihe
                            <input value={form.series || ""} onChange={(event) => update({ series: event.target.value })} disabled={readonly} />
                          </label>
                          <label>
                            Fahrzeug-Nr.
                            <input value={form.vehicleNumber || ""} onChange={(event) => update({ vehicleNumber: event.target.value })} disabled={readonly} />
                          </label>
                        </div>

                        <div className="form-row decoder-row">
                          <label>
                            Digital / Decoder-Nr.
                            <span className="inline-switch-input">
                              <span className="switch-field" aria-label="Digital">
                                <input type="checkbox" checked={Boolean(form.digital)} onChange={(event) => update({ digital: event.target.checked })} disabled={readonly} />
                                <span />
                              </span>
                              <input value={form.digitalDecoderNumber || ""} onChange={(event) => update({ digitalDecoderNumber: event.target.value })} disabled={readonly || !form.digital} />
                            </span>
                          </label>
                          <label>
                            DT / Decoder-Nr.
                            <span className="inline-switch-input">
                              <span className="switch-field" aria-label="DT Decoder">
                                <input type="checkbox" checked={Boolean(form.dtDecoder)} onChange={(event) => update({ dtDecoder: event.target.checked })} disabled={readonly} />
                                <span />
                              </span>
                              <input value={form.dtDecoderNumber || ""} onChange={(event) => update({ dtDecoderNumber: event.target.value })} disabled={readonly || !form.dtDecoder} />
                            </span>
                          </label>
                        </div>

                        <div className="form-row compact-switch-row">
                          <label className="switch-label">
                            Messe tauglich
                            <span className="switch-field">
                              <input type="checkbox" checked={Boolean(form.exhibitionReady)} onChange={(event) => update({ exhibitionReady: event.target.checked })} disabled={readonly} />
                              <span />
                            </span>
                          </label>
                          <label className="switch-label">
                            ABC-Bremsen
                            <span className="switch-field">
                              <input type="checkbox" checked={Boolean(form.abcBrakes)} onChange={(event) => update({ abcBrakes: event.target.checked })} disabled={readonly} />
                              <span />
                            </span>
                          </label>
                        </div>

                        <div className="form-row three-columns">
                          <label>
                            EAN-Nr.
                            <input value={form.ean || ""} onChange={(event) => update({ ean: event.target.value })} disabled={readonly} />
                          </label>
                          <label>
                            Produktionszeit
                            <input value={form.productionPeriod || ""} onChange={(event) => update({ productionPeriod: event.target.value })} disabled={readonly} placeholder="TT. MM. JJJJ" />
                          </label>
                          <label>
                            Listenpreis
                            <input value={form.listPrice || ""} onChange={(event) => update({ listPrice: event.target.value })} disabled={readonly} inputMode="decimal" />
                          </label>
                        </div>
                      </div>
                    )}
                  </section>

                  <section className="accordion-section">
                    <button type="button" className="accordion-trigger" onClick={() => toggleSection("details")}>
                      {openSections.details ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      Fahrzeug Details
                    </button>
                    {openSections.details && (
                      <div className="accordion-content vehicle-form">
                        <VehicleDetailsFields
                          form={form}
                          readonly={readonly}
                          onOpenQr={generateQr}
                          update={update}
                          updateCouplingFront={updateCouplingFront}
                          updateCouplingSame={updateCouplingSame}
                        />
                      </div>
                    )}
                  </section>

                </div>
              )}

              {activeTab === "control" && (
                <section className="functions-tab">
                  <div className="upload-head">
                    <div>
                      <h3>Digitalfunktionen</h3>
                      <p>Funktionstasten F0 bis F31 mit Symbol, Typ, Betriebsart und Richtungsabhängigkeit pflegen.</p>
                    </div>
                    <div className="cv-toolbar">
                      <input
                        ref={functionImportInputRef}
                        type="file"
                        accept="application/json,.json"
                        className="visually-hidden"
                        onChange={(event) => importFunctions(event.target.files)}
                        disabled={readonly || !selected || saving}
                      />
                      <button type="button" className="secondary-button" onClick={() => functionImportInputRef.current?.click()} disabled={readonly || !selected || saving}>
                        <Upload size={15} aria-hidden="true" />
                        Import
                      </button>
                      <button type="button" className="secondary-button" onClick={exportFunctions} disabled={!selected || configuredFunctionKeys.length === 0}>
                        <Download size={15} aria-hidden="true" />
                        Export
                      </button>
                    </div>
                  </div>
                  {!selected && <p className="empty-state compact">Digitalfunktionen können nach dem ersten Speichern gepflegt werden.</p>}
                  {selected && (
                    <div className="function-list">
                      <div className="function-toolbar">
                        <div className="function-summary">
                          <span><strong>{functionSummary.configured}</strong> belegt</span>
                          <span><strong>{functionSummary.sound}</strong> Sound</span>
                          <span><strong>{functionSummary.light}</strong> Licht</span>
                        </div>
                        <label className="switch-label compact-switch">
                          <span>Nur belegte</span>
                          <span className="switch-field">
                            <input
                              type="checkbox"
                              checked={showConfiguredFunctionsOnly}
                              onChange={(event) => setShowConfiguredFunctionsOnly(event.target.checked)}
                              disabled={saving}
                            />
                            <span />
                          </span>
                        </label>
                      </div>
                      {visibleFunctionKeys.length === 0 && (
                        <p className="empty-state compact">Noch keine Digitalfunktionen belegt.</p>
                      )}
                      {visibleFunctionKeys.map((functionKey) => {
                        const edit = functionEdit(functionKey);
                        return (
                          <article key={functionKey} className={edit.persisted ? "function-row persisted" : "function-row"}>
                            <strong className="function-key">
                              {functionSymbolIcon(edit.symbolKey, edit.functionType)}
                              {functionKey}
                            </strong>
                            <input
                              value={edit.name || ""}
                              onChange={(event) => updateFunctionEdit(functionKey, { name: event.target.value })}
                              disabled={readonly || saving}
                              placeholder="Funktionsname"
                              aria-label={`${functionKey} Funktionsname`}
                            />
                            <FunctionSymbolPicker
                              value={edit.symbolKey || ""}
                              functionType={edit.functionType}
                              symbols={options.symbols}
                              disabled={readonly || saving}
                              label={`${functionKey} Symbol`}
                              onChange={(symbolKey) => updateFunctionEdit(functionKey, { symbolKey })}
                            />
                            <select
                              value={edit.functionType || "standard"}
                              onChange={(event) => updateFunctionEdit(functionKey, { functionType: event.target.value })}
                              disabled={readonly || saving}
                              aria-label={`${functionKey} Typ`}
                            >
                              {functionTypes.map((type) => (
                                <option key={type} value={type}>{type}</option>
                              ))}
                            </select>
                            <select
                              value={edit.mode || "dauer"}
                              onChange={(event) => updateFunctionEdit(functionKey, { mode: event.target.value })}
                              disabled={readonly || saving}
                              aria-label={`${functionKey} Betriebsart`}
                            >
                              {functionModes.map((modeName) => (
                                <option key={modeName} value={modeName}>{modeName}</option>
                              ))}
                            </select>
                            <label className="switch-card function-direction">
                              <span>Richtung</span>
                              <span className="switch-field">
                                <input
                                  type="checkbox"
                                  checked={Boolean(edit.directionDependent)}
                                  onChange={(event) => updateFunctionEdit(functionKey, { directionDependent: event.target.checked })}
                                  disabled={readonly || saving}
                                />
                                <span />
                              </span>
                            </label>
                            <input
                              value={edit.notes || ""}
                              onChange={(event) => updateFunctionEdit(functionKey, { notes: event.target.value })}
                              disabled={readonly || saving}
                              placeholder="Notiz"
                              aria-label={`${functionKey} Notiz`}
                            />
                            <div className="function-actions">
                              <button type="button" className="icon-button" onClick={() => saveFunction(functionKey)} disabled={readonly || saving} aria-label={`${functionKey} speichern`} title="Speichern">
                                <Save size={15} />
                              </button>
                              <button type="button" className="icon-button danger" onClick={() => deleteFunction(functionKey)} disabled={readonly || saving || !edit.persisted} aria-label={`${functionKey} löschen`} title="Löschen">
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {activeTab === "cv" && (
                <section className="cv-tab">
                  <section className="cv-editor">
                    <div className="upload-head">
                      <div>
                        <h3>CV-Werte</h3>
                        <p>Decoder-CVs strukturiert erfassen, importieren und exportieren. Werte werden im Backend validiert.</p>
                      </div>
                      <div className="cv-toolbar">
                        <input
                          ref={cvImportInputRef}
                          type="file"
                          accept=".json,.csv,.txt"
                          className="visually-hidden"
                          onChange={(event) => importCVValues(event.target.files)}
                          disabled={readonly || !selected || saving}
                        />
                        <button type="button" className="secondary-button" onClick={() => cvImportInputRef.current?.click()} disabled={readonly || !selected || saving}>
                          <Upload size={15} aria-hidden="true" />
                          Import
                        </button>
                        <button type="button" className="secondary-button" onClick={exportCVValues} disabled={!selected || !(selected.cvValues || []).length}>
                          <Download size={15} aria-hidden="true" />
                          Export
                        </button>
                      </div>
                    </div>
                    {!selected && <p className="empty-state compact">CV-Werte können nach dem ersten Speichern gepflegt werden.</p>}
                    {selected && (
                      <>
                        <div className="cv-summary">
                          <div>
                            <span>CV-Werte</span>
                            <strong>{cvSummary.values}</strong>
                          </div>
                          <div>
                            <span>Profile</span>
                            <strong>{cvSummary.profiles}</strong>
                          </div>
                          <div>
                            <span>Dateien</span>
                            <strong>{cvSummary.files}</strong>
                          </div>
                        </div>
                        {cvImportPreview && (
                          <section className="cv-import-preview" aria-label="CV-Import Vorschau">
                            <div className="cv-import-head">
                              <div>
                                <h4>Import prüfen</h4>
                                <p>{cvImportPreview.fileName}</p>
                              </div>
                              <div className="cv-import-badges" aria-label="Import Zusammenfassung">
                                <span>{cvImportStats.new} neu</span>
                                <span>{cvImportStats.changed} geändert</span>
                                <span>{cvImportStats.same} gleich</span>
                                {cvImportStats.invalid > 0 && <span className="danger">{cvImportStats.invalid} ungültig</span>}
                              </div>
                            </div>
                            <div className="cv-import-actions">
                              <button type="button" className="secondary-button" onClick={() => selectCVImportRows("empty")} disabled={saving}>
                                Nur neue
                              </button>
                              <button type="button" className="secondary-button" onClick={() => selectCVImportRows("all")} disabled={saving}>
                                Alles auswählen
                              </button>
                              <button type="button" className="secondary-button" onClick={() => selectCVImportRows("none")} disabled={saving}>
                                Nichts auswählen
                              </button>
                              <button type="button" className="primary-button" onClick={applyCVImportPreview} disabled={saving || cvImportStats.selected === 0}>
                                <Check size={15} aria-hidden="true" />
                                Auswahl übernehmen
                              </button>
                              <button type="button" className="secondary-button" onClick={() => setCVImportPreview(null)} disabled={saving}>
                                Verwerfen
                              </button>
                            </div>
                            <div className="table-wrap compact-table cv-import-table">
                              <table>
                                <thead>
                                  <tr>
                                    <th>Übernehmen</th>
                                    <th>CV</th>
                                    <th>Aktuell</th>
                                    <th>Import</th>
                                    <th>Profil</th>
                                    <th>Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {cvImportPreview.rows.map((row) => (
                                    <tr key={row.id} className={`cv-import-${row.status}`}>
                                      <td>
                                        <input
                                          type="checkbox"
                                          checked={row.selected}
                                          onChange={(event) => toggleCVImportRow(row.id, event.target.checked)}
                                          disabled={row.status === "invalid" || saving}
                                          aria-label={`CV ${row.input.cvNumber} übernehmen`}
                                        />
                                      </td>
                                      <td>{row.input.cvNumber || "-"}</td>
                                      <td>{row.existing ? row.existing.value : "-"}</td>
                                      <td>{Number.isFinite(Number(row.input.value)) ? row.input.value : "-"}</td>
                                      <td>{row.input.decoderProfile || row.existing?.decoderProfile || "-"}</td>
                                      <td>{row.message}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </section>
                        )}
                        <datalist id="decoder-profile-options">
                          {decoderProfileOptions.map((profile) => (
                            <option key={profile} value={profile} />
                          ))}
                        </datalist>
                        {storedDecoderProfiles.length > 0 && (
                          <div className="decoder-profile-list" aria-label="Decoderprofile">
                            {storedDecoderProfiles.map((profile) => {
                              const valueCount = (selected.cvValues || []).filter((value) => value.decoderProfile === profile).length;
                              const fileCount = (selected.cvFiles || []).filter((file) => file.decoderProfile === profile).length;
                              return (
                                <button type="button" key={profile} onClick={() => updateCVForm({ decoderProfile: profile })} disabled={readonly || saving} title={`${profile} für neuen CV-Wert verwenden`}>
                                  <strong>{profile}</strong>
                                  <span>{valueCount} CV · {fileCount} Datei</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                        <div className="cv-form">
                          <label>
                            CV-Nr.
                            <input type="number" min={1} max={1024} value={cvForm.cvNumber} onChange={(event) => updateCVForm({ cvNumber: Number(event.target.value) })} disabled={readonly || saving} />
                          </label>
                          <label>
                            Wert
                            <input type="number" min={0} max={255} value={cvForm.value} onChange={(event) => updateCVForm({ value: Number(event.target.value) })} disabled={readonly || saving} />
                          </label>
                          <label>
                            Kategorie
                            <select value={cvForm.category || ""} onChange={(event) => updateCVForm({ category: event.target.value })} disabled={readonly || saving}>
                              <option value="">Kategorie</option>
                              {cvCategories.map((category) => (
                                <option key={category} value={category}>{category}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Decoder-Profil
                            <input list="decoder-profile-options" value={cvForm.decoderProfile || ""} onChange={(event) => updateCVForm({ decoderProfile: event.target.value })} disabled={readonly || saving} placeholder="z. B. ESU LokPilot 5" />
                          </label>
                          <label>
                            Quelldatei
                            <select value={cvForm.sourceFileId || ""} onChange={(event) => updateCVForm({ sourceFileId: event.target.value })} disabled={readonly || saving}>
                              <option value="">Ohne Datei</option>
                              {(selected.cvFiles || []).map((file) => (
                                <option key={file.id} value={file.id}>{file.originalName}</option>
                              ))}
                            </select>
                          </label>
                          <label className="cv-description">
                            Beschreibung
                            <input value={cvForm.description || ""} onChange={(event) => updateCVForm({ description: event.target.value })} disabled={readonly || saving} />
                          </label>
                        </div>
                        <div className="cv-actions">
                          {editingCVID && (
                            <button type="button" className="secondary-button" onClick={resetCVForm} disabled={readonly || saving}>
                              Abbrechen
                            </button>
                          )}
                          <button type="button" className="primary-button" onClick={saveCVValue} disabled={readonly || saving}>
                            <Save size={15} aria-hidden="true" />
                            {editingCVID ? "CV speichern" : "CV hinzufügen"}
                          </button>
                        </div>
                      </>
                    )}
                  </section>

                  <section className="cv-table-section">
                    {selected && (!selected.cvValues || selected.cvValues.length === 0) && (
                      <p className="empty-state compact">Noch keine CV-Werte hinterlegt.</p>
                    )}
                    {selected && selected.cvValues && selected.cvValues.length > 0 && (
                      <div className="table-wrap compact-table">
                        <table>
                          <thead>
                            <tr>
                              <th>CV</th>
                              <th>Wert</th>
                              <th>Kategorie</th>
                              <th>Decoder-Profil</th>
                              <th>Beschreibung</th>
                              <th>Aktionen</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selected.cvValues.map((value) => (
                              <Fragment key={value.id}>
                                <tr>
                                  <td>{value.cvNumber}</td>
                                  <td>{value.value}</td>
                                  <td>{value.category || "-"}</td>
                                  <td>{value.decoderProfile || "-"}</td>
                                  <td>{value.description || "-"}</td>
                                  <td>
                                    <div className="table-actions">
                                      <button type="button" className="icon-button" onClick={() => editCVValue(value)} disabled={readonly || saving} aria-label="CV bearbeiten" title="CV bearbeiten">
                                        <Pencil size={15} />
                                      </button>
                                      <button type="button" className="icon-button danger" onClick={() => deleteCVValue(value)} disabled={readonly || saving} aria-label="CV löschen" title="CV löschen">
                                        <Trash2 size={15} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                                {value.history && value.history.length > 0 && (
                                  <tr className="cv-history-row">
                                    <td colSpan={6}>
                                      <details>
                                        <summary>Historie: {value.history.length} Änderung{value.history.length === 1 ? "" : "en"}</summary>
                                        <div className="cv-history-list">
                                          {value.history.slice(0, 5).map((entry) => (
                                            <span key={entry.id}>
                                              {formatDateTime(entry.changedAt)}: {entry.oldValue} -&gt; {entry.newValue}
                                            </span>
                                          ))}
                                        </div>
                                      </details>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>

                  <section className="cv-files-section">
                    <div className="upload-head">
                      <div>
                        <h3>CV-Dateien</h3>
                        <p>Decoder-Dateien, Exporte oder Profile sicher am Fahrzeug speichern. ESU/LokProgrammer-Metadaten werden beim Upload übernommen.</p>
                      </div>
                      <input
                        ref={cvFileInputRef}
                        type="file"
                        multiple
                        accept={cvFileAccept}
                        className="visually-hidden"
                        onChange={(event) => uploadCVFiles(event.target.files)}
                        disabled={readonly || !selected || saving}
                      />
                      <button type="button" className="primary-button" onClick={() => cvFileInputRef.current?.click()} disabled={readonly || !selected || saving}>
                        <Upload size={16} aria-hidden="true" />
                        CV-Datei hochladen
                      </button>
                    </div>
                    {selected && (
                      <div className="cv-file-controls">
                        <input list="decoder-profile-options" value={cvFileProfile} onChange={(event) => setCVFileProfile(event.target.value)} disabled={readonly || saving} placeholder="Decoder-Profil für neue Dateien" />
                        <input value={cvFileDescription} onChange={(event) => setCVFileDescription(event.target.value)} disabled={readonly || saving} placeholder="Bemerkung für neue Dateien" />
                        <span>Leer lassen, um ESU/LokProgrammer-Metadaten automatisch zu verwenden.</span>
                      </div>
                    )}
                    {selected && cvFileUploadPreview && (
                      <section className="cv-file-preview">
                        <div className="upload-head compact">
                          <div>
                            <h3>Upload-Vorschau</h3>
                            <p>Metadaten prüfen und danach bewusst speichern.</p>
                          </div>
                          <div className="inline-actions">
                            <button type="button" className="secondary-button" onClick={applyFirstCVFileSuggestion} disabled={saving || !cvFileUploadPreview.previews.some((preview) => preview.hasMetadata)}>
                              Vorschlag übernehmen
                            </button>
                            <button type="button" className="primary-button" onClick={confirmCVFileUpload} disabled={saving || readonly}>
                              <Upload size={15} aria-hidden="true" />
                              Dateien speichern
                            </button>
                            <button type="button" className="secondary-button" onClick={() => setCVFileUploadPreview(null)} disabled={saving}>
                              Abbrechen
                            </button>
                          </div>
                        </div>
                        <div className="cv-file-preview-list">
                          {cvFileUploadPreview.previews.map((preview) => (
                            <article key={preview.fileName} className={preview.hasMetadata ? "" : "no-metadata"}>
                              <div>
                                <strong>{preview.fileName}</strong>
                                <span>{preview.mimeType || "Datei"} - {formatFileSize(preview.sizeBytes)}</span>
                              </div>
                              {preview.hasMetadata ? (
                                <dl>
                                  <div><dt>Projekt</dt><dd>{preview.projectName || "-"}</dd></div>
                                  <div><dt>Decoder</dt><dd>{preview.decoder || "-"}</dd></div>
                                  <div><dt>Adresse</dt><dd>{preview.address || "-"}</dd></div>
                                  <div><dt>Typ</dt><dd>{preview.type || "-"}</dd></div>
                                  <div><dt>Hersteller</dt><dd>{preview.manufacturer || "-"}</dd></div>
                                  <div><dt>LokProgrammer</dt><dd>{preview.lokProgrammer || "-"}</dd></div>
                                </dl>
                              ) : (
                                <p>Keine ESU/LokProgrammer-Metadaten gefunden. Die Datei kann trotzdem gespeichert werden.</p>
                              )}
                            </article>
                          ))}
                        </div>
                      </section>
                    )}
                    {selected && (!selected.cvFiles || selected.cvFiles.length === 0) && (
                      <p className="empty-state compact">Noch keine CV-Dateien hinterlegt.</p>
                    )}
                    {selected && selected.cvFiles && selected.cvFiles.length > 0 && (
                      <div className="attachment-list">
                        {selected.cvFiles.map((file) => {
                          const downloadUrl = api.vehicleCVFileDownloadUrl(selected.id, file.id);
                          return (
                            <article key={file.id} className="attachment-row">
                              <div className="attachment-icon">
                                <FileText size={18} aria-hidden="true" />
                                <span>{file.originalName.split(".").pop()?.toUpperCase() || "CV"}</span>
                              </div>
                              <div className="attachment-main">
                                <strong>{file.originalName}</strong>
                                <span>{file.decoderProfile || "Ohne Profil"} - {file.mimeType || "Datei"} - {formatFileSize(file.sizeBytes)}</span>
                                {file.description && <span>{file.description}</span>}
                              </div>
                              <div className="attachment-actions">
                                <a className="secondary-button" href={downloadUrl}>
                                  <Download size={15} aria-hidden="true" />
                                  Download
                                </a>
                                <button type="button" className="danger-button" onClick={() => deleteCVFile(file)} disabled={readonly || saving}>
                                  <Trash2 size={15} aria-hidden="true" />
                                  Löschen
                                </button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </section>
              )}

              {activeTab === "uploads" && (
                <section className="uploads-tab">
                  <section className="upload-section">
                    <div className="upload-head">
                      <div>
                        <h3>Bilder</h3>
                        <p>Hauptbild, Alternativbilder, Quellen und Beschreibungen direkt am Fahrzeug pflegen.</p>
                      </div>
                      <input
                        ref={imageInputRef}
                        type="file"
                        multiple
                        accept={imageAccept}
                        className="visually-hidden"
                        onChange={(event) => uploadImages(event.target.files)}
                        disabled={readonly || !selected}
                      />
                      {selected && maintenanceEntries.length > 0 && (
                        <select
                          className="upload-maintenance-select"
                          value={imageUploadMaintenanceID}
                          onChange={(event) => setImageUploadMaintenanceID(event.target.value)}
                          disabled={readonly || saving}
                          aria-label="Wartung für neue Bilder"
                        >
                          <option value="">Ohne Wartung</option>
                          {maintenanceEntries.map((entry) => (
                            <option key={entry.id} value={entry.id}>{maintenanceOptionLabel(entry)}</option>
                          ))}
                        </select>
                      )}
                      <button type="button" className="primary-button" onClick={() => imageInputRef.current?.click()} disabled={readonly || !selected || saving}>
                        <Upload size={16} aria-hidden="true" />
                        Bild hochladen
                      </button>
                    </div>
                    {!selected && <p className="empty-state compact">Lokale Bilder können nach dem ersten Speichern hochgeladen werden.</p>}
                    {pendingArticleImages.length === 0 ? (
                      <div className="upload-list">
                        <div className="image-placeholder large">
                          <Image size={22} aria-hidden="true" />
                          Keine Vorschau
                        </div>
                        <span>Kein Bild hinterlegt</span>
                      </div>
                    ) : (
                      <div className="pending-image-grid">
                        {pendingArticleImages.map((image, imageIndex) => (
                          <figure key={image.id} className={image.isPrimary ? "pending-image-card primary" : "pending-image-card"}>
                            <button type="button" className="image-preview-button" onClick={() => setPreviewImage(image)} title="Originalgröße anzeigen" aria-label="Originalgröße anzeigen">
                              <img src={image.url} alt="" />
                            </button>
                            <figcaption>
                              <input
                                value={image.title || ""}
                                onChange={(event) => updatePendingImageTitle(image.id, event.target.value)}
                                disabled={readonly}
                                placeholder="Bildbeschreibung"
                                aria-label="Bildbeschreibung"
                              />
                              <span>{sourceDisplayName(image.source)}</span>
                              {maintenanceEntries.length > 0 && (
                                <select
                                  className="image-maintenance-select"
                                  value={image.maintenanceId || ""}
                                  onChange={(event) => updatePendingImageMaintenance(image.id, event.target.value)}
                                  disabled={readonly || saving}
                                  aria-label="Bild mit Wartung verknuepfen"
                                >
                                  <option value="">Keine Wartung</option>
                                  {maintenanceEntries.map((entry) => (
                                    <option key={entry.id} value={entry.id}>{maintenanceOptionLabel(entry)}</option>
                                  ))}
                                </select>
                              )}
                              <div className="image-card-actions">
                                <a className="icon-button" href={image.source} target="_blank" rel="noreferrer" aria-label="Quelle öffnen" title="Quelle öffnen">
                                  <ExternalLink size={15} />
                                </a>
                                <button type="button" className="icon-button" onClick={() => movePendingImage(image.id, -1)} disabled={readonly || imageIndex === 0} aria-label="Bild nach oben" title="Bild nach oben">
                                  <ChevronUp size={15} />
                                </button>
                                <button type="button" className="icon-button" onClick={() => movePendingImage(image.id, 1)} disabled={readonly || imageIndex === pendingArticleImages.length - 1} aria-label="Bild nach unten" title="Bild nach unten">
                                  <ChevronDown size={15} />
                                </button>
                                <button type="button" className={image.isPrimary ? "icon-button active" : "icon-button"} onClick={() => setPrimaryPendingImage(image.id)} aria-label="Als Hauptbild markieren" title={image.isPrimary ? "Hauptbild" : "Als Hauptbild markieren"}>
                                  <Star size={15} />
                                </button>
                                <button
                                  type="button"
                                  className="icon-button danger"
                                  onClick={() => removePendingImage(image)}
                                  disabled={readonly || saving}
                                  aria-label="Bild entfernen"
                                  title="Bild entfernen"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </figcaption>
                          </figure>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="upload-section">
                    <div className="upload-head">
                      <div>
                        <h3>Beilagen</h3>
                        <p>PDFs, Anleitungen, Rechnungen und andere zugelassene Dateien direkt in der Erfassung pflegen.</p>
                      </div>
                      <input
                        ref={attachmentInputRef}
                        type="file"
                        multiple
                        accept={attachmentAccept}
                        className="visually-hidden"
                        onChange={(event) => uploadAttachment(event.target.files)}
                        disabled={readonly || !selected}
                      />
                      <button type="button" className="primary-button" onClick={() => attachmentInputRef.current?.click()} disabled={readonly || !selected || saving}>
                        <Upload size={16} aria-hidden="true" />
                        Beilage hochladen
                      </button>
                    </div>
                    <section
                      className={`attachment-upload-zone ${attachmentDragActive ? "active" : ""}`}
                      onDragEnter={onAttachmentDrag}
                      onDragOver={onAttachmentDrag}
                      onDragLeave={onAttachmentDrag}
                      onDrop={onAttachmentDrop}
                      aria-label="Beilagen per Drag and Drop hochladen"
                    >
                      <div>
                        <strong>Dateien hier ablegen</strong>
                        <span>PDF, TXT, CSV, JSON, XML, ZIP sowie JPG, PNG und WebP. Maximal 25 MB pro Datei.</span>
                      </div>
                      <div className="attachment-upload-fields">
                        <select value={attachmentUploadCategory} onChange={(event) => setAttachmentUploadCategory(event.target.value)} disabled={readonly || !selected || saving}>
                          <option value="">Kategorie automatisch</option>
                          {attachmentCategories.map((category) => (
                            <option key={category} value={category}>{category}</option>
                          ))}
                        </select>
                        <select value={attachmentUploadMaintenanceID} onChange={(event) => setAttachmentUploadMaintenanceID(event.target.value)} disabled={readonly || !selected || saving}>
                          <option value="">Keine Wartung</option>
                          {maintenanceEntries.map((entry) => (
                            <option key={entry.id} value={entry.id}>{maintenanceOptionLabel(entry)}</option>
                          ))}
                        </select>
                        <input
                          value={attachmentUploadDescription}
                          onChange={(event) => setAttachmentUploadDescription(event.target.value)}
                          disabled={readonly || !selected || saving}
                          placeholder="Bemerkung für neue Beilagen"
                        />
                      </div>
                    </section>
                    {!selected && <p className="empty-state compact">Beilagen können nach dem ersten Speichern hinzugefügt werden.</p>}
                    {selected && (!selected.attachments || selected.attachments.length === 0) && (
                      <p className="empty-state compact">Noch keine Beilagen hinterlegt.</p>
                    )}
                    {selected && selected.attachments && selected.attachments.length > 0 && (
                      <div className="attachment-list">
                        {selected.attachments.map((attachment) => {
                          const edit = attachmentEdits[attachment.id] || {
                            description: attachment.description || "",
                            category: attachment.category || "",
                            maintenanceId: attachment.maintenanceId || ""
                          };
                          const downloadUrl = api.vehicleAttachmentDownloadUrl(selected.id, attachment.id);
                          return (
                            <article key={attachment.id} className="attachment-row">
                              <div className="attachment-icon">
                                <FileText size={18} aria-hidden="true" />
                                <span>{attachment.originalName.split(".").pop()?.toUpperCase() || "DATEI"}</span>
                              </div>
                              <div className="attachment-main">
                                <strong>{attachment.originalName}</strong>
                                <span>{attachment.category || "Ohne Kategorie"} - {attachment.mimeType || "Datei"} - {formatFileSize(attachment.sizeBytes)}</span>
                                <div className="attachment-edit-row">
                                  <select value={edit.category} onChange={(event) => updateAttachmentEdit(attachment.id, { category: event.target.value })} disabled={readonly}>
                                    <option value="">Kategorie</option>
                                    {attachmentCategories.map((category) => (
                                      <option key={category} value={category}>{category}</option>
                                    ))}
                                  </select>
                                  <select value={edit.maintenanceId} onChange={(event) => updateAttachmentEdit(attachment.id, { maintenanceId: event.target.value })} disabled={readonly}>
                                    <option value="">Keine Wartung</option>
                                    {maintenanceEntries.map((entry) => (
                                      <option key={entry.id} value={entry.id}>{maintenanceOptionLabel(entry)}</option>
                                    ))}
                                  </select>
                                  <input value={edit.description} onChange={(event) => updateAttachmentEdit(attachment.id, { description: event.target.value })} disabled={readonly} placeholder="Bemerkung" />
                                </div>
                              </div>
                              <div className="attachment-actions">
                                <a className="secondary-button" href={downloadUrl}>
                                  <Download size={15} aria-hidden="true" />
                                  Download
                                </a>
                                {attachment.mimeType?.includes("pdf") && (
                                  <a className="icon-button" href={`${downloadUrl}?inline=true`} target="_blank" rel="noreferrer" aria-label="PDF öffnen" title="PDF öffnen">
                                    <ExternalLink size={15} />
                                  </a>
                                )}
                                <button type="button" className="secondary-button" onClick={() => saveAttachment(attachment)} disabled={readonly || saving}>
                                  <Save size={15} aria-hidden="true" />
                                  Speichern
                                </button>
                                <button type="button" className="danger-button" onClick={() => deleteAttachment(attachment)} disabled={readonly || saving}>
                                  <Trash2 size={15} aria-hidden="true" />
                                  Löschen
                                </button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </section>
              )}

              {activeTab === "maintenance" && (
                <section className="maintenance-tab">
                  <section className="maintenance-editor">
                    <div className="upload-head">
                      <div>
                        <h3>Wartung und Zustand</h3>
                        <p>Wartungen, Reparaturen, Umbauten, Fälligkeiten und Kosten am Fahrzeug dokumentieren.</p>
                      </div>
                      <Wrench size={22} aria-hidden="true" />
                    </div>
                    {!selected && <p className="empty-state compact">Wartungseinträge können nach dem ersten Speichern hinzugefügt werden.</p>}
                    {selected && (
                      <>
                        <div className="maintenance-summary">
                          <div>
                            <span>Fällig</span>
                            <strong>{maintenanceSummary.due}</strong>
                          </div>
                          <div>
                            <span>Geplant/offen</span>
                            <strong>{maintenanceSummary.planned}</strong>
                          </div>
                          <div>
                            <span>Erledigt</span>
                            <strong>{maintenanceSummary.done}</strong>
                          </div>
                        </div>
                        <div className="maintenance-form">
                          <label>
                            Art
                            <select value={maintenanceForm.kind} onChange={(event) => updateMaintenanceForm({ kind: event.target.value })} disabled={readonly || saving}>
                              {maintenanceKinds.map((kind) => (
                                <option key={kind} value={kind}>{kind}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Status
                            <select value={maintenanceForm.status} onChange={(event) => updateMaintenanceForm({ status: event.target.value })} disabled={readonly || saving}>
                              {maintenanceStatuses.map((status) => (
                                <option key={status.value} value={status.value}>{status.label}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Zustand
                            <select value={maintenanceForm.conditionRating || ""} onChange={(event) => updateMaintenanceForm({ conditionRating: event.target.value })} disabled={readonly || saving}>
                              <option value="">Bitte wählen</option>
                              {conditionRatings.map((rating) => (
                                <option key={rating} value={rating}>{rating}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Fällig am
                            <input type="date" value={maintenanceForm.dueDate || ""} onChange={(event) => updateMaintenanceForm({ dueDate: event.target.value })} disabled={readonly || saving} />
                          </label>
                          <label>
                            Durchgeführt am
                            <input type="date" value={maintenanceForm.completedAt || ""} onChange={(event) => updateMaintenanceForm({ completedAt: event.target.value })} disabled={readonly || saving} />
                          </label>
                          <label>
                            Kosten
                            <input value={maintenanceForm.cost || ""} onChange={(event) => updateMaintenanceForm({ cost: event.target.value })} disabled={readonly || saving} inputMode="decimal" placeholder="0,00" />
                          </label>
                          <label className="maintenance-notes">
                            Notizen
                            <textarea value={maintenanceForm.notes || ""} onChange={(event) => updateMaintenanceForm({ notes: event.target.value })} disabled={readonly || saving} rows={4} />
                          </label>
                        </div>
                        <div className="maintenance-actions">
                          {editingMaintenanceID && (
                            <button type="button" className="secondary-button" onClick={resetMaintenanceForm} disabled={readonly || saving}>
                              Abbrechen
                            </button>
                          )}
                          <button type="button" className="primary-button" onClick={saveMaintenance} disabled={readonly || saving}>
                            <Save size={15} aria-hidden="true" />
                            {editingMaintenanceID ? "Eintrag speichern" : "Eintrag hinzufügen"}
                          </button>
                        </div>
                      </>
                    )}
                  </section>

                  <section className="maintenance-list">
                    {selected && (!selected.maintenance || selected.maintenance.length === 0) && (
                      <p className="empty-state compact">Noch keine Wartungseinträge hinterlegt.</p>
                    )}
                    {selected?.maintenance?.map((entry) => {
                      const linkedImages = pendingArticleImages.filter((image) => image.maintenanceId === entry.id).length;
                      const linkedAttachments = (selected.attachments || []).filter((attachment) => attachment.maintenanceId === entry.id).length;
                      return (
                        <article key={entry.id} className={maintenanceIsDue(entry) ? "maintenance-card due" : "maintenance-card"}>
                        <div className="maintenance-card-head">
                          <div>
                            <strong>{entry.kind}</strong>
                            <span>{entry.notes || "Keine Notiz hinterlegt"}</span>
                          </div>
                          <span className={`maintenance-badge ${maintenanceStatusClass(entry.status)}`}>{maintenanceStatusLabel(entry.status)}</span>
                        </div>
                        <dl className="maintenance-meta">
                          <div>
                            <dt>Fällig</dt>
                            <dd>{formatDate(entry.dueDate)}</dd>
                          </div>
                          <div>
                            <dt>Durchgeführt</dt>
                            <dd>{formatDate(entry.completedAt)}</dd>
                          </div>
                          <div>
                            <dt>Zustand</dt>
                            <dd>{entry.conditionRating || "-"}</dd>
                          </div>
                          <div>
                            <dt>Kosten</dt>
                            <dd>{formatMaintenanceCost(entry.cost)}</dd>
                          </div>
                        </dl>
                        {(linkedImages > 0 || linkedAttachments > 0) && (
                          <div className="maintenance-linked-media" aria-label="Verknüpfte Medien">
                            {linkedImages > 0 && (
                              <span><Image size={14} aria-hidden="true" /> {linkedImages} Bilder</span>
                            )}
                            {linkedAttachments > 0 && (
                              <span><FileText size={14} aria-hidden="true" /> {linkedAttachments} Beilagen</span>
                            )}
                          </div>
                        )}
                        <div className="maintenance-card-actions">
                          {entry.status !== "erledigt" && (
                            <button type="button" className="secondary-button" onClick={() => completeMaintenance(entry)} disabled={readonly || saving}>
                              Erledigt
                            </button>
                          )}
                          <button type="button" className="icon-button" onClick={() => editMaintenance(entry)} disabled={readonly || saving} aria-label="Wartung bearbeiten" title="Wartung bearbeiten">
                            <Pencil size={15} />
                          </button>
                          <button type="button" className="icon-button danger" onClick={() => deleteMaintenance(entry)} disabled={readonly || saving} aria-label="Wartung löschen" title="Wartung löschen">
                            <Trash2 size={15} />
                          </button>
                        </div>
                        </article>
                      );
                    })}
                  </section>
                </section>
              )}
            </div>

            <footer className="modal-actions">
              {message && <p className="form-message">{message}</p>}
              {readonly ? (
                <button type="button" className="primary-button" onClick={() => setMode("edit")}>
                  Bearbeiten
                </button>
              ) : (
                <>
                  <button type="button" className="secondary-button" onClick={closeModal}>
                    Abbrechen
                  </button>
                  <button className="primary-button" disabled={saving}>
                    {saving ? "Wird gespeichert..." : "Speichern"}
                  </button>
                </>
              )}
            </footer>
          </form>
        </div>
      )}

      {articleSearchOpen && (
        <ArticleSearchDialog
          form={form}
          loading={articleSearchLoading}
          response={articleSearchResponse}
          error={articleSearchError}
          selectedFields={selectedArticleFields}
          selectedImages={selectedArticleImages}
          onApply={applyArticleResult}
          onClose={() => setArticleSearchOpen(false)}
          onToggleField={toggleArticleField}
          onToggleImage={toggleArticleImage}
          onSelectEmptyFields={() => setArticleFieldSelection("empty")}
          onSelectAllFields={() => setArticleFieldSelection("all")}
          onClearFields={() => setArticleFieldSelection("none")}
        />
      )}

      {barcodeSearchOpen && (
        <BarcodeSearchDialog
          value={barcodeSearchValue}
          onValueChange={setBarcodeSearchValue}
          onClose={() => setBarcodeSearchOpen(false)}
          onSubmit={submitBarcodeSearch}
        />
      )}

      {qrDialogOpen && (
        <QrDialog
          form={form}
          qrSvg={qrSvg}
          error={qrError}
          onClose={() => setQrDialogOpen(false)}
          onDownloadPng={downloadQrPng}
          onDownloadSvg={downloadQrSvg}
          onPrint={printQr}
        />
      )}

      {previewImage && (
        <ImagePreviewDialog
          image={previewImage}
          onClose={() => setPreviewImage(null)}
        />
      )}

      {deleteCandidate && (
        <div className="confirm-layer" role="dialog" aria-modal="true" aria-label="Fahrzeug löschen">
          <section className="confirm-card">
            <div className="panel-head form-head">
              <h2>Fahrzeug löschen?</h2>
              <button type="button" className="icon-button" onClick={() => setDeleteCandidate(null)} aria-label="Schließen">
                <X size={17} />
              </button>
            </div>
            <p>
              {deleteCandidate.inventoryNumber} - {deleteCandidate.name}
            </p>
            <div className="confirm-actions">
              <button type="button" className="secondary-button" onClick={() => setDeleteCandidate(null)}>
                Abbrechen
              </button>
              <button type="button" className="danger-button" onClick={confirmDelete}>
                Löschen
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
