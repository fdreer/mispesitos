# Lo que falta y lo que se decidió no hacer

Estado al cierre de la v1. Todo lo que está acá es deliberado: no son cosas que se
olvidaron, son cosas que se dejaron afuera con un motivo, o que necesitan una
decisión que no es técnica.

Lo que **sí** está construido y verificado está en el [README](../README.md).

---

## 1. Decisiones que no son técnicas

Nadie puede resolverlas mirando el código: hay que elegir.

### 1.1 El dashboard: ¿caja o devengado?

Hoy conviven las dos definiciones, y cada bloque está rotulado para que no se
contradigan, pero siguen midiendo cosas distintas:

| Bloque | Qué suma |
|---|---|
| Tarjeta "Este mes" | cuotas **pagadas**, por su fecha de pago |
| Torta "por categoría" | el **importe total** de los movimientos cargados en el mes |
| Barras "últimos 12 meses" | ídem torta |

Un televisor de $1.200.000 en 12 cuotas cargado el 5 de agosto: la torta muestra
$1.200.000 y la tarjeta $100.000. Las dos lecturas son legítimas —una es la plata
que se movió, la otra es lo que se comprometió— y el spec no desambigua.

**La decisión es si las tres tienen que hablar de lo mismo, y de cuál.** Mientras
no se tome, la pantalla es honesta pero pide leer las etiquetas.

### 1.2 Desarchivar una categoría

Archivar es hoy **irreversible desde la interfaz**. Las archivadas se ven en
`/categorias`, diferenciadas de las activas, y los movimientos viejos siguen
mostrando su nombre — pero no hay forma de volver a activarlas.

No se construyó porque era alcance nuevo, no un arreglo. Es una tarea chica:
la columna `archived` ya existe y el índice único es parcial (sólo mira las
activas), así que desarchivar sólo puede fallar si mientras tanto se creó otra
categoría activa con el mismo nombre y tipo — y ese caso hay que resolverlo en la
interfaz, no en la base.

### 1.3 El mensaje de error de `saveSettings`

`src/server/actions/settings.ts` informa un mensaje genérico ante **cualquier**
error de base. Es el código tal como venía del plan y no se cambió sin decisión.

`createCategory`, en cambio, sí distingue: informa "nombre repetido" sólo cuando
Postgres devuelve el código de violación de unicidad, y genérico para todo lo
demás. Si se quiere el mismo criterio en los ajustes, el patrón ya existe en
`src/lib/db-errors.ts`.

### 1.4 El favicon

Sigue siendo el rombo de Next.js. Pide una decisión de diseño.

---

## 2. Deuda declarada de la v1

Se dejó afuera a propósito, con el alcance ya acordado.

- **Editar un movimiento ya guardado.** Se borra y se vuelve a cargar. El botón de
  borrar existe, pide confirmación y se lleva las cuotas por cascada. Agregar
  `updateMovement` es una tarea aparte y no bloquea usar la app.
- **Elegir la fecha de pago al marcar una cuota.** Siempre queda la fecha de hoy,
  calculada en el servidor con el reloj de Buenos Aires.
- **Cuatro de los cinco filtros de listas.** Se construyó sólo el de estado
  (pendiente / pagado / vencido), que es el que el dashboard usa para enlazar.
  Los otros cuatro que pide el spec —categoría, moneda, desde y hasta— **ya
  existen en la capa de consultas y están testeados**: falta sólo la interfaz.
- **Tema claro.** Desde el rediseño del 2026-08-10 la app tiene **un solo tema, el
  oscuro**: `:root` es la paleta de Linear y el bloque `.dark` no existe más. La
  variante `dark:` sigue declarada contra `.dark`, una clase que nadie agrega, así
  que las decenas de utilidades `dark:` que traen los componentes de shadcn quedan
  inertes. Volver a tener dos temas es alcance nuevo, no un arreglo.

---

## 3. Deuda técnica conocida

Cosas que van a morder en algún momento, con el aviso puesto.

