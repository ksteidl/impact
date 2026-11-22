import { json, route } from "@/server/http"
import { auditLog } from "@/server/stats"

export const GET = route({ admin: true }, ({ req }) =>
  json(auditLog(Number(new URL(req.url).searchParams.get("limit")) || 500))
)
