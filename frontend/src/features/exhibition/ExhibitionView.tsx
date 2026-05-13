import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Circle,
  Cloud,
  Edit3,
  Eye,
  Gauge,
  Image as ImageIcon,
  Lightbulb,
  Link,
  Lock,
  LockOpen,
  Megaphone,
  Plus,
  Printer,
  Trash2,
  Upload,
  Volume2
} from "lucide-react";
import { api, ExhibitionEntry, ExhibitionEntryInput, ExhibitionList, ExhibitionListInput, MasterDataEntry } from "../../shared/api";

type ListSortKey = "designation" | "date" | "entryCount" | "locked";
type EntrySortKey = "owner" | "locomotiveName" | "dtDecoder" | "decoderNumber" | "functionKeys";
type SortDirection = "asc" | "desc";
type EntryTab = "general" | "images" | "functions";

type ExhibitionFunction = {
  key: string;
  name: string;
  type: string;
  symbolKey?: string;
};

const emptyListForm: ExhibitionListInput = { designation: "", date: new Date().toISOString().slice(0, 10) };
const emptyEntryForm: ExhibitionEntryInput = {
  owner: "",
  imageUrl: "",
  locomotiveName: "",
  dtDecoder: false,
  decoderNumber: "",
  functionKeys: "",
  notes: ""
};
const functionKeys = Array.from({ length: 32 }, (_, index) => `F${index}`);
const functionTypes = ["standard", "licht", "sound", "kupplung", "rauch", "sonderfunktion"];
const fallbackFunctionSymbols = [
  { key: "light", label: "Licht" },
  { key: "sound", label: "Sound" },
  { key: "horn", label: "Horn" },
  { key: "coupling", label: "Kupplung" },
  { key: "smoke", label: "Rauch" },
  { key: "drive", label: "Fahren" },
  { key: "warning", label: "Warnung" }
];
const htmlEscapes: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;"
};
const emptyFunctions = () => functionKeys.map((key) => ({ key, name: key === "F0" ? "Fahrlicht" : "", type: key === "F0" ? "licht" : "standard", symbolKey: key === "F0" ? "light" : "" }));

function hasAdmin(roles: string[]) {
  return roles.includes("Admin");
}

function formatDate(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function sortValue(value: unknown) {
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") return String(value).padStart(8, "0");
  return String(value || "").toLowerCase();
}

function parseFunctions(value?: string): ExhibitionFunction[] {
  if (!value) return emptyFunctions();
  try {
    const parsed = JSON.parse(value) as ExhibitionFunction[];
    if (Array.isArray(parsed)) {
      const byKey = new Map(parsed.map((item) => [item.key, item]));
      return emptyFunctions().map((item) => ({ ...item, ...(byKey.get(item.key) || {}) }));
    }
  } catch {
    const byKey = new Map<string, ExhibitionFunction>();
    for (const part of value.split(/[,;\n]/)) {
      const match = part.trim().match(/^(F\d{1,2})\s*[:=-]?\s*(.*)$/i);
      if (match) byKey.set(match[1].toUpperCase(), { key: match[1].toUpperCase(), name: match[2].trim(), type: "standard" });
    }
    return emptyFunctions().map((item) => ({ ...item, ...(byKey.get(item.key) || {}) }));
  }
  return emptyFunctions();
}

function serializeFunctions(functions: ExhibitionFunction[]) {
  return JSON.stringify(functions.filter((item) => item.name.trim()).map((item) => ({ ...item, name: item.name.trim(), symbolKey: item.symbolKey || "" })));
}

function displayFunctions(value?: string) {
  const configured = parseFunctions(value).filter((item) => item.name.trim());
  if (configured.length === 0) return "-";
  return configured.map((item) => `${item.key} ${item.name}`).join(", ");
}

function escapeHTML(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => htmlEscapes[char] || char);
}

function fileToDataURL(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Bild konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
}

function symbolImageFromMetadata(metadata?: Record<string, unknown>) {
  const value = metadata?.imageData || metadata?.activeImageData || metadata?.svgData;
  return typeof value === "string" ? value : "";
}

