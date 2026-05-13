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
import { applyThemePreference, readThemePreference, ThemePreference } from "../../shared/theme";

type SettingsTab = "general" | "data" | "importExport" | "appearance" | "auth";
type MasterDataType = {
  type: string;
  label: string;
  description: string;
};

const settingsTabs: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "Allgemein" },
  { id: "data", label: "Daten" },
  { id: "importExport", label: "Import/Export" },
  { id: "appearance", label: "Darstellung" },
  { id: "auth", label: "Authentifizierung" }
];

const masterDataTypes: MasterDataType[] = [
  {
    type: "manufacturer",
    label: "Hersteller",
    description: "Hersteller mit optionaler Nenngröße, Spurweite oder Webseite pflegen."
  },
  {
    type: "vehicle_category",
    label: "Kategorie",
    description: "Fahrzeugkategorien für die Erfassung verwalten."
  },
  {
    type: "vehicle_gattung",
    label: "Gattung",
    description: "Gattungen passend zu den Fahrzeugkategorien pflegen."
  },
  {
    type: "epoch",
    label: "Epoche",
    description: "Epochen für die Fahrzeugauswahl verwalten."
  },
  {
    type: "gauge",
    label: "Spur",
    description: "Spurweiten und Maßstäbe für Dropdowns pflegen."
  },
  {
    type: "railway_company",
    label: "Bahngesellschaft",
    description: "Bahngesellschaften mit Abkürzungen und Zusatzdaten pflegen."
  },
  {
    type: "symbols",
    label: "Symbole",
    description: "Funktionssymbole für Digitalfunktionen verwalten."
  }
];

const loadableMasterDataTypes = masterDataTypes;
const articleSearchSettingKey = "railkeeper.articleSearchEnabled";

const localSettingKeys = {
  language: "railkeeper.settings.language",
  defaultView: "railkeeper.settings.defaultView",
  dateFormat: "railkeeper.settings.dateFormat",
  timeFormat: "railkeeper.settings.timeFormat",
  defaultPrinter: "railkeeper.settings.defaultPrinter",
  updateChecks: "railkeeper.settings.updateChecks",
  betaUpdates: "railkeeper.settings.betaUpdates",
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
const sidebarLabels: Record<AppView, string> = {
  overview: "Übersicht",
  vehicles: "Bestand",
  exhibition: "Messeliste",
  importExport: "Import/Export",
  settings: "Einstellungen"
};

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
  metadataText: "{}"
};

type FormState = typeof emptyForm;

const emptyUserForm = {
  username: "",
  password: "",
  roles: ["Viewer"]
};

type UserFormState = typeof emptyUserForm;

const roleDescriptions: Record<string, string> = {
  Admin: "Vollzugriff auf Einstellungen, Backup und Benutzerverwaltung.",
  Editor: "Bestand, Stammdaten, Wartung, Uploads und CV-Daten bearbeiten.",
  Viewer: "Lesender Zugriff auf Bestand und Stammdaten.",
  Messe: "Zugriff auf Messelisten, Einträge und den späteren Messe-Druck."
};

const auditActionLabels: Record<string, string> = {
  Login: "Anmeldung",
  Logout: "Abmeldung",
  LoginFailed: "Fehlgeschlagene Anmeldung",
  SetupAdminCreated: "Admin eingerichtet",
  UserCreated: "Benutzer angelegt",
  UserUpdated: "Benutzer geändert",
  UserDeleted: "Benutzer gelöscht",
  VehicleCreated: "Fahrzeug angelegt",
  VehicleUpdated: "Fahrzeug geändert",
  VehicleDeleted: "Fahrzeug gelöscht"
};

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

