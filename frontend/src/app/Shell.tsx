import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { BarChart3, Box, Bug, CalendarDays, ChevronLeft, ChevronRight, Code2, FileInput, Info, LogOut, Menu, Monitor, Moon, Settings, Sun, X } from "lucide-react";
import type { AppView } from "./App";
import { useI18n } from "../shared/i18n";
import { applyThemePreference, readThemePreference, type ThemePreference } from "../shared/theme";

const navItems = [
  { view: "overview", href: "/overview", labelKey: "nav.overview", icon: BarChart3 },
  { view: "vehicles", href: "/vehicles", labelKey: "nav.vehicles", icon: Box },
  { view: "exhibition", href: "/exhibition", labelKey: "nav.exhibition", icon: CalendarDays },
  { view: "importExport", href: "/import-export", labelKey: "nav.importExport", icon: FileInput },
  { view: "settings", href: "/settings", labelKey: "nav.settings", icon: Settings }
] as const;

const sidebarCollapsedKey = "railkeeper.sidebarCollapsed";
const sidebarOrderKey = "railkeeper.settings.sidebarOrder";
const sidebarOrderChangedEvent = "railkeeper-sidebar-order-changed";

function readSidebarCollapsed() {
  return window.localStorage.getItem(sidebarCollapsedKey) === "true";
}

function allowedNavItems(roles: string[]) {
  if (roles.includes("Admin")) return [...navItems];
  const canUseInventory = roles.includes("Editor") || roles.includes("Viewer");
  const canUseExhibition = roles.includes("Messe");
  return navItems.filter((item) => {
    if (item.view === "exhibition") return canUseExhibition;
    return canUseInventory;
  });
}

function readNavItems(roles: string[]) {
  const available = allowedNavItems(roles);
  try {
    const order = JSON.parse(window.localStorage.getItem(sidebarOrderKey) || "[]") as AppView[];
    const ordered = order
      .map((view) => available.find((item) => item.view === view))
      .filter((item): item is (typeof navItems)[number] => Boolean(item));
    const missing = available.filter((item) => !ordered.some((orderedItem) => orderedItem.view === item.view));
    return [...ordered, ...missing];
  } catch {
    return available;
  }
}

export function Shell({
  children,
  username,
  roles,
  activeView,
  onLogout
}: {
  children: ReactNode;
  username: string;
  roles: string[];
  activeView: AppView;
  onLogout: () => void;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const [theme, setTheme] = useState<ThemePreference>(readThemePreference);
  const [orderedNavItems, setOrderedNavItems] = useState(() => readNavItems(roles));
  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const { t } = useI18n();

  useEffect(() => {
    const syncOrder = () => setOrderedNavItems(readNavItems(roles));

    window.addEventListener(sidebarOrderChangedEvent, syncOrder);
    window.addEventListener("storage", syncOrder);
    return () => {
      window.removeEventListener(sidebarOrderChangedEvent, syncOrder);
      window.removeEventListener("storage", syncOrder);
    };
  }, [roles]);

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
      {mobileMenuOpen && <button type="button" className="mobile-nav-scrim" aria-label={t("nav.menu.close")} onClick={() => setMobileMenuOpen(false)} />}
      <aside className={sidebarCollapsed ? "sidebar collapsed" : "sidebar"}>
        <button
          type="button"
          className="mobile-menu-button"
          aria-controls="main-navigation"
          aria-expanded={mobileMenuOpen}
          aria-label={mobileMenuOpen ? t("nav.menu.close") : t("nav.menu.open")}
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          {mobileMenuOpen ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />}
        </button>
        <div className="brand">
          <img className="brand-logo" src="/brand/railkeeper-logo.png" alt="RailKeeper2" />
          <img className="brand-mark" src="/brand/railkeeper-mark.png" alt="RailKeeper2" />
        </div>

        <nav id="main-navigation" className="nav" aria-label={t("nav.main")}>
          {orderedNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <a key={item.view} className={activeView === item.view ? "active" : ""} href={item.href} onClick={() => setMobileMenuOpen(false)}>
                <Icon size={16} aria-hidden="true" />
                <span>{t(item.labelKey)}</span>
              </a>
            );
          })}

          <button
            type="button"
            className="sidebar-collapse"
            onClick={toggleSidebarCollapsed}
            aria-label={sidebarCollapsed ? t("nav.sidebar.expand") : t("nav.sidebar.collapse")}
            title={sidebarCollapsed ? t("nav.sidebar.expand") : t("nav.sidebar.collapse")}
          >
            {sidebarCollapsed ? <ChevronRight size={17} aria-hidden="true" /> : <ChevronLeft size={17} aria-hidden="true" />}
          </button>

          <div className="sidebar-footer" aria-label={t("nav.footerActions")}>
            <div className="sidebar-footer-actions">
              <a href="/settings" title={t("nav.system")} aria-label={t("nav.system")}>
                <Info size={17} aria-hidden="true" />
              </a>
              <a href="https://github.com/ichwars/RailKeeper2" target="_blank" rel="noreferrer" title={t("nav.repository")} aria-label={t("nav.repository")}>
                <Code2 size={17} aria-hidden="true" />
              </a>
              <button type="button" onClick={toggleTheme} title={t("nav.theme")} aria-label={t("nav.theme")}>
                <ThemeIcon size={17} aria-hidden="true" />
              </button>
              <button type="button" onClick={onLogout} title={t("nav.logout", { username })} aria-label={t("nav.logout", { username })}>
                <LogOut size={17} aria-hidden="true" />
              </button>
            </div>
            <span className="sidebar-version">v0.1.6</span>
          </div>
        </nav>
      </aside>

      <main className="main">{children}</main>

      <a className="feedback-button" href="https://github.com/ichwars/RailKeeper2/issues/new" target="_blank" rel="noreferrer" title={t("nav.feedback")} aria-label={t("nav.feedback")}>
        <Bug size={20} aria-hidden="true" />
      </a>
    </div>
  );
}
