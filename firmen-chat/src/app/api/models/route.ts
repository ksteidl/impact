import { json, route } from "@/server/http"
import { modelsForUser, publicModel } from "@/server/services"

export const GET = route({}, ({ user }) => json(modelsForUser(user).map(publicModel)))
