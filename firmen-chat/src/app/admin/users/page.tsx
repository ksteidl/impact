import { UsersManager } from "@/components/admin/users-manager"
import { listUsers } from "@/server/admin-data"
import { getSetting } from "@/server/db"
import { requirePageUser } from "@/server/http"

export const metadata = { title: "Benutzer" }

export default async function UsersPage() {
  const me = await requirePageUser(true)
  return <UsersManager users={listUsers()} meId={me.id} defaultLimit={Number(getSetting("default_daily_tokens")) || 0} />
}