### 3.1 Borrar un usuario con movimientos categorizados falla

Al borrar de `user`, la cascada llega a `category` antes que a `movement` y choca
contra el `ON DELETE RESTRICT` de `movement → category` (viene de la migración
`0002`). Hoy no hay pantalla de "borrar mi cuenta", pero `deleteUser` de
better-auth lo va a encontrar apenas se habilite. Cambiar ese `RESTRICT` es una
decisión de dominio: hay que definir qué pasa con los movimientos históricos de
una categoría borrada.

Mientras tanto, para borrar un usuario a mano: primero las cuotas, después los
movimientos, después el resto.

### 3.2 Las migraciones no son portables fuera de Supabase

La `0001` revoca privilegios a `anon` y `authenticated`, y la `0004` hace
`GRANT authenticated TO app_user`: los tres roles tienen que preexistir. Contra un
Postgres que no sea Supabase, `pnpm db:migrate` muere en la primera.

Además ni la `0006` ni la `0008` son idempotentes (`ADD CONSTRAINT` y
`DROP CONSTRAINT` sin `IF EXISTS`). No molesta porque drizzle-kit no reaplica lo
que ya registró, pero no se pueden correr dos veces a mano.

### 3.3 Detalles de interfaz

- **Los importes de las cuotas se editan en centavos crudos.** El total se tipea
  en pesos ("1.234,56") y el plan de cuotas se muestra y se edita en centavos
  ("41152"). La unidad sólo aparece en la etiqueta accesible del campo.
- **Los ejes de los gráficos salen sin formatear**, en formato numérico inglés,
  mientras el resto de la app usa formato argentino. Los tooltips sí están
  formateados.
- **El tipo de cambio no tiene un límite de negocio**, sólo el de la columna
  (`numeric(12,4)`: hasta 8 dígitos enteros y 4 decimales). Se rechaza lo que la
  columna no admite, con un mensaje del campo, pero nada impide cargar un dólar a
  $50.000.000 si alguien se equivoca de tecla.

### 3.4 Herramientas

La cobertura se mide con `pnpm test:coverage` (`@vitest/coverage-v8`). El
criterio sigue siendo el mismo —buscar el caso que rompe, no el porcentaje—,
pero ahora se puede ver qué quedó sin tocar.

**El esqueleto de carga está y anda.** `src/app/(app)/loading.tsx` sigue
existiendo como piso del grupo, pero desde el 2026-08-11 ya casi no se ve: las
seis pantallas transmiten su estructura por partes y cada una llega a su propio
esqueleto, que sí promete la forma correcta.

| Pantalla | Qué sale primero | Qué espera |
|---|---|---|
| `/ingresos`, `/egresos` | título; después botón "Nuevo" y barra de filtros | la tabla, con encabezados de verdad y filas en gris |
| `/dashboard` | título | todo lo demás, en un solo bloque |
| `/cambios` | título | todo lo demás, en un solo bloque |
| `/categorias` | título | las dos tarjetas |
| `/ajustes` | título y la tarjeta | los campos del formulario |

`/ingresos` y `/egresos` son las únicas que se parten en tres porque son las
únicas donde los datos son separables: las categorías (chicas) alimentan los
filtros y el desplegable de carga, y los movimientos con sus cuotas —la única
consulta que crece con el historial— alimentan sólo la tabla. En `/dashboard`
todo pasa por un único `buildDashboardView` que necesita las seis consultas
juntas, así que partirlo en cuatro límites sería partir también esa función sin
que ninguna de las partes llegara antes. En `/cambios` los datos sí serían
separables, pero un límite propio para el formulario lo montaría sin cotización
y lo reemplazaría al llegar, perdiendo lo que se hubiera tipeado en el medio:
por eso también va en un solo bloque. `/categorias` y `/ajustes` no tienen
ninguna consulta lenta que esconder y ganan poco tiempo — se hicieron igual
porque el esqueleto genérico les prometía cuatro tarjetas en fila y un bloque
grande, que no es la forma de ninguna de las dos.