function functionSymbolIcon(symbolKey?: string, functionType?: string, metadata?: Record<string, unknown>) {
  const imageData = symbolImageFromMetadata(metadata);
  if (imageData) {
    return <img className="function-symbol-image" src={imageData} alt="" aria-hidden="true" />;
  }

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
  const merged = new Map<string, { key: string; label: string; metadata?: Record<string, unknown> }>();
  for (const symbol of fallbackFunctionSymbols) {
    merged.set(symbol.key, symbol);
  }
  for (const symbol of symbols) {
    if (symbol.active) {
      merged.set(symbol.key, { key: symbol.key, label: symbol.label, metadata: symbol.metadata });
    }
  }
  return [...merged.values()];
}

function functionSymbolMetadata(symbols: MasterDataEntry[], key?: string) {
  if (!key) return undefined;
  return symbols.find((symbol) => symbol.key === key && symbol.active)?.metadata;
}

function FunctionSymbolPicker({
  value,
  functionType,
  symbols,
  label,
  onChange
}: {
  value?: string;
  functionType?: string;
  symbols: MasterDataEntry[];
  label: string;
  onChange: (value: string) => void;
}) {
  const options = functionSymbolOptions(symbols);
  const selected = options.find((symbol) => symbol.key === value);
  return (
    <details className="function-symbol-picker">
      <summary aria-label={label}>
        {functionSymbolIcon(value, functionType, selected?.metadata)}
        <span>{selected?.label || "Symbol"}</span>
      </summary>
      <div className="function-symbol-menu">
        <button type="button" className={!value ? "active" : ""} onClick={() => onChange("")}>
          <Circle size={16} aria-hidden="true" />
          <span>Kein Symbol</span>
        </button>
        {options.map((symbol) => (
          <button type="button" key={symbol.key} className={value === symbol.key ? "active" : ""} onClick={() => onChange(symbol.key)} title={symbol.label}>
            {functionSymbolIcon(symbol.key, functionType, symbol.metadata)}
            <span>{symbol.label}</span>
          </button>
        ))}
      </div>
    </details>
  );
}

