import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import {
  AlertTriangle,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  Eye,
  Image,
  Pencil,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X
} from "lucide-react";
import {
  api,
  ArticleSearchResponse,
  ArticleSearchResult,
  CreateVehicleRequest,
  MasterDataEntry,
  MasterDataRelation,
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
type ModalTab = "model" | "control" | "uploads";
type SortKey = "inventoryNumber" | "manufacturer" | "articleNumber" | "name" | "gauge" | "epoch" | "category";
type SortDirection = "asc" | "desc";
type ArticleFieldKey = keyof CreateVehicleRequest;

type MasterDataOptions = {
  manufacturers: MasterDataEntry[];
  gauges: MasterDataEntry[];
  epochs: MasterDataEntry[];
  railwayCompanies: MasterDataEntry[];
  categories: MasterDataEntry[];
  gattungen: MasterDataEntry[];
  categoryRelations: MasterDataRelation[];
};

const emptyOptions: MasterDataOptions = {
  manufacturers: [],
  gauges: [],
  epochs: [],
  railwayCompanies: [],
  categories: [],
  gattungen: [],
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
const couplingOptions = ["NEM-Schacht", "Kurzkupplung", "Buegelkupplung", "Klauenkupplung", "Schraubenkupplung"];
const powerPickupOptions = ["Schiene", "Oberleitung", "Batterie", "Akku"];
const adapterOptions = ["NEM 651", "NEM 652", "PluX16", "PluX22", "MTC21", "Next18", "8-polig", "21-polig"];
const articleSearchSettingKey = "railkeeper.articleSearchEnabled";

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
  lengthMm: "Laenge (mm)",
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
  driveDescription: "Antrieb Beschreibung",
  headlightsDescription: "Fahrlicht Beschreibung",
  lightingDescription: "Beleuchtung Beschreibung",
  soundGeneratorDescription: "Soundgenerator Beschreibung",
  smokeGeneratorDescription: "Rauchgenerator Beschreibung",
  additionalInfo: "Zusatzinformationen"
};

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
  const mark = `<rect x="111" y="111" width="34" height="34" rx="8" fill="#fff"/><image href="/brand/railkeeper-mark.svg" x="115" y="115" width="26" height="26"/>`;
  return svg.replace("</svg>", `${mark}</svg>`);
}

