# Mis Pesitos — Diseño v1

**Fecha:** 2026-08-09
**Estado:** **implementado**. Documento histórico: describe la intención de diseño,
no necesariamente lo que quedó en el código.

> Para lo que la app hace hoy, ver el [README](../../../README.md).
> Para lo que falta, [`docs/PENDIENTES.md`](../../PENDIENTES.md).
>
> **Dónde la implementación se apartó de este documento, a propósito:**
> - **§3 (versiones):** `eslint` quedó en 9.39.5 y no en 10.8.1 — el plugin de React
>   que trae `eslint-config-next` usa una API que ESLint 10 eliminó, y `pnpm lint`
>   no corría. `typescript` quedó en 5.9.3, fallback que el propio plan preveía.
>   Y el paquete `shadcn` sí es dependencia de producción: `globals.css` importa
>   `shadcn/tailwind.css`, así que sacarlo rompe el build.
> - **§4 (`paid_date` obligatorio si `paid`):** ahora lo hace cumplir una `CHECK` en
>   la base, no sólo la convención.
> - **§5.5 (sobreventa):** el spec dice que el resultado se calcula con el TC
>   promedio vigente; la implementación realiza resultado **sólo sobre la parte
>   respaldada**. La versión literal fabricaría una ganancia de la nada cuando la
>   posición está en cero.
> - **§7 (filtros de listas):** se construyó sólo el de estado. Los otros cuatro
>   existen en la capa de consultas, sin interfaz.

## 1. Objetivo

Aplicación web multiusuario de finanzas personales. Cada persona registra sus ingresos y
egresos, sigue lo que debe y lo que le deben, y ve en un dashboard cuánta plata tiene hoy y
cómo se proyecta hacia adelante.

No es un sistema de gestión: no hay clientes, proveedores, facturación ni contabilidad
formal. Es una herramienta para que una persona organice su plata.

Existe un intento previo en `C:\Users\franc\DEV\mis-pesitos` (Next.js + Clerk + Google
Sheets). Queda intacto como referencia; este proyecto arranca limpio en
`C:\Users\franc\DEV\mis-pesitos-app`.

## 2. Alcance

### Entra en la v1

- Registro e inicio de sesión con email/contraseña y con Google.
- Onboarding de una sola vez: saldo inicial en pesos y en dólares, y qué dólar se usa como
  referencia.
- Carga de ingresos y egresos con fecha, descripción, categoría, moneda, importe y
  vencimientos.
- Egresos en cuotas, con importe y fecha editables cuota por cuota.
- Marcar cada vencimiento como pagado o cobrado.
- Compra y venta de dólares, con resultado por diferencia de cambio.
- Categorías propias de cada usuario, con un set precargado al registrarse.
- Dashboard con saldo, resumen del mes, vencimientos, proyección de flujo y gasto por
  categoría.

### Queda afuera, explícitamente

Movimientos recurrentes. Presupuestos por categoría. Alertas por email. Cuentas compartidas
entre varias personas. Múltiples cuentas o billeteras (el saldo es global por moneda).
Adjuntar comprobantes. Importar resúmenes bancarios. Exportar a Excel o PDF. Metas de
ahorro. PWA y modo offline.

Ninguna de estas está descartada para siempre. Se deciden después de usar la v1 un mes real.

## 3. Stack

Todas las dependencias en su última versión al 2026-08-09.

| Paquete | Versión |
|---|---|
| next | 16.3.0 |
| react / react-dom | 19.2.8 |
| typescript | 7.0.2 |
| tailwindcss / @tailwindcss/postcss | 4.3.3 |
| drizzle-orm | 0.45.2 |
| drizzle-kit | 0.31.10 |
| better-auth | 1.6.26 |
| zod | 4.4.3 |
| postgres | 3.4.9 |
| recharts | 3.10.1 |
| lucide-react | 1.31.0 |
| clsx / tailwind-merge / class-variance-authority | 2.1.1 / 3.6.0 / 0.7.1 |
| vitest | 4.1.10 |
| eslint | 10.8.1 |
| @types/node | 26.2.0 |

Componentes de UI: **shadcn/ui**, instalados por CLI (no son una dependencia de
`package.json`, el código se copia al repo).

Gestor de paquetes: **pnpm**. Base de datos y hosting de Postgres: **Supabase**. Deploy:
**Vercel**.

