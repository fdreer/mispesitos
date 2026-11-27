// Genera, una sola vez por instalación, las contraseñas de Postgres que
// necesitan `db`, `migrate` y `app`, y las deja en SECRETS_DIR (un volumen
// compartido sólo por esos servicios). Así `docker compose up -d` no exige
// ningún secreto y no existe una contraseña por defecto conocida.
//
// - Si POSTGRES_PASSWORD / APP_USER_PASSWORD llegan por entorno, mandan y se
//   escriben en el archivo.
// - Si el archivo ya existe, se conserva (correr esto en cada `up` no cambia nada).
// - Si no, se genera una al azar (hex: viaja en URLs sin escapar nada).
//
// Corre como root sólo para dejar los dueños correctos: el archivo de Postgres
// lo lee el usuario `postgres` (gid 70) de la imagen oficial y el `node`
// (uid 1000) de esta; el de app_user sólo `node`.

import { randomBytes } from "node:crypto"
import { chmodSync, chownSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const dir = process.env.SECRETS_DIR || "/secrets"
const NODE_UID = 1000
const NODE_GID = 1000
const POSTGRES_GID = 70

const secrets = [
  { file: "postgres-password", env: "POSTGRES_PASSWORD", gid: POSTGRES_GID },
  { file: "app-user-password", env: "APP_USER_PASSWORD", gid: NODE_GID },
]

function readExisting(path) {
  try {
    return readFileSync(path, "utf8").trim()
  } catch {
    return ""
  }
}

try {
  mkdirSync(dir, { recursive: true })

  for (const { file, env, gid } of secrets) {
    const path = join(dir, file)
    const fromEnv = process.env[env]?.trim() ?? ""
    const existing = readExisting(path)

    let value = existing
    let origin = "existente, sin cambios"
    if (fromEnv) {
      value = fromEnv
      origin = fromEnv === existing ? "de la variable, sin cambios" : `tomada de ${env}`
    } else if (!existing) {
      value = randomBytes(24).toString("hex")
      origin = "generada"
    }

    if (value !== existing) writeFileSync(path, value)
    chownSync(path, NODE_UID, gid)
    chmodSync(path, 0o440)
    console.log(`✓ ${file}: ${origin}`)
  }

  chownSync(dir, NODE_UID, POSTGRES_GID)
  chmodSync(dir, 0o750)
} catch (error) {
  console.error("✗ No se pudieron preparar los secretos:", error)
  process.exit(1)
}
