import { json, route } from "@/server/http"
import { meFor } from "@/server/services"

export const GET = route({ allowPendingPassword: true }, ({ user }) =>
  json({ ...meFor(user), mustChangePassword: !!user.must_change_pw })
)
