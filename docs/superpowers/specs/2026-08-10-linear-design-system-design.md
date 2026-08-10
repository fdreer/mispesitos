# Mis Pesitos — Rediseño sobre el sistema visual de Linear

**Fecha:** 2026-08-10
**Estado:** aprobado, sin implementar.

Referencia de origen: `DESIGN.md` de Linear ("midnight precision instrument"), provisto
por el usuario. Este documento traduce ese sistema a la app y deja asentado dónde nos
apartamos de él y por qué.

## 1. Objetivo

Reemplazar el tema por defecto de shadcn (claro, gris azulado) por el sistema visual de
Linear: lienzo casi negro, tipografía Inter de tracking cerrado en pesos 400–590, bordes
capilares en lugar de sombras, y un único acento cromático — el lima ácido `#e4f222` —
reservado para la acción principal.

El alcance incluye la capa de tokens, los componentes de `src/components/ui/`, la
composición de la landing y del shell de la app, y la paleta de los gráficos. No incluye
cambios de comportamiento, de datos ni de rutas: ninguna Server Action, consulta, esquema
de Zod ni tabla se toca.

## 2. Decisiones tomadas

1. **Alcance completo**: tokens, componentes y layout.
2. **Un solo tema, oscuro.** El DESIGN.md es dark-only y la app no tiene switch de tema
   hoy, así que no se pierde nada existente. `:root` pasa a ser la paleta Linear y el
   bloque `.dark` se elimina.
3. **El color señala estado, no importe.** Los montos viven en la escala gris con su
   signo; el verde y el rojo quedan en los badges de estado. Ver §7.
4. **Remapear los tokens de shadcn** en vez de reemplazarlos. Ver §3.

## 3. Estrategia: remapear, no reemplazar

Los 19 componentes ya están escritos contra tokens semánticos (`bg-card`,
`text-muted-foreground`, `border-border`, `bg-primary`). Cambiar el **valor** de esos
tokens cambia la app entera sin tocar los componentes.

Las alternativas descartadas:

- **Tokens Linear puros** (borrar la capa shadcn y reescribir cada `ui/*.tsx` contra
  `--color-void` y compañía): más fiel al documento al pie de la letra, tres veces el
  diff, y el próximo `shadcn add` traería un componente escrito contra tokens que ya no
  existen.
- **Híbrido con clases compuestas** (`.linear-card`, `.linear-nav`): suma un vocabulario
  paralelo al de Tailwind a cambio de poco.

Los nombres propios de Linear (`--color-void`, `--color-fog`, `--color-acid-lime`,
`--color-pulse-green`, `--color-signal-teal`, `--color-iris-violet`, `--color-lavender`)
se agregan igual en `@theme`, para los lugares donde el token semántico no alcanza:
gráficos y badges de estado.

## 4. Tokens (`src/app/globals.css`)

### 4.1 Color

| Token shadcn | Nombre Linear | Valor |
|---|---|---|
| `--background` | Void | `#08090a` |
| `--card` | Carbon | `#0f1011` |
| `--popover` | Obsidian | `#161718` |
| `--muted` | Obsidian | `#161718` |
| `--accent` | Slate | `#23252a` |
| `--secondary` | — | `rgba(255,255,255,.05)` |
| `--foreground` | Mist | `#d0d6e0` |
| `--card-foreground` | Mist | `#d0d6e0` |
| `--muted-foreground` | Fog | `#8a8f98` |
| `--accent-foreground` | Paper | `#ffffff` |
| `--border` | Graphite | `#23252a` |
| `--input` | — | `rgba(255,255,255,.08)` |
| `--ring` | Mist | `#d0d6e0` |
| `--primary` | Acid Lime | `#e4f222` |
| `--primary-foreground` | Void | `#08090a` |
| `--destructive` | Coral Red | `#eb5757` |

`--foreground` va en Mist y no en blanco. En shadcn ese token pinta el cuerpo del texto,
y la guía rápida del DESIGN.md separa cuerpo (`#d0d6e0`) de título (`#ffffff`). El blanco
se aplica explícito en los títulos que lo piden.

### 4.2 Radios

La escala actual se calcula con multiplicadores sobre `--radius` (`--radius-sm:
calc(var(--radius) * 0.6)`, etc.), lo que con `--radius: 0.625rem` da 6/8/10/14px — nada
que ver con el vocabulario de Linear. Se reemplaza por valores literales, elegidos para
que caigan encima de las clases que los componentes **ya** usan:

