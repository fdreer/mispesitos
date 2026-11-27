# Mis Pesitos

App web de finanzas personales: ingresos, egresos en cuotas, compra y venta de
dólares, y un dashboard con saldo, deudas y flujo proyectado.

**Es privada y self-hosted por defecto** (corre en tu máquina o servidor con
Docker Compose y Postgres propio). No es un servicio abierto: quien la instala
crea la primera cuenta, que queda como administradora, y el resto entra sólo por
invitación. Cada persona lleva sus propias finanzas y nadie ve las de otro,
tampoco el admin. Ver [Instalación rápida (Docker)](#instalación-rápida-docker),
[Desplegar en un servidor](#desplegar-en-un-servidor) y
[Acceso privado e invitaciones](#acceso-privado-e-invitaciones).

- Diseño: `docs/superpowers/specs/2026-08-09-mis-pesitos-design.md`
- Sistema visual: `docs/superpowers/specs/2026-08-10-linear-design-system-design.md`
- Plan v2 (tarjetas, subcategorías, informes, self-hosting): `docs/superpowers/specs/2026-11-26-v2-plan.md`
- **Lo que falta y lo que se decidió no hacer: [`docs/PENDIENTES.md`](docs/PENDIENTES.md)**
- **Notas técnicas y decisiones de implementación: [`docs/notas-tecnicas.md`](docs/notas-tecnicas.md)**

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind 4 · shadcn/ui · Drizzle ·
Postgres 17 · Docker · better-auth · Recharts · Vitest. Gestor de paquetes:
**pnpm**.

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
| `/login`, `/registro` | Correo y contraseña. En una instalación vacía, `/registro` crea la cuenta de administrador; después, sólo con invitación |
| `/invitacion/<token>` | El link que comparte el admin: guarda la invitación y manda a `/registro` |
| `/onboarding` | Saldo inicial en pesos y en dólares, el TC al que se compraron esos dólares, la fecha desde la que se cuenta, y qué dólar usar de referencia. Precarga las categorías por default, ya agrupadas (Hogar › Alquiler, Comida › Supermercado…) y con color e icono |
| `/dashboard` | Saldos por moneda, total consolidado, vencimientos del próximo mes, proyección a 6 meses (con enlace a Flujo de caja), gastos del mes por categoría padre (con el desglose por subcategoría a un clic) y lo cobrado y pagado en los últimos 12 meses. Todo lo que habla de "el mes" cuenta lo percibido: cuotas pagadas, por su fecha de pago |
| `/ingresos`, `/egresos` | Alta con el importe primero (con separador de miles), moneda y medio de pago segmentados, descripción con autocompletado que sugiere la categoría de la última vez, un selector de categoría con búsqueda, agrupado por padre, y cuotas con stepper y atajos (1·3·6·12); el plan queda colapsado en una línea y se edita a pedido. "Guardar y cargar otro" deja el formulario abierto. Una compra con tarjeta reparte sus cuotas en los resúmenes y vence con ellos. Barra de filtros unificada con la URL como fuente de verdad: buscador (descripción, categoría o importe), categoría multiselección (elegir un padre incluye sus hijas), medio de pago/tarjeta, moneda, importe mínimo/máximo, atajos de fecha (Este mes, Mes pasado, Próximos 30 días, Últimos 3/6/12 meses, Este año, Personalizado) con flechas ‹ ›, orden (vencimiento, fecha o importe), chips removibles y hoja inferior con botón Aplicar en móvil. Arriba de la lista: pastillas de estado con conteo (`Todos · Vencidos (n) · Pendientes (n) · Pagados`) y totales por estado (`Pendiente · Vencido · Pagado`). Listado agrupado (Vencidos / Esta semana / Este mes / Más adelante en egresos; por mes en ingresos), fechas relativas ("vence en 3 días"), plurales correctos, iconos además del color en estados, estados vacíos con acción ("Cargar primer egreso" / "Limpiar filtros"), "Cargar más" en móvil y rango visible ("21–40 de 134") en escritorio. Cada fila muestra la próxima cuota y la paga en un toque, con "Deshacer"; cada cuota se puede marcar con otra fecha de pago (nunca futura). Editar y Borrar en el menú ⋯ de la fila |
| `/tarjetas` | Las tarjetas de crédito, cada una con su resumen actual, el próximo y el disponible (si tiene límite). Alta, edición y archivo |
| `/tarjetas/<id>` | Los resúmenes de una tarjeta, período por período: cierre, vencimiento, total en pesos y en dólares y sus cuotas. Pagar el resumen (los dólares, con dólares o con pesos a un TC), desmarcarlo y corregir sus fechas con las que mandó el banco |
| `/informes` | Dos pestañas con selector de moneda (`ARS · USD · Todo en pesos`) y la barra de filtros compartida con la URL como fuente de verdad: **Ingresos vs Gastos** (tarjetas resumen con tasa de ahorro, gráfico de barras + línea de resultado neto y tabla tipo estado con categorías padre plegables, totales por fila/columna, variación % opcional y cada importe como enlace al listado filtrado por cuota pagada) y **Flujo de caja** (saldo inicial · entradas · salidas · neto · saldo final, meses pasados reales con compra/venta de dólares vs mes en curso mixto vs futuro proyectado por `due_date` incluidos resúmenes de tarjeta, gráfico de neto + línea de saldo acumulado, aviso si el saldo proyectado queda negativo, cuotas vencidas aparte como `"Atrasado:"`, y granularidad mensual o semanal a 3 meses) |
| `/cambios` | Compra y venta de dólares, tenencia, TC promedio ponderado y diferencia de cambio realizada |
| `/categorias` | Árbol de dos niveles: cada categoría con sus subcategorías, plegables, con color (de una paleta fija) e icono. Desde el menú ⋯ de cada fila: agregar subcategoría, editar, "Mover a…" (para agrupar las que ya existían) y archivar. Archivar un padre archiva sus hijas; las archivadas dejan de ofrecerse en la carga pero siguen mostrándose en los movimientos viejos |
| `/ajustes` | Editar el saldo inicial y la preferencia de dólar |
| `/ajustes/usuarios` | Sólo admin: generar y revocar invitaciones, quitar o devolver el acceso |

## Instalación rápida (Docker)

Corre en cualquier PC con Docker: Windows y macOS con Docker Desktop, Linux con
Docker Engine y Compose v2. La imagen es multi-arquitectura (`amd64` y `arm64`,
incluidas las Mac con Apple Silicon) y pública, así que no hace falta loguearse
en ningún registro.

1. Descargá `docker-compose.yml` en una carpeta propia y corré:
   ```bash
   docker compose up -d
   ```
2. Abrí `http://localhost:3000` y creá la cuenta de administrador con el correo
   y la contraseña que quieras.

**No hay que configurar ningún secreto**, ni para probar ni para dejarla en un
servidor. En el primer arranque se generan al azar, únicas por instalación:

| Secreto | Dónde queda |
|---|---|
| Contraseña de `postgres` (dueño de la base) | volumen `secrets` |
| Contraseña de `app_user` (con la que conecta la app) | volumen `secrets` |
| Secreto de firma de sesiones (`BETTER_AUTH_SECRET`) | volumen `appdata` |

Qué corre:

- **`secrets`**: corre `scripts/init-secrets.mjs` y termina. Genera las
  contraseñas que falten y no toca las existentes. Sin red; corre como root sólo
  para dejar cada archivo legible por quien lo usa (`0440`, carpeta `0750`).
- **`db`**: Postgres 17 con los datos en el volumen `pgdata`. No publica ningún
  puerto: sólo lo ven los otros servicios.
- **`migrate`**: corre `scripts/db-setup.mjs` y termina. Crea los roles de RLS
  (`anon` y `authenticated`), aplica las migraciones de `./drizzle` y fija la
  contraseña de `app_user`. Es idempotente y corre en cada `up`.
- **`app`**: la build `standalone` de Next, conectada como `app_user` (nunca
  como `postgres`), con healthcheck en `/api/health`. Publica el puerto
  `APP_PORT` (3000) **sólo en `127.0.0.1`** salvo que definas
  `APP_BIND_ADDRESS`.

`app` y `migrate` corren como usuario sin privilegios, sin capabilities de Linux
y con `no-new-privileges`; los logs rotan (3 × 10 MB).

## Desplegar en un servidor

"Servidor" es cualquier máquina que quede prendida y a la que se entre desde
otros dispositivos: una PC de la casa, una Raspberry Pi o un VPS. El deploy es
el mismo `docker compose up -d` de arriba; lo único que cambia es cómo la
exponés, y eso queda a tu elección.

### 1. La imagen

`ghcr.io/fdreer/mispesitos` se publica desde GitHub Actions sólo si pasan lint,
tipos y tests unitarios, para `linux/amd64` y `linux/arm64`. Tags: `latest`
(último push a `main`), `sha-<commit>` y `X.Y.Z` (tags `vX.Y.Z`).
`docker compose pull` baja sola la variante de tu arquitectura.

### 2. Preferencias (`.env`, opcional)

Todo tiene un valor por defecto que funciona. Si querés cambiar algo, creá un
`.env` junto al `docker-compose.yml` (ver `.env.example`):

- **`BETTER_AUTH_URL`**: la URL desde la que entra el navegador, exacta (esquema,
  dominio y puerto). El valor por defecto es `http://localhost:3000`; si entrás
  por otra (un dominio, la IP de la PC en la red), poné esa. Si no coincide,
  better-auth rechaza los requests con `INVALID_ORIGIN`, las cookies no salen
  `Secure` con HTTPS y los links de invitación apuntan mal.
- **`APP_PORT`** / **`APP_BIND_ADDRESS`**: puerto e interfaz donde escucha.
- **`MISPESITOS_VERSION`**: fijar un tag en vez de seguir `latest`.

**Creá la cuenta de administrador apenas levante.** Hasta entonces, el primero
que abra la URL se queda con el admin.

Instalaciones anteriores a la generación automática, que arrancaron con la
contraseña fija de `postgres` que traía el compose: `migrate` la detecta y la
rota sola a la generada en el próximo `up`; no hay que hacer nada.

### 3. Reverse proxy y HTTPS

La app escucha en `127.0.0.1:3000` del host. Si no usás proxy y querés entrar
desde otros dispositivos de la red, poné `APP_BIND_ADDRESS=0.0.0.0` y
`BETTER_AUTH_URL=http://<ip-de-la-pc>:3000`; sin HTTPS, sólo dentro de tu red.
Ojo en Linux: con `0.0.0.0` Docker abre el puerto saltándose `ufw` y
`firewalld`.

El proxy tiene que pasar el `Host` original (lo usan better-auth y la
verificación de origen de las Server Actions) y **un único** `X-Forwarded-For`
con la IP del cliente: el rate limit de better-auth descarta una cadena de varias
IPs (el primer valor puede estar falsificado) y entonces todos los clientes
comparten un mismo cupo de intentos de login.

**Caddy** (HTTPS automático; ya hace todo lo anterior por defecto):

```caddy
pesitos.midominio.com {
	encode zstd gzip
	header Strict-Transport-Security "max-age=31536000; includeSubDomains"
	reverse_proxy 127.0.0.1:3000
}
```

**Nginx** (con el certificado ya emitido, p. ej. con certbot):

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name pesitos.midominio.com;
    # ssl_certificate / ssl_certificate_key ...

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    client_max_body_size 2m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        # $remote_addr y no $proxy_add_x_forwarded_for: un solo valor, no falsificable.
        proxy_set_header X-Forwarded-For $remote_addr;
        # Streaming de Next (loading/Suspense).
        proxy_buffering off;
    }
}
```

Si el proxy corre en otra máquina, publicá con `APP_BIND_ADDRESS=<IP privada>` y
limitá ese puerto en el firewall del proveedor a la IP del proxy.

### 4. Actualizar

```bash
docker compose pull && docker compose up -d
```

`migrate` aplica las migraciones nuevas antes de que arranque la app nueva. Las
migraciones no tienen vuelta atrás automática, así que **hacé un backup antes**.
Para no recibir cada push a `main`, fijá `MISPESITOS_VERSION` a un tag
(`sha-abc1234` o `1.2.0`) y cambialo a mano; volver a una imagen anterior sólo
es seguro si la nueva no trajo migraciones.

**No borres sólo el volumen `secrets`** (`docker compose down -v` borra todos, y
eso está bien): con la base todavía en `pgdata`, las contraseñas nuevas no
coincidirían y `migrate` fallaría. Si pasa, se arregla desde adentro del
contenedor, que entra sin contraseña por el socket local:

```bash
docker compose exec db cat /secrets/postgres-password
docker compose exec db psql -U postgres -c "ALTER ROLE postgres PASSWORD '<el valor de arriba>'"
docker compose up -d
```

Postgres 17 → 18 (o cualquier cambio de versión mayor) **no** se hace cambiando
el tag de `db`: el volumen no es compatible. Hay que volcar, crear un volumen
nuevo y restaurar.

### 5. Backups

La base. El volcado se escribe dentro del contenedor y se copia afuera con
`docker compose cp`, así funciona igual en Windows, macOS y Linux (redirigir con
`>` la salida binaria de `docker compose exec` la puede corromper: con una TTY
en Linux y siempre en Windows PowerShell, que la re-codifica):

```bash
docker compose exec db pg_dump -U postgres -Fc -f /tmp/mispesitos.dump mispesitos
docker compose cp db:/tmp/mispesitos.dump ./mispesitos.dump
```

El volcado es todo lo que hace falta: las contraseñas del volumen `secrets` no
se respaldan, porque una instalación nueva genera las suyas. (Si querés que las
sesiones abiertas sobrevivan a una reinstalación, guardá también
`/app/data/auth-secret` del volumen `appdata`.) Copiá los volcados **fuera** de
la máquina; un `cron` diario con retención alcanza:

```cron
15 3 * * * cd /opt/mispesitos && docker compose exec -T db pg_dump -U postgres -Fc -f /tmp/m.dump mispesitos && docker compose cp db:/tmp/m.dump backups/mispesitos-$(date +\%F).dump && find backups -name '*.dump' -mtime +30 -delete
```

(En Windows, lo mismo con el Programador de tareas.)

Para restaurar en una instalación nueva: levantala primero con
`docker compose up -d` (así `migrate` crea los roles `app_user`,
`authenticated` y `anon`, que `pg_dump` no incluye, con las contraseñas nuevas)
y después:

```bash
docker compose stop app
docker compose cp ./mispesitos.dump db:/tmp/restore.dump
docker compose exec db pg_restore -U postgres -d mispesitos --clean --if-exists /tmp/restore.dump
docker compose start app
```

Probá la restauración al menos una vez antes de confiar en los backups.

### 6. Comprobar que quedó bien

```bash
docker compose ps                  # db y app "healthy"; migrate "exited (0)"
docker compose logs migrate        # ✓ Roles… ✓ Migraciones… ✓ app_user…
curl -fsS https://pesitos.midominio.com/api/health
curl -sI https://pesitos.midominio.com | grep -i strict-transport
ss -tlnp | grep 3000               # tiene que decir 127.0.0.1:3000, no 0.0.0.0
```

*(Si preferís desplegarlo con un Postgres externo o en otra plataforma de Node,
`pnpm db:setup` funciona contra cualquier Postgres 15+ y la app corre en
cualquier hosting Node 24+ con las variables de `.env.example`: o con
`pnpm build && pnpm start`, o compilando con `NEXT_OUTPUT=standalone` y corriendo
`.next/standalone/server.js`.)*

## Acceso privado e invitaciones

- **La primera cuenta que se crea es la del administrador.** Con eso el registro
  se cierra. Si la base ya tenía usuarios al aplicar la migración 0010, el más
  antiguo pasa a ser el admin. Hay un solo admin por instalación (lo impone un
  índice único).
- **El resto entra por invitación.** En `/ajustes/usuarios` el admin genera un
  link de un solo uso que vence a los 7 días, opcionalmente atado a un correo. El
  link se muestra una sola vez: en la base sólo queda su hash.
- **El cierre vive en el servidor**, en el hook de alta de usuario de better-auth
  (`src/auth.ts`), así que cubre tanto el formulario de registro como una llamada
  directa a `/api/auth/sign-up/email`.
- **Quitar el acceso** cierra las sesiones de esa persona y le impide abrir
  otras. Sus datos no se borran; el acceso se puede devolver.
- **El admin no ve finanzas ajenas.** La pantalla de usuarios sólo lee las tablas
  de auth; los datos de cada uno siguen detrás de RLS.

## Desarrollo local

Para correr la app fuera de Docker contra un Postgres local:

1. `pnpm install`
2. Copiar `.env.example` a `.env.local` y descomentar/completar la sección de
   desarrollo local:
   - `DATABASE_URL` y `MIGRATION_DATABASE_URL` — ver la sección de abajo, son dos
     cadenas distintas y ninguna reemplaza a la otra.
   - `APP_USER_PASSWORD` — `openssl rand -hex 24`
   - `BETTER_AUTH_SECRET` — `openssl rand -base64 32`
   - `BETTER_AUTH_URL` — `http://localhost:3100`. Tiene que coincidir **exacto** con
     el puerto en el que corre el servidor (`pnpm dev` levanta en el **3100**, no en
     el 3000): si no coincide, better-auth rechaza todo con `INVALID_ORIGIN`.
3. `pnpm db:setup` — crea los roles que falten, aplica las migraciones y le pone
   `APP_USER_PASSWORD` a `app_user`. Es idempotente. (`pnpm db:migrate` sigue
   existiendo y sólo migra.)
4. `pnpm dev` y abrir `http://localhost:3100`. La primera cuenta que crees es
   la de administrador.

### Dos cadenas de conexión, no una

`DATABASE_URL` y `MIGRATION_DATABASE_URL` apuntan a roles distintos a propósito.
No unificarlas: de esa separación depende la segunda capa de autorización de la app.

- **`DATABASE_URL`** — el rol de aplicación **`app_user`**, que **no** tiene
  `BYPASSRLS` ni `SUPERUSER`. Es la que usa la app (`src/db/client.ts`) para todo, siempre.
- **`MIGRATION_DATABASE_URL`** — el rol dueño de las tablas (`postgres`), sólo para
  DDL. Es la que usan los scripts `db:*` (drizzle-kit y `scripts/db-setup.mjs`).

**Por qué importa:** en Postgres el rol `postgres` es superusuario (y/o tiene
`BYPASSRLS`), lo que le gana incluso a `FORCE ROW LEVEL SECURITY`. Si al desplegar
`DATABASE_URL` queda apuntando al rol dueño en vez de a `app_user`, el aislamiento
entre usuarios desaparece: cualquier consulta que se olvide de pasar por `withUser()`
devuelve filas de todos los usuarios en vez de cero, y nada falla a la vista.

Contra eso hay un guard **en la app, no en los tests**: `src/db/client.ts` consulta
`pg_roles` y `src/lib/rls-guard.ts` decide, y si el rol conecta con `BYPASSRLS` o
como superusuario tira una excepción. Corre una vez por proceso, en el primer
`withUser()`, y a partir de ahí no pasa ninguna consulta: la app no arranca a
medias, deja de funcionar.

Aparte, y por otro camino, `pnpm test:db` corre `src/db/rls.db.test.ts`, que es el
test de integración del aislamiento en sí: verifica contra la base real que un
usuario no ve las filas de otro.

### Contraseña de `app_user`

Lo más simple: definí `APP_USER_PASSWORD` y corré `pnpm db:setup` (en Docker
Compose lo hace el servicio `migrate` automáticamente). Si preferís hacerlo a
mano, la migración 0004 crea `app_user` sin contraseña ni `LOGIN` para no dejar
secretos en git; después de `pnpm db:migrate` conectate como `postgres` y corré:

```sql
-- generar la contraseña (hex, no base64, para no tener que escapar nada en la URL):
-- openssl rand -hex 24
ALTER ROLE app_user LOGIN PASSWORD '<la-generada>';
```

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
- **Navegación adaptada por dispositivo:** riel lateral colapsable sólo en escritorio
  (`lg:block`) y barra inferior fija en móvil (`Inicio · Egresos · + · Ingresos · Más`),
  con carga rápida en hoja inferior casi a pantalla completa desde `+` y las rutas
  secundarias + sesión en `Más`.
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
- **Las tarjetas pagan por resumen** (migración 0012). Cada cuota de una compra con
  tarjeta cae en un resumen (`card_statement`, uno por tarjeta y mes) y vence cuando
  vence él; pagar el resumen paga todas sus cuotas con la misma fecha, y una cuota con
  tarjeta no se paga suelta. La base lo hace cumplir con triggers diferidos, y congela un
  resumen pagado. Las fechas de cada resumen se proponen con los días de la tarjeta y se
  corrigen con las reales; corregirlas no muda compras. Los dólares de un resumen pagados
  con pesos se leen como pesos al TC del pago y no tocan la posición en dólares. La
  cuenta vive en `src/lib/cards.ts`; el plan de una compra, en `src/server/card-plan.ts`.
- **El color de una categoría** es una clave de una paleta fija (`CATEGORY_PALETTE` en
  `src/lib/category-color.ts`), no un color libre: así ninguno se confunde con los de
  estado. Sin color elegido, la subcategoría hereda el del padre, y el padre sale del
  hash de su nombre, como antes.
- **Los listados y filtros tienen a la URL como fuente de verdad** (`src/lib/movement-query.ts`,
  `src/lib/date-presets.ts`, `src/lib/movement-list-view.ts`). Una sola barra
  (`MovementFilters`) comparte los controles para `/ingresos`, `/egresos` y `/informes`.
  El servidor consulta con `queryMovementsView` (`src/server/queries.ts`) para calcular en
  una sola pasada los conteos de estado, totales por estado de cuota, orden y recorte; en
  móvil, "Cargar más" pide la página siguiente vía Server Action.
- **Los informes respetan lo percibido y el historial por moneda** (`src/lib/report-query.ts`,
  `src/lib/reports-pnl.ts`, `src/lib/reports-cashflow.ts`). Ingresos vs Gastos consulta
  cuotas pagadas vía `listPaidInstallmentsForReport` (`src/server/queries.ts`, con
  `perceivedPayment` para dólares de tarjeta pagados con pesos) y enlaza cada celda a los
  listados filtrando por cuota pagada (`?por=pago`). Flujo de caja combina saldos y
  movimientos reales hasta hoy (con compras/ventas de dólares en cada moneda) con las
  cuotas impagas futuras por `due_date`, separando aparte las cuotas vencidas.
