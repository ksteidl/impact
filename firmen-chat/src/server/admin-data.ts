import "server-only"
import { all } from "./db"
import { adminModel, adminProvider, adminUser } from "./admin"
import { allModels } from "./services"
import type { User } from "./security"

export const listProviders = () =>
  all<Parameters<typeof adminProvider>[0]>(
    "SELECT p.*, (SELECT COUNT(*) FROM models m WHERE m.provider_id = p.id) AS model_count FROM providers p ORDER BY name"
  ).map(adminProvider)

export const listModels = () => allModels().map(adminModel)

export const listUsers = () => all<User>("SELECT * FROM users ORDER BY display_name COLLATE NOCASE").map(adminUser)
