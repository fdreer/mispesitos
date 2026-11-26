# Lo que falta y lo que se decidió no hacer

Estado al cierre de la v1. Todo lo que está acá es deliberado: no son cosas que se
olvidaron, son cosas que se dejaron afuera con un motivo, o que necesitan una
decisión que no es técnica.

Lo que **sí** está construido y verificado está en el [README](../README.md).

---

## 1. Decisiones que no son técnicas

Nadie puede resolverlas mirando el código: hay que elegir.

### 1.1 El dashboard: ¿caja o devengado?

~~Hoy conviven las dos definiciones.~~ **Resuelto el 2026-11-26** con el criterio de
lo percibido (§0 del plan v2): los tres bloques suman lo mismo, **cuotas pagadas por
su `paid_date`**, con el mismo corte del saldo inicial que usa el saldo.

| Bloque | Qué suma |
|---|---|
| Tarjeta "Este mes" | cuotas **pagadas**, por su fecha de pago |
| Torta "por categoría" | ídem, sólo egresos del mes en curso |
| Barras "últimos 12 meses" | ídem, ingresos y egresos de cada mes |

El televisor de $1.200.000 en 12 cuotas suma $100.000 en cada mes en que se paga una
cuota. Lo comprometido y todavía impago se ve en "Vencimientos" y en la proyección.

### 1.2 Desarchivar una categoría

~~Archivar es hoy **irreversible desde la interfaz**.~~ Resuelto el 2026-08-12,
ver §11: cada archivada tiene su botón "Desarchivar" en `/categorias`.

El choque de nombres que esta sección anticipaba se resolvió como decía —en la
interfaz, no en la base—: `unarchiveCategory` distingue el 23505 del índice
parcial y responde "Ya tenés una categoría activa con ese nombre." en la fila
que falló. Renombrar cuál de las dos es decisión de quien mira la pantalla; la
app no renombra ni archiva nada por su cuenta.

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

- ~~**Editar un movimiento ya guardado.**~~ Hecho el 2026-08-12, ver §11.
- ~~**Elegir la fecha de pago al marcar una cuota.**~~ Hecho el 2026-11-26 (Fase 1
  del plan v2): hoy por defecto, con un selector de fecha en el detalle de cuotas.
- ~~**Cuatro de los cinco filtros de listas.**~~ Los cuatro que faltaban están:
  categoría, desde y hasta con la barra de filtros del 2026-08-11 (§7), y moneda
  el 2026-08-12 (§11). Los cinco del spec, más el buscador por descripción.
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

- ~~**Los importes de las cuotas se editan en centavos crudos.**~~ Resuelto el
  2026-08-11 (commit `cb03182`): la fila muestra y acepta pesos, y al servidor
  siguen viajando centavos por un campo oculto.
- ~~**Los ejes de los gráficos salen sin formatear.**~~ Resuelto el 2026-08-12
  con `formatAxisPesos` (`src/lib/money.ts`), que los tres gráficos le pasan al
  `tickFormatter` del eje Y: separadores de miles argentinos y sin decimales,
  sin símbolo de moneda —lo dice el título de la tarjeta y lo repite el tooltip—.
  El eje X sigue mostrando la clave del mes cruda ("2026-08").
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

~~Nadie elige el color.~~ Resuelto en la Fase 2 del plan v2 (2026-11-26), ver
§13: `category.color` guarda una clave de una paleta fija, que se elige en
`/categorias`. Las que ya existían quedaron con `color` nulo y se siguen
pintando con el hash, así que se ven igual que antes; la subcategoría sin
color hereda el del padre. Lo que sigue vale para las que no tienen elección.

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
- ~~**Cortarle a Tailwind el escaneo de `docs/`.**~~ Resuelto el 2026-08-12:
  `globals.css` abre con `@import "tailwindcss" source(none);` más
  `@source "../"`. `pnpm build` confirma que `text-emerald-600`, `max-w-5xl` y
  `font-bold` ya no salen en el CSS, y que `bg-card`, `text-mist` y
  `rounded-xl` siguen saliendo.
- ~~**Dos comentarios equivocados en `globals.css`.**~~ Corregidos el
  2026-08-12: `@theme inline` sí emite la variable a `:root` —lo que hace es
  copiar el valor adentro de la utilidad, así que la variable deja de ser el
  punto de control—, y `--accent` quedó anotado Graphite.
