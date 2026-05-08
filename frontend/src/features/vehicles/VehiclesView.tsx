import { FormEvent, useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { api, CreateVehicleRequest, Vehicle } from "../../shared/api";

const emptyVehicle: CreateVehicleRequest = {
  manufacturer: "",
  articleNumber: "",
  name: "",
  gauge: "H0",
  epoch: "",
  railwayCompany: "",
  category: ""
};

export function VehiclesView() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [form, setForm] = useState<CreateVehicleRequest>(emptyVehicle);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => {
    api
      .vehicles(query)
      .then(setVehicles)
      .catch((error: Error) => setMessage(error.message));
  };

  useEffect(() => {
    load();
  }, [query]);

  const update = (patch: Partial<CreateVehicleRequest>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    api
      .createVehicle(form)
      .then(() => {
        setForm(emptyVehicle);
        load();
      })
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setSaving(false));
  };

  return (
    <>
      <section className="page-head vehicles-head">
        <div>
          <p className="eyebrow">Fahrzeuge</p>
          <h1>Bestand aufbauen</h1>
          <p>Lege Fahrzeuge mit den wichtigsten Stammdaten an. Bilder, Wartung und CV-Daten folgen auf diesem Modell.</p>
        </div>
      </section>

      <section className="work-grid">
        <form className="panel vehicle-form" onSubmit={submit}>
          <div className="panel-head">
            <Plus size={18} aria-hidden="true" />
            <h2>Fahrzeug anlegen</h2>
          </div>

          <label>
            Hersteller
            <input value={form.manufacturer} onChange={(event) => update({ manufacturer: event.target.value })} required />
          </label>

          <label>
            Bezeichnung
            <input value={form.name} onChange={(event) => update({ name: event.target.value })} required />
          </label>

          <div className="form-row">
            <label>
              Spur
              <input value={form.gauge} onChange={(event) => update({ gauge: event.target.value })} required />
            </label>
            <label>
              Artikel-Nr.
              <input value={form.articleNumber || ""} onChange={(event) => update({ articleNumber: event.target.value })} />
            </label>
          </div>

          <div className="form-row">
            <label>
              Epoche
              <input value={form.epoch || ""} onChange={(event) => update({ epoch: event.target.value })} />
            </label>
            <label>
              Bahngesellschaft
              <input value={form.railwayCompany || ""} onChange={(event) => update({ railwayCompany: event.target.value })} />
            </label>
          </div>

          <label>
            Kategorie
            <input value={form.category || ""} onChange={(event) => update({ category: event.target.value })} />
          </label>

          <button className="primary-button" disabled={saving}>
            {saving ? "Wird gespeichert..." : "Fahrzeug speichern"}
          </button>

          {message && <p className="form-message">{message}</p>}
        </form>

        <section className="panel vehicle-list">
          <div className="panel-head list-head">
            <h2>Fahrzeuge</h2>
            <label className="search-field">
              <Search size={16} aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Suchen"
              />
            </label>
          </div>

          {vehicles.length === 0 ? (
            <p className="empty-state">Noch keine Fahrzeuge vorhanden.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Inventar</th>
                    <th>Hersteller</th>
                    <th>Artikel</th>
                    <th>Bezeichnung</th>
                    <th>Spur</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map((vehicle) => (
                    <tr key={vehicle.id}>
                      <td>{vehicle.inventoryNumber}</td>
                      <td>{vehicle.manufacturer}</td>
                      <td>{vehicle.articleNumber || "-"}</td>
                      <td>{vehicle.name}</td>
                      <td>{vehicle.gauge}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </>
  );
}
