# Notas técnicas y decisiones de implementación

Este documento concentra las decisiones técnicas, invariantes de dominio, reglas de seguridad y detalles de infraestructura que conviene tener presentes al mantener o extender **Mis Pesitos**.

---

## 1. Base de datos, migraciones y RLS

### Separación de roles (`DATABASE_URL` vs `MIGRATION_DATABASE_URL`)
- **`DATABASE_URL`** conecta como `app_user`, un rol sin `BYPASSRLS` ni `SUPERUSER` que no puede ejecutar DDL. Es la única conexión que usa la aplicación (`src/db/client.ts`).
- **`MIGRATION_DATABASE_URL`** conecta como `postgres` (dueño de las tablas) y sólo se usa para migraciones (`drizzle.config.ts`) y puesta a punto (`scripts/db-setup.mjs`).
- Un guard en tiempo de ejecución (`src/lib/rls-guard.ts`, invocado en el primer `withUser()`) consulta `pg_roles` y aborta con excepción si el rol de `DATABASE_URL` tiene `BYPASSRLS` o `SUPERUSER`.

### Puesta a punto idempotente (`scripts/db-setup.mjs`)
El script se ejecuta en cada `docker compose up` (servicio `migrate`) y con `pnpm db:setup`, y realiza tres pasos:
1. Crea los roles `anon` y `authenticated` (`NOLOGIN`) si no existen; son el destino de `SET LOCAL ROLE authenticated` dentro de `withUser()`.
2. Aplica las migraciones de `./drizzle` usando el migrador de `drizzle-orm` (sin requerir `drizzle-kit` en la imagen de producción).
3. Si está definida `APP_USER_PASSWORD`, habilita `LOGIN` y asigna esa contraseña a `app_user`. Como `ALTER ROLE` no admite parámetros preparados, la contraseña se restringe a un alfabeto seguro sin necesidad de escape (p. ej. `openssl rand -hex 24`).
- El cliente Postgres usa `prepare: false` para mantener compatibilidad con poolers en modo transacción (como PgBouncer).

### Snapshot ausente `drizzle/meta/0001_snapshot.json`
- La migración `0001_rls_tablas_de_auth.sql` se escribió a mano (RLS puro, sin cambios de esquema) y se agregó al journal sin generar snapshot.
- `drizzle-kit` sigue la cadena de snapshots por `prevId` (`0002` apunta directo a `0000`), por lo que `check`, `up`, `generate` y `migrate` funcionan normalmente. No se repone artificialmente para no reescribir historia ya aplicada.

### Integridad en base de datos
- Los importes `numeric` de Postgres llegan como `string` desde Drizzle; en formularios (como `/ajustes`) se pasan sin convertir a `Number` para no perder precisión.
- Las claves foráneas compuestas incluyen `user_id` y `kind`, impidiendo referencias cruzadas entre usuarios o tipos de movimiento.
- Los triggers de categorías (migración `0011`) garantizan árbol de máximo dos niveles y que todo movimiento apunte únicamente a una categoría hoja. Son diferidos (`DEFERRABLE`) para permitir crear la primera subcategoría y migrar los movimientos del padre en una sola transacción.
- Los triggers de tarjetas (migración `0012`) impiden pagar suelta una cuota con tarjeta y congelan un resumen ya pagado.

---

## 2. Autenticación, sesiones y acceso privado

- **Cierre de registro en el servidor (`src/auth.ts`):** la validación de instalación privada vive en el hook de alta de `better-auth` (no sólo en la UI), cubriendo llamadas directas a `/api/auth/sign-up/email`.
- **Primer usuario administrador:** en una instalación vacía, el primer registro recibe rol `"admin"`. Ante una carrera simultánea, el índice único `user_single_admin` rechaza el segundo `INSERT`.
- **Campos protegidos:** `role` y `disabledAt` se declaran en `user.additionalFields` con `input: false` para que no puedan enviarse desde el formulario de registro.
- **Invitaciones:** el token en claro se muestra una sola vez al generarlo; en base sólo se guarda su hash. Al consumirse, se invalida la cookie de invitación.
- **Revocación de acceso:** deshabilitar un usuario borra sus sesiones activas (`src/server/access.ts`) y además `src/server/session.ts` verifica `disabledAt` y devuelve `null` (sin redirigir) para evitar bucles entre `/login` y `/dashboard`.
- **Memoización por request (`src/server/session.ts`):** la lectura de sesión y ajustes usa `React.cache` para evitar duplicar consultas entre el layout de `(app)` y cada página. Fuera de un render de React (tests), se ejecuta directamente sin caché.
- **Verificación de admin:** `requireAdmin` relee el rol desde la base de datos en lugar de confiar únicamente en la sesión.

