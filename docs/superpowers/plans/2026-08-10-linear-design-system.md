# Rediseño sobre el sistema visual de Linear — Plan de implementación

> **Documento histórico — ejecutado el 2026-08-10.** Las nueve tareas están
> implementadas y revisadas, más una tanda de arreglos posterior a la revisión de
> branch. El estado real del código manda sobre este archivo. Lo que se hizo
> distinto de lo que dice acá:
>
> 1. **El `font-medium` de las variantes `default` y `pill` de `button.tsx` no se
>    agregó** (Task 2, Step 5): la clase base del `cva` ya lo trae, así que
>    repetirlo no cambiaba nada.
> 2. **El comentario del `stroke` de la torta decía "en Void" y el código pasa
>    `CARBON`** (Task 8). Se corrigió el comentario.
> 3. **El fallback `text-4xl sm:text-hero` no se aplicó** (Task 6, Step 4): a
>    375px el hero de 64px entra en tres líneas sin scroll horizontal.
> 4. **El grep de colores fuera del sistema no da "sin resultados"** (Task 7,
>    Step 4 y Task 9, Step 5). El patrón incluye `slate-`, que matchea las
>    utilidades `translate-x/y-*`: `button.tsx` y `select.tsx` aparecen siempre.
>    El criterio real es "ningún color fuera de la paleta y ningún hexadecimal
>    fuera de `charts.tsx`".
> 5. **El comentario sobre `@theme inline` en `globals.css` afirma algo falso.**
>    Dice que el bloque `inline` no emite la variable a `:root`; sí la emite (se
>    compiló y se verificó). Lo que `inline` decide es si la utilidad referencia
>    la variable o su valor resuelto. La separación en dos bloques queda igual,
>    porque se lee mejor, pero el motivo escrito no es el correcto.
> 6. **Seis arreglos más, decididos después de la revisión final de branch**, que
>    este plan no contemplaba: `color-scheme: dark`, el doble botón lima de
>    `/categorias`, `aria-current` en la nav, el `<select>` crudo de
>    `movement-form.tsx`, el idioma viejo de `status-filter.tsx` y el contraste
>    del toggle de `/cambios`. Están detallados en
>    [`docs/PENDIENTES.md`](../../PENDIENTES.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** llevar la app del tema claro por defecto de shadcn al sistema visual de Linear — lienzo casi negro, Inter de tracking cerrado en pesos 400–590, bordes capilares en vez de sombras, y el lima ácido `#e4f222` como única acción cromática.

**Architecture:** se remapean los tokens semánticos de shadcn (`--background`, `--card`, `--border`, `--primary`) a los valores de Linear en vez de reemplazar el sistema de tokens. Los 19 componentes ya están escritos contra esos tokens, así que la Task 1 cambia la app entera; las tareas siguientes corrigen los ocho lugares donde un token no alcanza. Tema único: `:root` es el tema oscuro y el bloque `.dark` desaparece.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS 4, shadcn/ui, Recharts 3, `next/font/google`.

**Spec:** [`docs/superpowers/specs/2026-08-10-linear-design-system-design.md`](../specs/2026-08-10-linear-design-system-design.md). Cuando este plan y el spec discrepen, manda el spec.

## Global Constraints

- **Ningún cambio de comportamiento.** No se toca ninguna Server Action, consulta, esquema de Zod, migración ni tabla. Sólo estilos, marcado y composición.
- **Ningún test se modifica.** `pnpm test` es lógica pura y no toca estilos: tiene que seguir en verde exactamente como está. Si un test se pone en rojo, es una regresión real — pará y avisá, no lo edites.
- **Ninguna dependencia nueva.** Inter viene por `next/font/google`, que ya está adentro de Next. Berkeley Mono no se carga: es paga y su rol no existe en esta app.
- **Pesos 400–590.** Nada de `font-bold` ni `font-extrabold`. Hoy no hay ninguno en el proyecto; que siga así.
- **Un solo botón lima por pantalla.** El reparto exacto está en §6.1 del spec y se implementa en la Task 4.
- **Los importes van en gris.** El verde y el rojo viven en los badges de estado, no en los montos.
- **El lima ácido no entra en ningún gráfico.** Es el color del CTA y de nada más.
- **Radios: 2 / 4 / 6 / 12 / píldora.** No se introduce ningún otro valor.
- **Idioma:** todo texto visible en español rioplatense, como el resto de la app.

## Nota sobre verificación

Este plan no trae tests nuevos, y es a propósito. No hay ninguna aserción de estilo en la suite y montar un runner de DOM para afirmar que un `<div>` quedó `#0f1011` sería infraestructura nueva que nadie va a mantener, para verificar lo que un vistazo verifica mejor.

En su lugar, cada tarea cierra con dos cosas que sí corren:

1. **`pnpm typecheck && pnpm lint && pnpm test`** — la red de regresión. Prueba que el rediseño no rompió nada que ya funcionaba.
2. **Una lectura de estilo computado en el navegador**, vía `javascript_tool` sobre el preview. Eso sí verifica el estilo, y verifica el valor real que el navegador resolvió — no lo que creemos que escribimos. Las tres afirmaciones no obvias de este plan (el mapeo de radios de la Task 1, que Inter cargó, que ninguna utilidad `dark:` se activó) se chequean así.

El preview se levanta una vez, en la Task 1, con la configuración que ya existe en `.claude/launch.json`, y queda arriba para el resto del plan.

## Estructura de archivos

| Archivo | Responsabilidad | Task |
|---|---|---|
| `src/app/globals.css` | Toda la capa de tokens: color, radio, peso, tracking, escala tipográfica | 1 |
| `src/app/layout.tsx` | Carga de Inter Variable y su variable CSS sobre `<html>` | 1 |
| `src/components/ui/card.tsx` | Hairline interno en vez de `ring`, padding 24px | 2 |
| `src/components/ui/input.tsx` | Fondo, borde y foco de Linear | 2 |
| `src/components/ui/select.tsx` | Ídem `input`, más el panel sobre Obsidian | 2 |
| `src/components/ui/badge.tsx` | Radio 4px y las tres variantes de estado | 2 |
| `src/components/ui/button.tsx` | Variante `default` lima, variante `pill` blanca | 2 |
| `src/components/installment-rows.tsx` | "Marcar pagada" deja de ser lima | 4 |
| `src/components/exchange-form.tsx` | Los toggles compra/venta dejan de ser lima | 4 |
| `src/components/app-nav.tsx` | Nav tipográfica con indicador lima | 5 |
| `src/app/(app)/layout.tsx` | Contenedor a 1200px | 5 |
| `src/app/page.tsx` | Landing: nav pública y hero 64px | 6 |
| `src/components/dashboard/balance-cards.tsx` | Importes en gris | 7 |
| `src/app/(app)/cambios/page.tsx` | Importes en gris | 7 |
| `src/components/dashboard/charts.tsx` | Paleta, ejes y tooltip de los gráficos | 8 |
| Títulos de las 5 pantallas internas | Color Paper en los `<h1>` | 9 |

---

### Task 1: La capa de tokens y la tipografía

Es la tarea que cambia la app entera. Al terminarla, las ocho pantallas ya son oscuras: lo que sigue son correcciones puntuales.

**Files:**
- Modify: `src/app/globals.css` (reemplazo completo)
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: nada.
- Produces: las utilidades de color con nombre propio de Linear — `bg-void`, `bg-carbon`, `bg-obsidian`, `border-graphite`, `text-smoke`, `text-ash`, `text-fog`, `text-mist`, `text-paper`, `bg-acid-lime`, `text-pulse-green`, `text-coral-red` — más `text-hero` (64px con su interlineado y tracking) y `shadow-hairline`. Las tareas 2 a 9 las usan por estos nombres exactos.

- [ ] **Step 1: reemplazar `src/app/globals.css`**

El archivo entero pasa a ser:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

/*
 * Tema único, oscuro: la paleta de Linear. No existe un bloque `.dark` ni nada
 * que agregue esa clase al DOM.
 *
 * La variante `dark` se declara igual, y a propósito. Los componentes de shadcn
 * traen decenas de utilidades `dark:` adentro. Sin esta línea, `dark:` vuelve a
 * su default de Tailwind —`prefers-color-scheme`— y a cualquiera con el sistema
 * operativo en oscuro se le aplicarían encima los retoques del tema oscuro de
 * shadcn, sobre una paleta que ya es oscura. Atada a `.dark`, que no existe en
 * ningún lado, quedan todas inertes y el tema es uno solo de verdad.
 */
@custom-variant dark (&:is(.dark *));

@theme inline {
    --font-heading: var(--font-sans);
    /*
     * Inter Variable, servida por `next/font/google` desde el layout raíz: ahí
     * se define `--font-inter` sobre <html> y acá se la consume. El stack de
     * sistema queda de fallback para el primer paint.
     *
     * Antes acá decía `--font-sans: var(--font-sans)`: una autorreferencia que
     * create-next-app dejaba resuelta desde `next/font`, y que al sacar esa
     * parte quedó apuntándose a sí misma. Una custom property que se referencia
     * a sí misma es inválida, así que toda la app se caía a la serif del
     * navegador. Ahora vuelve a haber un `var(...)`, pero apunta a otro nombre
     * —`--font-inter`, no `--font-sans`— y por eso no reaparece el problema.
     */
    --font-sans: var(--font-inter), ui-sans-serif, system-ui, -apple-system,
        "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif,
        "Apple Color Emoji", "Segoe UI Emoji";
    /*
     * Berkeley Mono, la mono de Linear, es paga y no la tenemos; su rol allá
     * —IDs de issue, atajos de teclado— acá no existe. Los importes van con
     * `tabular-nums` sobre Inter, que con la feature `zero` los resuelve bien.
     * Queda el stack del sistema por si aparece un caso.
     */
    --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

    /*
     * La paleta de Linear por su nombre propio. Habilita `bg-void`, `text-fog`,
     * `border-graphite` y compañía para los pocos lugares donde el token
     * semántico de más abajo no alcanza: gráficos, badges de estado y títulos.
     */
    --color-void: #08090a;
    --color-carbon: #0f1011;
    --color-obsidian: #161718;
    --color-graphite: #23252a;
    --color-smoke: #383b3f;
    --color-ash: #62666d;
    --color-fog: #8a8f98;
    --color-mist: #d0d6e0;
    --color-bone: #e5e5e6;
    --color-paper: #ffffff;
    --color-acid-lime: #e4f222;
    --color-pulse-green: #27a644;
    --color-coral-red: #eb5757;
    --color-signal-teal: #02b8cc;
    --color-iris-violet: #6366f1;
    --color-lavender: #8b5cf6;

    /*
     * Los tokens semánticos de shadcn. Los 19 componentes están escritos contra
     * éstos, así que es acá —y no en cada componente— donde se decide cómo se
     * ve la app.
     */
    --color-ring: var(--ring);
    --color-input: var(--input);
    --color-border: var(--border);
    --color-destructive: var(--destructive);
    --color-accent-foreground: var(--accent-foreground);
    --color-accent: var(--accent);
    --color-muted-foreground: var(--muted-foreground);
    --color-muted: var(--muted);
    --color-secondary-foreground: var(--secondary-foreground);
    --color-secondary: var(--secondary);
    --color-primary-foreground: var(--primary-foreground);
    --color-primary: var(--primary);
    --color-popover-foreground: var(--popover-foreground);
    --color-popover: var(--popover);
    --color-card-foreground: var(--card-foreground);
    --color-card: var(--card);
    --color-foreground: var(--foreground);
    --color-background: var(--background);
}

/*
 * Bloque aparte, y sin `inline`, a propósito. `@theme inline` copia el valor
 * adentro de la utilidad y NO emite la variable a `:root`. Seis clases de
 * `button.tsx` y `select.tsx` leen `--radius-md` en crudo, dentro de un
 * `rounded-[min(var(--radius-md),10px)]`: si la variable no se emite, ese
 * `var()` queda sin resolver y esos botones pierden el radio.
 *
 * Todo lo que sigue son valores literales que alguien puede leer con `var()`,
 * así que van acá.
 */
@theme {
    /*
     * Radios literales, no calculados. Antes salían de multiplicar `--radius`
     * (0.625rem), lo que daba 6/8/10/14px. El vocabulario de Linear es 2/4/6/12
     * más la píldora, y cae justo encima de las clases que los componentes ya
     * usan: `rounded-lg` de Button da 6px y `rounded-xl` de Card da 12px, sin
     * tocar ninguno de los dos.
     */
    --radius-sm: 2px;
    --radius-md: 4px;
    --radius-lg: 6px;
    --radius-xl: 12px;
    --radius-2xl: 12px;
    --radius-3xl: 9999px;
    --radius-4xl: 9999px;

    /*
     * Linear corta la escala de pesos en 590 y prohíbe 700+. Redefinir estos dos
     * mete en la banda todos los `font-medium` y `font-semibold` que ya están
     * escritos, sin tocar un componente. En el proyecto no hay ningún
     * `font-bold`; si aparece uno, está fuera del sistema.
     */
    --font-weight-medium: 510;
    --font-weight-semibold: 590;

    /*
     * Tracking cerrado, colgado de la escala tipográfica en vez de repartido en
     * `tracking-*` a mano: así un `text-2xl` que se escriba mañana ya nace con
     * el suyo.
     */
    --text-xs--letter-spacing: -0.005em;
    --text-sm--letter-spacing: -0.01em;
    --text-base--letter-spacing: -0.011em;
    --text-lg--letter-spacing: -0.012em;
    --text-xl--letter-spacing: -0.012em;
    --text-2xl--letter-spacing: -0.012em;
    --text-3xl--letter-spacing: -0.022em;
    --text-4xl--letter-spacing: -0.022em;

    /* El hero de la landing, el único 64px del sistema. */
    --text-hero: 64px;
    --text-hero--line-height: 1;
    --text-hero--letter-spacing: -0.022em;

    /*
     * En Linear la separación entre superficies la hace el borde capilar, no una
     * sombra. Va por dentro para no correr el layout ni un pixel.
     */
    --shadow-hairline: inset 0 0 0 1px #23252a;
}

:root {
    --background: #08090a; /* Void */
    /*
     * Mist, no blanco. En shadcn este token pinta el cuerpo del texto, y Linear
     * separa cuerpo (#d0d6e0) de título (#ffffff). El blanco se aplica explícito
     * con `text-paper` en los títulos que lo piden.
     */
    --foreground: #d0d6e0; /* Mist */
    --card: #0f1011; /* Carbon */
    --card-foreground: #d0d6e0; /* Mist */
    --popover: #161718; /* Obsidian */
    --popover-foreground: #d0d6e0; /* Mist */
    --primary: #e4f222; /* Acid Lime — la única acción cromática */
    --primary-foreground: #08090a; /* Void */
    --secondary: rgba(255, 255, 255, 0.05);
    --secondary-foreground: #d0d6e0; /* Mist */
    --muted: #161718; /* Obsidian */
    --muted-foreground: #8a8f98; /* Fog */
    --accent: #23252a; /* Slate — la superficie del hover */
    --accent-foreground: #ffffff; /* Paper */
    --destructive: #eb5757; /* Coral Red */
    --border: #23252a; /* Graphite */
    --input: rgba(255, 255, 255, 0.08);
    --ring: #d0d6e0; /* Mist — el foco abre el borde, no agrega un halo de color */
}

@layer base {
  * {
    @apply border-border outline-ring/50;
    }
  body {
    @apply bg-background text-foreground;
    }
  html {
    @apply font-sans;
    /*
     * Los glifos alternos que definen la identidad tipográfica de Linear:
     * `cv01` es la ele de una pierna, `ss03` el ampersand, `zero` el cero
     * barrado. Sobre <html> para que los hereden también los importes.
     */
    font-feature-settings: "cv01" on, "ss03" on, "zero" on;
    }
}
```

Dos cosas que salen del archivo y conviene no restaurar por reflejo:

- **Los tokens `--sidebar-*`** (nueve de ellos). No hay componente de sidebar en el proyecto y ningún archivo de `src/` los menciona.
- **Los tokens `--chart-1` a `--chart-5`.** Ninguna utilidad `bg-chart-*` se usa: Recharts recibe colores como strings en JS, así que la paleta de los gráficos vive en `charts.tsx` (Task 8).

- [ ] **Step 2: cargar Inter en `src/app/layout.tsx`**

El archivo entero pasa a ser:

```tsx
import type { Metadata } from "next"
import { Inter } from "next/font/google"

import "./globals.css"

// `variable` publica `--font-inter` sobre <html>; globals.css la consume desde
// `--font-sans`. `display: "swap"` muestra el texto con el stack de sistema
// mientras Inter carga, en vez de dejar la pantalla en blanco.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Mis Pesitos",
  description: "Finanzas personales en pesos y dólares.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={inter.variable}>
      <body className="antialiased">{children}</body>
    </html>
  )
}
```

- [ ] **Step 3: correr la red de regresión**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Esperado: typecheck y lint sin salida de error, y la suite en verde con la misma cantidad de tests que antes del cambio. Ningún archivo de test se tocó.

Si `pnpm dev` o `pnpm build` fallan con un error de red de `next/font/google`, la máquina no llegó a Google Fonts. No cambies a otra estrategia de fuente por tu cuenta: pará y avisá.

- [ ] **Step 4: levantar el preview**

Usá la herramienta `preview_start` con `{name: "mis-pesitos"}` — la configuración ya existe en `.claude/launch.json` y levanta en el puerto 3100. Dejalo arriba para el resto del plan.

- [ ] **Step 5: verificar los estilos computados**

Navegá a `http://localhost:3100/login` (no requiere sesión) y corré con `javascript_tool`:

