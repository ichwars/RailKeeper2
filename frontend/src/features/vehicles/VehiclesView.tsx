import { DragEvent, FormEvent, Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import {
  AlertTriangle,
  ArrowUpDown,
  Barcode,
  BadgeCheck,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  CircleOff,
  Cpu,
  Grid2X2,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Gauge,
  Image,
  ImageOff,
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
import { FunctionSymbolPicker, functionSymbolIcon, functionSymbolMetadata } from "../../shared/functionSymbols";
import { useI18n } from "../../shared/i18n";

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
  acquisitionType: "",
  acquiredFrom: "",
  purchasePrice: "",
  purchaseDate: "",
  storageLocation: "",
  storageDetails: "",
  condition: "",
  conditionDetails: "",
  packaging: "",
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
type InventoryFilter = "all" | "digital" | "analog" | "withImages" | "withoutImages";
type MaintenanceFilter = "all" | "due" | "none";
type InventoryReportMode = "summary" | "details";
type InventoryReportSelection = "all" | "selected";
type InventoryReportAssets = Record<string, { qrCode?: string }>;
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
const acquisitionOptions = ["Kauf", "Tausch", "Geschenk", "Erbe", "Leihgabe", "Sonstiges"];
const acquiredFromOptions = ["Händler", "Privat", "Messe / Börse", "Online", "Auktion", "Hersteller", "Verein", "Sonstiges"];
const storageLocationOptions = ["Auf Anlage", "Vitrine", "Lager", "Werkstatt", "Transportbox", "Ausgeliehen", "Sonstiges"];
const vehicleConditionOptions = ["Neu", "Neuwertig", "Sehr gut", "Gut", "Gebraucht", "Leichte Gebrauchsspuren", "Reparaturbedürftig", "Defekt"];
const packagingOptions = ["Originalverpackung", "Ersatzverpackung", "Ohne Verpackung", "Transportbox", "Sonstiges"];
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
const cvCategories = ["Adresse", "Fahrverhalten", "Motor", "Licht", "Sound", "Funktion", "Decoder", "Sonstiges"];
const attachmentAccept = ".pdf,.jpg,.jpeg,.png,.webp,.txt,.csv,.json,.xml,.zip";
const cvFileAccept = ".json,.csv,.txt,.xml,.z21,.esu,.esux,.lokprogrammer,.zip";
const imageAccept = ".jpg,.jpeg,.png,.webp";
const blockedAttachmentExtensions = new Set(["exe", "bat", "cmd", "com", "scr", "msi", "dll", "ps1", "vbs", "js", "jar", "sh"]);
const allowedAttachmentExtensions = new Set(["pdf", "jpg", "jpeg", "png", "webp", "txt", "csv", "json", "xml", "zip"]);
const allowedCVFileExtensions = new Set(["json", "csv", "txt", "xml", "z21", "esu", "esux", "lokprogrammer", "zip"]);
const allowedImageExtensions = new Set(["jpg", "jpeg", "png", "webp"]);
const articleSearchSettingKey = "railkeeper.articleSearchEnabled";
const articleSearchSourcesSettingKey = "railkeeper.articleSearchSources";
const defaultArticleSearchSources = ["web", "manufacturer", "dealers", "wiki"];
const inventoryViewSettingKey = "railkeeper.inventoryViewMode";

function inferFunctionTypeFromSymbol(symbolKey: string, symbols: MasterDataEntry[], fallback = "standard") {
  const symbol = symbols.find((item) => item.active && item.key === symbolKey);
  const signal = `${symbolKey} ${symbol?.label || ""}`.toLocaleLowerCase("de-DE");
  if (!symbolKey) return "standard";
  if (signal.includes("sound") || signal.includes("horn") || signal.includes("pfiff")) return "sound";
  if (signal.includes("licht") || signal.includes("light") || signal.includes("lampe")) return "licht";
  if (signal.includes("kuppl")) return "kupplung";
  if (signal.includes("rauch") || signal.includes("smoke")) return "rauch";
  if (signal.includes("warn") || signal.includes("sonder") || signal.includes("sifa")) return "sonderfunktion";
  return fallback || "standard";
}

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
    acquisitionType: vehicle.acquisitionType || "",
    acquiredFrom: vehicle.acquiredFrom || "",
    purchasePrice: vehicle.purchasePrice || "",
    purchaseDate: vehicle.purchaseDate || "",
    storageLocation: vehicle.storageLocation || "",
    storageDetails: vehicle.storageDetails || "",
    condition: vehicle.condition || "",
    conditionDetails: vehicle.conditionDetails || "",
    packaging: vehicle.packaging || "",
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

function articleSearchSources() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(articleSearchSourcesSettingKey) || "[]") as string[];
    const allowed = new Set(defaultArticleSearchSources);
    const sources = stored.filter((source) => allowed.has(source));
    return sources.length > 0 ? sources : defaultArticleSearchSources;
  } catch {
    return defaultArticleSearchSources;
  }
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
  if (!current) return "empty";
  if (current.toLocaleLowerCase("de-DE") === found.toLocaleLowerCase("de-DE")) return "same";
  return "conflict";
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

function sourceShortLink(rawUrl?: string) {
  const value = String(rawUrl || "").trim();
  if (!value) return "";
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    const path = `${url.pathname}${url.search}`.replace(/\/$/, "");
    if (!path || path === "/") return host;
    const shortenedPath = path.length > 44 ? `${path.slice(0, 24)}...${path.slice(-16)}` : path;
    return `${host}${shortenedPath}`;
  } catch {
    return value.length > 54 ? `${value.slice(0, 32)}...${value.slice(-18)}` : value;
  }
}

function formatEuro(value?: string | number) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/[€$£]|eur\b/i.test(text)) return text;
  return `${text} €`;
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

