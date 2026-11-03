export class ApiError extends Error {
  constructor(message: string, public status: number, public campos: Record<string, string> = {}) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  // El servidor rechaza cualquier cambio que no traiga X-AGATA (protección contra CSRF).
  const init: RequestInit = { method, headers: { "X-AGATA": "1" } };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
  }
  const res = await fetch(url, init);
  if (res.status === 401 && !location.pathname.startsWith("/login")) {
    // La sesión venció: a iniciar sesión y de vuelta a esta página.
    location.href = `/login?siguiente=${encodeURIComponent(location.pathname + location.search)}`;
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error ?? `Error ${res.status}`, res.status, data.campos ?? {});
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body: unknown) => request<T>("POST", url, body),
  put: <T>(url: string, body: unknown) => request<T>("PUT", url, body),
  patch: <T>(url: string, body: unknown) => request<T>("PATCH", url, body),
  del: (url: string) => request<void>("DELETE", url),
};
