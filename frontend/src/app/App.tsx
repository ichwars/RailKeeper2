import { useEffect, useState } from "react";
import { Shell } from "./Shell";
import { LoginView } from "../features/auth/LoginView";
import { SetupView } from "../features/setup/SetupView";
import { SettingsView } from "../features/settings/SettingsView";
import { VehiclesView } from "../features/vehicles/VehiclesView";
import { api, Session } from "../shared/api";

type AppView = "vehicles" | "settings";

export function App() {
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState<AppView>("vehicles");

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
      activeView={view}
      onNavigate={setView}
      onLogout={() => {
        api.logout().finally(() => setSession(null));
      }}
    >
      {view === "settings" ? <SettingsView /> : <VehiclesView />}
    </Shell>
  );
}
