import { json, route } from "@/server/http"
import { usageStats } from "@/server/stats"

export const GET = route({ admin: true }, ({ req }) => json(usageStats(new URL(req.url).searchParams.get("days"))))
