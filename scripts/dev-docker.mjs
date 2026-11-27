import { execFileSync, spawn } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = process.cwd()
const ENV_LOCAL_PATH = resolve(ROOT, ".env.local")
const NEXT_BIN = resolve(ROOT, "node_modules", "next", "dist", "bin", "next")

function run(cmd, args, options = {}) {
  return execFileSync(cmd, args, { stdio: "inherit", ...options })
}

function readSecret(pathInContainer) {
  return execFileSync("docker", ["compose", "exec", "-T", "db", "cat", pathInContainer], {
    encoding: "utf8",
  }).trim()
}

function ensureDockerRunning() {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" })
  } catch {
    console.error("Error: Docker no está corriendo. Iniciá Docker Desktop y volvé a intentar.")
    process.exit(1)
  }
}

function ensureEnvLocal() {
  if (existsSync(ENV_LOCAL_PATH)) {
    const current = readFileSync(ENV_LOCAL_PATH, "utf8")
    if (/^DATABASE_URL=/m.test(current)) return
  }

  const appPass = readSecret("/secrets/app-user-password")
  const pgPass = readSecret("/secrets/postgres-password")
  const content = [
    `DATABASE_URL="postgresql://app_user:${appPass}@localhost:5432/mispesitos"`,
    `MIGRATION_DATABASE_URL="postgresql://postgres:${pgPass}@localhost:5432/mispesitos"`,
    `BETTER_AUTH_URL="http://localhost:3100"`,
    "",
  ].join("\n")

  writeFileSync(ENV_LOCAL_PATH, content, "utf8")
  console.log("✓ .env.local generado automáticamente desde los secretos de Docker.")
}

ensureDockerRunning()

// Evita conflictos si el contenedor de producción `app` quedó levantado.
try {
  execFileSync("docker", ["compose", "stop", "app"], { stdio: "ignore" })
} catch {
  // Ignorar si no estaba corriendo.
}

run("docker", ["compose", "-f", "docker-compose.yml", "-f", "docker-compose.dev.yml", "up", "-d", "db", "migrate"])
ensureEnvLocal()

const child = spawn(process.execPath, [NEXT_BIN, "dev", "-p", "3100"], {
  stdio: "inherit",
})

child.on("exit", (code) => {
  process.exit(code ?? 0)
})
