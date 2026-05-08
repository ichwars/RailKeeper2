export type SetupStatus = {
  setupRequired: boolean;
};

export type CreateAdminRequest = {
  username: string;
  password: string;
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || "GET").toUpperCase();
  const headers: Record<string, string> = {
    ...(!["GET", "HEAD"].includes(method) ? { "Content-Type": "application/json" } : {}),
    ...((init.headers as Record<string, string>) || {})
  };

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
    })
};