Queda anotado acá porque estuvo borrado un rato por un diagnóstico equivocado, y
el modo de falla vale para cualquiera que verifique esta app con un navegador
automatizado:

**`requestAnimationFrame` no dispara en una pestaña de fondo, y React revela los
Suspense por ahí.** El script que React inyecta al final del HTML hace, cuando
llega el contenido de un boundary:

```js
a.previousSibling.data = "$~"; $RB.push(a, b);
2 === $RB.length && requestAnimationFrame($RV.bind(null, $RB))
```

O sea: marca el boundary, lo encola, y agenda el reveal en el próximo frame. Si
la pestaña está oculta —`document.visibilityState === "hidden"`, que es lo que
pasa cuando la maneja una herramienta y la ventana no está al frente— el
navegador congela `requestAnimationFrame` y ese reveal no ocurre nunca. El
resultado se ve exactamente como un bug de la app: el HTML llega entero, el
contenido queda dentro de un `<div hidden id="S:0">`, la consola no tira nada, y
el esqueleto se queda en pantalla para siempre.

Cómo se comprobó que era eso y no la app: en la pestaña oculta,
`requestAnimationFrame` no llamó a su callback en 3 segundos, y llamar a mano
`$RV($RB)` —justo lo que rAF tenía que hacer— reveló el contenido al instante,
tanto en el dashboard como en una ruta de prueba mínima sin auth ni base.

Para verificar pantallas con Suspense en esta app: mirá `document.visibilityState`
antes de creerle a lo que ves. Con la pestaña al frente el esqueleto se resuelve
solo.

Los tests de componente corren en la misma suite que los de lógica: los `.tsx`
declaran su entorno con `// @vitest-environment jsdom` en la primera línea, así
que el resto sigue corriendo en node y no paga jsdom.

La primera corrida dio 94.39% de statements (337/357), 91.2% de branches
(228/250), 89.09% de funciones (98/110) y 94.53% de líneas (294/311). Los tres
archivos que quedaron claramente por debajo del resto: `components/movement-form.tsx`
(75% stmts, 62.5% funcs), `components/ui/select.tsx` (72.72% stmts, 70% funcs)
y `lib/movement-asserts.ts` (75% stmts, 75% funcs).

La tabla sólo lista los archivos que la suite realmente importó, no el
proyecto entero. `src/db/**` no aparece porque `pnpm test` excluye
`*.db.test.ts` —esos corren aparte, por `pnpm test:db`, que sí los ejercita—
y buena parte de `src/server/actions/**` tampoco aparece por el mismo motivo.
Las pantallas de `src/app/**` y los formularios sin test propio (`ExchangeForm`,
`SettingsForm`, `CategoryManager`, `AuthForm`, ver sección 2) tampoco figuran:
no es que midan 0%, es que nada los importó en esta corrida.

### 3.5 Los colores de categoría son un hash, no una elección

Cada categoría tiene su color, y sale de un hash de su NOMBRE
(`src/lib/category-color.ts`): nadie lo elige y no se guarda en la base. Eso
tiene dos consecuencias que conviene saber antes de que sorprendan:

- **Renombrar una categoría le cambia el color.** Es deliberado (el color
  acompaña al nombre, que es lo que se reconoce), pero si en algún momento se
  quiere que el color sea estable ante renombres, hay que hashear el `id` y
  además hacer que la torta del dashboard reciba ids —hoy sólo recibe nombres—.
- **Dos categorías pueden compartir color.** Hay 235 tonos disponibles (los 360
  menos las dos bandas reservadas para el rojo/naranja/verde de los estados,
  ver el comentario del archivo), así que con pocas categorías es raro, pero
  posible. No se resolvió porque el nombre siempre está escrito adentro del
  badge: el color ayuda a encontrar, no es el que informa.

Elegir el color a mano por categoría es alcance nuevo: hace falta una columna
más, un selector en `/categorias`, y decidir qué pasa con las que ya existen.