Dos consecuencias de las versiones elegidas, a tener presentes al implementar:

- **Tailwind 4** es configuración en CSS. No hay `tailwind.config.ts`; el tema se declara con
  `@theme` en el CSS global y el plugin de PostCSS es `@tailwindcss/postcss`.
- **TypeScript 7** es el compilador nativo. Si alguna herramienta del ecosistema todavía no lo
  soporta, se baja a la última 5.x sin cambiar nada más del diseño.

## 4. Modelo de datos

Convención: identificadores de base y de código en inglés, textos de interfaz en español.
Claves primarias `text` con UUID. Todas las tablas propias llevan `user_id` con foreign key a
`user` y `on delete cascade`.

### Tablas de better-auth

`user`, `session`, `account`, `verification`, generadas por el adaptador de Drizzle de
better-auth. No se modifican a mano.

### `user_settings` — uno por usuario

| Columna | Tipo | Notas |
|---|---|---|
| user_id | text PK FK | |
| initial_balance_ars_cents | bigint | centavos |
| initial_balance_usd_cents | bigint | centavos |
| initial_balance_date | date | desde cuándo cuenta el saldo |
| preferred_rate | text | `blue` \| `oficial` \| `mep` |

Se crea en el onboarding. Sin fila de settings, la app manda al onboarding.

### `category`

| Columna | Tipo | Notas |
|---|---|---|
| id | text PK | |
| user_id | text FK | |
| name | text | |
| kind | text | `income` \| `expense` |
| archived | boolean | default false |

Único por `(user_id, name, kind)` **entre las no archivadas** — índice único parcial con
`where archived = false`. Así se puede archivar "Ocio" y volver a crearla más adelante sin
chocar con la vieja.

Las categorías no se borran si tienen movimientos: se archivan. Una categoría archivada no
aparece al cargar un movimiento, pero sí en los reportes históricos.

Set precargado al registrarse — Ingresos: Sueldo, Freelance, Ventas, Intereses, Otros.
Egresos: Alquiler, Expensas, Servicios, Supermercado, Transporte, Salud, Educación, Ocio,
Impuestos, Otros.

### `movement`

Se llama `movement` y no `transaction` para no confundirla con las transacciones de base de
datos, que en esta app se usan en cada lectura por el mecanismo de RLS.

| Columna | Tipo | Notas |
|---|---|---|
| id | text PK | |
| user_id | text FK | |
| kind | text | `income` \| `expense` \| `exchange` |
| description | text | |
| category_id | text FK nullable | obligatorio si kind ≠ exchange, siempre null si es exchange |
| date | date | cuándo ocurrió |
| currency | text | `ARS` \| `USD` |
| amount_cents | bigint | importe total, en centavos de `currency` |
| rate | numeric(12,4) | cotización usada; `1` cuando currency es ARS |
| direction | text nullable | `buy` \| `sell`; sólo cuando kind es exchange |
| created_at / updated_at | timestamptz | |

En un `exchange`, `currency` es siempre `USD`, `amount_cents` es la cantidad de dólares
operada y `rate` el tipo de cambio de la operación. El monto en pesos no se guarda: se deriva
como `amount_cents × rate`, así nunca puede quedar inconsistente con el TC.

### `installment`

| Columna | Tipo | Notas |
|---|---|---|
| id | text PK | |
| movement_id | text FK | cascade |
| user_id | text FK | duplicado para que RLS aplique sin join |
| number | integer | 1..n |
| amount_cents | bigint | |
| due_date | date | |
| paid | boolean | default false |
| paid_date | date nullable | obligatorio si paid |

**Regla estructural:** todo ingreso y todo egreso genera al menos un `installment`. Un
movimiento de contado es la cuota 1 de 1, con `due_date` igual a la fecha de pago prevista.
No hay una rama "tiene cuotas / no tiene cuotas" en ningún cálculo.

**Los `exchange` no generan installments.** Son instantáneos y afectan las dos monedas a la
vez; se procesan aparte en el cálculo de saldo.

**Invariante:** la suma de `amount_cents` de las cuotas de un movimiento es exactamente igual
al `amount_cents` del movimiento. Se valida en cada alta y en cada edición, y el formulario no
deja guardar si no cierra.

