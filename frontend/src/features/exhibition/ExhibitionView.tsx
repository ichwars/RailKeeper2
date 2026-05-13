import { useEffect, useMemo, useState } from "react";
import {
  Edit3,
  Eye,
  Image as ImageIcon,
  Lock,
  LockOpen,
  Plus,
  Printer,
  Trash2,
  Upload
} from "lucide-react";
import { api, ExhibitionEntry, ExhibitionEntryInput, ExhibitionList, ExhibitionListInput, MasterDataEntry } from "../../shared/api";
import { FunctionSymbolPicker, functionSymbolIcon, functionSymbolMetadata } from "../../shared/functionSymbols";
import { useI18n } from "../../shared/i18n";

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

function formatDate(value: string, language: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${value}T00:00:00`));
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

function symbolImageDataFromMetadata(metadata?: Record<string, unknown>) {
  const value = metadata?.imageData || metadata?.activeImageData || metadata?.svgData;
  return typeof value === "string" ? value : "";
}

function printFunctionChips(value: string | undefined, symbols: MasterDataEntry[]) {
  const configured = parseFunctions(value).filter((item) => item.name.trim());
  if (configured.length === 0) return "-";
  return configured.map((item) => {
    const metadata = functionSymbolMetadata(symbols, item.symbolKey);
    const imageData = symbolImageDataFromMetadata(metadata);
    return `<span class="function-chip">${imageData ? `<img src="${escapeHTML(imageData)}" alt="" />` : ""}<strong>${escapeHTML(item.key)}</strong> ${escapeHTML(item.name)}</span>`;
  }).join("");
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

function printList(
  list: ExhibitionList,
  entries: ExhibitionEntry[],
  symbols: MasterDataEntry[] = [],
  language = "de",
  t: (key: string, values?: Record<string, string | number>) => string = (key) => key
) {
  const rows = entries.map((entry) => `
    <tr>
      <td class="image-cell">${entry.imageUrl ? `<img src="${escapeHTML(entry.imageUrl)}" alt="" />` : `<span>-</span>`}</td>
      <td>${escapeHTML(entry.owner)}</td>
      <td>
        <strong>${escapeHTML(entry.locomotiveName)}</strong>
        ${entry.notes ? `<small>${escapeHTML(entry.notes)}</small>` : ""}
      </td>
      <td>${entry.dtDecoder ? t("exhibition.yes") : t("exhibition.no")}</td>
      <td>${escapeHTML(entry.decoderNumber || "-")}</td>
      <td class="function-cell">${printFunctionChips(entry.functionKeys, symbols)}</td>
    </tr>
  `).join("");
  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) return;
  win.document.write(`<!doctype html>
    <html lang="${escapeHTML(language)}">
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
          td strong, td small { display: block; }
          td small { margin-top: 3px; color: #666; }
          .image-cell { width: 64px; }
          .image-cell img, .image-cell span { display: grid; width: 56px; height: 40px; place-items: center; border: 1px solid #ddd; border-radius: 4px; object-fit: contain; }
          .function-cell { min-width: 170px; }
          .function-chip { display: inline-flex; align-items: center; gap: 4px; margin: 0 6px 5px 0; padding: 3px 6px; border: 1px solid #d9e4dc; border-radius: 4px; white-space: nowrap; }
          .function-chip img { width: 14px; height: 14px; object-fit: contain; }
          .function-chip strong { display: inline; }
          footer { margin-top: 18px; color: #777; font-size: 11px; }
          @media print { body { margin: 14mm; } button { display: none; } }
        </style>
      </head>
      <body>
        <h1>${escapeHTML(list.designation)}</h1>
        <p>${escapeHTML(t("exhibition.entriesCountWithDate", { date: formatDate(list.date, language), count: entries.length }))}</p>
        <table>
          <thead>
            <tr><th>${escapeHTML(t("exhibition.image"))}</th><th>${escapeHTML(t("exhibition.owner"))}</th><th>${escapeHTML(t("exhibition.locomotiveName"))}</th><th>DT</th><th>${escapeHTML(t("exhibition.decoderNumber"))}</th><th>${escapeHTML(t("exhibition.functionKeys"))}</th></tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="6">${escapeHTML(t("exhibition.printEmpty"))}</td></tr>`}</tbody>
        </table>
        <footer>${escapeHTML(t("exhibition.printFooter", { status: list.locked ? t("exhibition.locked") : t("exhibition.open") }))}</footer>
        <script>window.print();</script>
      </body>
    </html>`);
  win.document.close();
}

export function ExhibitionView({ roles }: { roles: string[] }) {
  const { language, t } = useI18n();
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
      setMessage(error instanceof Error ? error.message : t("exhibition.saveListError"));
    } finally {
      setSaving(false);
    }
  };

  const deleteList = async (list: ExhibitionList) => {
    if (!canManageLists || !window.confirm(t("exhibition.deleteListConfirm", { name: list.designation }))) return;
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
    printList(list, await entriesForList(list), symbols, language, t);
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
      setMessage(error instanceof Error ? error.message : t("exhibition.saveEntryError"));
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (entry: ExhibitionEntry) => {
    if (!selectedID || !canDeleteEntries || !window.confirm(t("exhibition.deleteEntryConfirm", { name: entry.locomotiveName }))) return;
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
          <p className="eyebrow">{t("exhibition.eyebrow")}</p>
          <h1>{t("exhibition.title")}</h1>
          <p>{t("exhibition.subtitle")}</p>
        </div>
        {canManageLists && (
          <button type="button" className="primary-button new-vehicle-button" onClick={() => openListDialog("create")}>
            <Plus size={16} aria-hidden="true" />
            {t("exhibition.newList")}
          </button>
        )}
      </section>

      {message && <p className="form-message">{message}</p>}

      <section className="exhibition-layout">
        <article className="panel exhibition-list-panel">
          <div className="inventory-list-head">
            <div>
              <h2>{t("exhibition.lists")}</h2>
              <p>{loading ? t("exhibition.loading") : t("exhibition.listCount", { count: lists.length })}</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="inventory-table exhibition-table">
              <thead>
                <tr>
                  <th><button type="button" className={listSort.key === "designation" ? "sort-button active" : "sort-button"} onClick={() => setListSortKey("designation")}>{t("exhibition.designation")}</button></th>
                  <th><button type="button" className={listSort.key === "date" ? "sort-button active" : "sort-button"} onClick={() => setListSortKey("date")}>{t("exhibition.date")}</button></th>
                  <th><button type="button" className={listSort.key === "entryCount" ? "sort-button active" : "sort-button"} onClick={() => setListSortKey("entryCount")}>{t("exhibition.entries")}</button></th>
                  <th><button type="button" className={listSort.key === "locked" ? "sort-button active" : "sort-button"} onClick={() => setListSortKey("locked")}>{t("exhibition.status")}</button></th>
                  <th>{t("exhibition.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {sortedLists.map((list) => (
                  <tr key={list.id} className={selectedID === list.id ? "selected-row" : ""} onClick={() => setSelectedID(list.id)}>
                    <td><strong>{list.designation}</strong></td>
                    <td>{formatDate(list.date, language)}</td>
                    <td>{list.entryCount}</td>
                    <td><span className={list.locked ? "settings-pill muted" : "settings-pill active"}>{list.locked ? t("exhibition.locked") : t("exhibition.open")}</span></td>
                    <td>
                      <div className="table-actions">
                        <button type="button" className="icon-button" onClick={(event) => { event.stopPropagation(); openListView(list); }} aria-label={t("exhibition.view")} title={t("exhibition.view")}><Eye size={15} /></button>
                        {canManageLists && <button type="button" className="icon-button" onClick={(event) => { event.stopPropagation(); openListDialog("edit", list); }} aria-label={t("exhibition.edit")} title={t("exhibition.edit")}><Edit3 size={15} /></button>}
                        <button type="button" className="icon-button" onClick={(event) => { event.stopPropagation(); printListByID(list); }} aria-label={t("exhibition.print")} title={t("exhibition.print")}><Printer size={15} /></button>
                        {canManageLists && <button type="button" className="icon-button" onClick={(event) => { event.stopPropagation(); toggleLock(list); }} aria-label={list.locked ? t("exhibition.unlock") : t("exhibition.lock")} title={list.locked ? t("exhibition.unlock") : t("exhibition.lock")}>{list.locked ? <LockOpen size={15} /> : <Lock size={15} />}</button>}
                        {canManageLists && <button type="button" className="icon-button danger" onClick={(event) => { event.stopPropagation(); deleteList(list); }} aria-label={t("exhibition.delete")} title={t("exhibition.delete")}><Trash2 size={15} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {sortedLists.length === 0 && (
                  <tr><td colSpan={5}>{t("exhibition.noLists")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel exhibition-entry-panel">
          <div className="inventory-list-head">
            <div>
              <h2>{selectedList ? selectedList.designation : t("exhibition.entries")}</h2>
              <p>{selectedList ? t("exhibition.entriesCountWithDate", { date: formatDate(selectedList.date, language), count: entries.length }) : t("exhibition.selectList")}</p>
            </div>
            <div className="table-actions">
              {selectedList && <button type="button" className="icon-button" onClick={() => printList(selectedList, sortedEntries, symbols, language, t)} aria-label={t("exhibition.printList")} title={t("exhibition.printList")}><Printer size={15} /></button>}
              {selectedList && <button type="button" className="primary-button" onClick={() => openEntryDialog("create")} disabled={!canEditEntries}>{t("exhibition.entry")}</button>}
            </div>
          </div>
          <div className="table-wrap">
            <table className="inventory-table exhibition-table">
              <thead>
                <tr>
                  <th>{t("exhibition.image")}</th>
                  <th><button type="button" className={entrySort.key === "owner" ? "sort-button active" : "sort-button"} onClick={() => setEntrySortKey("owner")}>{t("exhibition.owner")}</button></th>
                  <th><button type="button" className={entrySort.key === "locomotiveName" ? "sort-button active" : "sort-button"} onClick={() => setEntrySortKey("locomotiveName")}>{t("exhibition.locomotiveName")}</button></th>
                  <th><button type="button" className={entrySort.key === "dtDecoder" ? "sort-button active" : "sort-button"} onClick={() => setEntrySortKey("dtDecoder")}>DT</button></th>
                  <th><button type="button" className={entrySort.key === "decoderNumber" ? "sort-button active" : "sort-button"} onClick={() => setEntrySortKey("decoderNumber")}>{t("exhibition.decoderNumber")}</button></th>
                  <th><button type="button" className={entrySort.key === "functionKeys" ? "sort-button active" : "sort-button"} onClick={() => setEntrySortKey("functionKeys")}>{t("exhibition.functionKeys")}</button></th>
                  <th>{t("exhibition.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {sortedEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.imageUrl ? <img className="exhibition-thumb" src={entry.imageUrl} alt="" /> : <span className="image-placeholder mini">-</span>}</td>
                    <td>{entry.owner}</td>
                    <td><strong>{entry.locomotiveName}</strong>{entry.notes && <small>{entry.notes}</small>}</td>
                    <td>{entry.dtDecoder ? t("exhibition.yes") : t("exhibition.no")}</td>
                    <td>{entry.decoderNumber || t("common.placeholder")}</td>
                    <td>{displayFunctions(entry.functionKeys)}</td>
                    <td>
                      <div className="table-actions">
                        <button type="button" className="icon-button" onClick={() => openEntryDialog("edit", entry)} disabled={!canEditEntries} aria-label={t("exhibition.edit")} title={t("exhibition.edit")}><Edit3 size={15} /></button>
                        {canManageLists && <button type="button" className="icon-button danger" onClick={() => deleteEntry(entry)} disabled={!canDeleteEntries} aria-label={t("exhibition.delete")} title={t("exhibition.delete")}><Trash2 size={15} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {selectedList && sortedEntries.length === 0 && (
                  <tr><td colSpan={7}>{t("exhibition.noEntries")}</td></tr>
                )}
                {!selectedList && (
                  <tr><td colSpan={7}>{t("exhibition.noList")}</td></tr>
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
              <h2>{listDialog.mode === "edit" ? t("exhibition.listEdit") : t("exhibition.listCreate")}</h2>
              <button type="button" className="icon-button" onClick={() => setListDialog(null)} aria-label={t("exhibition.close")}>×</button>
            </div>
            <div className="modal-body simple-form">
              <label>
                <span>{t("exhibition.designation")}</span>
                <input value={listForm.designation} onChange={(event) => setListForm({ ...listForm, designation: event.target.value })} required />
              </label>
              <label>
                <span>{t("exhibition.date")}</span>
                <input type="date" value={listForm.date} onChange={(event) => setListForm({ ...listForm, date: event.target.value })} required />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setListDialog(null)}>{t("exhibition.cancel")}</button>
              <button type="submit" className="primary-button" disabled={saving}>{t("exhibition.save")}</button>
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
                <p>{t("exhibition.entriesCountWithDate", { date: formatDate(viewDialog.list.date, language), count: viewDialog.entries.length })}</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setViewDialog(null)} aria-label={t("exhibition.close")}>×</button>
            </div>
            <div className="modal-body">
              <div className="table-wrap">
                <table className="inventory-table exhibition-table">
                  <thead>
                    <tr>
                      <th>{t("exhibition.image")}</th>
                      <th>{t("exhibition.owner")}</th>
                      <th>{t("exhibition.locomotiveName")}</th>
                      <th>DT</th>
                      <th>{t("exhibition.decoderNumber")}</th>
                      <th>{t("exhibition.functionKeys")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewDialog.entries.map((entry) => (
                      <tr key={entry.id}>
                        <td>{entry.imageUrl ? <img className="exhibition-thumb" src={entry.imageUrl} alt="" /> : <span className="image-placeholder mini">-</span>}</td>
                        <td>{entry.owner}</td>
                        <td><strong>{entry.locomotiveName}</strong>{entry.notes && <small>{entry.notes}</small>}</td>
                        <td>{entry.dtDecoder ? t("exhibition.yes") : t("exhibition.no")}</td>
                        <td>{entry.decoderNumber || t("common.placeholder")}</td>
                        <td>{displayFunctions(entry.functionKeys)}</td>
                      </tr>
                    ))}
                    {viewDialog.entries.length === 0 && <tr><td colSpan={6}>{t("exhibition.noEntriesShort")}</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => printList(viewDialog.list, viewDialog.entries, symbols, language, t)}>{t("exhibition.print")}</button>
              <button type="button" className="primary-button" onClick={() => setViewDialog(null)}>{t("exhibition.close")}</button>
            </div>
          </section>
        </div>
      )}

      {entryDialog && (
        <div className="modal-layer">
          <form className="vehicle-modal exhibition-entry-modal" onSubmit={(event) => { event.preventDefault(); saveEntry(); }}>
            <div className="modal-head">
              <h2>{entryDialog.mode === "edit" ? t("exhibition.entryEdit") : t("exhibition.entryCreate")}</h2>
              <button type="button" className="icon-button" onClick={() => setEntryDialog(null)} aria-label={t("exhibition.close")}>×</button>
            </div>
            <div className="modal-tabs exhibition-entry-tabs" role="tablist" aria-label={t("exhibition.entryTabs")}>
              <button type="button" className={activeEntryTab === "general" ? "active" : ""} onClick={() => setActiveEntryTab("general")}>{t("exhibition.tab.general")}</button>
              <button type="button" className={activeEntryTab === "images" ? "active" : ""} onClick={() => setActiveEntryTab("images")}>{t("exhibition.tab.images")}</button>
              <button type="button" className={activeEntryTab === "functions" ? "active" : ""} onClick={() => setActiveEntryTab("functions")}>{t("exhibition.tab.functions")}</button>
            </div>
            <div className="modal-body">
              {activeEntryTab === "general" && (
                <div className="exhibition-entry-form">
                  <section>
                    <h3>{t("exhibition.basicData")}</h3>
                    <label><span>{t("exhibition.owner")}</span><input value={entryForm.owner} onChange={(event) => setEntryForm({ ...entryForm, owner: event.target.value })} required /></label>
                    <label><span>{t("exhibition.locomotiveName")}</span><input value={entryForm.locomotiveName} onChange={(event) => setEntryForm({ ...entryForm, locomotiveName: event.target.value })} required /></label>
                  </section>
                  <section>
                    <h3>{t("exhibition.digitalTech")}</h3>
                    <label className="checkbox-line"><input type="checkbox" checked={entryForm.dtDecoder} onChange={(event) => setEntryForm({ ...entryForm, dtDecoder: event.target.checked })} /> <span>{t("exhibition.dtAvailable")}</span></label>
                    <label><span>{t("exhibition.decoderNumber")}</span><input value={entryForm.decoderNumber || ""} onChange={(event) => setEntryForm({ ...entryForm, decoderNumber: event.target.value })} /></label>
                    <label><span>{t("exhibition.notes")}</span><textarea value={entryForm.notes || ""} onChange={(event) => setEntryForm({ ...entryForm, notes: event.target.value })} /></label>
                  </section>
                </div>
              )}
              {activeEntryTab === "images" && (
                <section className="exhibition-image-tab">
                  <div className="upload-head">
                    <div>
                      <h3>{t("exhibition.images")}</h3>
                      <p>{t("exhibition.imagesHelp")}</p>
                    </div>
                    <label className="primary-button">
                      <Upload size={16} aria-hidden="true" />
                      {t("exhibition.uploadImage")}
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="visually-hidden" onChange={(event) => uploadEntryImage(event.target.files)} />
                    </label>
                  </div>
                  <div className="exhibition-image-editor">
                    {entryForm.imageUrl ? (
                      <img src={entryForm.imageUrl} alt="" />
                    ) : (
                      <div className="image-placeholder large"><ImageIcon size={24} aria-hidden="true" />{t("exhibition.noPreview")}</div>
                    )}
                    <label>
                      <span>{t("exhibition.imageSource")}</span>
                      <input value={entryForm.imageUrl || ""} onChange={(event) => setEntryForm({ ...entryForm, imageUrl: event.target.value })} placeholder="https://..." />
                    </label>
                    {entryForm.imageUrl && <button type="button" className="secondary-button" onClick={() => setEntryForm({ ...entryForm, imageUrl: "" })}>{t("exhibition.removeImage")}</button>}
                  </div>
                </section>
              )}
              {activeEntryTab === "functions" && (
                <section className="functions-tab exhibition-functions-tab">
                  <div className="function-list">
                    <div className="function-toolbar">
                      <div className="function-summary">
                        <span><strong>{entryFunctions.filter((item) => item.name.trim()).length}</strong> {t("exhibition.assigned")}</span>
                        <span><strong>{entryFunctions.filter((item) => item.type === "sound" && item.name.trim()).length}</strong> {t("exhibition.sound")}</span>
                        <span><strong>{entryFunctions.filter((item) => item.type === "licht" && item.name.trim()).length}</strong> {t("exhibition.light")}</span>
                      </div>
                    </div>
                    {entryFunctions.map((item) => (
                      <article key={item.key} className={item.name.trim() ? "function-row exhibition-function-row persisted" : "function-row exhibition-function-row"}>
                        <strong className="function-key">
                          {functionSymbolIcon(item.symbolKey, item.type, functionSymbolMetadata(symbols, item.symbolKey))}
                          {item.key}
                        </strong>
                        <input value={item.name} onChange={(event) => updateEntryFunction(item.key, { name: event.target.value })} placeholder={t("exhibition.functionName")} aria-label={t("exhibition.functionNameAria", { key: item.key })} />
                        <FunctionSymbolPicker
                          value={item.symbolKey || ""}
                          functionType={item.type}
                          symbols={symbols}
                          label={t("exhibition.functionSymbolAria", { key: item.key })}
                          onChange={(symbolKey) => updateEntryFunction(item.key, { symbolKey })}
                        />
                        <select value={item.type} onChange={(event) => updateEntryFunction(item.key, { type: event.target.value })} aria-label={t("exhibition.functionTypeAria", { key: item.key })}>
                          {functionTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                        </select>
                      </article>
                    ))}
                  </div>
                </section>
              )}
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setEntryDialog(null)}>{t("exhibition.cancel")}</button>
              <button type="submit" className="primary-button" disabled={saving}>{t("exhibition.save")}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
