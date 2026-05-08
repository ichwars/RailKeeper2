import { FormEvent, useEffect, useMemo, useState } from "react";
import { Check, Pencil, RefreshCw, Trash2, X } from "lucide-react";
import { api, MasterDataEntry, MasterDataInput } from "../../shared/api";

type SettingsTab = "general" | "data" | "importExport" | "appearance";
type MasterDataType = {
  type: string;
  label: string;
  description: string;
};

const settingsTabs: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "Allgemein" },
  { id: "data", label: "Daten" },
  { id: "importExport", label: "Import/Export" },
  { id: "appearance", label: "Darstellung" }
];

const masterDataTypes: MasterDataType[] = [
  { type: "manufacturer", label: "Hersteller", description: "Hersteller mit optionaler Spurweite oder Webseite pflegen." },
  { type: "vehicle_category", label: "Kategorie", description: "Fahrzeugkategorien fuer die Erfassung verwalten." },
  { type: "vehicle_gattung", label: "Gattung", description: "Gattungen passend zu den Fahrzeugkategorien pflegen." },
  { type: "epoch", label: "Epoche", description: "Epochen fuer die Fahrzeugauswahl verwalten." },
  { type: "gauge", label: "Spur", description: "Spurweiten und Massstaebe fuer Dropdowns pflegen." },
  { type: "railway_company", label: "Bahngesellschaft", description: "Bahngesellschaften mit Abkuerzungen und Zusatzdaten pflegen." },
  { type: "symbols", label: "Symbole", description: "Funktionssymbole werden spaeter als eigener Datenblock erfasst." }
];

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

export function SettingsView() {
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>("general");
  const [activeType, setActiveType] = useState(masterDataTypes[0].type);
  const [items, setItems] = useState<MasterDataEntry[]>([]);
  const [editing, setEditing] = useState<MasterDataEntry | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [articleSearchEnabled, setArticleSearchEnabled] = useState(true);
  const [design, setDesign] = useState("Light");

  const activeDataType = useMemo(
    () => masterDataTypes.find((item) => item.type === activeType) || masterDataTypes[0],
    [activeType]
  );
  const isSymbolTab = activeType === "symbols";

  const filteredItems = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("de-DE");
    if (!needle) return items;
    return items.filter((entry) =>
      `${entry.label} ${entry.key} ${entry.sourceUrl || ""}`.toLocaleLowerCase("de-DE").includes(needle)
    );
  }, [items, search]);

  const load = () => {
    if (isSymbolTab) {
      setItems([]);
      return;
    }

    api
      .masterData(activeType)
      .then(setItems)
      .catch((error: Error) => setMessage(error.message));
  };

  useEffect(() => {
    setEditing(null);
    setForm(emptyForm);
    setSearch("");
    setMessage("");
    load();
  }, [activeType]);

  const update = (patch: Partial<FormState>) => {
    setForm((current) => ({ ...current, ...patch }));
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
    if (isSymbolTab) return;

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
        load();
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
        load();
      })
      .catch((error: Error) => setMessage(error.message));
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
                onChange={(event) => setArticleSearchEnabled(event.target.checked)}
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
              <button type="button" className="icon-button" onClick={load} aria-label="Aktualisieren" title="Aktualisieren" disabled={isSymbolTab}>
                <RefreshCw size={16} />
              </button>
            </div>

            {isSymbolTab ? (
              <p className="empty-state">Symbole bereite ich als naechsten fachlichen Datenblock vor.</p>
            ) : (
              <>
                <label className="settings-search">
                  Suche
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Stammdaten durchsuchen" />
                </label>

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
                        <th>Website</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.map((entry) => (
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
                          <td>{entry.sourceUrl ? <a href={entry.sourceUrl} target="_blank" rel="noreferrer">oeffnen</a> : "-"}</td>
                          <td>{entry.active ? <span className="status-pill"><Check size={14} /> aktiv</span> : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {message && <p className="form-message">{message}</p>}
              </>
            )}
          </section>
        </section>
      )}

      {activeSettingsTab === "importExport" && (
        <section className="panel settings-card">
          <h2>Import/Export</h2>
          <p>Import und Export werden spaeter auf Basis der stabilen Datenstruktur umgesetzt.</p>
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
