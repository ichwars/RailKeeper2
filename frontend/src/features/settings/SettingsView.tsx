import { FormEvent, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, ExternalLink, Info, Pencil, RefreshCw, ShieldAlert, Trash2, Upload, X } from "lucide-react";
import { api, InventoryNumberScheme, MasterDataEntry, MasterDataInput } from "../../shared/api";

type SettingsTab = "general" | "data" | "importExport" | "appearance";
type MasterDataType = {
  type: string;
  label: string;
  description: string;
  source: string;
};

const settingsTabs: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "Allgemein" },
  { id: "data", label: "Daten" },
  { id: "importExport", label: "Import/Export" },
  { id: "appearance", label: "Darstellung" }
];

const masterDataTypes: MasterDataType[] = [
  {
    type: "manufacturer",
    label: "Hersteller",
    description: "Hersteller mit optionaler Spurweite oder Webseite pflegen.",
    source: "Modellbau-Wiki Hersteller-Kategorien, importiert ueber backend/seeds/master_data.json."
  },
  {
    type: "vehicle_category",
    label: "Kategorie",
    description: "Fahrzeugkategorien fuer die Erfassung verwalten.",
    source: "Kategorie_Gattung.xlsx, importiert ueber backend/seeds/master_data.json."
  },
  {
    type: "vehicle_gattung",
    label: "Gattung",
    description: "Gattungen passend zu den Fahrzeugkategorien pflegen.",
    source: "Kategorie_Gattung.xlsx, importiert ueber backend/seeds/master_data.json."
  },
  {
    type: "epoch",
    label: "Epoche",
    description: "Epochen fuer die Fahrzeugauswahl verwalten.",
    source: "Epoche.txt, importiert ueber backend/seeds/master_data.json."
  },
  {
    type: "gauge",
    label: "Spur",
    description: "Spurweiten und Massstaebe fuer Dropdowns pflegen.",
    source: "Spurweite.xlsx, importiert ueber backend/seeds/master_data.json."
  },
  {
    type: "railway_company",
    label: "Bahngesellschaft",
    description: "Bahngesellschaften mit Abkuerzungen und Zusatzdaten pflegen.",
    source: "Bahngesellschaft.xlsx, importiert ueber backend/seeds/master_data.json."
  },
  {
    type: "symbols",
    label: "Symbole",
    description: "Funktionssymbole fuer Digitalfunktionen verwalten.",
    source: "Standardwerte aus Migration 0013, danach lokal in der SQLite-Stammdatenbank gepflegt."
  }
];

const loadableMasterDataTypes = masterDataTypes;
const articleSearchSettingKey = "railkeeper.articleSearchEnabled";

const emptyForm = {
  key: "",
  label: "",
  active: true,
  sortOrder: 0,
  sourceUrl: "",
  metadataText: "{}"
};

type FormState = typeof emptyForm;

function entryToForm(entry: MasterDataEntry): FormState {
  return {
    key: entry.key,
    label: entry.label,
    active: entry.active,
    sortOrder: entry.sortOrder,
    sourceUrl: entry.sourceUrl || "",
    metadataText: JSON.stringify(entry.metadata || {}, null, 2)
  };
}

function metadataSummary(entry: MasterDataEntry) {
  const keys = Object.keys(entry.metadata || {});
  if (keys.length === 0) return "-";
  return keys.slice(0, 4).join(", ") + (keys.length > 4 ? " ..." : "");
}

