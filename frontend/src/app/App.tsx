import { useEffect, useState } from "react";
import { Database, Search, ShieldCheck, TrainFront } from "lucide-react";
import { Shell } from "./Shell";
import { LoginView } from "../features/auth/LoginView";
import { SetupView } from "../features/setup/SetupView";
import { api, Session } from "../shared/api";

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
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    api
      .setupStatus()
      .then((status) => {
        setSetupRequired(status.setupRequired);
        if (status.setupRequired) {
          setSession(null);
          return;
        }
        api.session().then(setSession).catch(() => setSession(null));
      })
      .catch((error: Error) => setLoadError(error.message));
  }, []);

  if (loadError) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>RailKeeper2</h1>
          <p>{loadError}</p>
        </section>
      </main>
    );
  }

  if (setupRequired === null) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>RailKeeper2</h1>
          <p>Initialisierung wird geprueft...</p>
        </section>
      </main>
    );
  }

  if (setupRequired) {
    return (
      <SetupView
        onComplete={() => {
          setSetupRequired(false);
          setSession(null);
        }}
      />
    );
  }

  if (session === undefined) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>RailKeeper2</h1>
          <p>Session wird geprueft...</p>
        </section>
      </main>
    );
  }

  if (session === null) {
    return <LoginView onLogin={setSession} />;
  }

  return (
    <Shell
      username={session.username}
      onLogout={() => {
        api.logout().finally(() => setSession(null));
      }}
    >
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