- **La píldora y el botón del hero de la landing comparten nombre accesible**
  ("Crear cuenta") y destino. Es el patrón habitual de una landing; si molesta, se
  diferencia con `aria-label` o cambiando el texto de uno de los dos.
- ~~**`charts.tsx` mezcla constantes con nombre y hexadecimales sueltos**~~ en el
  array `COLORS`. Ya no aplica: ese array no existe más —el color de cada
  porción de la torta sale de `categoryColor`— y los cuatro colores que quedan
  en el archivo son constantes con nombre.
- ~~**La barra activa de la nav se apila sobre el hairline.**~~ Ya no aplica: la
  nav dejó de ser una barra horizontal con subrayado. Es el riel lateral de
  `app-sidebar.tsx`, donde lo activo se marca con fondo (`bg-accent`) y color de
  etiqueta, sin ninguna línea que se apile contra el borde.

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

~~Después de la tarea 1 hay tests de `MovementForm` y de nada más. `ExchangeForm`,
`SettingsForm`, `CategoryManager` y `AuthForm` siguen sin una sola prueba.~~
Cerrado el 2026-08-12: los cuatro tienen su archivo al lado
(`exchange-form.test.tsx`, `settings-form.test.tsx`,
`category-manager.test.tsx`, `auth-form.test.tsx`). Qué se fijó en cada uno:

| Componente | Lo que sostienen los tests |
|---|---|
| `ExchangeForm` | el TC sugerido cambia al pasar de compra a venta (es lo que el `key={direction}` viene a garantizar), el sentido nunca queda vacío, la fecha sale del calendario al campo oculto, y el error se muestra sin refrescar |
| `SettingsForm` | el "Guardado." aparece y se apaga por los TRES caminos distintos: el `onChange` del form, el `onSelect` del calendario y el `onValueChange` del Select. Con `redirectTo` no sale y navega |
| `CategoryManager` | activas y archivadas separadas, el error de archivar cae en la fila que falló y no en la de al lado, y no sobrevive al intento siguiente |
| `AuthForm` | login y registro mandan lo que corresponde, el error se muestra (con mensaje o con el genérico), no navega, y el camino de Google deja de ser mudo cuando falla |

Los que siguen sin test propio son los de sólo presentación
(`CategoryBadge`, `StatusBadge`, `InfoHint`, `BalanceCards`) y las pantallas de
`src/app/**`.

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

- ~~**`logDbError` es una garantía sólo de las Server Actions.**~~ El hecho sigue
  siendo cierto —ninguna función de `src/server/queries.ts` tiene `try`/`catch`,
  así que un fallo de Drizzle durante el render lo loguea Next en crudo— pero
  desde el 2026-08-12 el comentario del helper lo dice con todas las letras en
  vez de leerse como una garantía global. Los parámetros de esas consultas son
  ids de usuario y fechas; los INSERT donde los parámetros SÍ son la fila pasan
  todos por Server Actions.
- ~~**El dashboard sigue pagando cuotas que descarta.**~~ Resuelto el 2026-08-12
  con `listMovementRows` (`src/server/queries.ts`), que es la misma consulta sin
  el `conCuotas`. `MovementRow` no lleva cuotas desde la tarea 4, así que la
  segunda consulta traía ~2.400 filas por carga (200 movimientos a doce cuotas)
  para que el mapeo de la página las tirara.
- ~~**`/cambios` lee `user_settings` dos veces.**~~ Resuelto el 2026-08-12:
  `listUsdPositionEvents` lee el saldo inicial por `getSettings` en vez de
  seleccionar la fila por su cuenta, así que el `cache()` de la tarea 3 la
  dedupea entera.
- ~~**`listUsdPositionEvents` conserva un `i.date!`.**~~ Resuelto el 2026-08-12:
  pasa por `assertPaidDate`, igual que `listPaidInstallments`. Antes era seguro
  sólo de casualidad —su filtro `gte(installment.paidDate, …)` no matchea un
  nulo—, así que el día que ese filtro se relajara entraba un `undefined` a
  ordenar en vez de fallar el assert.
- **`installmentInput.amountCents` sigue admitiendo cero.** La cota `> 0` de la
  tarea 11 quedó sobre el importe total del movimiento. No se encontró ningún
  escenario que produzca plata mal: `installmentsSumMatches` obliga a que las
  partes sumen un total que ahora es mayor a cero, así que lo peor que sale es
  una fila de 0 centavos en un plan de 120 cuotas para un movimiento de un peso.
