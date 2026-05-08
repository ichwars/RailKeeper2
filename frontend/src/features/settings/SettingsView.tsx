import { FormEvent, useEffect, useMemo, useState } from "react";
import { Check, Database, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { api, MasterDataEntry, MasterDataInput } from "../../shared/api";

type MasterDataType = {
  type: string;
  label: string;
};

const masterDataTypes: MasterDataType[] = [
  { type: "manufacturer", label: "Hersteller" },
  { type: "railway_company", label: "Bahngesellschaft" },
  { type: "gauge", label: "Spurweite" },
  { type: "epoch", label: "Epoche" },
  { type: "vehicle_category", label: "Kategorie" },
  { type: "vehicle_gattung", label: "Gattung" }
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
  const [activeType, setActiveType] = useState(masterDataTypes[0].type);
  const [items, setItems] = useState<MasterDataEntry[]>([]);
  const [editing, setEditing] = useState<MasterDataEntry | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const activeLabel = useMemo(
    () => masterDataTypes.find((item) => item.type === activeType)?.label || activeType,
    [activeType]
  );

  const load = () => {
    api
      .masterData(activeType)
      .then(setItems)
      .catch((error: Error) => setMessage(error.message));
  };

  useEffect(() => {
    setEditing(null);
    setForm(emptyForm);
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
      <section className="page-head">
        <div>
          <p className="eyebrow">Einstellungen</p>
          <h1>Stammdaten</h1>
          <p>Pflege Hersteller, Bahngesellschaften, Spurweiten, Epochen, Kategorien und Gattungen zentral.</p>
        </div>
      </section>

      <section className="settings-layout">
        <div className="settings-tabs" role="tablist" aria-label="Stammdatentypen">
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
        </div>

        <section className="settings-grid">
          <form className="panel settings-form" onSubmit={submit}>
            <div className="panel-head form-head">
              <div>
                {editing ? <Pencil size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}
                <h2>{editing ? `${activeLabel} bearbeiten` : `${activeLabel} anlegen`}</h2>
              </div>
              {editing && (
                <button type="button" className="icon-button" onClick={startCreate} aria-label="Neu" title="Neu">
                  <X size={17} />
                </button>
              )}
            </div>

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

            <label>
              Name
              <input value={form.label} onChange={(event) => update({ label: event.target.value })} required />
            </label>

            <label>
              Quelle
              <input value={form.sourceUrl} onChange={(event) => update({ sourceUrl: event.target.value })} />
            </label>

            <label className="checkbox-field">
              <input type="checkbox" checked={form.active} onChange={(event) => update({ active: event.target.checked })} />
              Aktiv
            </label>

            <label>
              Metadaten
              <textarea value={form.metadataText} onChange={(event) => update({ metadataText: event.target.value })} rows={10} spellCheck={false} />
            </label>

            <button className="primary-button" disabled={saving}>
              {saving ? "Wird gespeichert..." : "Speichern"}
            </button>
            {message && <p className="form-message">{message}</p>}
          </form>

          <section className="panel settings-list">
            <div className="panel-head list-head">
              <div>
                <Database size={18} aria-hidden="true" />
                <h2>{activeLabel}</h2>
              </div>
              <button type="button" className="icon-button" onClick={load} aria-label="Aktualisieren" title="Aktualisieren">
                <RefreshCw size={16} />
              </button>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Schluessel</th>
                    <th>Status</th>
                    <th>Metadaten</th>
                    <th className="actions-cell">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.label}</td>
                      <td>{entry.key}</td>
                      <td>{entry.active ? <Check size={16} aria-label="Aktiv" /> : "-"}</td>
                      <td>{metadataSummary(entry)}</td>
                      <td className="actions-cell">
                        <div className="table-actions">
                          <button type="button" className="icon-button" onClick={() => startEdit(entry)} aria-label="Bearbeiten" title="Bearbeiten">
                            <Pencil size={16} />
                          </button>
                          <button type="button" className="icon-button danger" onClick={() => deleteEntry(entry)} aria-label="Loeschen" title="Loeschen">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      </section>
    </>
  );
}