```js
(() => {
  const cs = getComputedStyle(document.body)
  const raiz = getComputedStyle(document.documentElement)
  const card = document.querySelector('[data-slot="card"]')
  const btn = document.querySelector('[data-slot="button"]')
  return {
    fondo: cs.backgroundColor,
    texto: cs.color,
    fuente: cs.fontFamily,
    features: raiz.fontFeatureSettings,
    radioCard: card && getComputedStyle(card).borderRadius,
    radioBoton: btn && getComputedStyle(btn).borderRadius,
    pesoBoton: btn && getComputedStyle(btn).fontWeight,
    // La variable tiene que estar EMITIDA, no sólo inlineada en las utilidades:
    // seis clases de button.tsx y select.tsx la leen con var() en crudo.
    radioMdEmitido: raiz.getPropertyValue("--radius-md").trim(),
    interCargada: document.fonts.check('16px Inter'),
  }
})()
```

Esperado, exacto:

| Clave | Valor |
|---|---|
| `fondo` | `rgb(8, 9, 10)` |
| `texto` | `rgb(208, 214, 224)` |
| `fuente` | empieza con la familia de Inter que inyectó `next/font` |
| `features` | `"cv01" on, "ss03" on, "zero" on` |
| `radioCard` | `12px` |
| `radioBoton` | `6px` |
| `pesoBoton` | `510` |
| `radioMdEmitido` | `4px` |
| `interCargada` | `true` |

