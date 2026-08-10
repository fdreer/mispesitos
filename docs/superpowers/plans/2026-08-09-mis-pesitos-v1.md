# Mis Pesitos v1 — Implementation Plan

> **Estado: ejecutado y cerrado.** Las 18 tareas están implementadas, revisadas y
> commiteadas en `feat/v1`. Este documento es **histórico**: es el plan que se
> siguió, no una descripción de lo que quedó en el código.
>
> Para lo que la app hace hoy, ver el [README](../../../README.md).
> Para lo que falta, [`docs/PENDIENTES.md`](../../PENDIENTES.md).
>
> **El plan tenía errores que se corrigieron durante la ejecución.** Los más caros,
> por si alguien lo usa como referencia:
> - El código de `listUsdPositionEvents` (Task 15) no sembraba el saldo inicial en
>   dólares ni filtraba por la fecha del saldo inicial: `/cambios` mostraba US$ 0
>   mientras el dashboard mostraba los dólares del onboarding, con una alerta de
>   sobreventa permanente y falsa.
> - El formulario de movimientos (Task 13) tenía **dos** campos `rate`, uno oculto y
>   uno visible: el tipo de cambio que el usuario tipeaba se descartaba en silencio.
> - Las pantallas de ingresos y egresos usaban lados opuestos del spread, lo que
>   fabricaba diferencia de cambio que era sólo el margen de la casa de cambio.
> - `ENABLE ROW LEVEL SECURITY` + `FORCE` no alcanzaba: el rol `postgres` de Supabase
>   tiene `BYPASSRLS`, que le gana a `FORCE`. La app conecta con un rol dedicado.
> - Varias acciones descartaban su `ActionResult` con `void`, así que los errores no
>   se veían nunca, y varias no validaban con Zod pese a la constraint global.
> - Los conteos de tests que aparecen en los pasos están mal en casi todas las
>   tareas. El criterio siempre fue "todo verde", nunca un número.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir una app web multiusuario de finanzas personales donde cada persona registra ingresos y egresos (con cuotas), compra y vende dólares, y ve su saldo, sus deudas y su flujo proyectado en un dashboard.

**Architecture:** Next.js App Router con todo el acceso a datos en el servidor (Server Components para leer, Server Actions para escribir). Drizzle contra el Postgres de Supabase, con RLS como segunda capa: cada lectura abre una transacción que declara el usuario de la sesión antes de consultar. Toda la lógica de plata vive en funciones puras sin dependencias, testeadas con Vitest, separadas del acceso a datos y de la UI.

**Tech Stack:** Next.js 16.3.0, React 19.2.8, TypeScript 7.0.2, Tailwind CSS 4.3.3, shadcn/ui, Drizzle ORM 0.45.2, better-auth 1.6.26, Zod 4.4.3, postgres.js 3.4.9, Recharts 3.10.1, Vitest 4.1.10, pnpm.

**Spec:** `docs/superpowers/specs/2026-08-09-mis-pesitos-design.md` — leelo antes de empezar. Este plan lo implementa, no lo reemplaza.

## Global Constraints

Estas reglas aplican a **todas** las tareas. No se repiten en cada una.

- **Gestor de paquetes: `pnpm`.** Nunca `npm` ni `yarn`. Instalar con `pnpm add`, ejecutar con `pnpm`.
- **Versiones exactas** al 2026-08-09, las últimas publicadas: `next@16.3.0`, `react@19.2.8`, `react-dom@19.2.8`, `typescript@7.0.2`, `tailwindcss@4.3.3`, `@tailwindcss/postcss@4.3.3`, `drizzle-orm@0.45.2`, `drizzle-kit@0.31.10`, `better-auth@1.6.26`, `zod@4.4.3`, `postgres@3.4.9`, `recharts@3.10.1`, `lucide-react@1.31.0`, `clsx@2.1.1`, `tailwind-merge@3.6.0`, `class-variance-authority@0.7.1`, `vitest@4.1.10`, `eslint@10.8.1`, `@types/node@26.2.0`.
- **Toda la plata son centavos en enteros.** Ninguna variable de importe es decimal. En Postgres, `bigint`; en Drizzle, `bigint({ mode: 'number' })` — nunca `mode: 'bigint'`, porque `BigInt` no cruza el límite de serialización de React Server Components.
- **Las fechas son strings `YYYY-MM-DD`.** Nunca objetos `Date` para fechas de negocio, nunca `timestamp`. Evita que un movimiento se corra un día por zona horaria.
- **Una sola función convierte monedas** (`convertToArs` en `src/lib/money.ts`). Ningún otro archivo multiplica por un `rate`.
- **Ningún importe derivado se persiste.** El monto en pesos de un movimiento en dólares siempre se calcula.
- **Ninguna consulta a la base sale del navegador.** Sin `NEXT_PUBLIC_` para nada de Supabase.
- **Toda Server Action valida su entrada con Zod** antes de tocar la base. Es el borde de confianza.
- **Textos de interfaz en español rioplatense.** Identificadores de código y de base, en inglés.
- **Commits en español**, uno por tarea como mínimo, con el prefijo convencional (`feat:`, `test:`, `chore:`, `fix:`).

## Estructura de archivos

Se crea en este orden. Cada archivo tiene una sola responsabilidad.

| Archivo | Responsabilidad |
|---|---|
| `src/lib/money.ts` | Centavos, formato es-AR, conversión y redondeo. Puro. |
| `src/lib/dates.ts` | Hoy en Argentina, aritmética de meses con clamp. Puro. |
| `src/lib/installments.ts` | Reparto de un total en N cuotas y sus vencimientos. Puro. |
| `src/lib/position.ts` | Posición en dólares, TC promedio y diferencia de cambio. Puro. |
| `src/lib/balance.ts` | Saldo por moneda a partir de cuotas pagadas y cambios. Puro. |
| `src/lib/rate.ts` | Cotización sugerida desde dolarapi, con fallback. |
| `src/lib/schemas.ts` | Esquemas Zod de todas las entradas. |
| `src/db/schema.ts` | Tablas Drizzle: auth + `user_settings`, `category`, `movement`, `installment`. |
| `src/db/client.ts` | Conexión postgres.js, instancia Drizzle y `withUser()` (RLS). |
| `src/server/session.ts` | `requireUser()` y `requireSettings()`. |
| `src/server/queries.ts` | Todas las lecturas, siempre dentro de `withUser`. |
| `src/server/actions/movements.ts` | Alta, edición, borrado de movimientos y cuotas. |
| `src/server/actions/categories.ts` | ABM de categorías. |
| `src/server/actions/settings.ts` | Onboarding y ajustes. |
| `src/components/*` | UI. shadcn en `src/components/ui/`. |
| `src/app/*` | Rutas. |

---

### Task 1: Proyecto, toolchain y test runner

Deja el repo con `pnpm dev`, `pnpm build`, `pnpm test` y `pnpm lint` funcionando. Todo lo demás se apoya en esto.

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `vitest.config.ts`, `.gitignore`, `.env.example`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- Test: `src/lib/smoke.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: alias `@/*` → `src/*`. Scripts `dev`, `build`, `start`, `lint`, `test`, `test:watch`, `typecheck`, `db:generate`, `db:migrate`.

- [ ] **Step 1: Crear el proyecto Next**

El repo ya existe con `docs/` commiteado. Se inicializa dentro sin borrar nada.

```bash
cd C:/Users/franc/DEV/mis-pesitos-app
pnpm create next-app@16.3.0 . --ts --app --tailwind --eslint --src-dir --import-alias "@/*" --use-pnpm --turbopack --no-git
```

Si pregunta por sobrescribir archivos existentes, responder que no toque `docs/`.

- [ ] **Step 2: Fijar todas las versiones exactas**

```bash
pnpm add next@16.3.0 react@19.2.8 react-dom@19.2.8
pnpm add -D typescript@7.0.2 @types/node@26.2.0 @types/react@19 @types/react-dom@19 tailwindcss@4.3.3 @tailwindcss/postcss@4.3.3 eslint@10.8.1 vitest@4.1.10
```

- [ ] **Step 3: Configurar PostCSS para Tailwind 4**

Tailwind 4 no usa `tailwind.config.ts`. Si `create-next-app` lo generó, borrarlo.

`postcss.config.mjs`:

```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
}
```

`src/app/globals.css`:

```css
@import "tailwindcss";
```

- [ ] **Step 4: Configurar Vitest**

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
})
```

Agregar a `package.json` en `scripts`:

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "tsc --noEmit"
}
```

- [ ] **Step 5: Escribir el test de humo**

`src/lib/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest"

describe("toolchain", () => {
  it("corre tests con el alias @ configurado", () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 6: Verificar que todo el toolchain responde**

```bash
pnpm test
```
Esperado: `1 passed`.

```bash
pnpm typecheck
```
Esperado: sin errores, sale con código 0.

```bash
pnpm build
```
Esperado: build exitoso.

Si `pnpm typecheck` falla con errores internos del compilador (no de tu código), TypeScript 7 todavía no digiere alguna dependencia. Bajar a `typescript@5.9` con `pnpm add -D typescript@5.9` y seguir. Es el riesgo anotado en la sección 11 del spec y no afecta ninguna otra decisión.

- [ ] **Step 7: Escribir `.env.example`**

```bash
# Postgres de Supabase — usar el TRANSACTION POOLER (puerto 6543), no la conexión directa.
# El pooler es necesario para que RLS funcione con transacciones desde serverless.
DATABASE_URL="postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres"

# Secreto de firma de sesiones. Generar con: openssl rand -base64 32
BETTER_AUTH_SECRET=""

# URL base de la app. En desarrollo, http://localhost:3000
BETTER_AUTH_URL="http://localhost:3000"

# Credenciales OAuth de Google Cloud (ver Task 8)
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
```

- [ ] **Step 8: Verificar que `.env.local` está ignorado**

`.gitignore` debe contener `.env*.local`. Confirmar:

```bash
git check-ignore -v .env.local
```
Esperado: una línea indicando la regla que lo ignora. Si no imprime nada, agregar `.env*.local` al `.gitignore` antes de seguir.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: proyecto Next 16, Tailwind 4, TypeScript 7 y Vitest"
```

---

### Task 2: `src/lib/money.ts` — centavos, formato y conversión

**Files:**
- Create: `src/lib/money.ts`
- Test: `src/lib/money.test.ts`
- Delete: `src/lib/smoke.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type Currency = "ARS" | "USD"`
  - `roundCents(value: number): number`
  - `convertToArs(usdCents: number, rate: number): number`
  - `formatMoney(cents: number, currency: Currency): string`
  - `parseAmountToCents(input: string): number | null`

- [ ] **Step 1: Escribir los tests que fallan**

`src/lib/money.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { roundCents, convertToArs, formatMoney, parseAmountToCents } from "@/lib/money"

describe("roundCents", () => {
  it("redondea al entero más cercano", () => {
    expect(roundCents(10.4)).toBe(10)
    expect(roundCents(10.6)).toBe(11)
  })

  it("redondea el medio hacia arriba", () => {
    expect(roundCents(10.5)).toBe(11)
  })
})

describe("convertToArs", () => {
  it("convierte centavos de dólar a centavos de peso", () => {
    // USD 100,00 a 1.450,00 => ARS 145.000,00
    expect(convertToArs(10_000, 1450)).toBe(14_500_000)
  })

  it("redondea al centavo cuando el TC tiene decimales", () => {
    // 1 centavo de dólar a 1234,5678 => 1234,5678 centavos => 1235
    expect(convertToArs(1, 1234.5678)).toBe(1235)
  })

  it("devuelve cero cuando no hay dólares", () => {
    expect(convertToArs(0, 1450)).toBe(0)
  })
})

describe("formatMoney", () => {
  it("formatea pesos en es-AR", () => {
    expect(formatMoney(14_500_000, "ARS")).toBe("$ 145.000,00")
  })

  it("formatea dólares", () => {
    expect(formatMoney(10_000, "USD")).toBe("US$ 100,00")
  })

  it("formatea negativos", () => {
    expect(formatMoney(-5000, "ARS")).toBe("-$ 50,00")
  })
})

describe("parseAmountToCents", () => {
  it("acepta coma decimal", () => {
    expect(parseAmountToCents("1.234,56")).toBe(123_456)
  })

  it("acepta punto decimal", () => {
    expect(parseAmountToCents("1234.56")).toBe(123_456)
  })

  it("acepta enteros", () => {
    expect(parseAmountToCents("1500")).toBe(150_000)
  })

  it("rechaza texto no numérico", () => {
    expect(parseAmountToCents("abc")).toBeNull()
    expect(parseAmountToCents("")).toBeNull()
  })
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
pnpm test src/lib/money.test.ts
```
Esperado: FAIL, no resuelve el módulo `@/lib/money`.

- [ ] **Step 3: Implementar**

`src/lib/money.ts`:

```ts
export type Currency = "ARS" | "USD"

/**
 * Redondeo al centavo. Medio hacia arriba, según la sección 5.0 del spec.
 * Es el único redondeo de plata de toda la app.
 */
export function roundCents(value: number): number {
  return Math.round(value)
}

/**
 * Convierte centavos de dólar a centavos de peso.
 * Es la ÚNICA función que multiplica un importe por una cotización.
 */
export function convertToArs(usdCents: number, rate: number): number {
  return roundCents(usdCents * rate)
}

const FORMATTERS: Record<Currency, Intl.NumberFormat> = {
  ARS: new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }),
  USD: new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }),
}

export function formatMoney(cents: number, currency: Currency): string {
  return FORMATTERS[currency].format(cents / 100)
}

/**
 * Lee lo que el usuario tipeó y lo pasa a centavos.
 * Acepta "1.234,56" (formato argentino) y "1234.56".
 * Devuelve null si no es un número — la Server Action lo rechaza con Zod.
 */
export function parseAmountToCents(input: string): number | null {
  const trimmed = input.trim()
  if (trimmed === "") return null

  // Si tiene coma, la coma es el separador decimal y los puntos son de miles.
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed

  const value = Number(normalized)
  if (!Number.isFinite(value)) return null

  return roundCents(value * 100)
}
```

- [ ] **Step 4: Correr los tests**

```bash
pnpm test src/lib/money.test.ts
```
Esperado: PASS, 11 tests.

Si `formatMoney` falla por el separador exacto que produce `Intl` en tu versión de Node (algunas emiten un espacio no separable entre el símbolo y el número), ajustar la cadena esperada en el test al valor real — el formato lo define `Intl`, no nosotros. No cambiar la implementación para forzar el string.

- [ ] **Step 5: Borrar el test de humo y commitear**

```bash
rm src/lib/smoke.test.ts
git add -A
git commit -m "feat: utilidades de plata en centavos con conversión y formato es-AR"
```

---

### Task 3: `src/lib/dates.ts` — hoy en Argentina y meses con clamp

**Files:**
- Create: `src/lib/dates.ts`
- Test: `src/lib/dates.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type IsoDate = string` (siempre `YYYY-MM-DD`)
  - `todayInAr(): IsoDate`
  - `addMonthsClamped(date: IsoDate, months: number): IsoDate`
  - `monthKey(date: IsoDate): string` (`YYYY-MM`)
  - `isOverdue(dueDate: IsoDate, today: IsoDate): boolean`

- [ ] **Step 1: Escribir los tests que fallan**

`src/lib/dates.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { todayInAr, addMonthsClamped, monthKey, isOverdue } from "@/lib/dates"

