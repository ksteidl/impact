import { requirePageUser } from "@/server/http"
import { ModelsManager } from "@/components/admin/models-manager"
import { listModels, listProviders } from "@/server/admin-data"

export const metadata = { title: "Modelle" }

export default async function ModelsPage() {
  await requirePageUser(true)
  return <ModelsManager models={listModels()} providers={listProviders()} />
}
