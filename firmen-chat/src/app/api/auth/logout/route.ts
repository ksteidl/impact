import { cookies } from "next/headers"
import { SESSION_COOKIE, destroySession } from "@/server/security"
import { json, route } from "@/server/http"

export const POST = route({ public: true }, async () => {
  const store = await cookies()
  destroySession(store.get(SESSION_COOKIE)?.value)
  store.delete(SESSION_COOKIE)
  return json({ ok: true })
})
