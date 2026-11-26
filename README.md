# Mis Pesitos

App web de finanzas personales: ingresos, egresos en cuotas, compra y venta de
dólares, y un dashboard con saldo, deudas y flujo proyectado.

**Es privada y se instala donde quieras** (tu servidor con Docker, o Vercel +
Supabase). No es un servicio abierto: quien la instala crea la primera cuenta,
que queda como administradora, y el resto entra sólo por invitación. Cada
persona lleva sus propias finanzas y nadie ve las de otro, tampoco el admin.
Ver [Acceso privado e invitaciones](#acceso-privado-e-invitaciones) e
[Instalación propia](#instalación-propia-docker).

- Diseño: `docs/superpowers/specs/2026-08-09-mis-pesitos-design.md`
- Sistema visual: `docs/superpowers/specs/2026-08-10-linear-design-system-design.md`
- Plan v2 (tarjetas, subcategorías, informes, self-hosting): `docs/superpowers/specs/2026-11-26-v2-plan.md`
- **Lo que falta y lo que se decidió no hacer: [`docs/PENDIENTES.md`](docs/PENDIENTES.md)**

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind 4 · shadcn/ui · Drizzle · Postgres
(propio o Supabase) · better-auth · Recharts · Vitest. Gestor de paquetes: **pnpm**.

## El sistema visual

Un solo tema, el oscuro: lienzo casi negro (`#08090a`), Inter de tracking cerrado
en pesos 400–590, bordes capilares en vez de sombras y el lima ácido `#e4f222`
como única acción cromática — un botón lima por pantalla, y nunca en un gráfico.
Los importes van en gris; el verde y el rojo señalan estado, no monto.

Todo vive en la capa de tokens de `src/app/globals.css`: los componentes de
shadcn están escritos contra los tokens semánticos, así que la paleta se cambia
ahí y no en cada componente. El único lugar con hexadecimales sueltos es
`src/components/dashboard/charts.tsx`, porque Recharts recibe colores como
strings de JavaScript y no puede leer tokens de Tailwind.

Una regla para cualquier control con estado que se agregue: **sobre esta paleta
lo elegido cambia el color de la etiqueta** (Fog → Mist → Paper), no sólo el
relleno. Los rellenos disponibles están todos por debajo del contraste que hace
falta para señalar estado.

## Qué hace, pantalla por pantalla

| Ruta | Qué es |
|---|---|
| `/` | Sin landing: con sesión va al dashboard, sin sesión a `/login` |
| `/login`, `/registro` | Correo y contraseña, más "Continuar con Google". En una instalación vacía, `/registro` crea la cuenta de administrador; después, sólo con invitación |
| `/invitacion/<token>` | El link que comparte el admin: guarda la invitación y manda a `/registro` |
| `/onboarding` | Saldo inicial en pesos y en dólares, el TC al que se compraron esos dólares, la fecha desde la que se cuenta, y qué dólar usar de referencia. Precarga las categorías por default, ya agrupadas (Hogar › Alquiler, Comida › Supermercado…) y con color e icono |
| `/dashboard` | Saldos por moneda, total consolidado, vencimientos del próximo mes, proyección a 6 meses, gastos del mes por categoría padre (con el desglose por subcategoría a un clic) y lo cobrado y pagado en los últimos 12 meses. Todo lo que habla de "el mes" cuenta lo percibido: cuotas pagadas, por su fecha de pago |
| `/ingresos`, `/egresos` | Alta con plan de cuotas editable y un selector de categoría con búsqueda, agrupado por padre, que recuerda la última usada; lista con filtros (filtrar por un padre trae lo de sus subcategorías). Cada fila muestra la próxima cuota ("Cuota 3/12 · vence 15/12") y la paga en un toque, con "Deshacer"; cada cuota se puede marcar con otra fecha de pago (nunca futura). Editar y Borrar en el menú ⋯ de la fila |
| `/cambios` | Compra y venta de dólares, tenencia, TC promedio ponderado y diferencia de cambio realizada |
| `/categorias` | Árbol de dos niveles: cada categoría con sus subcategorías, plegables, con color (de una paleta fija) e icono. Desde el menú ⋯ de cada fila: agregar subcategoría, editar, "Mover a…" (para agrupar las que ya existían) y archivar. Archivar un padre archiva sus hijas; las archivadas dejan de ofrecerse en la carga pero siguen mostrándose en los movimientos viejos |
| `/ajustes` | Editar el saldo inicial y la preferencia de dólar |
| `/ajustes/usuarios` | Sólo admin: generar y revocar invitaciones, quitar o devolver el acceso |

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
3. `pnpm db:setup` — crea los roles que falten, aplica las migraciones y, si
   definiste `APP_USER_PASSWORD`, le pone esa contraseña a `app_user`. Es
   idempotente. (`pnpm db:migrate` sigue existiendo y sólo migra.)
4. Si no usaste `APP_USER_PASSWORD`, poner la contraseña de `app_user` a mano
   (ver más abajo).
5. `pnpm dev` y abrir `http://localhost:3100`. La primera cuenta que crees es
   la de administrador.

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

### Contraseña de `app_user` (una sola vez)

Lo más simple: definí `APP_USER_PASSWORD` y corré `pnpm db:setup`, que la aplica
sola. Si preferís hacerlo a mano, seguí leyendo.

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

## Acceso privado e invitaciones

- **La primera cuenta que se crea es la del administrador.** Con eso el registro
  se cierra. Si la base ya tenía usuarios al aplicar la migración 0010, el más
  antiguo pasa a ser el admin. Hay un solo admin por instalación (lo impone un
  índice único).
- **El resto entra por invitación.** En `/ajustes/usuarios` el admin genera un
  link de un solo uso que vence a los 7 días, opcionalmente atado a un correo. El
  link se muestra una sola vez: en la base sólo queda su hash.
- **El cierre vive en el servidor**, en el hook de alta de usuario de better-auth
  (`src/auth.ts`), así que cubre igual el registro con correo, el primer ingreso
  con Google y una llamada directa a `/api/auth/sign-up/email`.
- **Quitar el acceso** cierra las sesiones de esa persona y le impide abrir
  otras. Sus datos no se borran; el acceso se puede devolver.
- **El admin no ve finanzas ajenas.** La pantalla de usuarios sólo lee las tablas
  de auth; los datos de cada uno siguen detrás de RLS.

## Instalación propia (Docker)

Necesitás Docker con Compose. Levanta Postgres, prepara la base y arranca la app:

1. Copiá `.env.selfhost.example` a `.env` y completalo. Las contraseñas, en hex
   (`openssl rand -hex 24`). `BETTER_AUTH_URL` es la URL pública exacta con la
   que vas a entrar (ej. `https://pesitos.midominio.com`): con ella se arman los
   links de invitación.
2. `docker compose up -d --build`
3. Abrí la URL y creá la cuenta de administrador.

Qué corre:

- **`db`**: Postgres 17 con los datos en el volumen `pgdata`.
- **`migrate`**: corre `scripts/db-setup.mjs` y termina. En un Postgres común
  no existen los roles `anon` y `authenticated` que Supabase trae de fábrica y
  que usan las migraciones de RLS: el script los crea. Corre en cada `up`, así
  que actualizar es `git pull && docker compose up -d --build`.
- **`app`**: la build `standalone` de Next, conectada como `app_user` (nunca
  como `postgres`), en el puerto `APP_PORT` (3000 por defecto).

Para HTTPS poné adelante el proxy que uses (Caddy, nginx, Traefik). Si es nginx,
desactivá el buffering de respuestas para que el streaming de Next funcione.

**Backups.** Un volcado de la base:

```bash
docker compose exec db pg_dump -U postgres -Fc mispesitos > mispesitos-$(date +%F).dump
```

y para restaurarlo en una base vacía:

```bash
docker compose exec -T db pg_restore -U postgres -d mispesitos --clean --if-exists < archivo.dump
```

**Postgres externo o Supabase.** Sin Docker para la base: `pnpm db:setup` con
`MIGRATION_DATABASE_URL` (y `APP_USER_PASSWORD`) prepara cualquier Postgres 15+,
y la app corre en cualquier hosting de Node (o en Vercel) con `DATABASE_URL`
apuntando a `app_user`.

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
| `pnpm db:setup` | Prepara la base: roles, migraciones y contraseña de `app_user`. Idempotente |
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
  Es fija a propósito: la app es argentina (dólar blue, MEP) y la usan también
  componentes del navegador, así que hacerla configurable obligaría a fijarla al
  compilar la imagen.
  Nunca `new Date()` para una fecha de negocio.
- **Toda la lógica de negocio vive en `src/lib/`** como funciones puras testeadas: reparto
  de cuotas, saldo, posición en dólares y agregados del dashboard.
- **Todo el acceso a datos pasa por `withUser()`**, que abre una transacción y declara el
  usuario ante Postgres para que apliquen las políticas de RLS.
- **Toda Server Action valida su entrada con Zod** antes de tocar la base. El formulario
  también valida, pero la que manda es la del servidor.
- **Las acciones se confirman con un toast** (shadcn `sonner`, un único `<Toaster>` en
  `src/app/layout.tsx`). Los errores se muestran junto al control que falló, no en un
  toast que desaparece.
- **La base es la última red, no sólo el depósito.** Las claves foráneas llevan adentro
  el `user_id` y el `kind`, así que un movimiento no puede referenciar la categoría de
  otro usuario ni una de un tipo que no le corresponde, aunque el código se olvide de
  chequearlo. Una cuota marcada como pagada no puede quedar sin fecha de pago.
- **Las categorías son un árbol de dos niveles** (`category.parent_id`, migración 0011).
  La base hace cumplir las reglas: el padre es del mismo usuario y tipo (FK compuesta),
  no hay tercer nivel, y un movimiento sólo apunta a una categoría hoja (triggers; los de
  "sólo hojas" son diferidos para que crear la primera subcategoría y pasarle los
  movimientos del padre entre en una sola transacción). La lógica del árbol —armado,
  opciones del selector, colores heredados, la torta por padre— vive en
  `src/lib/category-tree.ts`.
- **El color de una categoría** es una clave de una paleta fija (`CATEGORY_PALETTE` en
  `src/lib/category-color.ts`), no un color libre: así ninguno se confunde con los de
  estado. Sin color elegido, la subcategoría hereda el del padre, y el padre sale del
  hash de su nombre, como antes.