- ~~**Los tipos exportados de `dashboard-view.ts` están de más, salvo uno.**~~
  Resuelto el 2026-08-12: quedan exportados dos, `DashboardInput` (que importa
  su test) y `UpcomingItem` (que ahora importa `upcoming.tsx`, donde estaba
  redeclarado campo por campo como `Item`). Los otros cinco son internos del
  módulo.
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
- ~~**Qué cuenta como "sin filtro" vive en cuatro lugares.**~~ Resuelto el
  2026-08-12 con `FILTER_DEFAULTS` (`src/lib/movement-query.ts`): cada filtro
  con su valor de "sin filtro", en una sola tabla. De ahí salen las tres
  decisiones que antes se repetían —qué se escribe en la URL
  (`buildMovementHref`), qué cuenta como pantalla filtrada (`hayFiltrosActivos`)
  y qué viaja a la consulta (`movementFiltersFromQuery`, que reemplaza al objeto
  que armaba a mano `movement-screen.tsx`)—. Agregar un sexto filtro sigue
  pidiendo tocar `MovementQuery`, el parser y la barra; lo que ya no puede pasar
  es que uno de esos tres se olvide y la pantalla se porte mal en silencio.
- ~~**La regla de §7.4 del spec no la cumple el paginador.**~~ Resuelto el
  2026-08-12 con `LinkPending` (`src/components/link-pending.tsx`), un
  envoltorio de cliente que usa `useLinkStatus` de `next/link`: el estado lo
  provee el propio `Link`, así que el paginador sigue siendo un server component
  y el enlace clickeado se atenúa mientras la navegación viaja. Sólo se atenúa
  ese enlace: el hook informa del `Link` más cercano y nada más.

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
  *(Hecho en la tanda siguiente, ver §9.)*
- **El mensaje de error de `saveSettings`** (§1.3) y todo lo demás de la sección
  1: son decisiones, no arreglos.
- **`listUsdPositionEvents` lee `user_settings` dos veces** (§6.4).
  *(Hecho en la tanda siguiente, ver §9.)*

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

---

## 9. La segunda tanda del 2026-08-12

Ocho puntos de este documento que no necesitaban ninguna decisión de negocio:
dos de consultas que traían de más, uno de un `!` que se apoyaba en un filtro,
uno de formato, dos de CSS y dos de comentarios que prometían lo que no era.
Además, cuatro entradas que ya no aplicaban: el código las había resuelto o
reemplazado y el documento seguía anotándolas.

| Qué | Dónde | Sección |
|---|---|---|
| El dashboard dejó de traer las cuotas que descartaba (`listMovementRows`) | `src/server/queries.ts`, `src/app/(app)/dashboard/page.tsx` | §6.4 |
| `listUsdPositionEvents` lee el saldo inicial por `getSettings`, memoizado | `src/server/queries.ts` | §6.4 |
| El `i.date!` pasó a `assertPaidDate` | `src/server/queries.ts` | §6.4 |
| Los ejes de los gráficos, en formato argentino (`formatAxisPesos`) | `src/lib/money.ts`, `src/components/dashboard/charts.tsx` | §3.3 |
| Tailwind dejó de escanear `docs/` | `src/app/globals.css` | §5.2 |
| Los dos comentarios equivocados de `globals.css` | `src/app/globals.css` | §5.2 |
| El alcance real de `logDbError`, escrito en su comentario | `src/lib/log-db-error.ts` | §6.4 |
| Cinco tipos de `dashboard-view.ts` dejaron de exportarse; `Upcoming` importa `UpcomingItem` en vez de redeclararlo | `src/lib/dashboard-view.ts`, `src/components/dashboard/upcoming.tsx` | §6.4 |

La suite pasó de 354 a 357 tests (los tres nuevos son de `formatAxisPesos`).
`pnpm typecheck`, `pnpm lint` y `pnpm build` limpios.

### 9.1 Lo que se decidió no tocar

- **Todo lo de la sección 1**, que sigue esperando una decisión: caja vs.
  devengado en el dashboard, desarchivar categorías, el mensaje de error de
  `saveSettings` y el favicon.
