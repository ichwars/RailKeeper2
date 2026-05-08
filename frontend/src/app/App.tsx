import { Database, Search, ShieldCheck, TrainFront } from "lucide-react";
import { Shell } from "./Shell";

const modules = [
  {
    title: "Fahrzeuge",
    text: "Inventar, Bilder, Dokumente, Wartung und Decoder-Daten werden um Fahrzeuge herum modelliert.",
    icon: TrainFront
  },
  {
    title: "Artikelsuche",
    text: "Die Websuche ist Kernfunktion und wird als eigener Adapter mit nachvollziehbaren Quellen gebaut.",
    icon: Search
  },
  {
    title: "Sicherheit",
    text: "Setup-Gate, Rollen, Audit-Log, CSRF und robuste Sessions gehoeren von Anfang an zum Fundament.",
    icon: ShieldCheck
  },
  {
    title: "Betrieb",
    text: "SQLite, Backup/Restore und eine einzelne Go-Runtime halten Installation und Wartung schlank.",
    icon: Database
  }
];

export function App() {
  return (
    <Shell>
      <section className="page-head">
        <div>
          <p className="eyebrow">RailKeeper2</p>
          <h1>Modellbahn-Inventar, sauber neu aufgebaut.</h1>
          <p>
            Dieses Projekt startet bewusst fokussiert: Fahrzeuge zuerst, OpenAPI als Vertrag,
            Go als robuste Runtime und ein wartbares React-Frontend.
          </p>
        </div>
      </section>

      <section className="module-grid" aria-label="Kernmodule">
        {modules.map((module) => {
          const Icon = module.icon;
          return (
            <article className="module-card" key={module.title}>
              <Icon size={22} aria-hidden="true" />
              <h2>{module.title}</h2>
              <p>{module.text}</p>
            </article>
          );
        })}
      </section>
    </Shell>
  );
}

