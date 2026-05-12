import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp, BarChart3, Box, EyeOff, FileInput, Gauge, Printer, RefreshCw, RotateCcw, Wrench } from "lucide-react";
import { api, Vehicle, VehicleMaintenance } from "../../shared/api";

type OverviewWidgetID = "mix" | "quality" | "actions" | "manufacturers" | "quickActions" | "maintenance" | "recommendation";

const overviewHiddenWidgetsKey = "railkeeper.overview.hiddenWidgets";
const overviewWidgetOrderKey = "railkeeper.overview.widgetOrder";
const defaultWidgetOrder: OverviewWidgetID[] = ["mix", "quality", "actions", "manufacturers", "quickActions", "maintenance", "recommendation"];

function readHiddenWidgets(): OverviewWidgetID[] {
  try {
    const stored = JSON.parse(window.localStorage.getItem(overviewHiddenWidgetsKey) || "[]") as OverviewWidgetID[];
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function readWidgetOrder(): OverviewWidgetID[] {
  try {
    const stored = JSON.parse(window.localStorage.getItem(overviewWidgetOrderKey) || "[]") as OverviewWidgetID[];
    const ordered = stored.filter((item): item is OverviewWidgetID => defaultWidgetOrder.includes(item));
    const missing = defaultWidgetOrder.filter((item) => !ordered.includes(item));
    return [...ordered, ...missing];
  } catch {
    return defaultWidgetOrder;
  }
}

function numberValue(value?: string) {
  if (!value) {
    return 0;
  }
  const normalized = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function currency(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value?: string) {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function dateDistance(entry: VehicleMaintenance) {
  if (!entry.dueDate || entry.status === "erledigt") {
    return null;
  }
  const now = new Date();
  const due = new Date(`${entry.dueDate}T00:00:00`);
  return Math.ceil((due.getTime() - now.getTime()) / 86400000);
}

function topEntries(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values.filter(Boolean)) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5);
}

function maintenanceDistanceText(days: number) {
  if (days < 0) {
    return `${Math.abs(days)} Tage überfällig`;
  }
  if (days === 0) {
    return "heute fällig";
  }
  if (days === 1) {
    return "morgen fällig";
  }
  return `in ${days} Tagen`;
}

export function OverviewView() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [hiddenWidgets, setHiddenWidgets] = useState<OverviewWidgetID[]>(readHiddenWidgets);
  const [widgetOrder, setWidgetOrder] = useState<OverviewWidgetID[]>(readWidgetOrder);

  const loadVehicles = useCallback(() => {
    setLoading(true);
    setMessage("");
    api
      .vehicles()
      .then(setVehicles)
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  const printDashboard = () => {
    window.print();
  };

  const hideWidget = (widget: OverviewWidgetID) => {
    setHiddenWidgets((current) => {
      const next = [...new Set([...current, widget])];
      window.localStorage.setItem(overviewHiddenWidgetsKey, JSON.stringify(next));
      return next;
    });
  };

  const resetWidgets = () => {
    window.localStorage.removeItem(overviewHiddenWidgetsKey);
    window.localStorage.removeItem(overviewWidgetOrderKey);
    setHiddenWidgets([]);
    setWidgetOrder(defaultWidgetOrder);
  };

  const widgetVisible = (widget: OverviewWidgetID) => !hiddenWidgets.includes(widget);

  const widgetOrderIndex = (widget: OverviewWidgetID) => widgetOrder.indexOf(widget);

  const moveWidget = (widget: OverviewWidgetID, direction: -1 | 1) => {
    setWidgetOrder((current) => {
      const index = current.indexOf(widget);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      window.localStorage.setItem(overviewWidgetOrderKey, JSON.stringify(next));
      return next;
    });
  };

  const widgetControls = (widget: OverviewWidgetID, label: string) => (
    <span className="widget-head-actions">
      <button type="button" className="widget-hide-button" onClick={() => moveWidget(widget, -1)} disabled={widgetOrderIndex(widget) <= 0} aria-label={`${label} nach vorn`} title="Nach vorn">
        <ArrowUp size={15} aria-hidden="true" />
      </button>
      <button type="button" className="widget-hide-button" onClick={() => moveWidget(widget, 1)} disabled={widgetOrderIndex(widget) >= defaultWidgetOrder.length - 1} aria-label={`${label} nach hinten`} title="Nach hinten">
        <ArrowDown size={15} aria-hidden="true" />
      </button>
      <button type="button" className="widget-hide-button" onClick={() => hideWidget(widget)} aria-label={`${label} ausblenden`} title="Ausblenden">
        <EyeOff size={15} aria-hidden="true" />
      </button>
    </span>
  );

  const stats = useMemo(() => {
    const totalValue = vehicles.reduce((sum, vehicle) => sum + numberValue(vehicle.listPrice), 0);
    const digital = vehicles.filter((vehicle) => vehicle.digital).length;
    const analog = vehicles.length - digital;
    const withImages = vehicles.filter((vehicle) => (vehicle.images || []).length > 0).length;
    const allMaintenance = vehicles.flatMap((vehicle) => (vehicle.maintenance || []).map((entry) => ({ vehicle, entry, days: dateDistance(entry) })));
    const scheduledMaintenance = allMaintenance.filter((item): item is { vehicle: Vehicle; entry: VehicleMaintenance; days: number } => item.days !== null && item.entry.status !== "erledigt");
    const due = scheduledMaintenance.filter((item) => item.days <= 0).length;
    const upcoming = scheduledMaintenance.filter((item) => item.days > 0 && item.days <= 30).length;
    const openMaintenance = allMaintenance.filter((item) => item.entry.status !== "erledigt").length;
    const completedMaintenance = allMaintenance.filter((item) => item.entry.status === "erledigt").length;
    const maintenanceCost = allMaintenance.reduce((sum, item) => sum + numberValue(item.entry.cost), 0);
    const nextMaintenance = [...scheduledMaintenance].sort((a, b) => a.days - b.days).slice(0, 4);
    const conditions = topEntries(allMaintenance.map((item) => item.entry.conditionRating || "").filter(Boolean));
    const categories = topEntries(vehicles.map((vehicle) => vehicle.category || "Ohne Kategorie"));
    const gauges = topEntries(vehicles.map((vehicle) => vehicle.gauge || "Ohne Spur"));
    const manufacturers = topEntries(vehicles.map((vehicle) => vehicle.manufacturer || "Ohne Hersteller"));
    const withArticleNumbers = vehicles.filter((vehicle) => vehicle.articleNumber).length;
    const withEAN = vehicles.filter((vehicle) => vehicle.ean).length;
    const withDecoderNumbers = vehicles.filter((vehicle) => vehicle.digitalDecoderNumber || vehicle.dtDecoderNumber).length;
    const digitalWithoutDecoder = vehicles.filter((vehicle) => vehicle.digital && !vehicle.digitalDecoderNumber && !vehicle.dtDecoderNumber).length;
    const documentedVehicles = vehicles.filter((vehicle) => vehicle.articleNumber && vehicle.ean && (vehicle.images || []).length > 0).length;
    const dataGaps = [
      { label: "Ohne Hauptbild", count: vehicles.length - withImages, detail: "Kartenansicht und PDF-Ausdruck profitieren sofort." },
      { label: "Ohne Artikel-Nr.", count: vehicles.length - withArticleNumbers, detail: "Wichtig für Suche, Webabgleich und Ersatzteile." },
      { label: "Ohne EAN", count: vehicles.length - withEAN, detail: "Hilft besonders bei Barcode- und Packungssuche." },
      { label: "Digital ohne Decoder-Nr.", count: digitalWithoutDecoder, detail: "Relevant für Service, CVs und Decoder-Dateien." }
    ].filter((gap) => gap.count > 0);
    return {
      totalValue,
      digital,
      analog,
      withImages,
      withArticleNumbers,
      withEAN,
      withDecoderNumbers,
      documentedVehicles,
      dataGaps,
      due,
      upcoming,
      openMaintenance,
      completedMaintenance,
      maintenanceCost,
      nextMaintenance,
      conditions,
      categories,
      gauges,
      manufacturers
    };
  }, [vehicles]);

  const digitalShare = vehicles.length ? Math.round((stats.digital / vehicles.length) * 100) : 0;
  const imageShare = vehicles.length ? Math.round((stats.withImages / vehicles.length) * 100) : 0;
  const decoderShare = vehicles.length ? Math.round((stats.withDecoderNumbers / vehicles.length) * 100) : 0;
  const articleShare = vehicles.length ? Math.round((stats.withArticleNumbers / vehicles.length) * 100) : 0;
  const eanShare = vehicles.length ? Math.round((stats.withEAN / vehicles.length) * 100) : 0;
  const documentedShare = vehicles.length ? Math.round((stats.documentedVehicles / vehicles.length) * 100) : 0;

  return (
    <>
      <section className="page-head overview-head">
        <div>
          <p className="eyebrow">RailKeeper Cockpit</p>
          <h1>Übersicht</h1>
          <p>Der schnelle Blick auf Bestand, Wert, Digitalisierung und offene Aufgaben.</p>
        </div>
        <div className="overview-actions" aria-label="Dashboard-Werkzeuge">
          <button type="button" className="secondary-button" onClick={loadVehicles} disabled={loading}>
            <RefreshCw size={15} aria-hidden="true" />
            Aktualisieren
          </button>
          <button type="button" className="secondary-button" onClick={printDashboard}>
            <Printer size={15} aria-hidden="true" />
            Drucken
          </button>
          {hiddenWidgets.length > 0 && (
            <button type="button" className="secondary-button" onClick={resetWidgets}>
              <RotateCcw size={15} aria-hidden="true" />
              Layout zurücksetzen
            </button>
          )}
          <a className="secondary-button" href="/import-export">
            <FileInput size={15} aria-hidden="true" />
            Import/Export
          </a>
        </div>
      </section>

      {message && <p className="form-message">{message}</p>}

      <section className="overview-hero panel">
        <div>
          <span className="overview-icon"><Box size={20} aria-hidden="true" /></span>
          <p>Gesamtbestand</p>
          <strong>{loading ? "..." : vehicles.length}</strong>
          <small>{stats.categories.length} Kategorien, {stats.gauges.length} Spurweiten</small>
        </div>
        <div>
          <span className="overview-icon"><Gauge size={20} aria-hidden="true" /></span>
          <p>Digitalisierung</p>
          <strong>{digitalShare}%</strong>
          <small>{stats.digital} digital · {stats.analog} analog</small>
        </div>
        <div>
          <span className="overview-icon"><BarChart3 size={20} aria-hidden="true" /></span>
          <p>Erfasster Listenwert</p>
          <strong>{currency(stats.totalValue)}</strong>
          <small>Basis: gepflegte Listenpreise</small>
        </div>
        <div className={stats.due > 0 ? "attention" : ""}>
          <span className="overview-icon">{stats.due > 0 ? <AlertTriangle size={20} aria-hidden="true" /> : <Wrench size={20} aria-hidden="true" />}</span>
          <p>Wartung</p>
          <strong>{stats.due}</strong>
          <small>{stats.upcoming} in 30 Tagen · {stats.openMaintenance} offen</small>
        </div>
      </section>

      <section className="overview-grid">
        <article className="panel insight-card overview-widget" hidden={!widgetVisible("mix")} style={{ order: widgetOrderIndex("mix") }}>
          <div className="panel-head">
            <div>
              <h2>Bestandsmix</h2>
              <p>Kategorien mit den meisten Fahrzeugen.</p>
            </div>
            {widgetControls("mix", "Bestandsmix")}
          </div>
          <div className="bar-list">
            {stats.categories.map(([label, count]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{count}</strong>
                <i style={{ width: `${vehicles.length ? Math.max(8, (count / vehicles.length) * 100) : 0}%` }} />
              </div>
            ))}
          </div>
        </article>

        <article className="panel insight-card overview-widget" hidden={!widgetVisible("quality")} style={{ order: widgetOrderIndex("quality") }}>
          <div className="panel-head">
            <div>
              <h2>Datenqualität</h2>
              <p>Was schon gut gepflegt ist.</p>
            </div>
            {widgetControls("quality", "Datenqualität")}
          </div>
          <div className="quality-list">
            <div><span>Bilder</span><strong>{imageShare}%</strong><i style={{ width: `${imageShare}%` }} /></div>
            <div><span>Decoder-Nummern</span><strong>{decoderShare}%</strong><i style={{ width: `${decoderShare}%` }} /></div>
            <div><span>Artikelnummern</span><strong>{articleShare}%</strong><i style={{ width: `${articleShare}%` }} /></div>
            <div><span>EAN</span><strong>{eanShare}%</strong><i style={{ width: `${eanShare}%` }} /></div>
            <div><span>Voll dokumentiert</span><strong>{documentedShare}%</strong><i style={{ width: `${documentedShare}%` }} /></div>
          </div>
        </article>

        <article className="panel insight-card action-card overview-widget" hidden={!widgetVisible("actions")} style={{ order: widgetOrderIndex("actions") }}>
          <div className="panel-head">
            <div>
              <h2>Handlungsbedarf</h2>
              <p>Die größten Pflegepunkte im Bestand.</p>
            </div>
            {widgetControls("actions", "Handlungsbedarf")}
          </div>
          {stats.dataGaps.length === 0 ? (
            <p className="empty-mini">Keine größeren Datenlücken erkannt.</p>
          ) : (
            <div className="action-gap-list">
              {stats.dataGaps.map((gap) => (
                <a key={gap.label} href="/" className="action-gap">
                  <span>
                    <strong>{gap.label}</strong>
                    <small>{gap.detail}</small>
                  </span>
                  <em>{gap.count}</em>
                  <ArrowRight size={15} aria-hidden="true" />
                </a>
              ))}
            </div>
          )}
        </article>

        <article className="panel insight-card overview-widget" hidden={!widgetVisible("manufacturers")} style={{ order: widgetOrderIndex("manufacturers") }}>
          <div className="panel-head">
            <div>
              <h2>Hersteller</h2>
              <p>Die stärksten Hersteller im Bestand.</p>
            </div>
            {widgetControls("manufacturers", "Hersteller")}
          </div>
          <div className="rank-list">
            {stats.manufacturers.map(([label, count], index) => (
              <div key={label}><span>{index + 1}</span><strong>{label}</strong><em>{count}</em></div>
            ))}
          </div>
        </article>

        <article className="panel insight-card quick-actions-card overview-widget" hidden={!widgetVisible("quickActions")} style={{ order: widgetOrderIndex("quickActions") }}>
          <div className="panel-head">
            <div>
              <h2>Schnellaktionen</h2>
              <p>Direkt zu den nächsten Arbeitsbereichen.</p>
            </div>
            {widgetControls("quickActions", "Schnellaktionen")}
          </div>
          <div className="quick-action-list">
            <a href="/">
              <span>Bestand pflegen</span>
              <small>Fahrzeuge öffnen, suchen und ergänzen.</small>
              <ArrowRight size={16} aria-hidden="true" />
            </a>
            <a href="/import-export">
              <span>Import/Export</span>
              <small>Listen prüfen, übernehmen oder drucken.</small>
              <ArrowRight size={16} aria-hidden="true" />
            </a>
            <a href="/settings">
              <span>Stammdaten prüfen</span>
              <small>Auswahlwerte, Nummern und Darstellung verwalten.</small>
              <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>
        </article>

        <article className="panel insight-card maintenance-insight-card overview-widget" hidden={!widgetVisible("maintenance")} style={{ order: widgetOrderIndex("maintenance") }}>
          <div className="panel-head">
            <div>
              <h2>Wartungsradar</h2>
              <p>Die nächsten fälligen Arbeiten im Blick.</p>
            </div>
            {widgetControls("maintenance", "Wartungsradar")}
          </div>
          {stats.nextMaintenance.length === 0 ? (
            <p className="empty-mini">Keine geplanten Wartungen mit Fälligkeitsdatum.</p>
          ) : (
            <div className="maintenance-overview-list">
              {stats.nextMaintenance.map(({ vehicle, entry, days }) => (
                <div key={`${vehicle.id}-${entry.id}`} className={days <= 0 ? "due" : ""}>
                  <span>
                    <strong>{vehicle.inventoryNumber}</strong>
                    <small>{vehicle.name || entry.kind}</small>
                  </span>
                  <em>{entry.kind}</em>
                  <b>{maintenanceDistanceText(days)}</b>
                  <small>{formatDate(entry.dueDate)}</small>
                </div>
              ))}
            </div>
          )}
          <div className="maintenance-kpi-row">
            <span><small>Erledigt</small><strong>{stats.completedMaintenance}</strong></span>
            <span><small>Kosten</small><strong>{currency(stats.maintenanceCost)}</strong></span>
            <span><small>Zustände</small><strong>{stats.conditions.length}</strong></span>
          </div>
        </article>

        <article className="panel insight-card overview-widget" hidden={!widgetVisible("recommendation")} style={{ order: widgetOrderIndex("recommendation") }}>
          <div className="panel-head">
            <div>
              <h2>Nächster Mehrwert</h2>
              <p>Automatisch aus deinen Daten abgeleitet.</p>
            </div>
            {widgetControls("recommendation", "Nächster Mehrwert")}
          </div>
          <p className="recommendation">
            {vehicles.length === 0
              ? "Lege die ersten Fahrzeuge an oder importiere eine Bestandsliste."
              : imageShare < 70
                ? "Mehr Hauptbilder würden Kartenansicht, Drucklisten und QR-Etiketten deutlich nützlicher machen."
                : stats.due > 0
                  ? "Die fälligen Wartungen sind der beste nächste Arbeitspunkt."
            : "Der Bestand wirkt stabil. Als nächstes lohnen sich Ersatzteile und strukturierte Preis-/Wertpflege."}
          </p>
        </article>

        {hiddenWidgets.length === 7 && (
          <article className="panel insight-card overview-reset-card">
            <h2>Dashboard leer</h2>
            <p>Alle Kacheln sind ausgeblendet. Das Layout kann jederzeit zurückgesetzt werden.</p>
            <button type="button" className="secondary-button" onClick={resetWidgets}>
              <RotateCcw size={15} aria-hidden="true" />
              Layout zurücksetzen
            </button>
          </article>
        )}
      </section>
    </>
  );
}
