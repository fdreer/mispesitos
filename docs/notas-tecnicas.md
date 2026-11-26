# Notas técnicas y decisiones de implementación

Este documento concentra las decisiones técnicas, invariantes de dominio, reglas de seguridad y detalles de infraestructura que conviene tener presentes al mantener o extender **Mis Pesitos**.

---

## 1. Base de datos, migraciones y RLS

### Separación de roles (`DATABASE_URL` vs `MIGRATION_DATABASE_URL`)
- **`DATABASE_URL`** conecta como `app_user`, un rol sin `BYPASSRLS` ni `SUPERUSER` que no puede ejecutar DDL. Es la única conexión que usa la aplicación (`src/db/client.ts`).
- **`MIGRATION_DATABASE_URL`** conecta como `postgres` (dueño de las tablas) y sólo se usa para migraciones (`drizzle.config.ts`) y puesta a punto (`scripts/db-setup.mjs`).
- Un guard en tiempo de ejecución (`src/lib/rls-guard.ts`, invocado en el primer `withUser()`) consulta `pg_roles` y aborta con excepción si el rol de `DATABASE_URL` tiene `BYPASSRLS` o `SUPERUSER`.

### Puesta a punto idempotente (`scripts/db-setup.mjs`)
El script se ejecuta en cada arranque (también en Docker Compose) y realiza tres pasos:
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

### ESLint (`eslint.config.mjs`)
- Se ignoran `coverage/` (generado por `pnpm test:coverage`) y worktrees locales de agentes para que el linter no analice archivos generados ni copias auxiliares.

### Vitest (`vitest.config.ts`, `vitest.db.config.ts`)
- **Suite unitaria (`pnpm test`):** incluye `*.test.ts` y `*.test.tsx`, excluyendo `*.db.test.ts` por sufijo (no por directorio). Corre en `node` por defecto; los tests de componentes declaran `// @vitest-environment jsdom` en su primera línea. El timeout es de 20 s para dar margen a pruebas exhaustivas (`splitAmount`, `usdPosition`) en máquinas con carga.
- **Suite de base de datos (`pnpm test:db`):** corre los `*.db.test.ts` en serie contra Postgres real (comparten tablas) con timeout de 30 s. Mapea `"server-only"` a un módulo vacío (imitando la condición `react-server` de Next.js) para poder importar `src/db/client.ts` en Vitest.
