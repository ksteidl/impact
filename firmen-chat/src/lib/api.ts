// Kleiner Fetch-Helfer für den Browser (setzt den CSRF-Header).
export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: Record<string, unknown>) {
    super(message)
  }
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? "GET",
    headers: {
      "X-Requested-With": "firmen-chat",
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
  })
  const data = (res.headers.get("content-type") || "").includes("application/json") ? await res.json() : null
  if (res.status === 401 && !path.startsWith("/api/auth")) {
    window.location.replace("/login")
  }
  if (res.status === 403 && data?.mustChangePassword) window.location.replace("/login?pw=1")
  if (!res.ok) throw new ApiError(res.status, data?.error || `Fehler ${res.status}`, data)
  return data as T
}

export const fmtNumber = (n: number) => new Intl.NumberFormat("de-AT").format(Number(n) || 0)
export const fmtCompact = (n: number) =>
  new Intl.NumberFormat("de-AT", { notation: "compact", maximumFractionDigits: 1 }).format(Number(n) || 0)
export const fmtDate = (ts: number | null | undefined) =>
  ts ? new Date(ts).toLocaleString("de-AT", { dateStyle: "medium", timeStyle: "short" }) : "–"
