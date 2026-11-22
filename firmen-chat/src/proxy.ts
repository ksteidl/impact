import { NextResponse, type NextRequest } from "next/server"

// Läuft vor jedem Seitenaufruf: Content-Security-Policy mit Nonce pro Anfrage
// und weitere Sicherheits-Header. Die eigentliche Sitzungsprüfung erfolgt
// serverseitig in den Seiten und API-Routen.
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64")
  const isDev = process.env.NODE_ENV === "development"
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Radix-UI positioniert Popover/Menüs über Inline-Styles
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ")

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("Content-Security-Policy", csp)

  const { pathname } = request.nextUrl
  const hasSession = request.cookies.has("fc_sid")
  const response =
    !hasSession && pathname !== "/login"
      ? NextResponse.redirect(new URL("/login", request.url))
      : NextResponse.next({ request: { headers: requestHeaders } })

  response.headers.set("Content-Security-Policy", csp)
  return response
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
}
