# Mis Pesitos

App web de finanzas personales: ingresos, egresos en cuotas, compra y venta de
dólares, y un dashboard con saldo, deudas y flujo proyectado.

Diseño: `docs/superpowers/specs/2026-08-09-mis-pesitos-design.md`

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind 4 · shadcn/ui · Drizzle · Supabase ·
better-auth · Recharts · Vitest. Gestor de paquetes: **pnpm**.

## Puesta en marcha

1. `pnpm install`
2. Copiar `.env.example` a `.env.local` y completarlo:
   - `DATABASE_URL` y `MIGRATION_DATABASE_URL` — ver la sección de abajo, son dos
     cadenas distintas y ninguna reemplaza a la otra.
   - `BETTER_AUTH_SECRET` — `openssl rand -base64 32`
   - `BETTER_AUTH_URL` — `http://localhost:3100`. Tiene que coincidir **exacto** con
     el puerto en el que corre el servidor (`pnpm dev` levanta en el **3100**, no en
     el 3000): si no coincide, better-auth rechaza todo con `INVALID_ORIGIN`.
   - `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` — opcionales, ver más abajo.
3. `pnpm db:migrate`
4. Poner la contraseña de `app_user` (paso manual, ver más abajo).
5. `pnpm dev` y abrir `http://localhost:3100`

### Dos cadenas de conexión, no una

`DATABASE_URL` y `MIGRATION_DATABASE_URL` apuntan a roles distintos a propósito.
No unificarlas: de esa separación depende la segunda capa de autorización de la app.

- **`DATABASE_URL`** — el rol de aplicación **`app_user`**, que **no** tiene
  `BYPASSRLS`. Es la que usa la app (`src/db/client.ts`) para todo, siempre.
- **`MIGRATION_DATABASE_URL`** — el rol dueño de las tablas (`postgres`), sólo para
  DDL. Es la que usan los scripts `db:*` (drizzle-kit).

**Por qué importa:** en Supabase el rol `postgres` tiene el atributo `BYPASSRLS`,
que le gana incluso a `FORCE ROW LEVEL SECURITY`. Si al desplegar `DATABASE_URL`
queda apuntando al rol dueño en vez de a `app_user`, la app sigue andando
normalmente — pero el aislamiento entre usuarios desaparece: cualquier consulta
que se olvide de pasar por `withUser()` devuelve filas de todos los usuarios en
vez de cero. Hay un guard (`src/db/rls.test.ts`, corrido por `pnpm test:db`) que
lo detecta, pero recién en la primera consulta a la base. Verificá esta variable
antes de desplegar, no confíes en que el guard te avise a tiempo.

### Puesta en marcha de `app_user` (paso manual, una sola vez)

La migración 0004 crea el rol `app_user` **sin contraseña y sin LOGIN**, a
propósito: una contraseña adentro de una migración queda commiteada en git para
siempre. Después de `pnpm db:migrate`, conectate como `postgres`
(`MIGRATION_DATABASE_URL`) y aplicale una contraseña a mano:

```sql
-- generar la contraseña (hex, no base64, para no tener que escapar nada en la URL):
-- openssl rand -hex 24
ALTER ROLE app_user LOGIN PASSWORD '<la-generada>';
```

Ese valor va solamente en `DATABASE_URL`, dentro de `.env.local` (ignorado por
git) y en las variables de entorno del hosting. En ningún archivo versionado.

### Google OAuth es opcional

`GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` pueden quedar vacías. La app funciona
completa con correo y contraseña sin ellas: el proveedor de Google sólo se
registra en better-auth (y el botón "Continuar con Google" sólo se renderiza)
cuando **las dos** variables están presentes y no vacías (`src/auth.ts`). Al
completarlas en `.env.local` el botón aparece solo, sin tocar código. La URI de
redirección autorizada en Google Cloud tiene que ser
`http://localhost:3100/api/auth/callback/google` (mismo puerto que
`BETTER_AUTH_URL`).

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Servidor de desarrollo (puerto 3100) |
| `pnpm test` | Tests unitarios de la lógica de plata |
| `pnpm test:db` | Test de integración que verifica el aislamiento por RLS. Necesita `.env.local` con la base configurada |
| `pnpm typecheck` | Chequeo de tipos |
| `pnpm lint` | Linter |
| `pnpm build` | Build de producción |
| `pnpm db:generate` / `pnpm db:migrate` | Migraciones de Drizzle |

## Cómo está armado

- **La plata son centavos enteros.** Nunca decimales. Una sola función convierte monedas.
- **Las fechas son strings `YYYY-MM-DD`**, con "hoy" calculado en la zona de Buenos Aires.
- **Toda la lógica de negocio vive en `src/lib/`** como funciones puras testeadas: reparto
  de cuotas, saldo, posición en dólares y agregados del dashboard.
- **Todo el acceso a datos pasa por `withUser()`**, que abre una transacción y declara el
  usuario ante Postgres para que apliquen las políticas de RLS.
