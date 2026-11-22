import { requirePageUser } from "@/server/http"
import { ProvidersManager } from "@/components/admin/providers-manager"
import { listProviders } from "@/server/admin-data"

export const metadata = { title: "Anbieter" }

export default async function ProvidersPage() {
  await requirePageUser(true)
  return <ProvidersManager providers={listProviders()} />
}