- **`installmentInput.amountCents` sigue admitiendo cero** (§6.4). Subirlo a
  `> 0` rompe un caso legítimo y raro —un peso en 120 cuotas, donde el reparto
  genera filas de cero centavos— y el propio §6.4 ya dice que no hay escenario
  que produzca plata mal. Cambiarlo pide tocar antes `buildInstallments`, que es
  quien reparte.
- **El eje X de los gráficos** sigue mostrando `2026-08` en vez de `ago 26`.
  Nadie lo anotó como defecto; es la forma en que `monthKey` devuelve el mes.
- **El tipo de cambio sin cota de negocio** (§3.3). La cota de la columna ya
  está y da un mensaje del campo; poner un techo tipo "un dólar no vale más de
  X" es una regla inventada, o sea una decisión.

### 9.2 Lo que quedó sin verificar en el navegador

El mismo techo de §3.4, §7.1 y §8.2: la pestaña de preview queda en
`visibilityState === "hidden"`, así que los Suspense no se revelan y Recharts
—que mide su contenedor en un layout effect— no llega a dibujar un solo tick.

Lo que **sí** se comprobó: `pnpm build` compila, el CSS de producción ya no
trae `text-emerald-600`, `max-w-5xl` ni `font-bold` y sí sigue trayendo
`bg-card`, `text-mist` y `rounded-xl`; y con el servidor de desarrollo, `/login`
sigue pintando Void de fondo, Mist de texto, Inter y 12px de radio de tarjeta
—o sea que `source(none)` no se comió nada—, y `/cambios` responde 200.

Lo que **nadie miró funcionando**:

1. **Los ejes con el formato nuevo.** El formateo en sí está testeado
   (`src/lib/money.test.ts`), pero que el eje entre en los 80px de ancho con un
   saldo de ocho cifras hay que verlo en pantalla.
2. **El dashboard con datos** después del cambio de consulta. La cuenta de
   prueba no tiene movimientos, así que la torta y las barras salen vacías.

---

## 10. La tercera tanda del 2026-08-12

Lo que quedaba en el documento sin necesitar una decisión: dos deudas de §7.2 y
el hueco de cobertura de §6.2.

| Qué | Dónde | Sección |
|---|---|---|
| "Sin filtro" se define una sola vez (`FILTER_DEFAULTS`) y de ahí salen la URL, el mensaje de lista vacía y los filtros de la consulta | `src/lib/movement-query.ts`, `src/components/movement-screen.tsx` | §7.2 |
| El paginador avisa que tomó el click (`LinkPending` + `useLinkStatus`) | `src/components/link-pending.tsx`, `src/components/movement-pagination.tsx`, `src/components/ui/pagination.tsx` | §7.2, §7.4 del spec |
| Los cuatro componentes que no tenían una sola prueba | `exchange-form`, `settings-form`, `category-manager`, `auth-form` (`.test.tsx`) | §6.2 |

La suite pasó de 357 a 388 tests. `pnpm typecheck`, `pnpm lint` y `pnpm build`
limpios.

De los tests nuevos, dos cubren cosas que §8.2 dejó anotadas como "nadie las
miró funcionando" y que ahora al menos las sostiene una prueba: el "Guardado."
apagándose por sus tres caminos, y el error de archivado en la fila correcta.
Sigue sin verificarse en un navegador de verdad — es un techo de entorno, no de
cobertura.

### 10.1 Lo que se decidió no tocar

- **El agujero de `movement-pagination.tsx`** (§7.2): clickear una página
  mientras viaja un cambio de filtro navega a la URL anterior. Taparlo pide
  compartir el `queryRef` del cliente entre la barra y el paginador, o sea subir
  estado y duplicar lo que la URL ya dice — justo lo que la §3.1 del spec no
  quiere. La ventana es de milisegundos y el resultado es un filtro perdido, no
  un dato mal.
- ~~**El sexto filtro (moneda)**~~, que §2 listaba como deuda declarada de la
  v1. Hecho en la tanda siguiente (§11), y costó exactamente los tres lugares
  declarados que esta sección anticipaba.
- **Todo lo de la sección 1**, que sigue esperando una decisión.

### 10.2 Lo que quedó sin verificar en el navegador

El paginador atenuado. Hace falta una cuenta con más de 20 movimientos para que
`MovementPagination` dibuje un solo píxel, y la de prueba tiene cero: sigue
siendo el punto 1 de §7.1. `useLinkStatus` sólo reporta `pending` durante una
navegación real, así que en los tests siempre se dibuja apagado.

---

