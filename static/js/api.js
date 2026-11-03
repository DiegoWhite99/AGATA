export class ApiError extends Error {
    constructor(message, status, campos = {}) {
        super(message);
        this.status = status;
        this.campos = campos;
    }
}
async function request(method, url, body) {
    // El servidor rechaza cualquier cambio que no traiga X-AGATA (protección contra CSRF).
    const init = { method, headers: { "X-AGATA": "1" } };
    if (body instanceof FormData) {
        init.body = body;
    }
    else if (body !== undefined) {
        init.body = JSON.stringify(body);
        init.headers["Content-Type"] = "application/json";
    }
    const res = await fetch(url, init);
    if (res.status === 401 && !location.pathname.startsWith("/login")) {
        // La sesión venció: a iniciar sesión y de vuelta a esta página.
        location.href = `/login?siguiente=${encodeURIComponent(location.pathname + location.search)}`;
    }
    if (res.status === 204)
        return undefined;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new ApiError(data.error ?? `Error ${res.status}`, res.status, data.campos ?? {});
    }
    return data;
}
export const api = {
    get: (url) => request("GET", url),
    post: (url, body) => request("POST", url, body),
    put: (url, body) => request("PUT", url, body),
    patch: (url, body) => request("PATCH", url, body),
    del: (url) => request("DELETE", url),
};
