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
    })
};