## 11. La cuarta tanda del 2026-08-12

Tres pendientes que ya no eran arreglos sino alcance nuevo, elegidos
explícitamente. El cuarto candidato —el favicon, §1.4— sigue abierto, y la
sección 1 entera también: se decidió dejar el dashboard como está (§1.1, caja y
devengado conviviendo con sus rótulos). *Revisado el 2026-11-26: §1.1 y la fecha
de pago se resolvieron en la Fase 1 del plan v2, ver §12.*

| Qué | Dónde | Sección |
|---|---|---|
| Desarchivar una categoría, con el choque de nombre resuelto en la fila | `src/server/actions/categories.ts`, `src/components/category-manager.tsx` | §1.2 |
| Editar un movimiento guardado, sin perder las cuotas ya pagas | `src/server/actions/movements.ts`, `src/components/movement-form.tsx`, `movement-form-dialog.tsx`, `movement-list.tsx` | §2 |
| El sexto filtro: moneda | `src/lib/movement-query.ts`, `src/components/movement-filters.tsx` | §2, §7.2, §10.1 |

La suite pasó de 388 a 406 tests, más 12 de base que sólo corren con
`pnpm test:db`. `pnpm typecheck`, `pnpm lint` y `pnpm build` limpios.

### 11.1 Editar un movimiento: qué se decidió

El plan de cuotas se rehace **entero** con el que manda el formulario —el mismo
`movementSchema` que el alta— pero el pago no se pierde: `paid` y `paid_date` se
conservan emparejando por **número** de cuota.

Eso deja un solo caso donde editar podría hacer desaparecer plata, y se
**rechaza antes de escribir nada**: bajar el plan por debajo del número de una
cuota ya paga. Con la 3 paga y un plan nuevo de 2, `updateMovement` responde
"La cuota 3 está paga: no podés dejar el plan en 2. Desmarcala primero." La cota
la calcula `highestPaidNumber` (`src/lib/installments.ts`), que es el número más
alto y no la cantidad de pagas: las cuotas se marcan en cualquier orden, así que
"hay dos pagas" no dice cuál es el plan más chico que las conserva.

Lo que un cambio de importe **sí** hace es mover lo que dice una cuota ya paga:
si la 1 estaba paga en $100.000 y el total pasa a $360.000 en tres, la 1 queda
paga en $120.000. Es lo que significa corregir un importe cargado mal, y es por
eso que la acción revalida `/dashboard` además de la lista.

Dos cosas que la acción **no** hace, a propósito:

- **No escribe `kind`.** El formulario lo manda porque comparte esquema con el
  alta, pero un ingreso no se vuelve un egreso: cambiaría de pantalla y la
  acción estaría revalidando la que la persona ya no está mirando. El `kind` que
  decide qué revalidar sale de la fila, no del formulario.
- **No toca los cambios de divisa.** `EDITABLE_KINDS` los deja afuera del WHERE,
  así que un id de `exchange` sale por la misma rama que un id que no existe. Un
  cambio no tiene cuotas ni categoría; reescribirlo con la forma de un
  movimiento común dejaría a `/cambios` leyendo una fila que ya no es un cambio.

El TC que muestra el formulario editando es el que se guardó —el del día de la
operación—, no el sugerido de hoy, y viaja con coma decimal: `parseDecimalInput`
lee un punto solitario seguido de tres dígitos como separador de miles, así que
un TC de 1.234 puesto con punto volvería como 1234.

### 11.2 Lo que se decidió no tocar

- **Todo lo que queda de la sección 1**: el favicon (§1.4), el mensaje de error
  de `saveSettings` (§1.3) y el dashboard, que se decidió dejar como está
  (§1.1) — las dos lecturas conviven, cada bloque con su rótulo.
- **Elegir la fecha de pago al marcar una cuota** (§2): sigue siendo hoy.
- **Tema claro** (§2), **los colores de categoría a mano** (§3.5), **el agujero
  del paginador** (§7.2) y **el tipo de cambio sin cota de negocio** (§3.3).
- **El agujero de `movement-pagination.tsx` no creció con el filtro nuevo**: la
  moneda entra por la misma barra y el mismo `queryRef`, así que hereda la
  ventana de milisegundos que §10.1 ya declaró y no agrega ninguna.

### 11.3 Lo que quedó sin verificar

