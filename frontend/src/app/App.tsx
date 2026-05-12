import { useEffect, useState } from "react";
import { Shell } from "./Shell";
import { LoginView } from "../features/auth/LoginView";
import { ImportExportView } from "../features/importExport/ImportExportView";
import { OverviewView } from "../features/overview/OverviewView";
import { SetupView } from "../features/setup/SetupView";
import { SettingsView } from "../features/settings/SettingsView";
import { VehiclesView } from "../features/vehicles/VehiclesView";
import { api, Session } from "../shared/api";
import { applyThemePreference, readThemePreference } from "../shared/theme";

export type AppView = "overview" | "vehicles" | "importExport" | "settings";

const defaultViewSettingKey = "railkeeper.settings.defaultView";

function configuredStartView(): AppView {
  const stored = window.localStorage.getItem(defaultViewSettingKey);
  if (stored === "vehicles" || stored === "importExport" || stored === "settings" || stored === "overview") {
    return stored;
  }
  if (stored === "inventory") {
    return "vehicles";
  }
  return "overview";
}

function pathForView(nextView: AppView) {
  if (nextView === "overview") return "/overview";
  if (nextView === "importExport") return "/import-export";
  if (nextView === "settings") return "/settings";
  return "/";
}

function currentView(): AppView {
  if (window.location.pathname.startsWith("/overview")) {
    return "overview";
  }
  if (window.location.pathname.startsWith("/import-export")) {
    return "importExport";
  }
  if (window.location.pathname.startsWith("/settings")) {
    return "settings";
  }
  return configuredStartView();
}

export function App() {
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState<AppView>(currentView);

  useEffect(() => {
    applyThemePreference(readThemePreference());
  }, []);

  useEffect(() => {
    const syncView = () => setView(currentView());

    window.addEventListener("popstate", syncView);
    return () => window.removeEventListener("popstate", syncView);
  }, []);

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

  function handleLogin(nextSession: Session) {
    window.history.replaceState(null, "", pathForView("overview"));
    setView("overview");
    setSession(nextSession);
  }

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
          <p>Initialisierung wird geprüft...</p>
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
          <p>Session wird geprüft...</p>
        </section>
      </main>
    );
  }

  if (session === null) {
    return <LoginView onLogin={handleLogin} />;
  }

  return (
    <Shell
      username={session.username}
      activeView={view}
      onLogout={() => {
        api.logout().finally(() => setSession(null));
      }}
    >
      {view === "overview" && <OverviewView />}
      {view === "vehicles" && <VehiclesView />}
      {view === "importExport" && <ImportExportView />}
      {view === "settings" && <SettingsView />}
    </Shell>
  );
}