## 5. Reglas de negocio

### 5.0 Redondeo

Los importes son enteros de centavos, así que las sumas y restas son exactas. La única
operación que produce decimales es multiplicar por una cotización.

**Regla única:** `pesos_cents = round(usd_cents × rate)`, con redondeo al centavo más cercano
y medio hacia arriba. Vive en una sola función y ningún otro lugar del código convierte
monedas. Los resultados convertidos son siempre derivados: no se persiste ningún importe
calculado a partir de un `rate`.

### 5.1 Reparto de cuotas

Al indicar `n` cuotas sobre un total `T` en centavos: cada cuota vale `floor(T / n)` y **la
última absorbe la diferencia**. Ejemplo: 100,00 en 3 cuotas → 33,33 / 33,33 / 33,34.

Las fechas se generan mensualmente desde la fecha de la primera cuota. Si el día no existe en
el mes destino (un 31 en febrero), se usa el último día de ese mes.

Después de generadas, el usuario puede editar el importe y la fecha de cualquier cuota,
respetando la invariante de la suma.

### 5.2 Saldo actual

Sólo cuentan las cuotas efectivamente pagadas y los cambios ocurridos **a partir de**
`initial_balance_date`. Todo lo anterior ya está contenido en el saldo inicial.

```
saldo_ars = initial_balance_ars_cents
          + Σ cuotas pagadas de ingresos en ARS
          − Σ cuotas pagadas de egresos  en ARS
          − Σ (amount_cents × rate) de exchanges buy
          + Σ (amount_cents × rate) de exchanges sell

saldo_usd = initial_balance_usd_cents
          + Σ cuotas pagadas de ingresos en USD
          − Σ cuotas pagadas de egresos  en USD
          + Σ amount_cents de exchanges buy
          − Σ amount_cents de exchanges sell
```

Una cuota cuenta por su `paid_date`, no por su `due_date`.

### 5.3 Deudas y cobros

Cuotas con `paid = false`. Las de egresos son deudas, las de ingresos son cobros pendientes.
Vencido es `due_date < hoy`, tomando hoy en `America/Argentina/Buenos_Aires`.

### 5.4 Consolidación a pesos

- **Reportes históricos:** cada movimiento se convierte con **su propio `rate`**. Un gasto de
  USD 50 hecho a $1.200 vale $60.000 para siempre, aunque hoy el dólar esté a $2.000.
- **Saldo consolidado de hoy:** `saldo_ars + saldo_usd × cotización de hoy`, usando el dólar
  preferido del usuario. Se muestra siempre junto a los dos saldos por separado y aclarando a
  qué cotización se calculó, nunca reemplazándolos.

### 5.5 Posición en dólares y diferencia de cambio

Una función pura recorre en orden de fecha los eventos que tocan la tenencia de dólares,
llevando cantidad y costo total en pesos. `tc_promedio = costo_total / cantidad`.

| Evento | Efecto |
|---|---|
| **Entrada** — `exchange` buy, o cuota pagada de ingreso en USD | `cantidad += q`; `costo_total += q × rate` |
| **Salida** — `exchange` sell, o cuota pagada de egreso en USD | `resultado += (rate − tc_promedio) × q`; descarga `q × tc_promedio` del costo |

**Toda salida de dólares realiza resultado, se venda o se gaste.** La ganancia se generó
mientras se tenía la divisa; disponer de ella gastándola no es distinto de venderla. Es el
tratamiento estándar de una partida monetaria en moneda extranjera: se da de baja la tenencia
a costo, se registra la operación al tipo de cambio del día, y la diferencia es resultado.

La consecuencia práctica es que un egreso en dólares se valúa a lo que realmente costó ese
día. Comprar USD 100 a $1.000 y gastarlos cuando el dólar está a $1.500 registra un egreso de
$150.000 y un resultado por diferencia de cambio de $50.000, no un egreso de $100.000.

No hay dos ramas: entrada y salida, y el `rate` de cada movimiento es el tipo de cambio del
día en que ocurrió.

**Caso borde:** si se dispone de más dólares de los registrados, el resultado se calcula con el
`tc_promedio` vigente, la posición queda en cero y no en negativo, y la app avisa que faltan
movimientos por cargar. No se rechaza la operación.

Con posición cero, `tc_promedio` es cero y no se divide por cero.