function vehicleImageToPending(image: VehicleImageRecord): PendingArticleImage {
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

function vehicleImagesToPending(vehicle: Vehicle): PendingArticleImage[] {
  return (vehicle.images || []).map(vehicleImageToPending);
}

function uploadedImageToPending(image: VehicleImageRecord): PendingArticleImage {
  return vehicleImageToPending(image);
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

function hasReportValue(value?: string | number | boolean) {
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return true;
  return Boolean(String(value || "").trim());
}

function reportField(label: string, value?: string | number | boolean) {
  if (!hasReportValue(value)) return "";
  const labelText = label.trim().endsWith(":") ? label.trim() : `${label.trim()}:`;
  return `<div class="field"><span>${escapeHtml(labelText)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function reportImage(vehicle: Vehicle, includeImages: boolean) {
  if (!includeImages) return "";
  const image = primaryImage(vehicle.images);
  if (!image?.url) {
    return "";
  }
  return `<img class="vehicle-image" src="${escapeHtml(previewImageUrl(image))}" alt="">`;
}

function reportSection(title: string, fields: string[]) {
  const body = fields.filter(Boolean).join("");
  if (!body) return "";
  return `<section class="detail-section"><h3>${escapeHtml(title)}</h3><div class="field-grid">${body}</div></section>`;
}

function reportJoined(values: Array<string | undefined | false>) {
  return values.filter(Boolean).join(" · ");
}

function reportImageGallery(vehicle: Vehicle, includeImages: boolean) {
  if (!includeImages || !vehicle.images?.length) return "";
  const images = vehicle.images
    .map((image) => {
      const meta = reportJoined([
        image.isPrimary ? "Hauptbild" : "Alternativbild",
        image.title,
        image.fileName,
        image.mimeType,
        image.sourceUrl
      ]);
      return `
        <figure class="image-tile">
          <img src="${escapeHtml(previewImageUrl(image))}" alt="">
          ${meta ? `<figcaption>${escapeHtml(meta)}</figcaption>` : ""}
        </figure>
      `;
    })
    .join("");
  return `<section class="detail-section image-section"><h3>Bilder</h3><div class="image-grid">${images}</div></section>`;
}

function vehicleOverviewRow(vehicle: Vehicle, assets: InventoryReportAssets, includeImages: boolean, includeQRCode: boolean) {
  const image = reportImage(vehicle, includeImages);
  const qrCode = includeQRCode && assets[vehicle.id]?.qrCode
    ? `<img class="qr-code" src="${escapeHtml(assets[vehicle.id].qrCode)}" alt="">`
    : "";
  return `
    <section class="overview-row">
      <div class="overview-media">${image || `<div class="image-spacer"></div>`}</div>
      <div class="overview-main">
        <h3>${escapeHtml(vehicle.name || vehicle.inventoryNumber)}</h3>
        <div class="overview-fields">
          ${reportField("Hersteller", vehicle.manufacturer)}
          ${reportField("Artikel-Nr.", vehicle.articleNumber)}
          ${reportField("Gattung", vehicle.gattung || vehicle.category)}
          ${reportField("Baureihe", vehicle.series)}
          ${reportField("Betriebs-Nr.", vehicle.vehicleNumber)}
        </div>
      </div>
      <div class="overview-identity">
        ${reportField("Inventar-Nr.", vehicle.inventoryNumber)}
        ${reportField("Decoder-Nr.", vehicle.digitalDecoderNumber || vehicle.dtDecoderNumber)}
      </div>
      <div class="overview-qr">${qrCode}</div>
    </section>
  `;
}

function vehicleDetailReport(vehicle: Vehicle, assets: InventoryReportAssets, includeImages: boolean, includeQRCode: boolean) {
  const image = reportImage(vehicle, includeImages);
  const qrCode = includeQRCode && assets[vehicle.id]?.qrCode
    ? `<img class="qr-code" src="${escapeHtml(assets[vehicle.id].qrCode)}" alt="">`
    : "";
  const functions = (vehicle.functions || [])
    .filter((item) => item.name || item.symbolKey || item.notes)
    .map((item) => reportField(item.functionKey, [item.name, item.functionType, item.mode, item.notes].filter(Boolean).join(" · ")));
  const maintenance = (vehicle.maintenance || [])
    .filter((item) => item.kind || item.status || item.dueDate || item.completedAt || item.cost || item.notes)
    .map((item) => reportField(item.kind || "Wartung", [item.status, item.dueDate && `Fällig: ${formatDate(item.dueDate)}`, item.completedAt && `Erledigt: ${formatDate(item.completedAt)}`, item.cost && formatMaintenanceCost(item.cost), item.notes].filter(Boolean).join(" · ")));
  const attachments = (vehicle.attachments || [])
    .map((item) => reportField(item.originalName || item.fileName, [item.category, item.description, formatFileSize(item.sizeBytes)].filter(Boolean).join(" · ")));
  const cvValues = (vehicle.cvValues || [])
    .map((item) => reportField(`CV ${item.cvNumber}`, [String(item.value), item.category, item.decoderProfile, item.description].filter(Boolean).join(" · ")));
  const cvFiles = (vehicle.cvFiles || [])
    .map((item) => reportField(item.originalName || item.fileName, [item.decoderProfile, item.description, formatFileSize(item.sizeBytes)].filter(Boolean).join(" · ")));
  const externalMappings = (vehicle.externalMappings || [])
    .map((item) => reportField(item.provider, reportJoined([item.externalId, item.externalName, item.externalAddress, item.externalProtocol, item.syncStatus, item.lastSeenAt && formatDate(item.lastSeenAt)])));

  return `
    <article class="detail-card">
      <header class="detail-card-head">
        <div class="detail-media">${image}</div>
        <div>
          <h2>${escapeHtml(vehicle.name || vehicle.inventoryNumber)}</h2>
          <p>${escapeHtml([vehicle.manufacturer, vehicle.articleNumber, vehicle.gauge, vehicle.epoch].filter(Boolean).join(" · "))}</p>
        </div>
        <div class="detail-identity">
          ${reportField("Inventar-Nr.", vehicle.inventoryNumber)}
          ${reportField("Decoder-Nr.", vehicle.digitalDecoderNumber || vehicle.dtDecoderNumber)}
        </div>
        <div class="detail-qr">${qrCode}</div>
      </header>
      ${reportSection("Produkt", [
        reportField("Hersteller", vehicle.manufacturer),
        reportField("Artikel-Nr.", vehicle.articleNumber),
        reportField("Artikelquelle", sourceShortLink(vehicle.articleSourceUrl)),
        reportField("EAN", vehicle.ean),
        reportField("Listenpreis", formatEuro(vehicle.listPrice)),
        reportField("Produktionszeit", vehicle.productionPeriod),
        reportField("Erfasst am", formatDate(vehicle.createdAt)),
        reportField("Aktualisiert am", formatDate(vehicle.updatedAt))
      ])}
      ${reportSection("Modell", [
        reportField("Bezeichnung", vehicle.name),
        reportField("Spurweite / Epoche", [vehicle.gauge, vehicle.epoch].filter(Boolean).join(" / ")),
        reportField("Bahngesellschaft", vehicle.railwayCompany),
        reportField("Kategorie", vehicle.category),
        reportField("Gattung", vehicle.gattung),
        reportField("Baureihe", vehicle.series),
        reportField("Betriebs-Nr.", vehicle.vehicleNumber),
        reportField("Messe tauglich", vehicle.exhibitionReady),
        reportField("QR-Code aktiv", vehicle.qrCodeEnabled)
      ])}
      ${reportSection("Details", [
        reportField("Länge", vehicle.lengthMm ? `${vehicle.lengthMm} mm` : ""),
        reportField("Gewicht", vehicle.weightG ? `${vehicle.weightG} g` : ""),
        reportField("Farbe", vehicle.color),
        reportField("Beschriftung", vehicle.lettering),
        reportField("Beladung", vehicle.load),
        reportField("Inneneinrichtung", vehicle.interior),
        reportField("Achsen", vehicle.axles),
        reportField("Anzahl Achsen", vehicle.axleCount),
        reportField("Haftreifen", vehicle.tractionTireCount),
        reportField("Radsatz", vehicle.wheelset),
        reportField("Kupplung", vehicle.couplingSame ? "Vorne und hinten gleich" : ""),
        reportField("Kupplung vorne", vehicle.couplingFront),
        reportField("Kupplung hinten", vehicle.couplingRear),
        reportField("Stromaufnahme", vehicle.powerPickup),
        reportField("Fahrlicht", vehicle.headlightsEnabled),
        reportField("Fahrlicht Beschreibung", vehicle.headlightsDescription),
        reportField("Antrieb", vehicle.driveEnabled),
        reportField("Antrieb Beschreibung", vehicle.driveDescription),
        reportField("Beleuchtung", vehicle.lightingEnabled),
        reportField("Beleuchtung Beschreibung", vehicle.lightingDescription),
        reportField("Soundgenerator", vehicle.soundGeneratorEnabled),
        reportField("Sound Beschreibung", vehicle.soundGeneratorDescription),
        reportField("Rauchgenerator", vehicle.smokeGeneratorEnabled),
        reportField("Rauch Beschreibung", vehicle.smokeGeneratorDescription)
      ])}
      ${reportSection("Fahrzeug", [
        reportField("Erwerb", vehicle.acquisitionType),
        reportField("von/bei", vehicle.acquiredFrom),
        reportField("Preis", formatEuro(vehicle.purchasePrice)),
        reportField("Datum", formatDate(vehicle.purchaseDate)),
        reportField("Standort", vehicle.storageLocation),
        reportField("Details", vehicle.storageDetails),
        reportField("Zustand", vehicle.condition),
        reportField("Zustand Details", vehicle.conditionDetails),
        reportField("Verpackung", vehicle.packaging),
        reportField("Zusatzinformationen", vehicle.additionalInfo)
      ])}
      ${reportSection("Steuerung", [
        reportField("Digital", vehicle.digital),
        reportField("Decoder-Nr.", vehicle.digitalDecoderNumber),
        reportField("DT-Decoder", vehicle.dtDecoder),
        reportField("DT Decoder-Nr.", vehicle.dtDecoderNumber),
        reportField("ABC Bremsen", vehicle.abcBrakes),
        reportField("Adapter / Schnittstelle", vehicle.adapter)
      ])}
      ${reportSection("Funktionstasten", functions)}
      ${reportSection("Wartung", maintenance)}
      ${reportSection("CV-Werte", cvValues)}
      ${reportSection("CV-Dateien", cvFiles)}
      ${reportImageGallery(vehicle, includeImages)}
      ${reportSection("Beilagen", attachments)}
      ${reportSection("Externe Zuordnung", externalMappings)}
    </article>
  `;
}

function inventoryReportHtml(
  vehicles: Vehicle[],
  query: string,
  sort: { key: SortKey; direction: SortDirection },
  options: { mode: InventoryReportMode; title: string; includeQRCode: boolean; includeImages: boolean },
  assets: InventoryReportAssets
) {
  const now = new Date();
  const modeTitle = options.mode === "details" ? "Detailliste" : "Übersichtsliste";
  const overviewRows = vehicles.map((vehicle) => vehicleOverviewRow(vehicle, assets, options.includeImages, options.includeQRCode)).join("");
  const detailRows = options.mode === "details"
    ? vehicles.map((vehicle) => vehicleDetailReport(vehicle, assets, options.includeImages, options.includeQRCode)).join("")
    : "";

  return `
<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8">
    <title>RailKeeper2 Bestand</title>
    <style>
      :root { color: #101820; font-family: "Segoe UI", Arial, sans-serif; font-size: 11px; }
      * { box-sizing: border-box; }
      body { margin: 18mm 14mm 20mm; background: #fff; }
      header { display: grid; grid-template-columns: 1fr 62px; gap: 18px; align-items: start; padding-bottom: 10px; border-bottom: 1.5px solid #67b532; }
      h1 { margin: 0; font-size: 14px; letter-spacing: .02em; }
      h2 { margin: 0; font-size: 15px; }
      h3 { margin: 0; font-size: 12px; }
      p { margin: 4px 0 0; color: #4a6268; }
      .brand-mark { width: 48px; justify-self: end; }
      .report-subtitle { margin-top: 3px; font-size: 13px; font-weight: 800; color: #101820; }
      .report-meta { display: flex; gap: 14px; margin: 8px 0 14px; color: #60747b; font-size: 10px; }
      .overview-row { display: grid; grid-template-columns: 88px 1fr 110px 66px; gap: 14px; align-items: start; padding: 10px 0; border-bottom: 1px solid #101820; page-break-inside: avoid; }
      .overview-main h3 { margin-bottom: 10px; }
      .overview-fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px 18px; }
      .overview-identity .field { margin-bottom: 8px; }
      .overview-qr, .detail-qr { display: grid; place-items: start center; min-height: 58px; }
      .qr-code { width: 58px; height: 58px; object-fit: contain; }
      .vehicle-image { width: 78px; max-height: 54px; object-fit: contain; }
      .image-spacer { width: 78px; height: 1px; }
      .field { display: grid; grid-template-columns: minmax(88px, max-content) minmax(0, 1fr); gap: 6px; align-items: baseline; min-width: 0; }
      .field span { display: inline; color: #344a50; font-size: 9px; font-weight: 650; line-height: 1.25; }
      .field strong { display: inline; min-width: 0; font-size: 10px; font-weight: 800; line-height: 1.25; overflow-wrap: anywhere; }
      .overview-row .field { display: block; }
      .overview-row .field span,
      .overview-row .field strong { display: block; }
      .overview-row .field strong { margin-top: 2px; }
      .detail-card { page-break-inside: avoid; padding: 12px 0 16px; border-bottom: 1px solid #101820; }
      .detail-card-head { display: grid; grid-template-columns: 132px 1fr 120px 72px; gap: 16px; align-items: start; margin-bottom: 14px; }
      .detail-card-head .vehicle-image { width: 118px; max-height: 74px; }
      .detail-identity .field { display: grid; grid-template-columns: 1fr; gap: 2px; margin-bottom: 8px; text-align: center; }
      .detail-identity .field span,
      .detail-identity .field strong { display: block; }
      .detail-section { display: grid; grid-template-columns: 78px 1fr; gap: 18px; margin: 7px 0; }
      .detail-section h3 { font-size: 10px; }
      .field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px 24px; }
      .image-section { align-items: start; }
      .image-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
      .image-tile { margin: 0; page-break-inside: avoid; }
      .image-tile img { width: 100%; height: 88px; object-fit: contain; border: 1px solid #d9e4df; border-radius: 4px; padding: 3px; }
      .image-tile figcaption { margin-top: 4px; color: #4a6268; font-size: 8px; line-height: 1.25; overflow-wrap: anywhere; }
      .description { border-left: 2px solid #67b532; padding-left: 8px; margin-top: 10px; color: #101820; white-space: pre-wrap; }
      .footer { position: fixed; left: 14mm; right: 14mm; bottom: 8mm; display: grid; grid-template-columns: 1fr 1fr 1fr; align-items: center; border-top: 1px solid #101820; padding-top: 6px; font-size: 9px; color: #101820; }
      .footer-center { text-align: center; font-weight: 700; }
      .footer-right { text-align: right; }
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
        <h1>${escapeHtml(options.title || "Fahrzeugsammlung")}</h1>
        <div class="report-subtitle">${escapeHtml(modeTitle)} / Allgemein</div>
      </div>
      <img class="brand-mark" src="/brand/railkeeper-mark.png" alt="">
    </header>
    <div class="report-meta">
      <span>${escapeHtml(vehicles.length)} Fahrzeuge</span>
      <span>${query.trim() ? `Filter: ${escapeHtml(query.trim())}` : "Alle Fahrzeuge"}</span>
      <span>Sortierung: ${escapeHtml(sortLabels[sort.key])} ${sort.direction === "asc" ? "aufsteigend" : "absteigend"}</span>
    </div>
    ${options.mode === "details" ? detailRows : overviewRows}
    <footer class="footer">
      <span>${escapeHtml(now.toLocaleDateString("de-DE"))}</span>
      <span class="footer-center">RailKeeper</span>
      <span class="footer-right">${escapeHtml(modeTitle)}</span>
    </footer>
  </body>
</html>
`;
}

function writePrintWindow(printWindow: Window, html: string) {
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
}

function printHtmlFallback(html: string) {
  const iframe = document.createElement("iframe");
  iframe.title = "RailKeeper PDF Report";
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const cleanup = () => {
    window.setTimeout(() => iframe.remove(), 1000);
  };
  iframe.onload = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    cleanup();
  };
  iframe.srcdoc = html;
}

function openPrintDocument(html: string, name: string) {
  const printWindow = window.open("", name, "width=1180,height=860");
  if (printWindow) {
    writePrintWindow(printWindow, html);
    return;
  }
  printHtmlFallback(html);
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

function normalizeMaintenanceStatus(status: string) {
  return status === "fällig" ? "faellig" : status;
}

function maintenanceStatusClass(status: string) {
  return normalizeMaintenanceStatus(status);
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
  const lines = [
    `Inventar-Nr.: ${inventory || "-"}`,
    `Bezeichnung: ${name || "-"}`
  ];
  if (decoder) {
    lines.push(`Decoder-Nr.: ${decoder}`);
  }
  return lines.join("\n");
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
  const { t } = useI18n();
  return (
    <>
      <div className="form-row four-columns">
        <label>
          {t("vehicle.field.lengthMm")}
          <input value={form.lengthMm || ""} onChange={(event) => update({ lengthMm: event.target.value })} disabled={readonly} inputMode="decimal" />
        </label>
        <label>
          {t("vehicle.field.weightG")}
          <input value={form.weightG || ""} onChange={(event) => update({ weightG: event.target.value })} disabled={readonly} inputMode="decimal" />
        </label>
        <label>
          {t("vehicle.field.color")}
          <input value={form.color || ""} onChange={(event) => update({ color: event.target.value })} disabled={readonly} />
        </label>
        <label>
          {t("vehicle.field.lettering")}
          <input value={form.lettering || ""} onChange={(event) => update({ lettering: event.target.value })} disabled={readonly} />
        </label>
      </div>

      <div className="form-row three-columns">
        <label>
          {t("vehicle.field.load")}
          <input value={form.load || ""} onChange={(event) => update({ load: event.target.value })} disabled={readonly} />
        </label>
        <label>
          {t("vehicle.field.interior")}
          <input value={form.interior || ""} onChange={(event) => update({ interior: event.target.value })} disabled={readonly} />
        </label>
        <label>
          {t("vehicle.field.axles")}
          <input value={form.axles || ""} onChange={(event) => update({ axles: event.target.value })} disabled={readonly} />
        </label>
      </div>

      <div className="form-row four-columns">
        <label>
          {t("vehicle.field.axleCount")}
          <input value={form.axleCount || ""} onChange={(event) => update({ axleCount: event.target.value })} disabled={readonly} inputMode="numeric" />
        </label>
        <label>
          {t("vehicle.field.tractionTireCount")}
          <input value={form.tractionTireCount || ""} onChange={(event) => update({ tractionTireCount: event.target.value })} disabled={readonly} inputMode="numeric" />
        </label>
        <label>
          {t("vehicle.field.wheelset")}
          <select value={form.wheelset || ""} onChange={(event) => update({ wheelset: event.target.value })} disabled={readonly}>
            {renderStaticOptions(wheelsetOptions, t("vehicles.select.placeholder"))}
          </select>
        </label>
        <label>
          {t("vehicle.field.powerPickup")}
          <select value={form.powerPickup || ""} onChange={(event) => update({ powerPickup: event.target.value })} disabled={readonly}>
            {renderStaticOptions(powerPickupOptions, t("vehicles.select.placeholder"))}
          </select>
        </label>
      </div>

      <div className="form-row details-coupling-row">
        <label>
          {t("vehicle.field.adapter")}
          <select value={form.adapter || ""} onChange={(event) => update({ adapter: event.target.value })} disabled={readonly}>
            {renderStaticOptions(adapterOptions, t("vehicles.select.placeholder"))}
          </select>
        </label>
        <label className="coupling-same-field">
          <span>{t("vehicles.detail.couplingSame")}</span>
          <span className="switch-field">
            <input type="checkbox" checked={Boolean(form.couplingSame)} onChange={(event) => updateCouplingSame(event.target.checked)} disabled={readonly} />
            <span />
          </span>
        </label>
        <label>
          {t("vehicle.field.couplingFront")}
          <select value={form.couplingFront || ""} onChange={(event) => updateCouplingFront(event.target.value)} disabled={readonly}>
            {renderStaticOptions(couplingOptions, t("vehicles.select.placeholder"))}
          </select>
        </label>
        <label>
          {t("vehicle.field.couplingRear")}
          <select value={form.couplingSame ? form.couplingFront || "" : form.couplingRear || ""} onChange={(event) => update({ couplingRear: event.target.value })} disabled={readonly || Boolean(form.couplingSame)}>
            {renderStaticOptions(couplingOptions, t("vehicles.select.placeholder"))}
          </select>
        </label>
      </div>

      <div className="form-row switch-description-row">
        <label>
          {t("vehicle.field.headlightsDescription")}
          <span className="inline-switch-input">
            <span className="switch-field" aria-label={t("vehicle.field.headlightsEnabled")}>
              <input type="checkbox" checked={Boolean(form.headlightsEnabled)} onChange={(event) => update({ headlightsEnabled: event.target.checked })} disabled={readonly} />
              <span />
            </span>
            <input value={form.headlightsDescription || ""} onChange={(event) => update({ headlightsDescription: event.target.value })} disabled={readonly || !form.headlightsEnabled} />
          </span>
        </label>
        <label>
          {t("vehicle.field.driveDescription")}
          <span className="inline-switch-input">
            <span className="switch-field" aria-label={t("vehicle.field.driveEnabled")}>
              <input type="checkbox" checked={Boolean(form.driveEnabled)} onChange={(event) => update({ driveEnabled: event.target.checked })} disabled={readonly} />
              <span />
            </span>
            <input value={form.driveDescription || ""} onChange={(event) => update({ driveDescription: event.target.value })} disabled={readonly || !form.driveEnabled} />
          </span>
        </label>
      </div>

      <div className="form-row switch-description-row">
        <label>
          {t("vehicle.field.lightingDescription")}
          <span className="inline-switch-input">
            <span className="switch-field" aria-label={t("vehicle.field.lightingEnabled")}>
              <input type="checkbox" checked={Boolean(form.lightingEnabled)} onChange={(event) => update({ lightingEnabled: event.target.checked })} disabled={readonly} />
              <span />
            </span>
            <input value={form.lightingDescription || ""} onChange={(event) => update({ lightingDescription: event.target.value })} disabled={readonly || !form.lightingEnabled} />
          </span>
        </label>
        <label>
          {t("vehicle.field.soundGeneratorDescription")}
          <span className="inline-switch-input">
            <span className="switch-field" aria-label={t("vehicle.field.soundGeneratorEnabled")}>
              <input type="checkbox" checked={Boolean(form.soundGeneratorEnabled)} onChange={(event) => update({ soundGeneratorEnabled: event.target.checked })} disabled={readonly} />
              <span />
            </span>
            <input value={form.soundGeneratorDescription || ""} onChange={(event) => update({ soundGeneratorDescription: event.target.value })} disabled={readonly || !form.soundGeneratorEnabled} />
          </span>
        </label>
      </div>

      <div className="form-row switch-description-row">
        <label>
          {t("vehicle.field.smokeGeneratorDescription")}
          <span className="inline-switch-input">
            <span className="switch-field" aria-label={t("vehicle.field.smokeGeneratorEnabled")}>
              <input type="checkbox" checked={Boolean(form.smokeGeneratorEnabled)} onChange={(event) => update({ smokeGeneratorEnabled: event.target.checked })} disabled={readonly} />
              <span />
            </span>
            <input value={form.smokeGeneratorDescription || ""} onChange={(event) => update({ smokeGeneratorDescription: event.target.value })} disabled={readonly || !form.smokeGeneratorEnabled} />
          </span>
        </label>
        <label className="qr-switch-field">
          <span>{t("vehicles.detail.qrCreate")}</span>
          <span className="qr-card-actions">
            <span className="switch-field">
              <input type="checkbox" checked={Boolean(form.qrCodeEnabled)} onChange={(event) => update({ qrCodeEnabled: event.target.checked })} disabled={readonly} />
              <span />
            </span>
            <button type="button" className="icon-button" onClick={onOpenQr} aria-label={t("vehicles.detail.qrShow")} title={t("vehicles.detail.qrShow")} disabled={!form.qrCodeEnabled}>
              <QrCode size={16} />
            </button>
          </span>
        </label>
      </div>

    </>
  );
}

function VehicleOwnershipFields({
  form,
  readonly,
  update
}: {
  form: CreateVehicleRequest;
  readonly: boolean;
  update: (patch: Partial<CreateVehicleRequest>) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <div className="form-row four-columns">
        <label>
          {t("vehicle.field.acquisitionType")}
          <select value={form.acquisitionType || ""} onChange={(event) => update({ acquisitionType: event.target.value })} disabled={readonly}>
            {renderStaticOptions(acquisitionOptions, t("vehicles.select.placeholder"))}
          </select>
        </label>
        <label>
          {t("vehicle.field.acquiredFrom")}
          <select value={form.acquiredFrom || ""} onChange={(event) => update({ acquiredFrom: event.target.value })} disabled={readonly}>
            {renderStaticOptions(acquiredFromOptions, t("vehicles.select.placeholder"))}
          </select>
        </label>
        <label>
          {t("vehicle.field.purchasePrice")}
          <input value={form.purchasePrice || ""} onChange={(event) => update({ purchasePrice: event.target.value })} disabled={readonly} inputMode="decimal" />
        </label>
        <label>
          {t("vehicle.field.purchaseDate")}
          <input type="date" value={form.purchaseDate || ""} onChange={(event) => update({ purchaseDate: event.target.value })} disabled={readonly} />
        </label>
      </div>

      <div className="form-row">
        <label>
          {t("vehicle.field.storageLocation")}
          <select value={form.storageLocation || ""} onChange={(event) => update({ storageLocation: event.target.value })} disabled={readonly}>
            {renderStaticOptions(storageLocationOptions, t("vehicles.select.placeholder"))}
          </select>
        </label>
        <label>
          {t("vehicle.field.storageDetails")}
          <input value={form.storageDetails || ""} onChange={(event) => update({ storageDetails: event.target.value })} disabled={readonly} />
        </label>
      </div>

      <div className="form-row three-columns">
        <label>
          {t("vehicle.field.condition")}
          <select value={form.condition || ""} onChange={(event) => update({ condition: event.target.value })} disabled={readonly}>
            {renderStaticOptions(vehicleConditionOptions, t("vehicles.select.placeholder"))}
          </select>
        </label>
        <label>
          {t("vehicle.field.conditionDetails")}
          <input value={form.conditionDetails || ""} onChange={(event) => update({ conditionDetails: event.target.value })} disabled={readonly} />
        </label>
        <label>
          {t("vehicle.field.packaging")}
          <select value={form.packaging || ""} onChange={(event) => update({ packaging: event.target.value })} disabled={readonly}>
            {renderStaticOptions(packagingOptions, t("vehicles.select.placeholder"))}
          </select>
        </label>
      </div>

      <label>
        {t("vehicle.field.additionalInfo")}
        <textarea value={form.additionalInfo || ""} onChange={(event) => update({ additionalInfo: event.target.value })} disabled={readonly} rows={5} />
      </label>
    </>
  );
}

type VehicleViewField = {
  label: string;
  value?: string | number | boolean;
  showFalse?: boolean;
  href?: string;
};

function viewValue(value?: string | number | boolean) {
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (value === 0) return "0";
  return String(value || "").trim();
}

function hasViewValue(field: VehicleViewField) {
  if (typeof field.value === "boolean") return field.value || field.showFalse;
  if (typeof field.value === "number") return true;
  return Boolean(String(field.value || "").trim());
}

function VehicleViewSection({ title, fields }: { title: string; fields: VehicleViewField[] }) {
  const visibleFields = fields.filter(hasViewValue);
  if (visibleFields.length === 0) return null;
  return (
    <section className="vehicle-view-section">
      <h3>{title}</h3>
      <dl>
        {visibleFields.map((field) => (
          <div key={`${title}-${field.label}`}>
            <dt>{field.label}</dt>
            <dd>
              {field.href ? (
                <a href={field.href} target="_blank" rel="noreferrer">
                  {viewValue(field.value)}
                </a>
              ) : (
                viewValue(field.value)
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function VehicleReadOnlyView({
  vehicle,
  onEdit,
  onPrint,
  onQr,
  onPreviewImage
}: {
  vehicle: Vehicle;
  onEdit: () => void;
  onPrint: () => void;
  onQr: () => void;
  onPreviewImage: (image: PendingArticleImage) => void;
}) {
  const { t } = useI18n();
  const image = primaryImage(vehicle.images);
  const configuredFunctions = (vehicle.functions || []).filter((item) => item.name || item.symbolKey || item.notes);
  const activeMaintenance = (vehicle.maintenance || []).filter((item) => item.kind || item.status || item.dueDate || item.completedAt || item.notes);
  const cvValues = vehicle.cvValues || [];
  const cvFiles = vehicle.cvFiles || [];
  const attachments = vehicle.attachments || [];
  const images = vehicle.images || [];

  return (
    <div className="modal-body vehicle-read-view">
      <section className="vehicle-read-hero">
        <div className="vehicle-read-image">
          {image?.url ? <img src={previewImageUrl(image)} alt="" /> : <span>{t("exhibition.noPreview")}</span>}
        </div>
        <div className="vehicle-read-title">
          <p className="eyebrow">Fahrzeugansicht</p>
          <h2>{vehicle.name || vehicle.inventoryNumber}</h2>
          <p>{[vehicle.manufacturer, vehicle.articleNumber, vehicle.gauge, vehicle.epoch].filter(Boolean).join(" · ")}</p>
          <div className="vehicle-read-chips">
            <span>{vehicle.inventoryNumber}</span>
            {vehicle.category && <span>{vehicle.category}</span>}
            {vehicle.gattung && <span>{vehicle.gattung}</span>}
            <span>{vehicle.digital ? "Digital" : "Analog"}</span>
            {vehicle.exhibitionReady && <span>Messe tauglich</span>}
          </div>
        </div>
        <div className="vehicle-read-actions">
          <button type="button" className="icon-button" onClick={onEdit} aria-label={t("vehicles.edit")} title={t("vehicles.edit")}>
            <Pencil size={16} />
          </button>
          <button type="button" className="icon-button" onClick={onPrint} aria-label={t("vehicles.report.open")} title={t("vehicles.report.open")}>
            <Printer size={16} />
          </button>
          <button type="button" className="icon-button" onClick={onQr} aria-label={t("vehicles.detail.qrShow")} title={t("vehicles.detail.qrShow")}>
            <QrCode size={16} />
          </button>
        </div>
      </section>

      <div className="vehicle-view-grid">
        <VehicleViewSection
          title="Produkt"
          fields={[
            { label: "Hersteller", value: vehicle.manufacturer },
            { label: "Artikel-Nr.", value: vehicle.articleNumber },
            { label: "EAN", value: vehicle.ean },
            { label: "Listenpreis", value: formatEuro(vehicle.listPrice) },
            { label: "Produktionszeit", value: vehicle.productionPeriod },
            { label: "Artikelquelle", value: sourceShortLink(vehicle.articleSourceUrl), href: vehicle.articleSourceUrl }
          ]}
        />
        <VehicleViewSection
          title="Modell"
          fields={[
            { label: "Bezeichnung", value: vehicle.name },
            { label: "Spurweite", value: vehicle.gauge },
            { label: "Epoche", value: vehicle.epoch },
            { label: "Bahngesellschaft", value: vehicle.railwayCompany },
            { label: "Kategorie", value: vehicle.category },
            { label: "Gattung", value: vehicle.gattung },
            { label: "Baureihe", value: vehicle.series },
            { label: "Fahrzeug-Nr.", value: vehicle.vehicleNumber },
            { label: "Beschreibung", value: vehicle.description },
            { label: "Messe tauglich", value: vehicle.exhibitionReady }
          ]}
        />
        <VehicleViewSection
          title="Details"
          fields={[
            { label: "Länge", value: vehicle.lengthMm ? `${vehicle.lengthMm} mm` : "" },
            { label: "Gewicht", value: vehicle.weightG ? `${vehicle.weightG} g` : "" },
            { label: "Farbe", value: vehicle.color },
            { label: "Beschriftung", value: vehicle.lettering },
            { label: "Beladung", value: vehicle.load },
            { label: "Inneneinrichtung", value: vehicle.interior },
            { label: "Achsen", value: vehicle.axles },
            { label: "Anzahl Achsen", value: vehicle.axleCount },
            { label: "Haftreifen", value: vehicle.tractionTireCount },
            { label: "Radsatz", value: vehicle.wheelset },
            { label: "Kupplung", value: vehicle.couplingSame ? "Vorne und hinten gleich" : "" },
            { label: "Kupplung vorne", value: vehicle.couplingFront },
            { label: "Kupplung hinten", value: vehicle.couplingRear },
            { label: "Stromaufnahme", value: vehicle.powerPickup },
            { label: "Fahrlicht", value: vehicle.headlightsEnabled },
            { label: "Fahrlicht Beschreibung", value: vehicle.headlightsDescription },
            { label: "Antrieb", value: vehicle.driveEnabled },
            { label: "Antrieb Beschreibung", value: vehicle.driveDescription },
            { label: "Beleuchtung", value: vehicle.lightingEnabled },
            { label: "Beleuchtung Beschreibung", value: vehicle.lightingDescription },
            { label: "Soundgenerator", value: vehicle.soundGeneratorEnabled },
            { label: "Sound Beschreibung", value: vehicle.soundGeneratorDescription },
            { label: "Rauchgenerator", value: vehicle.smokeGeneratorEnabled },
            { label: "Rauch Beschreibung", value: vehicle.smokeGeneratorDescription }
          ]}
        />
        <VehicleViewSection
          title="Fahrzeug"
          fields={[
            { label: "Erwerb", value: vehicle.acquisitionType },
            { label: "von/bei", value: vehicle.acquiredFrom },
            { label: "Preis", value: formatEuro(vehicle.purchasePrice) },
            { label: "Datum", value: vehicle.purchaseDate ? formatDate(vehicle.purchaseDate) : "" },
            { label: "Standort", value: vehicle.storageLocation },
            { label: "Details", value: vehicle.storageDetails },
            { label: "Zustand", value: vehicle.condition },
            { label: "Zustand Details", value: vehicle.conditionDetails },
            { label: "Verpackung", value: vehicle.packaging },
            { label: "Zusatzinformationen", value: vehicle.additionalInfo }
          ]}
        />
        <VehicleViewSection
          title="Steuerung"
          fields={[
            { label: "Digital", value: vehicle.digital },
            { label: "Decoder-Nr.", value: vehicle.digitalDecoderNumber },
            { label: "DT-Decoder", value: vehicle.dtDecoder },
            { label: "DT Decoder-Nr.", value: vehicle.dtDecoderNumber },
            { label: "ABC Bremsen", value: vehicle.abcBrakes },
            { label: "Adapter / Schnittstelle", value: vehicle.adapter },
            { label: "QR-Code aktiv", value: vehicle.qrCodeEnabled }
          ]}
        />
      </div>

      {configuredFunctions.length > 0 && (
        <section className="vehicle-view-section vehicle-view-wide">
          <h3>Funktionstasten</h3>
          <div className="vehicle-view-list">
            {configuredFunctions.map((item) => (
              <article key={item.functionKey}>
                <strong>{item.functionKey}</strong>
                <span>{[item.name, item.functionType, item.mode, item.notes].filter(Boolean).join(" · ")}</span>
              </article>
            ))}
          </div>
        </section>
      )}

      {images.length > 0 && (
        <section className="vehicle-view-section vehicle-view-wide">
          <h3>Bilder</h3>
          <div className="vehicle-view-gallery">
            {images.map((item) => (
              <figure key={item.id}>
                <button type="button" className="vehicle-view-image-button" onClick={() => onPreviewImage(vehicleImageToPending(item))}>
                  <img src={previewImageUrl(item)} alt="" />
                </button>
                <figcaption>{[item.isPrimary ? "Hauptbild" : "Alternativbild", item.title].filter(Boolean).join(" · ") || item.fileName || "Bild"}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {(attachments.length > 0 || activeMaintenance.length > 0 || cvValues.length > 0 || cvFiles.length > 0) && (
        <div className="vehicle-view-grid">
          {activeMaintenance.length > 0 && (
            <section className="vehicle-view-section">
              <h3>Wartung</h3>
              <div className="vehicle-view-list">
                {activeMaintenance.map((item) => (
                  <article key={item.id}>
                    <strong>{item.kind}</strong>
                    <span>{[item.status, item.dueDate && `Fällig ${formatDate(item.dueDate)}`, item.completedAt && `Erledigt ${formatDate(item.completedAt)}`, item.notes].filter(Boolean).join(" · ")}</span>
                  </article>
                ))}
              </div>
            </section>
          )}
          {attachments.length > 0 && (
            <section className="vehicle-view-section">
              <h3>Beilagen</h3>
              <div className="vehicle-view-list">
                {attachments.map((item) => (
                  <article key={item.id}>
                    <strong>{item.originalName || item.fileName}</strong>
                    <span>{[item.category, item.description, formatFileSize(item.sizeBytes)].filter(Boolean).join(" · ")}</span>
                  </article>
                ))}
              </div>
            </section>
          )}
          {cvValues.length > 0 && (
            <section className="vehicle-view-section">
              <h3>CV-Werte</h3>
              <div className="vehicle-view-list compact">
                {cvValues.slice(0, 12).map((item) => (
                  <article key={item.id}>
                    <strong>CV {item.cvNumber}</strong>
                    <span>{[String(item.value), item.category, item.decoderProfile, item.description].filter(Boolean).join(" · ")}</span>
                  </article>
                ))}
              </div>
            </section>
          )}
          {cvFiles.length > 0 && (
            <section className="vehicle-view-section">
              <h3>CV-Dateien</h3>
              <div className="vehicle-view-list">
                {cvFiles.map((item) => (
                  <article key={item.id}>
                    <strong>{item.originalName || item.fileName}</strong>
                    <span>{[item.decoderProfile, item.description, formatFileSize(item.sizeBytes)].filter(Boolean).join(" · ")}</span>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
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
  const { t } = useI18n();
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const articleFieldLabel = (key: string, fallback?: string) => {
    const label = t(`vehicle.field.${key}`);
    return label === `vehicle.field.${key}` ? fallback || articleFieldLabels[key as ArticleFieldKey] || key : label;
  };
  const articleGroupTitle = (title: string) => {
    if (title === "Modell") return t("vehicles.articleSearch.group.model");
    if (title === "Masse / Bauart") return t("vehicles.articleSearch.group.mass");
    if (title === "Technik") return t("vehicles.articleSearch.group.technology");
    if (title === "Weitere Daten") return t("vehicles.articleSearch.group.more");
    return title;
  };

  useEffect(() => {
    setFailedImages({});
  }, [response?.query]);

  const markImageFailed = useCallback((url: string) => {
    setFailedImages((current) => current[url] ? current : { ...current, [url]: true });
  }, []);

  return (
    <div className="confirm-layer article-search-layer" role="dialog" aria-modal="true" aria-label={t("vehicles.articleSearch.dialogTitle")}>
      <section className="article-search-dialog">
        <div className="panel-head form-head">
          <div>
            <h2>{t("vehicles.articleSearch.dialogTitle")}</h2>
            <p>{response?.query ? t("vehicles.articleSearch.query", { query: response.query }) : t("vehicles.articleSearch.help")}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label={t("vehicles.close")} title={t("vehicles.close")}>
            <X size={17} />
          </button>
        </div>

        <div className="article-dialog-state">
          {loading && <p className="empty-state compact">{t("vehicles.articleSearch.loading")}</p>}
          {error && <p className="form-message">{error}</p>}
          {!loading && !error && response && response.results.length === 0 && (
            <p className="empty-state compact">{t("vehicles.articleSearch.empty")}</p>
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
                  <a className="secondary-button article-source-button" href={result.url} target="_blank" rel="noreferrer" aria-label={t("vehicles.articleSearch.sourceOpen")} title={t("vehicles.articleSearch.sourceOpen")}>
                    <ExternalLink size={15} />
                    {t("vehicles.articleSearch.sourceOpen")}
                  </a>
                </header>

                {visibleImages.length > 0 && (
                  <div className="article-image-strip" aria-label={t("vehicles.articleSearch.imagesFound")}>
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
                    {t("vehicles.articleSearch.conflicts", { fields: result.conflicts.map((key) => articleFieldLabel(key)).join(", ") })}
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
                        <h3>{articleGroupTitle(group.title)}</h3>
                        <table>
                          <thead>
                            <tr>
                              <th>{t("vehicles.articleSearch.apply")}</th>
                              <th>{t("vehicles.articleSearch.field")}</th>
                              <th>{t("vehicles.articleSearch.current")}</th>
                              <th>{t("vehicles.articleSearch.found")}</th>
                              <th>{t("vehicles.articleSearch.status")}</th>
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
                                <tr key={key} className={status === "conflict" ? "conflict" : ""}>
                                  <td>
                                    <input
                                      type="checkbox"
                                      checked={Boolean(selectedFields[selectionKey])}
                                      onChange={(event) => onToggleField(result, index, key, event.target.checked)}
                                    />
                                  </td>
                                  <td><strong>{articleFieldLabel(key, field.label)}</strong></td>
                                  <td>{currentDisplay || "-"}</td>
                                  <td>
                                    {key === "articleSourceUrl" && field.value ? (
                                      <a className="inline-source-link" href={field.value} target="_blank" rel="noreferrer" title={field.value}>
                                        {foundDisplay || t("vehicles.articleSearch.source")}
                                        <ExternalLink size={13} aria-hidden="true" />
                                      </a>
                                    ) : (
                                      foundDisplay || "-"
                                    )}
                                  </td>
                                  <td><span className={`article-status ${status}`}>{t(`vehicles.articleSearch.status.${status}`)}</span></td>
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
                  <span>{t("vehicles.articleSearch.selectableFields", { count: selectableKeys.length })}</span>
                  <button type="button" className="primary-button" onClick={() => onApply(result)}>
                    <Check size={16} aria-hidden="true" />
                    {t("vehicles.articleSearch.applySelected")}
                  </button>
                </footer>
              </article>
            );
          })}
        </div>

        <footer className="article-dialog-actions">
          <button type="button" className="secondary-button" onClick={onSelectEmptyFields}>{t("vehicles.articleSearch.onlyEmpty")}</button>
          <button type="button" className="secondary-button" onClick={onSelectAllFields}>{t("vehicles.articleSearch.selectAll")}</button>
          <button type="button" className="secondary-button" onClick={onClearFields}>{t("vehicles.articleSearch.selectNone")}</button>
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
  const { t } = useI18n();
  const decoderNumber = form.digitalDecoderNumber || form.dtDecoderNumber || "";
  return (
    <div className="confirm-layer qr-layer" role="dialog" aria-modal="true" aria-label="QR-Code">
      <section className="qr-dialog">
        <div className="panel-head form-head">
          <div>
            <h2>QR-Code</h2>
            <p>{form.inventoryNumber || t("vehicles.qr.noInventory")} - {form.name || t("vehicles.qr.noName")}</p>
            {decoderNumber && <p className="qr-dialog-meta">Decoder-Nr.: {decoderNumber}</p>}
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label={t("vehicles.close")} title={t("vehicles.close")}>
            <X size={17} />
          </button>
        </div>
        {error && <p className="form-message">{error}</p>}
        <button type="button" className="qr-preview-button" onClick={onPrint} disabled={!qrSvg} title={t("vehicles.qr.printView")}>
          {qrSvg ? (
            <>
              <span dangerouslySetInnerHTML={{ __html: qrSvg }} />
              <img className="qr-preview-logo" src="/brand/railkeeper-mark.png" alt="" />
            </>
          ) : (
            t("vehicles.qr.creating")
          )}
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
            {t("overview.print")}
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
  const { t } = useI18n();
  return (
    <div className="confirm-layer image-preview-layer" role="dialog" aria-modal="true" aria-label={t("vehicles.imagePreview.title")}>
      <section className="image-preview-dialog">
        <div className="panel-head form-head">
          <div>
            <h2>{t("vehicles.imagePreview.title")}</h2>
            <p className="image-preview-source">
              {image.title || t("vehicles.imagePreview.defaultTitle")} - {sourceDisplayName(image.source)}
              <a className="icon-button image-title-link" href={image.source} target="_blank" rel="noreferrer" aria-label={t("vehicles.articleSearch.sourceOpen")} title={t("vehicles.articleSearch.sourceOpen")}>
                <ExternalLink size={15} />
              </a>
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label={t("vehicles.close")} title={t("vehicles.close")}>
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
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const scannerActiveRef = useRef(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerMessage, setScannerMessage] = useState("");

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const stopCameraScan = useCallback(() => {
    scannerActiveRef.current = false;
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setScannerOpen(false);
  }, []);

  useEffect(() => () => stopCameraScan(), [stopCameraScan]);

  const startCameraScan = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerMessage(t("vehicles.barcode.cameraUnsupported"));
      setScannerOpen(false);
      return;
    }

    stopCameraScan();
    setScannerMessage(t("vehicles.barcode.cameraStarting"));
    setScannerOpen(true);

    try {
      await new Promise((resolve) => window.setTimeout(resolve, 0));

      const video = videoRef.current;
      if (!video) {
        setScannerMessage(t("vehicles.barcode.cameraUnavailable"));
        return;
      }

      const reader = readerRef.current ?? new BrowserMultiFormatReader();
      readerRef.current = reader;
      scannerActiveRef.current = true;
      setScannerMessage(t("vehicles.barcode.cameraReady"));

      const controls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            height: { ideal: 720 },
            width: { ideal: 1280 }
          }
        },
        video,
        (result, _error, controlsFromCallback) => {
          if (!scannerActiveRef.current || !result) {
            return;
          }

          const ean = result.getText().replace(/[^\d]/g, "");
          if (ean.length < 8) {
            setScannerMessage(t("vehicles.barcode.cameraDetecting"));
            return;
          }

          onValueChange(ean);
          setScannerMessage(t("vehicles.barcode.cameraDetected"));
          scannerActiveRef.current = false;
          controlsFromCallback.stop();
          scannerControlsRef.current = null;
          setScannerOpen(false);
          inputRef.current?.focus();
          inputRef.current?.select();
        }
      );
      scannerControlsRef.current = controls;
    } catch {
      scannerActiveRef.current = false;
      setScannerMessage(t("vehicles.barcode.cameraPermission"));
      setScannerOpen(false);
    }
  };

  const handleClose = () => {
    stopCameraScan();
    onClose();
  };

  return (
    <div className="confirm-layer barcode-search-layer" role="dialog" aria-modal="true" aria-label={t("vehicles.barcode.title")}>
      <form className="barcode-search-dialog" onSubmit={onSubmit}>
        <header className="panel-head form-head">
          <div>
            <h2>{t("vehicles.barcode.title")}</h2>
            <p>{t("vehicles.barcode.help")}</p>
          </div>
          <button type="button" className="icon-button" onClick={handleClose} aria-label={t("vehicles.close")} title={t("vehicles.close")}>
            <X size={17} />
          </button>
        </header>

        <label className="barcode-input-label">
          Barcode / EAN
          <span className="barcode-input-row">
            <span className="barcode-input-shell">
              <Barcode size={18} aria-hidden="true" />
              <input
                ref={inputRef}
                value={value}
                onChange={(event) => onValueChange(event.target.value)}
                inputMode="numeric"
                autoComplete="off"
                placeholder={t("vehicles.barcode.placeholder")}
              />
            </span>
            <button type="button" className="secondary-button barcode-camera-button" onClick={startCameraScan}>
              <Camera size={15} aria-hidden="true" />
              {t("vehicles.barcode.camera")}
            </button>
          </span>
        </label>

        {scannerOpen && (
          <section className="barcode-camera-panel">
            <video ref={videoRef} muted playsInline />
            <div>
              <strong>{t("vehicles.barcode.cameraTitle")}</strong>
              <p>{scannerMessage}</p>
            </div>
            <button type="button" className="secondary-button" onClick={stopCameraScan}>
              {t("vehicles.barcode.cameraClose")}
            </button>
          </section>
        )}

        {!scannerOpen && scannerMessage && <p className="barcode-scan-message">{scannerMessage}</p>}

        <p className="barcode-hint">
          {t("vehicles.barcode.hint")}
        </p>

        <footer className="barcode-search-actions">
          <button type="button" className="secondary-button" onClick={handleClose}>
            {t("vehicles.cancel")}
          </button>
          <button type="submit" className="primary-button">
            <PackageSearch size={15} aria-hidden="true" />
            {t("vehicles.articleSearch.search")}
          </button>
        </footer>
      </form>
    </div>
  );
}

export function VehiclesView() {
  const { language, t } = useI18n();
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
    details: false,
    vehicle: false
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
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportMode, setReportMode] = useState<InventoryReportMode>("summary");
  const [reportTitle, setReportTitle] = useState("Fahrzeugsammlung");
  const [reportSelection, setReportSelection] = useState<InventoryReportSelection>("all");
  const [reportIncludeQRCode, setReportIncludeQRCode] = useState(true);
  const [reportIncludeImages, setReportIncludeImages] = useState(true);
  const [selectedVehicleIDs, setSelectedVehicleIDs] = useState<Set<string>>(() => new Set());
  const [inventoryView, setInventoryView] = useState<InventoryViewMode>(inventoryViewMode);
  const [inventoryFilter, setInventoryFilter] = useState<InventoryFilter>("all");
  const [maintenanceFilter, setMaintenanceFilter] = useState<MaintenanceFilter>("all");
  const [manufacturerFilter, setManufacturerFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [gattungFilter, setGattungFilter] = useState("");
  const [exhibitionReadyFilter, setExhibitionReadyFilter] = useState(false);
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
    const availableIDs = new Set(vehicles.map((vehicle) => vehicle.id));
    setSelectedVehicleIDs((current) => {
      const next = new Set(Array.from(current).filter((id) => availableIDs.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [vehicles]);

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

  useEffect(() => {
    if (!quickMenuVehicleID) return;

    const closeOnPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest(".quick-menu-wrap")) {
        return;
      }
      setQuickMenuVehicleID("");
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setQuickMenuVehicleID("");
      }
    };

    window.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [quickMenuVehicleID]);

  const inventoryFilterCounts = useMemo(() => {
    const withImages = vehicles.filter((vehicle) => (vehicle.images || []).length > 0).length;
    const digital = vehicles.filter((vehicle) => vehicle.digital).length;
    const maintenanceDue = vehicles.filter((vehicle) => (vehicle.maintenance || []).some(maintenanceIsDue)).length;
    const exhibitionReady = vehicles.filter((vehicle) => vehicle.exhibitionReady).length;

    return {
      all: vehicles.length,
      digital,
      analog: vehicles.length - digital,
      withImages,
      withoutImages: vehicles.length - withImages,
      maintenanceDue,
      withoutMaintenance: vehicles.length - maintenanceDue,
      exhibitionReady
    };
  }, [vehicles]);

  const inventoryFilterOptions = useMemo(() => {
    const unique = (values: string[]) =>
      Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((left, right) =>
        left.localeCompare(right, "de-DE", { sensitivity: "base" })
      );

    const gattungSource = categoryFilter ? vehicles.filter((vehicle) => vehicle.category === categoryFilter) : vehicles;

    return {
      manufacturers: unique(vehicles.map((vehicle) => vehicle.manufacturer)),
      categories: unique(vehicles.map((vehicle) => vehicle.category || "")),
      gattungen: unique(gattungSource.map((vehicle) => vehicle.gattung || ""))
    };
  }, [categoryFilter, vehicles]);

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((vehicle) => {
      const maintenanceDue = (vehicle.maintenance || []).some(maintenanceIsDue);
      if (inventoryFilter === "digital" && !vehicle.digital) return false;
      if (inventoryFilter === "analog" && vehicle.digital) return false;
      if (inventoryFilter === "withImages" && (vehicle.images || []).length === 0) return false;
      if (inventoryFilter === "withoutImages" && (vehicle.images || []).length > 0) return false;
      if (maintenanceFilter === "due" && !maintenanceDue) return false;
      if (maintenanceFilter === "none" && maintenanceDue) return false;
      if (manufacturerFilter && vehicle.manufacturer !== manufacturerFilter) return false;
      if (categoryFilter && vehicle.category !== categoryFilter) return false;
      if (gattungFilter && vehicle.gattung !== gattungFilter) return false;
      if (exhibitionReadyFilter && !vehicle.exhibitionReady) return false;
      return true;
    });
  }, [categoryFilter, exhibitionReadyFilter, gattungFilter, inventoryFilter, maintenanceFilter, manufacturerFilter, vehicles]);

  const sortedVehicles = useMemo(() => {
    return [...filteredVehicles].sort((left, right) => {
      const result = valueForSort(left, sort.key).localeCompare(valueForSort(right, sort.key), "de-DE", {
        numeric: true,
        sensitivity: "base"
      });
      return sort.direction === "asc" ? result : -result;
    });
  }, [filteredVehicles, sort]);

  const selectedVisibleVehicles = useMemo(
    () => sortedVehicles.filter((vehicle) => selectedVehicleIDs.has(vehicle.id)),
    [selectedVehicleIDs, sortedVehicles]
  );
  const allVisibleSelected = sortedVehicles.length > 0 && sortedVehicles.every((vehicle) => selectedVehicleIDs.has(vehicle.id));
  const someVisibleSelected = sortedVehicles.some((vehicle) => selectedVehicleIDs.has(vehicle.id));

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

  const inventoryFilters = [
    { key: "all" as const, label: t("vehicles.filter.all"), count: inventoryFilterCounts.all },
    { key: "digital" as const, label: t("vehicles.filter.digital"), count: inventoryFilterCounts.digital, icon: <Cpu size={15} aria-hidden="true" /> },
    { key: "analog" as const, label: t("vehicles.filter.analog"), count: inventoryFilterCounts.analog, icon: <Circle size={15} aria-hidden="true" /> },
    { key: "withImages" as const, label: t("vehicles.filter.withImages"), count: inventoryFilterCounts.withImages, icon: <Image size={15} aria-hidden="true" /> },
    { key: "withoutImages" as const, label: t("vehicles.filter.withoutImages"), count: inventoryFilterCounts.withoutImages, icon: <ImageOff size={15} aria-hidden="true" /> }
  ];

  const maintenanceFilters = [
    { key: "all" as const, label: t("vehicles.filter.all"), count: vehicles.length },
    { key: "due" as const, label: t("vehicles.filter.maintenanceDue"), count: inventoryFilterCounts.maintenanceDue, icon: <Wrench size={15} aria-hidden="true" /> },
    { key: "none" as const, label: t("vehicles.filter.withoutMaintenance"), count: inventoryFilterCounts.withoutMaintenance, icon: <CircleOff size={15} aria-hidden="true" /> }
  ];

  const hasActiveInventoryFilters =
    inventoryFilter !== "all" ||
    maintenanceFilter !== "all" ||
    Boolean(manufacturerFilter || categoryFilter || gattungFilter || exhibitionReadyFilter);

  const resetInventoryFilters = () => {
    setInventoryFilter("all");
    setMaintenanceFilter("all");
    setManufacturerFilter("");
    setCategoryFilter("");
    setGattungFilter("");
    setExhibitionReadyFilter(false);
  };

  const toggleVehicleSelection = (vehicleID: string) => {
    setSelectedVehicleIDs((current) => {
      const next = new Set(current);
      if (next.has(vehicleID)) {
        next.delete(vehicleID);
      } else {
        next.add(vehicleID);
      }
      return next;
    });
  };

  const toggleAllVisibleSelection = () => {
    setSelectedVehicleIDs((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        sortedVehicles.forEach((vehicle) => next.delete(vehicle.id));
      } else {
        sortedVehicles.forEach((vehicle) => next.add(vehicle.id));
      }
      return next;
    });
  };

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
        searchSources: articleSearchSources(),
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
      searchSources: articleSearchSources(),
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

  const previewCVFileValuesForImport = () => {
    if (!selected || !cvFileUploadPreview) return;
    const values = cvFileUploadPreview.previews.flatMap((preview) =>
      (preview.suggestedCvValues || []).map((value) => ({
        cvNumber: value.cvNumber,
        value: value.value,
        description: value.description || "",
        category: value.category || "",
        decoderProfile: preview.suggestedDecoderProfile || cvFileProfile || preview.decoder || preview.projectName || "",
        sourceFileId: ""
      }))
    );
    const preview = buildCVImportPreview("Decoder-Datei-Vorschau", values, selected.cvValues || []);
    if (!preview.rows.some((row) => row.status !== "invalid")) {
      setMessage("Keine gültigen CV-Werte in der Decoder-Vorschau gefunden.");
      return;
    }
    setCVImportPreview(preview);
    setMessage(`${values.length} erkannte CV-Werte in die Importprüfung übernommen.`);
  };

  const applyCVFileFunctionSuggestions = () => {
    if (!selected || !cvFileUploadPreview) return;
    const mappings = cvFileUploadPreview.previews.flatMap((preview) =>
      (preview.suggestedFunctions || []).map((mapping) => ({
        functionKey: mapping.functionKey,
        name: mapping.name || "",
        symbolKey: "",
        functionType: mapping.functionType || "standard",
        mode: "dauer",
        directionDependent: false,
        notes: preview.fileName
      }))
    );
    const valid = Array.from(new Map(mappings.filter(isValidFunctionMapping).map((mapping) => [mapping.functionKey, mapping])).values());
    if (valid.length === 0) {
      setMessage("Keine gültigen Funktionstasten in der Decoder-Vorschau gefunden.");
      return;
    }
    setSaving(true);
    setMessage("");
    (async () => {
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
    })()
      .then(() => refreshSelectedVehicle(selected.id))
      .then(() => setMessage(`${valid.length} Funktionstaste${valid.length === 1 ? "" : "n"} aus der Decoder-Vorschau übernommen.`))
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setSaving(false));
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

  const buildQrSvg = async (vehicle: Vehicle | null, formData: CreateVehicleRequest) => {
    const svg = await QRCode.toString(qrPayload(vehicle, formData), {
      type: "svg",
      width: 256,
      margin: 2,
      color: {
        dark: "#0b1e26",
        light: "#ffffff"
      }
    });
    return composeBrandedQrSvg(svg);
  };

  const buildBrandedQrPngDataUrl = async (payload: string, width = 768) => {
    const dataURL = await QRCode.toDataURL(payload, {
      width,
      margin: 2,
      color: {
        dark: "#0b1e26",
        light: "#ffffff"
      }
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = width;
    const context = canvas.getContext("2d");
    if (!context) return dataURL;
    const qrImage = new window.Image();
    await new Promise<void>((resolve, reject) => {
      qrImage.onload = () => resolve();
      qrImage.onerror = () => reject(new Error("QR-Code konnte nicht geladen werden."));
      qrImage.src = dataURL;
    });
    context.drawImage(qrImage, 0, 0, width, width);
    const logoImage = new window.Image();
    await new Promise<void>((resolve) => {
      logoImage.onload = () => resolve();
      logoImage.onerror = () => resolve();
      logoImage.src = "/brand/railkeeper-mark.png";
    });
    const plateSize = Math.round(width * 0.14);
    const plateX = Math.round((width - plateSize) / 2);
    const plateRadius = Math.round(plateSize * 0.18);
    context.fillStyle = "#fff";
    context.roundRect(plateX, plateX, plateSize, plateSize, plateRadius);
    context.fill();
    if (logoImage.complete && logoImage.naturalWidth > 0) {
      const logoPadding = Math.round(plateSize * 0.12);
      context.drawImage(logoImage, plateX + logoPadding, plateX + logoPadding, plateSize - logoPadding * 2, plateSize - logoPadding * 2);
    }
    return canvas.toDataURL("image/png");
  };

  const generateQr = async () => {
    setQrDialogOpen(true);
    setQrSvg("");
    setQrError("");
    try {
      setQrSvg(await buildQrSvg(selected, form));
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
    const link = document.createElement("a");
    link.href = await buildBrandedQrPngDataUrl(qrPayload(selected, form));
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

  const buildInventoryReportAssets = async (reportVehicles: Vehicle[], includeQRCode = reportIncludeQRCode) => {
    const assets: InventoryReportAssets = {};
    if (!includeQRCode) return assets;
    await Promise.all(
      reportVehicles.map(async (vehicle) => {
        assets[vehicle.id] = {
          qrCode: await buildBrandedQrPngDataUrl(qrPayload(vehicle, vehicleToForm(vehicle)), 192)
        };
      })
    );
    return assets;
  };

  const loadCompleteReportVehicles = async (reportVehicles: Vehicle[]) => {
    return Promise.all(reportVehicles.map((vehicle) => api.vehicle(vehicle.id)));
  };

  const createInventoryReport = async (event?: FormEvent) => {
    event?.preventDefault();
    const reportVehicles = reportSelection === "selected" ? selectedVisibleVehicles : sortedVehicles;
    if (reportVehicles.length === 0) {
      setMessage("Es gibt keine Fahrzeuge für den PDF-Report.");
      return;
    }
    try {
      const completeReportVehicles = await loadCompleteReportVehicles(reportVehicles);
      const assets = await buildInventoryReportAssets(completeReportVehicles);
      const html = inventoryReportHtml(completeReportVehicles, query, sort, {
        mode: reportMode,
        title: reportTitle.trim() || "Fahrzeugsammlung",
        includeQRCode: reportIncludeQRCode,
        includeImages: reportIncludeImages
      }, assets);
      openPrintDocument(html, `railkeeper-inventory-${reportMode}`);
      setReportDialogOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Report konnte nicht erstellt werden.");
    }
  };

  const printVehicleReport = async (vehicle: Vehicle) => {
    try {
      const completeVehicle = await api.vehicle(vehicle.id);
      const assets = await buildInventoryReportAssets([completeVehicle], true);
      const html = inventoryReportHtml([completeVehicle], completeVehicle.inventoryNumber || completeVehicle.name, sort, {
        mode: "details",
        title: completeVehicle.name || completeVehicle.inventoryNumber || "Fahrzeugsammlung",
        includeQRCode: true,
        includeImages: true
      }, assets);
      openPrintDocument(html, `railkeeper-vehicle-${completeVehicle.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Report konnte nicht erstellt werden.");
    }
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
    setOpenSections({ model: true, details: false, vehicle: false });
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
        setOpenSections({ model: true, details: false, vehicle: false });
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
        setOpenSections({ model: true, details: false, vehicle: false });
        setModalOpen(true);
        setMessage("");
      })
      .catch((error: Error) => setMessage(error.message));
  };

  const openQrForVehicle = (vehicle: Vehicle) => {
    setQrDialogOpen(true);
    setQrSvg("");
    setQrError("");
    api
      .vehicle(vehicle.id)
      .then(async (detail) => {
        setSelectedDetail(detail);
        setMode("view");
        setActiveTab("model");
        setOpenSections({ model: true, details: false, vehicle: false });
        setModalOpen(true);
        setQrSvg(await buildQrSvg(detail, vehicleToForm(detail)));
      })
      .catch((error: Error) => setQrError(error.message));
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
      title={t("common.sort", { label: t(`vehicle.field.${key}`) })}
    >
      {t(`vehicle.field.${key}`)}
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
        aria-label={t("vehicles.quickMenu")}
        title={t("vehicles.quickMenu")}
      >
        <MoreVertical size={16} />
      </button>
      {quickMenuVehicleID === vehicle.id && (
        <div className="quick-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => { setQuickMenuVehicleID(""); openDetail(vehicle); }}><Eye size={14} />{t("vehicles.view")}</button>
          <button type="button" role="menuitem" onClick={() => { setQuickMenuVehicleID(""); openEdit(vehicle); }}><Pencil size={14} />{t("vehicles.edit")}</button>
          <span className="quick-menu-separator" role="separator" />
          <button type="button" role="menuitem" onClick={() => { setQuickMenuVehicleID(""); openQrForVehicle(vehicle); }}><QrCode size={14} />QR-Code</button>
          <button type="button" role="menuitem" onClick={() => { setQuickMenuVehicleID(""); printVehicleReport(vehicle); }}><Printer size={14} />{t("overview.print")}</button>
          <button type="button" role="menuitem" onClick={() => { setQuickMenuVehicleID(""); openDetail(vehicle, "uploads"); }}><Upload size={14} />Uploads</button>
          <button type="button" role="menuitem" onClick={() => { setQuickMenuVehicleID(""); openDetail(vehicle, "maintenance"); }}><Wrench size={14} />{t("vehicles.maintenance")}</button>
          <span className="quick-menu-separator" role="separator" />
          <button type="button" role="menuitem" className="danger" onClick={() => { setQuickMenuVehicleID(""); setDeleteCandidate(vehicle); }}><Trash2 size={14} />{t("vehicles.delete")}</button>
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
  const cvFilePreviewStats = {
    cvValues: cvFileUploadPreview?.previews.reduce((sum, preview) => sum + (preview.suggestedCvValues?.length || 0), 0) || 0,
    functions: cvFileUploadPreview?.previews.reduce((sum, preview) => sum + (preview.suggestedFunctions?.length || 0), 0) || 0
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
          <h1>{t("vehicles.title")}</h1>
          <p>{t("vehicles.subtitle")}</p>
        </div>
        <button type="button" className="primary-button new-vehicle-button" onClick={openCreate}>
          <Plus size={16} aria-hidden="true" />
          {t("vehicles.new")}
        </button>
      </section>

      <section className="inventory-status-row" aria-label={t("vehicles.status")}>
        <article className={inventoryFilter === "all" && maintenanceFilter === "all" && !manufacturerFilter && !categoryFilter && !gattungFilter && !exhibitionReadyFilter ? "inventory-status-card active" : "inventory-status-card"}>
          <button
            type="button"
            onClick={() => {
              setInventoryFilter("all");
              setMaintenanceFilter("all");
              setManufacturerFilter("");
              setCategoryFilter("");
              setGattungFilter("");
              setExhibitionReadyFilter(false);
            }}
            aria-label={t("vehicles.status.allAria")}
          >
            <span><PackageSearch size={16} aria-hidden="true" /></span>
            <small>{t("vehicles.totalInventory")}</small>
            <strong>{vehicles.length}</strong>
            <em>{t("overview.categoriesGauges", { categories: inventorySummary.categories, gauges: new Set(vehicles.map((vehicle) => vehicle.gauge).filter(Boolean)).size })}</em>
          </button>
        </article>
        <article className={inventoryFilter === "digital" ? "inventory-status-card active" : "inventory-status-card"}>
          <button type="button" onClick={() => setInventoryFilter("digital")} aria-label={t("vehicles.status.digitalAria")}>
            <span><Gauge size={16} aria-hidden="true" /></span>
            <small>{t("vehicles.digitalization")}</small>
            <strong>{vehicles.length ? Math.round((inventorySummary.digital / vehicles.length) * 100) : 0}%</strong>
            <em>{t("vehicles.digitalAnalog", { digital: inventorySummary.digital, analog: inventorySummary.analog })}</em>
          </button>
        </article>
        <article className={[
          "inventory-status-card",
          maintenanceReminderSummary.due > 0 ? "attention" : "",
          maintenanceFilter === "due" ? "active" : ""
        ].filter(Boolean).join(" ")}>
          <button type="button" onClick={() => setMaintenanceFilter("due")} aria-label={t("vehicles.status.maintenanceAria")}>
            <span>{maintenanceReminderSummary.due > 0 ? <AlertTriangle size={16} aria-hidden="true" /> : <Wrench size={16} aria-hidden="true" />}</span>
            <small>{t("vehicles.maintenance")}</small>
            <strong>{maintenanceReminderSummary.due}</strong>
            <em>{maintenanceReminderSummary.upcoming} geplant</em>
          </button>
        </article>
        <article className="inventory-status-card wide">
          <span><Wrench size={16} aria-hidden="true" /></span>
          <small>{t("vehicles.nextAppointment")}</small>
          {nextMaintenanceReminder ? (
            <button type="button" onClick={() => openDetail(nextMaintenanceReminder.vehicle, "maintenance")}>
              <strong>{nextMaintenanceReminder.vehicle.inventoryNumber}</strong>
              <em>{nextMaintenanceReminder.entry.kind} · {maintenanceReminderText(nextMaintenanceReminder.daysUntilDue)} · {formatDate(nextMaintenanceReminder.entry.dueDate)}</em>
            </button>
          ) : (
            <>
              <strong>{t("vehicles.allQuiet")}</strong>
              <em>{t("vehicles.noDueMaintenance")}</em>
            </>
          )}
        </article>
        <article className={inventoryFilter === "withoutImages" ? "inventory-status-card active" : "inventory-status-card"}>
          <button type="button" onClick={() => setInventoryFilter("withoutImages")} aria-label={t("vehicles.status.imagesAria")}>
            <span><Image size={16} aria-hidden="true" /></span>
            <small>{t("vehicles.imageCare")}</small>
            <strong>{vehicles.length ? Math.round((inventorySummary.withImages / vehicles.length) * 100) : 0}%</strong>
            <em>{t("vehicles.withImage", { count: inventorySummary.withImages })}</em>
          </button>
        </article>
      </section>

      <section className="panel inventory-panel">
        <div className="panel-head inventory-list-head">
          <div className="inventory-title-line">
            <div>
              <h2>{t("vehicles.list.title")}</h2>
              <p>{t("vehicles.list.count", { shown: sortedVehicles.length, total: vehicles.length })}</p>
            </div>
          </div>
          <div className="inventory-toolbar" aria-label={t("vehicles.tools")}>
            <label className="search-field inventory-search">
              <span>
                <Search size={16} aria-hidden="true" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("vehicles.search.placeholder")}
                  aria-label={t("vehicles.search.aria")}
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
              <button type="button" className="icon-button" onClick={() => setReportDialogOpen(true)} aria-label={t("vehicles.report.open")} title={t("vehicles.report.open")} disabled={loading || vehicles.length === 0}>
                <Printer size={16} />
              </button>
              <button type="button" className="icon-button" onClick={load} aria-label="Aktualisieren" title="Aktualisieren" disabled={loading}>
                <RefreshCw size={16} />
              </button>
            </div>
          </div>
          <div className="inventory-filter-row" aria-label={t("vehicles.filter")}>
            <div className="inventory-filter-group">
              {inventoryFilters.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  className={inventoryFilter === filter.key ? "inventory-filter-pill active" : "inventory-filter-pill"}
                  onClick={() => setInventoryFilter(filter.key)}
                  aria-label={filter.label}
                  title={filter.label}
                  aria-pressed={inventoryFilter === filter.key}
                >
                  {filter.icon || <span>{filter.label}</span>}
                </button>
              ))}
            </div>

            <div className="inventory-filter-group">
              {maintenanceFilters.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  className={maintenanceFilter === filter.key ? "inventory-filter-pill active" : "inventory-filter-pill"}
                  onClick={() => setMaintenanceFilter(filter.key)}
                  aria-label={filter.label}
                  title={filter.label}
                  aria-pressed={maintenanceFilter === filter.key}
                >
                  {filter.icon || <span>{filter.label}</span>}
                </button>
              ))}
            </div>

            <select className="inventory-filter-select" value={manufacturerFilter} onChange={(event) => setManufacturerFilter(event.target.value)} aria-label={t("vehicles.filter.manufacturer")}>
              <option value="">{t("vehicles.filter.manufacturer")}</option>
              {inventoryFilterOptions.manufacturers.map((manufacturer) => (
                <option key={manufacturer} value={manufacturer}>{manufacturer}</option>
              ))}
            </select>

            <select
              className="inventory-filter-select"
              value={categoryFilter}
              onChange={(event) => {
                setCategoryFilter(event.target.value);
                setGattungFilter("");
              }}
              aria-label={t("vehicles.filter.category")}
            >
              <option value="">{t("vehicles.filter.category")}</option>
              {inventoryFilterOptions.categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>

            <select className="inventory-filter-select" value={gattungFilter} onChange={(event) => setGattungFilter(event.target.value)} aria-label={t("vehicles.filter.gattung")}>
              <option value="">{t("vehicles.filter.gattung")}</option>
              {inventoryFilterOptions.gattungen.map((gattung) => (
                <option key={gattung} value={gattung}>{gattung}</option>
              ))}
            </select>

            <button
              type="button"
              className={exhibitionReadyFilter ? "inventory-filter-pill inventory-filter-toggle active" : "inventory-filter-pill inventory-filter-toggle"}
              onClick={() => setExhibitionReadyFilter((current) => !current)}
              aria-pressed={exhibitionReadyFilter}
              title={t("vehicles.filter.exhibitionReady")}
            >
              <BadgeCheck size={15} aria-hidden="true" />
              <span>{t("vehicles.filter.exhibitionReady")}</span>
            </button>

            {hasActiveInventoryFilters && (
              <>
                <span className="inventory-filter-divider" aria-hidden="true" />
                <button type="button" className="inventory-filter-clear" onClick={resetInventoryFilters}>
                  <X size={14} aria-hidden="true" />
                  {t("vehicles.filter.clear")}
                </button>
              </>
            )}

            <span className="inventory-filter-result">
              {t("vehicles.filter.result", { count: sortedVehicles.length })}
            </span>
          </div>
        </div>

        {message && <p className="form-message">{message}</p>}

        {!loading && sortedVehicles.length > 0 && (
          <div className="inventory-mobile-list" aria-label="Kompakte Fahrzeugliste">
            {sortedVehicles.map((vehicle) => {
              const image = primaryImage(vehicle.images);
              return (
                <article key={vehicle.id} className="inventory-mobile-item">
                  <button type="button" className="inventory-mobile-media" onClick={() => openDetail(vehicle)} aria-label={`${vehicle.inventoryNumber} anzeigen`}>
                    {image ? (
                      <img src={previewImageUrl(image)} alt="" />
                    ) : (
                      <div className="image-placeholder">{t("exhibition.noPreview")}</div>
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
                    <button type="button" className="icon-button" onClick={() => openEdit(vehicle)} aria-label={t("vehicles.edit")} title={t("vehicles.edit")}>
                      <Pencil size={16} />
                    </button>
                    <button type="button" className="icon-button danger" onClick={() => setDeleteCandidate(vehicle)} aria-label={t("vehicles.delete")} title={t("vehicles.delete")}>
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
          <p className="empty-state">{t("vehicles.loading")}</p>
        ) : vehicles.length === 0 ? (
          <p className="empty-state">{t("vehicles.empty")}</p>
        ) : sortedVehicles.length === 0 ? (
          <p className="empty-state">{t("vehicles.emptyFilter")}</p>
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
                      <div className="image-placeholder">{t("exhibition.noPreview")}</div>
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
                        <dt>{t("importExport.review.article")}</dt>
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
                      <button type="button" className="icon-button" onClick={() => openDetail(vehicle)} aria-label={t("exhibition.view")} title={t("exhibition.view")}>
                        <Eye size={16} />
                      </button>
                      <button type="button" className="icon-button" onClick={() => openEdit(vehicle)} aria-label={t("vehicles.edit")} title={t("vehicles.edit")}>
                        <Pencil size={16} />
                      </button>
                      <button type="button" className="icon-button danger" onClick={() => setDeleteCandidate(vehicle)} aria-label={t("vehicles.delete")} title={t("vehicles.delete")}>
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
                  <th className="select-cell">
                    <label className="table-select-field" title={t("vehicles.report.selectAll")}>
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleAllVisibleSelection}
                        aria-label={t("vehicles.report.selectAll")}
                        disabled={sortedVehicles.length === 0}
                      />
                    </label>
                  </th>
                  <th>{t("vehicles.image")}</th>
                  <th>{sortHeader("inventoryNumber")}</th>
                  <th>{sortHeader("manufacturer")}</th>
                  <th>{sortHeader("articleNumber")}</th>
                  <th>{sortHeader("name")}</th>
                  <th>{sortHeader("gauge")}</th>
                  <th>{sortHeader("epoch")}</th>
                  <th>{sortHeader("category")}</th>
                  <th className="actions-cell">{t("vehicles.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {sortedVehicles.map((vehicle) => (
                  <tr key={vehicle.id} className={selectedVehicleIDs.has(vehicle.id) ? "selected-row" : ""}>
                    <td className="select-cell">
                      <label className="table-select-field" title={t("vehicles.report.selectVehicle")}>
                        <input
                          type="checkbox"
                          checked={selectedVehicleIDs.has(vehicle.id)}
                          onChange={() => toggleVehicleSelection(vehicle.id)}
                          aria-label={`${vehicle.inventoryNumber} ${t("vehicles.report.selectVehicle")}`}
                        />
                      </label>
                    </td>
                    <td>
                      {primaryImage(vehicle.images) ? (
                        <img className="inventory-thumb" src={previewImageUrl(primaryImage(vehicle.images))} alt="" />
                      ) : (
                        <div className="image-placeholder">{t("exhibition.noPreview")}</div>
                      )}
                    </td>
                    <td>{vehicle.inventoryNumber}</td>
                    <td>{vehicle.manufacturer}</td>
                    <td>{vehicle.articleNumber || "-"}</td>
                    <td>
                      <button type="button" className="inventory-name-link" onClick={() => openDetail(vehicle)}>
                        {vehicle.name}
                      </button>
                    </td>
                    <td>{vehicle.gauge}</td>
                    <td>{vehicle.epoch || "-"}</td>
                    <td>{vehicle.category || "-"}</td>
                    <td className="actions-cell">
                      <div className="table-actions">
                        <button type="button" className="icon-button" onClick={() => openDetail(vehicle)} aria-label={t("exhibition.view")} title={t("exhibition.view")}>
                          <Eye size={16} />
                        </button>
                        <button type="button" className="icon-button" onClick={() => openEdit(vehicle)} aria-label={t("vehicles.edit")} title={t("vehicles.edit")}>
                          <Pencil size={16} />
                        </button>
                        <button type="button" className="icon-button danger" onClick={() => setDeleteCandidate(vehicle)} aria-label={t("vehicles.delete")} title={t("vehicles.delete")}>
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

      {reportDialogOpen && (
        <div className="confirm-layer report-layer" role="dialog" aria-modal="true" aria-label={t("vehicles.report.title")}>
          <form className="report-dialog" onSubmit={createInventoryReport}>
            <header className="report-dialog-head">
              <div>
                <Printer size={18} aria-hidden="true" />
                <h2>{t("vehicles.report.title")}</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setReportDialogOpen(false)} aria-label={t("vehicles.close")} title={t("vehicles.close")}>
                <X size={18} />
              </button>
            </header>

            <div className="report-form-grid">
              <label>
                {t("vehicles.report.type")}
                <select value={reportMode} onChange={(event) => setReportMode(event.target.value as InventoryReportMode)}>
                  <option value="summary">{t("vehicles.report.summary")}</option>
                  <option value="details">{t("vehicles.report.details")}</option>
                </select>
              </label>

              <label>
                {t("vehicles.report.customTitle")}
                <input value={reportTitle} onChange={(event) => setReportTitle(event.target.value)} placeholder="Fahrzeugsammlung" />
              </label>

              <fieldset className="report-choice-group">
                <legend>{t("vehicles.report.scope")}</legend>
                <label>
                  <input type="radio" checked={reportSelection === "all"} onChange={() => setReportSelection("all")} />
                  {t("vehicles.report.all")}
                </label>
                <label>
                  <input type="radio" checked={reportSelection === "selected"} onChange={() => setReportSelection("selected")} disabled={!someVisibleSelected} />
                  {t("vehicles.report.selected", { count: selectedVisibleVehicles.length })}
                </label>
              </fieldset>

              <fieldset className="report-choice-group">
                <legend>{t("vehicles.report.options")}</legend>
                <label>
                  <input type="checkbox" checked={reportIncludeQRCode} onChange={(event) => setReportIncludeQRCode(event.target.checked)} />
                  {t("vehicles.report.qrCode")}
                </label>
                <label>
                  <input type="checkbox" checked={reportIncludeImages} onChange={(event) => setReportIncludeImages(event.target.checked)} />
                  {t("vehicles.report.image")}
                </label>
              </fieldset>
            </div>

            <footer className="report-dialog-actions">
              <button type="button" className="secondary-button" onClick={() => setReportDialogOpen(false)}>
                {t("vehicles.cancel")}
              </button>
              <button type="submit" className="primary-button">
                {t("vehicles.report.create")}
              </button>
            </footer>
          </form>
        </div>
      )}

      {modalOpen && (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-label={t("vehicles.modal.aria")}>
          <form key={`${mode}-${selected?.id || "new"}`} className={mode === "view" ? "vehicle-modal vehicle-read-modal-shell" : "vehicle-modal"} onSubmit={submit}>
            <header className="modal-head">
              <h2>{mode === "create" ? t("vehicles.modal.create") : mode === "edit" ? t("vehicles.modal.edit") : t("vehicles.modal.view")}</h2>
              <button type="button" className="icon-button" onClick={closeModal} aria-label={t("vehicles.close")} title={t("vehicles.close")}>
                <X size={18} />
              </button>
            </header>

            {mode === "view" && selected ? (
              <VehicleReadOnlyView
                vehicle={selected}
                onEdit={() => openEdit(selected)}
                onPrint={() => printVehicleReport(selected)}
                onQr={generateQr}
                onPreviewImage={setPreviewImage}
              />
            ) : (
              <>
            <nav className="modal-tabs" aria-label={t("vehicles.modal.aria")}>
              <button type="button" className={activeTab === "model" ? "active" : ""} onClick={() => setActiveTab("model")}>
                {t("vehicles.tab.model")}
              </button>
              <button type="button" className={activeTab === "control" ? "active" : ""} onClick={() => setActiveTab("control")}>
                {t("vehicles.tab.control")}
              </button>
              <button type="button" className={activeTab === "cv" ? "active" : ""} onClick={() => setActiveTab("cv")}>
                CV
              </button>
              <button type="button" className={activeTab === "uploads" ? "active" : ""} onClick={() => setActiveTab("uploads")}>
                {t("vehicles.tab.uploads")}
              </button>
              <button type="button" className={activeTab === "maintenance" ? "active" : ""} onClick={() => setActiveTab("maintenance")}>
                {t("vehicles.tab.maintenance")}
              </button>
            </nav>

            <div className="modal-body">
              {activeTab === "model" && (
                <div className="accordion-stack">
                  <section className="accordion-section">
                    <button type="button" className="accordion-trigger" onClick={() => toggleSection("model")}>
                      {openSections.model ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      {t("vehicles.tab.model")}
                    </button>
                    {openSections.model && (
                      <div className="accordion-content vehicle-form">
                        <div className="article-search-box">
                          <div>
                            <strong>{t("vehicles.articleSearch.title")}</strong>
                            <span>{t("vehicles.articleSearch.subtitle")}</span>
                          </div>
                          <div className="article-search-actions">
                            <button type="button" className="secondary-button" onClick={openBarcodeSearch} disabled={readonly || articleSearchLoading} title={t("vehicles.articleSearch.barcodeTitle")}>
                              <Barcode size={15} aria-hidden="true" />
                              {t("vehicles.articleSearch.barcode")}
                            </button>
                            <button type="button" className="secondary-button" onClick={() => runArticleSearch()} disabled={readonly || articleSearchLoading}>
                              <PackageSearch size={15} aria-hidden="true" />
                              {articleSearchLoading ? t("vehicles.articleSearch.searching") : t("vehicles.articleSearch.search")}
                            </button>
                          </div>
                        </div>

                        {form.articleSourceUrl && (
                          <p className="source-note compact-source-note">
                            <ExternalLink size={15} aria-hidden="true" />
                            <span>
                              {t("vehicles.source")}: <a href={form.articleSourceUrl} target="_blank" rel="noreferrer">{sourceDisplayName(form.articleSourceUrl)}</a>
                            </span>
                          </p>
                        )}

                        <div className="form-row">
                          <label>
                            {t("vehicle.field.inventoryNumber")}
                            <input value={form.inventoryNumber || ""} onChange={(event) => update({ inventoryNumber: event.target.value })} disabled={readonly} placeholder={t("vehicles.inventoryNumberAuto")} />
                          </label>
                          <label>
                            {t("vehicle.field.articleNumber")}
                            <input value={form.articleNumber || ""} onChange={(event) => update({ articleNumber: event.target.value })} disabled={readonly} />
                          </label>
                        </div>

                        <div className="form-row">
                          <label>
                            {t("vehicle.field.manufacturer")} *
                            <select value={form.manufacturer} onChange={(event) => update({ manufacturer: event.target.value })} disabled={readonly} required>
                              {selectOptions(options.manufacturers, t("vehicles.select.placeholder"))}
                            </select>
                          </label>
                          <label>
                            {t("vehicle.field.gauge")} *
                            <select value={form.gauge} onChange={(event) => update({ gauge: event.target.value })} disabled={readonly} required>
                              {selectOptions(options.gauges, t("vehicles.select.placeholder"))}
                            </select>
                          </label>
                        </div>

                        <label>
                          {t("vehicle.field.name")} *
                          <input value={form.name} onChange={(event) => update({ name: event.target.value })} disabled={readonly} required />
                        </label>

                        <div className="form-row">
                          <label>
                            {t("vehicle.field.railwayCompany")}
                            <select value={form.railwayCompany || ""} onChange={(event) => update({ railwayCompany: event.target.value })} disabled={readonly}>
                              {selectOptions(options.railwayCompanies)}
                            </select>
                          </label>
                          <label>
                            {t("vehicle.field.epoch")}
                            <select value={form.epoch || ""} onChange={(event) => update({ epoch: event.target.value })} disabled={readonly}>
                              {selectOptions(options.epochs)}
                            </select>
                          </label>
                        </div>

                        <div className="form-row">
                          <label>
                            {t("vehicle.field.category")}
                            <select value={form.category || ""} onChange={(event) => updateCategory(event.target.value)} disabled={readonly}>
                              {selectOptions(options.categories)}
                            </select>
                          </label>
                          <label>
                            {t("vehicle.field.gattung")}
                            <select value={form.gattung || ""} onChange={(event) => update({ gattung: event.target.value })} disabled={readonly || filteredGattungen.length === 0}>
                              {selectOptions(filteredGattungen)}
                            </select>
                          </label>
                        </div>

                        <label>
                          {t("vehicle.field.description")}
                          <textarea value={form.description || ""} onChange={(event) => update({ description: event.target.value })} disabled={readonly} rows={4} />
                        </label>

                        <div className="form-row">
                          <label>
                            {t("vehicle.field.series")}
                            <input value={form.series || ""} onChange={(event) => update({ series: event.target.value })} disabled={readonly} />
                          </label>
                          <label>
                            {t("vehicle.field.vehicleNumber")}
                            <input value={form.vehicleNumber || ""} onChange={(event) => update({ vehicleNumber: event.target.value })} disabled={readonly} />
                          </label>
                        </div>

                        <div className="form-row decoder-row">
                          <label>
                            {t("vehicle.field.digitalDecoderNumber")}
                            <span className="inline-switch-input">
                              <span className="switch-field" aria-label="Digital">
                                <input type="checkbox" checked={Boolean(form.digital)} onChange={(event) => update({ digital: event.target.checked })} disabled={readonly} />
                                <span />
                              </span>
                              <input value={form.digitalDecoderNumber || ""} onChange={(event) => update({ digitalDecoderNumber: event.target.value })} disabled={readonly || !form.digital} />
                            </span>
                          </label>
                          <label>
                            {t("vehicle.field.dtDecoderNumber")}
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
                            {t("vehicle.field.exhibitionReady")}
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
                            {t("vehicle.field.productionPeriod")}
                            <input value={form.productionPeriod || ""} onChange={(event) => update({ productionPeriod: event.target.value })} disabled={readonly} placeholder="TT. MM. JJJJ" />
                          </label>
                          <label>
                            {t("vehicle.field.listPrice")}
                            <input value={form.listPrice || ""} onChange={(event) => update({ listPrice: event.target.value })} disabled={readonly} inputMode="decimal" />
                          </label>
                        </div>
                      </div>
                    )}
                  </section>

                  <section className="accordion-section">
                    <button type="button" className="accordion-trigger" onClick={() => toggleSection("details")}>
                      {openSections.details ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      {t("vehicles.details.title")}
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

                  <section className="accordion-section">
                    <button type="button" className="accordion-trigger" onClick={() => toggleSection("vehicle")}>
                      {openSections.vehicle ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      {t("vehicles.vehicle.title")}
                    </button>
                    {openSections.vehicle && (
                      <div className="accordion-content vehicle-form">
                        <VehicleOwnershipFields
                          form={form}
                          readonly={readonly}
                          update={update}
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
                      <h3>{t("vehicles.functions.title")}</h3>
                      <p>{t("vehicles.functions.subtitle")}</p>
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
                    {!selected && <p className="empty-state compact">{t("vehicles.functions.emptyUntilSave")}</p>}
                  {selected && (
                    <div className="function-list">
                      <div className="function-toolbar">
                        <div className="function-summary">
                          <span><strong>{functionSummary.configured}</strong> {t("vehicles.functions.configured")}</span>
                          <span><strong>{functionSummary.sound}</strong> {t("vehicles.functions.sound")}</span>
                          <span><strong>{functionSummary.light}</strong> {t("vehicles.functions.light")}</span>
                        </div>
                        <label className="switch-label compact-switch">
                          <span>{t("vehicles.functions.onlyConfigured")}</span>
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
                        <p className="empty-state compact">{t("vehicles.functions.empty")}</p>
                      )}
                      {visibleFunctionKeys.map((functionKey) => {
                        const edit = functionEdit(functionKey);
                        return (
                          <article key={functionKey} className={edit.persisted ? "function-row persisted" : "function-row"}>
                            <strong className="function-key">
                              {functionSymbolIcon(edit.symbolKey, edit.functionType, functionSymbolMetadata(options.symbols, edit.symbolKey))}
                              {functionKey}
                            </strong>
                            <input
                              className="function-name-input"
                              value={edit.name || ""}
                              onChange={(event) => updateFunctionEdit(functionKey, { name: event.target.value })}
                              disabled={readonly || saving}
                              placeholder={t("vehicles.functions.name")}
                              aria-label={`${functionKey} ${t("vehicles.functions.name")}`}
                            />
                            <FunctionSymbolPicker
                              value={edit.symbolKey || ""}
                              functionType={edit.functionType}
                              symbols={options.symbols}
                              disabled={readonly || saving}
                              label={`${functionKey} ${t("vehicles.functions.symbol")}`}
                              onChange={(symbolKey) => updateFunctionEdit(functionKey, {
                                symbolKey,
                                functionType: inferFunctionTypeFromSymbol(symbolKey, options.symbols, edit.functionType)
                              })}
                            />
                            <select
                              value={edit.mode || "dauer"}
                              onChange={(event) => updateFunctionEdit(functionKey, { mode: event.target.value })}
                              disabled={readonly || saving}
                              aria-label={`${functionKey} ${t("vehicles.functions.mode")}`}
                            >
                              {functionModes.map((modeName) => (
                                <option key={modeName} value={modeName}>{t(`vehicles.functionMode.${modeName}`)}</option>
                              ))}
                            </select>
                            <label className="switch-card function-direction">
                              <span>{t("vehicles.functions.direction")}</span>
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
                              className="function-note-input"
                              value={edit.notes || ""}
                              onChange={(event) => updateFunctionEdit(functionKey, { notes: event.target.value })}
                              disabled={readonly || saving}
                              placeholder={t("vehicles.functions.note")}
                              aria-label={`${functionKey} ${t("vehicles.functions.note")}`}
                            />
                            <div className="function-actions">
                              <button type="button" className="icon-button" onClick={() => saveFunction(functionKey)} disabled={readonly || saving} aria-label={t("vehicles.functions.save", { key: functionKey })} title={t("vehicles.save")}>
                                <Save size={15} />
                              </button>
                              <button type="button" className="icon-button danger" onClick={() => deleteFunction(functionKey)} disabled={readonly || saving || !edit.persisted} aria-label={t("vehicles.functions.delete", { key: functionKey })} title={t("vehicles.delete")}>
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
                        <h3>{t("vehicles.cv.title")}</h3>
                        <p>{t("vehicles.cv.subtitle")}</p>
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
                    {!selected && <p className="empty-state compact">{t("vehicles.cv.emptyUntilSave")}</p>}
                    {selected && (
                      <>
                        <div className="cv-summary">
                          <div>
                            <span>{t("vehicles.cv.values")}</span>
                            <strong>{cvSummary.values}</strong>
                          </div>
                          <div>
                            <span>{t("vehicles.cv.profiles")}</span>
                            <strong>{cvSummary.profiles}</strong>
                          </div>
                          <div>
                            <span>{t("vehicles.cv.files")}</span>
                            <strong>{cvSummary.files}</strong>
                          </div>
                        </div>
                        {cvImportPreview && (
                          <section className="cv-import-preview" aria-label={t("vehicles.cv.importPreview")}>
                            <div className="cv-import-head">
                              <div>
                                <h4>{t("vehicles.cv.importCheck")}</h4>
                                <p>{cvImportPreview.fileName}</p>
                              </div>
                              <div className="cv-import-badges" aria-label={t("vehicles.cv.importSummary")}>
                                <span>{t("vehicles.cv.new", { count: cvImportStats.new })}</span>
                                <span>{t("vehicles.cv.changed", { count: cvImportStats.changed })}</span>
                                <span>{t("vehicles.cv.same", { count: cvImportStats.same })}</span>
                                {cvImportStats.invalid > 0 && <span className="danger">{t("vehicles.cv.invalid", { count: cvImportStats.invalid })}</span>}
                              </div>
                            </div>
                            <div className="cv-import-actions">
                              <button type="button" className="secondary-button" onClick={() => selectCVImportRows("empty")} disabled={saving}>
                                {t("vehicles.cv.onlyNew")}
                              </button>
                              <button type="button" className="secondary-button" onClick={() => selectCVImportRows("all")} disabled={saving}>
                                {t("vehicles.articleSearch.selectAll")}
                              </button>
                              <button type="button" className="secondary-button" onClick={() => selectCVImportRows("none")} disabled={saving}>
                                {t("vehicles.articleSearch.selectNone")}
                              </button>
                              <button type="button" className="primary-button" onClick={applyCVImportPreview} disabled={saving || cvImportStats.selected === 0}>
                                <Check size={15} aria-hidden="true" />
                                {t("vehicles.articleSearch.applySelected")}
                              </button>
                              <button type="button" className="secondary-button" onClick={() => setCVImportPreview(null)} disabled={saving}>
                                {t("vehicles.cv.discard")}
                              </button>
                            </div>
                            <div className="table-wrap compact-table cv-import-table">
                              <table>
                                <thead>
                                  <tr>
                                    <th>{t("vehicles.articleSearch.apply")}</th>
                                    <th>CV</th>
                                    <th>{t("vehicles.articleSearch.current")}</th>
                                    <th>Import</th>
                                    <th>{t("vehicles.cv.profiles")}</th>
                                    <th>{t("vehicles.articleSearch.status")}</th>
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
                                          aria-label={t("vehicles.cv.applyCv", { cv: row.input.cvNumber })}
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
                                <button type="button" key={profile} onClick={() => updateCVForm({ decoderProfile: profile })} disabled={readonly || saving} title={t("vehicles.cv.useProfile", { profile })}>
                                  <strong>{profile}</strong>
                                  <span>{valueCount} CV · {fileCount} {t("vehicles.cv.files").toLocaleLowerCase()}</span>
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
                            {t("vehicle.field.value")}
                            <input type="number" min={0} max={255} value={cvForm.value} onChange={(event) => updateCVForm({ value: Number(event.target.value) })} disabled={readonly || saving} />
                          </label>
                          <label>
                            {t("vehicle.field.category")}
                            <select value={cvForm.category || ""} onChange={(event) => updateCVForm({ category: event.target.value })} disabled={readonly || saving}>
                              <option value="">{t("vehicle.field.category")}</option>
                              {cvCategories.map((category) => (
                                <option key={category} value={category}>{category}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            {t("vehicle.field.decoderProfile")}
                            <input list="decoder-profile-options" value={cvForm.decoderProfile || ""} onChange={(event) => updateCVForm({ decoderProfile: event.target.value })} disabled={readonly || saving} placeholder="z. B. ESU LokPilot 5" />
                          </label>
                          <label>
                            {t("vehicles.cv.sourceFile")}
                            <select value={cvForm.sourceFileId || ""} onChange={(event) => updateCVForm({ sourceFileId: event.target.value })} disabled={readonly || saving}>
                              <option value="">{t("vehicles.cv.noFile")}</option>
                              {(selected.cvFiles || []).map((file) => (
                                <option key={file.id} value={file.id}>{file.originalName}</option>
                              ))}
                            </select>
                          </label>
                          <label className="cv-description">
                            {t("vehicles.cv.description")}
                            <input value={cvForm.description || ""} onChange={(event) => updateCVForm({ description: event.target.value })} disabled={readonly || saving} />
                          </label>
                        </div>
                        <div className="cv-actions">
                          {editingCVID && (
                            <button type="button" className="secondary-button" onClick={resetCVForm} disabled={readonly || saving}>
                              {t("vehicles.cancel")}
                            </button>
                          )}
                          <button type="button" className="primary-button" onClick={saveCVValue} disabled={readonly || saving}>
                            <Save size={15} aria-hidden="true" />
                            {editingCVID ? t("vehicles.cv.saveCv") : t("vehicles.cv.addCv")}
                          </button>
                        </div>
                      </>
                    )}
                  </section>

                  <section className="cv-table-section">
                    {selected && (!selected.cvValues || selected.cvValues.length === 0) && (
                      <p className="empty-state compact">{t("vehicles.cv.empty")}</p>
                    )}
                    {selected && selected.cvValues && selected.cvValues.length > 0 && (
                      <div className="table-wrap compact-table">
                        <table>
                          <thead>
                            <tr>
                              <th>CV</th>
                              <th>{t("vehicle.field.value")}</th>
                              <th>{t("vehicle.field.category")}</th>
                              <th>{t("vehicle.field.decoderProfile")}</th>
                              <th>{t("vehicles.cv.description")}</th>
                              <th>{t("vehicles.actions")}</th>
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
                                      <button type="button" className="icon-button" onClick={() => editCVValue(value)} disabled={readonly || saving} aria-label={t("vehicles.cv.edit")} title={t("vehicles.cv.edit")}>
                                        <Pencil size={15} />
                                      </button>
                                      <button type="button" className="icon-button danger" onClick={() => deleteCVValue(value)} disabled={readonly || saving} aria-label={t("vehicles.cv.delete")} title={t("vehicles.cv.delete")}>
                                        <Trash2 size={15} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                                {value.history && value.history.length > 0 && (
                                  <tr className="cv-history-row">
                                    <td colSpan={6}>
                                      <details>
                                        <summary>{t("vehicles.cv.history", { count: value.history.length, suffix: value.history.length === 1 ? "" : language === "de" ? "en" : "s" })}</summary>
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
                        <h3>{t("vehicles.cv.filesTitle")}</h3>
                        <p>{t("vehicles.cv.filesSubtitle")}</p>
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
                        {t("vehicles.cv.uploadFile")}
                      </button>
                    </div>
                    {selected && (
                      <div className="cv-file-controls">
                        <input list="decoder-profile-options" value={cvFileProfile} onChange={(event) => setCVFileProfile(event.target.value)} disabled={readonly || saving} placeholder={t("vehicles.cv.fileProfilePlaceholder")} />
                        <input value={cvFileDescription} onChange={(event) => setCVFileDescription(event.target.value)} disabled={readonly || saving} placeholder={t("vehicles.cv.fileNotePlaceholder")} />
                        <span>{t("vehicles.cv.autoMetadata")}</span>
                      </div>
                    )}
                    {selected && cvFileUploadPreview && (
                      <section className="cv-file-preview">
                        <div className="upload-head compact">
                          <div>
                            <h3>{t("vehicles.cv.uploadPreview")}</h3>
                            <p>{t("vehicles.cv.previewHelp")}</p>
                          </div>
                          <div className="inline-actions">
                            <button type="button" className="secondary-button" onClick={applyFirstCVFileSuggestion} disabled={saving || !cvFileUploadPreview.previews.some((preview) => preview.hasMetadata)}>
                              {t("vehicles.cv.applySuggestion")}
                            </button>
                            <button type="button" className="secondary-button" onClick={previewCVFileValuesForImport} disabled={saving || readonly || cvFilePreviewStats.cvValues === 0}>
                              {t("vehicles.cv.checkCvs")}
                            </button>
                            <button type="button" className="secondary-button" onClick={applyCVFileFunctionSuggestions} disabled={saving || readonly || cvFilePreviewStats.functions === 0}>
                              {t("vehicles.cv.applyFunctions")}
                            </button>
                            <button type="button" className="primary-button" onClick={confirmCVFileUpload} disabled={saving || readonly}>
                              <Upload size={15} aria-hidden="true" />
                              {t("vehicles.cv.saveFiles")}
                            </button>
                            <button type="button" className="secondary-button" onClick={() => setCVFileUploadPreview(null)} disabled={saving}>
                              {t("vehicles.cancel")}
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
                              {preview.suggestedPreviewImage && (
                                <figure className="decoder-preview-image">
                                  <img src={preview.suggestedPreviewImage.dataUrl} alt="" />
                                  <figcaption>{preview.suggestedPreviewImage.width} × {preview.suggestedPreviewImage.height}</figcaption>
                                </figure>
                              )}
                              {preview.hasMetadata ? (
                                <dl>
                                  <div><dt>{t("vehicles.cv.project")}</dt><dd>{preview.projectName || "-"}</dd></div>
                                  <div><dt>{t("vehicles.cv.decoder")}</dt><dd>{preview.decoder || "-"}</dd></div>
                                  <div><dt>{t("vehicles.cv.address")}</dt><dd>{preview.address || "-"}</dd></div>
                                  <div><dt>{t("vehicles.cv.type")}</dt><dd>{preview.type || "-"}</dd></div>
                                  <div><dt>{t("vehicles.cv.manufacturer")}</dt><dd>{preview.manufacturer || "-"}</dd></div>
                                  <div><dt>LokProgrammer</dt><dd>{preview.lokProgrammer || "-"}</dd></div>
                                </dl>
                              ) : (
                                <p>{t("vehicles.cv.noMetadata")}</p>
                              )}
                              {((preview.suggestedCvValues?.length || 0) > 0 || (preview.suggestedFunctions?.length || 0) > 0) && (
                                <div className="decoder-preview-summary">
                                  {(preview.suggestedCvValues?.length || 0) > 0 && (
                                    <span>{t("vehicles.cv.detectedValues", { count: preview.suggestedCvValues?.length || 0 })}</span>
                                  )}
                                  {(preview.suggestedFunctions?.length || 0) > 0 && (
                                    <span>{t("vehicles.cv.detectedFunctions", { count: preview.suggestedFunctions?.length || 0 })}</span>
                                  )}
                                </div>
                              )}
                            </article>
                          ))}
                        </div>
                      </section>
                    )}
                    {selected && (!selected.cvFiles || selected.cvFiles.length === 0) && (
                      <p className="empty-state compact">{t("vehicles.cv.filesEmpty")}</p>
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
                                <span>{file.decoderProfile || t("vehicles.cv.noProfile")} - {file.mimeType || "Datei"} - {formatFileSize(file.sizeBytes)}</span>
                                {file.description && <span>{file.description}</span>}
                              </div>
                              <div className="attachment-actions">
                                <a className="secondary-button" href={downloadUrl}>
                                  <Download size={15} aria-hidden="true" />
                                  Download
                                </a>
                                <button type="button" className="danger-button" onClick={() => deleteCVFile(file)} disabled={readonly || saving}>
                                  <Trash2 size={15} aria-hidden="true" />
                                  {t("vehicles.delete")}
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
                        <h3>{t("vehicles.uploads.imagesTitle")}</h3>
                        <p>{t("vehicles.uploads.imagesSubtitle")}</p>
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
                          aria-label={t("vehicles.uploads.noNewMaintenance")}
                        >
                          <option value="">{t("vehicles.uploads.noNewMaintenance")}</option>
                          {maintenanceEntries.map((entry) => (
                            <option key={entry.id} value={entry.id}>{maintenanceOptionLabel(entry)}</option>
                          ))}
                        </select>
                      )}
                      <button type="button" className="primary-button" onClick={() => imageInputRef.current?.click()} disabled={readonly || !selected || saving}>
                        <Upload size={16} aria-hidden="true" />
                        {t("vehicles.uploads.imageUpload")}
                      </button>
                    </div>
                    {!selected && <p className="empty-state compact">{t("vehicles.uploads.noImagesUntilSave")}</p>}
                    {pendingArticleImages.length === 0 ? (
                      <div className="upload-list">
                        <div className="image-placeholder large">
                          <Image size={22} aria-hidden="true" />
                          {t("vehicles.uploads.noPreview")}
                        </div>
                        <span>{t("vehicles.uploads.noImage")}</span>
                      </div>
                    ) : (
                      <div className="pending-image-grid">
                        {pendingArticleImages.map((image, imageIndex) => (
                          <figure key={image.id} className={image.isPrimary ? "pending-image-card primary" : "pending-image-card"}>
                            <button type="button" className="image-preview-button" onClick={() => setPreviewImage(image)} title={t("vehicles.uploads.openOriginal")} aria-label={t("vehicles.uploads.openOriginal")}>
                              <img src={image.url} alt="" />
                            </button>
                            <figcaption>
                              <input
                                value={image.title || ""}
                                onChange={(event) => updatePendingImageTitle(image.id, event.target.value)}
                                disabled={readonly}
                                placeholder={t("vehicles.uploads.imageDescription")}
                                aria-label={t("vehicles.uploads.imageDescription")}
                              />
                              <span>{sourceDisplayName(image.source)}</span>
                              {maintenanceEntries.length > 0 && (
                                <select
                                  className="image-maintenance-select"
                                  value={image.maintenanceId || ""}
                                  onChange={(event) => updatePendingImageMaintenance(image.id, event.target.value)}
                                  disabled={readonly || saving}
                                  aria-label={t("vehicles.uploads.linkMaintenance")}
                                >
                                  <option value="">{t("vehicles.uploads.noMaintenance")}</option>
                                  {maintenanceEntries.map((entry) => (
                                    <option key={entry.id} value={entry.id}>{maintenanceOptionLabel(entry)}</option>
                                  ))}
                                </select>
                              )}
                              <div className="image-card-actions">
                                <a className="icon-button" href={image.source} target="_blank" rel="noreferrer" aria-label={t("vehicles.uploads.openSource")} title={t("vehicles.uploads.openSource")}>
                                  <ExternalLink size={15} />
                                </a>
                                <button type="button" className="icon-button" onClick={() => movePendingImage(image.id, -1)} disabled={readonly || imageIndex === 0} aria-label={t("vehicles.uploads.moveUp")} title={t("vehicles.uploads.moveUp")}>
                                  <ChevronUp size={15} />
                                </button>
                                <button type="button" className="icon-button" onClick={() => movePendingImage(image.id, 1)} disabled={readonly || imageIndex === pendingArticleImages.length - 1} aria-label={t("vehicles.uploads.moveDown")} title={t("vehicles.uploads.moveDown")}>
                                  <ChevronDown size={15} />
                                </button>
                                <button type="button" className={image.isPrimary ? "icon-button active" : "icon-button"} onClick={() => setPrimaryPendingImage(image.id)} aria-label={t("vehicles.uploads.markPrimary")} title={image.isPrimary ? t("vehicles.uploads.primary") : t("vehicles.uploads.markPrimary")}>
                                  <Star size={15} />
                                </button>
                                <button
                                  type="button"
                                  className="icon-button danger"
                                  onClick={() => removePendingImage(image)}
                                  disabled={readonly || saving}
                                  aria-label={t("vehicles.uploads.removeImage")}
                                  title={t("vehicles.uploads.removeImage")}
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
                        <h3>{t("vehicles.uploads.attachmentsTitle")}</h3>
                        <p>{t("vehicles.uploads.attachmentsSubtitle")}</p>
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
                        {t("vehicles.uploads.attachmentUpload")}
                      </button>
                    </div>
                    <section
                      className={`attachment-upload-zone ${attachmentDragActive ? "active" : ""}`}
                      onDragEnter={onAttachmentDrag}
                      onDragOver={onAttachmentDrag}
                      onDragLeave={onAttachmentDrag}
                      onDrop={onAttachmentDrop}
                      aria-label={t("vehicles.uploads.dropAria")}
                    >
                      <div>
                        <strong>{t("vehicles.uploads.dropTitle")}</strong>
                        <span>{t("vehicles.uploads.dropHelp")}</span>
                      </div>
                      <div className="attachment-upload-fields">
                        <select value={attachmentUploadCategory} onChange={(event) => setAttachmentUploadCategory(event.target.value)} disabled={readonly || !selected || saving}>
                          <option value="">{t("vehicles.uploads.autoCategory")}</option>
                          {attachmentCategories.map((category) => (
                            <option key={category} value={category}>{category}</option>
                          ))}
                        </select>
                        <select value={attachmentUploadMaintenanceID} onChange={(event) => setAttachmentUploadMaintenanceID(event.target.value)} disabled={readonly || !selected || saving}>
                          <option value="">{t("vehicles.uploads.noMaintenance")}</option>
                          {maintenanceEntries.map((entry) => (
                            <option key={entry.id} value={entry.id}>{maintenanceOptionLabel(entry)}</option>
                          ))}
                        </select>
                        <input
                          value={attachmentUploadDescription}
                          onChange={(event) => setAttachmentUploadDescription(event.target.value)}
                          disabled={readonly || !selected || saving}
                          placeholder={t("vehicles.uploads.notePlaceholder")}
                        />
                      </div>
                    </section>
                    {!selected && <p className="empty-state compact">{t("vehicles.uploads.attachmentsUntilSave")}</p>}
                    {selected && (!selected.attachments || selected.attachments.length === 0) && (
                      <p className="empty-state compact">{t("vehicles.uploads.attachmentsEmpty")}</p>
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
                                <span>{attachment.category || t("vehicles.uploads.noCategory")} - {attachment.mimeType || "Datei"} - {formatFileSize(attachment.sizeBytes)}</span>
                                <div className="attachment-edit-row">
                                  <select value={edit.category} onChange={(event) => updateAttachmentEdit(attachment.id, { category: event.target.value })} disabled={readonly}>
                                    <option value="">{t("vehicles.uploads.category")}</option>
                                    {attachmentCategories.map((category) => (
                                      <option key={category} value={category}>{category}</option>
                                    ))}
                                  </select>
                                  <select value={edit.maintenanceId} onChange={(event) => updateAttachmentEdit(attachment.id, { maintenanceId: event.target.value })} disabled={readonly}>
                                    <option value="">{t("vehicles.uploads.noMaintenance")}</option>
                                    {maintenanceEntries.map((entry) => (
                                      <option key={entry.id} value={entry.id}>{maintenanceOptionLabel(entry)}</option>
                                    ))}
                                  </select>
                                  <input value={edit.description} onChange={(event) => updateAttachmentEdit(attachment.id, { description: event.target.value })} disabled={readonly} placeholder={t("vehicles.uploads.note")} />
                                </div>
                              </div>
                              <div className="attachment-actions">
                                <a className="secondary-button" href={downloadUrl}>
                                  <Download size={15} aria-hidden="true" />
                                  Download
                                </a>
                                {attachment.mimeType?.includes("pdf") && (
                                  <a className="icon-button" href={`${downloadUrl}?inline=true`} target="_blank" rel="noreferrer" aria-label={t("vehicles.uploads.openPdf")} title={t("vehicles.uploads.openPdf")}>
                                    <ExternalLink size={15} />
                                  </a>
                                )}
                                <button type="button" className="secondary-button" onClick={() => saveAttachment(attachment)} disabled={readonly || saving}>
                                  <Save size={15} aria-hidden="true" />
                                  {t("vehicles.save")}
                                </button>
                                <button type="button" className="danger-button" onClick={() => deleteAttachment(attachment)} disabled={readonly || saving}>
                                  <Trash2 size={15} aria-hidden="true" />
                                  {t("vehicles.delete")}
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
                        <h3>{t("vehicles.maintenance.title")}</h3>
                        <p>{t("vehicles.maintenance.subtitle")}</p>
                      </div>
                      <Wrench size={22} aria-hidden="true" />
                    </div>
                    {!selected && <p className="empty-state compact">{t("vehicles.maintenance.emptyUntilSave")}</p>}
                    {selected && (
                      <>
                        <div className="maintenance-summary">
                          <div>
                            <span>{t("vehicles.maintenance.due")}</span>
                            <strong>{maintenanceSummary.due}</strong>
                          </div>
                          <div>
                            <span>{t("vehicles.maintenance.plannedOpen")}</span>
                            <strong>{maintenanceSummary.planned}</strong>
                          </div>
                          <div>
                            <span>{t("vehicles.maintenance.done")}</span>
                            <strong>{maintenanceSummary.done}</strong>
                          </div>
                        </div>
                        <div className="maintenance-form">
                          <label>
                            {t("vehicles.maintenance.kind")}
                            <select value={maintenanceForm.kind} onChange={(event) => updateMaintenanceForm({ kind: event.target.value })} disabled={readonly || saving}>
                              {maintenanceKinds.map((kind) => (
                                <option key={kind} value={kind}>{t(`vehicles.maintenance.kind.${kind}`)}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            {t("vehicles.maintenance.status")}
                            <select value={maintenanceForm.status} onChange={(event) => updateMaintenanceForm({ status: event.target.value })} disabled={readonly || saving}>
                              {maintenanceStatuses.map((status) => (
                                <option key={status.value} value={status.value}>{t(`vehicles.maintenance.status.${status.value}`)}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            {t("vehicles.maintenance.condition")}
                            <select value={maintenanceForm.conditionRating || ""} onChange={(event) => updateMaintenanceForm({ conditionRating: event.target.value })} disabled={readonly || saving}>
                              <option value="">{t("vehicles.select.placeholder")}</option>
                              {conditionRatings.map((rating) => (
                                <option key={rating} value={rating}>{rating}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            {t("vehicles.maintenance.dueDate")}
                            <input type="date" value={maintenanceForm.dueDate || ""} onChange={(event) => updateMaintenanceForm({ dueDate: event.target.value })} disabled={readonly || saving} />
                          </label>
                          <label>
                            {t("vehicles.maintenance.completedAt")}
                            <input type="date" value={maintenanceForm.completedAt || ""} onChange={(event) => updateMaintenanceForm({ completedAt: event.target.value })} disabled={readonly || saving} />
                          </label>
                          <label>
                            {t("vehicles.maintenance.cost")}
                            <input value={maintenanceForm.cost || ""} onChange={(event) => updateMaintenanceForm({ cost: event.target.value })} disabled={readonly || saving} inputMode="decimal" placeholder="0,00" />
                          </label>
                          <label className="maintenance-notes">
                            {t("vehicles.maintenance.notes")}
                            <textarea value={maintenanceForm.notes || ""} onChange={(event) => updateMaintenanceForm({ notes: event.target.value })} disabled={readonly || saving} rows={4} />
                          </label>
                        </div>
                        <div className="maintenance-actions">
                          {editingMaintenanceID && (
                            <button type="button" className="secondary-button" onClick={resetMaintenanceForm} disabled={readonly || saving}>
                              {t("vehicles.cancel")}
                            </button>
                          )}
                          <button type="button" className="primary-button" onClick={saveMaintenance} disabled={readonly || saving}>
                            <Save size={15} aria-hidden="true" />
                            {editingMaintenanceID ? t("vehicles.maintenance.saveEntry") : t("vehicles.maintenance.addEntry")}
                          </button>
                        </div>
                      </>
                    )}
                  </section>

                  <section className="maintenance-list">
                    {selected && (!selected.maintenance || selected.maintenance.length === 0) && (
                      <p className="empty-state compact">{t("vehicles.maintenance.empty")}</p>
                    )}
                    {selected?.maintenance?.map((entry) => {
                      const linkedImages = pendingArticleImages.filter((image) => image.maintenanceId === entry.id).length;
                      const linkedAttachments = (selected.attachments || []).filter((attachment) => attachment.maintenanceId === entry.id).length;
                      return (
                        <article key={entry.id} className={maintenanceIsDue(entry) ? "maintenance-card due" : "maintenance-card"}>
                        <div className="maintenance-card-head">
                          <div>
                            <strong>{entry.kind}</strong>
                            <span>{entry.notes || t("vehicles.maintenance.noNote")}</span>
                          </div>
                          <span className={`maintenance-badge ${maintenanceStatusClass(entry.status)}`}>{t(`vehicles.maintenance.status.${normalizeMaintenanceStatus(entry.status)}`)}</span>
                        </div>
                        <dl className="maintenance-meta">
                          <div>
                            <dt>{t("vehicles.maintenance.due")}</dt>
                            <dd>{formatDate(entry.dueDate)}</dd>
                          </div>
                          <div>
                            <dt>{t("vehicles.maintenance.completedAt")}</dt>
                            <dd>{formatDate(entry.completedAt)}</dd>
                          </div>
                          <div>
                            <dt>{t("vehicles.maintenance.condition")}</dt>
                            <dd>{entry.conditionRating || "-"}</dd>
                          </div>
                          <div>
                            <dt>{t("vehicles.maintenance.cost")}</dt>
                            <dd>{formatMaintenanceCost(entry.cost)}</dd>
                          </div>
                        </dl>
                        {(linkedImages > 0 || linkedAttachments > 0) && (
                          <div className="maintenance-linked-media" aria-label={t("vehicles.maintenance.linkedMedia")}>
                            {linkedImages > 0 && (
                              <span><Image size={14} aria-hidden="true" /> {linkedImages} {t("vehicles.maintenance.images")}</span>
                            )}
                            {linkedAttachments > 0 && (
                              <span><FileText size={14} aria-hidden="true" /> {linkedAttachments} {t("vehicles.maintenance.attachments")}</span>
                            )}
                          </div>
                        )}
                        <div className="maintenance-card-actions">
                          {entry.status !== "erledigt" && (
                            <button type="button" className="secondary-button" onClick={() => completeMaintenance(entry)} disabled={readonly || saving}>
                              {t("vehicles.maintenance.done")}
                            </button>
                          )}
                          <button type="button" className="icon-button" onClick={() => editMaintenance(entry)} disabled={readonly || saving} aria-label={t("vehicles.maintenance.edit")} title={t("vehicles.maintenance.edit")}>
                            <Pencil size={15} />
                          </button>
                          <button type="button" className="icon-button danger" onClick={() => deleteMaintenance(entry)} disabled={readonly || saving} aria-label={t("vehicles.maintenance.delete")} title={t("vehicles.maintenance.delete")}>
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
              <button type="button" className="secondary-button" onClick={closeModal}>
                {t("vehicles.cancel")}
              </button>
              <button className="primary-button" disabled={saving}>
                {saving ? t("vehicles.saving") : t("vehicles.save")}
              </button>
            </footer>
              </>
            )}
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
        <div className="confirm-layer" role="dialog" aria-modal="true" aria-label={t("vehicles.delete.aria")}>
          <section className="confirm-card">
            <div className="panel-head form-head">
              <h2>{t("vehicles.delete.title")}</h2>
              <button type="button" className="icon-button" onClick={() => setDeleteCandidate(null)} aria-label={t("vehicles.close")}>
                <X size={17} />
              </button>
            </div>
            <p>
              {deleteCandidate.inventoryNumber} - {deleteCandidate.name}
            </p>
            <div className="confirm-actions">
              <button type="button" className="secondary-button" onClick={() => setDeleteCandidate(null)}>
                {t("vehicles.cancel")}
              </button>
              <button type="button" className="danger-button" onClick={confirmDelete}>
                {t("vehicles.delete")}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