---

## 4. Antes de desplegar

Cuatro cosas que fallan en producción y no en desarrollo:

1. **Cargar las dos cadenas de conexión.** Si `DATABASE_URL` queda apuntando al
   rol dueño en vez de a `app_user`, el aislamiento entre usuarios desaparece y
   nada falla a la vista. Hay un guard que tira, pero recién en la primera
   consulta. Ver la sección correspondiente del README.
2. **Aplicarle la contraseña a `app_user`** después de `pnpm db:migrate`. Es un
   paso manual: la migración crea el rol sin contraseña a propósito, para no dejar
   un secreto commiteado. Sin ese paso la app no conecta, y el error no se
   distingue de "la base está caída".
3. **`BETTER_AUTH_URL` con el dominio real**, y la URI de redirección de
   producción agregada en Google Cloud
   (`https://<dominio>/api/auth/callback/google`). Si no coinciden exacto,
   better-auth rechaza todo con `INVALID_ORIGIN` y Google con
   `redirect_uri_mismatch`.
4. **No correr `pnpm test:db` contra producción.** Siembra y borra filas con ids
   fijos sobre una base real.

---

## 5. El rediseño sobre el sistema visual de Linear (2026-08-10)

La app pasó del tema claro de shadcn al sistema visual de Linear: lienzo casi
negro, Inter de tracking cerrado en pesos 400–590, bordes capilares en vez de
sombras y el lima ácido `#e4f222` como única acción cromática. El plan y el spec
están en `docs/superpowers/`, con los desvíos anotados en sus encabezados.

Nada de esto cambió comportamiento: no se tocó ninguna Server Action, consulta,
esquema de Zod, migración ni tabla, y la suite quedó en 256 tests, la misma
cantidad que antes.

### 5.1 Lo que quedó sin verificar en el navegador

Se verificaron las ocho rutas con estilo computado, con sesión abierta. Lo que
**no** se llegó a mirar, y por qué:

- **`/onboarding`.** Redirige a `/dashboard` cuando la cuenta ya lo completó, y la
  única cuenta de prueba disponible ya lo había hecho. Hace falta un usuario
  recién creado.
- **Las filas de cuotas y los badges de estado de `/ingresos` y `/egresos`.** La
  cuenta de prueba no tiene movimientos cargados, así que `InstallmentRows` y los
  badges "N pendiente(s)" nunca se dibujaron. Ahí viven el radio de 4px del badge
  y las variantes de estado de la Task 2, y el botón `outline` de "Marcar pagada"
  de la Task 4.
- **El foco del `SelectTrigger`.** Los dos selects de shadcn viven en
  `movement-form.tsx` y `settings-form.tsx`. La regla es la misma que la de los
  inputs (`focus-visible:border-ring` más `focus-visible:ring-0`), y en los inputs
  sí se verificó que el borde salta a Mist con el teclado, pero el disparador no
  se midió.
- **Las capturas de pantalla.** Se verificó por estilo computado, no por imagen.

### 5.2 Lo que se decidió no hacer

Todo esto salió de la revisión final de branch y se dejó afuera a propósito:

- **La escala `text-13`.** Cuatro lugares usan `text-[13px]` (los links y el botón
  de la nav, y dos de la landing). Tailwind no le cuelga tracking ni interlineado
  a un tamaño arbitrario, así que esos cuatro son los únicos textos del sistema
  con tracking 0. La diferencia es de unos 0,13px por caracter.
- **Cortarle a Tailwind el escaneo de `docs/`.** Hoy el CSS de producción compila
  `text-emerald-600`, `max-w-5xl` y `font-bold` —tres clases que el rediseño
  borró del código— porque el plan y el spec las citan en sus bloques de código y
  Tailwind 4 escanea el proyecto entero. Se arregla con
  `@import "tailwindcss" source(none);` más un `@source` apuntando a `src/`.
