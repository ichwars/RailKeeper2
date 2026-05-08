import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  Image,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { api, CreateVehicleRequest, MasterDataEntry, MasterDataRelation, Vehicle } from "../../shared/api";

const emptyVehicle: CreateVehicleRequest = {
  manufacturer: "",
  articleNumber: "",
  name: "",
  gauge: "H0",
  epoch: "",
  railwayCompany: "",
  category: "",
  gattung: ""
};

type ModalMode = "create" | "view" | "edit";
type ModalTab = "model" | "control" | "uploads";
type SortKey = "inventoryNumber" | "manufacturer" | "articleNumber" | "name" | "gauge" | "epoch" | "category";
type SortDirection = "asc" | "desc";

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

function vehicleToForm(vehicle: Vehicle): CreateVehicleRequest {
  return {
    inventoryNumber: vehicle.inventoryNumber,
    manufacturer: vehicle.manufacturer,
    articleNumber: vehicle.articleNumber || "",
    name: vehicle.name,
    gauge: vehicle.gauge,
    epoch: vehicle.epoch || "",
    railwayCompany: vehicle.railwayCompany || "",
    category: vehicle.category || "",
    gattung: vehicle.gattung || ""
  };
}

function optionValue(entry: MasterDataEntry) {
  return entry.label;
}

function valueForSort(vehicle: Vehicle, key: SortKey) {
  return (vehicle[key] || "").toLocaleLowerCase("de-DE");
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
    <button type="button" className="sort-button" onClick={() => toggleSort(key)}>
      {sortLabels[key]}
      {sort.key === key && (sort.direction === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
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
                            <span>Nach Artikel-Nr. suchen</span>
                          </div>
                          <button type="button" className="secondary-button" disabled>Artikeldaten suchen</button>
                        </div>

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
                        <div className="form-row">
                          <label>
                            Baureihe
                            <input disabled />
                          </label>
                          <label>
                            Fahrzeug-Nr.
                            <input disabled />
                          </label>
                        </div>
                        <label>
                          Beschreibung
                          <textarea disabled rows={4} />
                        </label>
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
                        <div className="form-row">
                          <label>
                            Produktionszeit
                            <input disabled placeholder="TT. MM. JJJJ" />
                          </label>
                          <label>
                            Listenpreis
                            <input disabled type="number" min="0" step="0.01" />
                          </label>
                        </div>
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