function metadataString(entry: MasterDataEntry, key: string) {
  const value = entry.metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function externalLink(entry: MasterDataEntry) {
  const website = metadataString(entry, "website");
  if (website) {
    return { href: website, title: "Website oeffnen" };
  }
  if (entry.sourceUrl) {
    return { href: entry.sourceUrl, title: "Quelle oeffnen" };
  }
  return null;
}

export function SettingsView() {
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>("general");
  const [activeType, setActiveType] = useState(masterDataTypes[0].type);
  const [itemsByType, setItemsByType] = useState<Record<string, MasterDataEntry[]>>({});
  const [loadedTypes, setLoadedTypes] = useState<Record<string, boolean>>({});
  const [loadingTypes, setLoadingTypes] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<MasterDataEntry | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [articleSearchEnabled, setArticleSearchEnabled] = useState(
    () => window.localStorage.getItem(articleSearchSettingKey) !== "false"
  );
  const [design, setDesign] = useState("Light");
  const [inventorySchemes, setInventorySchemes] = useState<InventoryNumberScheme[]>([]);
  const [inventorySchemesLoading, setInventorySchemesLoading] = useState(false);
  const [inventorySchemesMessage, setInventorySchemesMessage] = useState("");
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [backupMessage, setBackupMessage] = useState("");
  const [backupSaving, setBackupSaving] = useState(false);

  const activeDataType = useMemo(
    () => masterDataTypes.find((item) => item.type === activeType) || masterDataTypes[0],
    [activeType]
  );
  const items = itemsByType[activeType] || [];
  const loading = Boolean(loadingTypes[activeType]);

  const filteredItems = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("de-DE");
    if (!needle) return items;
    return items.filter((entry) =>
      `${entry.label} ${entry.key} ${entry.sourceUrl || ""}`.toLocaleLowerCase("de-DE").includes(needle)
    );
  }, [items, search]);

  useEffect(() => {
    setEditing(null);
    setForm(emptyForm);
    setSearch("");
    setMessage("");
  }, [activeType]);

  useEffect(() => {
    if (activeSettingsTab !== "general" || inventorySchemes.length > 0 || inventorySchemesLoading) return;
    loadInventorySchemes();
  }, [activeSettingsTab, inventorySchemes.length, inventorySchemesLoading]);

  useEffect(() => {
    if (activeSettingsTab !== "data" || loadedTypes[activeType]) return;

    let cancelled = false;
    const typesToLoad = loadableMasterDataTypes
      .map((item) => item.type)
      .filter((typeName) => !loadedTypes[typeName]);

    setMessage("");
    setLoadingTypes((current) => ({
      ...current,
      ...Object.fromEntries(typesToLoad.map((typeName) => [typeName, true]))
    }));

    api
      .masterDataAll()
      .then((entriesByType) => {
        if (cancelled) return;

        const normalized = Object.fromEntries(
          loadableMasterDataTypes.map((item) => [item.type, entriesByType[item.type] || []])
        );
        const loaded = Object.fromEntries(loadableMasterDataTypes.map((item) => [item.type, true]));
        setItemsByType((current) => ({ ...current, ...normalized }));
        setLoadedTypes((current) => ({ ...current, ...loaded }));
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setMessage(error.message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingTypes((current) => ({
            ...current,
            ...Object.fromEntries(typesToLoad.map((typeName) => [typeName, false]))
          }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSettingsTab, activeType]);

  const reloadActiveType = () => {
    setLoadingTypes((current) => ({ ...current, [activeType]: true }));
    setMessage("");
    api
      .masterData(activeType)
      .then((entries) => {
        setItemsByType((current) => ({ ...current, [activeType]: entries }));
        setLoadedTypes((current) => ({ ...current, [activeType]: true }));
      })
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setLoadingTypes((current) => ({ ...current, [activeType]: false })));
  };

  const update = (patch: Partial<FormState>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const updateArticleSearchEnabled = (enabled: boolean) => {
    setArticleSearchEnabled(enabled);
    window.localStorage.setItem(articleSearchSettingKey, String(enabled));
  };

  const loadInventorySchemes = () => {
    setInventorySchemesLoading(true);
    setInventorySchemesMessage("");
    api
      .inventoryNumberSchemes()
      .then(setInventorySchemes)
      .catch((error: Error) => setInventorySchemesMessage(error.message))
      .finally(() => setInventorySchemesLoading(false));
  };

  const updateInventoryScheme = (category: string, patch: Partial<InventoryNumberScheme>) => {
    setInventorySchemes((current) =>
      current.map((scheme) => (scheme.category === category ? { ...scheme, ...patch } : scheme))
    );
  };

  const saveInventoryScheme = (scheme: InventoryNumberScheme) => {
    setInventorySchemesMessage("");
    api
      .updateInventoryNumberScheme(scheme.category, {
        prefix: scheme.prefix,
        nextNumber: Number(scheme.nextNumber) || 1,
        padding: Number(scheme.padding) || 6,
        active: scheme.active
      })
      .then((updated) => updateInventoryScheme(updated.category, updated))
      .catch((error: Error) => setInventorySchemesMessage(error.message));
  };

  const startCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setMessage("");
  };

  const startEdit = (entry: MasterDataEntry) => {
    setEditing(entry);
    setForm(entryToForm(entry));
    setMessage("");
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();

    setSaving(true);
    setMessage("");

    let metadata: Record<string, unknown>;
    try {
      metadata = JSON.parse(form.metadataText || "{}");
    } catch {
      setSaving(false);
      setMessage("Metadaten muessen gueltiges JSON sein.");
      return;
    }

    const input: MasterDataInput = {
      key: form.key,
      label: form.label,
      active: form.active,
      sortOrder: Number(form.sortOrder) || 0,
      sourceUrl: form.sourceUrl,
      metadata
    };

    const action = editing
      ? api.updateMasterData(activeType, editing.key, input)
      : api.createMasterData(activeType, input);

    action
      .then((entry) => {
        setEditing(entry);
        setForm(entryToForm(entry));
        reloadActiveType();
      })
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setSaving(false));
  };

  const deleteEntry = (entry: MasterDataEntry) => {
    if (!window.confirm(`${entry.label} loeschen?`)) return;

    api
      .deleteMasterData(activeType, entry.key)
      .then(() => {
        if (editing?.key === entry.key) {
          startCreate();
        }
        reloadActiveType();
      })
      .catch((error: Error) => setMessage(error.message));
  };

  const restoreBackup = () => {
    if (!backupFile) {
      setBackupMessage("Bitte zuerst eine Backup-Datei auswaehlen.");
      return;
    }
    if (!window.confirm("Backup wirklich wiederherstellen? Bestand, Stammdaten, Wartung, CVs und Uploads werden durch den Inhalt der Datei ersetzt.")) {
      return;
    }
    setBackupSaving(true);
    setBackupMessage("");
    api
      .restoreBackup(backupFile)
      .then((result) => {
        setBackupMessage(
          `Backup wiederhergestellt: ${result.restoredRows} Datensaetze, ${result.restoredFiles} Dateien.`
        );
        setLoadedTypes({});
        setItemsByType({});
      })
      .catch((error: Error) => setBackupMessage(error.message))
      .finally(() => setBackupSaving(false));
  };

  return (
    <>
      <section className="settings-head">
        <h1>
          Einstellungen <span>0.1.0</span>
        </h1>
        <p>Inventarverwaltung fuer Modellbahn und Zubehoer</p>
      </section>

      <nav className="settings-primary-tabs" aria-label="Einstellungen">
        {settingsTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeSettingsTab === tab.id ? "active" : ""}
            onClick={() => setActiveSettingsTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeSettingsTab === "general" && (
        <section className="panel settings-card">
          <h2>Allgemein</h2>
          <p>Grundlegende Einstellungen fuer Suche und Darstellung.</p>

          <div className="settings-general-grid">
            <div>
              <h3>Artikeldaten-Websuche</h3>
              <p>Aktiviert die spaetere Suche nach externen Artikeldaten.</p>
            </div>
            <label className="switch-field" aria-label="Artikeldaten-Websuche">
              <input
                type="checkbox"
                checked={articleSearchEnabled}
                onChange={(event) => updateArticleSearchEnabled(event.target.checked)}
              />
              <span />
            </label>
            <label>
              Design
              <select value={design} onChange={(event) => setDesign(event.target.value)}>
                <option>Light</option>
                <option>Dark</option>
              </select>
            </label>
          </div>

          <div className="inventory-number-settings">
            <div className="settings-section-head">
              <div>
                <h3>Inventarnummern</h3>
                <p>Praefixe, laufende Nummern und Stellen je Fahrzeugtyp verwalten.</p>
              </div>
              <button type="button" className="icon-button" onClick={loadInventorySchemes} aria-label="Aktualisieren" title="Aktualisieren" disabled={inventorySchemesLoading}>
                <RefreshCw size={16} />
              </button>
            </div>

            <div className="table-wrap settings-inline-table">
              <table>
                <thead>
                  <tr>
                    <th>Kategorie</th>
                    <th>Praefix</th>
                    <th>Naechste Nr.</th>
                    <th>Stellen</th>
                    <th>Aktiv</th>
                    <th>Vorschau</th>
                    <th>Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {inventorySchemesLoading && inventorySchemes.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="loading-cell">Lade Nummernschemata...</td>
                    </tr>
                  ) : inventorySchemes.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="loading-cell">Keine Nummernschemata gefunden.</td>
                    </tr>
                  ) : (
                    inventorySchemes.map((scheme) => (
                      <tr key={scheme.id}>
                        <td><strong>{scheme.category}</strong></td>
                        <td>
                          <input value={scheme.prefix} onChange={(event) => updateInventoryScheme(scheme.category, { prefix: event.target.value })} />
                        </td>
                        <td>
                          <input type="number" min={1} value={scheme.nextNumber} onChange={(event) => updateInventoryScheme(scheme.category, { nextNumber: Number(event.target.value) })} />
                        </td>
                        <td>
                          <input type="number" min={1} max={12} value={scheme.padding} onChange={(event) => updateInventoryScheme(scheme.category, { padding: Number(event.target.value) })} />
                        </td>
                        <td>
                          <label className="switch-field" aria-label={`${scheme.category} aktiv`}>
                            <input type="checkbox" checked={scheme.active} onChange={(event) => updateInventoryScheme(scheme.category, { active: event.target.checked })} />
                            <span />
                          </label>
                        </td>
                        <td><code>{scheme.preview}</code></td>
                        <td>
                          <button type="button" className="secondary-button compact-action" onClick={() => saveInventoryScheme(scheme)}>
                            Speichern
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {inventorySchemesMessage && <p className="form-message">{inventorySchemesMessage}</p>}
          </div>

          <div className="settings-card-actions">
            <button type="button" className="primary-button">Speichern</button>
          </div>
        </section>
      )}

      {activeSettingsTab === "data" && (
        <section className="panel settings-card data-card">
          <h2>Daten</h2>
          <p>Pflege hier die Auswahlwerte fuer Dropdowns und Symbol-Listen.</p>

          <nav className="settings-secondary-tabs" aria-label="Stammdaten">
            {masterDataTypes.map((item) => (
              <button
                key={item.type}
                type="button"
                className={item.type === activeType ? "active" : ""}
                onClick={() => setActiveType(item.type)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <section className="master-data-panel">
            <div className="master-data-head">
              <div>
                <h3>{activeDataType.label} verwalten</h3>
                <p>{activeDataType.description}</p>
              </div>
              <button type="button" className="icon-button" onClick={reloadActiveType} aria-label="Aktualisieren" title="Aktualisieren" disabled={loading}>
                <RefreshCw size={16} />
              </button>
            </div>

            <>
              <label className="settings-search">
                Suche
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Stammdaten durchsuchen" />
              </label>

                <p className="source-note">
                  <Info size={15} aria-hidden="true" />
                  <span>
                    Quelle: {activeDataType.source} Bearbeitete Werte liegen danach in der lokalen SQLite-Stammdatenbank.
                  </span>
                </p>

                <form className="master-data-create" onSubmit={submit}>
                  <strong>{editing ? "Eintrag bearbeiten" : "Neuer Eintrag"}</strong>
                  <input value={form.label} onChange={(event) => update({ label: event.target.value })} placeholder={`${activeDataType.label} eintragen`} required />
                  <input value={form.sourceUrl} onChange={(event) => update({ sourceUrl: event.target.value })} placeholder="Webseite optional" />
                  <button className="primary-button" disabled={saving}>
                    {saving ? "Speichert..." : editing ? "Speichern" : "+ Hinzufuegen"}
                  </button>
                  {editing && (
                    <button type="button" className="icon-button" onClick={startCreate} aria-label="Abbrechen" title="Abbrechen">
                      <X size={16} />
                    </button>
                  )}
                </form>

                <details className="advanced-master-data">
                  <summary>Erweiterte Felder</summary>
                  <form className="settings-form" onSubmit={submit}>
                    <div className="form-row">
                      <label>
                        Schluessel
                        <input value={form.key} onChange={(event) => update({ key: event.target.value })} disabled={Boolean(editing)} />
                      </label>
                      <label>
                        Sortierung
                        <input type="number" value={form.sortOrder} onChange={(event) => update({ sortOrder: Number(event.target.value) })} />
                      </label>
                    </div>
                    <label className="checkbox-field">
                      <input type="checkbox" checked={form.active} onChange={(event) => update({ active: event.target.checked })} />
                      Aktiv
                    </label>
                    <label>
                      Metadaten
                      <textarea value={form.metadataText} onChange={(event) => update({ metadataText: event.target.value })} rows={7} spellCheck={false} />
                    </label>
                    {message && <p className="form-message">{message}</p>}
                  </form>
                </details>

                <div className="table-wrap master-data-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Aktionen</th>
                        <th>Name</th>
                        <th>Metadaten</th>
                        <th>Link</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr>
                          <td colSpan={5} className="loading-cell">Lade aus lokaler Stammdatenbank...</td>
                        </tr>
                      ) : filteredItems.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="loading-cell">Keine Eintraege gefunden.</td>
                        </tr>
                      ) : (
                        filteredItems.map((entry) => {
                          const link = externalLink(entry);
                          return (
                            <tr key={entry.id}>
                              <td>
                                <div className="table-actions">
                                  <button type="button" className="icon-button" onClick={() => startEdit(entry)} aria-label="Bearbeiten" title="Bearbeiten">
                                    <Pencil size={16} />
                                  </button>
                                  <button type="button" className="icon-button danger" onClick={() => deleteEntry(entry)} aria-label="Loeschen" title="Loeschen">
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </td>
                              <td><strong>{entry.label}</strong></td>
                              <td>{metadataSummary(entry)}</td>
                              <td>
                                {link ? (
                                  <a className="table-icon-link" href={link.href} target="_blank" rel="noreferrer" aria-label={link.title} title={link.title}>
                                    <ExternalLink size={16} />
                                  </a>
                                ) : "-"}
                              </td>
                              <td>
                                {entry.active ? (
                                  <CheckCircle2 className="status-icon active" size={17} aria-label="Aktiv" />
                                ) : (
                                  <span className="status-icon inactive" aria-label="Inaktiv" title="Inaktiv" />
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {message && <p className="form-message">{message}</p>}
            </>
          </section>
        </section>
      )}

      {activeSettingsTab === "importExport" && (
        <section className="panel settings-card import-export-card">
          <h2>Import/Export</h2>
          <p>Lokales Vollbackup fuer Bestand, Stammdaten, Wartung, Digitalfunktionen, CV-Daten und Upload-Dateien.</p>

          <div className="backup-grid">
            <section className="backup-box">
              <div>
                <h3>Backup exportieren</h3>
                <p>Erstellt eine JSON-Datei mit allen RailKeeper-Daten und lokal gespeicherten Uploads. Benutzerkonten und Sitzungen werden nicht exportiert.</p>
              </div>
              <a className="primary-button" href={api.backupExportUrl()}>
                <Download size={17} />
                Backup herunterladen
              </a>
            </section>

            <section className="backup-box warning">
              <div>
                <h3>Backup wiederherstellen</h3>
                <p>Ersetzt lokale App-Daten und Uploads durch den Inhalt der Backup-Datei. Bitte vorher ein aktuelles Backup exportieren.</p>
              </div>
              <label className="backup-file-field">
                Backup-Datei
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) => setBackupFile(event.target.files?.[0] || null)}
                />
              </label>
              <button type="button" className="secondary-button danger" onClick={restoreBackup} disabled={backupSaving}>
                {backupSaving ? (
                  "Wird wiederhergestellt..."
                ) : (
                  <>
                    <Upload size={17} />
                    Backup einspielen
                  </>
                )}
              </button>
            </section>
          </div>

          <p className="source-note backup-note">
            <ShieldAlert size={16} aria-hidden="true" />
            <span>Restore ist absichtlich Admin-geschuetzt und ersetzt Daten. Der Export enthaelt keine Passworthashes.</span>
          </p>
          {backupMessage && <p className="form-message">{backupMessage}</p>}
        </section>
      )}

      {activeSettingsTab === "appearance" && (
        <section className="panel settings-card">
          <h2>Darstellung</h2>
          <p>Design-Optionen und Anzeigeeinstellungen werden hier gebuendelt.</p>
        </section>
      )}
    </>
  );
}