describe("todayInAr", () => {
  it("devuelve una fecha en formato YYYY-MM-DD", () => {
    expect(todayInAr()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe("addMonthsClamped", () => {
  it("suma meses manteniendo el día", () => {
    expect(addMonthsClamped("2026-01-15", 1)).toBe("2026-02-15")
    expect(addMonthsClamped("2026-01-15", 12)).toBe("2027-01-15")
  })

  it("recorta al último día cuando el día no existe en el mes destino", () => {
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28")
    expect(addMonthsClamped("2026-08-31", 1)).toBe("2026-09-30")
  })

  it("respeta los años bisiestos", () => {
    expect(addMonthsClamped("2028-01-31", 1)).toBe("2028-02-29")
  })

  it("cruza el año correctamente", () => {
    expect(addMonthsClamped("2026-11-30", 3)).toBe("2027-02-28")
  })

  it("acepta cero meses", () => {
    expect(addMonthsClamped("2026-05-10", 0)).toBe("2026-05-10")
  })
})

describe("monthKey", () => {
  it("extrae el año y mes", () => {
    expect(monthKey("2026-08-09")).toBe("2026-08")
  })
})

describe("isOverdue", () => {
  it("es vencido si la fecha ya pasó", () => {
    expect(isOverdue("2026-08-08", "2026-08-09")).toBe(true)
  })

  it("no es vencido si vence hoy", () => {
    expect(isOverdue("2026-08-09", "2026-08-09")).toBe(false)
  })

  it("no es vencido si vence en el futuro", () => {
    expect(isOverdue("2026-09-01", "2026-08-09")).toBe(false)
  })
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
pnpm test src/lib/dates.test.ts
```
Esperado: FAIL, no resuelve `@/lib/dates`.

- [ ] **Step 3: Implementar**

`src/lib/dates.ts`:

```ts
/** Fecha de negocio: siempre "YYYY-MM-DD", sin hora y sin zona horaria. */
export type IsoDate = string

const AR_TIMEZONE = "America/Argentina/Buenos_Aires"

// "en-CA" formatea como YYYY-MM-DD, que es exactamente el formato que guardamos.
const AR_TODAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: AR_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

/** Hoy según el reloj de Buenos Aires, no el del servidor. */
export function todayInAr(): IsoDate {
  return AR_TODAY.format(new Date())
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

/**
 * Suma meses conservando el día. Si el día no existe en el mes destino
 * (un 31 en febrero), recorta al último día de ese mes.
 * Trabaja en UTC sobre los componentes de la fecha: nunca hay corrimiento de día.
 */
export function addMonthsClamped(date: IsoDate, months: number): IsoDate {
  const [year, month, day] = date.split("-").map(Number)

  const target = new Date(Date.UTC(year, month - 1 + months, 1))
  const targetYear = target.getUTCFullYear()
  const targetMonth = target.getUTCMonth()

  // Día 0 del mes siguiente = último día del mes destino.
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()

  return `${targetYear}-${pad(targetMonth + 1)}-${pad(Math.min(day, lastDay))}`
}

export function monthKey(date: IsoDate): string {
  return date.slice(0, 7)
}

/**
 * Las fechas ISO se comparan como texto sin ambigüedad, por eso no hace falta parsear.
 */
export function isOverdue(dueDate: IsoDate, today: IsoDate): boolean {
  return dueDate < today
}
```

- [ ] **Step 4: Correr los tests**

```bash
pnpm test src/lib/dates.test.ts
```
Esperado: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dates.ts src/lib/dates.test.ts
git commit -m "feat: fechas de negocio en ISO con hoy en Argentina y meses con recorte"
```

---

### Task 4: `src/lib/installments.ts` — reparto de cuotas

Implementa la sección 5.1 del spec: el total se divide en N cuotas iguales y **la última absorbe la diferencia**, con vencimientos mensuales.

**Files:**
- Create: `src/lib/installments.ts`
- Test: `src/lib/installments.test.ts`

**Interfaces:**
- Consumes: `addMonthsClamped`, `IsoDate` de `@/lib/dates`.
- Produces:
  - `type PlannedInstallment = { number: number; amountCents: number; dueDate: IsoDate }`
  - `splitAmount(totalCents: number, count: number): number[]`
  - `buildInstallments(totalCents: number, count: number, firstDueDate: IsoDate): PlannedInstallment[]`
  - `installmentsSumMatches(totalCents: number, amounts: number[]): boolean`

- [ ] **Step 1: Escribir los tests que fallan**

`src/lib/installments.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import {
  splitAmount,
  buildInstallments,
  installmentsSumMatches,
} from "@/lib/installments"

describe("splitAmount", () => {
  it("divide exacto cuando no hay resto", () => {
    expect(splitAmount(12_000, 4)).toEqual([3_000, 3_000, 3_000, 3_000])
  })

  it("deja el resto en la última cuota", () => {
    // $100,00 en 3 => 33,33 / 33,33 / 33,34
    expect(splitAmount(10_000, 3)).toEqual([3_333, 3_333, 3_334])
  })

  it("la suma siempre cierra contra el total", () => {
    for (const total of [1, 7, 99, 10_000, 123_457, 999_999_99]) {
      for (const count of [1, 2, 3, 6, 12, 24]) {
        const parts = splitAmount(total, count)
        expect(parts).toHaveLength(count)
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total)
      }
    }
  })

  it("una sola cuota es el total entero", () => {
    expect(splitAmount(10_000, 1)).toEqual([10_000])
  })

  it("rechaza cantidades de cuota inválidas", () => {
    expect(() => splitAmount(10_000, 0)).toThrow()
    expect(() => splitAmount(10_000, -1)).toThrow()
  })

  it("rechaza totales negativos", () => {
    expect(() => splitAmount(-100, 2)).toThrow()
  })
})

describe("buildInstallments", () => {
  it("genera vencimientos mensuales numerados desde 1", () => {
    const result = buildInstallments(30_000, 3, "2026-08-10")
    expect(result).toEqual([
      { number: 1, amountCents: 10_000, dueDate: "2026-08-10" },
      { number: 2, amountCents: 10_000, dueDate: "2026-09-10" },
      { number: 3, amountCents: 10_000, dueDate: "2026-10-10" },
    ])
  })

  it("recorta el día cuando el mes destino es más corto", () => {
    const result = buildInstallments(20_000, 2, "2026-01-31")
    expect(result.map((i) => i.dueDate)).toEqual(["2026-01-31", "2026-02-28"])
  })

  it("un movimiento de contado es la cuota 1 de 1", () => {
    const result = buildInstallments(55_000, 1, "2026-08-09")
    expect(result).toEqual([
      { number: 1, amountCents: 55_000, dueDate: "2026-08-09" },
    ])
  })
})

describe("installmentsSumMatches", () => {
  it("acepta cuando la suma cierra", () => {
    expect(installmentsSumMatches(10_000, [3_333, 3_333, 3_334])).toBe(true)
  })

  it("rechaza cuando falta o sobra un centavo", () => {
    expect(installmentsSumMatches(10_000, [3_333, 3_333, 3_333])).toBe(false)
    expect(installmentsSumMatches(10_000, [3_334, 3_333, 3_334])).toBe(false)
  })

  it("rechaza una lista vacía", () => {
    expect(installmentsSumMatches(10_000, [])).toBe(false)
  })
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
pnpm test src/lib/installments.test.ts
```
Esperado: FAIL, no resuelve `@/lib/installments`.

- [ ] **Step 3: Implementar**

`src/lib/installments.ts`:

```ts
import { addMonthsClamped, type IsoDate } from "@/lib/dates"

export type PlannedInstallment = {
  number: number
  amountCents: number
  dueDate: IsoDate
}

/**
 * Reparte un total en `count` partes iguales; la última absorbe la diferencia.
 * Sección 5.1 del spec: $100,00 en 3 => 33,33 / 33,33 / 33,34.
 * La suma de las partes es SIEMPRE exactamente el total.
 */
export function splitAmount(totalCents: number, count: number): number[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`La cantidad de cuotas debe ser un entero mayor a cero, no ${count}`)
  }
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    throw new Error(`El total debe ser un entero de centavos no negativo, no ${totalCents}`)
  }

  const base = Math.floor(totalCents / count)
  const parts = new Array<number>(count).fill(base)
  parts[count - 1] = totalCents - base * (count - 1)

  return parts
}

/**
 * Plan completo de cuotas: importes repartidos y vencimientos mensuales
 * a partir de la fecha de la primera.
 */
export function buildInstallments(
  totalCents: number,
  count: number,
  firstDueDate: IsoDate,
): PlannedInstallment[] {
  return splitAmount(totalCents, count).map((amountCents, index) => ({
    number: index + 1,
    amountCents,
    dueDate: addMonthsClamped(firstDueDate, index),
  }))
}

/**
 * Invariante de la sección 4 del spec: la suma de las cuotas es igual al total
 * del movimiento. Se valida en cada alta y en cada edición.
 */
export function installmentsSumMatches(totalCents: number, amounts: number[]): boolean {
  if (amounts.length === 0) return false
  return amounts.reduce((a, b) => a + b, 0) === totalCents
}
```

- [ ] **Step 4: Correr los tests**

```bash
pnpm test src/lib/installments.test.ts
```
Esperado: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/installments.ts src/lib/installments.test.ts
git commit -m "feat: reparto de cuotas con ajuste en la última y vencimientos mensuales"
```

---

### Task 5: `src/lib/position.ts` — posición en dólares y diferencia de cambio

Implementa la sección 5.5 del spec. Es la función más delicada del proyecto: **toda salida de dólares realiza resultado**, se venda o se gaste.

**Files:**
- Create: `src/lib/position.ts`
- Test: `src/lib/position.test.ts`

**Interfaces:**
- Consumes: `roundCents` de `@/lib/money`, `IsoDate` de `@/lib/dates`.
- Produces:
  - `type PositionEvent = { date: IsoDate; usdCents: number; rate: number; direction: "in" | "out" }`
  - `type UsdPosition = { usdCents: number; costArsCents: number; averageRate: number; realizedArsCents: number; oversoldUsdCents: number }`
  - `usdPosition(events: PositionEvent[]): UsdPosition`

- [ ] **Step 1: Escribir los tests que fallan**

`src/lib/position.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { usdPosition, type PositionEvent } from "@/lib/position"

const buy = (date: string, usd: number, rate: number): PositionEvent => ({
  date,
  usdCents: usd * 100,
  rate,
  direction: "in",
})

const sell = (date: string, usd: number, rate: number): PositionEvent => ({
  date,
  usdCents: usd * 100,
  rate,
  direction: "out",
})

describe("usdPosition", () => {
  it("sin eventos, la posición está vacía", () => {
    const p = usdPosition([])
    expect(p.usdCents).toBe(0)
    expect(p.costArsCents).toBe(0)
    expect(p.averageRate).toBe(0)
    expect(p.realizedArsCents).toBe(0)
    expect(p.oversoldUsdCents).toBe(0)
  })

  it("una compra suma cantidad y costo, sin resultado", () => {
    const p = usdPosition([buy("2026-01-10", 100, 1000)])
    expect(p.usdCents).toBe(10_000)
    expect(p.costArsCents).toBe(10_000_000) // $100.000,00
    expect(p.averageRate).toBe(1000)
    expect(p.realizedArsCents).toBe(0)
  })

  it("promedia el costo de dos compras a distinto TC", () => {
    const p = usdPosition([
      buy("2026-01-10", 100, 1000),
      buy("2026-02-10", 100, 1400),
    ])
    expect(p.usdCents).toBe(20_000)
    expect(p.averageRate).toBe(1200)
  })

  it("una venta con el dólar más alto realiza ganancia", () => {
    const p = usdPosition([
      buy("2026-01-10", 100, 1000),
      sell("2026-06-10", 100, 1500),
    ])
    expect(p.usdCents).toBe(0)
    expect(p.costArsCents).toBe(0)
    expect(p.realizedArsCents).toBe(5_000_000) // $50.000,00 de ganancia
  })

  it("una venta con el dólar más bajo realiza pérdida", () => {
    const p = usdPosition([
      buy("2026-01-10", 100, 1500),
      sell("2026-06-10", 100, 1000),
    ])
    expect(p.realizedArsCents).toBe(-5_000_000)
  })

  it("una venta parcial deja el resto al costo promedio", () => {
    const p = usdPosition([
      buy("2026-01-10", 100, 1000),
      sell("2026-06-10", 40, 1500),
    ])
    expect(p.usdCents).toBe(6_000)
    expect(p.averageRate).toBe(1000)
    expect(p.realizedArsCents).toBe(2_000_000) // 40 * (1500-1000) = $20.000,00
  })

  it("un ingreso en dólares entra a la posición a su TC", () => {
    // Un sueldo cobrado en USD entra igual que una compra.
    const p = usdPosition([
      buy("2026-01-10", 100, 1000),
      { date: "2026-02-10", usdCents: 10_000, rate: 1400, direction: "in" },
    ])
    expect(p.usdCents).toBe(20_000)
    expect(p.averageRate).toBe(1200)
  })

  it("un egreso pagado en dólares realiza resultado igual que una venta", () => {
    // Sección 5.5: toda salida de dólares realiza, se venda o se gaste.
    const p = usdPosition([
      buy("2026-01-10", 100, 1000),
      { date: "2026-06-10", usdCents: 10_000, rate: 1500, direction: "out" },
    ])
    expect(p.usdCents).toBe(0)
    expect(p.realizedArsCents).toBe(5_000_000)
  })

  it("procesa los eventos por fecha aunque lleguen desordenados", () => {
    const ordenado = usdPosition([
      buy("2026-01-10", 100, 1000),
      sell("2026-06-10", 100, 1500),
    ])
    const desordenado = usdPosition([
      sell("2026-06-10", 100, 1500),
      buy("2026-01-10", 100, 1000),
    ])
    expect(desordenado).toEqual(ordenado)
  })

  it("si se dispone de más de lo registrado, no queda posición negativa", () => {
    const p = usdPosition([
      buy("2026-01-10", 50, 1000),
      sell("2026-06-10", 100, 1500),
    ])
    expect(p.usdCents).toBe(0)
    expect(p.costArsCents).toBe(0)
    expect(p.oversoldUsdCents).toBe(5_000) // 50 dólares que no estaban cargados
    expect(p.realizedArsCents).toBe(2_500_000) // sólo los 50 que sí tenía
  })

  it("vender sin tener nada cargado no rompe ni divide por cero", () => {
    const p = usdPosition([sell("2026-06-10", 100, 1500)])
    expect(p.usdCents).toBe(0)
    expect(p.averageRate).toBe(0)
    expect(p.realizedArsCents).toBe(0)
    expect(p.oversoldUsdCents).toBe(10_000)
  })
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
pnpm test src/lib/position.test.ts
```
Esperado: FAIL, no resuelve `@/lib/position`.

- [ ] **Step 3: Implementar**

`src/lib/position.ts`:

```ts
import { roundCents } from "@/lib/money"
import type { IsoDate } from "@/lib/dates"

/**
 * Un evento que toca la tenencia de dólares.
 * "in"  = compra de divisa o cuota cobrada de un ingreso en USD.
 * "out" = venta de divisa o cuota pagada de un egreso en USD.
 * `rate` es el tipo de cambio del día en que ocurrió.
 */
export type PositionEvent = {
  date: IsoDate
  usdCents: number
  rate: number
  direction: "in" | "out"
}

export type UsdPosition = {
  /** Dólares en tenencia, en centavos. Nunca negativo. */
  usdCents: number
  /** Costo de esa tenencia, en centavos de peso. */
  costArsCents: number
  /** Costo promedio ponderado, en pesos por dólar. Cero si no hay tenencia. */
  averageRate: number
  /** Diferencia de cambio realizada acumulada, en centavos de peso. */
  realizedArsCents: number
  /** Dólares que salieron sin respaldo registrado. Cero es lo normal. */
  oversoldUsdCents: number
}

/**
 * Recorre los eventos en orden de fecha llevando cantidad y costo.
 *
 * Toda ENTRADA suma al costo a su propio TC.
 * Toda SALIDA realiza (rate - promedio) * cantidad y descarga a costo promedio,
 * sin distinguir entre vender la divisa y gastarla: en ambos casos se dispone
 * de ella y la ganancia acumulada durante la tenencia se hace efectiva.
 */
export function usdPosition(events: PositionEvent[]): UsdPosition {
  let usdCents = 0
  let costArsCents = 0
  let realizedArsCents = 0
  let oversoldUsdCents = 0

  const ordered = [...events].sort((a, b) => a.date.localeCompare(b.date))

  for (const event of ordered) {
    if (event.direction === "in") {
      usdCents += event.usdCents
      costArsCents += roundCents(event.usdCents * event.rate)
      continue
    }

    // Sólo se puede disponer de lo que está registrado. El excedente se informa.
    const available = Math.min(event.usdCents, usdCents)
    oversoldUsdCents += event.usdCents - available

    if (available > 0) {
      const averageRate = costArsCents / usdCents
      realizedArsCents += roundCents(available * (event.rate - averageRate))
      costArsCents -= roundCents(available * averageRate)
      usdCents -= available
    }

    // Sin tenencia no hay costo remanente: evita arrastrar centavos de redondeo.
    if (usdCents === 0) costArsCents = 0
  }

  return {
    usdCents,
    costArsCents,
    averageRate: usdCents > 0 ? costArsCents / usdCents : 0,
    realizedArsCents,
    oversoldUsdCents,
  }
}
```

- [ ] **Step 4: Correr los tests**

```bash
pnpm test src/lib/position.test.ts
```
Esperado: PASS, 12 tests.

- [ ] **Step 5: Correr toda la suite**

```bash
pnpm test
```
Esperado: PASS, 35 tests en 4 archivos.

- [ ] **Step 6: Commit**

```bash
git add src/lib/position.ts src/lib/position.test.ts
git commit -m "feat: posición en dólares a costo promedio con diferencia de cambio realizada"
```

---

### Task 6: `src/lib/balance.ts` — saldo por moneda

Implementa la sección 5.2 del spec. Sólo cuentan las cuotas **pagadas** y los cambios ocurridos a partir de `initialDate`.

**Files:**
- Create: `src/lib/balance.ts`
- Test: `src/lib/balance.test.ts`

**Interfaces:**
- Consumes: `convertToArs`, `type Currency` de `@/lib/money`; `IsoDate` de `@/lib/dates`.
- Produces:
  - `type BalanceSettings = { initialArsCents: number; initialUsdCents: number; initialDate: IsoDate }`
  - `type PaidInstallment = { paidDate: IsoDate; currency: Currency; kind: "income" | "expense"; amountCents: number }`
  - `type ExchangeMovement = { date: IsoDate; direction: "buy" | "sell"; usdCents: number; rate: number }`
  - `type Balances = { arsCents: number; usdCents: number }`
  - `computeBalances(settings, paid, exchanges): Balances`

- [ ] **Step 1: Escribir los tests que fallan**

`src/lib/balance.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import {
  computeBalances,
  type BalanceSettings,
  type PaidInstallment,
  type ExchangeMovement,
} from "@/lib/balance"

const settings: BalanceSettings = {
  initialArsCents: 100_000_00,
  initialUsdCents: 500_00,
  initialDate: "2026-01-01",
}

describe("computeBalances", () => {
  it("sin movimientos, devuelve el saldo inicial", () => {
    expect(computeBalances(settings, [], [])).toEqual({
      arsCents: 100_000_00,
      usdCents: 500_00,
    })
  })

  it("un ingreso cobrado suma", () => {
    const paid: PaidInstallment[] = [
      { paidDate: "2026-02-05", currency: "ARS", kind: "income", amountCents: 50_000_00 },
    ]
    expect(computeBalances(settings, paid, []).arsCents).toBe(150_000_00)
  })

  it("un egreso pagado resta", () => {
    const paid: PaidInstallment[] = [
      { paidDate: "2026-02-05", currency: "ARS", kind: "expense", amountCents: 30_000_00 },
    ]
    expect(computeBalances(settings, paid, []).arsCents).toBe(70_000_00)
  })

  it("ignora lo anterior a la fecha del saldo inicial", () => {
    const paid: PaidInstallment[] = [
      { paidDate: "2025-12-31", currency: "ARS", kind: "income", amountCents: 999_999_00 },
    ]
    expect(computeBalances(settings, paid, []).arsCents).toBe(100_000_00)
  })

  it("incluye lo pagado exactamente en la fecha del saldo inicial", () => {
    const paid: PaidInstallment[] = [
      { paidDate: "2026-01-01", currency: "ARS", kind: "income", amountCents: 1_000_00 },
    ]
    expect(computeBalances(settings, paid, []).arsCents).toBe(101_000_00)
  })

  it("separa las monedas", () => {
    const paid: PaidInstallment[] = [
      { paidDate: "2026-02-05", currency: "USD", kind: "income", amountCents: 100_00 },
      { paidDate: "2026-02-06", currency: "USD", kind: "expense", amountCents: 40_00 },
      { paidDate: "2026-02-07", currency: "ARS", kind: "expense", amountCents: 10_000_00 },
    ]
    expect(computeBalances(settings, paid, [])).toEqual({
      arsCents: 90_000_00,
      usdCents: 560_00,
    })
  })

  it("una compra de dólares resta pesos y suma dólares", () => {
    const exchanges: ExchangeMovement[] = [
      { date: "2026-03-01", direction: "buy", usdCents: 50_00, rate: 1_450 },
    ]
    // 50 USD * 1450 = $72.500
    expect(computeBalances(settings, [], exchanges)).toEqual({
      arsCents: 100_000_00 - 72_500_00,
      usdCents: 550_00,
    })
  })

  it("una venta de dólares suma pesos y resta dólares", () => {
    const exchanges: ExchangeMovement[] = [
      { date: "2026-03-01", direction: "sell", usdCents: 100_00, rate: 1_500 },
    ]
    expect(computeBalances(settings, [], exchanges)).toEqual({
      arsCents: 100_000_00 + 150_000_00,
      usdCents: 400_00,
    })
  })

  it("ignora los cambios anteriores a la fecha del saldo inicial", () => {
    const exchanges: ExchangeMovement[] = [
      { date: "2025-11-20", direction: "buy", usdCents: 999_00, rate: 1_000 },
    ]
    expect(computeBalances(settings, [], exchanges)).toEqual({
      arsCents: 100_000_00,
      usdCents: 500_00,
    })
  })

  it("el saldo puede quedar negativo si se gastó de más", () => {
    const paid: PaidInstallment[] = [
      { paidDate: "2026-02-05", currency: "ARS", kind: "expense", amountCents: 150_000_00 },
    ]
    expect(computeBalances(settings, paid, []).arsCents).toBe(-50_000_00)
  })
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
pnpm test src/lib/balance.test.ts
```
Esperado: FAIL, no resuelve `@/lib/balance`.

- [ ] **Step 3: Implementar**

`src/lib/balance.ts`:

```ts
import { convertToArs, type Currency } from "@/lib/money"
import type { IsoDate } from "@/lib/dates"

export type BalanceSettings = {
  initialArsCents: number
  initialUsdCents: number
  /** Desde esta fecha cuentan los movimientos. Lo anterior ya está en el saldo inicial. */
  initialDate: IsoDate
}

export type PaidInstallment = {
  paidDate: IsoDate
  currency: Currency
  kind: "income" | "expense"
  amountCents: number
}

export type ExchangeMovement = {
  date: IsoDate
  direction: "buy" | "sell"
  usdCents: number
  rate: number
}

export type Balances = {
  arsCents: number
  usdCents: number
}

/**
 * Saldo actual por moneda, según la sección 5.2 del spec.
 * Una cuota cuenta por su fecha de pago real, no por su vencimiento.
 */
export function computeBalances(
  settings: BalanceSettings,
  paid: PaidInstallment[],
  exchanges: ExchangeMovement[],
): Balances {
  let arsCents = settings.initialArsCents
  let usdCents = settings.initialUsdCents

  for (const item of paid) {
    if (item.paidDate < settings.initialDate) continue

    const signed = item.kind === "income" ? item.amountCents : -item.amountCents
    if (item.currency === "ARS") arsCents += signed
    else usdCents += signed
  }

  for (const exchange of exchanges) {
    if (exchange.date < settings.initialDate) continue

    const arsLeg = convertToArs(exchange.usdCents, exchange.rate)
    if (exchange.direction === "buy") {
      arsCents -= arsLeg
      usdCents += exchange.usdCents
    } else {
      arsCents += arsLeg
      usdCents -= exchange.usdCents
    }
  }

  return { arsCents, usdCents }
}
```

- [ ] **Step 4: Correr los tests**

```bash
pnpm test src/lib/balance.test.ts
```
Esperado: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/balance.ts src/lib/balance.test.ts
git commit -m "feat: cálculo de saldo por moneda desde la fecha del saldo inicial"
```

---

### Task 7: `src/lib/rate.ts` — cotización sugerida

Implementa la sección 5.6 del spec. **Si la API falla, devuelve `null` y la app sigue funcionando**: el usuario tipea el TC a mano.

**Files:**
- Create: `src/lib/rate.ts`
- Test: `src/lib/rate.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type RatePreference = "oficial" | "blue" | "mep"`
  - `type SuggestedRate = { buyRate: number; sellRate: number }`
  - `fetchSuggestedRate(preference: RatePreference): Promise<SuggestedRate | null>`

- [ ] **Step 1: Escribir los tests que fallan**

`src/lib/rate.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest"
import { fetchSuggestedRate } from "@/lib/rate"

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(impl: (url: string) => Promise<Response> | Response) {
  const spy = vi.fn((input: RequestInfo | URL) => impl(String(input)))
  vi.stubGlobal("fetch", spy)
  return spy
}

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })

describe("fetchSuggestedRate", () => {
  it("mapea compra y venta desde la perspectiva del usuario", async () => {
    // La API informa desde la perspectiva de la casa de cambio:
    // "venta" es a lo que ELLA vende, o sea lo que VOS pagás por comprar.
    stubFetch(() => ok({ compra: 1400, venta: 1450 }))

    const result = await fetchSuggestedRate("blue")

    expect(result).toEqual({ buyRate: 1450, sellRate: 1400 })
  })

  it("usa el endpoint correcto por preferencia", async () => {
    const spy = stubFetch(() => ok({ compra: 1, venta: 2 }))

    await fetchSuggestedRate("oficial")
    expect(spy.mock.calls[0][0]).toContain("/dolares/oficial")

    await fetchSuggestedRate("blue")
    expect(spy.mock.calls[1][0]).toContain("/dolares/blue")
  })

  it("mapea mep al endpoint bolsa", async () => {
    const spy = stubFetch(() => ok({ compra: 1, venta: 2 }))

    await fetchSuggestedRate("mep")

    expect(spy.mock.calls[0][0]).toContain("/dolares/bolsa")
  })

  it("devuelve null si la API responde con error", async () => {
    stubFetch(() => new Response("boom", { status: 500 }))

    expect(await fetchSuggestedRate("blue")).toBeNull()
  })

  it("devuelve null si la red falla", async () => {
    stubFetch(() => Promise.reject(new Error("ENOTFOUND")))

    expect(await fetchSuggestedRate("blue")).toBeNull()
  })

  it("devuelve null si la respuesta no tiene números válidos", async () => {
    stubFetch(() => ok({ compra: "no soy un número", venta: null }))

    expect(await fetchSuggestedRate("blue")).toBeNull()
  })
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
pnpm test src/lib/rate.test.ts
```
Esperado: FAIL, no resuelve `@/lib/rate`.

- [ ] **Step 3: Implementar**

`src/lib/rate.ts`:

```ts
export type RatePreference = "oficial" | "blue" | "mep"

export type SuggestedRate = {
  /** Pesos que pagás por comprar un dólar. */
  buyRate: number
  /** Pesos que recibís por vender un dólar. */
  sellRate: number
}

// dolarapi llama "bolsa" a lo que en la calle se conoce como MEP.
const ENDPOINTS: Record<RatePreference, string> = {
  oficial: "oficial",
  blue: "blue",
  mep: "bolsa",
}

const CACHE_SECONDS = 600

/**
 * Cotización sugerida. SIEMPRE puede devolver null: la sección 5.6 del spec
 * exige que una API de terceros nunca bloquee la carga de un movimiento.
 * Quien la llama muestra el campo vacío y editable.
 */
export async function fetchSuggestedRate(
  preference: RatePreference,
): Promise<SuggestedRate | null> {
  const url = `https://dolarapi.com/v1/dolares/${ENDPOINTS[preference]}`

  try {
    const response = await fetch(url, { next: { revalidate: CACHE_SECONDS } })
    if (!response.ok) return null

    const data: unknown = await response.json()
    if (typeof data !== "object" || data === null) return null

    const { compra, venta } = data as { compra?: unknown; venta?: unknown }
    if (typeof compra !== "number" || typeof venta !== "number") return null
    if (!Number.isFinite(compra) || !Number.isFinite(venta)) return null

    // La API informa desde la perspectiva de la casa de cambio: su "venta"
    // es el precio al que vos comprás.
    return { buyRate: venta, sellRate: compra }
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Correr los tests**

```bash
pnpm test src/lib/rate.test.ts
```
Esperado: PASS, 6 tests.

El campo `next: { revalidate }` no existe en el `fetch` estándar de Node, pero es una propiedad extra que Node ignora y Next usa. Los tests con `fetch` stubeado no se ven afectados.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rate.ts src/lib/rate.test.ts
git commit -m "feat: cotización sugerida desde dolarapi con fallback a carga manual"
```

---

### Task 8: Supabase, conexión Drizzle y tablas de better-auth

Deja la base creada y conectada, con las tablas de autenticación aplicadas. Las tablas propias van en la tarea siguiente.

**Files:**
- Create: `drizzle.config.ts`, `src/db/client.ts`, `src/db/auth-schema.ts` (generado), `src/db/schema.ts`, `src/auth.ts`, `src/app/api/auth/[...all]/route.ts`
- Modify: `package.json` (scripts de base)
- Modify: `.env.local` (no se commitea)

**Interfaces:**
- Consumes: nada del código propio.
- Produces:
  - `db` — instancia Drizzle, exportada de `@/db/client`
  - `sqlClient` — cliente postgres.js crudo, exportado de `@/db/client`
  - `auth` — instancia de better-auth, exportada de `@/auth`
  - `@/db/schema` re-exporta todo lo de `auth-schema.ts`

- [ ] **Step 1: Crear el proyecto en Supabase**

Manual, en el navegador. En [supabase.com](https://supabase.com) crear un proyecto nuevo llamado `mis-pesitos`, elegir la región más cercana (`sa-east-1` / São Paulo) y guardar la contraseña de la base.

En **Project Settings → Database → Connection string → Transaction pooler**, copiar la cadena. Debe tener el puerto **6543**. Pegarla en `.env.local` como `DATABASE_URL`, reemplazando `[YOUR-PASSWORD]` por la contraseña real.

Se usa el transaction pooler y no la conexión directa porque cada lectura de la app abre una transacción para declarar el usuario ante RLS, y el pooler de transacciones es el modo que soporta eso desde un entorno serverless.

- [ ] **Step 2: Instalar las dependencias de base y auth**

```bash
pnpm add drizzle-orm@0.45.2 postgres@3.4.9 better-auth@1.6.26
pnpm add -D drizzle-kit@0.31.10
```

- [ ] **Step 3: Crear el cliente de base**

`src/db/client.ts`:

```ts
import "server-only"

import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import * as schema from "@/db/schema"

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error("Falta DATABASE_URL. Copiá .env.example a .env.local y completalo.")
}

/**
 * `prepare: false` es obligatorio contra el transaction pooler de Supabase:
 * pgbouncer en modo transacción no soporta prepared statements con nombre.
 */
export const sqlClient = postgres(connectionString, { prepare: false })

export const db = drizzle(sqlClient, { schema })
```

Instalar el guardia que impide importar esto desde el cliente:

```bash
pnpm add server-only
```

- [ ] **Step 4: Configurar drizzle-kit**

`drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit"

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
```

Agregar a `package.json` en `scripts`:

```json
{
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:studio": "drizzle-kit studio"
}
```

`drizzle-kit` no lee `.env.local` solo. Instalar el cargador y usarlo en los scripts de base:

```bash
pnpm add -D dotenv-cli@10.0.0
```

Ajustar los scripts para que queden:

```json
{
  "db:generate": "dotenv -e .env.local -- drizzle-kit generate",
  "db:migrate": "dotenv -e .env.local -- drizzle-kit migrate",
  "db:studio": "dotenv -e .env.local -- drizzle-kit studio"
}
```

Verificar la versión publicada de `dotenv-cli` antes de fijarla:

```bash
pnpm view dotenv-cli version
```
Usar la que devuelva.

- [ ] **Step 5: Crear el esquema provisorio y la config de better-auth**

`src/db/schema.ts` — por ahora sólo reexporta lo de auth. Las tablas propias se agregan en la Task 9.

```ts
export * from "@/db/auth-schema"
```

Crear el archivo vacío que el CLI va a sobrescribir para que el import no falle:

```bash
echo "export {}" > src/db/auth-schema.ts
```

`src/auth.ts`:

```ts
import "server-only"

import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"

import { db } from "@/db/client"
import * as schema from "@/db/schema"

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
  },
})
```

Generar `BETTER_AUTH_SECRET` y ponerlo en `.env.local`:

```bash
openssl rand -base64 32
```

- [ ] **Step 6: Generar el esquema de las tablas de auth**

```bash
pnpm dlx @better-auth/cli@latest generate --config src/auth.ts --output src/db/auth-schema.ts -y
```

Esperado: `src/db/auth-schema.ts` con las tablas `user`, `session`, `account` y `verification` en sintaxis de Drizzle.

Si el CLI no arranca por no encontrar `DATABASE_URL`, prefijar el comando con `pnpm dlx dotenv-cli -e .env.local --`.

- [ ] **Step 7: Aplicar el esquema a Supabase**

```bash
pnpm db:generate
pnpm db:migrate
```

Esperado: una migración nueva en `drizzle/` y su aplicación sin errores.

- [ ] **Step 8: Montar el handler de autenticación**

`src/app/api/auth/[...all]/route.ts`:

```ts
import { toNextJsHandler } from "better-auth/next-js"

import { auth } from "@/auth"

export const { GET, POST } = toNextJsHandler(auth)
```

- [ ] **Step 9: Verificar que la base y el endpoint responden**

```bash
pnpm dev
```

En otra terminal:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/auth/ok
```
Esperado: `200`.

Verificar en el panel de Supabase, en **Table Editor**, que existan las cuatro tablas de auth.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: conexión a Supabase con Drizzle y tablas de better-auth"
```

---

### Task 9: Tablas de la app, RLS y `withUser`

Implementa las secciones 4 y 6 del spec. Termina con un test de integración que **prueba** que RLS aísla a los usuarios: sin esa prueba, la segunda capa de seguridad es una suposición.

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/db/client.ts`
- Create: `drizzle/XXXX_rls.sql` (nombre generado por drizzle-kit)
- Create: `src/db/rls.test.ts`
- Modify: `package.json` (script `test:db`), `vitest.config.ts`

**Interfaces:**
- Consumes: `db`, `sqlClient` de `@/db/client`; `user` de `@/db/auth-schema`.
- Produces:
  - Tablas `userSettings`, `category`, `movement`, `installment` exportadas de `@/db/schema`
  - `type Tx` y `withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T>` en `@/db/client`

- [ ] **Step 1: Escribir el esquema de las tablas propias**

`src/db/schema.ts` — reemplaza el contenido provisorio:

```ts
import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import { user } from "@/db/auth-schema"

export * from "@/db/auth-schema"

export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  initialBalanceArsCents: bigint("initial_balance_ars_cents", { mode: "number" })
    .notNull()
    .default(0),
  initialBalanceUsdCents: bigint("initial_balance_usd_cents", { mode: "number" })
    .notNull()
    .default(0),
  initialBalanceDate: date("initial_balance_date").notNull(),
  /** "oficial" | "blue" | "mep" */
  preferredRate: text("preferred_rate").notNull().default("blue"),
})

export const category = pgTable(
  "category",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** "income" | "expense" */
    kind: text("kind").notNull(),
    archived: boolean("archived").notNull().default(false),
  },
  (t) => [
    // Único sólo entre las activas: permite archivar "Ocio" y volver a crearla.
    uniqueIndex("category_active_unique")
      .on(t.userId, t.name, t.kind)
      .where(sql`archived = false`),
    index("category_user_idx").on(t.userId),
  ],
)

export const movement = pgTable(
  "movement",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** "income" | "expense" | "exchange" */
    kind: text("kind").notNull(),
    description: text("description").notNull(),
    /** Obligatorio salvo en exchange, donde siempre es null. */
    categoryId: text("category_id").references(() => category.id, {
      onDelete: "restrict",
    }),
    date: date("date").notNull(),
    /** "ARS" | "USD". En exchange siempre "USD". */
    currency: text("currency").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    /** Pesos por dólar. Siempre 1 cuando currency es ARS. */
    rate: numeric("rate", { precision: 12, scale: 4 }).notNull(),
    /** "buy" | "sell". Sólo en exchange, null en el resto. */
    direction: text("direction"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("movement_user_date_idx").on(t.userId, t.date)],
)

export const installment = pgTable(
  "installment",
  {
    id: text("id").primaryKey(),
    movementId: text("movement_id")
      .notNull()
      .references(() => movement.id, { onDelete: "cascade" }),
    // user_id duplicado a propósito: permite que la policy de RLS aplique sin join.
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    dueDate: date("due_date").notNull(),
    paid: boolean("paid").notNull().default(false),
    paidDate: date("paid_date"),
  },
  (t) => [
    index("installment_user_due_idx").on(t.userId, t.dueDate),
    index("installment_movement_idx").on(t.movementId),
  ],
)
```

`bigint` va con `mode: "number"` y no `"bigint"`: un `BigInt` no se puede serializar al cruzar de un Server Component a un Client Component y rompe en runtime.

- [ ] **Step 2: Generar y aplicar la migración de las tablas**

```bash
pnpm db:generate
pnpm db:migrate
```

Esperado: migración creada y aplicada. Verificar en el Table Editor de Supabase que existen `user_settings`, `category`, `movement` e `installment`.

- [ ] **Step 3: Escribir la migración de RLS a mano**

```bash
pnpm dlx dotenv-cli -e .env.local -- drizzle-kit generate --custom --name=rls
```

Esto crea un `.sql` vacío en `drizzle/`. Escribir dentro:

```sql
-- Segunda capa de autorización (sección 6 del spec).
-- La primera capa es que toda consulta pasa por withUser() filtrando por user_id.
-- Esta capa hace que un WHERE olvidado devuelva cero filas igual.

ALTER TABLE "user_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "movement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "installment" ENABLE ROW LEVEL SECURITY;

-- El rol al que withUser() cambia dentro de la transacción.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "user_settings", "category", "movement", "installment"
TO authenticated;

CREATE POLICY "user_settings_own" ON "user_settings" FOR ALL TO authenticated
  USING (user_id = current_setting('request.jwt.claims', true)::json ->> 'sub')
  WITH CHECK (user_id = current_setting('request.jwt.claims', true)::json ->> 'sub');

CREATE POLICY "category_own" ON "category" FOR ALL TO authenticated
  USING (user_id = current_setting('request.jwt.claims', true)::json ->> 'sub')
  WITH CHECK (user_id = current_setting('request.jwt.claims', true)::json ->> 'sub');

CREATE POLICY "movement_own" ON "movement" FOR ALL TO authenticated
  USING (user_id = current_setting('request.jwt.claims', true)::json ->> 'sub')
  WITH CHECK (user_id = current_setting('request.jwt.claims', true)::json ->> 'sub');

CREATE POLICY "installment_own" ON "installment" FOR ALL TO authenticated
  USING (user_id = current_setting('request.jwt.claims', true)::json ->> 'sub')
  WITH CHECK (user_id = current_setting('request.jwt.claims', true)::json ->> 'sub');
```

Las tablas de better-auth **no** llevan RLS: better-auth las consulta fuera de `withUser`, con el rol de conexión.

- [ ] **Step 4: Aplicar la migración de RLS**

```bash
pnpm db:migrate
```

Verificar en Supabase, en **Authentication → Policies**, que aparezcan las cuatro políticas.

- [ ] **Step 5: Implementar `withUser`**

Agregar al final de `src/db/client.ts`:

```ts
import { sql } from "drizzle-orm"

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Abre una transacción, declara ante Postgres qué usuario está consultando y
 * baja el rol a `authenticated` para que las policies de RLS apliquen.
 *
 * TODA lectura y escritura de datos del usuario pasa por acá. El userId viene
 * de la sesión ya verificada por better-auth: no hay que emitir ni validar
 * ningún token adicional para decirle a la base algo que el servidor ya sabe.
 */
export async function withUser<T>(
  userId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const claims = JSON.stringify({ sub: userId })
    await tx.execute(sql`SELECT set_config('request.jwt.claims', ${claims}, true)`)
    await tx.execute(sql`SET LOCAL ROLE authenticated`)
    return fn(tx)
  })
}
```

- [ ] **Step 6: Escribir el test de integración de RLS**

`src/db/rls.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { eq, sql } from "drizzle-orm"

import { db, sqlClient, withUser } from "@/db/client"
import { category, user } from "@/db/schema"

const USER_A = "rls-test-user-a"
const USER_B = "rls-test-user-b"

async function seedUser(id: string) {
  await db
    .insert(user)
    .values({
      id,
      name: id,
      email: `${id}@test.local`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing()

  await db
    .insert(category)
    .values({ id: `cat-${id}`, userId: id, name: "Prueba", kind: "expense" })
    .onConflictDoNothing()
}

beforeAll(async () => {
  await seedUser(USER_A)
  await seedUser(USER_B)
})

afterAll(async () => {
  await db.delete(user).where(eq(user.id, USER_A))
  await db.delete(user).where(eq(user.id, USER_B))
  await sqlClient.end()
})

describe("RLS", () => {
  it("un usuario sólo ve sus propias categorías", async () => {
    const rows = await withUser(USER_A, (tx) => tx.select().from(category))

    expect(rows).toHaveLength(1)
    expect(rows[0].userId).toBe(USER_A)
  })

  it("un SELECT sin WHERE no filtra datos de otro usuario", async () => {
    // Éste es el punto de la segunda capa: la consulta NO filtra por user_id
    // y aun así la base no devuelve nada ajeno.
    const rows = await withUser(USER_B, (tx) =>
      tx.execute(sql`SELECT user_id FROM category`),
    )

    const userIds = [...rows].map((r) => (r as { user_id: string }).user_id)
    expect(userIds).toEqual([USER_B])
  })

  it("no se puede insertar una fila a nombre de otro usuario", async () => {
    await expect(
      withUser(USER_A, (tx) =>
        tx
          .insert(category)
          .values({ id: "cat-robada", userId: USER_B, name: "Robada", kind: "expense" }),
      ),
    ).rejects.toThrow()
  })

  it("no se puede modificar una fila de otro usuario", async () => {
    const updated = await withUser(USER_A, (tx) =>
      tx
        .update(category)
        .set({ name: "Modificada" })
        .where(eq(category.id, `cat-${USER_B}`))
        .returning(),
    )

    expect(updated).toHaveLength(0)
  })
})
```

- [ ] **Step 7: Separar los tests de base de los unitarios**

En `vitest.config.ts`, excluir el test de base de la corrida por defecto:

```ts
import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["src/db/**"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
})
```

Agregar el script en `package.json`:

```json
{
  "test:db": "dotenv -e .env.local -- vitest run --config vitest.db.config.ts"
}
```

`vitest.db.config.ts`:

```ts
import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/db/**/*.test.ts"],
    // Las pruebas comparten filas en una base real: no pueden correr en paralelo.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
})
```

- [ ] **Step 8: Correr el test de RLS**

```bash
pnpm test:db
```
Esperado: PASS, 4 tests.

Si el tercer test no falla al insertar a nombre ajeno, la policy `WITH CHECK` no se aplicó: revisar que la migración de RLS haya corrido y que `SET LOCAL ROLE authenticated` esté antes de la consulta. **No seguir hasta que este test pase**: si RLS no aísla, la segunda capa de seguridad no existe.

- [ ] **Step 9: Verificar que la suite unitaria sigue verde y rápida**

```bash
pnpm test
```
Esperado: PASS, 41 tests, sin tocar la red ni la base.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: tablas de la app con RLS por usuario y wrapper withUser verificado"
```

---

### Task 10: Autenticación — Google OAuth, login, registro y guardia de sesión

**Files:**
- Create: `src/auth-client.ts`, `src/server/session.ts`
- Create: `src/app/(auth)/login/page.tsx`, `src/app/(auth)/registro/page.tsx`, `src/components/auth-form.tsx`
- Create: `src/app/(app)/layout.tsx`
- Modify: `src/app/globals.css`, `components.json` (shadcn)

**Interfaces:**
- Consumes: `auth` de `@/auth`.
- Produces:
  - `authClient` de `@/auth-client` con `signIn`, `signUp`, `signOut`, `useSession`
  - `requireUser(): Promise<{ id: string; name: string; email: string; image?: string | null }>` de `@/server/session`
  - `getOptionalUser()` de `@/server/session`

- [ ] **Step 1: Crear las credenciales en Google Cloud**

Manual, en el navegador:

1. En [console.cloud.google.com](https://console.cloud.google.com) crear un proyecto llamado `mis-pesitos`.
2. **APIs y servicios → Pantalla de consentimiento de OAuth**: tipo **Externo**, nombre "Mis Pesitos", correo de asistencia y de contacto. Publicar en modo **Prueba** y agregar tu propio correo como usuario de prueba.
3. **Credenciales → Crear credenciales → ID de cliente de OAuth**, tipo **Aplicación web**.
4. En **URIs de redireccionamiento autorizados** agregar las dos:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://<dominio-de-produccion>/api/auth/callback/google`
5. Copiar el ID y el secreto a `.env.local` en `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`.

- [ ] **Step 2: Instalar shadcn/ui**

```bash
pnpm dlx shadcn@latest init
```

Elegir el estilo por defecto y el color base **slate**. Debe detectar Tailwind 4 y escribir las variables de tema en `src/app/globals.css`.

```bash
pnpm dlx shadcn@latest add button input label card form select table dialog tabs badge sonner separator popover calendar
```

Verificar que quedaron en `src/components/ui/`.

- [ ] **Step 3: Crear el cliente de autenticación**

`src/auth-client.ts`:

```ts
"use client"

import { createAuthClient } from "better-auth/react"

export const authClient = createAuthClient()

export const { signIn, signUp, signOut, useSession } = authClient
```

- [ ] **Step 4: Crear la guardia de sesión del servidor**

`src/server/session.ts`:

```ts
import "server-only"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { auth } from "@/auth"

export async function getOptionalUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user ?? null
}

/**
 * Punto de entrada obligatorio de todo acceso a datos.
 * Ninguna query se ejecuta sin haber pasado por acá.
 */
export async function requireUser() {
  const user = await getOptionalUser()
  if (!user) redirect("/login")
  return user
}
```

- [ ] **Step 5: Crear el formulario de autenticación**

`src/components/auth-form.tsx`:

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { signIn, signUp } from "@/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function AuthForm({ mode }: { mode: "login" | "registro" }) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setPending(true)

    const result =
      mode === "registro"
        ? await signUp.email({ name, email, password })
        : await signIn.email({ email, password })

    setPending(false)

    if (result.error) {
      setError(result.error.message ?? "No pudimos completar la operación.")
      return
    }

    router.push("/dashboard")
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => signIn.social({ provider: "google", callbackURL: "/dashboard" })}
      >
        Continuar con Google
      </Button>

      <div className="text-muted-foreground text-center text-sm">o</div>

      <form onSubmit={onSubmit} className="space-y-3">
        {mode === "registro" && (
          <div className="space-y-1">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
        )}

        <div className="space-y-1">
          <Label htmlFor="email">Correo</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="password">Contraseña</Label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === "registro" ? "new-password" : "current-password"}
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && <p className="text-destructive text-sm">{error}</p>}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Un segundo…" : mode === "registro" ? "Crear cuenta" : "Entrar"}
        </Button>
      </form>
    </div>
  )
}
```

- [ ] **Step 6: Crear las páginas de login y registro**

`src/app/(auth)/login/page.tsx`:

```tsx
import Link from "next/link"
import { redirect } from "next/navigation"

import { AuthForm } from "@/components/auth-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getOptionalUser } from "@/server/session"

export default async function LoginPage() {
  if (await getOptionalUser()) redirect("/dashboard")

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Entrar a Mis Pesitos</CardTitle>
          <CardDescription>Tus finanzas, ordenadas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AuthForm mode="login" />
          <p className="text-muted-foreground text-center text-sm">
            ¿No tenés cuenta?{" "}
            <Link href="/registro" className="underline">
              Creá una
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
```

`src/app/(auth)/registro/page.tsx` — idéntico salvo los textos:

```tsx
import Link from "next/link"
import { redirect } from "next/navigation"

import { AuthForm } from "@/components/auth-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getOptionalUser } from "@/server/session"

export default async function RegistroPage() {
  if (await getOptionalUser()) redirect("/dashboard")

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Crear cuenta</CardTitle>
          <CardDescription>Empezá a ordenar tu plata hoy.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AuthForm mode="registro" />
          <p className="text-muted-foreground text-center text-sm">
            ¿Ya tenés cuenta?{" "}
            <Link href="/login" className="underline">
              Entrá
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
```

- [ ] **Step 7: Crear el layout protegido**

`src/app/(app)/layout.tsx` — por ahora sólo exige sesión; la redirección al onboarding se agrega en la Task 11.

```tsx
import { requireUser } from "@/server/session"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser()
  return <div className="mx-auto max-w-5xl px-4 py-6">{children}</div>
}
```

Crear una página mínima para poder probar el flujo, `src/app/(app)/dashboard/page.tsx`:

```tsx
import { requireUser } from "@/server/session"

export default async function DashboardPage() {
  const user = await requireUser()
  return <p>Hola, {user.name}.</p>
}
```

- [ ] **Step 8: Verificar el flujo completo a mano**

```bash
pnpm dev
```

Comprobar, en este orden:

1. Ir a `http://localhost:3000/dashboard` sin sesión → redirige a `/login`.
2. En `/registro`, crear una cuenta con correo y contraseña → entra al dashboard y saluda con el nombre.
3. Verificar en Supabase que hay una fila nueva en `user`.
4. Cerrar sesión borrando las cookies del sitio, y entrar con **Continuar con Google** → entra al dashboard.
5. Verificar en Supabase que hay una fila en `account` con `provider_id = 'google'`.

Si el paso 4 devuelve `redirect_uri_mismatch`, la URI de redirección de Google Cloud no coincide exactamente con `http://localhost:3000/api/auth/callback/google`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: autenticación con correo y con Google, y guardia de sesión"
```

---

### Task 11: Onboarding, ajustes y categorías precargadas

Sin `user_settings` no hay saldo inicial, así que la app manda al onboarding. Al guardarlo por primera vez se precargan las categorías.

**Files:**
- Create: `src/lib/schemas.ts`, `src/lib/default-categories.ts`, `src/server/actions/result.ts`, `src/server/actions/settings.ts`, `src/server/queries.ts`
- Create: `src/app/onboarding/page.tsx`, `src/components/settings-form.tsx`
- Modify: `src/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `withUser`, `Tx` de `@/db/client`; `requireUser` de `@/server/session`; `todayInAr` de `@/lib/dates`; `parseAmountToCents` de `@/lib/money`.
- Produces:
  - `type ActionResult` y `failure(message, fieldErrors?)`, `success()` de `@/server/actions/result`
  - `settingsSchema` de `@/lib/schemas`
  - `getSettings(userId): Promise<Settings | null>` de `@/server/queries`
  - `requireSettings(): Promise<{ user; settings }>` de `@/server/session`
  - `saveSettings(prev, formData): Promise<ActionResult>` de `@/server/actions/settings`

- [ ] **Step 1: Definir el resultado común de las acciones**

`src/server/actions/result.ts`:

```ts
export type ActionResult =
  | { ok: true }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]> }

export const success = (): ActionResult => ({ ok: true })

export const failure = (
  message: string,
  fieldErrors?: Record<string, string[]>,
): ActionResult => ({ ok: false, message, fieldErrors })

export const idle: ActionResult | null = null
```

- [ ] **Step 2: Definir los esquemas de validación**

`src/lib/schemas.ts`:

```ts
import { z } from "zod"

import { parseAmountToCents } from "@/lib/money"

/** Importe tipeado por el usuario, convertido a centavos enteros. */
export const amountCents = z
  .string()
  .transform((value, ctx) => {
    const cents = parseAmountToCents(value)
    if (cents === null) {
      ctx.addIssue({ code: "custom", message: "Escribí un importe válido." })
      return z.NEVER
    }
    return cents
  })
  .refine((cents) => cents >= 0, { message: "El importe no puede ser negativo." })

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Elegí una fecha válida.")

export const ratePreference = z.enum(["oficial", "blue", "mep"])

export const settingsSchema = z.object({
  initialBalanceArsCents: amountCents,
  initialBalanceUsdCents: amountCents,
  initialBalanceDate: isoDate,
  preferredRate: ratePreference,
})
```

- [ ] **Step 3: Definir las categorías precargadas**

`src/lib/default-categories.ts`:

```ts
export const DEFAULT_CATEGORIES: { name: string; kind: "income" | "expense" }[] = [
  { name: "Sueldo", kind: "income" },
  { name: "Freelance", kind: "income" },
  { name: "Ventas", kind: "income" },
  { name: "Intereses", kind: "income" },
  { name: "Otros", kind: "income" },
  { name: "Alquiler", kind: "expense" },
  { name: "Expensas", kind: "expense" },
  { name: "Servicios", kind: "expense" },
  { name: "Supermercado", kind: "expense" },
  { name: "Transporte", kind: "expense" },
  { name: "Salud", kind: "expense" },
  { name: "Educación", kind: "expense" },
  { name: "Ocio", kind: "expense" },
  { name: "Impuestos", kind: "expense" },
  { name: "Otros", kind: "expense" },
]
```

- [ ] **Step 4: Escribir la primera consulta**

`src/server/queries.ts`:

```ts
import "server-only"

import { eq } from "drizzle-orm"

import { withUser } from "@/db/client"
import { userSettings } from "@/db/schema"

export type Settings = typeof userSettings.$inferSelect

export async function getSettings(userId: string): Promise<Settings | null> {
  const rows = await withUser(userId, (tx) =>
    tx.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
  )
  return rows[0] ?? null
}
```

- [ ] **Step 5: Agregar `requireSettings` a la guardia**

Agregar al final de `src/server/session.ts`:

```ts
import { getSettings } from "@/server/queries"

/**
 * Exige sesión Y onboarding completo. Todas las pantallas de la app la usan.
 */
export async function requireSettings() {
  const user = await requireUser()
  const settings = await getSettings(user.id)
  if (!settings) redirect("/onboarding")
  return { user, settings }
}
```

- [ ] **Step 6: Escribir la acción que guarda los ajustes**

`src/server/actions/settings.ts`:

```ts
"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { z } from "zod"

import { withUser } from "@/db/client"
import { category, userSettings } from "@/db/schema"
import { DEFAULT_CATEGORIES } from "@/lib/default-categories"
import { settingsSchema } from "@/lib/schemas"
import { failure, success, type ActionResult } from "@/server/actions/result"
import { requireUser } from "@/server/session"

export async function saveSettings(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser()

  const parsed = settingsSchema.safeParse({
    initialBalanceArsCents: formData.get("initialBalanceArs") ?? "",
    initialBalanceUsdCents: formData.get("initialBalanceUsd") ?? "",
    initialBalanceDate: formData.get("initialBalanceDate") ?? "",
    preferredRate: formData.get("preferredRate") ?? "",
  })

  if (!parsed.success) {
    return failure("Revisá los datos.", z.flattenError(parsed.error).fieldErrors)
  }

  const values = parsed.data

  try {
    await withUser(user.id, async (tx) => {
      const existing = await tx
        .select({ userId: userSettings.userId })
        .from(userSettings)
        .where(eq(userSettings.userId, user.id))
        .limit(1)

      if (existing.length > 0) {
        await tx.update(userSettings).set(values).where(eq(userSettings.userId, user.id))
        return
      }

      await tx.insert(userSettings).values({ userId: user.id, ...values })

      // Primera vez: se precargan las categorías para que nadie arranque con
      // una pantalla en blanco.
      await tx.insert(category).values(
        DEFAULT_CATEGORIES.map((c) => ({
          id: randomUUID(),
          userId: user.id,
          name: c.name,
          kind: c.kind,
        })),
      )
    })
  } catch (error) {
    console.error("saveSettings", error)
    return failure("No pudimos guardar los ajustes. Probá de nuevo.")
  }

  revalidatePath("/", "layout")
  return success()
}
```

En Zod 4, `z.flattenError(error)` reemplaza al viejo `error.flatten()`. Es el patrón que usan todas las acciones de este plan.

- [ ] **Step 7: Escribir el formulario**

`src/components/settings-form.tsx`:

```tsx
"use client"

import { useActionState } from "react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { saveSettings } from "@/server/actions/settings"

type Props = {
  defaults: {
    initialBalanceArs: string
    initialBalanceUsd: string
    initialBalanceDate: string
    preferredRate: string
  }
  redirectTo?: string
  submitLabel: string
}

export function SettingsForm({ defaults, redirectTo, submitLabel }: Props) {
  const router = useRouter()
  const [state, action, pending] = useActionState(saveSettings, null)

  useEffect(() => {
    if (state?.ok && redirectTo) {
      router.push(redirectTo)
      router.refresh()
    }
  }, [state, redirectTo, router])

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="initialBalanceArs">¿Cuántos pesos tenés hoy?</Label>
        <Input
          id="initialBalanceArs"
          name="initialBalanceArs"
          inputMode="decimal"
          defaultValue={defaults.initialBalanceArs}
          required
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="initialBalanceUsd">¿Y cuántos dólares?</Label>
        <Input
          id="initialBalanceUsd"
          name="initialBalanceUsd"
          inputMode="decimal"
          defaultValue={defaults.initialBalanceUsd}
          required
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="initialBalanceDate">¿Desde qué fecha?</Label>
        <Input
          id="initialBalanceDate"
          name="initialBalanceDate"
          type="date"
          defaultValue={defaults.initialBalanceDate}
          required
        />
        <p className="text-muted-foreground text-xs">
          Los movimientos anteriores a esta fecha no afectan tu saldo.
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="preferredRate">¿Qué dólar usás de referencia?</Label>
        <Select name="preferredRate" defaultValue={defaults.preferredRate}>
          <SelectTrigger id="preferredRate">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="blue">Blue</SelectItem>
            <SelectItem value="oficial">Oficial</SelectItem>
            <SelectItem value="mep">MEP</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {state && !state.ok && <p className="text-destructive text-sm">{state.message}</p>}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Guardando…" : submitLabel}
      </Button>
    </form>
  )
}
```

`Select` de shadcn no envía su valor en el `FormData` por sí solo en todas las versiones. Después de instalarlo, verificar en el Step 9 que `preferredRate` llega a la acción; si llega vacío, agregar dentro del `Select` un `<input type="hidden" name="preferredRate" value={value} />` controlado por estado.

- [ ] **Step 8: Crear la página de onboarding**

`src/app/onboarding/page.tsx`:

```tsx
import { redirect } from "next/navigation"

import { SettingsForm } from "@/components/settings-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { todayInAr } from "@/lib/dates"
import { getSettings } from "@/server/queries"
import { requireUser } from "@/server/session"

export default async function OnboardingPage() {
  const user = await requireUser()
  if (await getSettings(user.id)) redirect("/dashboard")

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Empecemos</CardTitle>
          <CardDescription>
            Decinos cuánta plata tenés hoy y desde cuándo contamos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm
            defaults={{
              initialBalanceArs: "0",
              initialBalanceUsd: "0",
              initialBalanceDate: todayInAr(),
              preferredRate: "blue",
            }}
            redirectTo="/dashboard"
            submitLabel="Listo, empezar"
          />
        </CardContent>
      </Card>
    </main>
  )
}
```

- [ ] **Step 9: Exigir onboarding en el layout de la app**

Reemplazar `src/app/(app)/layout.tsx`:

```tsx
import { requireSettings } from "@/server/session"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireSettings()
  return <div className="mx-auto max-w-5xl px-4 py-6">{children}</div>
}
```

- [ ] **Step 10: Verificar el flujo**

```bash
pnpm dev
```

1. Con una cuenta recién creada, entrar a `/dashboard` → redirige a `/onboarding`.
2. Completar 100000 pesos, 500 dólares, la fecha de hoy, dólar blue → entra al dashboard.
3. En Supabase, verificar una fila en `user_settings` con `initial_balance_ars_cents = 10000000` (centavos) y **15 filas** en `category` para ese usuario.
4. Volver a `/onboarding` → redirige al dashboard, no duplica categorías.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: onboarding con saldo inicial y categorías precargadas"
```

---

### Task 12: Alta y edición de movimientos con cuotas

El corazón de la app. Implementa las secciones 4 y 5.1 del spec, incluyendo la invariante de que las cuotas suman el total.

**Files:**
- Modify: `src/lib/schemas.ts`, `src/server/queries.ts`
- Create: `src/server/actions/movements.ts`

**Interfaces:**
- Consumes: `buildInstallments`, `installmentsSumMatches` de `@/lib/installments`; `withUser` de `@/db/client`; `requireUser` de `@/server/session`.
- Produces:
  - `movementSchema` de `@/lib/schemas`
  - `listMovements(userId, filters): Promise<MovementWithInstallments[]>` de `@/server/queries`
  - `listCategories(userId, kind?): Promise<Category[]>` de `@/server/queries`
  - `createMovement(prev, formData)`, `deleteMovement(id)` de `@/server/actions/movements`

- [ ] **Step 1: Extender los esquemas**

Agregar al final de `src/lib/schemas.ts`:

```ts
export const movementKind = z.enum(["income", "expense", "exchange"])
export const currency = z.enum(["ARS", "USD"])

/**
 * Una cuota tal como llega del formulario.
 * A diferencia del importe total, la cuota YA viaja en centavos: la genera
 * `buildInstallments` del lado del cliente, que trabaja en centavos.
 */
export const installmentInput = z.object({
  amountCents: z.coerce.number().int().nonnegative(),
  dueDate: isoDate,
})

export const movementSchema = z
  .object({
    kind: z.enum(["income", "expense"]),
    description: z.string().trim().min(1, "Poné una descripción.").max(200),
    categoryId: z.string().min(1, "Elegí una categoría."),
    date: isoDate,
    currency: currency,
    amountCents: amountCents,
    rate: z.coerce.number().positive("El tipo de cambio tiene que ser mayor a cero."),
    installments: z.array(installmentInput).min(1, "Tiene que haber al menos una cuota."),
  })
  .refine((m) => m.currency === "USD" || m.rate === 1, {
    message: "Un movimiento en pesos siempre lleva tipo de cambio 1.",
    path: ["rate"],
  })
  .refine(
    (m) => m.installments.reduce((a, i) => a + i.amountCents, 0) === m.amountCents,
    {
      message: "La suma de las cuotas no coincide con el importe total.",
      path: ["installments"],
    },
  )

export type MovementInput = z.infer<typeof movementSchema>
```

- [ ] **Step 2: Escribir las consultas de lectura**

Agregar a `src/server/queries.ts`:

```ts
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm"

import { category, installment, movement } from "@/db/schema"

export type Category = typeof category.$inferSelect
export type Movement = typeof movement.$inferSelect
export type Installment = typeof installment.$inferSelect
export type MovementWithInstallments = Movement & { installments: Installment[] }

export async function listCategories(
  userId: string,
  kind?: "income" | "expense",
): Promise<Category[]> {
  return withUser(userId, (tx) =>
    tx
      .select()
      .from(category)
      .where(
        kind
          ? and(eq(category.userId, userId), eq(category.kind, kind))
          : eq(category.userId, userId),
      )
      .orderBy(asc(category.name)),
  )
}

export type MovementFilters = {
  kind?: "income" | "expense" | "exchange"
  categoryId?: string
  currency?: "ARS" | "USD"
  from?: string
  to?: string
}

export async function listMovements(
  userId: string,
  filters: MovementFilters = {},
): Promise<MovementWithInstallments[]> {
  return withUser(userId, async (tx) => {
    const conditions = [eq(movement.userId, userId)]
    if (filters.kind) conditions.push(eq(movement.kind, filters.kind))
    if (filters.categoryId) conditions.push(eq(movement.categoryId, filters.categoryId))
    if (filters.currency) conditions.push(eq(movement.currency, filters.currency))
    if (filters.from) conditions.push(gte(movement.date, filters.from))
    if (filters.to) conditions.push(lte(movement.date, filters.to))

    const movements = await tx
      .select()
      .from(movement)
      .where(and(...conditions))
      .orderBy(desc(movement.date), desc(movement.createdAt))

    if (movements.length === 0) return []

    const installments = await tx
      .select()
      .from(installment)
      .where(
        inArray(
          installment.movementId,
          movements.map((m) => m.id),
        ),
      )
      .orderBy(asc(installment.number))

    const byMovement = new Map<string, Installment[]>()
    for (const row of installments) {
      const list = byMovement.get(row.movementId) ?? []
      list.push(row)
      byMovement.set(row.movementId, list)
    }

    return movements.map((m) => ({ ...m, installments: byMovement.get(m.id) ?? [] }))
  })
}

/** Todas las cuotas pagadas, para el cálculo de saldo. */
export async function listPaidInstallments(userId: string) {
  return withUser(userId, (tx) =>
    tx
      .select({
        paidDate: installment.paidDate,
        amountCents: installment.amountCents,
        currency: movement.currency,
        kind: movement.kind,
        // Necesario para consolidar a pesos con el TC del propio movimiento.
        rate: movement.rate,
      })
      .from(installment)
      .innerJoin(movement, eq(installment.movementId, movement.id))
      .where(and(eq(installment.userId, userId), eq(installment.paid, true))),
  )
}

/** Todas las cuotas pendientes, para deudas, cobros y proyección. */
export async function listPendingInstallments(userId: string) {
  return withUser(userId, (tx) =>
    tx
      .select({
        id: installment.id,
        number: installment.number,
        dueDate: installment.dueDate,
        amountCents: installment.amountCents,
        movementId: movement.id,
        description: movement.description,
        currency: movement.currency,
        rate: movement.rate,
        kind: movement.kind,
      })
      .from(installment)
      .innerJoin(movement, eq(installment.movementId, movement.id))
      .where(and(eq(installment.userId, userId), eq(installment.paid, false)))
      .orderBy(asc(installment.dueDate)),
  )
}

/** Todos los cambios de divisa, para saldo y posición. */
export async function listExchanges(userId: string) {
  return withUser(userId, (tx) =>
    tx
      .select()
      .from(movement)
      .where(and(eq(movement.userId, userId), eq(movement.kind, "exchange")))
      .orderBy(asc(movement.date)),
  )
}
```

- [ ] **Step 3: Escribir la acción de alta**

`src/server/actions/movements.ts`:

```ts
"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { withUser } from "@/db/client"
import { installment, movement } from "@/db/schema"
import { movementSchema } from "@/lib/schemas"
import { failure, success, type ActionResult } from "@/server/actions/result"
import { requireUser } from "@/server/session"

/**
 * Las cuotas viajan en el FormData como campos repetidos, en el mismo orden:
 * installmentAmount[] e installmentDueDate[].
 */
function readInstallments(formData: FormData) {
  const amounts = formData.getAll("installmentAmount").map(String)
  const dates = formData.getAll("installmentDueDate").map(String)
  return amounts.map((amountCents, i) => ({ amountCents, dueDate: dates[i] ?? "" }))
}

export async function createMovement(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser()

  const parsed = movementSchema.safeParse({
    kind: formData.get("kind"),
    description: formData.get("description"),
    categoryId: formData.get("categoryId"),
    date: formData.get("date"),
    currency: formData.get("currency"),
    amountCents: formData.get("amountCents") ?? "",
    rate: formData.get("rate") ?? "1",
    installments: readInstallments(formData),
  })

  if (!parsed.success) {
    const flat = z.flattenError(parsed.error)
    return failure(flat.formErrors[0] ?? "Revisá los datos.", flat.fieldErrors)
  }

  const input = parsed.data
  const movementId = randomUUID()

  try {
    await withUser(user.id, async (tx) => {
      await tx.insert(movement).values({
        id: movementId,
        userId: user.id,
        kind: input.kind,
        description: input.description,
        categoryId: input.categoryId,
        date: input.date,
        currency: input.currency,
        amountCents: input.amountCents,
        rate: String(input.rate),
        direction: null,
      })

      await tx.insert(installment).values(
        input.installments.map((cuota, index) => ({
          id: randomUUID(),
          movementId,
          userId: user.id,
          number: index + 1,
          amountCents: cuota.amountCents,
          dueDate: cuota.dueDate,
          paid: false,
          paidDate: null,
        })),
      )
    })
  } catch (error) {
    console.error("createMovement", error)
    return failure("No pudimos guardar el movimiento. Probá de nuevo.")
  }

  revalidatePath("/dashboard")
  revalidatePath(input.kind === "income" ? "/ingresos" : "/egresos")
  return success()
}

export async function deleteMovement(id: string): Promise<ActionResult> {
  const user = await requireUser()

  try {
    // Las cuotas caen solas por el ON DELETE CASCADE.
    await withUser(user.id, (tx) =>
      tx.delete(movement).where(and(eq(movement.id, id), eq(movement.userId, user.id))),
    )
  } catch (error) {
    console.error("deleteMovement", error)
    return failure("No pudimos borrar el movimiento.")
  }

  revalidatePath("/", "layout")
  return success()
}
```

La validación de que las cuotas suman el total ya está en `movementSchema`, del lado del servidor. El formulario también la muestra en vivo, pero la que manda es ésta.

- [ ] **Step 4: Verificar con `pnpm typecheck`**

```bash
pnpm typecheck
```
Esperado: sin errores.

Si `tx.insert(...).values([])` se queja con un arreglo vacío, no puede pasar: `movementSchema` exige al menos una cuota.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: alta y baja de movimientos con sus cuotas validadas en el servidor"
```

---

### Task 13: Pantallas de Ingresos y Egresos

Un solo componente parametrizado por tipo, montado en dos rutas. El bloque de cuotas sólo aparece en egresos.

**Files:**
- Create: `src/components/app-nav.tsx`, `src/components/movement-form.tsx`, `src/components/movement-list.tsx`
- Create: `src/app/(app)/ingresos/page.tsx`, `src/app/(app)/egresos/page.tsx`
- Modify: `src/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `createMovement`, `deleteMovement` de `@/server/actions/movements`; `listCategories`, `listMovements` de `@/server/queries`; `buildInstallments` de `@/lib/installments`; `fetchSuggestedRate` de `@/lib/rate`; `formatMoney` de `@/lib/money`; `todayInAr` de `@/lib/dates`.
- Produces: `<MovementForm kind categories suggestedRate />`, `<MovementList movements categories />`.

- [ ] **Step 1: Crear la navegación**

`src/components/app-nav.tsx`:

```tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/ingresos", label: "Ingresos" },
  { href: "/egresos", label: "Egresos" },
  { href: "/cambios", label: "Cambios" },
  { href: "/categorias", label: "Categorías" },
  { href: "/ajustes", label: "Ajustes" },
]

export function AppNav() {
  const pathname = usePathname()

  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b pb-2">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm whitespace-nowrap",
            pathname === link.href
              ? "bg-secondary font-medium"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  )
}
```

Montarla en `src/app/(app)/layout.tsx`:

```tsx
import { AppNav } from "@/components/app-nav"
import { requireSettings } from "@/server/session"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireSettings()

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <AppNav />
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Crear el formulario de movimientos**

`src/components/movement-form.tsx`:

```tsx
"use client"

import { useActionState, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { todayInAr } from "@/lib/dates"
import { buildInstallments } from "@/lib/installments"
import { formatMoney, parseAmountToCents } from "@/lib/money"
import { createMovement } from "@/server/actions/movements"
import type { Category } from "@/server/queries"

type Props = {
  kind: "income" | "expense"
  categories: Category[]
  /** Cotización sugerida. null cuando dolarapi no respondió: se tipea a mano. */
  suggestedRate: number | null
}

type Row = { amount: string; dueDate: string }

export function MovementForm({ kind, categories, suggestedRate }: Props) {
  const [state, action, pending] = useActionState(createMovement, null)
  const router = useRouter()

  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState<"ARS" | "USD">("ARS")
  const [date, setDate] = useState(todayInAr())
  const [count, setCount] = useState(1)
  const [rows, setRows] = useState<Row[]>([{ amount: "", dueDate: todayInAr() }])

  const totalCents = parseAmountToCents(amount) ?? 0

  // Regenera el plan cuando cambia el total, la cantidad de cuotas o la fecha.
  useEffect(() => {
    if (totalCents <= 0) return
    const planned = buildInstallments(totalCents, count, date)
    setRows(
      planned.map((p) => ({ amount: String(p.amountCents), dueDate: p.dueDate })),
    )
  }, [totalCents, count, date])

  const rowsSum = useMemo(
    () => rows.reduce((acc, r) => acc + (Number(r.amount) || 0), 0),
    [rows],
  )
  const sumMatches = rowsSum === totalCents

  useEffect(() => {
    if (state?.ok) {
      setAmount("")
      setCount(1)
      router.refresh()
    }
  }, [state, router])

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  return (
    <form action={action} className="space-y-4 rounded-lg border p-4">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="currency" value={currency} />
      <input type="hidden" name="amountCents" value={amount} />
      <input
        type="hidden"
        name="rate"
        value={currency === "ARS" ? "1" : (suggestedRate ?? "")}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="description">Descripción</Label>
          <Input id="description" name="description" required maxLength={200} />
        </div>

        <div className="space-y-1">
          <Label htmlFor="categoryId">Categoría</Label>
          <select
            id="categoryId"
            name="categoryId"
            required
            className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="date">Fecha</Label>
          <Input
            id="date"
            name="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="amount">Importe</Label>
          <div className="flex gap-2">
            <Input
              id="amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            <Select
              value={currency}
              onValueChange={(v) => setCurrency(v as "ARS" | "USD")}
            >
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ARS">ARS</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {currency === "USD" && (
        <div className="space-y-1">
          <Label htmlFor="rateVisible">Tipo de cambio</Label>
          <Input
            id="rateVisible"
            name="rate"
            inputMode="decimal"
            defaultValue={suggestedRate ?? ""}
            required
          />
          <p className="text-muted-foreground text-xs">
            {suggestedRate
              ? "Sugerido de hoy. Cambialo si operaste a otro valor."
              : "No pudimos traer la cotización. Escribila a mano."}
          </p>
        </div>
      )}

      {kind === "expense" && (
        <div className="space-y-1">
          <Label htmlFor="count">Cuotas</Label>
          <Input
            id="count"
            type="number"
            min={1}
            max={120}
            value={count}
            onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
            className="w-24"
          />
        </div>
      )}

      {totalCents > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Vencimientos</p>
          {rows.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="text-muted-foreground w-8 text-sm">{index + 1}</span>
              <Input
                name="installmentAmount"
                inputMode="numeric"
                value={row.amount}
                onChange={(e) => updateRow(index, { amount: e.target.value })}
                aria-label={`Importe de la cuota ${index + 1} en centavos`}
              />
              <Input
                name="installmentDueDate"
                type="date"
                value={row.dueDate}
                onChange={(e) => updateRow(index, { dueDate: e.target.value })}
                aria-label={`Vencimiento de la cuota ${index + 1}`}
              />
            </div>
          ))}
          <p className={sumMatches ? "text-muted-foreground text-xs" : "text-destructive text-xs"}>
            Suma de cuotas: {formatMoney(rowsSum, currency)} de{" "}
            {formatMoney(totalCents, currency)}
            {!sumMatches && ` — faltan ${formatMoney(totalCents - rowsSum, currency)}`}
          </p>
        </div>
      )}

      {state && !state.ok && <p className="text-destructive text-sm">{state.message}</p>}

      <Button type="submit" disabled={pending || !sumMatches || totalCents <= 0}>
        {pending ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  )
}
```

Los importes de las cuotas viajan **en centavos** y el importe total viaja como lo tipeó el usuario. Por eso `installmentInput` usa `z.coerce.number()` y `amountCents` usa `parseAmountToCents`: ya quedó así en la Task 12, no hay nada que cambiar.

- [ ] **Step 3: Crear la lista de movimientos**

`src/components/movement-list.tsx`:

```tsx
import { formatMoney } from "@/lib/money"
import { todayInAr, isOverdue } from "@/lib/dates"
import { Badge } from "@/components/ui/badge"
import type { Category, MovementWithInstallments } from "@/server/queries"

type Props = {
  movements: MovementWithInstallments[]
  categories: Category[]
}

export function MovementList({ movements, categories }: Props) {
  const today = todayInAr()
  const categoryName = new Map(categories.map((c) => [c.id, c.name]))

  if (movements.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        Todavía no cargaste nada acá.
      </p>
    )
  }

  return (
    <ul className="divide-y">
      {movements.map((m) => {
        const pendientes = m.installments.filter((i) => !i.paid)
        const vencidas = pendientes.filter((i) => isOverdue(i.dueDate, today))

        return (
          <li key={m.id} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{m.description}</p>
              <p className="text-muted-foreground text-sm">
                {m.date} · {m.categoryId ? categoryName.get(m.categoryId) : "—"}
                {m.installments.length > 1 && ` · ${m.installments.length} cuotas`}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {vencidas.length > 0 && (
                <Badge variant="destructive">{vencidas.length} vencida(s)</Badge>
              )}
              {vencidas.length === 0 && pendientes.length > 0 && (
                <Badge variant="secondary">{pendientes.length} pendiente(s)</Badge>
              )}
              <span className="tabular-nums">
                {formatMoney(m.amountCents, m.currency as "ARS" | "USD")}
              </span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
```

- [ ] **Step 4: Crear las dos páginas**

`src/app/(app)/ingresos/page.tsx`:

```tsx
import { MovementForm } from "@/components/movement-form"
import { MovementList } from "@/components/movement-list"
import { fetchSuggestedRate, type RatePreference } from "@/lib/rate"
import { listCategories, listMovements } from "@/server/queries"
import { requireSettings } from "@/server/session"

export default async function IngresosPage() {
  const { user, settings } = await requireSettings()

  const [categories, movements, rate] = await Promise.all([
    listCategories(user.id, "income"),
    listMovements(user.id, { kind: "income" }),
    fetchSuggestedRate(settings.preferredRate as RatePreference),
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Ingresos</h1>
      <MovementForm kind="income" categories={categories} suggestedRate={rate?.sellRate ?? null} />
      <MovementList movements={movements} categories={categories} />
    </div>
  )
}
```

`src/app/(app)/egresos/page.tsx` — igual, cambiando `income` por `expense`, el título por "Egresos" y el TC sugerido por `rate?.buyRate ?? null`:

```tsx
import { MovementForm } from "@/components/movement-form"
import { MovementList } from "@/components/movement-list"
import { fetchSuggestedRate, type RatePreference } from "@/lib/rate"
import { listCategories, listMovements } from "@/server/queries"
import { requireSettings } from "@/server/session"

export default async function EgresosPage() {
  const { user, settings } = await requireSettings()

  const [categories, movements, rate] = await Promise.all([
    listCategories(user.id, "expense"),
    listMovements(user.id, { kind: "expense" }),
    fetchSuggestedRate(settings.preferredRate as RatePreference),
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Egresos</h1>
      <MovementForm kind="expense" categories={categories} suggestedRate={rate?.buyRate ?? null} />
      <MovementList movements={movements} categories={categories} />
    </div>
  )
}
```

- [ ] **Step 5: Verificar a mano**

```bash
pnpm dev
```

1. En `/egresos`, cargar "Tele" por 300000 pesos en 3 cuotas → aparecen tres vencimientos de 100.000,00 con fechas mensuales.
2. Editar el importe de la segunda cuota a 90000 centavos → el botón Guardar se deshabilita y avisa cuánto falta.
3. Volver a 100000 y guardar → aparece en la lista con el badge "3 pendiente(s)".
4. En Supabase, verificar 1 fila en `movement` y 3 en `installment`.
5. Cargar un egreso en USD → aparece el campo de tipo de cambio con la sugerencia de dolarapi.
6. En `/ingresos`, verificar que **no** aparece el campo de cuotas.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: pantallas de ingresos y egresos con plan de cuotas editable"
```

---

### Task 14: Marcar cuotas como pagadas

**Files:**
- Modify: `src/server/actions/movements.ts`
- Create: `src/components/installment-rows.tsx`
- Modify: `src/components/movement-list.tsx`

**Interfaces:**
- Consumes: `withUser` de `@/db/client`; `todayInAr` de `@/lib/dates`.
- Produces: `setInstallmentPaid(id: string, paid: boolean): Promise<ActionResult>` de `@/server/actions/movements`.

- [ ] **Step 1: Escribir la acción**

Agregar a `src/server/actions/movements.ts`:

```ts
import { installment } from "@/db/schema"
import { todayInAr } from "@/lib/dates"

export async function setInstallmentPaid(
  id: string,
  paid: boolean,
): Promise<ActionResult> {
  const user = await requireUser()

  try {
    const updated = await withUser(user.id, (tx) =>
      tx
        .update(installment)
        .set({ paid, paidDate: paid ? todayInAr() : null })
        .where(and(eq(installment.id, id), eq(installment.userId, user.id)))
        .returning({ id: installment.id }),
    )

    if (updated.length === 0) return failure("No encontramos esa cuota.")
  } catch (error) {
    console.error("setInstallmentPaid", error)
    return failure("No pudimos actualizar la cuota.")
  }

  revalidatePath("/", "layout")
  return success()
}
```

La fecha de pago es siempre hoy. Editarla a mano queda fuera del alcance de la v1.

- [ ] **Step 2: Crear el componente de cuotas**

`src/components/installment-rows.tsx`:

```tsx
"use client"

import { useTransition } from "react"

import { Button } from "@/components/ui/button"
import { isOverdue, todayInAr } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { setInstallmentPaid } from "@/server/actions/movements"

type Row = {
  id: string
  number: number
  dueDate: string
  amountCents: number
  paid: boolean
}

export function InstallmentRows({
  rows,
  currency,
}: {
  rows: Row[]
  currency: "ARS" | "USD"
}) {
  const [pending, startTransition] = useTransition()
  const today = todayInAr()

  return (
    <ul className="mt-2 space-y-1 border-t pt-2">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            Cuota {row.number} · vence {row.dueDate}
            {!row.paid && isOverdue(row.dueDate, today) && (
              <span className="text-destructive font-medium"> · vencida</span>
            )}
          </span>
          <span className="flex items-center gap-2">
            <span className="tabular-nums">{formatMoney(row.amountCents, currency)}</span>
            <Button
              size="sm"
              variant={row.paid ? "secondary" : "default"}
              disabled={pending}
              onClick={() =>
                startTransition(() => {
                  void setInstallmentPaid(row.id, !row.paid)
                })
              }
            >
              {row.paid ? "Pagada" : "Marcar pagada"}
            </Button>
          </span>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 3: Mostrar las cuotas dentro de cada movimiento**

En `src/components/movement-list.tsx`, envolver el `<li>` con un `<details>` y agregar el componente. Reemplazar el cuerpo del `map`:

```tsx
return (
  <li key={m.id} className="py-3">
    <details>
      <summary className="flex cursor-pointer items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-medium">{m.description}</p>
          <p className="text-muted-foreground text-sm">
            {m.date} · {m.categoryId ? categoryName.get(m.categoryId) : "—"}
            {m.installments.length > 1 && ` · ${m.installments.length} cuotas`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {vencidas.length > 0 && (
            <Badge variant="destructive">{vencidas.length} vencida(s)</Badge>
          )}
          {vencidas.length === 0 && pendientes.length > 0 && (
            <Badge variant="secondary">{pendientes.length} pendiente(s)</Badge>
          )}
          <span className="tabular-nums">
            {formatMoney(m.amountCents, m.currency as "ARS" | "USD")}
          </span>
        </div>
      </summary>
      <InstallmentRows
        rows={m.installments}
        currency={m.currency as "ARS" | "USD"}
      />
    </details>
  </li>
)
```

Agregar el import:

```tsx
import { InstallmentRows } from "@/components/installment-rows"
```

- [ ] **Step 4: Verificar a mano**

1. En `/egresos`, desplegar el movimiento en cuotas → se ven las tres.
2. Marcar la primera como pagada → el botón pasa a "Pagada" y el badge baja a "2 pendiente(s)".
3. Volver a tocarla → vuelve a pendiente.
4. En Supabase, verificar que `paid_date` se completó y se limpió.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: marcar cuotas como pagadas desde la lista"
```

---

### Task 15: Compra y venta de dólares

**Files:**
- Modify: `src/lib/schemas.ts`, `src/server/queries.ts`, `src/server/actions/movements.ts`
- Create: `src/components/exchange-form.tsx`, `src/app/(app)/cambios/page.tsx`

**Interfaces:**
- Consumes: `usdPosition` de `@/lib/position`; `fetchSuggestedRate` de `@/lib/rate`.
- Produces:
  - `exchangeSchema` de `@/lib/schemas`
  - `listUsdPositionEvents(userId): Promise<PositionEvent[]>` de `@/server/queries`
  - `createExchange(prev, formData): Promise<ActionResult>` de `@/server/actions/movements`

- [ ] **Step 1: Agregar el esquema**

Al final de `src/lib/schemas.ts`:

```ts
export const exchangeSchema = z.object({
  direction: z.enum(["buy", "sell"]),
  date: isoDate,
  usdCents: amountCents.refine((c) => c > 0, "Poné una cantidad mayor a cero."),
  rate: z.coerce.number().positive("El tipo de cambio tiene que ser mayor a cero."),
})
```

- [ ] **Step 2: Agregar la consulta de eventos de posición**

A `src/server/queries.ts`:

```ts
import type { PositionEvent } from "@/lib/position"

/**
 * Todo lo que toca la tenencia de dólares: cambios y cuotas pagadas en USD.
 * Sección 5.5 del spec — toda salida realiza resultado, se venda o se gaste.
 */
export async function listUsdPositionEvents(userId: string): Promise<PositionEvent[]> {
  return withUser(userId, async (tx) => {
    const exchanges = await tx
      .select({
        date: movement.date,
        usdCents: movement.amountCents,
        rate: movement.rate,
        direction: movement.direction,
      })
      .from(movement)
      .where(and(eq(movement.userId, userId), eq(movement.kind, "exchange")))

    const usdInstallments = await tx
      .select({
        date: installment.paidDate,
        usdCents: installment.amountCents,
        rate: movement.rate,
        kind: movement.kind,
      })
      .from(installment)
      .innerJoin(movement, eq(installment.movementId, movement.id))
      .where(
        and(
          eq(installment.userId, userId),
          eq(installment.paid, true),
          eq(movement.currency, "USD"),
        ),
      )

    return [
      ...exchanges.map((e) => ({
        date: e.date,
        usdCents: e.usdCents,
        rate: Number(e.rate),
        direction: (e.direction === "buy" ? "in" : "out") as "in" | "out",
      })),
      ...usdInstallments.map((i) => ({
        date: i.date!,
        usdCents: i.usdCents,
        rate: Number(i.rate),
        direction: (i.kind === "income" ? "in" : "out") as "in" | "out",
      })),
    ]
  })
}
```

- [ ] **Step 3: Agregar la acción**

A `src/server/actions/movements.ts`:

```ts
import { exchangeSchema } from "@/lib/schemas"

export async function createExchange(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser()

  const parsed = exchangeSchema.safeParse({
    direction: formData.get("direction"),
    date: formData.get("date"),
    usdCents: formData.get("usdCents") ?? "",
    rate: formData.get("rate") ?? "",
  })

  if (!parsed.success) {
    const flat = z.flattenError(parsed.error)
    return failure(flat.formErrors[0] ?? "Revisá los datos.", flat.fieldErrors)
  }

  const input = parsed.data

  try {
    // Un cambio NO genera cuotas: es instantáneo y mueve las dos monedas.
    await withUser(user.id, (tx) =>
      tx.insert(movement).values({
        id: randomUUID(),
        userId: user.id,
        kind: "exchange",
        description: input.direction === "buy" ? "Compra de dólares" : "Venta de dólares",
        categoryId: null,
        date: input.date,
        currency: "USD",
        amountCents: input.usdCents,
        rate: String(input.rate),
        direction: input.direction,
      }),
    )
  } catch (error) {
    console.error("createExchange", error)
    return failure("No pudimos registrar la operación.")
  }

  revalidatePath("/", "layout")
  return success()
}
```

- [ ] **Step 4: Crear el formulario**

`src/components/exchange-form.tsx`:

```tsx
"use client"

import { useActionState, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { todayInAr } from "@/lib/dates"
import { createExchange } from "@/server/actions/movements"

type Props = { buyRate: number | null; sellRate: number | null }

export function ExchangeForm({ buyRate, sellRate }: Props) {
  const router = useRouter()
  const [state, action, pending] = useActionState(createExchange, null)
  const [direction, setDirection] = useState<"buy" | "sell">("buy")

  const suggested = direction === "buy" ? buyRate : sellRate

  useEffect(() => {
    if (state?.ok) router.refresh()
  }, [state, router])

  return (
    <form action={action} className="space-y-4 rounded-lg border p-4">
      <input type="hidden" name="direction" value={direction} />

      <div className="flex gap-2">
        <Button
          type="button"
          variant={direction === "buy" ? "default" : "outline"}
          onClick={() => setDirection("buy")}
        >
          Comprar dólares
        </Button>
        <Button
          type="button"
          variant={direction === "sell" ? "default" : "outline"}
          onClick={() => setDirection("sell")}
        >
          Vender dólares
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="date">Fecha</Label>
          <Input id="date" name="date" type="date" defaultValue={todayInAr()} required />
        </div>

        <div className="space-y-1">
          <Label htmlFor="usdCents">Dólares</Label>
          <Input id="usdCents" name="usdCents" inputMode="decimal" required />
        </div>

        <div className="space-y-1">
          <Label htmlFor="rate">Tipo de cambio</Label>
          {/* key fuerza el remonte para que el sugerido cambie al alternar. */}
          <Input
            key={direction}
            id="rate"
            name="rate"
            inputMode="decimal"
            defaultValue={suggested ?? ""}
            required
          />
        </div>
      </div>

      {!suggested && (
        <p className="text-muted-foreground text-xs">
          No pudimos traer la cotización. Escribila a mano.
        </p>
      )}

      {state && !state.ok && <p className="text-destructive text-sm">{state.message}</p>}

      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Registrar operación"}
      </Button>
    </form>
  )
}
```

- [ ] **Step 5: Crear la página**

`src/app/(app)/cambios/page.tsx`:

```tsx
import { ExchangeForm } from "@/components/exchange-form"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatMoney } from "@/lib/money"
import { usdPosition } from "@/lib/position"
import { fetchSuggestedRate, type RatePreference } from "@/lib/rate"
import { listExchanges, listUsdPositionEvents } from "@/server/queries"
import { requireSettings } from "@/server/session"

export default async function CambiosPage() {
  const { user, settings } = await requireSettings()

  const [events, exchanges, rate] = await Promise.all([
    listUsdPositionEvents(user.id),
    listExchanges(user.id),
    fetchSuggestedRate(settings.preferredRate as RatePreference),
  ])

  const position = usdPosition(events)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Cambios</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tenencia</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl tabular-nums">
            {formatMoney(position.usdCents, "USD")}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">TC promedio</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl tabular-nums">
            {position.averageRate > 0 ? position.averageRate.toFixed(2) : "—"}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Diferencia de cambio</CardTitle>
          </CardHeader>
          <CardContent
            className={
              position.realizedArsCents >= 0
                ? "text-2xl tabular-nums text-emerald-600"
                : "text-destructive text-2xl tabular-nums"
            }
          >
            {formatMoney(position.realizedArsCents, "ARS")}
          </CardContent>
        </Card>
      </div>

      {position.oversoldUsdCents > 0 && (
        <p className="text-destructive text-sm">
          Saliste de {formatMoney(position.oversoldUsdCents, "USD")} más de los que tenés
          registrados. Revisá si te falta cargar alguna compra o algún ingreso en dólares.
        </p>
      )}

      <ExchangeForm buyRate={rate?.buyRate ?? null} sellRate={rate?.sellRate ?? null} />

      <ul className="divide-y">
        {exchanges.map((e) => (
          <li key={e.id} className="flex items-center justify-between py-3">
            <span>
              {e.date} · {e.direction === "buy" ? "Compra" : "Venta"} a {Number(e.rate).toFixed(2)}
            </span>
            <span className="tabular-nums">{formatMoney(e.amountCents, "USD")}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 6: Verificar a mano contra los números del test**

1. Registrar una compra de 100 dólares a 1000 → tenencia US$ 100,00, TC promedio 1000,00, diferencia $ 0,00.
2. Registrar una venta de 100 dólares a 1500 → tenencia US$ 0,00 y diferencia **$ 50.000,00**.
3. Registrar una venta de 50 más → aparece el aviso de que saliste de más de lo registrado.

Estos son exactamente los casos de `src/lib/position.test.ts`: si la pantalla muestra otra cosa, el problema está en el armado de eventos de `listUsdPositionEvents`, no en la función pura.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: compra y venta de dólares con posición y diferencia de cambio"
```

---

### Task 16: Categorías y Ajustes

**Files:**
- Create: `src/server/actions/categories.ts`, `src/components/category-manager.tsx`
- Create: `src/app/(app)/categorias/page.tsx`, `src/app/(app)/ajustes/page.tsx`

**Interfaces:**
- Produces: `createCategory(prev, formData)`, `archiveCategory(id)` de `@/server/actions/categories`.

- [ ] **Step 1: Escribir las acciones**

`src/server/actions/categories.ts`:

```ts
"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { withUser } from "@/db/client"
import { category } from "@/db/schema"
import { failure, success, type ActionResult } from "@/server/actions/result"
import { requireUser } from "@/server/session"

const schema = z.object({
  name: z.string().trim().min(1, "Poné un nombre.").max(60),
  kind: z.enum(["income", "expense"]),
})

export async function createCategory(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser()

  const parsed = schema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
  })
  if (!parsed.success) {
    return failure("Revisá los datos.", z.flattenError(parsed.error).fieldErrors)
  }

  try {
    await withUser(user.id, (tx) =>
      tx.insert(category).values({ id: randomUUID(), userId: user.id, ...parsed.data }),
    )
  } catch (error) {
    // El índice único parcial rebota los nombres repetidos entre las activas.
    console.error("createCategory", error)
    return failure("Ya tenés una categoría con ese nombre.")
  }

  revalidatePath("/", "layout")
  return success()
}

/**
 * Se archiva en lugar de borrar: los movimientos históricos conservan su categoría.
 */
export async function archiveCategory(id: string): Promise<ActionResult> {
  const user = await requireUser()

  try {
    await withUser(user.id, (tx) =>
      tx
        .update(category)
        .set({ archived: true })
        .where(and(eq(category.id, id), eq(category.userId, user.id))),
    )
  } catch (error) {
    console.error("archiveCategory", error)
    return failure("No pudimos archivar la categoría.")
  }

  revalidatePath("/", "layout")
  return success()
}
```

- [ ] **Step 2: Crear el componente**

`src/components/category-manager.tsx`:

```tsx
"use client"

import { useActionState, useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { archiveCategory, createCategory } from "@/server/actions/categories"
import type { Category } from "@/server/queries"

export function CategoryManager({
  kind,
  categories,
}: {
  kind: "income" | "expense"
  categories: Category[]
}) {
  const router = useRouter()
  const [state, action, pending] = useActionState(createCategory, null)
  const [archiving, startTransition] = useTransition()

  useEffect(() => {
    if (state?.ok) router.refresh()
  }, [state, router])

  return (
    <section className="space-y-3">
      <h2 className="font-medium">{kind === "income" ? "De ingresos" : "De egresos"}</h2>

      <form action={action} className="flex gap-2">
        <input type="hidden" name="kind" value={kind} />
        <Input name="name" placeholder="Nombre de la categoría" required maxLength={60} />
        <Button type="submit" disabled={pending}>
          Agregar
        </Button>
      </form>

      {state && !state.ok && <p className="text-destructive text-sm">{state.message}</p>}

      <ul className="divide-y">
        {categories
          .filter((c) => !c.archived)
          .map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2">
              <span>{c.name}</span>
              <Button
                size="sm"
                variant="ghost"
                disabled={archiving}
                onClick={() =>
                  startTransition(() => {
                    void archiveCategory(c.id)
                  })
                }
              >
                Archivar
              </Button>
            </li>
          ))}
      </ul>
    </section>
  )
}
```

- [ ] **Step 3: Crear las páginas**

`src/app/(app)/categorias/page.tsx`:

```tsx
import { CategoryManager } from "@/components/category-manager"
import { listCategories } from "@/server/queries"
import { requireSettings } from "@/server/session"

export default async function CategoriasPage() {
  const { user } = await requireSettings()
  const categories = await listCategories(user.id)

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Categorías</h1>
      <CategoryManager kind="income" categories={categories.filter((c) => c.kind === "income")} />
      <CategoryManager kind="expense" categories={categories.filter((c) => c.kind === "expense")} />
    </div>
  )
}
```

`src/app/(app)/ajustes/page.tsx`:

```tsx
import { SettingsForm } from "@/components/settings-form"
import { requireSettings } from "@/server/session"

export default async function AjustesPage() {
  const { settings } = await requireSettings()

  return (
    <div className="max-w-sm space-y-6">
      <h1 className="text-2xl font-semibold">Ajustes</h1>
      <SettingsForm
        defaults={{
          initialBalanceArs: String(settings.initialBalanceArsCents / 100),
          initialBalanceUsd: String(settings.initialBalanceUsdCents / 100),
          initialBalanceDate: settings.initialBalanceDate,
          preferredRate: settings.preferredRate,
        }}
        submitLabel="Guardar cambios"
      />
    </div>
  )
}
```

- [ ] **Step 4: Verificar a mano**

1. En `/categorias`, agregar "Mascotas" a egresos → aparece en la lista y en el desplegable de `/egresos`.
2. Intentar agregar "Mascotas" otra vez → error de nombre repetido.
3. Archivarla → desaparece de la lista y del desplegable, pero los movimientos que la usaban siguen mostrándola.
4. Volver a agregar "Mascotas" → funciona, porque el índice único sólo mira las activas.
5. En `/ajustes`, cambiar el saldo inicial → el dashboard refleja el cambio.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: ABM de categorías con archivado y pantalla de ajustes"
```

---

### Task 17: Dashboard

Los cuatro bloques de la sección 7.1 del spec.

**Files:**
- Create: `src/lib/dashboard.ts`, `src/lib/dashboard.test.ts`
- Create: `src/components/dashboard/balance-cards.tsx`, `src/components/dashboard/upcoming.tsx`, `src/components/dashboard/charts.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `computeBalances`, `convertToArs`, `usdPosition`, `monthKey`, `addMonthsClamped`, `todayInAr`.
- Produces:
  - `projectBalance(startArsCents, pending, months, today): { month: string; arsCents: number }[]`
  - `spendByCategory(movements, categories): { name: string; arsCents: number }[]`
  - `monthlyTotals(movements, months, today): { month: string; incomeArsCents: number; expenseArsCents: number }[]`

- [ ] **Step 1: Instalar Recharts**

```bash
pnpm add recharts@3.10.1
```

- [ ] **Step 2: Escribir los tests de la agregación**

`src/lib/dashboard.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { projectBalance, spendByCategory, monthlyTotals } from "@/lib/dashboard"

describe("projectBalance", () => {
  it("arranca del saldo de hoy y aplica los pendientes por vencimiento", () => {
    const result = projectBalance(
      100_000_00,
      [
        { dueDate: "2026-09-10", arsCents: 30_000_00, kind: "expense" },
        { dueDate: "2026-10-05", arsCents: 50_000_00, kind: "income" },
      ],
      3,
      "2026-08-09",
    )

    expect(result).toEqual([
      { month: "2026-08", arsCents: 100_000_00 },
      { month: "2026-09", arsCents: 70_000_00 },
      { month: "2026-10", arsCents: 120_000_00 },
    ])
  })

  it("ignora los vencimientos posteriores al horizonte", () => {
    const result = projectBalance(
      10_000_00,
      [{ dueDate: "2027-05-01", arsCents: 999_00, kind: "expense" }],
      2,
      "2026-08-09",
    )

    expect(result.at(-1)!.arsCents).toBe(10_000_00)
  })

  it("acumula los vencimientos atrasados en el mes actual", () => {
    const result = projectBalance(
      10_000_00,
      [{ dueDate: "2026-07-01", arsCents: 4_000_00, kind: "expense" }],
      2,
      "2026-08-09",
    )

    expect(result[0].arsCents).toBe(6_000_00)
  })
})

describe("spendByCategory", () => {
  it("suma los egresos por categoría y los ordena de mayor a menor", () => {
    const result = spendByCategory(
      [
        { categoryId: "a", arsCents: 1_000 },
        { categoryId: "b", arsCents: 5_000 },
        { categoryId: "a", arsCents: 2_000 },
      ],
      [
        { id: "a", name: "Comida" },
        { id: "b", name: "Alquiler" },
      ],
    )

    expect(result).toEqual([
      { name: "Alquiler", arsCents: 5_000 },
      { name: "Comida", arsCents: 3_000 },
    ])
  })

  it("agrupa como Sin categoría lo que no tiene", () => {
    const result = spendByCategory([{ categoryId: null, arsCents: 700 }], [])
    expect(result).toEqual([{ name: "Sin categoría", arsCents: 700 }])
  })
})

describe("monthlyTotals", () => {
  it("devuelve un punto por mes en orden cronológico", () => {
    const result = monthlyTotals(
      [
        { date: "2026-07-15", kind: "income", arsCents: 100_00 },
        { date: "2026-08-01", kind: "expense", arsCents: 40_00 },
        { date: "2026-08-20", kind: "expense", arsCents: 10_00 },
      ],
      3,
      "2026-08-09",
    )

    expect(result).toEqual([
      { month: "2026-06", incomeArsCents: 0, expenseArsCents: 0 },
      { month: "2026-07", incomeArsCents: 100_00, expenseArsCents: 0 },
      { month: "2026-08", incomeArsCents: 0, expenseArsCents: 50_00 },
    ])
  })
})
```

- [ ] **Step 3: Correr los tests y verificar que fallan**

```bash
pnpm test src/lib/dashboard.test.ts
```
Esperado: FAIL, no resuelve `@/lib/dashboard`.

- [ ] **Step 4: Implementar**

`src/lib/dashboard.ts`:

```ts
import { addMonthsClamped, monthKey, type IsoDate } from "@/lib/dates"

export type PendingItem = {
  dueDate: IsoDate
  arsCents: number
  kind: "income" | "expense"
}

/**
 * Saldo proyectado mes a mes. El primer punto es hoy; a partir de ahí se
 * aplican los vencimientos pendientes por su fecha. Lo ya vencido pesa en el
 * mes actual, porque sigue debiéndose.
 */
export function projectBalance(
  startArsCents: number,
  pending: PendingItem[],
  months: number,
  today: IsoDate,
): { month: string; arsCents: number }[] {
  const keys = Array.from({ length: months }, (_, i) =>
    monthKey(addMonthsClamped(today, i)),
  )

  const deltas = new Map<string, number>(keys.map((k) => [k, 0]))
  const currentMonth = keys[0]
  const lastMonth = keys.at(-1)!

  for (const item of pending) {
    const key = monthKey(item.dueDate)
    // Atrasado => pesa hoy. Más allá del horizonte => no se muestra.
    const bucket = key < currentMonth ? currentMonth : key
    if (bucket > lastMonth) continue

    const signed = item.kind === "income" ? item.arsCents : -item.arsCents
    deltas.set(bucket, (deltas.get(bucket) ?? 0) + signed)
  }

  let running = startArsCents
  return keys.map((month) => {
    running += deltas.get(month) ?? 0
    return { month, arsCents: running }
  })
}

export function spendByCategory(
  expenses: { categoryId: string | null; arsCents: number }[],
  categories: { id: string; name: string }[],
): { name: string; arsCents: number }[] {
  const names = new Map(categories.map((c) => [c.id, c.name]))
  const totals = new Map<string, number>()

  for (const expense of expenses) {
    const name = (expense.categoryId && names.get(expense.categoryId)) || "Sin categoría"
    totals.set(name, (totals.get(name) ?? 0) + expense.arsCents)
  }

  return [...totals.entries()]
    .map(([name, arsCents]) => ({ name, arsCents }))
    .sort((a, b) => b.arsCents - a.arsCents)
}

export function monthlyTotals(
  movements: { date: IsoDate; kind: "income" | "expense"; arsCents: number }[],
  months: number,
  today: IsoDate,
): { month: string; incomeArsCents: number; expenseArsCents: number }[] {
  const keys = Array.from({ length: months }, (_, i) =>
    monthKey(addMonthsClamped(today, i - months + 1)),
  )

  const buckets = new Map(
    keys.map((k) => [k, { month: k, incomeArsCents: 0, expenseArsCents: 0 }]),
  )

  for (const m of movements) {
    const bucket = buckets.get(monthKey(m.date))
    if (!bucket) continue
    if (m.kind === "income") bucket.incomeArsCents += m.arsCents
    else bucket.expenseArsCents += m.arsCents
  }

  return keys.map((k) => buckets.get(k)!)
}
```

- [ ] **Step 5: Correr los tests**

```bash
pnpm test src/lib/dashboard.test.ts
```
Esperado: PASS, 6 tests.

- [ ] **Step 6: Crear los componentes de tarjetas y vencimientos**

`src/components/dashboard/balance-cards.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatMoney } from "@/lib/money"

type Props = {
  arsCents: number
  usdCents: number
  consolidatedArsCents: number | null
  rate: number | null
  monthIncomeArsCents: number
  monthExpenseArsCents: number
}

export function BalanceCards({
  arsCents,
  usdCents,
  consolidatedArsCents,
  rate,
  monthIncomeArsCents,
  monthExpenseArsCents,
}: Props) {
  const diff = monthIncomeArsCents - monthExpenseArsCents

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Pesos</CardTitle>
        </CardHeader>
        <CardContent className="text-2xl tabular-nums">
          {formatMoney(arsCents, "ARS")}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Dólares</CardTitle>
        </CardHeader>
        <CardContent className="text-2xl tabular-nums">
          {formatMoney(usdCents, "USD")}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Total consolidado</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl tabular-nums">
            {consolidatedArsCents === null ? "—" : formatMoney(consolidatedArsCents, "ARS")}
          </p>
          <p className="text-muted-foreground text-xs">
            {rate ? `dólar a ${rate.toFixed(2)}` : "sin cotización de hoy"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Este mes</CardTitle>
        </CardHeader>
        <CardContent>
          <p
            className={
              diff >= 0 ? "text-2xl tabular-nums text-emerald-600" : "text-destructive text-2xl tabular-nums"
            }
          >
            {formatMoney(diff, "ARS")}
          </p>
          <p className="text-muted-foreground text-xs">
            {formatMoney(monthIncomeArsCents, "ARS")} entraron ·{" "}
            {formatMoney(monthExpenseArsCents, "ARS")} salieron
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
```

`src/components/dashboard/upcoming.tsx` — reutiliza `InstallmentRows` para no duplicar el botón de marcar pagada:

```tsx
import Link from "next/link"

import { InstallmentRows } from "@/components/installment-rows"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type Item = {
  id: string
  number: number
  dueDate: string
  amountCents: number
  description: string
  currency: "ARS" | "USD"
  kind: "income" | "expense"
}

export function Upcoming({ items }: { items: Item[] }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Vencimientos</CardTitle>
        <Link href="/egresos" className="text-muted-foreground text-sm underline">
          Ver todo
        </Link>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">No tenés nada pendiente. Bien ahí.</p>
        ) : (
          <ul className="divide-y">
            {items.map((item) => (
              <li key={item.id} className="py-2">
                <p className="text-sm font-medium">
                  {item.description}{" "}
                  <span className="text-muted-foreground font-normal">
                    ({item.kind === "income" ? "a cobrar" : "a pagar"})
                  </span>
                </p>
                <InstallmentRows
                  rows={[{ ...item, paid: false }]}
                  currency={item.currency}
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 7: Crear los gráficos**

`src/components/dashboard/charts.tsx`:

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

const COLORS = ["#0ea5e9", "#f97316", "#22c55e", "#a855f7", "#ef4444", "#eab308", "#14b8a6"]

const toPesos = (cents: number) => cents / 100
const tip = (value: number) => formatMoney(Math.round(value * 100), "ARS")

export function ProjectionChart({
  data,
}: {
  data: { month: string; arsCents: number }[]
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data.map((d) => ({ month: d.month, saldo: toPesos(d.arsCents) }))}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis width={80} />
        <Tooltip formatter={(v: number) => tip(v)} />
        <Line type="monotone" dataKey="saldo" stroke="#0ea5e9" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function CategoryPie({ data }: { data: { name: string; arsCents: number }[] }) {
  if (data.length === 0) {
    return <p className="text-muted-foreground py-8 text-center text-sm">Sin egresos este mes.</p>
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data.map((d) => ({ name: d.name, value: toPesos(d.arsCents) }))}
          dataKey="value"
          nameKey="name"
          outerRadius={80}
        >
          {data.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v: number) => tip(v)} />
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
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis width={80} />
        <Tooltip formatter={(v: number) => tip(v)} />
        <Legend />
        <Bar dataKey="Ingresos" fill="#22c55e" />
        <Bar dataKey="Egresos" fill="#ef4444" />
      </BarChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 8: Armar la página**

`src/app/(app)/dashboard/page.tsx`:

```tsx
import { BalanceCards } from "@/components/dashboard/balance-cards"
import { CategoryPie, MonthlyBars, ProjectionChart } from "@/components/dashboard/charts"
import { Upcoming } from "@/components/dashboard/upcoming"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { computeBalances } from "@/lib/balance"
import { monthlyTotals, projectBalance, spendByCategory } from "@/lib/dashboard"
import { addMonthsClamped, monthKey, todayInAr } from "@/lib/dates"
import { convertToArs } from "@/lib/money"
import { fetchSuggestedRate, type RatePreference } from "@/lib/rate"
import {
  listCategories,
  listExchanges,
  listMovements,
  listPaidInstallments,
  listPendingInstallments,
} from "@/server/queries"
import { requireSettings } from "@/server/session"

const HORIZON_MONTHS = 6
const HISTORY_MONTHS = 12
const UPCOMING_DAYS = 30

export default async function DashboardPage() {
  const { user, settings } = await requireSettings()
  const today = todayInAr()

  const [paid, exchanges, pending, movements, categories, rate] = await Promise.all([
    listPaidInstallments(user.id),
    listExchanges(user.id),
    listPendingInstallments(user.id),
    listMovements(user.id),
    listCategories(user.id),
    fetchSuggestedRate(settings.preferredRate as RatePreference),
  ])

  const balances = computeBalances(
    {
      initialArsCents: settings.initialBalanceArsCents,
      initialUsdCents: settings.initialBalanceUsdCents,
      initialDate: settings.initialBalanceDate,
    },
    paid.map((p) => ({
      paidDate: p.paidDate!,
      currency: p.currency as "ARS" | "USD",
      kind: p.kind as "income" | "expense",
      amountCents: p.amountCents,
    })),
    exchanges.map((e) => ({
      date: e.date,
      direction: e.direction as "buy" | "sell",
      usdCents: e.amountCents,
      rate: Number(e.rate),
    })),
  )

  const todayRate = rate?.sellRate ?? null
  const consolidated =
    todayRate === null ? null : balances.arsCents + convertToArs(balances.usdCents, todayRate)

  // Todo lo que no sea ARS se consolida con el rate del propio movimiento.
  const toArs = (cents: number, currency: string, movementRate: string) =>
    currency === "ARS" ? cents : convertToArs(cents, Number(movementRate))

  const thisMonth = monthKey(today)
  const monthPaid = paid.filter((p) => monthKey(p.paidDate!) === thisMonth)

  const projection = projectBalance(
    balances.arsCents,
    pending.map((p) => ({
      dueDate: p.dueDate,
      arsCents: toArs(p.amountCents, p.currency, p.rate),
      kind: p.kind as "income" | "expense",
    })),
    HORIZON_MONTHS,
    today,
  )

  const limit = addMonthsClamped(today, 1)
  const upcoming = pending
    .filter((p) => p.dueDate <= limit)
    .slice(0, 20)
    .map((p) => ({
      id: p.id,
      number: p.number,
      dueDate: p.dueDate,
      amountCents: p.amountCents,
      description: p.description,
      currency: p.currency as "ARS" | "USD",
      kind: p.kind as "income" | "expense",
    }))

  const expenseMovements = movements.filter((m) => m.kind === "expense")

  const pie = spendByCategory(
    expenseMovements
      .filter((m) => monthKey(m.date) === thisMonth)
      .map((m) => ({
        categoryId: m.categoryId,
        arsCents: toArs(m.amountCents, m.currency, m.rate),
      })),
    categories,
  )

  const bars = monthlyTotals(
    movements
      .filter((m) => m.kind !== "exchange")
      .map((m) => ({
        date: m.date,
        kind: m.kind as "income" | "expense",
        arsCents: toArs(m.amountCents, m.currency, m.rate),
      })),
    HISTORY_MONTHS,
    today,
  )

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <BalanceCards
        arsCents={balances.arsCents}
        usdCents={balances.usdCents}
        consolidatedArsCents={consolidated}
        rate={todayRate}
        monthIncomeArsCents={monthPaid
          .filter((p) => p.kind === "income")
          .reduce((a, p) => a + toArs(p.amountCents, p.currency, p.rate), 0)}
        monthExpenseArsCents={monthPaid
          .filter((p) => p.kind === "expense")
          .reduce((a, p) => a + toArs(p.amountCents, p.currency, p.rate), 0)}
      />

      <Upcoming items={upcoming} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Saldo proyectado ({HORIZON_MONTHS} meses)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ProjectionChart data={projection} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Egresos del mes por categoría</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryPie data={pie} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimos {HISTORY_MONTHS} meses</CardTitle>
        </CardHeader>
        <CardContent>
          <MonthlyBars data={bars} />
        </CardContent>
      </Card>
    </div>
  )
}
```

`listPaidInstallments` ya devuelve el `rate` del movimiento (Task 12), así que los totales del mes se consolidan con el TC de cada operación y no con el de hoy.

- [ ] **Step 9: Verificar a mano**

1. Con datos cargados, el dashboard muestra los cuatro bloques sin errores en consola.
2. El saldo en pesos coincide con lo que calcularías a mano: saldo inicial menos lo pagado más lo cobrado, más o menos los cambios.
3. Marcar una cuota como pagada desde el bloque de vencimientos → el saldo baja y la cuota desaparece de la lista.
4. Sin conexión a internet, el bloque de consolidado muestra "—" y "sin cotización de hoy", y todo lo demás sigue funcionando.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: dashboard con saldos, vencimientos, proyección y gráficos"
```

---

### Task 18: Landing, cierre de sesión y verificación final

**Files:**
- Modify: `src/app/page.tsx`, `src/app/layout.tsx`, `src/components/app-nav.tsx`
- Create: `README.md`

- [ ] **Step 1: Escribir la landing**

`src/app/page.tsx`:

```tsx
import Link from "next/link"
import { redirect } from "next/navigation"

import { Button } from "@/components/ui/button"
import { getOptionalUser } from "@/server/session"

export default async function HomePage() {
  if (await getOptionalUser()) redirect("/dashboard")

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-4">
      <h1 className="text-4xl font-semibold">Mis Pesitos</h1>
      <p className="text-muted-foreground text-lg">
        Anotá lo que entra y lo que sale, seguí tus cuotas y mirá cuánta plata te queda
        de verdad. En pesos y en dólares.
      </p>
      <div className="flex gap-3">
        <Button asChild>
          <Link href="/registro">Crear cuenta</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/login">Entrar</Link>
        </Button>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Ajustar el layout raíz**

`src/app/layout.tsx`:

```tsx
import type { Metadata } from "next"

import "./globals.css"

export const metadata: Metadata = {
  title: "Mis Pesitos",
  description: "Finanzas personales en pesos y dólares.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body className="antialiased">{children}</body>
    </html>
  )
}
```

- [ ] **Step 3: Agregar el cierre de sesión a la navegación**

En `src/components/app-nav.tsx`, agregar dentro del `<nav>`, después del `map`:

```tsx
<button
  type="button"
  onClick={() => signOut({ fetchOptions: { onSuccess: () => router.push("/login") } })}
  className="text-muted-foreground hover:text-foreground ml-auto rounded-md px-3 py-1.5 text-sm whitespace-nowrap"
>
  Salir
</button>
```

Y los imports:

```tsx
import { useRouter } from "next/navigation"
import { signOut } from "@/auth-client"
```

Más el `const router = useRouter()` dentro del componente.

- [ ] **Step 4: Escribir el README**

`README.md`:

```markdown
# Mis Pesitos

App web de finanzas personales: ingresos, egresos en cuotas, compra y venta de
dólares, y un dashboard con saldo, deudas y flujo proyectado.

Diseño: `docs/superpowers/specs/2026-08-09-mis-pesitos-design.md`

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind 4 · shadcn/ui · Drizzle · Supabase ·
better-auth · Recharts · Vitest. Gestor de paquetes: **pnpm**.

## Puesta en marcha

1. `pnpm install`
2. Copiar `.env.example` a `.env.local` y completarlo:
   - `DATABASE_URL` — transaction pooler de Supabase (puerto 6543)
   - `BETTER_AUTH_SECRET` — `openssl rand -base64 32`
   - `BETTER_AUTH_URL` — `http://localhost:3000`
   - `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` — credenciales OAuth de Google Cloud,
     con `http://localhost:3000/api/auth/callback/google` como URI de redirección
3. `pnpm db:migrate`
4. `pnpm dev`

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Servidor de desarrollo |
| `pnpm test` | Tests unitarios de la lógica de plata |
| `pnpm test:db` | Test de integración que verifica el aislamiento por RLS |
| `pnpm typecheck` | Chequeo de tipos |
| `pnpm db:generate` / `pnpm db:migrate` | Migraciones de Drizzle |

## Cómo está armado

- **La plata son centavos enteros.** Nunca decimales. Una sola función convierte monedas.
- **Las fechas son strings `YYYY-MM-DD`**, con "hoy" calculado en la zona de Buenos Aires.
- **Toda la lógica de negocio vive en `src/lib/`** como funciones puras testeadas: reparto
  de cuotas, saldo, posición en dólares y agregados del dashboard.
- **Todo el acceso a datos pasa por `withUser()`**, que abre una transacción y declara el
  usuario ante Postgres para que apliquen las políticas de RLS.
```

- [ ] **Step 5: Verificación final completa**

```bash
pnpm test
```
Esperado: PASS, 47 tests.

```bash
pnpm test:db
```
Esperado: PASS, 4 tests.

```bash
pnpm typecheck
```
Esperado: sin errores.

```bash
pnpm lint
```
Esperado: sin errores.

```bash
pnpm build
```
Esperado: build exitoso.

Recorrido manual completo, en orden, con una cuenta nueva:

1. `/` → Crear cuenta con Google → onboarding → dashboard.
2. Cargar un ingreso de sueldo en pesos, marcarlo cobrado → el saldo sube.
3. Cargar un egreso en 6 cuotas → aparecen 6 vencimientos y el badge de pendientes.
4. Marcar la primera cuota pagada desde el dashboard → el saldo baja.
5. Comprar 100 dólares y venderlos a un TC más alto → la diferencia de cambio aparece
   en `/cambios`.
6. Agregar una categoría, usarla, archivarla → sigue viéndose en los movimientos viejos.
7. Cambiar el saldo inicial en `/ajustes` → el dashboard se actualiza.
8. Cerrar sesión → vuelve al login y `/dashboard` ya no es accesible.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: landing, cierre de sesión y documentación de puesta en marcha"
```

---

## Notas de revisión del plan

Cobertura contra el spec, verificada sección por sección:

| Sección del spec | Tarea que la implementa |
|---|---|
| 3 — Stack y versiones | 1, y las constraints globales |
| 4 — Modelo de datos | 9 |
| 5.0 — Redondeo | 2 |
| 5.1 — Reparto de cuotas | 4 |
| 5.2 — Saldo | 6 |
| 5.3 — Deudas y cobros | 14, 17 |
| 5.4 — Consolidación | 17 |
| 5.5 — Diferencia de cambio | 5, 15 |
| 5.6 — Cotización sugerida | 7 |
| 6 — Auth y RLS | 9, 10 |
| 7 — Pantallas | 10, 11, 13, 15, 16, 17, 18 |
| 8 — Errores | 7 (dolarapi), 10 (sesión), 12 (Zod y suma de cuotas) |
| 9 — Tests | 2, 3, 4, 5, 6, 7, 9, 17 |
| 10 — Variables de entorno | 1, 8, 10 |

Dos cosas quedaron fuera de las tareas a propósito, y son deuda conocida de la v1:

- **Editar un movimiento ya guardado.** Se puede borrar y volver a cargar. Agregar
  `updateMovement` es una tarea aparte y no bloquea usar la app.
- **Elegir la fecha de pago al marcar una cuota.** Siempre queda hoy.

---

## Ejecución

**Plan completo y guardado en `docs/superpowers/plans/2026-08-09-mis-pesitos-v1.md`.**