function renderStaticOptions(items: string[], emptyLabel = "Bitte waehlen") {
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
          Laenge (mm)
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
        <label className="switch-label switch-card">
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
        <label className="switch-label switch-card qr-switch-card">
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
  onApply,
  onClose,
  onToggleField
}: {
  form: CreateVehicleRequest;
  loading: boolean;
  response: ArticleSearchResponse | null;
  error: string;
  selectedFields: Record<string, boolean>;
  onApply: (result: ArticleSearchResult) => void;
  onClose: () => void;
  onToggleField: (key: string, checked: boolean) => void;
}) {
  return (
    <div className="confirm-layer article-search-layer" role="dialog" aria-modal="true" aria-label="Artikeldaten-Websuche">
      <section className="article-search-dialog">
        <div className="panel-head form-head">
          <div>
            <h2>Artikeldaten-Websuche</h2>
            <p>{response?.query ? `Suchanfrage: ${response.query}` : "Webseiten werden als Vorschlaege ausgewertet."}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Schliessen" title="Schliessen">
            <X size={17} />
          </button>
        </div>

        {loading && <p className="empty-state compact">Suche laeuft mit Timeout und ohne automatische Uebernahme...</p>}
        {error && <p className="form-message">{error}</p>}
        {!loading && !error && response && response.results.length === 0 && (
          <p className="empty-state compact">Keine passenden Artikeldaten gefunden.</p>
        )}

        <div className="article-result-list">
          {response?.results.map((result, index) => (
            <article key={`${result.url}-${index}`} className="article-result-card">
              <header>
                <div>
                  <strong>{result.title}</strong>
                  <span>{result.source} - Trefferwert {result.score}</span>
                </div>
                <a className="icon-button" href={result.url} target="_blank" rel="noreferrer" aria-label="Quelle oeffnen" title="Quelle oeffnen">
                  <ExternalLink size={16} />
                </a>
              </header>
              {result.snippet && <p>{result.snippet}</p>}
              {result.conflicts && result.conflicts.length > 0 && (
                <div className="conflict-note">
                  <AlertTriangle size={15} aria-hidden="true" />
                  Konflikte mit bestehenden Feldern: {result.conflicts.map((key) => articleFieldLabels[key as ArticleFieldKey] || key).join(", ")}
                </div>
              )}
              <div className="article-field-grid">
                {Object.entries(result.fields).map(([key, field]) => {
                  const existing = fieldValue(form, key);
                  const conflict = existing && existing !== field.value;
                  return (
                    <label key={key} className={conflict ? "article-field-row conflict" : "article-field-row"}>
                      <input
                        type="checkbox"
                        checked={Boolean(selectedFields[key])}
                        onChange={(event) => onToggleField(key, event.target.checked)}
                        disabled={!isArticleFieldKey(key)}
                      />
                      <span>
                        <strong>{articleFieldLabels[key as ArticleFieldKey] || field.label}</strong>
                        <em>{field.value}</em>
                        {existing && <small>Aktuell: {existing}</small>}
                      </span>
                      {conflict && <AlertTriangle size={15} aria-hidden="true" />}
                    </label>
                  );
                })}
              </div>
              <footer>
                <button type="button" className="primary-button" onClick={() => onApply(result)}>
                  <Check size={16} aria-hidden="true" />
                  Ausgewaehlte Felder uebernehmen
                </button>
              </footer>
            </article>
          ))}
        </div>
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
          <button type="button" className="icon-button" onClick={onClose} aria-label="Schliessen" title="Schliessen">
            <X size={17} />
          </button>
        </div>
        {error && <p className="form-message">{error}</p>}
        <button type="button" className="qr-preview-button" onClick={onPrint} disabled={!qrSvg} title="Druckansicht oeffnen">
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
    details: false,
    ownership: false
  });
  const [deleteCandidate, setDeleteCandidate] = useState<Vehicle | null>(null);
  const [articleSearchOpen, setArticleSearchOpen] = useState(false);
  const [articleSearchLoading, setArticleSearchLoading] = useState(false);
  const [articleSearchResponse, setArticleSearchResponse] = useState<ArticleSearchResponse | null>(null);
  const [articleSearchError, setArticleSearchError] = useState("");
  const [selectedArticleFields, setSelectedArticleFields] = useState<Record<string, boolean>>({});
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrSvg, setQrSvg] = useState("");
  const [qrError, setQrError] = useState("");
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

  const runArticleSearch = () => {
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

    api
      .articleSearch({
        manufacturer: form.manufacturer,
        articleNumber: form.articleNumber,
        name: form.name,
        gauge: form.gauge,
        fields: vehicleFieldsForSearch(form)
      })
      .then((response) => {
        setArticleSearchResponse(response);
        const initialSelection: Record<string, boolean> = {};
        response.results[0] && Object.keys(response.results[0].fields).forEach((key) => {
          initialSelection[key] = !fieldValue(form, key);
        });
        setSelectedArticleFields(initialSelection);
      })
      .catch((error: Error) => setArticleSearchError(error.message))
      .finally(() => setArticleSearchLoading(false));
  };

  const toggleArticleField = (key: string, checked: boolean) => {
    setSelectedArticleFields((current) => ({ ...current, [key]: checked }));
  };

  const applyArticleResult = (result: ArticleSearchResult) => {
    const patch: Partial<CreateVehicleRequest> = {};
    Object.entries(result.fields).forEach(([key, field]) => {
      if (!selectedArticleFields[key] || !isArticleFieldKey(key)) return;
      Object.assign(patch, { [key]: field.value });
    });
    update(patch);
    setArticleSearchOpen(false);
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
      logoImage.src = "/brand/railkeeper-mark.svg";
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
      setQrError("Druckfenster konnte nicht geoeffnet werden.");
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

  const toggleSort = (key: SortKey) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
    }));
  };

  const openCreate = () => {
    setSelected(null);
    setMode("create");
    setForm(emptyVehicle);
    setActiveTab("model");
    setOpenSections({ model: true, details: false, ownership: false });
    setModalOpen(true);
    setMessage("");
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelected(null);
    setMode("create");
    setForm(emptyVehicle);
    setMessage("");
  };

  const openDetail = (vehicle: Vehicle) => {
    api
      .vehicle(vehicle.id)
      .then((detail) => {
        setSelected(detail);
        setForm(vehicleToForm(detail));
        setMode("view");
        setActiveTab("model");
        setOpenSections({ model: true, details: false, ownership: false });
        setModalOpen(true);
        setMessage("");
      })
      .catch((error: Error) => setMessage(error.message));
  };

  const openEdit = (vehicle: Vehicle) => {
    api
      .vehicle(vehicle.id)
      .then((detail) => {
        setSelected(detail);
        setForm(vehicleToForm(detail));
        setMode("edit");
        setActiveTab("model");
        setOpenSections({ model: true, details: false, ownership: false });
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

    const action = mode === "edit" && selected
      ? api.updateVehicle(selected.id, form)
      : api.createVehicle(form);

    action
      .then((vehicle) => {
        setSelected(vehicle);
        setForm(vehicleToForm(vehicle));
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

      <section className="panel search-panel">
        <label className="search-field inventory-search">
          Suche
          <span>
            <Search size={16} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Inventarnummer, Hersteller, Artikel oder Bezeichnung"
            />
          </span>
        </label>
      </section>

      <section className="panel inventory-panel">
        <div className="panel-head inventory-list-head">
          <h2>Fahrzeuge</h2>
          <div className="table-actions">
            <span className="count-badge">{vehicles.length}</span>
            <button type="button" className="icon-button" onClick={load} aria-label="Aktualisieren" title="Aktualisieren" disabled={loading}>
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {message && <p className="form-message">{message}</p>}

        {loading && vehicles.length === 0 ? (
          <p className="empty-state">Lade Fahrzeuge aus lokaler Datenbank...</p>
        ) : vehicles.length === 0 ? (
          <p className="empty-state">Noch keine Fahrzeuge vorhanden.</p>
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
                      <div className="image-placeholder">Keine Vorschau</div>
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
                        <button type="button" className="icon-button danger" onClick={() => setDeleteCandidate(vehicle)} aria-label="Loeschen" title="Loeschen">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modalOpen && (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-label="Fahrzeugdaten bearbeiten">
          <form className="vehicle-modal" onSubmit={submit}>
            <header className="modal-head">
              <h2>{mode === "create" ? "Fahrzeugdaten erfassen" : mode === "edit" ? "Fahrzeugdaten bearbeiten" : "Fahrzeugdaten"}</h2>
              <button type="button" className="icon-button" onClick={closeModal} aria-label="Schliessen" title="Schliessen">
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
              <button type="button" className={activeTab === "uploads" ? "active" : ""} onClick={() => setActiveTab("uploads")}>
                Uploads
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
                          <button type="button" className="secondary-button" onClick={runArticleSearch} disabled={readonly || articleSearchLoading}>
                            <Search size={15} aria-hidden="true" />
                            {articleSearchLoading ? "Sucht..." : "Artikeldaten suchen"}
                          </button>
                        </div>

                        {form.articleSourceUrl && (
                          <p className="source-note compact-source-note">
                            <ExternalLink size={15} aria-hidden="true" />
                            <span>Quelle: {form.articleSourceUrl}</span>
                          </p>
                        )}

                        <div className="form-row">
                          <label>
                            Inventar-Nr.
                            <input value={form.inventoryNumber || ""} onChange={(event) => update({ inventoryNumber: event.target.value })} disabled={readonly} />
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
                              {selectOptions(options.manufacturers, "Bitte waehlen")}
                            </select>
                          </label>
                          <label>
                            Spurweite *
                            <select value={form.gauge} onChange={(event) => update({ gauge: event.target.value })} disabled={readonly} required>
                              {selectOptions(options.gauges, "Bitte waehlen")}
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

                  <section className="accordion-section">
                    <button type="button" className="accordion-trigger" onClick={() => toggleSection("ownership")}>
                      {openSections.ownership ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      Erwerb & Verbleib
                    </button>
                    {openSections.ownership && (
                      <div className="accordion-content vehicle-form">
                        <p className="empty-state compact">Erwerb, Kaufpreis, Haendler und Verbleib kommen als eigener Block.</p>
                      </div>
                    )}
                  </section>
                </div>
              )}

              {activeTab === "control" && (
                <section className="empty-tab">
                  <h3>Steuerung</h3>
                  <p>Funktionssymbole und Decoderfunktionen werden als eigener Datenblock vorbereitet.</p>
                </section>
              )}

              {activeTab === "uploads" && (
                <section className="uploads-tab">
                  <div className="upload-head">
                    <div>
                      <h3>Bilder</h3>
                      <p>Lade Bilder zum Fahrzeug hoch.</p>
                    </div>
                    <button type="button" className="primary-button" disabled>
                      <Upload size={16} aria-hidden="true" />
                      Bild hochladen
                    </button>
                  </div>
                  <div className="upload-list">
                    <div className="image-placeholder large">
                      <Image size={22} aria-hidden="true" />
                      Keine Vorschau
                    </div>
                    <span>Kein Bild hinterlegt</span>
                  </div>
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
          onApply={applyArticleResult}
          onClose={() => setArticleSearchOpen(false)}
          onToggleField={toggleArticleField}
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

      {deleteCandidate && (
        <div className="confirm-layer" role="dialog" aria-modal="true" aria-label="Fahrzeug loeschen">
          <section className="confirm-card">
            <div className="panel-head form-head">
              <h2>Fahrzeug loeschen?</h2>
              <button type="button" className="icon-button" onClick={() => setDeleteCandidate(null)} aria-label="Schliessen">
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
                Loeschen
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