- **Dos comentarios equivocados en `globals.css`.** El que explica la separación
  en dos bloques `@theme` afirma que `@theme inline` no emite la variable a
  `:root`; sí la emite. Y `--accent` está anotado "Slate" cuando la paleta de este
  proyecto llama Graphite a ese valor.
- **La píldora y el botón del hero de la landing comparten nombre accesible**
  ("Crear cuenta") y destino. Es el patrón habitual de una landing; si molesta, se
  diferencia con `aria-label` o cambiando el texto de uno de los dos.
- **`charts.tsx` mezcla constantes con nombre y hexadecimales sueltos** en el
  array `COLORS`, aunque los tres sueltos también tienen nombre en la paleta
  (`--color-ash`, `--color-iris-violet`, `--color-lavender`).
- **La barra activa de la nav se apila sobre el hairline** en vez de fundirse con
  él: son 3px de línea bajo la sección activa, no 2. Se resuelve con `-mb-px`.

### 5.3 Lo que hay que mirar la próxima vez que se abra el dashboard

El padding de tarjeta pasó de 16px a 24px en toda la app, y eso sólo se vio en
`/login`, que tiene una sola tarjeta grande. `/dashboard` tiene cuatro tarjetas de
saldo en fila, cada una con un `CardHeader` que ya traía su propio `pb-2`. No es
un defecto: es lo más probable que se vea apretado o suelto cuando alguien lo mire
con ojo de diseño.

### 5.4 La regla que el spec no traía

Sobre esta paleta **el relleno no puede llevar el estado**: Graphite sobre Void da
1.30:1 y `--secondary` da 1.09:1, los dos muy por debajo del 3:1 que WCAG pide
para señalar estado o borde. Por eso lo elegido cambia el color de la etiqueta
(Fog → Mist → Paper) y el relleno sólo acompaña. La nav, el filtro de estado y el
toggle de compra/venta ya siguen esa regla; cualquier control con estado que se
agregue tiene que seguirla también.

Es inherente a la estética de Linear, no un error del rediseño: Linear misma vive
con esos contrastes.

---

## 6. La corrección de la auditoría (2026-08-11)

Las doce tareas del plan `docs/superpowers/plans/2026-08-10-auditoria-v1.md`
están hechas y revisadas, más una revisión final sobre los 22 commits de la rama.
Lo que sigue es lo que quedó afuera.

### 6.1 Lo que el plan no toca porque es una decisión de negocio

Ya está en la sección 1 de este documento y sigue abierto: caja vs. devengado en
el dashboard (1.1), desarchivar categorías (1.2), el mensaje de error de
`saveSettings` (1.3) y el favicon (1.4).

### 6.2 La cobertura de componentes sigue siendo parcial

Después de la tarea 1 hay tests de `MovementForm` y de nada más. `ExchangeForm`,
`SettingsForm`, `CategoryManager` y `AuthForm` siguen sin una sola prueba.

Los tres huecos que esta sección declaraba se cerraron el 2026-08-12
(`src/components/installment-paid-button.test.tsx`, más dos describes nuevos en
`dashboard-view.test.ts` y `movement-asserts.test.ts`):

- **La concurrencia de las cuotas.** El `Set` de ids en vuelo que esta sección
  nombraba ya no existe: separar `InstallmentPaidButton` le dio a cada botón su
  propio `useTransition`, y ahí vive ahora esa lógica. Se testea lo que esa
  independencia promete —marcar una cuota no deshabilita las otras, un error se
  muestra y libera el botón, y el error de un intento no sobrevive al
  siguiente— con un doble de la Server Action que se resuelve a voluntad. No
  hicieron falta timers falsos.
- **El brazo de los cambios de divisa de `buildDashboardView`.** Compra, venta,
  el TC leído como número desde el `numeric` que Postgres entrega como string, y
  las dos direcciones inválidas que tienen que reventar en vez de contarse como
  venta.
- **`assertPaidDate`.** El `throw`, el mensaje, y el hecho deliberado de que no
  valide el formato.