**Los doce tests nuevos de base no se corrieron.** `pnpm test:db` siembra y
borra filas con ids fijos contra la base que diga `.env.local`, y el punto 4 de
la sección 4 prohíbe correrlo contra producción: a qué base apunta esa cadena no
es una decisión que se pueda tomar leyendo el código. Son los ocho de
`updateMovement` y los cuatro de `unarchiveCategory`, cada uno en su propio
describe. Todo lo que **sí** se pudo probar sin base está verde:
`highestPaidNumber` con su tabla de casos, el formulario de edición, la barra de
filtros y el manejador de categorías.

El resto es el mismo techo de §3.4, §7.1, §8.2 y §9.2: la pestaña de preview
queda en `visibilityState === "hidden"`, los Suspense no se revelan solos y nada
que dependa de un click se puede probar ahí. Lo que **nadie miró funcionando**:

1. **El diálogo de edición, entero.** Abrirlo desde una fila desplegada, cambiar
   algo y guardar. Los tests montan `MovementForm` y `MovementList` directo; el
   `Dialog` de Radix real, portado al `<body>` sobre una tabla, no.
2. **El rechazo por cuota paga.** Hace falta un movimiento con cuotas, una
   marcada, y bajar el plan. Sin base no hay forma de verlo.
3. **La barra de filtros con seis campos.** El desplegable de moneda entra en
   una fila que ya tenía cuatro; en pantallas angostas puede envolver distinto.
   El esqueleto reserva el mismo ancho (`FIELD_WIDTH.currency`), así que si algo
   se ve mal se va a ver mal igual antes y después de que lleguen los datos.
4. **Desarchivar una categoría.** El botón, el error de nombre repetido cayendo
   en la fila correcta, y la fila volviendo al bloque de activas.

---

## 12. Fase 1 del plan v2 (2026-11-26)

La fase "Base" de `docs/superpowers/specs/2026-11-26-v2-plan.md` (§6), apoyada en
el criterio de lo percibido (§0) y en §5.1 / §5.3 / §5.5 de ese plan.

| Qué | Dónde | Sección |
|---|---|---|
| Torta y barras suman cuotas pagadas por `paid_date`, igual que "Este mes" | `src/lib/dashboard-view.ts`, `src/server/queries.ts` (`listPaidInstallments` trae `categoryId`), `src/app/(app)/dashboard/page.tsx` | §1.1 |
| Toasts (shadcn `sonner`) para confirmar las acciones | `src/components/ui/sonner.tsx`, `src/app/layout.tsx`, formularios y botones de acción | — |
| Fecha de pago elegible, hoy por defecto y nunca futura | `resolvePaidDate` en `src/lib/installments.ts`, `setInstallmentPaid`, `installment-paid-button.tsx` | §2 |
| "Pagar"/"Cobrar" en la fila y en la tarjeta móvil, con la próxima cuota y "Deshacer" | `nextUnpaidInstallment` y `describeNextInstallment` en `src/lib/installments.ts`, `movement-row-actions.tsx`, `installment-toasts.ts` | — |
| Menú ⋯ por fila con Editar y Borrar (en rojo) | `movement-row-actions.tsx`, `movement-form-dialog.tsx` y `delete-movement-button.tsx` controlables desde afuera | — |

La suite pasó a 447 tests; falla sólo el que ya fallaba antes (el tope de 120
filas en `movement-form.test.tsx`). `tsc --noEmit` y `eslint` limpios (queda el
aviso previo de `<img>` en `app-sidebar.tsx`), y `next build` pasa dentro de la
imagen de Docker.

### 12.1 Qué se decidió

- **Un solo corte para los tres bloques.** La torta y las barras usan el mismo
  filtro que la tarjeta "Este mes": sólo lo pagado desde la fecha del saldo
  inicial, porque lo anterior ya está adentro de ese saldo. Así la torta y la
  barra del mes en curso suman exactamente lo que la tarjeta. La contracara: las
  barras de meses anteriores al saldo inicial quedan en cero aunque haya cuotas
  pagadas cargadas con esas fechas.
- **La próxima cuota es la impaga de número más bajo**, no la de vencimiento
  más cercano: "Cuota 3/12" tiene que hablar de la tercera aunque un vencimiento
  se haya editado a mano.
- **"Pagar" desde la fila siempre usa hoy.** Para otra fecha está el calendario
  de cada cuota, con la fila desplegada. Una fecha futura se rechaza en el
  servidor: con lo percibido, una cuota existe el día que la plata sale.