### 5.6 Cotización sugerida

El servidor consulta `https://dolarapi.com/v1/dolares/{oficial|blue|bolsa}` según el dólar
preferido (`mep` mapea a `bolsa`), y cachea la respuesta 10 minutos.

El valor llega al formulario como **sugerencia editable**. Si la API falla o tarda, el campo
queda vacío y se completa a mano: **una API de terceros nunca bloquea la carga de un
movimiento**.

## 6. Autenticación y autorización

### Autenticación

better-auth con dos proveedores: email/contraseña y Google OAuth. Adaptador de Drizzle, con
las tablas de auth en la misma base que el resto.

Configuración externa necesaria en Google Cloud: crear el proyecto, configurar la pantalla de
consentimiento, generar credenciales OAuth de tipo aplicación web y registrar como redirect
URI `{BETTER_AUTH_URL}/api/auth/callback/google`, tanto para desarrollo como para producción.

### Autorización, en dos capas

**Capa 1 — todo el acceso a datos ocurre en el servidor.** Lecturas en Server Components,
escrituras en Server Actions. Ninguna consulta a la base sale del navegador y no se expone la
clave de Supabase al cliente. Un único módulo de acceso a datos obtiene la sesión, corta con
un redirect si no hay, y filtra cada consulta por `user_id`.

**Capa 2 — RLS en Postgres.** Las cuatro tablas propias tienen `row level security` activo,
con policies de la forma:

```sql
using (user_id = current_setting('request.jwt.claims', true)::json ->> 'sub')
```

El módulo de acceso a datos abre una transacción y, antes de cualquier consulta, ejecuta
`set local role authenticated` y `select set_config('request.jwt.claims', $1, true)` con el id
de usuario de la sesión ya verificada. Si algún query olvida su `WHERE`, la base devuelve cero
filas igual.

**No se usa el plugin de JWT de better-auth.** El servidor ya conoce el usuario autenticado
por la sesión; emitir un token, firmarlo y volver a validarlo contra JWKS sólo para
comunicarle a Postgres un dato que ya tiene a mano agrega infraestructura sin agregar
seguridad. El nombre `request.jwt.claims` se conserva porque es la convención que Supabase
espera.

## 7. Pantallas

| Ruta | Contenido |
|---|---|
| `/` | Landing corta con acceso al login. Pública. |
| `/login`, `/registro` | Email/contraseña y botón de Google. Públicas. |
| `/onboarding` | Saldo inicial ARS y USD, fecha y dólar preferido. Una sola vez. |
| `/dashboard` | Los cuatro bloques de la sección 7.1. |
| `/ingresos` | Lista filtrable y alta de ingresos. |
| `/egresos` | Ídem egresos, con el bloque de cuotas. |
| `/cambios` | Compra y venta de dólares, posición actual (cantidad y TC promedio) y resultado acumulado por diferencia de cambio, que incluye tanto las ventas como los pagos hechos en dólares. |
| `/categorias` | ABM de categorías, con archivar en lugar de borrar. |
| `/ajustes` | Saldo inicial, dólar preferido, datos de la cuenta. |

Todo lo que no sea `/`, `/login` y `/registro` exige sesión. Con sesión pero sin
`user_settings`, cualquier ruta redirige a `/onboarding`.

`/ingresos` y `/egresos` son **el mismo componente parametrizado por tipo**. El bloque de
cuotas sólo se renderiza para egresos.

### 7.1 Dashboard

1. **Saldo y mes en curso** — saldo en ARS, saldo en USD, consolidado del día con su
   cotización a la vista, e ingresos contra egresos del mes con la diferencia.
2. **Vencimientos** — próximos 30 días y vencidos, ordenados con lo atrasado primero, con
   botón de marcar pagado en la misma fila. Enlace a la lista filtrada por pendientes.
3. **Proyección de flujo** — gráfico de líneas del saldo proyectado por los próximos 6 meses,
   partiendo del saldo de hoy y aplicando las cuotas pendientes por su `due_date`. Las cuotas
   en dólares se convierten con el `rate` de su movimiento, no con la cotización del día: la
   proyección no especula con el dólar futuro.
4. **Categorías y evolución** — torta de egresos por categoría del mes, y barras de ingresos
   contra egresos de los últimos 12 meses.

