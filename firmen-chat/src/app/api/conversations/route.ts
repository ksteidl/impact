import { run } from "@/server/db"
import { json, route } from "@/server/http"
import { conversationsFor } from "@/server/services"

export const GET = route({}, ({ user }) => json(conversationsFor(user.id)))

export const DELETE = route({}, ({ user }) => {
  run("DELETE FROM conversations WHERE user_id = ?", user.id)
  return json({ ok: true })
})
