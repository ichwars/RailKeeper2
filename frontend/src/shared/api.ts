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
  name: string;
  gauge: string;
  epoch?: string;
  railwayCompany?: string;
  category?: string;
  gattung?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateVehicleRequest = {
  inventoryNumber?: string;
  manufacturer: string;
  articleNumber?: string;
  name: string;
  gauge: string;
  epoch?: string;
  railwayCompany?: string;
  category?: string;
  gattung?: string;
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

let csrfToken = "";

function readCookie(name: string): string {
  const prefix = `${name}=`;
  const value = document.cookie
    .split("; ")
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
  return value ? decodeURIComponent(value) : "";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || "GET").toUpperCase();
  const headers: Record<string, string> = {
    ...(!["GET", "HEAD"].includes(method) ? { "Content-Type": "application/json" } : {}),
    ...((init.headers as Record<string, string>) || {})
  };

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const token = csrfToken || readCookie("rk_csrf");
    if (token) {
      headers["X-CSRF-Token"] = token;
    }
  }

  const response = await fetch(`/api/v1${path}`, {
    credentials: "include",
    ...init,
    headers
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
  masterData: (type: string, activeOnly = false) =>
    request<MasterDataEntry[]>(
      `/master-data/${encodeURIComponent(type)}${activeOnly ? "?active=true" : ""}`
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
