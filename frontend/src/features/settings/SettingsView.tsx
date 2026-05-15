import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  Download,
  ExternalLink,
  HardDrive,
  History,
  KeyRound,
  Mail,
  Palette,
  Pencil,
  Printer,
  RefreshCw,
  Shield,
  ShieldAlert,
  Trash2,
  Upload,
  UserCog,
  Users,
  X
} from "lucide-react";
import type { AppView } from "../../app/App";
import {
  api,
  AuditLogEntry,
  BackupValidationResult,
  InventoryNumberScheme,
  MasterDataEntry,
  MasterDataInput,
  Role,
  Session,
  SessionRecord,
  SystemPrinters,
  StorageUsage,
  UserAccount,
  VersionInfo
} from "../../shared/api";
import { Language, useI18n } from "../../shared/i18n";
import { applyStoredThemeOptions, applyThemePreference, readThemePreference, ThemePreference } from "../../shared/theme";

type SettingsTab = "general" | "data" | "importExport" | "appearance" | "auth";
type MasterDataType = {
  type: string;
};

const settingsTabs: { id: SettingsTab; labelKey: string }[] = [
  { id: "general", labelKey: "settings.tabs.general" },
  { id: "data", labelKey: "settings.tabs.data" },
  { id: "importExport", labelKey: "settings.tabs.importExport" },
  { id: "appearance", labelKey: "settings.tabs.appearance" },
  { id: "auth", labelKey: "settings.tabs.auth" }
];

const masterDataTypes: MasterDataType[] = [
  { type: "manufacturer" },
  { type: "vehicle_category" },
  { type: "vehicle_gattung" },
  { type: "epoch" },
  { type: "gauge" },
  { type: "railway_company" },
  { type: "symbols" }
];

const loadableMasterDataTypes = masterDataTypes;
const articleSearchSettingKey = "railkeeper.articleSearchEnabled";
const articleSearchSourcesSettingKey = "railkeeper.articleSearchSources";
const defaultArticleSearchSources = ["web", "manufacturer", "dealers", "wiki"];
const articleSearchSourceOptions = [
  { id: "web", labelKey: "settings.articleSearch.source.web", helpKey: "settings.articleSearch.source.webHelp" },
  { id: "manufacturer", labelKey: "settings.articleSearch.source.manufacturer", helpKey: "settings.articleSearch.source.manufacturerHelp" },
  { id: "dealers", labelKey: "settings.articleSearch.source.dealers", helpKey: "settings.articleSearch.source.dealersHelp" },
  { id: "wiki", labelKey: "settings.articleSearch.source.wiki", helpKey: "settings.articleSearch.source.wikiHelp" }
];

const localSettingKeys = {
  language: "railkeeper.settings.language",
  defaultView: "railkeeper.settings.defaultView",
  dateFormat: "railkeeper.settings.dateFormat",
  timeFormat: "railkeeper.settings.timeFormat",
  defaultPrinter: "railkeeper.settings.defaultPrinter",
  updateChecks: "railkeeper.settings.updateChecks",
  betaUpdates: "railkeeper.settings.betaUpdates",
  ignoredUpdate: "railkeeper.settings.ignoredUpdate",
  darkBackground: "railkeeper.settings.darkBackground",
  darkAccent: "railkeeper.settings.darkAccent",
  darkStyle: "railkeeper.settings.darkStyle",
  lightBackground: "railkeeper.settings.lightBackground",
  lightAccent: "railkeeper.settings.lightAccent",
  lightStyle: "railkeeper.settings.lightStyle",
  sidebarOrder: "railkeeper.settings.sidebarOrder",
  twoFactorPrepared: "railkeeper.settings.twoFactorPrepared"
};