---

## 3. Reglas de negocio y consultas

### Categorías en árbol (`src/server/actions/categories.ts`, `src/lib/category-tree.ts`)
- Al agregar la primera subcategoría a una categoría que ya tiene movimientos, se debe elegir su destino: `"general"` (crea una subcategoría `"General"` y los mueve ahí) o `"child"` (los pasa a la subcategoría recién creada/movida), manteniendo la invariante de que sólo las hojas tienen movimientos.
- Al filtrar movimientos por una categoría padre (`src/server/queries.ts`), la subconsulta incluye automáticamente todas sus subcategorías bajo la misma RLS.
- El color y el icono se eligen de listas fijas (`src/lib/category-color.ts`, `src/lib/category-icons.tsx`); si quedan vacíos, las subcategorías heredan el color del padre y los padres derivan uno por hash de su nombre.

### Tarjetas de crédito y resúmenes (`src/server/actions/cards.ts`, `src/lib/cards.ts`)
- Editar el día de cierre o vencimiento de una tarjeta sólo afecta las fechas propuestas para resúmenes futuros aún no creados; los resúmenes existentes conservan sus fechas reales.
- Corregir el cierre/vencimiento de un resumen actualiza las cuotas asociadas en la misma transacción, pero **no** reasigna compras ya cargadas a otro resumen. Si el resumen aún no existe (sin compras), se crea con las fechas corregidas.
- Las tarjetas se archivan (no se borran) para preservar compras y resúmenes históricos y permitir seguir pagando saldos pendientes.
- El pago de un resumen es total y actualiza el resumen y todas sus cuotas en una sola transacción. Los consumos en dólares pagados en pesos guardan el tipo de cambio en el resumen y se traducen al leer (`perceivedPayment`), permitiendo desmarcar el pago de forma reversible sin tocar la posición en dólares.
- Toda acción sobre resúmenes revalida la app completa porque impacta saldo en `/dashboard`, estado en `/egresos` y posición en `/cambios`.

### Búsqueda y rendimiento de consultas (`src/server/queries.ts`)
- En búsquedas de texto libre con `LIKE`, se escapan `\`, `%` y `_` (con `\` primero) para evitar que comodines literales como `"50%"` coincidan con toda la tabla.
- Las consultas repetidas de catálogo dentro de un mismo render (como listas de categorías usadas en filtros y tabla) se memoizan por request con `React.cache`, usando siempre la misma firma de argumentos para compartir la clave.

---

## 4. Infraestructura, build y testing

### Next.js y Docker (`next.config.ts`)
- La imagen de Docker compila con `NEXT_OUTPUT=standalone` para generar `.next/standalone/server.js` con el mínimo de `node_modules`. Fuera de Docker no se activa porque `next start` no sirve builds standalone.

### Imagen y Docker Compose (`Dockerfile`, `docker-compose.yml`)
- Una sola imagen para `secrets`, `app` y `migrate`. En la etapa `deps` se instala con `--node-linker=hoisted` porque con los symlinks de pnpm el trazado standalone deja afuera dependencias que Next resuelve en runtime; por la misma razón se llama a `next build` directo y no a `pnpm build`. `drizzle-orm` y `postgres` se copian aparte: los scripts de `scripts/` corren fuera de Next, y ni el migrador entra en el trazado ni el driver queda en `node_modules` (Next lo empaqueta dentro de sus chunks). Sin `postgres`, `migrate` falla con `ERR_MODULE_NOT_FOUND`.
- El runtime corre como `node`, y el entrypoint genera `BETTER_AUTH_SECRET` en `/app/data/auth-secret` (volumen `appdata`) si no llega por entorno.

### Secretos sin configuración (`scripts/init-secrets.mjs`)
- El servicio `secrets` corre antes que `db` y deja en el volumen `secrets` `postgres-password` (dueño `1000`, grupo `70`) y `app-user-password` (`1000:1000`), ambos `0440`, carpeta `1000:70` `0750`. `70` es el usuario `postgres` de la imagen oficial y `1000` el `node` de la nuestra: cada contenedor lee sólo lo suyo. Corre como root sin red y con sólo `CHOWN`, `DAC_OVERRIDE` y `FOWNER`, que necesita para reescribir y re-adueñar archivos que ya no son suyos.
- Prioridad: variable de entorno (`POSTGRES_PASSWORD`, `APP_USER_PASSWORD`) > archivo existente > generada (`randomBytes(24)` en hex). Correrlo de nuevo no cambia nada.
- `db` usa `POSTGRES_PASSWORD_FILE`; `migrate` y el entrypoint de `app` arman sus URLs con `DB_HOST`/`DB_PORT`/`DB_NAME` (por defecto `db:5432/mispesitos`) si no reciben `MIGRATION_DATABASE_URL`/`DATABASE_URL`, que siguen mandando (desarrollo local).
- Migración de instalaciones viejas: si la contraseña generada falla con `28P01`, `db-setup.mjs` prueba la fija que traía el compose (`mispesitos_postgres_local_only`) y, si entra, hace `ALTER ROLE postgres` a la nueva. La de `app_user` se reaplica igual que siempre.
- Los `ALTER ROLE` escapan el literal (`'` → `''`), así que una contraseña de `postgres` elegida por el usuario puede tener cualquier carácter; la URL la lleva con `encodeURIComponent`. La de `app_user` mantiene el alfabeto restringido porque el entrypoint la mete en la URL sin escapar.
- En el compose, `app` y `migrate` llevan `cap_drop: ALL` y `no-new-privileges`; `app` usa `init: true` (tini) para que el `SIGTERM` de `docker compose stop` llegue a Node. `db` no lleva `cap_drop` porque el entrypoint de Postgres necesita `chown`/`setuid`.
- El puerto de `app` se publica en `127.0.0.1` por defecto (`APP_BIND_ADDRESS`): Docker inserta sus reglas de iptables antes que `ufw`, así que un `0.0.0.0` queda expuesto aunque el firewall diga lo contrario.
- Los logs rotan (`json-file`, 3 × 10 MB) para que un servidor chico no se llene el disco.
- `MISPESITOS_VERSION` elige el tag de la imagen; en un servidor conviene fijarlo y no seguir `latest`.