```css
--radius-sm:  2px;
--radius-md:  4px;
--radius-lg:  6px;    /* button usa rounded-lg */
--radius-xl:  12px;   /* card usa rounded-xl  */
--radius-2xl: 12px;   /* tope de card según el DESIGN.md */
--radius-3xl: 9999px;
--radius-4xl: 9999px; /* píldoras */
```

Ninguna edición de componente por radios, salvo `badge.tsx` (§6).

### 4.3 Pesos

El DESIGN.md prohíbe pesos 700+ y corta la escala en 590. En `@theme`:

```css
--font-weight-medium:   510;
--font-weight-semibold: 590;
```

Con eso, todos los `font-medium` y `font-semibold` que ya existen en el código entran
solos en la banda. No hay ningún `font-bold` en el proyecto.

## 5. Tipografía

Inter Variable por `next/font/google` en `src/app/layout.tsx` — se auto-hostea en build,
sin request a Google en runtime. Sobre `html`:

```css
font-feature-settings: "cv01" on, "ss03" on, "zero" on;
```

Tracking por tamaño, según la escala del documento: `-0.022em` de 48px para arriba,
`-0.012em` entre 20 y 32px, `-0.011em` en cuerpo pequeño.

**Berkeley Mono no se carga.** Es una fuente paga que no tenemos, y su rol en Linear —
IDs de issue, atajos de teclado, metadata técnica — no existe en esta app. Los importes
ya van con `tabular-nums`, e Inter con la feature `zero` los resuelve. Se define
`--font-mono` con el stack de sistema por si aparece un caso.

## 6. Componentes de `src/components/ui/`

- **`card.tsx`** — el `ring-1 ring-foreground/10` pasa a un box-shadow interno
  `rgb(35,37,42) 0 0 0 1px`, sin sombra externa. Padding de tarjeta a 24px.
- **`input.tsx`** y **`select.tsx`** — fondo `rgba(255,255,255,.02)`, borde
  `rgba(255,255,255,.08)`, radio 6px, y foco que abre el borde a Mist.
- **`button.tsx`** — la variante `default` es el lima ácido sobre Void, peso 510. Se
  agrega una variante `pill` blanca para el CTA de la nav pública.
- **`badge.tsx`** — radio a 4px: los badges de estado de Linear no son píldoras, y es la
  única excepción al mapeo automático de §4.2. `destructive` en Coral Red `#eb5757`,
  `secondary` en Fog sobre `rgba(255,255,255,.05)`, `outline` con hairline Graphite. No se
  agrega una variante `success`: hoy nada en la app muestra un badge de "pagado", y un
  token que no usa nadie es deuda.
- **`label.tsx`** — sin cambios.

### 6.1 Una sola acción lima por pantalla

`--primary` pasa a ser el lima ácido, y `default` es la variante por defecto de `Button`.
Eso convierte en lima **todo** botón sin `variant` explícito, y hay uno que rompe la regla
del documento ("only one primary action per view"):

- **`installment-rows.tsx:52-60`** renderiza un botón `default` por cuota impaga. Un
  movimiento en 12 cuotas dibujaría 12 botones lima. Pasa a `outline`; la variante
  `secondary` de la cuota ya pagada queda como está.

Repartida así, la acción lima de cada pantalla queda en:

| Pantalla | Botón lima |
|---|---|
| `/` | "Crear cuenta" (`page.tsx`); "Entrar" baja a link secundario |
| `/login`, `/registro` | submit de `auth-form.tsx:123`; Google sigue en `outline` |
| `/onboarding`, `/ajustes` | submit de `settings-form.tsx:114` |
| `/ingresos`, `/egresos` | "Guardar" de `movement-form.tsx:227` |
| `/cambios` | "Registrar operación" de `exchange-form.tsx:79`; los toggles compra/venta en `secondary` |
| `/categorias` | "Agregar" de `category-manager.tsx:54`; archivar sigue en `ghost` |
| `/dashboard` | ninguno — es una pantalla de lectura |

## 7. Color de estado: dónde nos apartamos del DESIGN.md

El documento dice que Pulse Green y Coral Red son acentos de apoyo, "not a status color",
y que el cuerpo del texto nunca lleva color. Esto es una app de plata: una lista de cuotas
donde vencido y pendiente se distinguen sólo leyendo es peor interfaz.

La resolución es la que el propio documento habilita en su sección "Badge / Status Tag" y
en su guía de prompts (`#27a644` para éxito, `#eb5757` para error):

- **Los importes van en gris**, con su signo. `balance-cards.tsx:85` y
  `cambios/page.tsx:50` tienen `text-emerald-600` hardcodeado; los dos pasan a Mist.
