# Mis Pesitos

App web de finanzas personales: ingresos, egresos en cuotas, compra y venta de
dólares, y un dashboard con saldo, deudas y flujo proyectado.

- Diseño: `docs/superpowers/specs/2026-08-09-mis-pesitos-design.md`
- **Lo que falta y lo que se decidió no hacer: [`docs/PENDIENTES.md`](docs/PENDIENTES.md)**

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind 4 · shadcn/ui · Drizzle · Supabase ·
better-auth · Recharts · Vitest. Gestor de paquetes: **pnpm**.

## Qué hace, pantalla por pantalla

| Ruta | Qué es |
|---|---|
| `/` | Landing pública. Con sesión abierta, redirige al dashboard |
| `/login`, `/registro` | Correo y contraseña, más "Continuar con Google" |
| `/onboarding` | Saldo inicial en pesos y en dólares, el TC al que se compraron esos dólares, la fecha desde la que se cuenta, y qué dólar usar de referencia. Precarga 15 categorías |
| `/dashboard` | Saldos por moneda, total consolidado, vencimientos del próximo mes, proyección a 6 meses, egresos del mes por categoría y los últimos 12 meses |
| `/ingresos`, `/egresos` | Alta con plan de cuotas editable, lista con filtro por estado (pendiente / pagado / vencido), marcar cuotas pagadas y borrar |
| `/cambios` | Compra y venta de dólares, tenencia, TC promedio ponderado y diferencia de cambio realizada |
| `/categorias` | ABM con archivado. Las archivadas dejan de ofrecerse en la carga pero siguen mostrándose en los movimientos viejos |
| `/ajustes` | Editar el saldo inicial y la preferencia de dólar |

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
queda apuntando al rol dueño en vez de a `app_user`, el aislamiento entre usuarios
desaparece: cualquier consulta que se olvide de pasar por `withUser()` devuelve
filas de todos los usuarios en vez de cero, y nada falla a la vista.

Contra eso hay un guard **en la app, no en los tests**: `src/db/client.ts` consulta
`pg_roles` y `src/lib/rls-guard.ts` decide, y si el rol conecta con `BYPASSRLS` (o
como superusuario) tira una excepción. Corre una vez por proceso, en el primer
`withUser()`, y a partir de ahí no pasa ninguna consulta: la app no arranca a
medias, deja de funcionar. O sea que no vas a desplegar en silencio con la cadena
equivocada — pero te vas a enterar recién con el primer request, así que verificá
la variable antes.

Aparte, y por otro camino, `pnpm test:db` corre `src/db/rls.db.test.ts`, que es el
test de integración del aislamiento en sí: verifica contra la base real que un
usuario no ve las filas de otro.

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
completarlas en `.env.local` el botón aparece solo, sin tocar código.

La URI de redirección autorizada en Google Cloud tiene que ser
`http://localhost:3100/api/auth/callback/google` — el mismo puerto que
`BETTER_AUTH_URL`, o Google devuelve `redirect_uri_mismatch`. Al desplegar hay que
agregar además la de producción, `https://<dominio>/api/auth/callback/google`.

Si la pantalla de consentimiento está en modo **Prueba**, sólo pueden entrar las
cuentas cargadas como usuarios de prueba; el resto ve "Acceso bloqueado: la app no
completó la verificación". Se resuelve en Google Cloud, no en el código.

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Servidor de desarrollo (puerto 3100) |
| `pnpm test` | Suite unitaria: lógica pura, sin red ni base |
| `pnpm test:watch` | Ídem, en modo watch |
| `pnpm test:db` | Suite de integración contra la base real. Necesita `.env.local` |
| `pnpm typecheck` | Chequeo de tipos |
| `pnpm lint` | Linter |
| `pnpm build` | Build de producción |
| `pnpm db:generate` / `pnpm db:migrate` | Migraciones de Drizzle |
| `pnpm db:studio` | Explorador de la base de drizzle-kit |

## Tests

Dos suites, separadas por **sufijo de archivo**, no por directorio:

- **`pnpm test`** levanta todo `*.test.ts` salvo los `*.db.test.ts`. Es la lógica
  pura de `src/lib/`: centavos y formato, fechas de negocio, reparto de cuotas,
  saldo, posición en dólares, agregados del dashboard y los esquemas de Zod.
  No toca la red ni la base, y corre en menos de un segundo.
- **`pnpm test:db`** levanta los `*.db.test.ts` contra la base real, en serie:
  el aislamiento por RLS (`src/db/`), la capa de lectura y las Server Actions
  (`src/server/`). Ahí corre Zod de verdad, `withUser` de verdad, las policies,
  las constraints y el driver. Sólo se simulan dos fronteras del framework
  (`revalidatePath` y la lectura de sesión); nunca la base.

Los tests siembran y limpian sus propias filas, y un fallo de limpieza pone la
suite en rojo en vez de dejar basura callada en una base compartida. **No la
corras contra producción, ni dos veces en paralelo.**

## Cómo está armado

- **La plata son centavos enteros.** Nunca decimales. Una sola función convierte monedas
  (`convertToArs`); ningún otro archivo multiplica un importe por una cotización.
- **Las fechas son strings `YYYY-MM-DD`**, con "hoy" calculado en la zona de Buenos Aires.
  Nunca `new Date()` para una fecha de negocio.
- **Toda la lógica de negocio vive en `src/lib/`** como funciones puras testeadas: reparto
  de cuotas, saldo, posición en dólares y agregados del dashboard.
- **Todo el acceso a datos pasa por `withUser()`**, que abre una transacción y declara el
  usuario ante Postgres para que apliquen las políticas de RLS.
- **Toda Server Action valida su entrada con Zod** antes de tocar la base. El formulario
  también valida, pero la que manda es la del servidor.
- **La base es la última red, no sólo el depósito.** Las claves foráneas llevan adentro
  el `user_id` y el `kind`, así que un movimiento no puede referenciar la categoría de
  otro usuario ni una de un tipo que no le corresponde, aunque el código se olvide de
  chequearlo. Una cuota marcada como pagada no puede quedar sin fecha de pago.
