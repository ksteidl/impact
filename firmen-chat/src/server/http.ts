import "server-only"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { SESSION_COOKIE, SESSION_HOURS, getSessionUser, type User } from "./security"

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra: Record<string, unknown> = {}
  ) {
    super(message)
  }
}

export const bad = (msg: string) => new HttpError(400, msg)

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } })
}

const TRUST_PROXY = Number(process.env.TRUST_PROXY) || 0

/** Client-IP: Next.js hängt die Socket-Adresse an X-Forwarded-For an; vertrauenswürdige Proxys davor werden übersprungen. */
export function clientIp(req: Request) {
  const list = (req.headers.get("x-forwarded-for") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  if (!list.length) return ""
  return list[Math.max(0, list.length - 1 - TRUST_PROXY)]
}

export function isSecure(req: Request) {
  if (new URL(req.url).protocol === "https:") return true
  return TRUST_PROXY > 0 && req.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https"
}

export function sessionCookie(req: Request, token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "strict" as const,
    secure: isSecure(req),
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  }
}

/** CSRF-Schutz: zustandsändernde Anfragen nur als JSON, mit eigenem Header und von der eigenen Origin. */
function checkCsrf(req: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return
  const type = req.headers.get("content-type") || ""
  if (req.method !== "DELETE" && !type.startsWith("application/json")) throw new HttpError(415, "Nur JSON-Anfragen erlaubt.")
  if (req.headers.get("x-requested-with") !== "firmen-chat") throw new HttpError(403, "Fehlender Anfrage-Header.")
  const origin = req.headers.get("origin")
  if (origin) {
    const host = (TRUST_PROXY && req.headers.get("x-forwarded-host")) || req.headers.get("host")
    let originHost = ""
    try {
      originHost = new URL(origin).host
    } catch {}
    if (originHost !== host) throw new HttpError(403, "Ungültige Herkunft der Anfrage.")
  }
}

export async function currentUser(): Promise<User | null> {
  const store = await cookies()
  return getSessionUser(store.get(SESSION_COOKIE)?.value)
}

type Ctx<P> = { req: Request; user: User; params: P; ip: string }
type Opts = { admin?: boolean; allowPendingPassword?: boolean; public?: boolean }

/** Wrapper für Route-Handler: Authentifizierung, Rollenprüfung, CSRF und einheitliche Fehler. */
export function route<P = Record<string, string>>(
  opts: Opts,
  fn: (ctx: Ctx<P>) => Promise<Response> | Response
) {
  return async (req: Request, context: { params: Promise<P> }) => {
    try {
      checkCsrf(req)
      const params = (await context?.params) ?? ({} as P)
      const user = (opts.public ? null : await currentUser()) as User
      if (!opts.public) {
        if (!user) throw new HttpError(401, "Nicht angemeldet.")
        if (user.must_change_pw && !opts.allowPendingPassword)
          throw new HttpError(403, "Bitte zuerst das Passwort ändern.", { mustChangePassword: true })
        if (opts.admin && user.role !== "admin") throw new HttpError(403, "Nur für Administratoren.")
      }
      return await fn({ req, user, params, ip: clientIp(req) })
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, ...e.extra }, e.status)
      console.error(e)
      return json({ error: "Interner Serverfehler." }, 500)
    }
  }
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T
  } catch {
    throw bad("Ungültiger JSON-Inhalt.")
  }
}

/** Für Server-Komponenten: angemeldeten Benutzer holen oder zur Anmeldung umleiten. */
export async function requirePageUser(admin = false) {
  const user = await currentUser()
  if (!user) redirect("/login")
  if (user.must_change_pw) redirect("/login?pw=1")
  if (admin && user.role !== "admin") redirect("/")
  return user
}