function printList(list: ExhibitionList, entries: ExhibitionEntry[]) {
  const rows = entries.map((entry) => `
    <tr>
      <td>${escapeHTML(entry.owner)}</td>
      <td>${escapeHTML(entry.locomotiveName)}</td>
      <td>${entry.dtDecoder ? "Ja" : "Nein"}</td>
      <td>${escapeHTML(entry.decoderNumber || "-")}</td>
      <td>${escapeHTML(displayFunctions(entry.functionKeys))}</td>
    </tr>
  `).join("");
  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) return;
  win.document.write(`<!doctype html>
    <html lang="de">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHTML(list.designation)}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 28px; color: #111; }
          h1 { margin: 0 0 6px; }
          p { margin: 0 0 20px; color: #555; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border-bottom: 1px solid #ddd; padding: 8px; text-align: left; vertical-align: top; }
          th { background: #f3f6f4; }
        </style>
      </head>
      <body>
        <h1>${escapeHTML(list.designation)}</h1>
        <p>${escapeHTML(formatDate(list.date))} · ${entries.length} Einträge</p>
        <table>
          <thead>
            <tr><th>Besitzer</th><th>Lok Bezeichnung</th><th>DT</th><th>Decoder-Nr.</th><th>Funktionstasten</th></tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="5">Keine Einträge.</td></tr>`}</tbody>
        </table>
        <script>window.print();</script>
      </body>
    </html>`);
  win.document.close();
}

export function ExhibitionView({ roles }: { roles: string[] }) {
  const canManageLists = hasAdmin(roles);
  const [lists, setLists] = useState<ExhibitionList[]>([]);
  const [selectedID, setSelectedID] = useState("");
  const [entries, setEntries] = useState<ExhibitionEntry[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [listSort, setListSort] = useState<{ key: ListSortKey; direction: SortDirection }>({ key: "date", direction: "desc" });
  const [entrySort, setEntrySort] = useState<{ key: EntrySortKey; direction: SortDirection }>({ key: "owner", direction: "asc" });
  const [listDialog, setListDialog] = useState<{ mode: "create" | "edit"; list?: ExhibitionList } | null>(null);
  const [entryDialog, setEntryDialog] = useState<{ mode: "create" | "edit"; entry?: ExhibitionEntry } | null>(null);
  const [viewDialog, setViewDialog] = useState<{ list: ExhibitionList; entries: ExhibitionEntry[] } | null>(null);
  const [activeEntryTab, setActiveEntryTab] = useState<EntryTab>("general");
  const [entryFunctions, setEntryFunctions] = useState<ExhibitionFunction[]>(emptyFunctions);
  const [listForm, setListForm] = useState<ExhibitionListInput>(emptyListForm);
  const [entryForm, setEntryForm] = useState<ExhibitionEntryInput>(emptyEntryForm);
  const [symbols, setSymbols] = useState<MasterDataEntry[]>([]);

  const selectedList = lists.find((list) => list.id === selectedID) || null;
  const canEditEntries = Boolean(selectedList && !selectedList.locked);
  const canDeleteEntries = Boolean(canManageLists && canEditEntries);

  const sortedLists = useMemo(() => {
    return [...lists].sort((a, b) => {
      const result = sortValue(a[listSort.key]).localeCompare(sortValue(b[listSort.key]), "de");
      return listSort.direction === "asc" ? result : -result;
    });
  }, [listSort, lists]);

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      const result = sortValue(a[entrySort.key]).localeCompare(sortValue(b[entrySort.key]), "de");
      return entrySort.direction === "asc" ? result : -result;
    });
  }, [entries, entrySort]);

  const load = () => {
    setLoading(true);
    setMessage("");
    api
      .exhibitionLists()
      .then((next) => {
        setLists(next);
        setSelectedID((current) => current || next[0]?.id || "");
      })
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    api.masterData("symbols", true).then(setSymbols).catch((error: Error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    if (!selectedID) {
      setEntries([]);
      return;
    }
    api.exhibitionEntries(selectedID).then(setEntries).catch((error: Error) => setMessage(error.message));
  }, [selectedID]);

  const setListSortKey = (key: ListSortKey) => {
    setListSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
  };

  const setEntrySortKey = (key: EntrySortKey) => {
    setEntrySort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
  };

  const openListDialog = (mode: "create" | "edit", list?: ExhibitionList) => {
    setListForm(list ? { designation: list.designation, date: list.date } : emptyListForm);
    setListDialog({ mode, list });
  };

  const saveList = async () => {
    if (!canManageLists) return;
    setSaving(true);
    setMessage("");
    try {
      const saved = listDialog?.mode === "edit" && listDialog.list
        ? await api.updateExhibitionList(listDialog.list.id, listForm)
        : await api.createExhibitionList(listForm);
      setListDialog(null);
      setSelectedID(saved.id);
      load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Messeliste konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  };

  const deleteList = async (list: ExhibitionList) => {
    if (!canManageLists || !window.confirm(`Messeliste "${list.designation}" wirklich löschen?`)) return;
    await api.deleteExhibitionList(list.id);
    if (selectedID === list.id) setSelectedID("");
    load();
  };

  const toggleLock = async (list: ExhibitionList) => {
    if (!canManageLists) return;
    const updated = await api.setExhibitionListLocked(list.id, !list.locked);
    setLists((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  };

  const entriesForList = async (list: ExhibitionList) => {
    if (list.id === selectedID) return entries;
    return api.exhibitionEntries(list.id);
  };

  const openListView = async (list: ExhibitionList) => {
    setSelectedID(list.id);
    const nextEntries = await entriesForList(list);
    setViewDialog({ list, entries: nextEntries });
  };

  const printListByID = async (list: ExhibitionList) => {
    printList(list, await entriesForList(list));
  };

  const openEntryDialog = (mode: "create" | "edit", entry?: ExhibitionEntry) => {
    setActiveEntryTab("general");
    setEntryFunctions(parseFunctions(entry?.functionKeys));
    setEntryForm(entry ? {
      owner: entry.owner,
      imageUrl: entry.imageUrl || "",
      locomotiveName: entry.locomotiveName,
      dtDecoder: entry.dtDecoder,
      decoderNumber: entry.decoderNumber || "",
      functionKeys: entry.functionKeys || "",
      notes: entry.notes || "",
      sortOrder: entry.sortOrder
    } : { ...emptyEntryForm, sortOrder: entries.length * 10 + 10 });
    setEntryDialog({ mode, entry });
  };

  const reloadEntries = async () => {
    if (!selectedID) return;
    const next = await api.exhibitionEntries(selectedID);
    setEntries(next);
    setLists((current) => current.map((list) => (list.id === selectedID ? { ...list, entryCount: next.length } : list)));
  };

  const saveEntry = async () => {
    if (!selectedID || !canEditEntries) return;
    setSaving(true);
    setMessage("");
    const payload = { ...entryForm, functionKeys: serializeFunctions(entryFunctions) };
    try {
      if (entryDialog?.mode === "edit" && entryDialog.entry) {
        await api.updateExhibitionEntry(selectedID, entryDialog.entry.id, payload);
      } else {
        await api.createExhibitionEntry(selectedID, payload);
      }
      setEntryDialog(null);
      await reloadEntries();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Eintrag konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (entry: ExhibitionEntry) => {
    if (!selectedID || !canDeleteEntries || !window.confirm(`Eintrag "${entry.locomotiveName}" wirklich löschen?`)) return;
    await api.deleteExhibitionEntry(selectedID, entry.id);
    await reloadEntries();
  };

  const uploadEntryImage = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const imageUrl = await fileToDataURL(file);
    setEntryForm((current) => ({ ...current, imageUrl }));
  };

  const updateEntryFunction = (key: string, patch: Partial<ExhibitionFunction>) => {
    setEntryFunctions((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  };

  return (
    <>
      <section className="inventory-head">
        <div>
          <p className="eyebrow">Messebetrieb</p>
          <h1>Messeliste</h1>
          <p>Listen für Messe- und Fahrtage anlegen, sperren, pflegen und drucken.</p>
        </div>
        {canManageLists && (
          <button type="button" className="primary-button new-vehicle-button" onClick={() => openListDialog("create")}>
            <Plus size={16} aria-hidden="true" />
            Neue Liste
          </button>
        )}
      </section>

      {message && <p className="form-message">{message}</p>}

      <section className="exhibition-layout">
        <article className="panel exhibition-list-panel">
          <div className="inventory-list-head">
            <div>
              <h2>Listen</h2>
              <p>{loading ? "Wird geladen..." : `${lists.length} Messelisten`}</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="inventory-table exhibition-table">
              <thead>
                <tr>
                  <th><button type="button" className={listSort.key === "designation" ? "sort-button active" : "sort-button"} onClick={() => setListSortKey("designation")}>Bezeichnung</button></th>
                  <th><button type="button" className={listSort.key === "date" ? "sort-button active" : "sort-button"} onClick={() => setListSortKey("date")}>Datum</button></th>
                  <th><button type="button" className={listSort.key === "entryCount" ? "sort-button active" : "sort-button"} onClick={() => setListSortKey("entryCount")}>Einträge</button></th>
                  <th><button type="button" className={listSort.key === "locked" ? "sort-button active" : "sort-button"} onClick={() => setListSortKey("locked")}>Status</button></th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {sortedLists.map((list) => (
                  <tr key={list.id} className={selectedID === list.id ? "selected-row" : ""} onClick={() => setSelectedID(list.id)}>
                    <td><strong>{list.designation}</strong></td>
                    <td>{formatDate(list.date)}</td>
                    <td>{list.entryCount}</td>
                    <td><span className={list.locked ? "settings-pill muted" : "settings-pill active"}>{list.locked ? "gesperrt" : "offen"}</span></td>
                    <td>
                      <div className="table-actions">
                        <button type="button" className="icon-button" onClick={(event) => { event.stopPropagation(); openListView(list); }} aria-label="Ansehen" title="Ansehen"><Eye size={15} /></button>
                        {canManageLists && <button type="button" className="icon-button" onClick={(event) => { event.stopPropagation(); openListDialog("edit", list); }} aria-label="Bearbeiten" title="Bearbeiten"><Edit3 size={15} /></button>}
                        <button type="button" className="icon-button" onClick={(event) => { event.stopPropagation(); printListByID(list); }} aria-label="Drucken" title="Drucken"><Printer size={15} /></button>
                        {canManageLists && <button type="button" className="icon-button" onClick={(event) => { event.stopPropagation(); toggleLock(list); }} aria-label={list.locked ? "Entsperren" : "Sperren"} title={list.locked ? "Entsperren" : "Sperren"}>{list.locked ? <LockOpen size={15} /> : <Lock size={15} />}</button>}
                        {canManageLists && <button type="button" className="icon-button danger" onClick={(event) => { event.stopPropagation(); deleteList(list); }} aria-label="Löschen" title="Löschen"><Trash2 size={15} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {sortedLists.length === 0 && (
                  <tr><td colSpan={5}>Noch keine Messeliste angelegt.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel exhibition-entry-panel">
          <div className="inventory-list-head">
            <div>
              <h2>{selectedList ? selectedList.designation : "Einträge"}</h2>
              <p>{selectedList ? `${formatDate(selectedList.date)} · ${entries.length} Einträge` : "Bitte eine Liste auswählen."}</p>
            </div>
            <div className="table-actions">
              {selectedList && <button type="button" className="icon-button" onClick={() => printList(selectedList, sortedEntries)} aria-label="Liste drucken" title="Liste drucken"><Printer size={15} /></button>}
              {selectedList && <button type="button" className="primary-button" onClick={() => openEntryDialog("create")} disabled={!canEditEntries}>Eintrag</button>}
            </div>
          </div>
          <div className="table-wrap">
            <table className="inventory-table exhibition-table">
              <thead>
                <tr>
                  <th>Bild</th>
                  <th><button type="button" className={entrySort.key === "owner" ? "sort-button active" : "sort-button"} onClick={() => setEntrySortKey("owner")}>Besitzer</button></th>
                  <th><button type="button" className={entrySort.key === "locomotiveName" ? "sort-button active" : "sort-button"} onClick={() => setEntrySortKey("locomotiveName")}>Lok Bezeichnung</button></th>
                  <th><button type="button" className={entrySort.key === "dtDecoder" ? "sort-button active" : "sort-button"} onClick={() => setEntrySortKey("dtDecoder")}>DT</button></th>
                  <th><button type="button" className={entrySort.key === "decoderNumber" ? "sort-button active" : "sort-button"} onClick={() => setEntrySortKey("decoderNumber")}>Decoder-Nr.</button></th>
                  <th><button type="button" className={entrySort.key === "functionKeys" ? "sort-button active" : "sort-button"} onClick={() => setEntrySortKey("functionKeys")}>Funktionstasten</button></th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {sortedEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.imageUrl ? <img className="exhibition-thumb" src={entry.imageUrl} alt="" /> : <span className="image-placeholder mini">-</span>}</td>
                    <td>{entry.owner}</td>
                    <td><strong>{entry.locomotiveName}</strong>{entry.notes && <small>{entry.notes}</small>}</td>
                    <td>{entry.dtDecoder ? "Ja" : "Nein"}</td>
                    <td>{entry.decoderNumber || "-"}</td>
                    <td>{displayFunctions(entry.functionKeys)}</td>
                    <td>
                      <div className="table-actions">
                        <button type="button" className="icon-button" onClick={() => openEntryDialog("edit", entry)} disabled={!canEditEntries} aria-label="Bearbeiten" title="Bearbeiten"><Edit3 size={15} /></button>
                        {canManageLists && <button type="button" className="icon-button danger" onClick={() => deleteEntry(entry)} disabled={!canDeleteEntries} aria-label="Löschen" title="Löschen"><Trash2 size={15} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {selectedList && sortedEntries.length === 0 && (
                  <tr><td colSpan={7}>Noch keine Einträge in dieser Liste.</td></tr>
                )}
                {!selectedList && (
                  <tr><td colSpan={7}>Keine Liste ausgewählt.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      {listDialog && (
        <div className="modal-layer">
          <form className="vehicle-modal compact-modal" onSubmit={(event) => { event.preventDefault(); saveList(); }}>
            <div className="modal-head">
              <h2>{listDialog.mode === "edit" ? "Messeliste bearbeiten" : "Messeliste anlegen"}</h2>
              <button type="button" className="icon-button" onClick={() => setListDialog(null)} aria-label="Schließen">×</button>
            </div>
            <div className="modal-body simple-form">
              <label>
                <span>Bezeichnung</span>
                <input value={listForm.designation} onChange={(event) => setListForm({ ...listForm, designation: event.target.value })} required />
              </label>
              <label>
                <span>Datum</span>
                <input type="date" value={listForm.date} onChange={(event) => setListForm({ ...listForm, date: event.target.value })} required />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setListDialog(null)}>Abbrechen</button>
              <button type="submit" className="primary-button" disabled={saving}>Speichern</button>
            </div>
          </form>
        </div>
      )}

      {viewDialog && (
        <div className="modal-layer">
          <section className="vehicle-modal exhibition-view-modal">
            <div className="modal-head">
              <div>
                <h2>{viewDialog.list.designation}</h2>
                <p>{formatDate(viewDialog.list.date)} · {viewDialog.entries.length} Einträge</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setViewDialog(null)} aria-label="Schließen">×</button>
            </div>
            <div className="modal-body">
              <div className="table-wrap">
                <table className="inventory-table exhibition-table">
                  <thead>
                    <tr>
                      <th>Bild</th>
                      <th>Besitzer</th>
                      <th>Lok Bezeichnung</th>
                      <th>DT</th>
                      <th>Decoder-Nr.</th>
                      <th>Funktionstasten</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewDialog.entries.map((entry) => (
                      <tr key={entry.id}>
                        <td>{entry.imageUrl ? <img className="exhibition-thumb" src={entry.imageUrl} alt="" /> : <span className="image-placeholder mini">-</span>}</td>
                        <td>{entry.owner}</td>
                        <td><strong>{entry.locomotiveName}</strong>{entry.notes && <small>{entry.notes}</small>}</td>
                        <td>{entry.dtDecoder ? "Ja" : "Nein"}</td>
                        <td>{entry.decoderNumber || "-"}</td>
                        <td>{displayFunctions(entry.functionKeys)}</td>
                      </tr>
                    ))}
                    {viewDialog.entries.length === 0 && <tr><td colSpan={6}>Keine Einträge vorhanden.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => printList(viewDialog.list, viewDialog.entries)}>Drucken</button>
              <button type="button" className="primary-button" onClick={() => setViewDialog(null)}>Schließen</button>
            </div>
          </section>
        </div>
      )}

      {entryDialog && (
        <div className="modal-layer">
          <form className="vehicle-modal exhibition-entry-modal" onSubmit={(event) => { event.preventDefault(); saveEntry(); }}>
            <div className="modal-head">
              <h2>{entryDialog.mode === "edit" ? "Eintrag bearbeiten" : "Eintrag erfassen"}</h2>
              <button type="button" className="icon-button" onClick={() => setEntryDialog(null)} aria-label="Schließen">×</button>
            </div>
            <div className="modal-tabs exhibition-entry-tabs" role="tablist" aria-label="Eintrag bearbeiten">
              <button type="button" className={activeEntryTab === "general" ? "active" : ""} onClick={() => setActiveEntryTab("general")}>Allgemein</button>
              <button type="button" className={activeEntryTab === "images" ? "active" : ""} onClick={() => setActiveEntryTab("images")}>Bilder upload</button>
              <button type="button" className={activeEntryTab === "functions" ? "active" : ""} onClick={() => setActiveEntryTab("functions")}>Funktionstasten</button>
            </div>
            <div className="modal-body">
              {activeEntryTab === "general" && (
                <div className="exhibition-entry-form">
                  <section>
                    <h3>Basisdaten</h3>
                    <label><span>Besitzer</span><input value={entryForm.owner} onChange={(event) => setEntryForm({ ...entryForm, owner: event.target.value })} required /></label>
                    <label><span>Lok Bezeichnung</span><input value={entryForm.locomotiveName} onChange={(event) => setEntryForm({ ...entryForm, locomotiveName: event.target.value })} required /></label>
                  </section>
                  <section>
                    <h3>Digitaltechnik</h3>
                    <label className="checkbox-line"><input type="checkbox" checked={entryForm.dtDecoder} onChange={(event) => setEntryForm({ ...entryForm, dtDecoder: event.target.checked })} /> <span>DT vorhanden</span></label>
                    <label><span>Decoder-Nr.</span><input value={entryForm.decoderNumber || ""} onChange={(event) => setEntryForm({ ...entryForm, decoderNumber: event.target.value })} /></label>
                    <label><span>Notizen</span><textarea value={entryForm.notes || ""} onChange={(event) => setEntryForm({ ...entryForm, notes: event.target.value })} /></label>
                  </section>
                </div>
              )}
              {activeEntryTab === "images" && (
                <section className="exhibition-image-tab">
                  <div className="upload-head">
                    <div>
                      <h3>Bilder</h3>
                      <p>Bild direkt am Messelisteneintrag pflegen.</p>
                    </div>
                    <label className="primary-button">
                      <Upload size={16} aria-hidden="true" />
                      Bild hochladen
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="visually-hidden" onChange={(event) => uploadEntryImage(event.target.files)} />
                    </label>
                  </div>
                  <div className="exhibition-image-editor">
                    {entryForm.imageUrl ? (
                      <img src={entryForm.imageUrl} alt="" />
                    ) : (
                      <div className="image-placeholder large"><ImageIcon size={24} aria-hidden="true" />Keine Vorschau</div>
                    )}
                    <label>
                      <span>Bildquelle oder Data-URL</span>
                      <input value={entryForm.imageUrl || ""} onChange={(event) => setEntryForm({ ...entryForm, imageUrl: event.target.value })} placeholder="https://..." />
                    </label>
                    {entryForm.imageUrl && <button type="button" className="secondary-button" onClick={() => setEntryForm({ ...entryForm, imageUrl: "" })}>Bild entfernen</button>}
                  </div>
                </section>
              )}
              {activeEntryTab === "functions" && (
                <section className="functions-tab exhibition-functions-tab">
                  <div className="function-list">
                    <div className="function-toolbar">
                      <div className="function-summary">
                        <span><strong>{entryFunctions.filter((item) => item.name.trim()).length}</strong> belegt</span>
                        <span><strong>{entryFunctions.filter((item) => item.type === "sound" && item.name.trim()).length}</strong> Sound</span>
                        <span><strong>{entryFunctions.filter((item) => item.type === "licht" && item.name.trim()).length}</strong> Licht</span>
                      </div>
                    </div>
                    {entryFunctions.map((item) => (
                      <article key={item.key} className={item.name.trim() ? "function-row exhibition-function-row persisted" : "function-row exhibition-function-row"}>
                        <strong className="function-key">
                          {functionSymbolIcon(item.symbolKey, item.type, functionSymbolMetadata(symbols, item.symbolKey))}
                          {item.key}
                        </strong>
                        <input value={item.name} onChange={(event) => updateEntryFunction(item.key, { name: event.target.value })} placeholder="Funktionsname" aria-label={`${item.key} Funktionsname`} />
                        <FunctionSymbolPicker
                          value={item.symbolKey || ""}
                          functionType={item.type}
                          symbols={symbols}
                          label={`${item.key} Symbol`}
                          onChange={(symbolKey) => updateEntryFunction(item.key, { symbolKey })}
                        />
                        <select value={item.type} onChange={(event) => updateEntryFunction(item.key, { type: event.target.value })} aria-label={`${item.key} Typ`}>
                          {functionTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                        </select>
                      </article>
                    ))}
                  </div>
                </section>
              )}
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setEntryDialog(null)}>Abbrechen</button>
              <button type="submit" className="primary-button" disabled={saving}>Speichern</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