### 6.3 Sin verificación por imagen

Todo lo visual de este plan se verificó a ojo en el navegador, no con capturas
comparadas.

### 6.4 Los hallazgos de la revisión final que se decidió no arreglar

Ninguno toca plata mal calculada, aislamiento entre usuarios ni un crash. Se
dejan anotados con su escenario, para que el próximo que los encuentre no tenga
que volver a razonarlos.

- **`logDbError` es una garantía sólo de las Server Actions.** Ninguna función de
  `src/server/queries.ts` tiene `try`/`catch`, así que un fallo de Drizzle
  durante el render lo loguea Next en crudo, con su `Failed query: … params: …`.
  Ahí los parámetros son ids de usuario y fechas, no valores de filas —los INSERT
  donde los parámetros SÍ son la fila pasan todos por Server Actions y están
  cubiertos—, pero el comentario del helper se lee como si la garantía fuera
  global.
- **El dashboard sigue pagando cuotas que descarta.** La tarea 4 dejó
  `MovementRow` sin cuotas, pero la página sigue llamando `listMovements`, cuya
  segunda consulta trae todas las cuotas de todos los movimientos de la ventana
  para que el mapeo de la página las tire. Con 200 movimientos en doce meses a
  doce cuotas son ~2400 filas traídas y serializadas por carga. Sigue siendo
  mucho mejor que traer toda la historia: es una optimización que quedó a mitad
  de camino, no una regresión.
- **`/cambios` lee `user_settings` dos veces.** `listUsdPositionEvents` abre su
  propia transacción y vuelve a seleccionar la fila del usuario, así que el
  `cache()` de la tarea 3 dedupeó sólo la mitad. El comentario de `getSettings`
  afirma ser "la única consulta de la app que se repite tal cual dentro del mismo
  request", y eso ya no es exacto.
- **`listUsdPositionEvents` conserva un `i.date!`** sobre el mismo invariante que
  `assertPaidDate` centralizó. Hoy es seguro sólo de casualidad: su filtro
  `gte(installment.paidDate, …)` no puede matchear un nulo. El día que ese filtro
  se mueva o se relaje, el `!` produce `undefined` en un `PositionEvent.date` y
  el orden de `usdPosition` empieza a reventar en vez de que falle el assert.
- **`installmentInput.amountCents` sigue admitiendo cero.** La cota `> 0` de la
  tarea 11 quedó sobre el importe total del movimiento. No se encontró ningún
  escenario que produzca plata mal: `installmentsSumMatches` obliga a que las
  partes sumen un total que ahora es mayor a cero, así que lo peor que sale es
  una fila de 0 centavos en un plan de 120 cuotas para un movimiento de un peso.
- **Los tipos exportados de `dashboard-view.ts` están de más, salvo uno.** De los
  siete, sólo `DashboardInput` lo importa alguien fuera del módulo. `UpcomingItem`
  además está redeclarado campo por campo como `Item` en `upcoming.tsx`, su único
  consumidor: dos definiciones de una misma forma que el compilador no va a
  mantener sincronizadas.
- **La medición de cobertura de la sección 3.4 es una foto.** Los números son
  exactos hoy y van a estar viejos apenas se agregue un test.

---

## 7. Filtros y paginación de ingresos/egresos (2026-08-11)

Ver el [spec](superpowers/specs/2026-08-11-filtros-paginacion-movimientos-design.md)
y el [plan](superpowers/plans/2026-08-11-filtros-paginacion-movimientos.md).

### 7.1 Lo que quedó sin verificar en el navegador

La pestaña de preview no compone en el entorno del agente: `visibilityState`
queda en `"hidden"`, `requestAnimationFrame` nunca corre y el contenido detrás
de Suspense no se revela. Es el mismo problema de §3.4, y forzar el reveal a
mano (`$RV($RB)`) muestra el HTML pero no corre los layout effects, así que
todo lo que dependa de clicks, de timers o de Radix queda fuera de alcance.