- **El color vive en el badge.** `movement-list.tsx:55-58` ya lo hace bien: `destructive`
  para vencidas, `secondary` para pendientes, y nada cuando está todo pagado. Sólo cambian
  los valores de esas variantes (§6), no la lógica. Igual con el "· vencida" de
  `installment-rows.tsx:46`, que ya va en `text-destructive`.

## 8. Composición

### 8.1 Landing (`src/app/page.tsx`)

Única superficie de marketing, y la única que sigue el ritmo de Linear al pie:

- Contenedor de 1200px, centrado, fondo Void a sangre.
- Nav bar: wordmark "Mis Pesitos" en Paper 16px/510 a la izquierda; "Entrar" en Mist y
  píldora blanca "Crear cuenta" a la derecha.
- Hero a 64px peso 510, tracking `-0.022em`, line-height 1.0, en Paper. Bajada a 16px en
  Fog.
- Un solo CTA en lima ácido más un link secundario con glifo de flecha — no dos botones
  del mismo peso, como hoy.

### 8.2 Shell de la app (`src/app/(app)/layout.tsx`)

`max-w-5xl` (1024px) sube a 1200px.

**Aparte deliberado:** el `--section-gap` de 96px del DESIGN.md es ritmo de landing.
Adentro de un dashboard con cuatro tarjetas de saldo y una lista de cuotas, 96px entre
bloques obliga a scrollear para ver lo que hoy entra en una pantalla. Adentro de la app se
usa la escalera compacta que el mismo documento declara — 8/12/24 — con 32px entre
secciones grandes. Los 96px quedan sólo en la landing.

### 8.3 Nav de la app (`src/components/app-nav.tsx`)

El link activo deja de ser un `bg-secondary`. Nav tipográfica: 13px peso 400, Mist en
reposo, Paper activo, y el estado activo marcado con una barra de 2px en lima ácido abajo
en lugar de un fondo. La barra se separa del contenido con un hairline `#23252a`. "Salir"
queda a la derecha, en Fog.

### 8.4 El resto hereda

`auth-form`, `movement-form`, `movement-screen`, `movement-list`, `exchange-form`,
`category-manager`, `settings-form`, `installment-rows`, `status-filter`, `upcoming` y las
ocho páginas están escritas contra tokens semánticos: cambian solos con §4. Se revisan y
se corrige lo que quede mal, no se reescriben.

## 9. Gráficos (`src/components/dashboard/charts.tsx`)

Los siete colores de Tailwind hardcodeados en `charts.tsx:21`, más los de las líneas y
barras, se reemplazan:

- **Proyección**: Signal Teal `#02b8cc`.
- **Torta de categorías**: rueda decorativa del sistema — Signal Teal, Iris Violet
  `#6366f1`, Lavender `#8b5cf6`, Fog, Ash `#62666d`, Smoke `#383b3f`, Pulse Green.
- **Barras mensuales**: Ingresos en Pulse Green, Egresos en Coral Red. Son datos, no
  cuerpo de texto: la regla de §7 no aplica.
- **Grilla y ejes**: Graphite `#23252a`; labels en Fog.
- **Tooltip**: Recharts lo pinta blanco por defecto. Pasa a Carbon con hairline y radio
  6px. Sin eso queda un rectángulo blanco flotando sobre el fondo negro.

El lima ácido no entra en ningún gráfico. Es el color del CTA y de nada más.

## 10. Verificación

1. `pnpm typecheck`, `pnpm lint` y `pnpm test`. La suite es de lógica pura y ningún test
   toca estilos: tiene que seguir en verde sin modificarla. Si algún test se pone en rojo,
   es una regresión de verdad, no ruido del rediseño.
2. Dev server en el 3100 y revisión visual con capturas de landing, login y registro.
3. Dashboard, ingresos, egresos, cambios, categorías y ajustes necesitan sesión abierta
   contra la base real. Si `.env.local` apunta a una base que responde y hay usuario
   creado, se revisan igual; si no, quedan para que las mire el usuario. **Se informa cuál
   de los dos casos ocurrió; no se dan por revisadas sin haberlas visto.**

## 11. Fuera de alcance

- Switch de tema claro/oscuro.
- Cualquier cambio de comportamiento, datos, rutas o validación.
- Rediseñar la estructura de las pantallas internas más allá de espaciado, color y
  tipografía. El dashboard sigue siendo cuatro tarjetas y tres gráficos.
- Cargar Berkeley Mono o cualquier fuente paga.
- Animaciones y micro-interacciones: el DESIGN.md no las especifica.