### CI (`.github/workflows/docker.yml`)
- `verify` (lint, typecheck, tests unitarios) corre en paralelo con `build`, y `merge` necesita a los dos: ningún tag apunta a código roto. Si `verify` falla, las imágenes ya subidas quedan sin tag en GHCR. En PRs se compila la imagen sin publicarla, y los cambios que sólo tocan `*.md`, `docs/` o `.env.example` no disparan el workflow.
- Sin caché de capas de BuildKit: con `cache-to: type=gha,mode=max` la exportación tardaba 75–114 s por arquitectura y sólo ahorraba el `pnpm install` (~22 s). Por la misma cuenta, `builder` parte de `deps` en vez de copiar `node_modules`, y el CI pasa `SKIP_TYPECHECK=1` (`typescript.ignoreBuildErrors` en `next.config.ts`) porque `verify` ya corrió `tsc`; una build local sigue chequeando tipos.
- La imagen es multi-arquitectura sin QEMU: `build` compila `linux/amd64` en `ubuntu-latest` y `linux/arm64` en `ubuntu-24.04-arm` (runners ARM nativos, gratis en repos públicos), sube cada una por digest, y `merge` arma el manifiesto con los tags (`latest`, `sha-*`, semver). El lockfile ya trae los binarios `linux-*-musl` de las dependencias nativas (SWC, Tailwind oxide, sharp), así que el `Dockerfile` no cambia por arquitectura. Si el repo vuelve a ser privado, los runners ARM dejan de ser gratuitos.
- No corre `pnpm test:db` porque necesita un Postgres con los roles; si se suma, con un `services: postgres` del workflow.

### ESLint (`eslint.config.mjs`)
- Se ignoran `coverage/` (generado por `pnpm test:coverage`) y worktrees locales de agentes para que el linter no analice archivos generados ni copias auxiliares.

### Vitest (`vitest.config.ts`, `vitest.db.config.ts`)
- **Suite unitaria (`pnpm test`):** incluye `*.test.ts` y `*.test.tsx`, excluyendo `*.db.test.ts` por sufijo (no por directorio). Corre en `node` por defecto; los tests de componentes declaran `// @vitest-environment jsdom` en su primera línea. El timeout es de 20 s para dar margen a pruebas exhaustivas (`splitAmount`, `usdPosition`) en máquinas con carga.
- **Suite de base de datos (`pnpm test:db`):** corre los `*.db.test.ts` en serie contra Postgres real (comparten tablas) con timeout de 30 s. Mapea `"server-only"` a un módulo vacío (imitando la condición `react-server` de Next.js) para poder importar `src/db/client.ts` en Vitest.