- **Marcar no confirma, desmarcar sí.** Marcar tiene el toast con "Deshacer"
  como red; desmarcar saca plata de lo percibido y pide confirmación.
- **Los ingresos dicen "Cobrar" / "Cobrada"** en lugar de "Pagar" / "Pagada".
- **La celda de acciones corta la propagación de clics y teclas.** React
  propaga los eventos a través de los portales: sin eso, pagar desplegaba la
  fila, y escribir un espacio en el formulario de edición la plegaba y se comía
  el espacio.
- **`listMovementRows` se borró**: era sólo del dashboard, que ya no lee
  movimientos sino cuotas pagadas.
- **El Toaster no usa `next-themes`**: la app tiene un solo tema (§2).

### 12.2 Lo que se verificó y lo que no

Verificado en el navegador, escritorio y móvil, contra la instalación Docker
local (no contra la base de `.env.local`): pagar desde la fila sin desplegarla,
"Deshacer", marcar con una fecha anterior, el calendario con los días futuros
deshabilitados, la confirmación al desmarcar, Editar y Borrar desde el menú ⋯,
un único toast por guardado, y la torta sumando cuotas y no el total del
movimiento.

**`pnpm test:db` no se corrió**, por el mismo motivo que §11.3: apunta a la base
de `.env.local`. El test de `listPaidInstallments` se actualizó para esperar
`categoryId`.

Quedó afuera de esta fase, aunque §5.1 del plan lo lista: **"Pagar todos los
vencidos"** como acción masiva y el **check con `aria-label`** en lugar del botón
"Marcar pagada".

---

## 13. Fase 2 del plan v2: categorías (2026-11-26)

La fase "Categorías" de `docs/superpowers/specs/2026-11-26-v2-plan.md` (§6), con
el modelo de §2.1 y las decisiones de §7.4 (un movimiento sólo va a una hoja).
Resuelve también §3.5 de este archivo.

| Qué | Dónde | Sección |
|---|---|---|
| `parent_id`, `color` e `icon` en `category`, FK compuesta al padre y triggers que cuidan el árbol | `drizzle/0011_categorias_en_arbol.sql`, `src/db/schema.ts` | §2.1 |
| Lógica del árbol: armado, hojas, etiquetas "Padre › Hija", grupos del selector, destinos de "Mover a…", torta por padre | `src/lib/category-tree.ts` | §2.1 |
| Paleta fija de colores e iconos curados de lucide; la hija sin color hereda el del padre | `src/lib/category-color.ts`, `src/lib/category-icons.tsx` | §2.1 |
| Precarga del onboarding jerárquica (Hogar, Comida, Transporte con hijas) | `src/lib/default-categories.ts`, `src/server/actions/settings.ts` | §2.1 |
| Acciones: crear subcategoría, editar, mover, archivar en cascada, desarchivar con el padre | `src/server/actions/categories.ts` | §2.1 |
| La regla de hoja en la acción de movimientos | `src/server/actions/movements.ts` | §7.4 |
| `/categorias` como árbol con menú ⋯ por fila y diálogo de alta/edición/mover | `category-manager.tsx`, `category-dialog.tsx`, `src/app/(app)/categorias/page.tsx` | §2.1 |
| Selector de categoría con búsqueda, agrupado por padre, que recuerda la última | `category-picker.tsx`, `movement-form.tsx` | §2.1 |
| Filtrar por un padre trae también lo de sus hijas | `listMovements` en `src/server/queries.ts` | — |
| Torta del dashboard por categoría padre, con desglose desplegable | `dashboard-view.ts`, `dashboard/charts.tsx` | §2.1 |

`tsc --noEmit` y `eslint` limpios (queda el aviso previo de `<img>` en
`app-sidebar.tsx`). La suite pasó a 496 tests; falla sólo el que ya fallaba
antes (el tope de 120 filas en `movement-form.test.tsx`).

### 13.1 Qué se decidió

- **Dos niveles, cuidados por la base.** Un trigger `BEFORE` impide el tercer
  nivel. Otros dos, `CONSTRAINT TRIGGER DEFERRABLE INITIALLY DEFERRED`, impiden
  que un movimiento quede en una categoría con hijas. Son diferidos porque crear
  la primera hija de una categoría con movimientos y pasarle esos movimientos
  ocurre en la misma transacción: chequeados fila por fila, el paso intermedio
  fallaría. La acción valida lo mismo antes, para devolver un error de campo
  legible; los triggers son la red.