const sidebarOrderChangedEvent = "railkeeper-sidebar-order-changed";
const defaultSidebarOrder: AppView[] = ["overview", "vehicles", "exhibition", "importExport", "settings"];
function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 KB";
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(value / 1024)).toLocaleString("de-DE")} KB`;
}

function readLocalSetting(key: string, fallback: string) {
  return window.localStorage.getItem(key) || fallback;
}

function readLocalBool(key: string, fallback: boolean) {
  const value = window.localStorage.getItem(key);
  if (value === null) return fallback;
  return value === "true";
}

function readArticleSearchSources() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(articleSearchSourcesSettingKey) || "[]") as string[];
    const allowed = new Set(articleSearchSourceOptions.map((option) => option.id));
    const sources = stored.filter((source) => allowed.has(source));
    return sources.length > 0 ? sources : defaultArticleSearchSources;
  } catch {
    return defaultArticleSearchSources;
  }
}

function readSidebarOrder() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(localSettingKeys.sidebarOrder) || "[]") as AppView[];
    const ordered = stored.filter((view): view is AppView => defaultSidebarOrder.includes(view));
    const missing = defaultSidebarOrder.filter((view) => !ordered.includes(view));
    return [...ordered, ...missing];
  } catch {
    return defaultSidebarOrder;
  }
}

function formatDateTime(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

const emptyForm = {
  key: "",
  label: "",
  active: true,
  sortOrder: 0,
  sourceUrl: "",
  nominalScalesText: "",
  description: "",
  imageData: "",
  metadataText: "{}"
};

type FormState = typeof emptyForm;

const emptyUserForm = {
  username: "",
  email: "",
  password: "",
  roles: ["Viewer"]
};

type UserFormState = typeof emptyUserForm;

const emptyPasswordForm = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: ""
};

type PasswordFormState = typeof emptyPasswordForm;

function auditActor(entry: AuditLogEntry) {
  return entry.actorUsername || entry.actorUserId || (entry.action === "LoginFailed" ? "Unbekannt" : "System");
}

function auditTarget(entry: AuditLogEntry) {
  if (!entry.targetType && !entry.targetId) return "-";
  return [entry.targetType, entry.targetId].filter(Boolean).join(" ");
}

function entryToForm(entry: MasterDataEntry): FormState {
  return {
    key: entry.key,
    label: entry.label,
    active: entry.active,
    sortOrder: entry.sortOrder,
    sourceUrl: entry.sourceUrl || "",
    nominalScalesText: nominalScalesText(entry),
    description: metadataString(entry, "description"),
    imageData: masterDataImage(entry),
    metadataText: JSON.stringify(entry.metadata || {}, null, 2)
  };
}

function metadataString(entry: MasterDataEntry, key: string) {
  const value = entry.metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function metadataList(entry: MasterDataEntry, key: string) {
  const value = entry.metadata?.[key];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function nominalScalesText(entry: MasterDataEntry) {
  return metadataList(entry, "nominalScales").join(", ");
}

function masterDataImage(entry: MasterDataEntry) {
  return metadataString(entry, "imageData") || metadataString(entry, "activeImageData") || metadataString(entry, "svgData");
}

function parseList(text: string) {
  return text
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function applyVisibleMetadata(type: string, metadata: Record<string, unknown>, form: FormState) {
  const next = { ...metadata };
  if (type === "manufacturer") {
    const nominalScales = parseList(form.nominalScalesText);
    if (nominalScales.length > 0) {
      next.nominalScales = nominalScales;
    } else {
      delete next.nominalScales;
    }
  }
  if (type === "symbols") {
    if (form.description.trim()) {
      next.description = form.description.trim();
    } else {
      delete next.description;
    }
    if (form.imageData) {
      next.imageData = form.imageData;
      next.activeImageData = form.imageData;
      next.imageMime = form.imageData.startsWith("data:image/svg+xml") ? "image/svg+xml" : "image";
    } else {
      delete next.imageData;
      delete next.activeImageData;
      delete next.svgData;
      delete next.imageMime;
    }
  }
  return next;
}

function externalLink(entry: MasterDataEntry) {
  const website = metadataString(entry, "website");
  if (website) {
    return { href: website, title: "Website öffnen" };
  }
  if (entry.sourceUrl) {
    return { href: entry.sourceUrl, title: "Quelle öffnen" };
  }
  return null;
}

export function SettingsView() {
  const { language, setLanguage, t } = useI18n();
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>("general");
  const [activeType, setActiveType] = useState(masterDataTypes[0].type);
  const [itemsByType, setItemsByType] = useState<Record<string, MasterDataEntry[]>>({});
  const [loadedTypes, setLoadedTypes] = useState<Record<string, boolean>>({});
  const [loadingTypes, setLoadingTypes] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<MasterDataEntry | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [articleSearchEnabled, setArticleSearchEnabled] = useState(
    () => window.localStorage.getItem(articleSearchSettingKey) !== "false"
  );
  const [articleSearchSources, setArticleSearchSources] = useState<string[]>(readArticleSearchSources);
  const [design, setDesign] = useState<ThemePreference>(readThemePreference);
  const [inventorySchemes, setInventorySchemes] = useState<InventoryNumberScheme[]>([]);
  const [inventorySchemesLoading, setInventorySchemesLoading] = useState(false);
  const [inventorySchemesMessage, setInventorySchemesMessage] = useState("");
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [backupValidation, setBackupValidation] = useState<BackupValidationResult | null>(null);
  const [backupMessage, setBackupMessage] = useState("");
  const [backupRestoreConfirm, setBackupRestoreConfirm] = useState("");
  const [backupSaving, setBackupSaving] = useState(false);
  const [backupValidating, setBackupValidating] = useState(false);
  const [masterDataFile, setMasterDataFile] = useState<File | null>(null);
  const [masterDataMessage, setMasterDataMessage] = useState("");
  const [masterDataSaving, setMasterDataSaving] = useState(false);
  const [defaultView, setDefaultView] = useState(() => {
    const storedDefaultView = readLocalSetting(localSettingKeys.defaultView, "overview");
    return storedDefaultView === "inventory" ? "vehicles" : storedDefaultView;
  });
  const [sidebarOrder, setSidebarOrder] = useState<AppView[]>(readSidebarOrder);
  const [dateFormat, setDateFormat] = useState(() => readLocalSetting(localSettingKeys.dateFormat, "system"));
  const [timeFormat, setTimeFormat] = useState(() => readLocalSetting(localSettingKeys.timeFormat, "system"));
  const [defaultPrinter, setDefaultPrinter] = useState(() => readLocalSetting(localSettingKeys.defaultPrinter, "system-dialog"));
  const [updateChecks, setUpdateChecks] = useState(() => readLocalBool(localSettingKeys.updateChecks, true));
  const [betaUpdates, setBetaUpdates] = useState(() => readLocalBool(localSettingKeys.betaUpdates, false));
  const [ignoredUpdate, setIgnoredUpdate] = useState(() => readLocalSetting(localSettingKeys.ignoredUpdate, ""));
  const [darkBackground, setDarkBackground] = useState(() => readLocalSetting(localSettingKeys.darkBackground, "neutral"));
  const [darkAccent, setDarkAccent] = useState(() => readLocalSetting(localSettingKeys.darkAccent, "green"));
  const [darkStyle, setDarkStyle] = useState(() => readLocalSetting(localSettingKeys.darkStyle, "classic"));
  const [lightBackground, setLightBackground] = useState(() => readLocalSetting(localSettingKeys.lightBackground, "neutral"));
  const [lightAccent, setLightAccent] = useState(() => readLocalSetting(localSettingKeys.lightAccent, "green"));
  const [lightStyle, setLightStyle] = useState(() => readLocalSetting(localSettingKeys.lightStyle, "classic"));
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [versionMessage, setVersionMessage] = useState("");
  const [versionLoading, setVersionLoading] = useState(false);
  const [storageUsage, setStorageUsage] = useState<StorageUsage | null>(null);
  const [storageMessage, setStorageMessage] = useState("");
  const [storageLoading, setStorageLoading] = useState(false);
  const [systemPrinters, setSystemPrinters] = useState<SystemPrinters | null>(null);
  const [printerMessage, setPrinterMessage] = useState("");
  const [printersLoading, setPrintersLoading] = useState(false);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [authMessage, setAuthMessage] = useState("");
  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [auditLogLoading, setAuditLogLoading] = useState(false);
  const [auditLogMessage, setAuditLogMessage] = useState("");
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsMessage, setSessionsMessage] = useState("");
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [userForm, setUserForm] = useState<UserFormState>(emptyUserForm);
  const [userSaving, setUserSaving] = useState(false);
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>(emptyPasswordForm);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [twoFactorPrepared, setTwoFactorPrepared] = useState(() => readLocalBool(localSettingKeys.twoFactorPrepared, false));
  const canManageUsers = Boolean(currentSession?.roles.includes("Admin"));
  const backupRestoreConfirmed = backupRestoreConfirm.trim().toLocaleUpperCase("de-DE") === "WIEDERHERSTELLEN";

  const activeDataType = useMemo(
    () => masterDataTypes.find((item) => item.type === activeType) || masterDataTypes[0],
    [activeType]
  );
  const masterLabel = (type: string) => t(`settings.master.${type}`);
  const masterDescription = (type: string) => t(`settings.master.${type}Desc`);
  const auditLabel = (action: string) => {
    const label = t(`settings.auditAction.${action}`);
    return label === `settings.auditAction.${action}` ? action : label;
  };
  const roleDescription = (role: string) => {
    const description = t(`settings.role.${role}`);
    return description === `settings.role.${role}` ? t("settings.roles.custom") : description;
  };
  const inventoryCategoryLabel = (category: string) => {
    const label = t(`settings.category.${category}`);
    return label === `settings.category.${category}` ? category : label;
  };
  const storageCategoryLabel = (key: string, label: string) => {
    const normalized = `${key} ${label}`.toLocaleLowerCase("de-DE");
    const categoryKey =
      normalized.includes("database") || normalized.includes("datenbank") ? "database" :
      normalized.includes("thumbnail") || normalized.includes("vorschau") ? "thumbnails" :
      normalized.includes("image") || normalized.includes("bild") ? "images" :
      normalized.includes("attachment") || normalized.includes("beilage") ? "attachments" :
      normalized.includes("other") || normalized.includes("sonstig") ? "other" : "";
    if (!categoryKey) return label;
    return t(`settings.storage.category.${categoryKey}`);
  };
  const fileCountLabel = (count: number, bytes: number) =>
    t("settings.storage.fileCount", {
      count,
      suffix: count === 1 ? "" : language === "de" ? "en" : "s",
      size: formatBytes(bytes)
    });
  const versionStatusLabel = (info: VersionInfo) => {
    if (info.updateAvailable && info.latestVersion === ignoredUpdate) return t("settings.updates.status.ignored");
    if (info.updateAvailable) return t("settings.updates.status.updateAvailable");
    if (info.status === "current") return betaUpdates ? t("settings.updates.status.currentBeta") : t("settings.updates.status.current");
    if (info.status === "no_release") return t("settings.updates.status.noRelease");
    if (info.status === "unavailable") return t("settings.updates.status.offline");
    return t("settings.updates.status.local");
  };
  const localizedStatusMessage = (message: string) => {
    if (message.includes("Windows-Systemdrucker")) return t("settings.printer.messageLoaded");
    if (message.includes("Keine Release-Information")) return t("settings.updates.message.noRelease");
    if (message.includes("RailKeeper ist aktuell")) return t("settings.updates.message.current");
    return message;
  };
  const updateIgnored = Boolean(versionInfo?.updateAvailable && versionInfo.latestVersion && versionInfo.latestVersion === ignoredUpdate);
  const activeDataLabel = masterLabel(activeDataType.type);
  const activeDataDescription = masterDescription(activeDataType.type);
  const storageFileCount = useMemo(
    () => (storageUsage?.categories || []).reduce((total, category) => total + category.files, 0),
    [storageUsage]
  );
  const items = itemsByType[activeType] || [];
  const loading = Boolean(loadingTypes[activeType]);
  const isSymbolData = activeType === "symbols";
  const masterDataColumnCount = activeType === "manufacturer" || isSymbolData ? 5 : 4;

  const filteredItems = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("de-DE");
    if (!needle) return items;
    return items.filter((entry) =>
      `${entry.label} ${entry.key} ${entry.sourceUrl || ""} ${metadataString(entry, "description")}`.toLocaleLowerCase("de-DE").includes(needle)
    );
  }, [items, search]);

  useEffect(() => {
    setEditing(null);
    setForm(emptyForm);
    setSearch("");
    setMessage("");
  }, [activeType]);

  useEffect(() => {
    if (activeSettingsTab !== "general" || inventorySchemes.length > 0 || inventorySchemesLoading) return;
    loadInventorySchemes();
  }, [activeSettingsTab, inventorySchemes.length, inventorySchemesLoading]);

  useEffect(() => {
    if (activeSettingsTab !== "general") return;
    loadVersionInfo();
    loadStorageUsage();
    loadSystemPrinters();
  }, [activeSettingsTab]);

  useEffect(() => {
    if (activeSettingsTab !== "data" || storageUsage || storageLoading) return;
    loadStorageUsage();
  }, [activeSettingsTab, storageUsage, storageLoading]);

  useEffect(() => {
    if (activeSettingsTab !== "auth") return;
    loadCurrentSession();
  }, [activeSettingsTab]);

  useEffect(() => {
    if (activeSettingsTab !== "auth" || !canManageUsers) return;
    loadUsersAndRoles();
    loadAuditLog();
    loadSessions();
  }, [activeSettingsTab, canManageUsers]);

  useEffect(() => {
    if (activeSettingsTab !== "data" || loadedTypes[activeType]) return;

    let cancelled = false;
    const typesToLoad = loadableMasterDataTypes
      .map((item) => item.type)
      .filter((typeName) => !loadedTypes[typeName]);

    setMessage("");
    setLoadingTypes((current) => ({
      ...current,
      ...Object.fromEntries(typesToLoad.map((typeName) => [typeName, true]))
    }));

    api
      .masterDataAll()
      .then((entriesByType) => {
        if (cancelled) return;

        const normalized = Object.fromEntries(
          loadableMasterDataTypes.map((item) => [item.type, entriesByType[item.type] || []])
        );
        const loaded = Object.fromEntries(loadableMasterDataTypes.map((item) => [item.type, true]));
        setItemsByType((current) => ({ ...current, ...normalized }));
        setLoadedTypes((current) => ({ ...current, ...loaded }));
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setMessage(error.message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingTypes((current) => ({
            ...current,
            ...Object.fromEntries(typesToLoad.map((typeName) => [typeName, false]))
          }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSettingsTab, activeType]);

  const reloadActiveType = () => {
    setLoadingTypes((current) => ({ ...current, [activeType]: true }));
    setMessage("");
    api
      .masterData(activeType)
      .then((entries) => {
        setItemsByType((current) => ({ ...current, [activeType]: entries }));
        setLoadedTypes((current) => ({ ...current, [activeType]: true }));
      })
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setLoadingTypes((current) => ({ ...current, [activeType]: false })));
  };

  const update = (patch: Partial<FormState>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const selectSymbolImage = (file: File | null) => {
    setMessage("");
    if (!file) return;

    const isAccepted = file.type.startsWith("image/") || file.name.toLocaleLowerCase("de-DE").endsWith(".svg");
    if (!isAccepted) {
      setMessage("Bitte SVG, PNG, JPG oder WebP als Symbolbild auswählen.");
      return;
    }
    if (file.size > 1024 * 1024) {
      setMessage("Symbolbild bitte unter 1 MB halten.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        update({ imageData: reader.result });
      }
    };
    reader.onerror = () => setMessage("Symbolbild konnte nicht gelesen werden.");
    reader.readAsDataURL(file);
  };

  const setLocalSetting = (key: string, value: string, setter: (value: string) => void) => {
    setter(value);
    window.localStorage.setItem(key, value);
    if (key.startsWith("railkeeper.settings.dark") || key.startsWith("railkeeper.settings.light")) {
      applyStoredThemeOptions();
    }
  };

  const setLocalBool = (key: string, value: boolean, setter: (value: boolean) => void) => {
    setter(value);
    window.localStorage.setItem(key, String(value));
  };

  const saveSidebarOrder = (nextOrder: AppView[]) => {
    setSidebarOrder(nextOrder);
    window.localStorage.setItem(localSettingKeys.sidebarOrder, JSON.stringify(nextOrder));
    window.dispatchEvent(new Event(sidebarOrderChangedEvent));
  };

  const moveSidebarItem = (view: AppView, direction: -1 | 1) => {
    const index = sidebarOrder.indexOf(view);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= sidebarOrder.length) return;
    const nextOrder = [...sidebarOrder];
    [nextOrder[index], nextOrder[nextIndex]] = [nextOrder[nextIndex], nextOrder[index]];
    saveSidebarOrder(nextOrder);
  };

  const resetSidebarOrder = () => {
    saveSidebarOrder(defaultSidebarOrder);
  };

  const updateArticleSearchEnabled = (enabled: boolean) => {
    setArticleSearchEnabled(enabled);
    window.localStorage.setItem(articleSearchSettingKey, String(enabled));
  };
  const updateArticleSearchSource = (source: string, enabled: boolean) => {
    setArticleSearchSources((current) => {
      const next = enabled ? [...new Set([...current, source])] : current.filter((item) => item !== source);
      const normalized = next.length > 0 ? next : ["web"];
      window.localStorage.setItem(articleSearchSourcesSettingKey, JSON.stringify(normalized));
      return normalized;
    });
  };

  const updateDesign = (preference: ThemePreference) => {
    setDesign(preference);
    applyThemePreference(preference);
  };

  const loadVersionInfo = (forceCheck = false, includeBeta = betaUpdates) => {
    const shouldCheck = forceCheck || updateChecks;
    setVersionLoading(true);
    setVersionMessage("");
    api
      .version(shouldCheck, includeBeta)
      .then((info) => {
        setVersionInfo(info);
        setVersionMessage(info.message || t("settings.updates.message.reachable", { version: info.version || t("settings.unknown") }));
      })
      .catch((error: Error) => setVersionMessage(error.message))
      .finally(() => setVersionLoading(false));
  };

  const updateBetaUpdates = (enabled: boolean) => {
    setLocalBool(localSettingKeys.betaUpdates, enabled, setBetaUpdates);
    if (updateChecks) {
      loadVersionInfo(true, enabled);
    }
  };

  const installUpdate = () => {
    const target = versionInfo?.assetUrl || versionInfo?.releaseUrl;
    if (!target) {
      setVersionMessage(t("settings.updates.message.noInstallTarget"));
      return;
    }
    window.open(target, "_blank", "noopener,noreferrer");
    setVersionMessage(t("settings.updates.message.installOpened"));
  };

  const ignoreUpdate = () => {
    if (!versionInfo?.latestVersion) {
      return;
    }
    window.localStorage.setItem(localSettingKeys.ignoredUpdate, versionInfo.latestVersion);
    setIgnoredUpdate(versionInfo.latestVersion);
    setVersionMessage(t("settings.updates.message.ignored", { version: versionInfo.latestVersion }));
  };

  const loadStorageUsage = () => {
    setStorageLoading(true);
    setStorageMessage("");
    api
      .storageUsage()
      .then(setStorageUsage)
      .catch((error: Error) => setStorageMessage(error.message))
      .finally(() => setStorageLoading(false));
  };

  const loadSystemPrinters = () => {
    setPrintersLoading(true);
    setPrinterMessage("");
    api
      .systemPrinters()
      .then((result) => {
        setSystemPrinters(result);
        setPrinterMessage(result.message);
        if (defaultPrinter === "system-dialog" && result.defaultPrinter) {
          setDefaultPrinter(`printer:${result.defaultPrinter}`);
          window.localStorage.setItem(localSettingKeys.defaultPrinter, `printer:${result.defaultPrinter}`);
        }
      })
      .catch((error: Error) => setPrinterMessage(error.message))
      .finally(() => setPrintersLoading(false));
  };

  const loadCurrentSession = () => {
    setAuthMessage("");
    api
      .session()
      .then(setCurrentSession)
      .catch((error: Error) => setAuthMessage(error.message));
  };

  const loadUsersAndRoles = () => {
    setUsersLoading(true);
    setAuthMessage("");
    Promise.all([api.roles(), api.users()])
      .then(([roles, accounts]) => {
        setAvailableRoles(roles);
        setUsers(accounts);
      })
      .catch((error: Error) => setAuthMessage(error.message))
      .finally(() => setUsersLoading(false));
  };

  const loadAuditLog = () => {
    setAuditLogLoading(true);
    setAuditLogMessage("");
    api
      .auditLog(10)
      .then((result) => setAuditLog(result.entries))
      .catch((error: Error) => setAuditLogMessage(error.message))
      .finally(() => setAuditLogLoading(false));
  };

  const loadSessions = () => {
    setSessionsLoading(true);
    setSessionsMessage("");
    api
      .sessions(5)
      .then(setSessions)
      .catch((error: Error) => setSessionsMessage(error.message))
      .finally(() => setSessionsLoading(false));
  };

  const revokeSession = (session: SessionRecord) => {
    if (!window.confirm(`Sitzung von ${session.username} widerrufen?`)) return;
    setSessionsMessage("");
    api
      .revokeSession(session.id)
      .then(() => {
        loadSessions();
        loadAuditLog();
      })
      .catch((error: Error) => setSessionsMessage(error.message));
  };

  const changePassword = (event: FormEvent) => {
    event.preventDefault();
    setPasswordMessage("");
    if (passwordForm.newPassword.length < 12) {
      setPasswordMessage("Das neue Passwort muss mindestens 12 Zeichen lang sein.");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordMessage("Die neuen Passwörter stimmen nicht überein.");
      return;
    }
    setPasswordSaving(true);
    api
      .changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      })
      .then(() => {
        setPasswordForm(emptyPasswordForm);
        setPasswordMessage("Passwort wurde geändert. Andere Sitzungen dieses Benutzers wurden widerrufen.");
        loadSessions();
        loadAuditLog();
      })
      .catch((error: Error) => setPasswordMessage(error.message))
      .finally(() => setPasswordSaving(false));
  };

  const startUserCreate = () => {
    setEditingUser(null);
    setUserForm(emptyUserForm);
    setAuthMessage("");
  };

  const startUserEdit = (user: UserAccount) => {
    setEditingUser(user);
    setUserForm({
      username: user.username,
      email: user.email || "",
      password: "",
      roles: user.roles.length > 0 ? user.roles : ["Viewer"]
    });
    setAuthMessage("");
  };

  const toggleUserRole = (role: string, checked: boolean) => {
    setUserForm((current) => {
      const nextRoles = checked
        ? [...current.roles, role]
        : current.roles.filter((currentRole) => currentRole !== role);
      return { ...current, roles: Array.from(new Set(nextRoles)) };
    });
  };

  const saveUser = (event: FormEvent) => {
    event.preventDefault();
    setUserSaving(true);
    setAuthMessage("");

    const input = {
      username: userForm.username,
      email: userForm.email,
      password: userForm.password || undefined,
      roles: userForm.roles
    };
    const action = editingUser ? api.updateUser(editingUser.id, input) : api.createUser(input);

    action
      .then((user) => {
        setEditingUser(user);
        setUserForm({ username: user.username, email: user.email || "", password: "", roles: user.roles });
        loadUsersAndRoles();
        loadAuditLog();
        loadCurrentSession();
      })
      .catch((error: Error) => setAuthMessage(error.message))
      .finally(() => setUserSaving(false));
  };

  const deleteUser = (user: UserAccount) => {
    if (!window.confirm(`${user.username} löschen?`)) return;
    setAuthMessage("");
    api
      .deleteUser(user.id)
      .then(() => {
        if (editingUser?.id === user.id) {
          startUserCreate();
        }
        loadUsersAndRoles();
        loadAuditLog();
      })
      .catch((error: Error) => setAuthMessage(error.message));
  };

  const loadInventorySchemes = () => {
    setInventorySchemesLoading(true);
    setInventorySchemesMessage("");
    api
      .inventoryNumberSchemes()
      .then(setInventorySchemes)
      .catch((error: Error) => setInventorySchemesMessage(error.message))
      .finally(() => setInventorySchemesLoading(false));
  };

  const updateInventoryScheme = (category: string, patch: Partial<InventoryNumberScheme>) => {
    setInventorySchemes((current) =>
      current.map((scheme) => (scheme.category === category ? { ...scheme, ...patch } : scheme))
    );
  };

  const saveInventoryScheme = (scheme: InventoryNumberScheme) => {
    setInventorySchemesMessage("");
    api
      .updateInventoryNumberScheme(scheme.category, {
        prefix: scheme.prefix,
        nextNumber: Number(scheme.nextNumber) || 1,
        padding: Number(scheme.padding) || 6,
        active: scheme.active
      })
      .then((updated) => updateInventoryScheme(updated.category, updated))
      .catch((error: Error) => setInventorySchemesMessage(error.message));
  };

  const startCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setMessage("");
  };

  const startEdit = (entry: MasterDataEntry) => {
    setEditing(entry);
    setForm(entryToForm(entry));
    setMessage("");
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();

    setSaving(true);
    setMessage("");

    let metadata: Record<string, unknown>;
    try {
      metadata = JSON.parse(form.metadataText || "{}");
    } catch {
      setSaving(false);
      setMessage("Interne Zusatzdaten müssen gültiges JSON sein.");
      return;
    }
    metadata = applyVisibleMetadata(activeType, metadata, form);

    const input: MasterDataInput = {
      key: form.key,
      label: form.label,
      active: form.active,
      sortOrder: Number(form.sortOrder) || 0,
      sourceUrl: isSymbolData ? "" : form.sourceUrl,
      metadata
    };

    const action = editing
      ? api.updateMasterData(activeType, editing.key, input)
      : api.createMasterData(activeType, input);

    action
      .then((entry) => {
        setEditing(entry);
        setForm(entryToForm(entry));
        reloadActiveType();
      })
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setSaving(false));
  };

  const deleteEntry = (entry: MasterDataEntry) => {
    if (!window.confirm(`${entry.label} löschen?`)) return;

    api
      .deleteMasterData(activeType, entry.key)
      .then(() => {
        if (editing?.key === entry.key) {
          startCreate();
        }
        reloadActiveType();
      })
      .catch((error: Error) => setMessage(error.message));
  };

  const selectBackupFile = (file: File | null) => {
    setBackupFile(file);
    setBackupValidation(null);
    setBackupMessage("");
    setBackupRestoreConfirm("");
    if (!file) return;

    setBackupValidating(true);
    api
      .validateBackup(file)
      .then((result) => setBackupValidation(result))
      .catch((error: Error) => setBackupMessage(error.message))
      .finally(() => setBackupValidating(false));
  };

  const restoreBackup = () => {
    if (!backupFile) {
      setBackupMessage("Bitte zuerst eine Backup-Datei auswählen.");
      return;
    }
    if (!backupValidation?.compatible) {
      setBackupMessage("Backup bitte zuerst erfolgreich prüfen.");
      return;
    }
    if (!backupRestoreConfirmed) {
      setBackupMessage("Bitte WIEDERHERSTELLEN eingeben, um den Restore freizugeben.");
      return;
    }
    if (!window.confirm("Backup wirklich wiederherstellen? Bestand, Stammdaten, Wartung, CVs und Uploads werden durch den Inhalt der Datei ersetzt.")) {
      return;
    }
    setBackupSaving(true);
    setBackupMessage("");
    api
      .restoreBackup(backupFile)
      .then((result) => {
        setBackupMessage(`Backup wiederhergestellt: ${result.restoredRows} Datensätze, ${result.restoredFiles} Dateien.`);
        setLoadedTypes({});
        setItemsByType({});
        setBackupRestoreConfirm("");
      })
      .catch((error: Error) => setBackupMessage(error.message))
      .finally(() => setBackupSaving(false));
  };

  const importMasterData = () => {
    if (!masterDataFile) {
      setMasterDataMessage("Bitte zuerst eine Stammdaten-Datei auswählen.");
      return;
    }
    if (!window.confirm("Stammdaten wirklich importieren? Bestehende Stammdaten und Kategorie/Gattung-Abhängigkeiten werden ersetzt. Bestand und Uploads bleiben unverändert.")) {
      return;
    }
    setMasterDataSaving(true);
    setMasterDataMessage("");
    api
      .importMasterData(masterDataFile)
      .then((result) => {
        setMasterDataMessage(`Stammdaten importiert: ${result.importedEntries} Einträge, ${result.importedRelations} Abhängigkeiten.`);
        setLoadedTypes({});
        setItemsByType({});
        setSearch("");
      })
      .catch((error: Error) => setMasterDataMessage(error.message))
      .finally(() => setMasterDataSaving(false));
  };

  return (
    <>
      <section className="settings-head">
        <h1>
          {t("settings.title")} <span>0.1.6</span>
        </h1>
        <p>{t("settings.subtitle")}</p>
      </section>

      <nav className="settings-primary-tabs" aria-label={t("settings.title")}>
        {settingsTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeSettingsTab === tab.id ? "active" : ""}
            onClick={() => setActiveSettingsTab(tab.id)}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </nav>

      {activeSettingsTab === "general" && (
        <section className="settings-dashboard-grid">
          <div className="settings-card-stack">
            <section className="panel settings-card settings-tool-card">
              <div className="settings-section-head">
                <div>
                  <h2>{t("settings.general.title")}</h2>
                  <p>{t("settings.general.subtitle")}</p>
                </div>
              </div>
              <div className="settings-field-grid">
                <label>
                  {t("settings.language")}
                  <select value={language} onChange={(event) => setLanguage(event.target.value as Language)}>
                    <option value="de">{t("settings.language.de")}</option>
                    <option value="en">{t("settings.language.en")}</option>
                  </select>
                </label>
                <label>
                  {t("settings.defaultView")}
                  <select value={defaultView} onChange={(event) => setLocalSetting(localSettingKeys.defaultView, event.target.value, setDefaultView)}>
                    <option value="overview">{t("nav.overview")}</option>
                    <option value="vehicles">{t("nav.vehicles")}</option>
                    <option value="exhibition">{t("nav.exhibition")}</option>
                    <option value="importExport">{t("nav.importExport")}</option>
                    <option value="settings">{t("nav.settings")}</option>
                  </select>
                </label>
                <label>
                  {t("settings.dateFormat")}
                  <select value={dateFormat} onChange={(event) => setLocalSetting(localSettingKeys.dateFormat, event.target.value, setDateFormat)}>
                    <option value="system">{t("settings.option.systemDefault")}</option>
                    <option value="de">{t("settings.option.dateDe")}</option>
                    <option value="iso">{t("settings.option.dateIso")}</option>
                  </select>
                </label>
                <label>
                  {t("settings.timeFormat")}
                  <select value={timeFormat} onChange={(event) => setLocalSetting(localSettingKeys.timeFormat, event.target.value, setTimeFormat)}>
                    <option value="system">{t("settings.option.systemDefault")}</option>
                    <option value="24h">{t("settings.option.hours24")}</option>
                    <option value="12h">{t("settings.option.hours12")}</option>
                  </select>
                </label>
                <label className="settings-field-wide">
                  {t("settings.defaultPrinter")}
                  <select value={defaultPrinter} onChange={(event) => setLocalSetting(localSettingKeys.defaultPrinter, event.target.value, setDefaultPrinter)}>
                    <option value="system-dialog">{t("settings.printer.system")}</option>
                    {(systemPrinters?.printers || []).map((printer) => (
                      <option key={printer.id} value={`printer:${printer.name}`}>
                        {printer.name}{printer.isDefault ? ` (${t("settings.defaultPrinter.default")})` : ""}
                      </option>
                    ))}
                    <option value="ask">{t("settings.printer.ask")}</option>
                    <option value="pdf">{t("settings.printer.pdf")}</option>
                  </select>
                </label>
              </div>
              <div className="settings-action-row">
                <p>{printerMessage ? localizedStatusMessage(printerMessage) : t("settings.printer.message")}</p>
                <button type="button" className="secondary-button" onClick={() => window.print()}>
                  <Printer size={17} />
                  {t("settings.printer.open")}
                </button>
                <button type="button" className="icon-button" onClick={loadSystemPrinters} aria-label={t("settings.printer.refresh")} title={t("settings.printer.refresh")} disabled={printersLoading}>
                  <RefreshCw size={16} />
                </button>
              </div>
              <section className="sidebar-order-box" aria-label={t("settings.sidebarOrder.title")}>
                <div>
                  <h3>{t("settings.sidebarOrder.title")}</h3>
                  <p>{t("settings.sidebarOrder.subtitle")}</p>
                </div>
                <div className="sidebar-order-list">
                  {sidebarOrder.map((view, index) => (
                    <div key={view}>
                      <span>{index + 1}</span>
                      <strong>{t(`nav.${view}`)}</strong>
                      <button type="button" className="icon-button" onClick={() => moveSidebarItem(view, -1)} disabled={index === 0} aria-label={t("overview.widget.forward", { label: t(`nav.${view}`) })} title={t("overview.moveForward")}>
                        <ChevronUp size={15} />
                      </button>
                      <button type="button" className="icon-button" onClick={() => moveSidebarItem(view, 1)} disabled={index === sidebarOrder.length - 1} aria-label={t("overview.widget.backward", { label: t(`nav.${view}`) })} title={t("overview.moveBackward")}>
                        <ChevronDown size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" className="secondary-button compact-action" onClick={resetSidebarOrder}>
                  {t("settings.sidebarOrder.reset")}
                </button>
              </section>
            </section>

            <section className="panel settings-card settings-tool-card">
              <div className="settings-section-head">
                <div>
                  <h2>{t("settings.inventoryNumbers.title")}</h2>
                  <p>{t("settings.inventoryNumbers.subtitle")}</p>
                </div>
                <button type="button" className="icon-button" onClick={loadInventorySchemes} aria-label={t("settings.inventoryNumbers.refresh")} title={t("settings.inventoryNumbers.refresh")} disabled={inventorySchemesLoading}>
                  <RefreshCw size={16} />
                </button>
              </div>

              <div className="table-wrap settings-inline-table">
                <table>
                  <thead>
                    <tr>
                      <th>{t("settings.inventoryNumbers.category")}</th>
                      <th>{t("settings.inventoryNumbers.prefix")}</th>
                      <th>{t("settings.inventoryNumbers.next")}</th>
                      <th>{t("settings.inventoryNumbers.padding")}</th>
                      <th>{t("common.active")}</th>
                      <th>{t("settings.inventoryNumbers.preview")}</th>
                      <th>{t("exhibition.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventorySchemesLoading && inventorySchemes.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="loading-cell">{t("settings.inventoryNumbers.loading")}</td>
                      </tr>
                    ) : inventorySchemes.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="loading-cell">{t("settings.inventoryNumbers.empty")}</td>
                      </tr>
                    ) : (
                      inventorySchemes.map((scheme) => (
                        <tr key={scheme.id}>
                          <td><strong>{inventoryCategoryLabel(scheme.category)}</strong></td>
                          <td>
                            <input value={scheme.prefix} onChange={(event) => updateInventoryScheme(scheme.category, { prefix: event.target.value })} />
                          </td>
                          <td>
                            <input type="number" min={1} value={scheme.nextNumber} onChange={(event) => updateInventoryScheme(scheme.category, { nextNumber: Number(event.target.value) })} />
                          </td>
                          <td>
                            <input type="number" min={1} max={12} value={scheme.padding} onChange={(event) => updateInventoryScheme(scheme.category, { padding: Number(event.target.value) })} />
                          </td>
                          <td>
                            <label className="switch-field" aria-label={t("settings.inventoryNumbers.activeAria", { category: inventoryCategoryLabel(scheme.category) })}>
                              <input type="checkbox" checked={scheme.active} onChange={(event) => updateInventoryScheme(scheme.category, { active: event.target.checked })} />
                              <span />
                            </label>
                          </td>
                          <td><code>{scheme.preview}</code></td>
                          <td>
                            <button type="button" className="secondary-button compact-action" onClick={() => saveInventoryScheme(scheme)}>
                              {t("vehicles.save")}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {inventorySchemesMessage && <p className="form-message">{inventorySchemesMessage}</p>}
            </section>
          </div>

          <aside className="settings-card-stack">
            <section className="panel settings-card settings-tool-card">
              <div className="settings-card-title">
                <Database size={17} />
                <h2>{t("settings.articleSearch.title")}</h2>
              </div>
              <label className="settings-toggle-row">
                <span>
                  <strong>{t("settings.articleSearch.active")}</strong>
                  <small>{t("settings.articleSearch.help")}</small>
                </span>
                <span className="switch-field">
                  <input type="checkbox" checked={articleSearchEnabled} onChange={(event) => updateArticleSearchEnabled(event.target.checked)} />
                  <span />
                </span>
              </label>
              <div className="article-source-grid" aria-label={t("settings.articleSearch.sources")}>
                {articleSearchSourceOptions.map((option) => (
                  <label key={option.id} className="article-source-option">
                    <input
                      type="checkbox"
                      checked={articleSearchSources.includes(option.id)}
                      onChange={(event) => updateArticleSearchSource(option.id, event.target.checked)}
                      disabled={!articleSearchEnabled}
                    />
                    <span>
                      <strong>{t(option.labelKey)}</strong>
                      <small>{t(option.helpKey)}</small>
                    </span>
                  </label>
                ))}
              </div>
            </section>

            <section className="panel settings-card settings-tool-card">
              <div className="settings-card-title">
                <RefreshCw size={17} />
                <h2>{t("settings.updates.title")}</h2>
              </div>
              <label className="settings-toggle-row">
                <span>
                  <strong>{t("settings.updates.check")}</strong>
                  <small>{t("settings.updates.checkHelp")}</small>
                </span>
                <span className="switch-field">
                  <input type="checkbox" checked={updateChecks} onChange={(event) => setLocalBool(localSettingKeys.updateChecks, event.target.checked, setUpdateChecks)} />
                  <span />
                </span>
              </label>
              <label className="settings-toggle-row">
                <span>
                  <strong>{t("settings.updates.beta")}</strong>
                  <small>{t("settings.updates.betaHelp")}</small>
                </span>
                <span className="switch-field">
                  <input type="checkbox" checked={betaUpdates} onChange={(event) => updateBetaUpdates(event.target.checked)} />
                  <span />
                </span>
              </label>
              <div className="settings-action-row">
                <p>
                  {t("settings.updates.currentVersion")}: <strong>{versionInfo?.version || t("settings.unknown")}</strong>
                  {versionInfo?.latestVersion && <> · {t("settings.updates.latestVersion")}: <strong>{versionInfo.latestVersion}</strong></>}
                </p>
                {versionInfo?.status && (
                  <span className={`settings-pill ${versionInfo.updateAvailable && !updateIgnored ? "active" : ["unavailable", "no_release"].includes(versionInfo.status) || updateIgnored ? "muted" : ""}`}>
                    {versionStatusLabel(versionInfo)}
                  </span>
                )}
                <button type="button" className="secondary-button" onClick={() => loadVersionInfo(true)} disabled={versionLoading}>
                  <RefreshCw size={17} />
                  {versionLoading ? t("settings.updates.checking") : t("settings.updates.checkNow")}
                </button>
              </div>
              {versionInfo?.releaseUrl && (
                <a className="settings-link-row" href={versionInfo.releaseUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={15} />
                  {t("settings.updates.openRelease")}
                </a>
              )}
              {versionInfo?.updateAvailable && !updateIgnored && (
                <div className="update-decision-panel">
                  <div>
                    <strong>{t("settings.updates.decisionTitle", { version: versionInfo.latestVersion || "" })}</strong>
                    <span>{versionInfo.assetName ? t("settings.updates.asset", { name: versionInfo.assetName }) : t("settings.updates.noAsset")}</span>
                  </div>
                  {versionInfo.releaseNotes && <pre>{versionInfo.releaseNotes}</pre>}
                  <div className="settings-action-row">
                    <button type="button" className="primary-button" onClick={installUpdate}>
                      <Download size={15} />
                      {t("settings.updates.install")}
                    </button>
                    <button type="button" className="secondary-button" onClick={ignoreUpdate}>
                      <X size={15} />
                      {t("settings.updates.ignore")}
                    </button>
                  </div>
                </div>
              )}
              {versionMessage && <p className="form-message">{localizedStatusMessage(versionMessage)}</p>}
            </section>

            <section className="panel settings-card settings-tool-card">
              <div className="settings-section-head">
                <div className="settings-card-title">
                  <HardDrive size={17} />
                  <h2>{t("settings.storage.title")}</h2>
                </div>
                <button type="button" className="icon-button" onClick={loadStorageUsage} aria-label={t("settings.storage.refresh")} title={t("settings.data.refresh")} disabled={storageLoading}>
                  <RefreshCw size={16} />
                </button>
              </div>
              <p>{t("settings.storage.subtitle")}</p>
              <div className="storage-total">
                <strong>{formatBytes(storageUsage?.totalBytes || 0)}</strong>
                <span>{storageUsage?.updatedAt ? t("settings.storage.updated", { date: formatDateTime(storageUsage.updatedAt) }) : t("settings.storage.notUpdated")}</span>
              </div>
              <div className="storage-list">
                {(storageUsage?.categories || []).map((category) => {
                  const percent = storageUsage?.totalBytes ? Math.round((category.bytes / storageUsage.totalBytes) * 100) : 0;
                  return (
                    <div className="storage-row" key={category.key}>
                      <div>
                        <strong>{storageCategoryLabel(category.key, category.label)}</strong>
                        <span>{fileCountLabel(category.files, category.bytes)}</span>
                      </div>
                      <div className="storage-bar" aria-label={storageCategoryLabel(category.key, category.label) + ": " + percent + "%"}>
                        <span style={{ width: Math.max(2, percent) + "%" }} />
                      </div>
                    </div>
                  );
                })}
                {storageLoading && <p className="empty-state compact">{t("settings.storage.loading")}</p>}
                {!storageLoading && !storageUsage && <p className="empty-state compact">{t("settings.storage.empty")}</p>}
              </div>
              {storageMessage && <p className="form-message">{storageMessage}</p>}
            </section>
          </aside>
        </section>
      )}

      {activeSettingsTab === "data" && (
        <section className="panel settings-card data-card">
          <h2>{t("settings.data.title")}</h2>
          <p>{t("settings.data.subtitle")}</p>

          <nav className="settings-secondary-tabs" aria-label={t("settings.data.nav")}>
            {masterDataTypes.map((item) => (
              <button
                key={item.type}
                type="button"
                className={item.type === activeType ? "active" : ""}
                onClick={() => setActiveType(item.type)}
              >
                {masterLabel(item.type)}
              </button>
            ))}
          </nav>

          <section className="master-data-panel">
            <div className="master-data-head">
              <div>
                <h3>{t("settings.data.manage", { label: activeDataLabel })}</h3>
                <p>{activeDataDescription}</p>
              </div>
              <button type="button" className="icon-button" onClick={reloadActiveType} aria-label={t("settings.data.refresh")} title={t("settings.data.refresh")} disabled={loading}>
                <RefreshCw size={16} />
              </button>
            </div>

            <>
              <label className="settings-search">
                {t("settings.data.search")}
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("settings.data.searchPlaceholder")} />
              </label>

                <form className={activeType === "manufacturer" ? "master-data-create manufacturer-create" : isSymbolData ? "master-data-create symbol-create" : "master-data-create"} onSubmit={submit}>
                  <strong>{editing ? t("settings.data.editEntry") : t("settings.data.newEntry")}</strong>
                  <input value={form.label} onChange={(event) => update({ label: event.target.value })} placeholder={t("settings.data.entryPlaceholder", { label: activeDataLabel })} required />
                  {activeType === "manufacturer" && (
                    <input
                      value={form.nominalScalesText}
                      onChange={(event) => update({ nominalScalesText: event.target.value })}
                      placeholder={t("settings.data.nominalPlaceholder")}
                    />
                  )}
                  {isSymbolData ? (
                    <>
                      <textarea
                        value={form.description}
                        onChange={(event) => update({ description: event.target.value })}
                        placeholder={t("settings.data.descriptionPlaceholder")}
                        rows={2}
                      />
                      <label className="symbol-upload-field">
                        <Upload size={15} aria-hidden="true" />
                        <span>{t("settings.data.uploadImage")}</span>
                        <input
                          type="file"
                          accept="image/svg+xml,image/png,image/jpeg,image/webp,.svg"
                          onChange={(event) => {
                            selectSymbolImage(event.target.files?.[0] || null);
                            event.currentTarget.value = "";
                          }}
                        />
                      </label>
                    </>
                  ) : (
                    <input value={form.sourceUrl} onChange={(event) => update({ sourceUrl: event.target.value })} placeholder={t("settings.data.websitePlaceholder")} />
                  )}
                  <button className="primary-button" disabled={saving}>
                    {saving ? t("vehicles.saving") : editing ? t("vehicles.save") : "+ " + t("settings.data.add")}
                  </button>
                  {editing && (
                    <button type="button" className="icon-button" onClick={startCreate} aria-label={t("vehicles.cancel")} title={t("vehicles.cancel")}>
                      <X size={16} />
                    </button>
                  )}
                </form>

                {isSymbolData && form.imageData && (
                  <div className="symbol-preview-card">
                    <img src={form.imageData} alt="" />
                    <span>{t("settings.data.savedSymbol")}</span>
                    <button type="button" className="icon-button danger" onClick={() => update({ imageData: "" })} aria-label={t("settings.data.removeImage")} title={t("settings.data.removeImage")}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}

                <div className="table-wrap master-data-table">
                  <table>
                    <thead>
                      <tr>
                        <th>{t("settings.data.actions")}</th>
                        {isSymbolData && <th>{t("settings.data.symbol")}</th>}
                        <th>{t("settings.data.name")}</th>
                        {activeType === "manufacturer" && <th>{t("settings.data.nominalScales")}</th>}
                        {!isSymbolData && <th>{t("settings.data.link")}</th>}
                        {isSymbolData && <th>{t("settings.data.description")}</th>}
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr>
                          <td colSpan={masterDataColumnCount} className="loading-cell">Lade aus lokaler Stammdatenbank...</td>
                        </tr>
                      ) : filteredItems.length === 0 ? (
                        <tr>
                          <td colSpan={masterDataColumnCount} className="loading-cell">{t("settings.data.noEntries")}</td>
                        </tr>
                      ) : (
                        filteredItems.map((entry) => {
                          const link = externalLink(entry);
                          const symbolImage = masterDataImage(entry);
                          return (
                            <tr key={entry.id}>
                              <td>
                                <div className="table-actions">
                                  <button type="button" className="icon-button" onClick={() => startEdit(entry)} aria-label={t("vehicles.edit")} title={t("vehicles.edit")}>
                                    <Pencil size={16} />
                                  </button>
                                  <button type="button" className="icon-button danger" onClick={() => deleteEntry(entry)} aria-label={t("vehicles.delete")} title={t("vehicles.delete")}>
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </td>
                              {isSymbolData && (
                                <td>
                                  {symbolImage ? <img className="master-data-symbol-preview" src={symbolImage} alt="" /> : "-"}
                                </td>
                              )}
                              <td><strong>{entry.label}</strong></td>
                              {activeType === "manufacturer" && <td>{nominalScalesText(entry) || "-"}</td>}
                              {!isSymbolData && (
                                <td>
                                  {link ? (
                                    <a className="table-icon-link" href={link.href} target="_blank" rel="noreferrer" aria-label={link.title} title={link.title}>
                                      <ExternalLink size={16} />
                                    </a>
                                  ) : "-"}
                                </td>
                              )}
                              {isSymbolData && <td>{metadataString(entry, "description") || "-"}</td>}
                              <td>
                                {entry.active ? (
                                  <CheckCircle2 className="status-icon active" size={17} aria-label="Aktiv" />
                                ) : (
                                  <span className="status-icon inactive" aria-label="Inaktiv" title="Inaktiv" />
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {message && <p className="form-message">{message}</p>}
            </>
          </section>
        </section>
      )}

      {activeSettingsTab === "importExport" && (
        <section className="panel settings-card import-export-card">
          <div className="settings-card-title">
            <Database size={18} />
            <div>
              <h2>{t("settings.import.title")}</h2>
              <p>{t("settings.import.subtitle")}</p>
            </div>
          </div>

          <section className="backup-box master-data-transfer-box">
            <div className="backup-box-head">
              <div>
                <h3>{t("settings.masterTransfer.title")}</h3>
                <p>{t("settings.masterTransfer.subtitle")}</p>
              </div>
              <div className="box-icon-actions">
                <a className="icon-button" href={api.masterDataExportUrl()} aria-label={t("settings.masterTransfer.download")} title={t("settings.masterTransfer.download")}>
                  <Download size={16} />
                </a>
                <button type="button" className="icon-button" onClick={importMasterData} disabled={masterDataSaving || !masterDataFile} aria-label={t("settings.masterTransfer.upload")} title={t("settings.masterTransfer.upload")}>
                  <Upload size={16} />
                </button>
              </div>
            </div>
            <div className="transfer-actions">
              <label className="file-picker-field">
                <span>{t("settings.masterTransfer.file")}</span>
                <span className="file-picker-shell">
                  <span className="file-picker-button">{t("settings.file.pick")}</span>
                  <span className="file-picker-name">{masterDataFile?.name || t("settings.file.none")}</span>
                </span>
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) => {
                    setMasterDataFile(event.target.files?.[0] || null);
                    setMasterDataMessage("");
                  }}
                />
              </label>
              {masterDataSaving && <span className="inline-status">{t("settings.masterTransfer.saving")}</span>}
            </div>
            {masterDataMessage && <p className="form-message">{masterDataMessage}</p>}
          </section>

          <div className="backup-grid">
            <section className="backup-box">
              <div className="backup-box-head">
                <div>
                  <h3>{t("settings.backup.export.title")}</h3>
                  <p>{t("settings.backup.export.subtitle")}</p>
                </div>
                <a className="icon-button" href={api.backupExportUrl()} aria-label={t("settings.backup.download")} title={t("settings.backup.download")}>
                  <Download size={16} />
                </a>
              </div>
              <div className="backup-summary-strip">
                <span>
                  <strong>{formatBytes(storageUsage?.totalBytes || 0)}</strong>
                  {t("settings.backup.storage")}
                </span>
                <span>
                  <strong>{storageFileCount.toLocaleString("de-DE")}</strong>
                  {t("settings.backup.files")}
                </span>
                <button type="button" className="icon-button" onClick={loadStorageUsage} disabled={storageLoading} aria-label="Speichernutzung aktualisieren" title="Speichernutzung aktualisieren">
                  <RefreshCw size={15} />
                </button>
              </div>
            </section>

            <section className="backup-box warning">
              <div>
                <h3>{t("settings.backup.restore.title")}</h3>
                <p>{t("settings.backup.restore.subtitle")}</p>
              </div>
              <label className="file-picker-field">
                <span>{t("settings.backup.file")}</span>
                <span className="file-picker-shell">
                  <span className="file-picker-button">{t("settings.file.pick")}</span>
                  <span className="file-picker-name">{backupFile?.name || t("settings.file.none")}</span>
                </span>
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) => selectBackupFile(event.target.files?.[0] || null)}
                />
              </label>
              {backupValidating && <p className="backup-validation-status">{t("settings.backup.validating")}</p>}
              {backupValidation && (
                <div className={backupValidation.compatible ? "backup-validation ok" : "backup-validation danger"}>
                  <strong>{backupValidation.compatible ? t("settings.backup.compatible") : t("settings.backup.incompatible")}</strong>
                  <dl>
                    <div>
                      <dt>{t("settings.backup.version")}</dt>
                      <dd>{backupValidation.version || "-"}</dd>
                    </div>
                    <div>
                      <dt>{t("settings.backup.tables")}</dt>
                      <dd>{backupValidation.tableCount}</dd>
                    </div>
                    <div>
                      <dt>{t("settings.backup.rows")}</dt>
                      <dd>{backupValidation.rowCount}</dd>
                    </div>
                    <div>
                      <dt>{t("settings.backup.files")}</dt>
                      <dd>
                        {backupValidation.fileCount} / {formatBytes(backupValidation.fileBytes)}
                      </dd>
                    </div>
                  </dl>
                  {backupValidation.errors.length > 0 && (
                    <div className="backup-validation-list danger">
                      <strong>{t("settings.backup.errors")}</strong>
                      <ul>
                        {backupValidation.errors.map((error) => (
                          <li key={error}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {backupValidation.warnings.length > 0 && (
                    <div className="backup-validation-list warning">
                      <strong>{t("settings.backup.warnings")}</strong>
                      <ul>
                        {backupValidation.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              {backupValidation?.compatible && (
                <label className="backup-confirm-field">
                  {t("settings.backup.confirmLabel")}
                  <span>{t("settings.backup.confirmHelp")}</span>
                  <input
                    value={backupRestoreConfirm}
                    onChange={(event) => setBackupRestoreConfirm(event.target.value)}
                    placeholder="WIEDERHERSTELLEN"
                    autoComplete="off"
                  />
                </label>
              )}
              <button type="button" className="secondary-button danger" onClick={restoreBackup} disabled={backupSaving || backupValidating || !backupValidation?.compatible || !backupRestoreConfirmed}>
                {backupSaving ? (
                    t("settings.backup.restoring")
                ) : (
                  <>
                    <Upload size={17} />
                    {t("settings.backup.restoreButton")}
                  </>
                )}
              </button>
            </section>
          </div>

          <p className="source-note backup-note">
            <ShieldAlert size={16} aria-hidden="true" />
            <span>{t("settings.backup.note")}</span>
          </p>
          {backupMessage && <p className="form-message">{backupMessage}</p>}
        </section>
      )}

      {activeSettingsTab === "appearance" && (
        <section className="panel settings-card settings-tool-card">
          <div className="settings-card-title">
            <Palette size={18} />
            <div>
              <h2>{t("settings.appearance.title")}</h2>
              <p>{t("settings.appearance.subtitle")}</p>
            </div>
          </div>

          <div className="appearance-mode-row" role="radiogroup" aria-label={t("settings.appearance.mode")}>
            <label className={design === "system" ? "appearance-option active" : "appearance-option"}>
              <input type="radio" name="theme" value="system" checked={design === "system"} onChange={() => updateDesign("system")} />
              <span>
                <strong>{t("settings.appearance.system")}</strong>
                <small>{t("settings.appearance.systemHelp")}</small>
              </span>
            </label>
            <label className={design === "light" ? "appearance-option active" : "appearance-option"}>
              <input type="radio" name="theme" value="light" checked={design === "light"} onChange={() => updateDesign("light")} />
              <span>
                <strong>{t("settings.appearance.light")}</strong>
                <small>{t("settings.appearance.lightHelp")}</small>
              </span>
            </label>
            <label className={design === "dark" ? "appearance-option active" : "appearance-option"}>
              <input type="radio" name="theme" value="dark" checked={design === "dark"} onChange={() => updateDesign("dark")} />
              <span>
                <strong>{t("settings.appearance.dark")}</strong>
                <small>{t("settings.appearance.darkHelp")}</small>
              </span>
            </label>
          </div>

          <div className="appearance-config-grid">
            <section className="appearance-config-card">
              <h3>{t("settings.appearance.darkMode")} <span className="settings-pill active">{t("settings.appearance.active")}</span></h3>
              <div className="settings-field-grid compact">
                <label>
                  {t("settings.appearance.background")}
                  <select value={darkBackground} onChange={(event) => setLocalSetting(localSettingKeys.darkBackground, event.target.value, setDarkBackground)}>
                    <option value="neutral">Neutral</option>
                    <option value="warm">Warm</option>
                    <option value="cool">Kühl</option>
                    <option value="oled">OLED Schwarz</option>
                  </select>
                </label>
                <label>
                  {t("settings.appearance.accent")}
                  <select value={darkAccent} onChange={(event) => setLocalSetting(localSettingKeys.darkAccent, event.target.value, setDarkAccent)}>
                    <option value="green">Grün</option>
                    <option value="blue">Blau</option>
                    <option value="gold">Gold</option>
                  </select>
                </label>
                <label>
                  {t("settings.appearance.style")}
                  <select value={darkStyle} onChange={(event) => setLocalSetting(localSettingKeys.darkStyle, event.target.value, setDarkStyle)}>
                    <option value="classic">Klassisch</option>
                    <option value="compact">Kompakt</option>
                    <option value="contrast">Kontrast</option>
                  </select>
                </label>
              </div>
            </section>
            <section className="appearance-config-card">
              <h3>{t("settings.appearance.lightMode")}</h3>
              <div className="settings-field-grid compact">
                <label>
                  {t("settings.appearance.background")}
                  <select value={lightBackground} onChange={(event) => setLocalSetting(localSettingKeys.lightBackground, event.target.value, setLightBackground)}>
                    <option value="neutral">Neutral</option>
                    <option value="warm">Warm</option>
                    <option value="cool">Kühl</option>
                  </select>
                </label>
                <label>
                  {t("settings.appearance.accent")}
                  <select value={lightAccent} onChange={(event) => setLocalSetting(localSettingKeys.lightAccent, event.target.value, setLightAccent)}>
                    <option value="green">Grün</option>
                    <option value="blue">Blau</option>
                    <option value="gold">Gold</option>
                  </select>
                </label>
                <label>
                  {t("settings.appearance.style")}
                  <select value={lightStyle} onChange={(event) => setLocalSetting(localSettingKeys.lightStyle, event.target.value, setLightStyle)}>
                    <option value="classic">Klassisch</option>
                    <option value="compact">Kompakt</option>
                    <option value="contrast">Kontrast</option>
                  </select>
                </label>
              </div>
            </section>
          </div>
        </section>
      )}

      {activeSettingsTab === "auth" && (
        <section className="auth-settings-grid">
          <section className="panel settings-card settings-tool-card auth-status-card">
            <div className="settings-card-title">
              <Shield size={18} />
              <div>
                <h2>{t("settings.auth.title")}</h2>
                <p>{t("settings.auth.subtitle")}</p>
              </div>
            </div>
            <div className="auth-provider-tabs" aria-label={t("settings.auth.provider")}>
              <button type="button" className="active"><Mail size={15} /> E-Mail / Lokal</button>
              <button type="button" disabled><KeyRound size={15} /> Zwei-Faktor-Auth</button>
            </div>
            <div className="auth-status-grid" aria-label={t("settings.auth.status")}>
              <article>
                <span className="settings-pill active">{t("common.active")}</span>
                <strong>{t("settings.auth.local")}</strong>
                <small>{t("settings.auth.localHelp")}</small>
              </article>
              <article>
                <span className="settings-pill">{t("common.roles", { count: currentSession?.roles.length || 0 })}</span>
                <strong>{t("settings.auth.currentSession")}</strong>
                <small>{currentSession?.username ? t("settings.auth.signedInAs", { username: currentSession.username }) : t("settings.auth.loading")}</small>
              </article>
              <article>
                <span className={twoFactorPrepared ? "settings-pill active" : "settings-pill muted"}>{twoFactorPrepared ? t("settings.auth.prepared") : t("settings.auth.open")}</span>
                <strong>{t("settings.auth.twoFactor")}</strong>
                <small>{t("settings.auth.twoFactorHelp")}</small>
              </article>
            </div>
            <label className="settings-toggle-row">
              <span>
                <strong>{t("settings.auth.local")}</strong>
                <small>{t("settings.auth.localToggleHelp")}</small>
              </span>
              <span className="switch-field">
                <input type="checkbox" checked readOnly disabled />
                <span />
              </span>
            </label>
            <label className="settings-toggle-row disabled">
              <span>
                <strong>{t("settings.auth.twoFactorPrepare")}</strong>
                <small>{t("settings.auth.twoFactorPrepareHelp")}</small>
              </span>
              <span className="switch-field">
                <input type="checkbox" checked={twoFactorPrepared} onChange={(event) => setLocalBool(localSettingKeys.twoFactorPrepared, event.target.checked, setTwoFactorPrepared)} />
                <span />
              </span>
            </label>
            {authMessage && <p className="form-message">{authMessage}</p>}
          </section>

          <section className="panel settings-card settings-tool-card">
            <div className="settings-card-title">
              <UserCog size={18} />
              <h2>{t("settings.currentUser")}</h2>
            </div>
            <div className="current-user-card">
              <strong>{currentSession?.username || t("settings.notLoaded")}</strong>
              <div className="role-chip-row">
                {(currentSession?.roles || []).map((role) => <span className="settings-pill" key={role}>{role}</span>)}
                {(!currentSession?.roles || currentSession.roles.length === 0) && <span className="settings-pill muted">{t("common.noRoles")}</span>}
              </div>
              <p>{t("settings.session.refreshHelp")}</p>
              <button type="button" className="secondary-button" onClick={loadCurrentSession}>
                <RefreshCw size={16} />
                {t("settings.session.refresh")}
              </button>
            </div>
            <form className="password-change-form" onSubmit={changePassword}>
              <h3>{t("settings.password.title")}</h3>
              <div className="password-field-grid">
                <label>
                  {t("settings.password.current")}
                  <input
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))}
                    autoComplete="current-password"
                  />
                </label>
                <label>
                  {t("settings.password.new")}
                  <input
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
                    autoComplete="new-password"
                    minLength={12}
                  />
                </label>
                <label>
                  {t("settings.password.confirm")}
                  <input
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                    autoComplete="new-password"
                    minLength={12}
                  />
                </label>
              </div>
              <button type="submit" className="primary-button" disabled={passwordSaving || !passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword}>
                <KeyRound size={16} />
                {t("settings.password.save")}
              </button>
              {passwordMessage && <p className="form-message">{passwordMessage}</p>}
            </form>
          </section>

          <section className="panel settings-card settings-tool-card user-management-card">
            <div className="settings-section-head">
              <div className="settings-card-title">
                <Users size={18} />
                <div>
                  <h2>{t("settings.users.title")}</h2>
                  <p>{t("settings.users.subtitle")}</p>
                </div>
              </div>
              {canManageUsers && (
                <button type="button" className="secondary-button" onClick={startUserCreate}>
                  <UserCog size={16} />
                  {t("settings.users.new")}
                </button>
              )}
            </div>

            {!canManageUsers ? (
              <div className="current-user-card">
                <strong>{t("settings.users.adminRequired")}</strong>
                <span>{t("settings.users.adminHelp")}</span>
              </div>
            ) : (
              <div className="user-management-grid">
                <form className="settings-form user-form" onSubmit={saveUser}>
                  <h3>{editingUser ? t("settings.users.edit") : t("settings.users.create")}</h3>
                  <label>
                    {t("settings.users.username")}
                    <input
                      value={userForm.username}
                      onChange={(event) => setUserForm((current) => ({ ...current, username: event.target.value }))}
                      placeholder={t("settings.users.usernamePlaceholder")}
                    />
                  </label>
                  <label>
                    {t("auth.email")}
                    <input
                      type="email"
                      value={userForm.email}
                      onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))}
                      placeholder={t("settings.users.emailPlaceholder")}
                    />
                  </label>
                  <label>
                    {t("auth.password")}
                    <input
                      type="password"
                      value={userForm.password}
                      onChange={(event) => setUserForm((current) => ({ ...current, password: event.target.value }))}
                      placeholder={editingUser ? t("settings.users.passwordPlaceholderEdit") : t("settings.users.passwordPlaceholderNew")}
                      autoComplete="new-password"
                    />
                  </label>
                  <div className="role-select-grid" aria-label={t("settings.users.roles")}>
                    {availableRoles.map((role) => (
                      <label className="checkbox-field" key={role.id}>
                        <input
                          type="checkbox"
                          checked={userForm.roles.includes(role.name)}
                          onChange={(event) => toggleUserRole(role.name, event.target.checked)}
                        />
                        {role.name}
                      </label>
                    ))}
                  </div>
                  <div className="settings-action-row">
                    <button type="submit" className="primary-button" disabled={userSaving || userForm.roles.length === 0}>
                      {userSaving ? t("vehicles.saving") : t("vehicles.save")}
                    </button>
                    {editingUser && (
                      <button type="button" className="secondary-button" onClick={startUserCreate}>
                        {t("vehicles.cancel")}
                      </button>
                    )}
                  </div>
                </form>

                <div className="table-wrap settings-inline-table user-table">
                  <table>
                    <thead>
                      <tr>
                        <th>{t("settings.users.username")}</th>
                        <th>{t("auth.email")}</th>
                        <th>{t("settings.users.roles")}</th>
                        <th>{t("settings.users.created")}</th>
                        <th>{t("settings.sessions.actions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usersLoading ? (
                        <tr><td colSpan={5} className="loading-cell">{t("settings.users.loading")}</td></tr>
                      ) : users.length === 0 ? (
                        <tr><td colSpan={5} className="loading-cell">{t("settings.users.empty")}</td></tr>
                      ) : (
                        users.map((user) => (
                          <tr key={user.id} className={editingUser?.id === user.id ? "selected-row" : ""}>
                            <td><strong>{user.username}</strong></td>
                            <td>{user.email || "-"}</td>
                            <td>
                              <div className="role-chip-row">
                                {user.roles.map((role) => <span className="settings-pill" key={role}>{role}</span>)}
                              </div>
                            </td>
                            <td>{formatDateTime(user.createdAt)}</td>
                            <td>
                              <div className="table-actions">
                                <button type="button" className="icon-button" onClick={() => startUserEdit(user)} aria-label={t("vehicles.edit")} title={t("vehicles.edit")}>
                                  <Pencil size={16} />
                                </button>
                                <button type="button" className="icon-button danger" onClick={() => deleteUser(user)} aria-label={t("vehicles.delete")} title={t("vehicles.delete")}>
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          <section className="panel settings-card settings-tool-card session-management-card">
            <div className="settings-section-head">
              <div className="settings-card-title">
                <KeyRound size={18} />
                <div>
                  <h2>{t("settings.sessions.title")}</h2>
                  <p>{t("settings.sessions.subtitle")}</p>
                </div>
              </div>
              {canManageUsers && (
                <button type="button" className="icon-button" onClick={loadSessions} disabled={sessionsLoading} aria-label={t("settings.sessions.refresh")} title={t("settings.sessions.refresh")}>
                  <RefreshCw size={16} />
                </button>
              )}
            </div>

            {!canManageUsers ? (
              <div className="current-user-card">
                <strong>{t("settings.users.adminRequired")}</strong>
                <span>{t("settings.sessions.adminHelp")}</span>
              </div>
            ) : (
              <>
                <div className="table-wrap settings-inline-table session-table">
                  <table>
                    <thead>
                      <tr>
                        <th>{t("settings.sessions.user")}</th>
                        <th>{t("settings.sessions.status")}</th>
                        <th>{t("settings.sessions.created")}</th>
                        <th>{t("settings.sessions.expires")}</th>
                        <th>{t("settings.sessions.actions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessionsLoading ? (
                        <tr><td colSpan={5} className="loading-cell">{t("settings.sessions.loading")}</td></tr>
                      ) : sessions.length === 0 ? (
                        <tr><td colSpan={5} className="loading-cell">{t("settings.sessions.empty")}</td></tr>
                      ) : (
                        sessions.map((session) => (
                          <tr key={session.id} className={session.active ? "" : "muted-row"}>
                            <td><strong>{session.username}</strong></td>
                            <td><span className={session.active ? "settings-pill active" : "settings-pill muted"}>{session.active ? t("common.active") : t("settings.sessions.ended")}</span></td>
                            <td>{formatDateTime(session.createdAt)}</td>
                            <td>{session.revokedAt ? t("settings.sessions.revoked", { date: formatDateTime(session.revokedAt) }) : formatDateTime(session.expiresAt)}</td>
                            <td>
                              <button type="button" className="icon-button danger" onClick={() => revokeSession(session)} disabled={!session.active || sessionsLoading} aria-label={t("settings.sessions.revoke")} title={t("settings.sessions.revoke")}>
                                <X size={16} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {sessionsMessage && <p className="form-message">{sessionsMessage}</p>}
              </>
            )}
          </section>

          <section className="panel settings-card settings-tool-card audit-log-card">
            <div className="settings-section-head">
              <div className="settings-card-title">
                <History size={18} />
                <div>
                  <h2>{t("settings.audit.title")}</h2>
                  <p>{t("settings.audit.subtitle")}</p>
                </div>
              </div>
              {canManageUsers && (
                <button type="button" className="icon-button" onClick={loadAuditLog} disabled={auditLogLoading} aria-label={t("settings.audit.refresh")} title={t("settings.audit.refresh")}>
                  <RefreshCw size={16} />
                </button>
              )}
            </div>

            {!canManageUsers ? (
              <div className="current-user-card">
                <strong>{t("settings.users.adminRequired")}</strong>
                <span>{t("settings.audit.adminHelp")}</span>
              </div>
            ) : (
              <>
                <div className="table-wrap settings-inline-table audit-log-table">
                  <table>
                    <thead>
                      <tr>
                        <th>{t("settings.audit.time")}</th>
                        <th>{t("settings.audit.event")}</th>
                        <th>{t("settings.sessions.user")}</th>
                        <th>{t("settings.audit.target")}</th>
                        <th>{t("settings.audit.details")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogLoading ? (
                        <tr><td colSpan={5} className="loading-cell">{t("settings.audit.loading")}</td></tr>
                      ) : auditLog.length === 0 ? (
                        <tr><td colSpan={5} className="loading-cell">{t("settings.audit.empty")}</td></tr>
                      ) : (
                        auditLog.slice(0, 10).map((entry) => (
                          <tr key={entry.id}>
                            <td>{formatDateTime(entry.createdAt)}</td>
                            <td><span className="settings-pill">{auditLabel(entry.action)}</span></td>
                            <td>{auditActor(entry)}</td>
                            <td>{auditTarget(entry)}</td>
                            <td><code>{entry.detailsJson && entry.detailsJson !== "{}" ? entry.detailsJson : "-"}</code></td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {auditLogMessage && <p className="form-message">{auditLogMessage}</p>}
              </>
            )}
          </section>

          <section className="panel settings-card settings-tool-card">
            <div className="settings-section-head">
              <div className="settings-card-title">
                <Users size={18} />
                <h2>{t("settings.roles.title")}</h2>
              </div>
              <span className="settings-pill active">{t("common.active")}</span>
            </div>
            <div className="role-list">
              {(availableRoles.length > 0 ? availableRoles.map((role) => role.name) : ["Admin", "Editor", "Viewer", "Messe"]).map((role) => (
                <article key={role}>
                  <strong>{role}</strong>
                  <span>{roleDescription(role)}</span>
                </article>
              ))}
            </div>
          </section>

          <section className="panel settings-card settings-tool-card">
            <div className="settings-card-title">
              <ShieldAlert size={18} />
              <div>
                <h2>{t("settings.integrations.title")}</h2>
                <p>{t("settings.integrations.subtitle")}</p>
              </div>
            </div>
            <div className="integration-list">
              <article>
                <Shield size={17} />
                <div>
                  <strong>LDAP</strong>
                  <span>{t("settings.integrations.preparedDisabled")}</span>
                </div>
              </article>
              <article>
                <UserCog size={17} />
                <div>
                  <strong>SSO / OIDC</strong>
                  <span>{t("settings.integrations.ssoHelp")}</span>
                </div>
              </article>
            </div>
          </section>
        </section>
      )}

    </>
  );
}
