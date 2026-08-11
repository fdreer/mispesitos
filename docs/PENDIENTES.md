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
