import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp, BarChart3, Box, Download, EyeOff, FileInput, Gauge, Printer, RefreshCw, RotateCcw, Wrench } from "lucide-react";
import { api, Vehicle, VehicleMaintenance } from "../../shared/api";
import { useI18n } from "../../shared/i18n";

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

function currency(value: number, language: string) {
  return new Intl.NumberFormat(language === "en" ? "en-US" : "de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string | undefined, language: string) {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${value}T00:00:00`));
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

function maintenanceDistanceText(days: number, t: (key: string, values?: Record<string, string | number>) => string) {
  if (days < 0) {
    return t("overview.daysOverdue", { days: Math.abs(days) });
  }
  if (days === 0) {
    return t("overview.dueToday");
  }
  if (days === 1) {
    return t("overview.dueTomorrow");
  }
  return t("overview.dueInDays", { days });
}

export function OverviewView() {
  const { language, t } = useI18n();
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
      <button type="button" className="widget-hide-button" onClick={() => moveWidget(widget, -1)} disabled={widgetOrderIndex(widget) <= 0} aria-label={t("overview.widget.forward", { label })} title={t("overview.moveForward")}>
        <ArrowUp size={15} aria-hidden="true" />
      </button>
      <button type="button" className="widget-hide-button" onClick={() => moveWidget(widget, 1)} disabled={widgetOrderIndex(widget) >= defaultWidgetOrder.length - 1} aria-label={t("overview.widget.backward", { label })} title={t("overview.moveBackward")}>
        <ArrowDown size={15} aria-hidden="true" />
      </button>
      <button type="button" className="widget-hide-button" onClick={() => hideWidget(widget)} aria-label={t("overview.widget.hide", { label })} title={t("overview.hide")}>
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
    const categories = topEntries(vehicles.map((vehicle) => vehicle.category || t("overview.noCategory")));
    const gauges = topEntries(vehicles.map((vehicle) => vehicle.gauge || t("overview.noGauge")));
    const manufacturers = topEntries(vehicles.map((vehicle) => vehicle.manufacturer || t("overview.noManufacturer")));
    const withArticleNumbers = vehicles.filter((vehicle) => vehicle.articleNumber).length;
    const withEAN = vehicles.filter((vehicle) => vehicle.ean).length;
    const withDecoderNumbers = vehicles.filter((vehicle) => vehicle.digitalDecoderNumber || vehicle.dtDecoderNumber).length;
    const digitalWithoutDecoder = vehicles.filter((vehicle) => vehicle.digital && !vehicle.digitalDecoderNumber && !vehicle.dtDecoderNumber).length;
    const documentedVehicles = vehicles.filter((vehicle) => vehicle.articleNumber && vehicle.ean && (vehicle.images || []).length > 0).length;
    const dataGaps = [
      { label: t("overview.gap.noMainImage"), count: vehicles.length - withImages, detail: t("overview.gap.noMainImageDetail") },
      { label: t("overview.gap.noArticleNumber"), count: vehicles.length - withArticleNumbers, detail: t("overview.gap.noArticleNumberDetail") },
      { label: t("overview.gap.noEan"), count: vehicles.length - withEAN, detail: t("overview.gap.noEanDetail") },
      { label: t("overview.gap.digitalNoDecoder"), count: digitalWithoutDecoder, detail: t("overview.gap.digitalNoDecoderDetail") }
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
  }, [t, vehicles]);

  const digitalShare = vehicles.length ? Math.round((stats.digital / vehicles.length) * 100) : 0;
  const imageShare = vehicles.length ? Math.round((stats.withImages / vehicles.length) * 100) : 0;
  const decoderShare = vehicles.length ? Math.round((stats.withDecoderNumbers / vehicles.length) * 100) : 0;
  const articleShare = vehicles.length ? Math.round((stats.withArticleNumbers / vehicles.length) * 100) : 0;
  const eanShare = vehicles.length ? Math.round((stats.withEAN / vehicles.length) * 100) : 0;
  const documentedShare = vehicles.length ? Math.round((stats.documentedVehicles / vehicles.length) * 100) : 0;

  const exportOverviewStats = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      totals: {
        vehicles: vehicles.length,
        listValue: stats.totalValue,
        digital: stats.digital,
        analog: stats.analog,
        maintenanceDue: stats.due,
        maintenanceUpcoming: stats.upcoming,
        openMaintenance: stats.openMaintenance
      },
      quality: {
        images: imageShare,
        decoderNumbers: decoderShare,
        articleNumbers: articleShare,
        ean: eanShare,
        documented: documentedShare
      },
      categories: stats.categories,
      gauges: stats.gauges,
      manufacturers: stats.manufacturers,
      dataGaps: stats.dataGaps
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "railkeeper-uebersicht.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <section className="page-head overview-head">
        <div>
          <p className="eyebrow">{t("overview.eyebrow")}</p>
          <h1>{t("overview.title")}</h1>
          <p>{t("overview.subtitle")}</p>
        </div>
        <div className="overview-actions" aria-label={t("overview.tools")}>
          <button type="button" className="icon-button" onClick={loadVehicles} disabled={loading} aria-label={t("overview.refresh")} title={t("overview.refresh")}>
            <RefreshCw size={15} aria-hidden="true" />
          </button>
          <button type="button" className="icon-button" onClick={printDashboard} aria-label={t("overview.print")} title={t("overview.print")}>
            <Printer size={15} aria-hidden="true" />
          </button>
          <button type="button" className="icon-button" onClick={exportOverviewStats} disabled={loading} aria-label={t("overview.export")} title={t("overview.export")}>
            <Download size={15} aria-hidden="true" />
          </button>
          {hiddenWidgets.length > 0 && (
            <button type="button" className="icon-button" onClick={resetWidgets} aria-label={t("overview.resetLayout")} title={t("overview.resetLayout")}>
              <RotateCcw size={15} aria-hidden="true" />
            </button>
          )}
          <a className="icon-button" href="/import-export" aria-label="Import/Export" title="Import/Export">
            <FileInput size={15} aria-hidden="true" />
          </a>
        </div>
      </section>

      {message && <p className="form-message">{message}</p>}

      <section className="overview-hero panel">
        <div>
          <span className="overview-icon"><Box size={20} aria-hidden="true" /></span>
          <p>{t("overview.totalInventory")}</p>
          <strong>{loading ? "..." : vehicles.length}</strong>
          <small>{t("overview.categoriesGauges", { categories: stats.categories.length, gauges: stats.gauges.length })}</small>
        </div>
        <div>
          <span className="overview-icon"><Gauge size={20} aria-hidden="true" /></span>
          <p>{t("overview.digitalization")}</p>
          <strong>{digitalShare}%</strong>
          <small>{t("overview.digitalAnalog", { digital: stats.digital, analog: stats.analog })}</small>
        </div>
        <div>
          <span className="overview-icon"><BarChart3 size={20} aria-hidden="true" /></span>
          <p>{t("overview.listValue")}</p>
          <strong>{currency(stats.totalValue, language)}</strong>
          <small>{t("overview.listValueBasis")}</small>
        </div>
        <div className={stats.due > 0 ? "attention" : ""}>
          <span className="overview-icon">{stats.due > 0 ? <AlertTriangle size={20} aria-hidden="true" /> : <Wrench size={20} aria-hidden="true" />}</span>
          <p>{t("overview.maintenance")}</p>
          <strong>{stats.due}</strong>
          <small>{t("overview.maintenanceSummary", { upcoming: stats.upcoming, open: stats.openMaintenance })}</small>
        </div>
      </section>

      <section className="overview-grid">
        <article className="panel insight-card overview-widget" hidden={!widgetVisible("mix")} style={{ order: widgetOrderIndex("mix") }}>
          <div className="panel-head">
            <div>
              <h2>{t("overview.mix.title")}</h2>
              <p>{t("overview.mix.subtitle")}</p>
            </div>
            {widgetControls("mix", t("overview.mix.title"))}
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
              <h2>{t("overview.quality.title")}</h2>
              <p>{t("overview.quality.subtitle")}</p>
            </div>
            {widgetControls("quality", t("overview.quality.title"))}
          </div>
          <div className="quality-list">
            <div><span>{t("overview.quality.images")}</span><strong>{imageShare}%</strong><i style={{ width: `${imageShare}%` }} /></div>
            <div><span>{t("overview.quality.decoderNumbers")}</span><strong>{decoderShare}%</strong><i style={{ width: `${decoderShare}%` }} /></div>
            <div><span>{t("overview.quality.articleNumbers")}</span><strong>{articleShare}%</strong><i style={{ width: `${articleShare}%` }} /></div>
            <div><span>{t("overview.quality.ean")}</span><strong>{eanShare}%</strong><i style={{ width: `${eanShare}%` }} /></div>
            <div><span>{t("overview.quality.documented")}</span><strong>{documentedShare}%</strong><i style={{ width: `${documentedShare}%` }} /></div>
          </div>
        </article>

        <article className="panel insight-card action-card overview-widget" hidden={!widgetVisible("actions")} style={{ order: widgetOrderIndex("actions") }}>
          <div className="panel-head">
            <div>
              <h2>{t("overview.actions.title")}</h2>
              <p>{t("overview.actions.subtitle")}</p>
            </div>
            {widgetControls("actions", t("overview.actions.title"))}
          </div>
          {stats.dataGaps.length === 0 ? (
            <p className="empty-mini">{t("overview.actions.empty")}</p>
          ) : (
            <div className="action-gap-list">
              {stats.dataGaps.map((gap) => (
                <a key={gap.label} href="/vehicles" className="action-gap">
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
              <h2>{t("overview.manufacturers.title")}</h2>
              <p>{t("overview.manufacturers.subtitle")}</p>
            </div>
            {widgetControls("manufacturers", t("overview.manufacturers.title"))}
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
              <h2>{t("overview.quick.title")}</h2>
              <p>{t("overview.quick.subtitle")}</p>
            </div>
            {widgetControls("quickActions", t("overview.quick.title"))}
          </div>
          <div className="quick-action-list">
            <a href="/vehicles">
              <span>{t("overview.quick.inventory")}</span>
              <small>{t("overview.quick.inventoryHelp")}</small>
              <ArrowRight size={16} aria-hidden="true" />
            </a>
            <a href="/import-export">
              <span>{t("overview.quick.import")}</span>
              <small>{t("overview.quick.importHelp")}</small>
              <ArrowRight size={16} aria-hidden="true" />
            </a>
            <a href="/settings">
              <span>{t("overview.quick.masterData")}</span>
              <small>{t("overview.quick.masterDataHelp")}</small>
              <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>
        </article>

        <article className="panel insight-card maintenance-insight-card overview-widget" hidden={!widgetVisible("maintenance")} style={{ order: widgetOrderIndex("maintenance") }}>
          <div className="panel-head">
            <div>
              <h2>{t("overview.maintenanceRadar.title")}</h2>
              <p>{t("overview.maintenanceRadar.subtitle")}</p>
            </div>
            {widgetControls("maintenance", t("overview.maintenanceRadar.title"))}
          </div>
          {stats.nextMaintenance.length === 0 ? (
            <p className="empty-mini">{t("overview.maintenanceRadar.empty")}</p>
          ) : (
            <div className="maintenance-overview-list">
              {stats.nextMaintenance.map(({ vehicle, entry, days }) => (
                <div key={`${vehicle.id}-${entry.id}`} className={days <= 0 ? "due" : ""}>
                  <span>
                    <strong>{vehicle.inventoryNumber}</strong>
                    <small>{vehicle.name || entry.kind}</small>
                  </span>
                  <em>{entry.kind}</em>
                  <b>{maintenanceDistanceText(days, t)}</b>
                  <small>{formatDate(entry.dueDate, language)}</small>
                </div>
              ))}
            </div>
          )}
          <div className="maintenance-kpi-row">
            <span><small>{t("overview.maintenance.completed")}</small><strong>{stats.completedMaintenance}</strong></span>
            <span><small>{t("overview.maintenance.cost")}</small><strong>{currency(stats.maintenanceCost, language)}</strong></span>
            <span><small>{t("overview.maintenance.conditions")}</small><strong>{stats.conditions.length}</strong></span>
          </div>
        </article>

        <article className="panel insight-card overview-widget" hidden={!widgetVisible("recommendation")} style={{ order: widgetOrderIndex("recommendation") }}>
          <div className="panel-head">
            <div>
              <h2>{t("overview.recommendation.title")}</h2>
              <p>{t("overview.recommendation.subtitle")}</p>
            </div>
            {widgetControls("recommendation", t("overview.recommendation.title"))}
          </div>
          <p className="recommendation">
            {vehicles.length === 0
              ? t("overview.recommendation.empty")
              : imageShare < 70
                ? t("overview.recommendation.images")
                : stats.due > 0
                  ? t("overview.recommendation.maintenance")
            : t("overview.recommendation.stable")}
          </p>
        </article>

        {hiddenWidgets.length === 7 && (
          <article className="panel insight-card overview-reset-card">
            <h2>{t("overview.dashboardEmpty.title")}</h2>
            <p>{t("overview.dashboardEmpty.subtitle")}</p>
            <button type="button" className="secondary-button" onClick={resetWidgets}>
              <RotateCcw size={15} aria-hidden="true" />
              {t("overview.resetLayout")}
            </button>
          </article>
        )}
      </section>
    </>
  );
}