`radioCard: 12px` y `radioBoton: 6px` son la prueba de que el mapeo de radios cayó encima de las clases existentes. Si dan 14px y 10px, los `--radius-*` quedaron calculados en vez de literales: revisá que el bloque viejo con `calc(var(--radius) * …)` haya desaparecido del todo.

`radioMdEmitido` vacío significa que los literales quedaron adentro del `@theme inline` en vez de su propio bloque `@theme`, y que los botones `size="sm"` y `size="xs"` perdieron el radio sin que se note a simple vista.

- [ ] **Step 6: confirmar que ninguna utilidad `dark:` se activó**

Con `javascript_tool`:

```js
({
  hayClaseDark: document.querySelector(".dark") !== null,
  sistemaEnOscuro: matchMedia("(prefers-color-scheme: dark)").matches,
})
```

Esperado: `hayClaseDark: false`. El valor de `sistemaEnOscuro` da igual — ese es justamente el punto de haber conservado el `@custom-variant`.

- [ ] **Step 7: commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "feat(ui): la capa de tokens pasa a la paleta de Linear"
```

---

### Task 2: Los componentes de `ui/`

Cinco archivos donde el token no alcanza y hay que tocar la clase.

**Files:**
- Modify: `src/components/ui/card.tsx:15`
- Modify: `src/components/ui/input.tsx:11`
- Modify: `src/components/ui/select.tsx:47,72`
- Modify: `src/components/ui/badge.tsx:8,12-21`
- Modify: `src/components/ui/button.tsx:12,23-35`

**Interfaces:**
- Consumes: de la Task 1, `shadow-hairline` y las utilidades de color con nombre propio.
- Produces: `<Button variant="pill">` — píldora blanca sobre fondo oscuro, para el CTA de la nav pública. La Task 6 la usa por ese nombre.

- [ ] **Step 1: `card.tsx` — hairline interno en vez de `ring`**

En `src/components/ui/card.tsx:15`, dentro del `cn(...)` de `Card`, reemplazá `ring-1 ring-foreground/10` por `shadow-hairline`, y subí el padding de tarjeta de `--spacing(4)` a `--spacing(6)` (24px, el valor de Linear). La cadena queda:

```tsx
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground shadow-hairline [--card-spacing:--spacing(6)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(4)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
```

El `data-[size=sm]` sube de 3 a 4 (12px a 16px) para que la tarjeta compacta no quede desproporcionada frente a la de 24px.

- [ ] **Step 2: `input.tsx` — fondo, borde y foco de Linear**

En `src/components/ui/input.tsx:11`, dentro del `cn(...)`:

- `bg-transparent` pasa a `bg-white/[0.02]`
- `focus-visible:ring-3 focus-visible:ring-ring/50` pasa a `focus-visible:ring-0`

El foco de Linear abre el borde a Mist en vez de agregar un halo, y `focus-visible:border-ring` ya lo hace. La cadena queda:

```tsx
        "h-8 w-full min-w-0 rounded-lg border border-input bg-white/[0.02] px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-0 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
```

Las utilidades `dark:` quedan como están: son inertes (Task 1, Step 6) y sacarlas es ruido en el diff.

- [ ] **Step 3: `select.tsx` — el disparador igual que el input, el panel sobre Obsidian**

En `src/components/ui/select.tsx:47` (`SelectTrigger`), mismo criterio: `bg-transparent` a `bg-white/[0.02]`, y `focus-visible:ring-3 focus-visible:ring-ring/50` a `focus-visible:ring-0`.

En `src/components/ui/select.tsx:72` (`SelectContent`), `shadow-md ring-1 ring-foreground/10` pasa a `shadow-hairline`: el panel flotante se apoya en `bg-popover` (Obsidian) con el mismo borde capilar que las tarjetas, sin sombra difusa.

- [ ] **Step 4: `badge.tsx` — radio 4px y las variantes de estado**

`badge.tsx` es la única excepción al mapeo automático de radios: en Linear los badges de estado tienen 4px, no son píldoras. En `src/components/ui/badge.tsx:8`, `rounded-4xl` pasa a `rounded-md` (que la Task 1 dejó en 4px).

Y el bloque `variants` de `src/components/ui/badge.tsx:11-22` pasa a:

```tsx
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary text-muted-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-coral-red/15 text-coral-red focus-visible:ring-destructive/20 [a]:hover:bg-coral-red/25",
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost: "hover:bg-muted hover:text-muted-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
```

`secondary` pasa a texto Fog sobre `rgba(255,255,255,.05)`: es el badge "N pendiente(s)" de `movement-list.tsx:58`, y en Linear la metadata inactiva va en Fog. `destructive` se apoya en Coral Red por nombre.

No se agrega una variante `success`: hoy nada muestra un badge de "pagado", y un token que no usa nadie es deuda.

- [ ] **Step 5: `button.tsx` — el lima y la píldora**

En `src/components/ui/button.tsx:12`, la variante `default`:

```tsx
        default: "bg-primary font-medium text-primary-foreground hover:bg-primary/90",
```

`font-medium` es 510 desde la Task 1, el peso que Linear pide para el botón de acción. El hover baja a `/90` en vez de `/80`: sobre un fondo casi negro, `/80` deja ver el lienzo a través del lima y el botón se ensucia.

Y se agrega la variante `pill`, después de `link`:

```tsx
        // La píldora blanca de la nav pública: el segundo elemento de más
        // contraste del sistema, después del lima. Radio de píldora explícito
        // porque el resto de los botones son de 6px.
        pill: "rounded-4xl bg-paper font-medium text-void hover:bg-bone",
```

- [ ] **Step 6: correr la red de regresión**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Esperado: los tres en verde. `typecheck` es el que importa acá: si `pill` quedó mal escrita en el `cva`, la variante no existe en el tipo y la Task 6 no compilaría.

- [ ] **Step 7: verificar en el navegador**

En `http://localhost:3100/login`, con `javascript_tool`:

```js
(() => {
  const card = document.querySelector('[data-slot="card"]')
  const input = document.querySelector('[data-slot="input"]')
  return {
    sombraCard: getComputedStyle(card).boxShadow,
    paddingCard: getComputedStyle(card).paddingTop,
    fondoInput: getComputedStyle(input).backgroundColor,
    bordeInput: getComputedStyle(input).borderColor,
  }
})()
```

Esperado: `sombraCard` contiene `inset` y `rgb(35, 37, 42)`; `paddingCard` es `24px`; `fondoInput` es `rgba(255, 255, 255, 0.02)`; `bordeInput` es `rgba(255, 255, 255, 0.08)`.

Sacá además una captura con `computer {action: "screenshot"}` — es la primera pantalla completa del sistema nuevo y sirve de referencia para las que siguen.

- [ ] **Step 8: commit**

```bash
git add src/components/ui
git commit -m "feat(ui): las primitivas de shadcn toman las formas de Linear"
```

---

### Task 3: El foco del formulario, de punta a punta

Antes de repartir el lima conviene cerrar el foco, porque la Task 2 le sacó el halo a inputs y selects y hay que confirmar que el estado sigue siendo visible. Es la única tarea del plan que verifica accesibilidad y no estética.

**Files:**
- Modify: `src/components/ui/button.tsx:8` (sólo si el chequeo falla)

**Interfaces:**
- Consumes: `input.tsx` y `select.tsx` ya modificados en la Task 2.
- Produces: nada que consuman las tareas siguientes.

- [ ] **Step 1: recorrer el formulario con el teclado**

En `http://localhost:3100/registro`, con `computer`, mandá `key: "Tab"` repetidamente hasta recorrer los campos y los botones. Después de cada Tab, leé con `javascript_tool`:

```js
(() => {
  const el = document.activeElement
  const cs = getComputedStyle(el)
  return {
    elemento: el.tagName + (el.dataset.slot ? `[${el.dataset.slot}]` : ""),
    borde: cs.borderColor,
    outline: cs.outlineColor + " " + cs.outlineWidth,
    sombra: cs.boxShadow,
  }
})()
```

- [ ] **Step 2: confirmar que el foco se ve en los tres tipos de control**

En inputs y selects el borde tiene que pasar a `rgb(208, 214, 224)` (Mist) — el borde en reposo es `rgba(255,255,255,0.08)`, así que el salto de contraste es grande y visible.

En los botones el foco sigue viniendo de `focus-visible:ring-3 focus-visible:ring-ring/50`, que la Task 2 no tocó.

Si algún control queda sin ninguna marca de foco visible, agregá en la clase base de `button.tsx:8` un `focus-visible:ring-offset-2 focus-visible:ring-offset-background` y volvé a chequear. **No saques el foco de ningún control para que "quede más limpio":** es lo único que hace la app navegable sin mouse, y el spec no autoriza tocarlo.

- [ ] **Step 3: commit (sólo si hubo cambio)**

Si el Step 2 pasó sin tocar nada, no hay commit: anotalo y seguí.

```bash
git add src/components/ui/button.tsx
git commit -m "fix(ui): el foco del botón se separa del fondo"
```

---

### Task 4: Una sola acción lima por pantalla

`--primary` ahora es lima y `default` es la variante por defecto de `Button`: todo botón sin `variant` explícito quedó lima. Hay dos lugares donde eso rompe la regla del sistema.

**Files:**
- Modify: `src/components/installment-rows.tsx:55`
- Modify: `src/components/exchange-form.tsx:32,39`

**Interfaces:**
- Consumes: las variantes `outline` y `secondary` de `button.tsx`, que ya existen.
- Produces: nada.

- [ ] **Step 1: contar los botones lima que hay hoy**

Abrí `http://localhost:3100/cambios` (necesita sesión — si no la tenés, saltá al Step 2 y hacé el chequeo al final, en la Task 9) y corré:

```js
[...document.querySelectorAll('[data-slot="button"][data-variant="default"]')].map(b => b.textContent.trim())
```

Esperado **antes** del arreglo: dos entradas, "Comprar dólares" o "Vender dólares" más "Registrar operación".

- [ ] **Step 2: `installment-rows.tsx` — "Marcar pagada" deja de ser lima**

Es el caso grave: `src/components/installment-rows.tsx:52-60` renderiza un botón por cuota impaga, así que un movimiento en 12 cuotas dibujaría 12 botones lima. En la línea 55:

```tsx
                variant={row.paid ? "secondary" : "outline"}
```

- [ ] **Step 3: `exchange-form.tsx` — los toggles bajan a `secondary`**

En `src/components/exchange-form.tsx:29-44`, los dos botones son un selector de dirección, no la acción de la pantalla: el lima le corresponde a "Registrar operación". Las líneas 32 y 39 pasan a:

```tsx
          variant={direction === "buy" ? "secondary" : "outline"}
```

```tsx
          variant={direction === "sell" ? "secondary" : "outline"}
```

- [ ] **Step 4: correr la red de regresión**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Esperado: los tres en verde.

- [ ] **Step 5: volver a contar**

Con la misma expresión del Step 1, en `/cambios` y después en `/egresos` con un movimiento en cuotas desplegado:

```js
[...document.querySelectorAll('[data-slot="button"][data-variant="default"]')].map(b => b.textContent.trim())
```

Esperado: exactamente una entrada por pantalla — `["Registrar operación"]` en `/cambios`, `["Guardar"]` en `/egresos`.

Si no tenés sesión, dejá este paso pendiente y anotalo: se cierra en la Task 9.

- [ ] **Step 6: commit**

```bash
git add src/components/installment-rows.tsx src/components/exchange-form.tsx
git commit -m "fix(ui): una sola acción lima por pantalla"
```

---

### Task 5: La nav y el contenedor de la app

**Files:**
- Modify: `src/components/app-nav.tsx:40-68`
- Modify: `src/app/(app)/layout.tsx:8`

**Interfaces:**
- Consumes: `text-mist`, `text-paper`, `text-fog`, `bg-acid-lime`, `border-graphite` de la Task 1.
- Produces: nada.

- [ ] **Step 1: reescribir el `return` de `app-nav.tsx`**

El indicador del link activo deja de ser un fondo y pasa a ser una barra de 2px en lima abajo, que es como Linear marca la sección activa. El bloque `return` de `src/components/app-nav.tsx:40-68` pasa a:

```tsx
  return (
    <nav className="mb-8 flex items-center gap-1 overflow-x-auto border-b border-graphite">
      {LINKS.map((link) => {
        const active = pathname === link.href
        return (
          <Link
            key={link.href}
            href={link.href}
            // La barra activa va como borde inferior de 2px sobre el mismo
            // hairline de la nav, no como un bloque aparte: así no corre el
            // texto un pixel al cambiar de sección.
            className={cn(
              "border-b-2 px-3 py-2 text-[13px] whitespace-nowrap transition-colors",
              active
                ? "border-acid-lime text-paper"
                : "border-transparent text-mist hover:text-paper",
            )}
          >
            {link.label}
          </Link>
        )
      })}
      <span className="ml-auto flex items-center gap-2">
        {error && <span className="text-destructive text-xs">{error}</span>}
        <button
          type="button"
          onClick={handleSignOut}
          disabled={pending}
          className="px-3 py-2 text-[13px] whitespace-nowrap text-fog transition-colors hover:text-paper"
        >
          {pending ? "Saliendo…" : "Salir"}
        </button>
      </span>
    </nav>
  )
```

El `pb-2` se va: el padding ahora lo pone cada link, para que la barra activa llegue hasta el borde de la nav.

- [ ] **Step 2: subir el contenedor a 1200px**

En `src/app/(app)/layout.tsx:8`, `max-w-5xl` (1024px) pasa a `max-w-[1200px]`, y el respiro vertical sube a la escalera de Linear:

```tsx
    <div className="mx-auto max-w-[1200px] px-6 py-8">
```

- [ ] **Step 3: correr la red de regresión**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Esperado: los tres en verde.

- [ ] **Step 4: verificar**

Con sesión abierta, en `http://localhost:3100/dashboard`:

```js
(() => {
  const activo = [...document.querySelectorAll("nav a")].find(a => a.getAttribute("href") === "/dashboard")
  const cs = getComputedStyle(activo)
  return {
    colorTexto: cs.color,
    barra: cs.borderBottomColor + " " + cs.borderBottomWidth,
    anchoContenedor: getComputedStyle(document.querySelector("nav").parentElement).maxWidth,
  }
})()
```

Esperado: `colorTexto` es `rgb(255, 255, 255)`; `barra` es `rgb(228, 242, 34) 2px`; `anchoContenedor` es `1200px`.

Sin sesión, dejalo anotado para la Task 9.

- [ ] **Step 5: commit**

```bash
git add src/components/app-nav.tsx "src/app/(app)/layout.tsx"
git commit -m "feat(ui): la nav marca la sección activa con la barra lima"
```

---

### Task 6: La landing

Única superficie de marketing del proyecto, y la única que sigue el ritmo de Linear al pie: 1200px, hero de 64px y gap de sección de 96px.

**Files:**
- Modify: `src/app/page.tsx` (reemplazo completo)

**Interfaces:**
- Consumes: `<Button variant="pill">` de la Task 2, `text-hero` y las utilidades de color de la Task 1.
- Produces: nada.

- [ ] **Step 1: reescribir `src/app/page.tsx`**

El archivo entero pasa a ser:

```tsx
import Link from "next/link"
import { redirect } from "next/navigation"

import { Button } from "@/components/ui/button"
import { getOptionalUser } from "@/server/session"

export default async function HomePage() {
  if (await getOptionalUser()) redirect("/dashboard")

  return (
    <div className="min-h-dvh">
      {/* Nav pública: wordmark a la izquierda, entrar y la píldora a la
          derecha. Los 1200px son el ancho de página del sistema. */}
      <header className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-4">
        <span className="text-base font-medium text-paper">Mis Pesitos</span>
        <nav className="flex items-center gap-2">
          <Link
            href="/login"
            className="px-3 py-2 text-[13px] text-mist transition-colors hover:text-paper"
          >
            Entrar
          </Link>
          <Button asChild variant="pill">
            <Link href="/registro">Crear cuenta</Link>
          </Button>
        </nav>
      </header>

      {/* El gap de sección de 96px del sistema vive acá y sólo acá: adentro de
          la app la escalera es 8/12/24. */}
      <main className="mx-auto max-w-[1200px] px-6 pt-24 pb-24">
        <h1 className="max-w-3xl text-hero font-medium text-paper">
          Tu plata, en pesos y en dólares.
        </h1>
        <p className="mt-6 max-w-xl text-base text-fog">
          Anotá lo que entra y lo que sale, seguí tus cuotas y mirá cuánta plata te queda
          de verdad.
        </p>
        <div className="mt-10 flex items-center gap-6">
          <Button asChild size="lg">
            <Link href="/registro">Crear cuenta</Link>
          </Button>
          {/* El link secundario con glifo de flecha, en vez de un segundo botón
              del mismo peso: el sistema admite una sola acción por vista. */}
          <Link
            href="/login"
            className="text-[13px] text-mist transition-colors hover:text-paper"
          >
            Ya tengo cuenta →
          </Link>
        </div>
      </main>
    </div>
  )
}
```

El `<h1>` cambia de texto: "Mis Pesitos" ya está en el wordmark de la nav y repetirlo a 64px no dice nada. El hero de Linear enuncia la propuesta, no la marca.

- [ ] **Step 2: correr la red de regresión**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Esperado: los tres en verde. Si `typecheck` se queja de `variant="pill"`, la Task 2 Step 5 quedó a medias.

- [ ] **Step 3: verificar**

En `http://localhost:3100/`:

```js
(() => {
  const h1 = document.querySelector("h1")
  const cs = getComputedStyle(h1)
  return {
    tamaño: cs.fontSize,
    peso: cs.fontWeight,
    tracking: cs.letterSpacing,
    interlineado: cs.lineHeight,
    color: cs.color,
    limas: [...document.querySelectorAll('[data-slot="button"][data-variant="default"]')].length,
  }
})()
```

Esperado: `tamaño` `64px`; `peso` `510`; `tracking` `-1.408px` (que es `-0.022em` a 64px); `interlineado` `64px`; `color` `rgb(255, 255, 255)`; `limas` **1**.

- [ ] **Step 4: mirarla**

Sacá una captura con `computer {action: "screenshot"}` a 1280px y otra con `resize_window {preset: "mobile"}` recargando después. En móvil, 64px de hero se desborda: si el título corta mal, bajalo con `text-4xl sm:text-hero` en el `<h1>` y volvé a mirar.

- [ ] **Step 5: commit**

```bash
git add src/app/page.tsx
git commit -m "feat(ui): la landing toma el hero y la nav de Linear"
```

---

### Task 7: Los importes se despintan

**Files:**
- Modify: `src/components/dashboard/balance-cards.tsx:82-90`
- Modify: `src/app/(app)/cambios/page.tsx:47-53`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: nada.

- [ ] **Step 1: `balance-cards.tsx`**

`src/components/dashboard/balance-cards.tsx:82-90` tiene un `text-emerald-600` de Tailwind, fuera del sistema. El bloque entero pasa a:

```tsx
          {/*
           * Sin verde ni rojo: en este sistema el color señala estado, no
           * importe, y el signo ya dice si el mes cerró para arriba o para
           * abajo. El detalle de cuánto entró y cuánto salió está en la línea
           * de abajo.
           */}
          <p className="text-2xl tabular-nums">{formatMoney(diff, "ARS")}</p>
```

La constante `diff` de la línea 21 sigue usándose. Si el `typecheck` avisa que quedó sin usar, es que borraste de más.

- [ ] **Step 2: `cambios/page.tsx`**

`src/app/(app)/cambios/page.tsx:47-53` pasa a:

```tsx
          <CardContent className="text-2xl tabular-nums">
            {formatMoney(position.realizedArsCents, "ARS")}
          </CardContent>
```

- [ ] **Step 3: correr la red de regresión**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Esperado: los tres en verde.

- [ ] **Step 4: confirmar que no queda ningún color de Tailwind suelto**

```bash
grep -rn "emerald\|rose-\|red-\|green-\|amber\|sky-\|slate-\|zinc-\|gray-" src --include=*.tsx
```

Esperado: **sin resultados**. Cualquier coincidencia es un color fuera del sistema que hay que mapear a la paleta.

- [ ] **Step 5: commit**

```bash
git add src/components/dashboard/balance-cards.tsx "src/app/(app)/cambios/page.tsx"
git commit -m "feat(ui): los importes vuelven a la escala gris"
```

---

### Task 8: Los gráficos

**Files:**
- Modify: `src/components/dashboard/charts.tsx` (reemplazo completo)

**Interfaces:**
- Consumes: nada de las tareas anteriores — Recharts recibe colores como strings de JS, así que la paleta se declara acá.
- Produces: nada.

- [ ] **Step 1: reescribir `src/components/dashboard/charts.tsx`**

El archivo entero pasa a ser:

```tsx
"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { formatMoney } from "@/lib/money"

/*
 * La paleta del sistema, repetida acá en hexadecimal a propósito: Recharts
 * recibe colores como strings de JavaScript y no puede leer los tokens de
 * Tailwind. Los valores son los de `globals.css`; si allá cambian, acá también.
 *
 * El lima ácido no está en esta lista y no tiene que estarlo: es el color de la
 * acción principal y de nada más.
 */
const GRAPHITE = "#23252a"
const FOG = "#8a8f98"
const CARBON = "#0f1011"
const SIGNAL_TEAL = "#02b8cc"
const PULSE_GREEN = "#27a644"
const CORAL_RED = "#eb5757"

// La rueda decorativa de la torta: los cuatro acentos cromáticos del sistema
// más tres grises, para que una lista larga de categorías no se quede sin
// colores ni invente ninguno.
const COLORS = [SIGNAL_TEAL, "#6366f1", "#8b5cf6", PULSE_GREEN, FOG, "#62666d", "#383b3f"]

const toPesos = (cents: number) => cents / 100
const tip = (value: number) => formatMoney(Math.round(value * 100), "ARS")
// El `formatter` de Tooltip recibe el ValueType genérico de recharts (puede
// ser number, string o un array); acá los datos que le pasamos son siempre
// number, así que sólo se formatea ese caso y el resto se muestra tal cual.
const tooltipFormatter = (value: number | string | ReadonlyArray<number | string> | undefined) =>
  typeof value === "number" ? tip(value) : String(value ?? "")

/*
 * Recharts pinta el tooltip blanco por defecto. Sobre un lienzo casi negro eso
 * es un rectángulo encandilante flotando en el medio del gráfico, así que va
 * sobre Carbon con el mismo borde capilar que las tarjetas.
 */
const TOOLTIP_STYLE = {
  backgroundColor: CARBON,
  border: `1px solid ${GRAPHITE}`,
  borderRadius: 6,
  color: "#d0d6e0",
  fontSize: 13,
} as const

const AXIS = { stroke: GRAPHITE, tick: { fill: FOG, fontSize: 12 } } as const

export function ProjectionChart({
  data,
}: {
  data: { month: string; arsCents: number }[]
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data.map((d) => ({ month: d.month, saldo: toPesos(d.arsCents) }))}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRAPHITE} />
        <XAxis dataKey="month" {...AXIS} />
        <YAxis width={80} {...AXIS} />
        <Tooltip formatter={tooltipFormatter} contentStyle={TOOLTIP_STYLE} cursor={{ stroke: GRAPHITE }} />
        <Line type="monotone" dataKey="saldo" stroke={SIGNAL_TEAL} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function CategoryPie({ data }: { data: { name: string; arsCents: number }[] }) {
  if (data.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No cargaste gastos con fecha de este mes.
      </p>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data.map((d) => ({ name: d.name, value: toPesos(d.arsCents) }))}
          dataKey="value"
          nameKey="name"
          outerRadius={80}
          // El borde de cada porción en Void separa las porciones entre sí sin
          // agregar una línea de color.
          stroke={CARBON}
        >
          {data.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={tooltipFormatter} contentStyle={TOOLTIP_STYLE} />
      </PieChart>
    </ResponsiveContainer>
  )
}

export function MonthlyBars({
  data,
}: {
  data: { month: string; incomeArsCents: number; expenseArsCents: number }[]
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        data={data.map((d) => ({
          month: d.month,
          Ingresos: toPesos(d.incomeArsCents),
          Egresos: toPesos(d.expenseArsCents),
        }))}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={GRAPHITE} />
        <XAxis dataKey="month" {...AXIS} />
        <YAxis width={80} {...AXIS} />
        <Tooltip formatter={tooltipFormatter} contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <Legend wrapperStyle={{ fontSize: 13, color: FOG }} />
        {/* Acá el verde y el rojo son datos, no cuerpo de texto: la regla de
            "los importes van en gris" no aplica a una serie de un gráfico. */}
        <Bar dataKey="Ingresos" fill={PULSE_GREEN} />
        <Bar dataKey="Egresos" fill={CORAL_RED} />
      </BarChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 2: correr la red de regresión**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Esperado: los tres en verde. `typecheck` es el que cuenta: `contentStyle` y `cursor` son props tipadas de Recharts 3 y un `as const` de más las rompe.

- [ ] **Step 3: verificar en el dashboard**

Con sesión abierta, en `http://localhost:3100/dashboard`, sacá una captura y pasá el mouse por encima de una barra con `computer {action: "hover"}` para que aparezca el tooltip. Sacá otra captura con el tooltip abierto.

Lo que hay que ver: ningún rectángulo blanco, ejes y grilla apenas visibles sobre el fondo, y ninguna porción de la torta en lima.

Sin sesión, dejalo anotado para la Task 9.

- [ ] **Step 4: commit**

```bash
git add src/components/dashboard/charts.tsx
git commit -m "feat(ui): los gráficos entran en la paleta del sistema"
```

---

### Task 9: Barrido final

Las pantallas que heredan de la Task 1 y la verificación completa. Es la tarea donde se cierra todo lo que quedó pendiente por falta de sesión.

**Files:**
- Modify: `src/app/(app)/ajustes/page.tsx:9`
- Modify: `src/app/(app)/cambios/page.tsx:22`
- Modify: `src/app/(app)/categorias/page.tsx:14`
- Modify: `src/app/(app)/dashboard/page.tsx:180`
- Modify: `src/components/movement-screen.tsx:57`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: el reporte final al usuario.

- [ ] **Step 1: los títulos de pantalla van en Paper**

Los cinco `<h1>` de la app están en `text-2xl font-semibold` y heredan Mist, que es el color del cuerpo. En Linear el título va en blanco. En cada uno de los cinco archivos, `className="text-2xl font-semibold"` pasa a:

```tsx
className="text-2xl font-semibold text-paper"
```

El tracking ya viene de `--text-2xl--letter-spacing` (Task 1) y el peso ya es 590: no hay que agregar nada más.

- [ ] **Step 2: correr la red de regresión completa**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Esperado: los cuatro en verde. `pnpm build` recién acá, porque es el único paso que prueba que `next/font` resuelve Inter en un build de producción y no sólo en dev.

- [ ] **Step 3: recorrer las ocho pantallas**

Sin sesión: `/`, `/login`, `/registro`. Con sesión: `/onboarding`, `/dashboard`, `/ingresos`, `/egresos`, `/cambios`, `/categorias`, `/ajustes`.

En cada una, captura con `computer {action: "screenshot"}` y consola con `read_console_messages {onlyErrors: true}`.

**Si no hay base ni usuario disponible:** hacé las tres públicas, dejá las otras siete sin verificar, y **decilo explícitamente en el reporte final, nombrando cuáles quedaron sin ver.** No las declares revisadas. También quedan sin cerrar los chequeos pendientes de las tareas 4, 5 y 8.

- [ ] **Step 4: el chequeo del lima, pantalla por pantalla**

En cada pantalla accesible:

```js
[...document.querySelectorAll('[data-slot="button"][data-variant="default"]')].map(b => b.textContent.trim())
```

Esperado: **como máximo una entrada por pantalla**, y ninguna en `/dashboard`, que es de sólo lectura. Dos o más es una violación de la regla del sistema: mapeala al reparto de §6.1 del spec.

- [ ] **Step 5: el barrido de colores fuera del sistema**

```bash
grep -rn "emerald\|rose-\|red-\|green-\|amber\|sky-\|slate-\|zinc-\|gray-\|#[0-9a-fA-F]\{6\}" src --include=*.tsx
```

Esperado: sólo los hexadecimales de `src/components/dashboard/charts.tsx`, que están ahí porque Recharts no puede leer tokens, y con el comentario que lo explica. Cualquier otra coincidencia hay que mapearla a la paleta.

- [ ] **Step 6: commit**

```bash
git add "src/app/(app)" src/components/movement-screen.tsx
git commit -m "feat(ui): los títulos de pantalla van en blanco"
```

- [ ] **Step 7: actualizar el README**

En la sección "Qué hace, pantalla por pantalla" del README no hay nada que cambiar, pero sí conviene dejar el puntero al sistema visual. Debajo de la línea de "Diseño", agregá:

```markdown
- Sistema visual: `docs/superpowers/specs/2026-08-10-linear-design-system-design.md`
```

```bash
git add README.md
git commit -m "docs: el README apunta al sistema visual"
```

- [ ] **Step 8: el reporte**

Cerrá con: qué pantallas se verificaron de verdad y con qué evidencia, cuáles quedaron sin ver y por qué, y cualquier lugar donde la implementación se apartó de este plan. Si algo del plan resultó estar mal, decilo — el plan no es la verdad, el código sí.

---

## Cosas que este plan deliberadamente no hace

- **No agrega tests de estilo.** Ver la nota de arriba.
- **No agrega una variante `success` al badge.** Nada la usaría.
- **No aplica los 96px de gap adentro de la app.** Sólo en la landing (§8.2 del spec).
- **No carga Berkeley Mono.** Es paga y su rol no existe en esta app.
- **No agrega animaciones ni micro-interacciones.** El DESIGN.md no las especifica.
- **No reestructura ninguna pantalla interna.** El dashboard sigue siendo cuatro tarjetas y tres gráficos.
