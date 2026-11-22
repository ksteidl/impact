import { requirePageUser } from "@/server/http"
import { PoliciesForm } from "@/components/admin/policies-form"
import { getAllSettings } from "@/server/db"

export const metadata = { title: "Richtlinien" }

export default async function PoliciesPage() {
  await requirePageUser(true)
  const settings = getAllSettings()
  return <PoliciesForm key={JSON.stringify(settings)} initial={settings} />
}
