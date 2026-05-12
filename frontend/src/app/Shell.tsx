import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { BarChart3, Box, Bug, ChevronLeft, ChevronRight, Code2, FileInput, Info, LogOut, Menu, Monitor, Moon, Settings, Sun, X } from "lucide-react";
import type { AppView } from "./App";
import { applyThemePreference, readThemePreference, type ThemePreference } from "../shared/theme";

const navItems = [
  { view: "overview", href: "/overview", label: "Übersicht", icon: BarChart3 },
  { view: "vehicles", href: "/", label: "Bestand", icon: Box },
  { view: "importExport", href: "/import-export", label: "Import/Export", icon: FileInput },
  { view: "settings", href: "/settings", label: "Einstellungen", icon: Settings }
] as const;

const sidebarCollapsedKey = "railkeeper.sidebarCollapsed";
const sidebarOrderKey = "railkeeper.settings.sidebarOrder";
const sidebarOrderChangedEvent = "railkeeper-sidebar-order-changed";

function readSidebarCollapsed() {
  return window.localStorage.getItem(sidebarCollapsedKey) === "true";
}

function readNavItems() {
  try {
    const order = JSON.parse(window.localStorage.getItem(sidebarOrderKey) || "[]") as AppView[];
    const ordered = order
      .map((view) => navItems.find((item) => item.view === view))
      .filter((item): item is (typeof navItems)[number] => Boolean(item));
    const missing = navItems.filter((item) => !ordered.some((orderedItem) => orderedItem.view === item.view));
    return [...ordered, ...missing];
  } catch {
    return [...navItems];
  }
}

export function Shell({
  children,
  username,
  activeView,
  onLogout
}: {
  children: ReactNode;
  username: string;
  activeView: AppView;
  onLogout: () => void;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const [theme, setTheme] = useState<ThemePreference>(readThemePreference);
  const [orderedNavItems, setOrderedNavItems] = useState(readNavItems);
  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  useEffect(() => {
    const syncOrder = () => setOrderedNavItems(readNavItems());

    window.addEventListener(sidebarOrderChangedEvent, syncOrder);
    window.addEventListener("storage", syncOrder);
    return () => {
      window.removeEventListener(sidebarOrderChangedEvent, syncOrder);
      window.removeEventListener("storage", syncOrder);
    };
  }, []);

  function toggleTheme() {
    const nextTheme: ThemePreference = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
    setTheme(nextTheme);
    applyThemePreference(nextTheme);
  }

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      window.localStorage.setItem(sidebarCollapsedKey, String(next));
      return next;
    });
  }

  return (
    <div className={`layout${mobileMenuOpen ? " nav-open" : ""}${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      {mobileMenuOpen && <button type="button" className="mobile-nav-scrim" aria-label="Menü schließen" onClick={() => setMobileMenuOpen(false)} />}
      <aside className={sidebarCollapsed ? "sidebar collapsed" : "sidebar"}>
        <button
          type="button"
          className="mobile-menu-button"
          aria-controls="main-navigation"
          aria-expanded={mobileMenuOpen}
          aria-label={mobileMenuOpen ? "Menü schließen" : "Menü öffnen"}
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          {mobileMenuOpen ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />}
        </button>
        <div className="brand">
          <img className="brand-logo" src="/brand/railkeeper-logo.png" alt="RailKeeper2" />
          <img className="brand-mark" src="/brand/railkeeper-mark.png" alt="RailKeeper2" />
        </div>

        <nav id="main-navigation" className="nav" aria-label="Hauptnavigation">
          {orderedNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <a key={item.view} className={activeView === item.view ? "active" : ""} href={item.href} onClick={() => setMobileMenuOpen(false)}>
                <Icon size={16} aria-hidden="true" />
                <span>{item.label}</span>
              </a>
            );
          })}

          <div className="sidebar-footer" aria-label="Seitenleisten-Aktionen">
            <button
              type="button"
              className="sidebar-collapse"
              onClick={toggleSidebarCollapsed}
              aria-label={sidebarCollapsed ? "Seitenleiste ausklappen" : "Seitenleiste einklappen"}
              title={sidebarCollapsed ? "Seitenleiste ausklappen" : "Seitenleiste einklappen"}
            >
              {sidebarCollapsed ? <ChevronRight size={17} aria-hidden="true" /> : <ChevronLeft size={17} aria-hidden="true" />}
            </button>
            <div className="sidebar-footer-actions">
              <a href="/settings" title="System" aria-label="System">
                <Info size={17} aria-hidden="true" />
              </a>
              <a href="https://github.com/ichwars/RailKeeper2" target="_blank" rel="noreferrer" title="Repository" aria-label="Repository">
                <Code2 size={17} aria-hidden="true" />
              </a>
              <button type="button" onClick={toggleTheme} title="Design wechseln" aria-label="Design wechseln">
                <ThemeIcon size={17} aria-hidden="true" />
              </button>
              <button type="button" onClick={onLogout} title={`Abmelden (${username})`} aria-label={`Abmelden (${username})`}>
                <LogOut size={17} aria-hidden="true" />
              </button>
            </div>
            <span className="sidebar-version">v0.1.0</span>
          </div>
        </nav>
      </aside>

      <main className="main">{children}</main>

      <a className="feedback-button" href="https://github.com/ichwars/RailKeeper2/issues/new" target="_blank" rel="noreferrer" title="Fehler melden" aria-label="Fehler melden">
        <Bug size={20} aria-hidden="true" />
      </a>
    </div>
  );
}
