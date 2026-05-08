export type SetupStatus = {
  setupRequired: boolean;
};

export type CreateAdminRequest = {
  username: string;
  password: string;
};

export type LoginRequest = {
  username: string;
  password: string;
};

export type Session = {
  username: string;
  roles: string[];
  csrfToken: string;
};

export type Vehicle = {
  id: string;
  inventoryNumber: string;
  manufacturer: string;
  articleNumber?: string;
  articleSourceUrl?: string;
  name: string;
  gauge: string;
  epoch?: string;
  railwayCompany?: string;
  category?: string;
  gattung?: string;
  description?: string;
  series?: string;
  vehicleNumber?: string;
  digital: boolean;
  digitalDecoderNumber?: string;
  dtDecoder: boolean;
  dtDecoderNumber?: string;
  exhibitionReady: boolean;
  abcBrakes: boolean;
  ean?: string;
  productionPeriod?: string;
  listPrice?: string;
  lengthMm?: string;
  weightG?: string;
  color?: string;
  lettering?: string;
  load?: string;
  interior?: string;
  axles?: string;
  axleCount?: string;
  tractionTireCount?: string;
  wheelset?: string;
  couplingSame: boolean;
  couplingFront?: string;
  couplingRear?: string;
  powerPickup?: string;
  adapter?: string;
  driveEnabled: boolean;
  driveDescription?: string;
  headlightsEnabled: boolean;
  headlightsDescription?: string;
  lightingEnabled: boolean;
  lightingDescription?: string;
  soundGeneratorEnabled: boolean;
  soundGeneratorDescription?: string;
  smokeGeneratorEnabled: boolean;
  smokeGeneratorDescription?: string;
  additionalInfo?: string;
  qrCodeEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateVehicleRequest = {
  inventoryNumber?: string;
  manufacturer: string;
  articleNumber?: string;
  articleSourceUrl?: string;
  name: string;
  gauge: string;
  epoch?: string;
  railwayCompany?: string;
  category?: string;
  gattung?: string;
  description?: string;
  series?: string;
  vehicleNumber?: string;
  digital?: boolean;
  digitalDecoderNumber?: string;
  dtDecoder?: boolean;
  dtDecoderNumber?: string;
  exhibitionReady?: boolean;
  abcBrakes?: boolean;
  ean?: string;
  productionPeriod?: string;
  listPrice?: string;
  lengthMm?: string;
  weightG?: string;
  color?: string;
  lettering?: string;
  load?: string;
  interior?: string;
  axles?: string;
  axleCount?: string;
  tractionTireCount?: string;
  wheelset?: string;
  couplingSame?: boolean;
  couplingFront?: string;
  couplingRear?: string;
  powerPickup?: string;
  adapter?: string;
  driveEnabled?: boolean;
  driveDescription?: string;
  headlightsEnabled?: boolean;
  headlightsDescription?: string;
  lightingEnabled?: boolean;
  lightingDescription?: string;
  soundGeneratorEnabled?: boolean;
  soundGeneratorDescription?: string;
  smokeGeneratorEnabled?: boolean;
  smokeGeneratorDescription?: string;
  additionalInfo?: string;
  qrCodeEnabled?: boolean;
};

export type MasterDataEntry = {
  id: string;
  type: string;
  key: string;
  label: string;
  active: boolean;
  sortOrder: number;
  sourceUrl?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type MasterDataInput = {
  key?: string;
  label: string;
  active?: boolean;
  sortOrder?: number;
  sourceUrl?: string;
  metadata?: Record<string, unknown>;
};

export type MasterDataRelation = {
  id: string;
  parentType: string;
  parentKey: string;
  childType: string;
  childKey: string;
  sortOrder: number;
};

export type ArticleSearchInput = {
  manufacturer?: string;
  articleNumber?: string;
  name?: string;
  gauge?: string;
  fields?: Record<string, string>;
};

export type ArticleSearchField = {
  label: string;
  value: string;
  confidence: number;
};

export type ArticleSearchResult = {
  source: string;
  title: string;
  url: string;
  snippet: string;
  score: number;
  fields: Record<string, ArticleSearchField>;
  conflicts?: string[];
};

export type ArticleSearchResponse = {
  query: string;
  results: ArticleSearchResult[];
};

let csrfToken = "";

type RequestOptions = {
  retries?: number;
  timeoutMs?: number;
};

function readCookie(name: string): string {
  const prefix = `${name}=`;
  const value = document.cookie
    .split("; ")
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
  return value ? decodeURIComponent(value) : "";
}

async function request<T>(path: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<T> {
  const method = (init.method || "GET").toUpperCase();
  const headers: Record<string, string> = {
    ...(!["GET", "HEAD"].includes(method) ? { "Content-Type": "application/json" } : {}),
    ...((init.headers as Record<string, string>) || {})
  };
  const timeoutMs = options.timeoutMs || 12000;
  const attempts = 1 + (["GET", "HEAD"].includes(method) ? options.retries || 0 : 0);

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const token = csrfToken || readCookie("rk_csrf");
    if (token) {
      headers["X-CSRF-Token"] = token;
    }
  }

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`/api/v1${path}`, {
        credentials: "include",
        ...init,
        headers,
        signal: init.signal || controller.signal
      });

      if (!response.ok) {
        let message = response.statusText;
        try {
          const body = await response.json();
          message = body.message || body.error || message;
        } catch {
          // Keep the HTTP status text when the server did not return JSON.
        }
        throw new Error(message);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return response.json() as Promise<T>;
    } catch (error) {
      if (attempt + 1 < attempts && error instanceof DOMException && error.name === "AbortError") {
        continue;
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error("Die Anfrage hat zu lange gedauert. Bitte erneut versuchen.");
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  throw new Error("Die Anfrage konnte nicht verarbeitet werden.");
}

export const api = {
  setupStatus: () => request<SetupStatus>("/setup/status"),
  createAdmin: (input: CreateAdminRequest) =>
    request<{ status: string }>("/setup/admin", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  login: async (input: LoginRequest) => {
    const session = await request<Session>("/auth/login", {
      method: "POST",
      body: JSON.stringify(input)
    });
    csrfToken = session.csrfToken || readCookie("rk_csrf");
    return session;
  },
  session: async () => {
    const session = await request<Session>("/auth/session");
    csrfToken = session.csrfToken || readCookie("rk_csrf");
    return session;
  },
  logout: async () => {
    await request<void>("/auth/logout", { method: "POST" });
    csrfToken = "";
  },
  vehicles: (query = "") =>
    request<Vehicle[]>(`/vehicles${query ? `?q=${encodeURIComponent(query)}` : ""}`),
  createVehicle: (input: CreateVehicleRequest) =>
    request<Vehicle>("/vehicles", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  vehicle: (id: string) => request<Vehicle>(`/vehicles/${encodeURIComponent(id)}`),
  updateVehicle: (id: string, input: CreateVehicleRequest) =>
    request<Vehicle>(`/vehicles/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input)
    }),
  deleteVehicle: (id: string) =>
    request<void>(`/vehicles/${encodeURIComponent(id)}`, {
      method: "DELETE"
    }),
  articleSearch: (input: ArticleSearchInput) =>
    request<ArticleSearchResponse>(
      "/article-search",
      {
        method: "POST",
        body: JSON.stringify(input)
      },
      { timeoutMs: 15000 }
    ),
  masterData: (type: string, activeOnly = false) =>
    request<MasterDataEntry[]>(
      `/master-data/${encodeURIComponent(type)}${activeOnly ? "?active=true" : ""}`
    ),
  masterDataAll: (activeOnly = false) =>
    request<Record<string, MasterDataEntry[]>>(
      `/master-data-all${activeOnly ? "?active=true" : ""}`,
      {},
      { retries: 1, timeoutMs: 30000 }
    ),
  createMasterData: (type: string, input: MasterDataInput) =>
    request<MasterDataEntry>(`/master-data/${encodeURIComponent(type)}`, {
      method: "POST",
      body: JSON.stringify(input)
    }),
  updateMasterData: (type: string, key: string, input: MasterDataInput) =>
    request<MasterDataEntry>(`/master-data/${encodeURIComponent(type)}/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: JSON.stringify(input)
    }),
  deleteMasterData: (type: string, key: string) =>
    request<void>(`/master-data/${encodeURIComponent(type)}/${encodeURIComponent(key)}`, {
      method: "DELETE"
    }),
  masterDataRelations: (parentType: string, childType: string) =>
    request<MasterDataRelation[]>(
      `/master-data-relations?parentType=${encodeURIComponent(parentType)}&childType=${encodeURIComponent(childType)}`
    )
};