Lo que sí se comprobó, navegando a URLs reales y leyendo el DOM: la barra de
filtros se dibuja, las pills viejas de estado no están, los dos mensajes de
lista vacía salen cuando corresponde, y un `?status=` se parsea bien.

Lo que **nadie miró funcionando**, en orden de riesgo. Todo esto necesita una
cuenta con más de 20 movimientos; la de prueba tiene cero:

1. **La paginación, entera.** `MovementPagination` devuelve `null` con una sola
   página, así que todavía no dibujó un solo píxel en un navegador de verdad.
   Sin verificar: que aparezca debajo de la tabla, que clickear un número sea
   una transición de cliente y no una recarga completa (por eso el `<a>` del
   `PaginationLink` de shadcn pasó a ser un `next/link`), que la ventana de 5 se
   corra bien en los bordes, y que los filtros sobrevivan al cambio de página.
2. **Dos filtros seguidos.** Categoría y enseguida Estado, sin esperar a que
   cargue. Es la carrera que arregló `queryRef`; el mock de `push` nunca
   re-renderiza, así que la prueba real es esta.
2bis. **El calendario, entero.** Abrir el popover, armar un rango de dos clicks
   y cerrarlo: tiene que navegar una sola vez, con los dos días. Abrirlo y
   cerrarlo sin tocar nada no tiene que navegar. Un solo día y cerrar deja un
   filtro abierto ("desde", sin tope). Y el desplegable de año tiene que ofrecer
   años futuros: hay cuotas hasta 120 meses adelante.
3. **El atenuado de `useTransition`.** `pending` nunca es `true` en ningún test.
   Ojo con un atenuado que dure ~3s en vez de unos cientos de ms: eso es
   `fetchSuggestedRate` revalidando dolarapi dentro del mismo render.
4. **El debounce contra el router real.** Tres commits de esta rama son fixes de
   esa máquina, todos verificados con timers falsos.
5. **Abrir un Select de Radix y elegir.** En jsdom se simula con dos polyfills
   de puntero; la interacción real va por eventos de puntero y un portal.
6. **El diálogo "Nuevo" con la barra de filtros presente.** Clickear el label
   "Categoría" del formulario y que abra su propio desplegable. Es lo que
   rompía la colisión de ids, ya arreglada, pero nadie lo vio andar.
7. **Filtrar hasta cero con la tabla llena**, y **la página que se recorta**
   (ir a la 3, filtrar hasta menos de 20, y que muestre la última en vez de una
   tabla en blanco; la URL sigue diciendo `page=3`, y está bien que así sea).

### 7.2 Deuda técnica que la auditoría dejó abierta

- ~~**La vista sin filtros trae todo para mostrar 20.**~~ Resuelto el 2026-08-12
  con `listMovementsPage` (`src/server/queries.ts`): cuando `status === "all"` el
  recorte lo hace la base con `LIMIT`/`OFFSET` más un `count(*)`, y el costo deja
  de crecer con el historial. La rama con estado sigue trayendo todo y cortando
  con `paginate`, y no puede ser de otra manera: el estado se deriva de las
  cuotas, así que un LIMIT en SQL no sabe cuántas filas van a sobrevivir al
  filtro. El `orderBy` de las dos listas ganó un desempate por `id`: sin él, dos
  movimientos con el mismo `(date, created_at)` podían salir en distinto orden en
  cada consulta y el OFFSET repetía una fila y se comía otra.
- **`movement-pagination.tsx` tiene el agujero que se le tapó a la barra.** Arma
  sus enlaces desde la prop `query`, así que clickear una página mientras viaja
  un cambio de filtro navega a la URL anterior y descarta ese filtro. Es un
  server component: no puede ver el ref del cliente sin duplicar estado, que es
  justo lo que el §3.1 no quiere. Ventana chica, pero está.