function parseList(text: string) {
  return text
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function applyVisibleMetadata(type: string, metadata: Record<string, unknown>, form: FormState) {
  if (type !== "manufacturer") return metadata;
  const next = { ...metadata };
  const nominalScales = parseList(form.nominalScalesText);
  if (nominalScales.length > 0) {
    next.nominalScales = nominalScales;
  } else {
    delete next.nominalScales;
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
  const [language, setLanguage] = useState(() => readLocalSetting(localSettingKeys.language, "de"));
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
  const [twoFactorPrepared, setTwoFactorPrepared] = useState(() => readLocalBool(localSettingKeys.twoFactorPrepared, false));
  const canManageUsers = Boolean(currentSession?.roles.includes("Admin"));
  const backupRestoreConfirmed = backupRestoreConfirm.trim().toLocaleUpperCase("de-DE") === "WIEDERHERSTELLEN";

  const activeDataType = useMemo(
    () => masterDataTypes.find((item) => item.type === activeType) || masterDataTypes[0],
    [activeType]
  );
  const items = itemsByType[activeType] || [];
  const loading = Boolean(loadingTypes[activeType]);

  const filteredItems = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("de-DE");
    if (!needle) return items;
    return items.filter((entry) =>
      `${entry.label} ${entry.key} ${entry.sourceUrl || ""}`.toLocaleLowerCase("de-DE").includes(needle)
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

  const setLocalSetting = (key: string, value: string, setter: (value: string) => void) => {
    setter(value);
    window.localStorage.setItem(key, value);
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

  const updateDesign = (preference: ThemePreference) => {
    setDesign(preference);
    applyThemePreference(preference);
  };

  const loadVersionInfo = (forceCheck = false) => {
    const shouldCheck = forceCheck || updateChecks;
    setVersionLoading(true);
    setVersionMessage("");
    api
      .version(shouldCheck, betaUpdates)
      .then((info) => {
        setVersionInfo(info);
        setVersionMessage(info.message || `RailKeeper ist erreichbar. Aktuelle Version: ${info.version || "unbekannt"}.`);
      })
      .catch((error: Error) => setVersionMessage(error.message))
      .finally(() => setVersionLoading(false));
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
      .auditLog(50)
      .then((result) => setAuditLog(result.entries))
      .catch((error: Error) => setAuditLogMessage(error.message))
      .finally(() => setAuditLogLoading(false));
  };

  const loadSessions = () => {
    setSessionsLoading(true);
    setSessionsMessage("");
    api
      .sessions()
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

  const startUserCreate = () => {
    setEditingUser(null);
    setUserForm(emptyUserForm);
    setAuthMessage("");
  };

  const startUserEdit = (user: UserAccount) => {
    setEditingUser(user);
    setUserForm({
      username: user.username,
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
      password: userForm.password || undefined,
      roles: userForm.roles
    };
    const action = editingUser ? api.updateUser(editingUser.id, input) : api.createUser(input);

    action
      .then((user) => {
        setEditingUser(user);
        setUserForm({ username: user.username, password: "", roles: user.roles });
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
      sourceUrl: form.sourceUrl,
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
          Einstellungen <span>0.1.0</span>
        </h1>
        <p>Inventarverwaltung für Modellbahnfahrzeuge</p>
      </section>

      <nav className="settings-primary-tabs" aria-label="Einstellungen">
        {settingsTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeSettingsTab === tab.id ? "active" : ""}
            onClick={() => setActiveSettingsTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeSettingsTab === "general" && (
        <section className="settings-dashboard-grid">
          <div className="settings-card-stack">
            <section className="panel settings-card settings-tool-card">
              <div className="settings-section-head">
                <div>
                  <h2>Allgemein</h2>
                  <p>Sprache, Startseite, Datumsformat und Druckausgabe.</p>
                </div>
              </div>
              <div className="settings-field-grid">
                <label>
                  Sprache
                  <select value={language} onChange={(event) => setLocalSetting(localSettingKeys.language, event.target.value, setLanguage)}>
                    <option value="de">Deutsch (German)</option>
                    <option value="en">English (English)</option>
                  </select>
                </label>
                <label>
                  Standardansicht
                  <select value={defaultView} onChange={(event) => setLocalSetting(localSettingKeys.defaultView, event.target.value, setDefaultView)}>
                    <option value="overview">Übersicht</option>
                    <option value="vehicles">Bestand</option>
                    <option value="exhibition">Messeliste</option>
                    <option value="importExport">Import/Export</option>
                    <option value="settings">Einstellungen</option>
                  </select>
                </label>
                <label>
                  Datumsformat
                  <select value={dateFormat} onChange={(event) => setLocalSetting(localSettingKeys.dateFormat, event.target.value, setDateFormat)}>
                    <option value="system">Systemstandard</option>
                    <option value="de">Deutsch: 31.12.2026</option>
                    <option value="iso">ISO: 2026-12-31</option>
                  </select>
                </label>
                <label>
                  Zeitformat
                  <select value={timeFormat} onChange={(event) => setLocalSetting(localSettingKeys.timeFormat, event.target.value, setTimeFormat)}>
                    <option value="system">Systemstandard</option>
                    <option value="24h">24 Stunden</option>
                    <option value="12h">12 Stunden</option>
                  </select>
                </label>
                <label className="settings-field-wide">
                  Standarddrucker
                  <select value={defaultPrinter} onChange={(event) => setLocalSetting(localSettingKeys.defaultPrinter, event.target.value, setDefaultPrinter)}>
                    <option value="system-dialog">Systemdialog / Standarddrucker</option>
                    {(systemPrinters?.printers || []).map((printer) => (
                      <option key={printer.id} value={`printer:${printer.name}`}>
                        {printer.name}{printer.isDefault ? " (Standard)" : ""}
                      </option>
                    ))}
                    <option value="ask">Jedes Mal fragen</option>
                    <option value="pdf">Als PDF speichern</option>
                  </select>
                </label>
              </div>
              <div className="settings-action-row">
                <p>{printerMessage || "RailKeeper nutzt den Browser-Systemdialog. Die konkrete Druckerauswahl kommt vom Betriebssystem."}</p>
                <button type="button" className="secondary-button" onClick={() => window.print()}>
                  <Printer size={17} />
                  Systemdrucker öffnen
                </button>
                <button type="button" className="icon-button" onClick={loadSystemPrinters} aria-label="Systemdrucker aktualisieren" title="Systemdrucker aktualisieren" disabled={printersLoading}>
                  <RefreshCw size={16} />
                </button>
              </div>
              <section className="sidebar-order-box" aria-label="Seitenleisten-Reihenfolge">
                <div>
                  <h3>Seitenleisten-Reihenfolge</h3>
                  <p>Ordnet die Hauptnavigation lokal für diesen Browser.</p>
                </div>
                <div className="sidebar-order-list">
                  {sidebarOrder.map((view, index) => (
                    <div key={view}>
                      <span>{index + 1}</span>
                      <strong>{sidebarLabels[view]}</strong>
                      <button type="button" className="icon-button" onClick={() => moveSidebarItem(view, -1)} disabled={index === 0} aria-label={sidebarLabels[view] + " nach oben"} title="Nach oben">
                        <ChevronUp size={15} />
                      </button>
                      <button type="button" className="icon-button" onClick={() => moveSidebarItem(view, 1)} disabled={index === sidebarOrder.length - 1} aria-label={sidebarLabels[view] + " nach unten"} title="Nach unten">
                        <ChevronDown size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" className="secondary-button compact-action" onClick={resetSidebarOrder}>
                  Zurücksetzen
                </button>
              </section>
            </section>

            <section className="panel settings-card settings-tool-card">
              <div className="settings-section-head">
                <div>
                  <h2>Inventarnummern</h2>
                  <p>Präfixe, laufende Nummern und Stellen je Fahrzeugtyp verwalten.</p>
                </div>
                <button type="button" className="icon-button" onClick={loadInventorySchemes} aria-label="Aktualisieren" title="Aktualisieren" disabled={inventorySchemesLoading}>
                  <RefreshCw size={16} />
                </button>
              </div>

              <div className="table-wrap settings-inline-table">
                <table>
                  <thead>
                    <tr>
                      <th>Kategorie</th>
                      <th>Präfix</th>
                      <th>Nächste Nr.</th>
                      <th>Stellen</th>
                      <th>Aktiv</th>
                      <th>Vorschau</th>
                      <th>Aktion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventorySchemesLoading && inventorySchemes.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="loading-cell">Lade Nummernschemata...</td>
                      </tr>
                    ) : inventorySchemes.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="loading-cell">Keine Nummernschemata gefunden.</td>
                      </tr>
                    ) : (
                      inventorySchemes.map((scheme) => (
                        <tr key={scheme.id}>
                          <td><strong>{scheme.category}</strong></td>
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
                            <label className="switch-field" aria-label={scheme.category + " aktiv"}>
                              <input type="checkbox" checked={scheme.active} onChange={(event) => updateInventoryScheme(scheme.category, { active: event.target.checked })} />
                              <span />
                            </label>
                          </td>
                          <td><code>{scheme.preview}</code></td>
                          <td>
                            <button type="button" className="secondary-button compact-action" onClick={() => saveInventoryScheme(scheme)}>
                              Speichern
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
                <h2>Artikeldaten-Websuche</h2>
              </div>
              <label className="settings-toggle-row">
                <span>
                  <strong>Websuche aktiv</strong>
                  <small>Erlaubt die Suche nach externen Artikeldaten und Bildern.</small>
                </span>
                <span className="switch-field">
                  <input type="checkbox" checked={articleSearchEnabled} onChange={(event) => updateArticleSearchEnabled(event.target.checked)} />
                  <span />
                </span>
              </label>
            </section>

            <section className="panel settings-card settings-tool-card">
              <div className="settings-card-title">
                <RefreshCw size={17} />
                <h2>Updates</h2>
              </div>
              <label className="settings-toggle-row">
                <span>
                  <strong>Nach Updates suchen</strong>
                  <small>Prüft die lokale RailKeeper-Version.</small>
                </span>
                <span className="switch-field">
                  <input type="checkbox" checked={updateChecks} onChange={(event) => setLocalBool(localSettingKeys.updateChecks, event.target.checked, setUpdateChecks)} />
                  <span />
                </span>
              </label>
              <label className="settings-toggle-row">
                <span>
                  <strong>Beta-Versionen einschließen</strong>
                  <small>Der aktive Kanal prüft stabile GitHub-Releases. Beta-Kanal folgt später.</small>
                </span>
                <span className="switch-field">
                  <input type="checkbox" checked={betaUpdates} onChange={(event) => setLocalBool(localSettingKeys.betaUpdates, event.target.checked, setBetaUpdates)} disabled />
                  <span />
                </span>
              </label>
              <div className="settings-action-row">
                <p>
                  Aktuelle Version: <strong>{versionInfo?.version || "unbekannt"}</strong>
                  {versionInfo?.latestVersion && <> · Neueste Version: <strong>{versionInfo.latestVersion}</strong></>}
                </p>
                {versionInfo?.status && (
                  <span className={`settings-pill ${versionInfo.updateAvailable ? "active" : versionInfo.status === "unavailable" ? "muted" : ""}`}>
                    {versionInfo.updateAvailable ? "Update verfügbar" : versionInfo.status === "current" ? "aktuell" : versionInfo.status === "not_configured" ? "lokal" : versionInfo.status === "unavailable" ? "offline" : "lokal"}
                  </span>
                )}
                <button type="button" className="secondary-button" onClick={() => loadVersionInfo(true)} disabled={versionLoading}>
                  <RefreshCw size={17} />
                  {versionLoading ? "Prüft..." : "Jetzt prüfen"}
                </button>
              </div>
              {versionInfo?.releaseUrl && (
                <a className="settings-link-row" href={versionInfo.releaseUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={15} />
                  Release öffnen
                </a>
              )}
              {versionMessage && <p className="form-message">{versionMessage}</p>}
            </section>

            <section className="panel settings-card settings-tool-card">
              <div className="settings-section-head">
                <div className="settings-card-title">
                  <HardDrive size={17} />
                  <h2>Speichernutzung</h2>
                </div>
                <button type="button" className="icon-button" onClick={loadStorageUsage} aria-label="Speichernutzung aktualisieren" title="Aktualisieren" disabled={storageLoading}>
                  <RefreshCw size={16} />
                </button>
              </div>
              <p>Aufschlüsselung der lokalen Datenablage nach Kategorie.</p>
              <div className="storage-total">
                <strong>{formatBytes(storageUsage?.totalBytes || 0)}</strong>
                <span>{storageUsage?.updatedAt ? "Aktualisiert " + formatDateTime(storageUsage.updatedAt) : "Noch nicht aktualisiert"}</span>
              </div>
              <div className="storage-list">
                {(storageUsage?.categories || []).map((category) => {
                  const percent = storageUsage?.totalBytes ? Math.round((category.bytes / storageUsage.totalBytes) * 100) : 0;
                  return (
                    <div className="storage-row" key={category.key}>
                      <div>
                        <strong>{category.label}</strong>
                        <span>{category.files} Dateien · {formatBytes(category.bytes)}</span>
                      </div>
                      <div className="storage-bar" aria-label={category.label + ": " + percent + "%"}>
                        <span style={{ width: Math.max(2, percent) + "%" }} />
                      </div>
                    </div>
                  );
                })}
                {storageLoading && <p className="empty-state compact">Speichernutzung wird gelesen...</p>}
                {!storageLoading && !storageUsage && <p className="empty-state compact">Noch keine Speichernutzung geladen.</p>}
              </div>
              {storageMessage && <p className="form-message">{storageMessage}</p>}
            </section>
          </aside>
        </section>
      )}

      {activeSettingsTab === "data" && (
        <section className="panel settings-card data-card">
          <h2>Daten</h2>
          <p>Pflege hier die Auswahlwerte für Dropdowns und Symbol-Listen.</p>

          <nav className="settings-secondary-tabs" aria-label="Stammdaten">
            {masterDataTypes.map((item) => (
              <button
                key={item.type}
                type="button"
                className={item.type === activeType ? "active" : ""}
                onClick={() => setActiveType(item.type)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <section className="master-data-panel">
            <div className="master-data-head">
              <div>
                <h3>{activeDataType.label} verwalten</h3>
                <p>{activeDataType.description}</p>
              </div>
              <button type="button" className="icon-button" onClick={reloadActiveType} aria-label="Aktualisieren" title="Aktualisieren" disabled={loading}>
                <RefreshCw size={16} />
              </button>
            </div>

            <>
              <label className="settings-search">
                Suche
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Stammdaten durchsuchen" />
              </label>

                <form className={activeType === "manufacturer" ? "master-data-create manufacturer-create" : "master-data-create"} onSubmit={submit}>
                  <strong>{editing ? "Eintrag bearbeiten" : "Neuer Eintrag"}</strong>
                  <input value={form.label} onChange={(event) => update({ label: event.target.value })} placeholder={`${activeDataType.label} eintragen`} required />
                  {activeType === "manufacturer" && (
                    <input
                      value={form.nominalScalesText}
                      onChange={(event) => update({ nominalScalesText: event.target.value })}
                      placeholder="Nenngröße / Spurweite, z. B. H0, TT, 1:87"
                    />
                  )}
                  <input value={form.sourceUrl} onChange={(event) => update({ sourceUrl: event.target.value })} placeholder="Webseite optional" />
                  <button className="primary-button" disabled={saving}>
                    {saving ? "Speichert..." : editing ? "Speichern" : "+ Hinzufügen"}
                  </button>
                  {editing && (
                    <button type="button" className="icon-button" onClick={startCreate} aria-label="Abbrechen" title="Abbrechen">
                      <X size={16} />
                    </button>
                  )}
                </form>

                <details className="advanced-master-data">
                  <summary>Erweiterte Felder</summary>
                  <form className="settings-form" onSubmit={submit}>
                    <div className="form-row">
                      <label>
                        Schlüssel
                        <input value={form.key} onChange={(event) => update({ key: event.target.value })} disabled={Boolean(editing)} />
                      </label>
                      <label>
                        Sortierung
                        <input type="number" value={form.sortOrder} onChange={(event) => update({ sortOrder: Number(event.target.value) })} />
                      </label>
                    </div>
                    <label className="checkbox-field">
                      <input type="checkbox" checked={form.active} onChange={(event) => update({ active: event.target.checked })} />
                      Aktiv
                    </label>
                    {message && <p className="form-message">{message}</p>}
                  </form>
                </details>

                <div className="table-wrap master-data-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Aktionen</th>
                        <th>Name</th>
                        {activeType === "manufacturer" && <th>Nenngröße / Spurweite</th>}
                        <th>Link</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr>
                          <td colSpan={activeType === "manufacturer" ? 5 : 4} className="loading-cell">Lade aus lokaler Stammdatenbank...</td>
                        </tr>
                      ) : filteredItems.length === 0 ? (
                        <tr>
                          <td colSpan={activeType === "manufacturer" ? 5 : 4} className="loading-cell">Keine Einträge gefunden.</td>
                        </tr>
                      ) : (
                        filteredItems.map((entry) => {
                          const link = externalLink(entry);
                          return (
                            <tr key={entry.id}>
                              <td>
                                <div className="table-actions">
                                  <button type="button" className="icon-button" onClick={() => startEdit(entry)} aria-label="Bearbeiten" title="Bearbeiten">
                                    <Pencil size={16} />
                                  </button>
                                  <button type="button" className="icon-button danger" onClick={() => deleteEntry(entry)} aria-label="Löschen" title="Löschen">
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </td>
                              <td><strong>{entry.label}</strong></td>
                              {activeType === "manufacturer" && <td>{nominalScalesText(entry) || "-"}</td>}
                              <td>
                                {link ? (
                                  <a className="table-icon-link" href={link.href} target="_blank" rel="noreferrer" aria-label={link.title} title={link.title}>
                                    <ExternalLink size={16} />
                                  </a>
                                ) : "-"}
                              </td>
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
          <h2>Import/Export</h2>
          <p>Daten gezielt sichern, austauschen oder vollständig wiederherstellen.</p>

          <section className="backup-box master-data-transfer-box">
            <div>
              <h3>Stammdaten importieren/exportieren</h3>
              <p>Exportiert nur Hersteller, Kategorien, Gattungen, Epochen, Spuren, Bahngesellschaften, Symbole und deren Abhängigkeiten. Bestand, Bilder, Wartung und Benutzer bleiben außen vor.</p>
            </div>
            <div className="transfer-actions">
              <a className="primary-button" href={api.masterDataExportUrl()}>
                <Download size={17} />
                Stammdaten herunterladen
              </a>
              <label className="backup-file-field">
                Stammdaten-Datei
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) => {
                    setMasterDataFile(event.target.files?.[0] || null);
                    setMasterDataMessage("");
                  }}
                />
              </label>
              <button type="button" className="secondary-button" onClick={importMasterData} disabled={masterDataSaving || !masterDataFile}>
                {masterDataSaving ? (
                  "Wird importiert..."
                ) : (
                  <>
                    <Upload size={17} />
                    Stammdaten einspielen
                  </>
                )}
              </button>
            </div>
            {masterDataMessage && <p className="form-message">{masterDataMessage}</p>}
          </section>

          <div className="backup-grid">
            <section className="backup-box">
              <div>
                <h3>Backup exportieren</h3>
                <p>Erstellt eine JSON-Datei mit allen RailKeeper-Daten und lokal gespeicherten Uploads. Benutzerkonten und Sitzungen werden nicht exportiert.</p>
              </div>
              <a className="primary-button" href={api.backupExportUrl()}>
                <Download size={17} />
                Backup herunterladen
              </a>
            </section>

            <section className="backup-box warning">
              <div>
                <h3>Backup wiederherstellen</h3>
                <p>Ersetzt lokale App-Daten und Uploads durch den Inhalt der Backup-Datei. Bitte vorher ein aktuelles Backup exportieren.</p>
              </div>
              <label className="backup-file-field">
                Backup-Datei
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) => selectBackupFile(event.target.files?.[0] || null)}
                />
              </label>
              {backupValidating && <p className="backup-validation-status">Backup wird geprüft...</p>}
              {backupValidation && (
                <div className={backupValidation.compatible ? "backup-validation ok" : "backup-validation danger"}>
                  <strong>{backupValidation.compatible ? "Backup ist kompatibel" : "Backup ist nicht kompatibel"}</strong>
                  <dl>
                    <div>
                      <dt>Version</dt>
                      <dd>{backupValidation.version || "-"}</dd>
                    </div>
                    <div>
                      <dt>Tabellen</dt>
                      <dd>{backupValidation.tableCount}</dd>
                    </div>
                    <div>
                      <dt>Datensätze</dt>
                      <dd>{backupValidation.rowCount}</dd>
                    </div>
                    <div>
                      <dt>Dateien</dt>
                      <dd>
                        {backupValidation.fileCount} / {formatBytes(backupValidation.fileBytes)}
                      </dd>
                    </div>
                  </dl>
                  {backupValidation.errors.length > 0 && (
                    <ul>
                      {backupValidation.errors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  )}
                  {backupValidation.warnings.length > 0 && (
                    <ul>
                      {backupValidation.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {backupValidation?.compatible && (
                <label className="backup-confirm-field">
                  Restore freigeben
                  <span>Zum Einspielen bitte WIEDERHERSTELLEN eingeben.</span>
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
                  "Wird wiederhergestellt..."
                ) : (
                  <>
                    <Upload size={17} />
                    Backup einspielen
                  </>
                )}
              </button>
            </section>
          </div>

          <p className="source-note backup-note">
            <ShieldAlert size={16} aria-hidden="true" />
            <span>Restore ist absichtlich Admin-geschützt und ersetzt Daten. Der Export enthält keine Passworthashes.</span>
          </p>
          {backupMessage && <p className="form-message">{backupMessage}</p>}
        </section>
      )}

      {activeSettingsTab === "appearance" && (
        <section className="panel settings-card settings-tool-card">
          <div className="settings-card-title">
            <Palette size={18} />
            <div>
              <h2>Darstellung</h2>
              <p>Design-Optionen und Anzeigeeinstellungen werden hier gebündelt.</p>
            </div>
          </div>

          <div className="appearance-mode-row" role="radiogroup" aria-label="Designmodus">
            <label className={design === "system" ? "appearance-option active" : "appearance-option"}>
              <input type="radio" name="theme" value="system" checked={design === "system"} onChange={() => updateDesign("system")} />
              <span>
                <strong>System</strong>
                <small>Übernimmt Hell/Dunkel vom Betriebssystem.</small>
              </span>
            </label>
            <label className={design === "light" ? "appearance-option active" : "appearance-option"}>
              <input type="radio" name="theme" value="light" checked={design === "light"} onChange={() => updateDesign("light")} />
              <span>
                <strong>Hell</strong>
                <small>Ruhige helle Oberfläche für Tagesbetrieb.</small>
              </span>
            </label>
            <label className={design === "dark" ? "appearance-option active" : "appearance-option"}>
              <input type="radio" name="theme" value="dark" checked={design === "dark"} onChange={() => updateDesign("dark")} />
              <span>
                <strong>Dunkel</strong>
                <small>Reduzierte Helligkeit für längere Arbeitssitzungen.</small>
              </span>
            </label>
          </div>

          <div className="appearance-config-grid">
            <section className="appearance-config-card">
              <h3>Dunkelmodus <span className="settings-pill active">aktiv</span></h3>
              <div className="settings-field-grid compact">
                <label>
                  Hintergrund
                  <select value={darkBackground} onChange={(event) => setLocalSetting(localSettingKeys.darkBackground, event.target.value, setDarkBackground)}>
                    <option value="neutral">Neutral</option>
                    <option value="warm">Warm</option>
                    <option value="cool">Kühl</option>
                    <option value="oled">OLED Schwarz</option>
                  </select>
                </label>
                <label>
                  Akzent
                  <select value={darkAccent} onChange={(event) => setLocalSetting(localSettingKeys.darkAccent, event.target.value, setDarkAccent)}>
                    <option value="green">Grün</option>
                    <option value="blue">Blau</option>
                    <option value="gold">Gold</option>
                  </select>
                </label>
                <label>
                  Stil
                  <select value={darkStyle} onChange={(event) => setLocalSetting(localSettingKeys.darkStyle, event.target.value, setDarkStyle)}>
                    <option value="classic">Klassisch</option>
                    <option value="compact">Kompakt</option>
                    <option value="contrast">Kontrast</option>
                  </select>
                </label>
              </div>
            </section>
            <section className="appearance-config-card">
              <h3>Hellmodus</h3>
              <div className="settings-field-grid compact">
                <label>
                  Hintergrund
                  <select value={lightBackground} onChange={(event) => setLocalSetting(localSettingKeys.lightBackground, event.target.value, setLightBackground)}>
                    <option value="neutral">Neutral</option>
                    <option value="warm">Warm</option>
                    <option value="cool">Kühl</option>
                  </select>
                </label>
                <label>
                  Akzent
                  <select value={lightAccent} onChange={(event) => setLocalSetting(localSettingKeys.lightAccent, event.target.value, setLightAccent)}>
                    <option value="green">Grün</option>
                    <option value="blue">Blau</option>
                    <option value="gold">Gold</option>
                  </select>
                </label>
                <label>
                  Stil
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
                <h2>Authentifizierung</h2>
                <p>Ihre Instanz ist mit lokaler Benutzeranmeldung geschützt.</p>
              </div>
            </div>
            <div className="auth-provider-tabs" aria-label="Authentifizierungsarten">
              <button type="button" className="active"><Mail size={15} /> E-Mail / Lokal</button>
              <button type="button" disabled><Shield size={15} /> LDAP</button>
              <button type="button" disabled><KeyRound size={15} /> Zwei-Faktor-Auth</button>
              <button type="button" disabled><UserCog size={15} /> SSO / OIDC</button>
            </div>
            <div className="auth-status-grid" aria-label="Authentifizierungsstatus">
              <article>
                <span className="settings-pill active">aktiv</span>
                <strong>Lokale Anmeldung</strong>
                <small>Benutzername, Passwort und CSRF-Schutz sind aktiv.</small>
              </article>
              <article>
                <span className="settings-pill">{currentSession?.roles.length || 0} Rollen</span>
                <strong>Aktuelle Sitzung</strong>
                <small>{currentSession?.username ? `Angemeldet als ${currentSession.username}` : "Sitzung wird geladen."}</small>
              </article>
              <article>
                <span className={twoFactorPrepared ? "settings-pill active" : "settings-pill muted"}>{twoFactorPrepared ? "vorgemerkt" : "offen"}</span>
                <strong>Zwei-Faktor-Auth</strong>
                <small>Vorbereitung sichtbar, Backend-Erzwingung noch nicht aktiv.</small>
              </article>
            </div>
            <label className="settings-toggle-row">
              <span>
                <strong>Lokale Anmeldung</strong>
                <small>Benutzername und Passwort über RailKeeper.</small>
              </span>
              <span className="switch-field">
                <input type="checkbox" checked readOnly disabled />
                <span />
              </span>
            </label>
            <label className="settings-toggle-row disabled">
              <span>
                <strong>Zwei-Faktor-Auth vorbereiten</strong>
                <small>UI-Vormerkung. Backend-Erzwingung folgt in einem späteren Schritt.</small>
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
              <h2>Aktueller Benutzer</h2>
            </div>
            <div className="current-user-card">
              <strong>{currentSession?.username || "Nicht geladen"}</strong>
              <div className="role-chip-row">
                {(currentSession?.roles || []).map((role) => <span className="settings-pill" key={role}>{role}</span>)}
                {(!currentSession?.roles || currentSession.roles.length === 0) && <span className="settings-pill muted">Keine Rollen</span>}
              </div>
              <button type="button" className="secondary-button" onClick={loadCurrentSession}>Sitzung prüfen</button>
            </div>
          </section>

          <section className="panel settings-card settings-tool-card user-management-card">
            <div className="settings-section-head">
              <div className="settings-card-title">
                <Users size={18} />
                <div>
                  <h2>Benutzerverwaltung</h2>
                  <p>Lokale Benutzer anlegen, Rollen vergeben und Messe-Zugriff steuern.</p>
                </div>
              </div>
              {canManageUsers && (
                <button type="button" className="secondary-button" onClick={startUserCreate}>
                  <UserCog size={16} />
                  Neuer Benutzer
                </button>
              )}
            </div>

            {!canManageUsers ? (
              <div className="current-user-card">
                <strong>Admin erforderlich</strong>
                <span>Nur Admins dürfen Benutzer anlegen, Rollen ändern oder Konten löschen.</span>
              </div>
            ) : (
              <div className="user-management-grid">
                <form className="settings-form user-form" onSubmit={saveUser}>
                  <h3>{editingUser ? "Benutzer bearbeiten" : "Benutzer anlegen"}</h3>
                  <label>
                    Benutzername
                    <input
                      value={userForm.username}
                      onChange={(event) => setUserForm((current) => ({ ...current, username: event.target.value }))}
                      placeholder="z. B. messe-leipzig"
                    />
                  </label>
                  <label>
                    Passwort
                    <input
                      type="password"
                      value={userForm.password}
                      onChange={(event) => setUserForm((current) => ({ ...current, password: event.target.value }))}
                      placeholder={editingUser ? "Leer lassen, um es nicht zu ändern" : "Mindestens 12 Zeichen"}
                      autoComplete="new-password"
                    />
                  </label>
                  <div className="role-select-grid" aria-label="Rollen">
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
                      {userSaving ? "Speichert..." : "Speichern"}
                    </button>
                    {editingUser && (
                      <button type="button" className="secondary-button" onClick={startUserCreate}>
                        Abbrechen
                      </button>
                    )}
                  </div>
                </form>

                <div className="table-wrap settings-inline-table user-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Benutzer</th>
                        <th>Rollen</th>
                        <th>Angelegt</th>
                        <th>Aktionen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usersLoading ? (
                        <tr><td colSpan={4} className="loading-cell">Benutzer werden geladen...</td></tr>
                      ) : users.length === 0 ? (
                        <tr><td colSpan={4} className="loading-cell">Keine Benutzer gefunden.</td></tr>
                      ) : (
                        users.map((user) => (
                          <tr key={user.id} className={editingUser?.id === user.id ? "selected-row" : ""}>
                            <td><strong>{user.username}</strong></td>
                            <td>
                              <div className="role-chip-row">
                                {user.roles.map((role) => <span className="settings-pill" key={role}>{role}</span>)}
                              </div>
                            </td>
                            <td>{formatDateTime(user.createdAt)}</td>
                            <td>
                              <div className="table-actions">
                                <button type="button" className="icon-button" onClick={() => startUserEdit(user)} aria-label="Bearbeiten" title="Bearbeiten">
                                  <Pencil size={16} />
                                </button>
                                <button type="button" className="icon-button danger" onClick={() => deleteUser(user)} aria-label="Löschen" title="Löschen">
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
                  <h2>Sitzungen</h2>
                  <p>Aktive lokale Anmeldungen prüfen und bei Bedarf widerrufen.</p>
                </div>
              </div>
              {canManageUsers && (
                <button type="button" className="icon-button" onClick={loadSessions} disabled={sessionsLoading} aria-label="Sitzungen aktualisieren" title="Sitzungen aktualisieren">
                  <RefreshCw size={16} />
                </button>
              )}
            </div>

            {!canManageUsers ? (
              <div className="current-user-card">
                <strong>Admin erforderlich</strong>
                <span>Nur Admins dürfen Sitzungen einsehen oder widerrufen.</span>
              </div>
            ) : (
              <>
                <div className="table-wrap settings-inline-table session-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Benutzer</th>
                        <th>Status</th>
                        <th>Erstellt</th>
                        <th>Ablauf</th>
                        <th>Aktionen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessionsLoading ? (
                        <tr><td colSpan={5} className="loading-cell">Sitzungen werden geladen...</td></tr>
                      ) : sessions.length === 0 ? (
                        <tr><td colSpan={5} className="loading-cell">Keine Sitzungen gefunden.</td></tr>
                      ) : (
                        sessions.map((session) => (
                          <tr key={session.id} className={session.active ? "" : "muted-row"}>
                            <td><strong>{session.username}</strong></td>
                            <td><span className={session.active ? "settings-pill active" : "settings-pill muted"}>{session.active ? "aktiv" : "beendet"}</span></td>
                            <td>{formatDateTime(session.createdAt)}</td>
                            <td>{session.revokedAt ? "Widerrufen " + formatDateTime(session.revokedAt) : formatDateTime(session.expiresAt)}</td>
                            <td>
                              <button type="button" className="icon-button danger" onClick={() => revokeSession(session)} disabled={!session.active || sessionsLoading} aria-label="Sitzung widerrufen" title="Sitzung widerrufen">
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
                  <h2>Sicherheitsereignisse</h2>
                  <p>Letzte Anmeldungen, Benutzeraktionen und sicherheitsrelevante Änderungen.</p>
                </div>
              </div>
              {canManageUsers && (
                <button type="button" className="icon-button" onClick={loadAuditLog} disabled={auditLogLoading} aria-label="Ereignisse aktualisieren" title="Ereignisse aktualisieren">
                  <RefreshCw size={16} />
                </button>
              )}
            </div>

            {!canManageUsers ? (
              <div className="current-user-card">
                <strong>Admin erforderlich</strong>
                <span>Nur Admins dürfen Sicherheitsereignisse einsehen.</span>
              </div>
            ) : (
              <>
                <div className="table-wrap settings-inline-table audit-log-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Zeit</th>
                        <th>Ereignis</th>
                        <th>Benutzer</th>
                        <th>Ziel</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogLoading ? (
                        <tr><td colSpan={5} className="loading-cell">Ereignisse werden geladen...</td></tr>
                      ) : auditLog.length === 0 ? (
                        <tr><td colSpan={5} className="loading-cell">Keine Ereignisse gefunden.</td></tr>
                      ) : (
                        auditLog.map((entry) => (
                          <tr key={entry.id}>
                            <td>{formatDateTime(entry.createdAt)}</td>
                            <td><span className="settings-pill">{auditActionLabels[entry.action] || entry.action}</span></td>
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
                <h2>Rollen</h2>
              </div>
              <span className="settings-pill active">aktiv</span>
            </div>
            <div className="role-list">
              {(availableRoles.length > 0 ? availableRoles.map((role) => role.name) : ["Admin", "Editor", "Viewer", "Messe"]).map((role) => (
                <article key={role}>
                  <strong>{role}</strong>
                  <span>{roleDescriptions[role] || "Individuelle lokale Rolle."}</span>
                </article>
              ))}
            </div>
          </section>

          <section className="panel settings-card settings-tool-card">
            <h2>Geplante Integrationen</h2>
            <div className="integration-list">
              <article>
                <strong>LDAP</strong>
                <span>Vorbereitet, aktuell deaktiviert.</span>
              </article>
              <article>
                <strong>SSO / OIDC</strong>
                <span>Für spätere zentrale Anmeldung vorgemerkt.</span>
              </article>
              <article>
                <strong>Passwort zurücksetzen</strong>
                <span>Login-Hinweis vorhanden, Mail-Flow noch nicht aktiviert.</span>
              </article>
            </div>
          </section>
        </section>
      )}

    </>
  );
}