Los bloques 3 y 4 se muestran consolidados en pesos; los saldos del bloque 1 siempre se
muestran también separados por moneda.

Filtros de las listas: tipo, categoría, moneda, rango de fechas y estado (pagado, pendiente,
vencido).

### 7.2 Presentación

Responsive, pensado para usarse desde el celular. Sin PWA ni offline.

Formato de moneda con `Intl.NumberFormat('es-AR')`. Fechas y "hoy" siempre en
`America/Argentina/Buenos_Aires`: la fecha se guarda como `date` sin hora, para que no se
corra un día por zona horaria.

## 8. Errores

- **Validación:** Zod en la entrada de cada Server Action. Es el borde de confianza; no se
  confía en la validación del formulario. Los errores vuelven tipados y se muestran al lado
  del campo.
- **dolarapi caído o lento:** el campo TC queda vacío y editable. Nunca bloquea.
- **Sesión vencida:** redirect a `/login`.
- **Suma de cuotas que no cierra:** el formulario no deja guardar y muestra la diferencia.
- **Errores de base:** mensaje genérico al usuario, detalle al log del servidor. No se filtran
  mensajes de Postgres a la interfaz.

## 9. Tests

Vitest sobre funciones puras, que es donde un error cuesta plata:

1. **Reparto de cuotas** — que la suma cierre exactamente, incluyendo el caso 100,00 en 3, y
   la generación de fechas con el borde del 31 en meses cortos.
2. **Posición en dólares y diferencia de cambio** — compra, venta con ganancia, venta con
   pérdida, ingreso en USD entrando a la posición al costo, egreso en USD realizando resultado
   igual que una venta, y el caso borde de disponer de más de lo registrado.
3. **Saldo** — que respete `initial_balance_date`, que sólo cuente cuotas pagadas y que los
   cambios muevan las dos monedas.

Sin tests de componentes ni end-to-end en la v1.

## 10. Variables de entorno

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Postgres de Supabase, por el session pooler |
| `BETTER_AUTH_SECRET` | Firma de sesiones |
| `BETTER_AUTH_URL` | URL base de la app |
| `GOOGLE_CLIENT_ID` | OAuth |
| `GOOGLE_CLIENT_SECRET` | OAuth |

Se documentan en `.env.example`. `.env.local` nunca se commitea.

## 11. Riesgos

- **TypeScript 7** es el compilador nativo y es reciente. Si alguna herramienta del ecosistema
  no lo soporta todavía, se baja a la última 5.x. No afecta ninguna otra decisión.
- **Tailwind 4** cambia la configuración a CSS. Hay que confirmar que la versión de shadcn/ui
  que instale el CLI sea la de Tailwind 4.
- **dolarapi.com** es un servicio gratuito sin garantía. Ya está mitigado: la app funciona
  entera sin él, sólo se pierde la sugerencia de cotización.
- **Saldo global sin cuentas** significa que la app no puede decir cuánta plata hay en el banco
  contra cuánta en la mano. Es una decisión tomada a conciencia; si más adelante hace falta,
  agregar cuentas implica una tabla nueva y una columna en `movement`.

## 12. Decisiones descartadas

| Se descartó | Por qué |
|---|---|
| Cuentas y billeteras múltiples | Se eligió saldo global por moneda. Menos fricción al cargar. |
| Monedas sin conversión | Se quiere consolidado y resultado por diferencia de cambio. |
| Cotización automática sin editar | El TC sugerido siempre tiene que poder corregirse. |
| Pagado inferido por fecha | Ocultaría justo los atrasos, que son lo que importa ver. |
| Dos formularios, cuotas iguales y plan flexible | Uno solo que genera iguales y deja editar cubre ambos. |
| Registrar el cambio de divisa como dos movimientos | Inflaría ingresos y egresos del mes con plata que no entró ni salió. |
| Recurrentes con tareas programadas | Fuera de alcance en la v1. |
| Astro | La app es casi toda pantalla logueada e interactiva; Astro no aporta ahí. |
| Supabase Auth | Se pidió better-auth explícitamente. |
| Plugin de JWT de better-auth para RLS | El servidor ya tiene el usuario verificado; el token no agrega seguridad. |
| Pantalla propia de Vencimientos | El bloque del dashboard más la lista filtrada ya lo cubren. |