- **La FK al padre es compuesta**, `(user_id, kind, parent_id) → category
  (user_id, kind, id)`, como las de `0003`–`0008`: una hija no puede colgar de
  una categoría de otro usuario ni de otro tipo. Es **`ON DELETE NO ACTION`** y
  no `RESTRICT`: `RESTRICT` chequea fila por fila y hacía fallar el borrado en
  cascada desde `user`, que borra padres e hijas en la misma sentencia.
- **Los nombres son únicos entre hermanas**, no en todo el usuario: el índice
  pasó a `(user_id, kind, coalesce(parent_id, ''), name)`. Si no, sólo podría
  haber una "General" o una "Otros".
- **La primera subcategoría de una categoría con movimientos pregunta a dónde
  van.** Por defecto, a una "General" nueva; si no, a la hija que se está
  creando o moviendo. La pregunta sólo aparece cuando hace falta.
- **"Agrupar" no es una acción aparte:** se resuelve con "Mover a…" sobre cada
  categoría. Crear el padre y mover las hijas es lo mismo y no suma un flujo.
- **Las hijas archivadas cuentan para la regla de hoja.** Un padre con todas sus
  hijas archivadas sigue sin aceptar movimientos: si no, desarchivar una hija
  dejaría el árbol inválido.
- **Archivar un padre archiva sus hijas; desarchivar una hija desarchiva sólo el
  padre**, no las hermanas: quizás se las quería dejar archivadas.
- **Color e icono son claves de listas fijas**, no valores libres: la paleta
  está pensada para el fondo oscuro, y así el contraste no depende de lo que se
  elija. Sin color, la hija hereda el del padre y el padre cae al hash del
  nombre, como antes.
- **El selector despliega el panel en el lugar, no en un Popover**: el Dialog
  de Radix bloquea el scroll de lo que queda fuera de su contenido, y un Popover
  se portea al `body`, así que su lista no se podía scrollear con la rueda.
  Además, con el panel adentro del formulario no hay un portal más que cuidar
  desde la fila de la tabla (§12.1). Sigue el patrón combobox de ARIA 1.2 con
  `aria-activedescendant`. Los padres con hijas son encabezados, no opciones.
- **La última categoría usada se recuerda en `localStorage`, por tipo.** Es una
  comodidad por dispositivo: si falla o no está, arranca en la primera opción.
- **En el filtro de la lista los padres sí se pueden elegir**, y traen lo de sus
  hijas. La multiselección del filtro queda para la Fase 4.
- **La torta agrupa por nombre del padre**, para que dos categorías archivadas
  y vueltas a crear con el mismo nombre no aparezcan dos veces.
- **El alta rápida de una categoría de primer nivel sigue pidiendo sólo el
  nombre.** Color, icono y padre se eligen en el diálogo de "Editar" o al
  agregar una subcategoría.

### 13.2 Lo que se verificó y lo que no

Verificado en el navegador, escritorio y móvil (375px), contra la instalación
Docker local (no contra la base de `.env.local`): la migración aplicada sobre
datos existentes (todas quedan de primer nivel), crear un padre y meterle una
categoría con "Mover a…" y volver a sacarla, crear una subcategoría con color e
icono, la pregunta de los movimientos al agregar la primera hija (pasaron a
"General"), el selector (encabezados, búsqueda sin tildes, flechas, Enter sin
mandar el formulario, rueda del mouse, la última usada), el filtro por padre y
la torta agrupada con su desglose.

Los triggers se probaron a mano con `psql` dentro del contenedor de la base, en
un `BEGIN … ROLLBACK`: rechazan el tercer nivel, un movimiento en un padre y una
hija suelta bajo un padre con movimientos; aceptan crear la hija y pasarle los
movimientos en la misma transacción; dejan dos "General" con padres distintos;
y borrar padre e hijas en una sola sentencia funciona.

**`pnpm test:db` no se corrió**, por el mismo motivo que §11.3: apunta a la base
de `.env.local`. Se actualizaron igual: `rls.db.test.ts` (5 casos del árbol),
`actions.db.test.ts` (la precarga jerárquica y 11 casos del árbol) y
`queries.db.test.ts` (filtro por padre y `countMovementsByCategory`). Hay que
correrlos contra una base descartable antes de mergear.
