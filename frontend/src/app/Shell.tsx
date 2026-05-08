import type { ReactNode } from "react";
import { Code2, LogOut, Settings, TrainFront } from "lucide-react";

export function Shell({
  children,
  username,
  onLogout
}: {
  children: ReactNode;
  username: string;
  onLogout: () => void;
}) {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <TrainFront size={28} aria-hidden="true" />
          <span>RailKeeper2</span>
        </div>

        <nav className="nav" aria-label="Hauptnavigation">
          <a className="active" href="/">
            Fahrzeuge
          </a>
          <a href="/settings">
            <Settings size={16} aria-hidden="true" />
            Einstellungen
          </a>
        </nav>

        <a className="repo-link" href="https://github.com/" target="_blank" rel="noreferrer">
          <Code2 size={16} aria-hidden="true" />
          Repository
        </a>

        <div className="user-block">
          <span>{username}</span>
          <button onClick={onLogout} title="Abmelden" aria-label="Abmelden">
            <LogOut size={16} aria-hidden="true" />
          </button>
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