- **Qué cuenta como "sin filtro" vive en cuatro lugares.** `buildMovementHref`
  decide qué omitir de la URL; `movement-screen.tsx` decide qué mandar como
  `undefined` a `listMovements`; y `hayFiltrosActivos` decide qué cuenta como
  filtrado. Agregar un sexto filtro —moneda es el candidato obvio— obliga a
  tocar los tres, y olvidarse de uno no falla: se porta mal en silencio.
- **La regla de §7.4 del spec no la cumple el paginador.** "Cualquier control
  nuevo que navegue en vez de mutar estado local" tendría que dar feedback de
  pendiente. `MovementPagination` no puede: es un server component.

---

## 8. La tanda crítica del 2026-08-12

Cinco cosas de este documento que rompían, mentían o dejaban un dato atrapado,
más los tres tests que faltaban. Ninguna necesitaba una decisión de negocio: las
que sí la necesitan siguen abiertas en la sección 1.

| Qué | Dónde |
|---|---|
| El boundary de último recurso, que faltaba | `src/app/global-error.tsx` |
| El `console.error` movido a un `useEffect` | `src/app/(app)/error.tsx` |
| El "Guardado." que ahora se apaga al primer cambio | `src/components/settings-form.tsx` |
| Las operaciones anteriores al saldo inicial: visibles, rotuladas y borrables | `src/app/(app)/cambios/page.tsx` |
| La página recortada por la base cuando no hay filtro de estado | `src/server/queries.ts`, `src/components/movement-screen.tsx` |

La suite pasó de 341 a 354 tests. `pnpm typecheck` y `pnpm lint` limpios.

### 8.1 Lo que se decidió no arreglar en esta tanda

- **El dashboard sigue trayendo cuotas que descarta** (§6.4). Es la otra mitad
  de la optimización que empezó la tarea 4 y toca una pantalla distinta.
- **El mensaje de error de `saveSettings`** (§1.3) y todo lo demás de la sección
  1: son decisiones, no arreglos.
- **`listUsdPositionEvents` lee `user_settings` dos veces** (§6.4).

### 8.2 Lo que quedó sin verificar en el navegador

El mismo techo de §3.4 y §7.1: la pestaña de preview queda en
`visibilityState === "hidden"`, `requestAnimationFrame` no dispara y los
Suspense no se revelan solos. Forzando el reveal a mano se lee el HTML del
servidor pero no corren los layout effects, así que nada que dependa de un click
se puede probar ahí.

Lo que **sí** se comprobó: las tres rutas tocadas responden 200 y pintan lo que
tienen que pintar —`/cambios` con sus tres tarjetas y el formulario, `/ingresos`
con "Todavía no cargaste nada acá." por el camino nuevo de `listMovementsPage`,
`/ingresos?status=pending&page=3` con "Ningún movimiento entra en el filtro." por
el camino viejo, y `/ajustes` con su formulario entero—.

Lo que **nadie miró funcionando**, todo por la misma razón: la cuenta de prueba
no tiene un solo movimiento ni un solo cambio de divisa cargado.

1. **El bloque de operaciones anteriores al saldo inicial.** Nunca se dibujó: hace
   falta un cambio de divisa fechado antes de `initialBalanceDate`. Sin verificar
   el rótulo, el atenuado y que el botón de borrar de esas filas saque la fila.
2. **El botón de borrar en las filas normales de `/cambios`.**
3. **El "Guardado." apagándose.** Guardar en `/ajustes`, ver el cartel, tocar un
   campo y que desaparezca. Los tres caminos que lo apagan son distintos: el
   `onChange` del form para los inputs de texto, el `onSelect` del calendario y
   el `onValueChange` del Select.
4. **La paginación real contra `listMovementsPage`**, que sigue siendo el punto 1
   de §7.1 y ahora además cambió de consulta: hace falta una cuenta con más de 20
   movimientos para ver que las páginas 2 y 3 traen filas distintas y que ninguna
   se repite.
5. **`global-error.tsx`.** Para verlo hay que romper el layout de `(app)` a
   propósito.
