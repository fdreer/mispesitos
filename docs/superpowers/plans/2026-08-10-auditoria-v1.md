# Plan de corrección de la auditoría v1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los 17 hallazgos de la auditoría del 2026-08-10 sobre la v1, del crítico al menor, sin cambiar el alcance funcional de la app.

**Architecture:** Doce tareas independientes, ordenadas por severidad. Las cuatro primeras arreglan defectos que un usuario encuentra usando la app o que hacen crecer la carga sobre la base sin techo. Las del medio cierran inconsistencias de datos y de interfaz. Las últimas son limpieza y herramienta. Cada tarea termina en un commit propio y deja la suite verde.

**Tech Stack:** Next.js 16 · React 19 · TypeScript · Drizzle · Vitest · pnpm.

## Global Constraints

- Gestor de paquetes: **pnpm**. Nunca `npm` ni `yarn`.
- Los comentarios del código y los mensajes de commit van **en español**, siguiendo el estilo del historial (`fix(ui): el toggle elegido no se despinta al pasarle el mouse`).
- No se agrega ninguna dependencia de **runtime**. Las únicas dependencias nuevas permitidas son de desarrollo y están nombradas explícitamente en las tareas 1 y 12.
- La plata son **centavos enteros**. Las fechas de negocio son strings `YYYY-MM-DD` calculados con el reloj de Buenos Aires (`todayInAr()`), nunca `new Date()`.
- Toda columna `numeric` de Postgres llega a TypeScript como **string**, no como number. Convertir con `Number()` una sola vez, en el borde.
- Todo acceso a datos pasa por `withUser()`.
- TDD: el test se escribe primero, se corre para verlo fallar, y recién después se escribe la implementación. Un test que pasa antes de existir la implementación es un test que no prueba nada.
- `pnpm typecheck` y `pnpm lint` tienen que quedar limpios al cerrar cada tarea.
- `pnpm test:db` necesita `.env.local` apuntando a una base real y **no se corre contra producción**. Si no hay base disponible, las tareas que lo piden se cierran con `pnpm test` + `pnpm typecheck` y se anota la deuda.

## Mapa de archivos

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `src/app/(app)/error.tsx` | **Nuevo.** Boundary de error de la app: hoy un throw en cualquier componente deja la pantalla en blanco. | 1 |
| `src/components/movement-form.tsx` | Guard de fecha, techo de cuotas, `today` como prop. | 1, 2, 8 |
| `src/components/movement-form.test.tsx` | **Nuevo.** Primer test de componente del proyecto. | 1, 2 |
| `src/lib/schemas.ts` | Techo de cuotas del lado del servidor, importe de movimiento mayor a cero. | 2, 11 |
| `src/server/session.ts` | Memoización por request de la lectura de sesión. | 3 |
| `src/server/queries.ts` | Memoización de `getSettings`, piso de fecha en `listExchanges`. | 3, 6 |
| `src/lib/dashboard-view.ts` | **Nuevo.** Todo el armado de datos del dashboard, puro y testeable. | 4, 5 |
| `src/lib/dashboard-view.test.ts` | **Nuevo.** Tests de ese armado. | 4, 5 |
| `src/app/(app)/dashboard/page.tsx` | Queda como orquestador: trae datos, llama al armador, pinta. | 4, 5, 8 |
| `src/app/(app)/cambios/page.tsx` | Piso de fecha en la lista de operaciones. | 6 |
| `src/components/settings-form.tsx` | Mensaje de guardado. | 7 |
| `src/components/installment-rows.tsx` | Deshabilitado por fila, `today` como prop. | 8 |
| `src/components/movement-list.tsx`, `src/components/dashboard/upcoming.tsx` | Pasan `today` hacia abajo. | 8 |
| `src/server/actions/settings.ts` | Alta de ajustes a prueba de carrera. | 9 |
| `src/lib/log-db-error.ts` | **Nuevo.** Log de errores de base sin volcar los valores de la fila. | 11 |
| `src/app/(app)/loading.tsx` | **Nuevo.** Esqueleto mientras el dashboard trae sus datos. | 12 |

---

### Task 1: El guard de fecha y el boundary de error

El bug crítico. `<input type="date">` devuelve `""` cuando la fecha está incompleta —el botón de limpiar de Chrome, y también cada tecla mientras se tipea a mano—. Con un importe ya cargado, `movement-form.tsx` llama a `buildInstallments` en el cuerpo del render, que llama a `addMonthsClamped("")`, que tira. Como no hay ningún `error.tsx` en `src/app/`, el throw sube al boundary por defecto de Next y la pantalla queda en "Application error".

Esta tarea trae además la infraestructura de tests de componente, porque es la única forma de probar el arreglo y porque los dos hallazgos siguientes viven en el mismo archivo.

**Files:**
- Create: `src/app/(app)/error.tsx`
- Create: `src/components/movement-form.test.tsx`
- Modify: `src/components/movement-form.tsx:18` (import) y `:53` (planKey)
- Modify: `vitest.config.ts:6` (include)
- Modify: `package.json` (devDependencies)

**Interfaces:**
- Consumes: `isValidIsoDate(date: string): boolean` de `@/lib/dates`, que ya existe.
- Produces: nada que otras tareas consuman. La tarea 2 reusa el archivo de test creado acá.

- [ ] **Step 1: Instalar el entorno de tests de componente**

Dos dependencias de desarrollo, ninguna de runtime:

```bash
pnpm add -D jsdom@27.0.0 @testing-library/react@17.0.0
```

Si `pnpm` resuelve otras versiones compatibles, está bien: lo que importa es que sean `devDependencies`.

- [ ] **Step 2: Hacer que Vitest levante los `.tsx`**

En `vitest.config.ts`, la línea 6 dice hoy:

```ts
    include: ["src/**/*.test.ts"],
```

Reemplazarla por:

```ts
    // También `.tsx`: los tests de componente viven al lado del componente,
    // y un componente es un `.tsx`. El entorno de cada uno lo declara el
    // propio archivo con `// @vitest-environment jsdom`, así que la suite
    // sigue corriendo en node por default y no paga jsdom donde no hace falta.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
```

- [ ] **Step 3: Escribir el test que falla**

Crear `src/components/movement-form.test.tsx`:

```tsx
// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { MovementForm } from "@/components/movement-form"

/**
 * Las dos fronteras del framework que no existen fuera del servidor de Next,
 * y nada más. Mismo criterio que `src/server/actions/actions.db.test.ts`:
 * la Server Action importa `@/db/client`, que abre una conexión a Postgres
 * apenas se lo importa; y `useRouter` necesita el router de Next.
 */
vi.mock("@/server/actions/movements", () => ({
  createMovement: async () => ({ ok: true }),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}))

/**
 * Radix (el Select de shadcn) usa dos APIs de puntero que jsdom no implementa.
 * No es un doble de nada nuestro: es rellenar un hueco del entorno.
 */
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.scrollIntoView ??= () => {}

const CATEGORIAS = [
  { id: "cat-1", userId: "u", name: "Supermercado", kind: "expense", archived: false },
]

afterEach(cleanup)

describe("MovementForm", () => {
  it("no revienta cuando se borra la fecha con un importe ya cargado", () => {
    render(<MovementForm kind="expense" categories={CATEGORIAS} suggestedRate={null} />)

    // Con importe cargado, el plan de cuotas se genera en el render.
    fireEvent.change(screen.getByLabelText("Importe"), { target: { value: "1000" } })
    expect(screen.getByLabelText("Importe de la cuota 1 en centavos")).toBeTruthy()

    // Un <input type="date"> devuelve "" mientras la fecha está incompleta.
    // Antes del guard, esto tiraba desde addMonthsClamped y se llevaba puesta
    // la pantalla entera.
    expect(() =>
      fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "" } }),
    ).not.toThrow()

    // Y el plan que ya estaba sigue en pantalla: no se pierde lo tipeado.
    expect(screen.getByLabelText("Importe de la cuota 1 en centavos")).toBeTruthy()
  })

  it("regenera el plan cuando la fecha vuelve a ser válida", () => {
    render(<MovementForm kind="expense" categories={CATEGORIAS} suggestedRate={null} />)

    fireEvent.change(screen.getByLabelText("Importe"), { target: { value: "1000" } })
    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "" } })
    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2026-03-31" } })

    const vencimiento = screen.getByLabelText("Vencimiento de la cuota 1") as HTMLInputElement
    expect(vencimiento.value).toBe("2026-03-31")
  })
})
```

- [ ] **Step 4: Correr el test para verlo fallar**

```bash
pnpm test -- movement-form
```

Esperado: FAIL. El primer caso rompe con `La fecha debe ser un día real en formato YYYY-MM-DD, no ""`.

Si en cambio falla con un error de transformación de JSX (`Unexpected token '<'`), agregar el plugin de React de Vite y volver a correr:

```bash
pnpm add -D @vitejs/plugin-react@6.0.0
```

y en `vitest.config.ts`, arriba de `test:`:

```ts
import react from "@vitejs/plugin-react"
// ...
export default defineConfig({
  plugins: [react()],
  test: { /* ... */ },
```

- [ ] **Step 5: Escribir el guard**

En `src/components/movement-form.tsx`, línea 18, el import dice hoy:

```tsx
import { todayInAr } from "@/lib/dates"
```

Reemplazarlo por:

```tsx
import { isValidIsoDate, todayInAr } from "@/lib/dates"
```

Y la línea 53, que dice:

```tsx
  const planKey = totalCents > 0 ? `${totalCents}|${count}|${date}` : null
```

Reemplazarla por:

```tsx
  // `isValidIsoDate` y no sólo `date !== ""`: un <input type="date"> devuelve
  // cadena vacía mientras la fecha está incompleta —el botón de limpiar de
  // Chrome, y cada tecla mientras se tipea a mano—, y `buildInstallments` de
  // acá abajo corre en el cuerpo del render. `addMonthsClamped` tira ante una
  // fecha que no es un día real, así que sin este chequeo borrar la fecha se
  // lleva puesta la pantalla entera.
  const planKey =
    totalCents > 0 && isValidIsoDate(date) ? `${totalCents}|${count}|${date}` : null
```

- [ ] **Step 6: Correr el test para verlo pasar**

```bash
pnpm test -- movement-form
```

Esperado: PASS, 2 tests.

- [ ] **Step 7: Escribir el boundary de error**

Crear `src/app/(app)/error.tsx`:

```tsx
"use client"

import { Button } from "@/components/ui/button"

/**
 * Boundary de error de toda la app. Sin este archivo, cualquier throw —el de
 * un `assert*` ante una fila inesperada, el de una consulta que se cayó—
 * sube al boundary por defecto de Next y deja "Application error" sin ninguna
 * salida. Los asserts de `@/lib/movement-asserts` están hechos para fallar
 * fuerte a propósito; fallar fuerte tiene que terminar en una pantalla que se
 * pueda reintentar, no en una en blanco.
 *
 * El mensaje del error NO se muestra: puede traer detalles de la base. Va a
 * la consola del navegador, que es donde sirve.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  console.error(error)

  return (
    <div className="space-y-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-paper">Algo se rompió</h1>
      <p className="text-fog text-sm">
        No pudimos mostrar esta pantalla. Probá de nuevo; si sigue pasando, recargá la página.
      </p>
      <Button onClick={reset}>Reintentar</Button>
    </div>
  )
}
```

- [ ] **Step 8: Verificar toda la suite y los tipos**

```bash
pnpm test
```

Esperado: 258 tests passed (256 de antes + los 2 nuevos).

```bash
pnpm typecheck
```

Esperado: sin salida.

```bash
pnpm lint
```

Esperado: sin salida.

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts src/components/movement-form.tsx src/components/movement-form.test.tsx "src/app/(app)/error.tsx"
git commit -m "fix(alta): borrar la fecha ya no se lleva puesta la pantalla"
```

---

### Task 2: El techo de cuotas, en los dos lados

El input de cuotas clampa el mínimo (`Math.max(1, …)`) y no el máximo: el `max={120}` es validación de submit, no de tipeo, así que escribir `99999` genera 99.999 filas en el DOM y cuelga la pestaña. Y del lado del servidor `z.array(installmentInput).min(1)` no tiene `.max()`, así que un POST armado a mano inserta esa cantidad de filas en una sola transacción. Es el único endpoint de la app cuyo volumen de escritura lo elige el cliente.

La cota vive en un solo lugar y la importan los dos.

**Files:**
- Modify: `src/lib/schemas.ts:145`
- Modify: `src/components/movement-form.tsx:180-193`
- Modify: `src/lib/schemas.test.ts` (agregar dos casos)
- Modify: `src/components/movement-form.test.tsx` (agregar un caso)

**Interfaces:**
- Produces: `MAX_INSTALLMENTS: 120`, exportado desde `@/lib/schemas`. Lo consumen `movementSchema` y `MovementForm`.

- [ ] **Step 1: Escribir los tests que fallan**

En `src/lib/schemas.test.ts`, agregar dentro del `describe` de `movementSchema` (usar el mismo helper `fieldError` que ya usa el archivo, y el mismo armado de movimiento válido que usan los casos vecinos):

```ts
  it("acepta exactamente 120 cuotas", () => {
    const installments = Array.from({ length: 120 }, (_, i) => ({
      amountCents: i === 119 ? 10_000 - 119 * 83 : 83,
      dueDate: "2026-08-10",
    }))
    const total = installments.reduce((a, i) => a + i.amountCents, 0)

    const result = movementSchema.safeParse({
      kind: "expense",
      description: "Cuotas al límite",
      categoryId: "cat-1",
      date: "2026-08-10",
      currency: "ARS",
      amountCents: String(total / 100),
      rate: "1",
      installments,
    })

    expect(result.success).toBe(true)
  })

  it("rechaza 121 cuotas", () => {
    const installments = Array.from({ length: 121 }, () => ({
      amountCents: 100,
      dueDate: "2026-08-10",
    }))

    const result = movementSchema.safeParse({
      kind: "expense",
      description: "Una cuota de más",
      categoryId: "cat-1",
      date: "2026-08-10",
      currency: "ARS",
      amountCents: "121",
      rate: "1",
      installments,
    })

    expect(result.success).toBe(false)
    expect(fieldError(result, "installments")).toBeDefined()
  })
```

En `src/components/movement-form.test.tsx`, agregar dentro del `describe`:

```tsx
  it("no genera más de 120 filas de cuota aunque se tipee un número enorme", () => {
    render(<MovementForm kind="expense" categories={CATEGORIAS} suggestedRate={null} />)

    fireEvent.change(screen.getByLabelText("Importe"), { target: { value: "1000" } })
    fireEvent.change(screen.getByLabelText("Cuotas"), { target: { value: "99999" } })

    // El clamp es del estado, no del atributo `max` del input: `max` sólo
    // valida al hacer submit, y para entonces las 99.999 filas ya se pintaron.
    expect(screen.queryByLabelText("Importe de la cuota 121 en centavos")).toBeNull()
    expect(screen.getByLabelText("Importe de la cuota 120 en centavos")).toBeTruthy()
  })
```

- [ ] **Step 2: Correr los tests para verlos fallar**

```bash
pnpm test -- schemas movement-form
```

Esperado: FAIL. El de 121 cuotas falla con `expected false to be true` en el `success` invertido; el del formulario falla porque sí encuentra la fila 121.

- [ ] **Step 3: Poner la cota en el esquema**

En `src/lib/schemas.ts`, arriba de `installmentInput` (línea 126), agregar:

```ts
/**
 * Techo de cuotas de un movimiento. La cota no es de negocio: es de volumen.
 * Cada cuota es una fila que se inserta en la misma transacción, y la cantidad
 * la elige el cliente. Sin techo, un POST armado a mano escribe las filas que
 * quiera. 120 son diez años de cuotas mensuales, más de lo que cualquier plan
 * real necesita.
 *
 * Vive acá y no en el formulario porque los dos lados tienen que usar el mismo
 * número: el `max` del input y este `.max()` son la misma regla.
 */
export const MAX_INSTALLMENTS = 120
```

Y reemplazar la línea 145, que dice:

```ts
    installments: z.array(installmentInput).min(1, "Tiene que haber al menos una cuota."),
```

por:

```ts
    installments: z
      .array(installmentInput)
      .min(1, "Tiene que haber al menos una cuota.")
      .max(MAX_INSTALLMENTS, `No se pueden cargar más de ${MAX_INSTALLMENTS} cuotas.`),
```

- [ ] **Step 4: Clampar el estado del formulario**

En `src/components/movement-form.tsx`, agregar al import de schemas (si no existe, crearlo debajo del import de `@/lib/money`):

```tsx
import { MAX_INSTALLMENTS } from "@/lib/schemas"
```

Y reemplazar el bloque de las líneas 180-193, que dice hoy:

```tsx
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
```

por:

```tsx
      {kind === "expense" && (
        <div className="space-y-1">
          <Label htmlFor="count">Cuotas</Label>
          <Input
            id="count"
            type="number"
            min={1}
            max={MAX_INSTALLMENTS}
            value={count}
            // El clamp va en el estado, no sólo en el atributo `max`: `max`
            // valida al hacer submit, y las filas se generan al tipear. Sin
            // esto, escribir 99999 pinta 99.999 filas y cuelga la pestaña
            // antes de que haya un submit que validar.
            onChange={(e) =>
              setCount(Math.min(MAX_INSTALLMENTS, Math.max(1, Number(e.target.value) || 1)))
            }
            className="w-24"
          />
        </div>
      )}
```

- [ ] **Step 5: Correr los tests para verlos pasar**

```bash
pnpm test
```

Esperado: 261 tests passed.

```bash
pnpm typecheck && pnpm lint
```

Esperado: sin salida.

- [ ] **Step 6: Commit**

```bash
git add src/lib/schemas.ts src/lib/schemas.test.ts src/components/movement-form.tsx src/components/movement-form.test.tsx
git commit -m "fix(cuotas): la cantidad de cuotas tiene techo en el form y en el esquema"
```

---

### Task 3: Una sola lectura de sesión y de ajustes por request

`(app)/layout.tsx` llama `requireSettings()` y cada página también. Ninguna de las dos está memoizada, así que por cada carga corren dos `auth.api.getSession()` y dos `getSettings()`, cada uno con su transacción de `withUser` (BEGIN + `set_config` + `SET LOCAL ROLE` + query + COMMIT). La mitad del tráfico del dashboard contra Supabase es duplicado puro.

`cache` de React es la respuesta de la plataforma a esto: memoiza por request, sin tocar a ningún llamador. Fuera de un render de React —los tests— la función se llama directo, sin memo, así que la suite de base no cambia.

**Files:**
- Modify: `src/server/session.ts:1-12`
- Modify: `src/server/queries.ts:1-20`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `getOptionalUser` y `getSettings` conservan exactamente la misma firma y el mismo tipo de retorno. Ningún llamador cambia.

- [ ] **Step 1: Memoizar la lectura de sesión**

En `src/server/session.ts`, reemplazar las líneas 1 a 12, que dicen hoy:

```ts
import "server-only"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { auth } from "@/auth"
import { getSettings } from "@/server/queries"

export async function getOptionalUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user ?? null
}
```

por:

```ts
import "server-only"

import { cache } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { auth } from "@/auth"
import { getSettings } from "@/server/queries"

/**
 * `cache` de React, no un memo propio: memoiza por REQUEST, que es la vida útil
 * que corresponde a una sesión. Hace falta porque el layout de (app) y cada
 * página llaman las dos a `requireSettings()`, así que sin esto cada carga lee
 * la sesión dos veces —y cada lectura es un viaje a la base—.
 *
 * Fuera de un render de React (los tests) no hay caché instalada y la función
 * se llama directo, sin memo: la suite no cambia de comportamiento.
 */
export const getOptionalUser = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user ?? null
})
```

- [ ] **Step 2: Memoizar la lectura de ajustes**

En `src/server/queries.ts`, agregar al principio del archivo, después de `import "server-only"`:

```ts
import { cache } from "react"
```

Y reemplazar las líneas 15 a 20, que dicen hoy:

```ts
export async function getSettings(userId: string): Promise<Settings | null> {
  const rows = await withUser(userId, (tx) =>
    tx.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
  )
  return rows[0] ?? null
}
```

por:

```ts
/**
 * Memoizada por request, mismo motivo que `getOptionalUser` (@/server/session):
 * `requireSettings()` la llama desde el layout de (app) y otra vez desde cada
 * página, y cada llamada abre su propia transacción. Es la única consulta de la
 * app que se repite tal cual dentro del mismo request.
 */
export const getSettings = cache(async (userId: string): Promise<Settings | null> => {
  const rows = await withUser(userId, (tx) =>
    tx.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
  )
  return rows[0] ?? null
})
```

- [ ] **Step 3: Verificar que nada se rompió**

```bash
pnpm typecheck
```

Esperado: sin salida. Si `cache()` hubiera cambiado la firma, `requireSettings()` y `onboarding/page.tsx` fallarían acá.

```bash
pnpm test
```

Esperado: 261 tests passed.

```bash
pnpm test:db
```

Esperado: todo verde. Este es el paso que importa: `queries.db.test.ts` llama `getSettings` fuera de un render de React, así que confirma que la función memoizada sigue pegándole a la base. Si no hay `.env.local` con una base disponible, anotarlo y seguir.

- [ ] **Step 4: Commit**

```bash
git add src/server/session.ts src/server/queries.ts
git commit -m "perf: la sesión y los ajustes se leen una sola vez por request"
```

---

### Task 4: El armado del dashboard, afuera de la página y testeado

`dashboard/page.tsx` tiene ~120 líneas de armado de datos —consolidación, estados, filtros de mes, conversión a pesos— mezcladas con el JSX. No es pintar: es lógica, y es la única lógica de la app sin un solo test. Se extrae a una función pura.

En la misma tarea se arreglan dos cosas que sólo se ven cuando el armado está aislado:

1. **El corte del saldo inicial en "Cobrado y pagado este mes".** `computeBalances` descarta lo pagado antes de `initialBalanceDate`; la tarjeta del mes no. Con un saldo inicial fechado a mitad de mes, un pago anterior aparece en la tarjeta y no está en el saldo.
2. **El estado de los enlaces de "Vencimientos" se deriva de las cuotas pendientes**, no de la lista completa de movimientos. Es estrictamente equivalente —un movimiento que aparece en `pending` tiene al menos una cuota impaga, así que nunca es "paid", y *todas* sus cuotas impagas están en `pending`— y es lo que hace posible la tarea 5.

**Files:**
- Create: `src/lib/dashboard-view.ts`
- Create: `src/lib/dashboard-view.test.ts`
- Modify: `src/app/(app)/dashboard/page.tsx` (reescritura completa)

**Interfaces:**
- Consumes: `computeBalances` (`@/lib/balance`), `monthlyTotals` / `projectBalance` / `projectionStartArsCents` / `spendByCategory` (`@/lib/dashboard`), `addMonthsClamped` / `isOverdue` / `monthKey` (`@/lib/dates`), `convertToArs` (`@/lib/money`), los tres `assert*` (`@/lib/movement-asserts`), `MovementStatus` (`@/lib/movement-status`).
- Produces: `buildDashboardView(input: DashboardInput): DashboardView`, y los tipos `DashboardInput`, `DashboardView`, `UpcomingItem`, `PaidRow`, `ExchangeRow`, `PendingRow`, `MovementRow`. La tarea 5 modifica el llamador, no la firma.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/dashboard-view.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { buildDashboardView, type DashboardInput } from "@/lib/dashboard-view"

const BASE: DashboardInput = {
  today: "2026-08-10",
  settings: {
    initialBalanceArsCents: 100_000,
    initialBalanceUsdCents: 0,
    initialBalanceDate: "2026-08-05",
  },
  todayRate: 1_500,
  paid: [],
  exchanges: [],
  pending: [],
  movements: [],
  expenseCategories: [],
  horizonMonths: 6,
  historyMonths: 12,
}

describe("buildDashboardView", () => {
  it("no cuenta en el mes lo pagado antes del saldo inicial", () => {
    const view = buildDashboardView({
      ...BASE,
      paid: [
        // Anterior al saldo inicial: ya está adentro de esos $1.000, contarlo
        // acá lo contaría dos veces.
        { paidDate: "2026-08-01", amountCents: 50_000, currency: "ARS", kind: "income", rate: "1" },
        // Posterior: sí cuenta.
        { paidDate: "2026-08-07", amountCents: 20_000, currency: "ARS", kind: "income", rate: "1" },
      ],
    })

    expect(view.monthIncomeArsCents).toBe(20_000)
    // Y coincide con lo que el saldo hizo con las mismas dos filas.
    expect(view.arsCents).toBe(100_000 + 20_000)
  })

  it("marca vencido el movimiento entero, no sólo la cuota que venció", () => {
    const view = buildDashboardView({
      ...BASE,
      pending: [
        {
          id: "ins-1",
          number: 1,
          dueDate: "2026-08-01",
          amountCents: 10_000,
          movementId: "mov-1",
          description: "Televisor",
          currency: "ARS",
          rate: "1",
          kind: "expense",
        },
        {
          id: "ins-2",
          number: 2,
          dueDate: "2026-09-01",
          amountCents: 10_000,
          movementId: "mov-1",
          description: "Televisor",
          currency: "ARS",
          rate: "1",
          kind: "expense",
        },
      ],
    })

    // La cuota 2 todavía no venció, pero su movimiento sí: el enlace tiene que
    // llevar a la lista donde el movimiento aparece, o deja al usuario en una
    // lista vacía.
    expect(view.upcoming.map((u) => u.status)).toEqual(["overdue", "overdue"])
  })

  it("consolida la tenencia en dólares al TC de venta", () => {
    const view = buildDashboardView({
      ...BASE,
      settings: { ...BASE.settings, initialBalanceUsdCents: 10_000 },
      todayRate: 1_500,
    })

    // 100 dólares a 1500 son 150.000 pesos, más los 1.000 de saldo en pesos.
    expect(view.consolidatedArsCents).toBe(100_000 + 15_000_000)
  })

  it("deja la proyección en null cuando hay dólares y no hay cotización", () => {
    const view = buildDashboardView({
      ...BASE,
      settings: { ...BASE.settings, initialBalanceUsdCents: 10_000 },
      todayRate: null,
    })

    expect(view.projection).toBeNull()
    expect(view.consolidatedArsCents).toBeNull()
  })
})
```

- [ ] **Step 2: Correr el test para verlo fallar**

```bash
pnpm test -- dashboard-view
```

Esperado: FAIL con `Failed to resolve import "@/lib/dashboard-view"`.

- [ ] **Step 3: Escribir el armador**

Crear `src/lib/dashboard-view.ts`:

```ts
import { computeBalances } from "@/lib/balance"
import {
  monthlyTotals,
  projectBalance,
  projectionStartArsCents,
  spendByCategory,
} from "@/lib/dashboard"
import { addMonthsClamped, isOverdue, monthKey, type IsoDate } from "@/lib/dates"
import { convertToArs } from "@/lib/money"
import {
  assertCurrency,
  assertExchangeDirection,
  assertInstallmentMovementKind,
} from "@/lib/movement-asserts"
import type { MovementStatus } from "@/lib/movement-status"

/**
 * Todo el armado de datos del dashboard, sin tocar la base ni React. La página
 * queda de orquestadora: trae las filas, llama acá, pinta lo que sale.
 *
 * Vive separada por el mismo motivo que `buildUsdPositionEvents` (@/lib/position)
 * se separó de `listUsdPositionEvents`: es la parte que tiene reglas y que se
 * puede probar con filas armadas a mano, en milisegundos y sin red.
 *
 * Las filas entran CRUDAS, tal como salen de Drizzle: `rate` es el `numeric` de
 * Postgres, o sea string, y `kind`/`currency`/`direction` son `text`, o sea
 * string. La conversión y los asserts pasan una sola vez, acá adentro.
 */

/** Cuota pagada, del join con su movimiento. */
export type PaidRow = {
  paidDate: string | null
  amountCents: number
  currency: string
  kind: string
  rate: string
}

/** Movimiento de tipo exchange. */
export type ExchangeRow = {
  date: IsoDate
  amountCents: number
  rate: string
  direction: string | null
}

/** Cuota impaga, del join con su movimiento. */
export type PendingRow = {
  id: string
  number: number
  dueDate: IsoDate
  amountCents: number
  movementId: string
  description: string
  currency: string
  rate: string
  kind: string
}

/**
 * Movimiento, sin sus cuotas: el armado ya no las necesita. El estado de cada
 * enlace sale de `pending`, que es la lista completa de cuotas impagas.
 */
export type MovementRow = {
  id: string
  date: IsoDate
  kind: string
  categoryId: string | null
  currency: string
  amountCents: number
  rate: string
}

export type DashboardInput = {
  today: IsoDate
  settings: {
    initialBalanceArsCents: number
    initialBalanceUsdCents: number
    initialBalanceDate: IsoDate
  }
  /** TC de VENTA del día, o null si la API de terceros no respondió. */
  todayRate: number | null
  paid: PaidRow[]
  exchanges: ExchangeRow[]
  pending: PendingRow[]
  movements: MovementRow[]
  expenseCategories: { id: string; name: string }[]
  horizonMonths: number
  historyMonths: number
}

export type UpcomingItem = {
  id: string
  number: number
  dueDate: IsoDate
  amountCents: number
  description: string
  currency: "ARS" | "USD"
  kind: "income" | "expense"
  /** Estado del MOVIMIENTO entero, no de esta cuota. */
  status: MovementStatus
}

export type DashboardView = {
  arsCents: number
  usdCents: number
  consolidatedArsCents: number | null
  monthIncomeArsCents: number
  monthExpenseArsCents: number
  projection: { month: string; arsCents: number }[] | null
  upcoming: UpcomingItem[]
  pie: { name: string; arsCents: number }[]
  bars: { month: string; incomeArsCents: number; expenseArsCents: number }[]
  todayRate: number | null
}

/** Cuántos vencimientos entran en la tarjeta antes de que sea una lista y no un aviso. */
const MAX_UPCOMING = 20

export function buildDashboardView(input: DashboardInput): DashboardView {
  const { today, settings, todayRate } = input

  // Todo lo que no sea ARS se consolida con el rate del propio movimiento.
  const toArs = (cents: number, currency: string, movementRate: string) =>
    currency === "ARS" ? cents : convertToArs(cents, Number(movementRate))

  const balances = computeBalances(
    {
      initialArsCents: settings.initialBalanceArsCents,
      initialUsdCents: settings.initialBalanceUsdCents,
      initialDate: settings.initialBalanceDate,
    },
    input.paid.map((p) => ({
      // `paid_date` no puede ser nulo con `paid = true`: lo garantiza la CHECK
      // `installment_paid_date_required_when_paid` (migración 0009), no este `!`.
      paidDate: p.paidDate!,
      currency: assertCurrency(p.currency),
      kind: assertInstallmentMovementKind(p.kind),
      amountCents: p.amountCents,
    })),
    input.exchanges.map((e) => ({
      date: e.date,
      direction: assertExchangeDirection(e.direction),
      usdCents: e.amountCents,
      rate: Number(e.rate),
    })),
  )

  // El consolidado valúa la tenencia en dólares al TC de VENTA: lo que se
  // recibiría si se vendieran hoy, el lado conservador.
  const consolidatedArsCents =
    todayRate === null ? null : balances.arsCents + convertToArs(balances.usdCents, todayRate)

  const thisMonth = monthKey(today)

  // El MISMO corte que hace `computeBalances`, y por el mismo motivo: lo pagado
  // antes del saldo inicial ya está adentro de ese saldo. Sin este filtro, con
  // un saldo inicial fechado a mitad de mes la tarjeta mostraba un cobro que el
  // saldo de al lado no tenía en cuenta.
  const monthPaid = input.paid.filter(
    (p) => p.paidDate! >= settings.initialBalanceDate && monthKey(p.paidDate!) === thisMonth,
  )

  const projectionStart = projectionStartArsCents(balances, todayRate)
  const projection =
    projectionStart === null
      ? null
      : projectBalance(
          projectionStart,
          input.pending.map((p) => ({
            dueDate: p.dueDate,
            arsCents: toArs(p.amountCents, p.currency, p.rate),
            kind: assertInstallmentMovementKind(p.kind),
          })),
          input.horizonMonths,
          today,
        )

  /*
   * El estado del enlace se deriva del MOVIMIENTO entero, no de la cuota de la
   * fila: es el mismo criterio que usa el filtro de /ingresos y /egresos. Un
   * movimiento con una cuota atrasada y otra por vencer es "overdue" completo,
   * así que la fila de la cuota que todavía no venció también tiene que llevar
   * a esa lista — si no, el enlace deja al usuario en una lista donde el
   * movimiento que venía a ver no está.
   *
   * Sale de `pending` y no de la lista de movimientos, y da exactamente lo
   * mismo que `getMovementStatus`: un movimiento que aparece acá tiene al menos
   * una cuota impaga, así que nunca es "paid"; y TODAS sus cuotas impagas están
   * en esta lista, así que "hay alguna vencida" se responde sin mirar nada más.
   * Es lo que permite que la página deje de traerse la historia entera.
   */
  const overdueMovements = new Set(
    input.pending.filter((p) => isOverdue(p.dueDate, today)).map((p) => p.movementId),
  )

  // Vencimientos: lo atrasado más lo que vence dentro de un mes.
  const limit = addMonthsClamped(today, 1)
  const upcoming: UpcomingItem[] = input.pending
    .filter((p) => p.dueDate <= limit)
    .slice(0, MAX_UPCOMING)
    .map((p) => ({
      id: p.id,
      number: p.number,
      dueDate: p.dueDate,
      amountCents: p.amountCents,
      description: p.description,
      currency: assertCurrency(p.currency),
      kind: assertInstallmentMovementKind(p.kind),
      status: overdueMovements.has(p.movementId) ? "overdue" : "pending",
    }))

  const pie = spendByCategory(
    input.movements
      .filter((m) => m.kind === "expense" && monthKey(m.date) === thisMonth)
      .map((m) => ({
        categoryId: m.categoryId,
        arsCents: toArs(m.amountCents, m.currency, m.rate),
      })),
    input.expenseCategories,
  )

  const bars = monthlyTotals(
    input.movements
      .filter((m) => m.kind !== "exchange")
      .map((m) => ({
        date: m.date,
        kind: assertInstallmentMovementKind(m.kind),
        arsCents: toArs(m.amountCents, m.currency, m.rate),
      })),
    input.historyMonths,
    today,
  )

  return {
    arsCents: balances.arsCents,
    usdCents: balances.usdCents,
    consolidatedArsCents,
    monthIncomeArsCents: monthPaid
      .filter((p) => p.kind === "income")
      .reduce((a, p) => a + toArs(p.amountCents, p.currency, p.rate), 0),
    monthExpenseArsCents: monthPaid
      .filter((p) => p.kind === "expense")
      .reduce((a, p) => a + toArs(p.amountCents, p.currency, p.rate), 0),
    projection,
    upcoming,
    pie,
    bars,
    todayRate,
  }
}
```

- [ ] **Step 4: Correr el test para verlo pasar**

```bash
pnpm test -- dashboard-view
```

Esperado: PASS, 4 tests.

- [ ] **Step 5: Dejar la página como orquestadora**

Reemplazar el contenido completo de `src/app/(app)/dashboard/page.tsx` por:

```tsx
import { BalanceCards } from "@/components/dashboard/balance-cards"
import { CategoryPie, MonthlyBars, ProjectionChart } from "@/components/dashboard/charts"
import { Upcoming } from "@/components/dashboard/upcoming"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { buildDashboardView } from "@/lib/dashboard-view"
import { todayInAr } from "@/lib/dates"
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

export default async function DashboardPage() {
  const { user, settings } = await requireSettings()
  const today = todayInAr()

  const [paid, exchanges, pending, movements, expenseCategories, rate] = await Promise.all([
    listPaidInstallments(user.id),
    listExchanges(user.id),
    listPendingInstallments(user.id),
    listMovements(user.id),
    // "expense" + archivadas incluidas: la torta de egresos por categoría
    // tiene que poder resolver el nombre de un movimiento viejo cuya
    // categoría ya se archivó.
    listCategories(user.id, "expense", true),
    fetchSuggestedRate(settings.preferredRate as RatePreference),
  ])

  // Todo el armado vive en @/lib/dashboard-view, que es puro y está testeado.
  // Acá sólo se traen las filas y se pinta lo que sale.
  const view = buildDashboardView({
    today,
    settings: {
      initialBalanceArsCents: settings.initialBalanceArsCents,
      initialBalanceUsdCents: settings.initialBalanceUsdCents,
      initialBalanceDate: settings.initialBalanceDate,
    },
    // El TC de VENTA: lo que se recibiría si se vendiera hoy la tenencia. No es
    // el mismo que precargan los formularios (referenceRate).
    todayRate: rate?.sellRate ?? null,
    paid,
    exchanges: exchanges.map((e) => ({
      date: e.date,
      amountCents: e.amountCents,
      rate: e.rate,
      direction: e.direction,
    })),
    pending,
    movements: movements.map((m) => ({
      id: m.id,
      date: m.date,
      kind: m.kind,
      categoryId: m.categoryId,
      currency: m.currency,
      amountCents: m.amountCents,
      rate: m.rate,
    })),
    expenseCategories,
    horizonMonths: HORIZON_MONTHS,
    historyMonths: HISTORY_MONTHS,
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-paper">Dashboard</h1>

      <BalanceCards
        arsCents={view.arsCents}
        usdCents={view.usdCents}
        consolidatedArsCents={view.consolidatedArsCents}
        rate={view.todayRate}
        monthIncomeArsCents={view.monthIncomeArsCents}
        monthExpenseArsCents={view.monthExpenseArsCents}
      />

      <Upcoming items={view.upcoming} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Saldo proyectado al cierre de cada mes ({HORIZON_MONTHS} meses)
            </CardTitle>
            <CardDescription className="text-xs">
              Arranca de tu saldo de hoy consolidado en pesos y le va aplicando las cuotas
              pendientes por su vencimiento. El primer punto ya tiene descontado lo que vence
              este mes y lo que está atrasado: no es tu saldo de hoy.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {view.projection === null ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                Hoy no pudimos traer la cotización del dólar, así que no podemos consolidar tu
                saldo en pesos para arrancar la proyección. Probá de nuevo en un rato.
              </p>
            ) : (
              <ProjectionChart data={view.projection} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Gastos que cargaste este mes, por categoría
            </CardTitle>
            <CardDescription className="text-xs">
              Cuenta el importe total de cada gasto en el mes de su fecha, aunque lo pagues en
              cuotas más adelante. Un televisor de $1.200.000 en 12 cuotas entra entero acá, y
              de a una cuota en &ldquo;Cobrado y pagado este mes&rdquo;.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryPie data={view.pie} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Lo que cargaste en los últimos {HISTORY_MONTHS} meses
          </CardTitle>
          <CardDescription className="text-xs">
            Con el mismo criterio que la torta: el importe total de cada movimiento en el mes
            de su fecha, no lo que se pagó o se cobró cada mes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MonthlyBars data={view.bars} />
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 6: Verificar**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Esperado: sin salida en los dos primeros; 265 tests passed en el tercero.

- [ ] **Step 7: Commit**

```bash
git add src/lib/dashboard-view.ts src/lib/dashboard-view.test.ts "src/app/(app)/dashboard/page.tsx"
git commit -m "refactor(dashboard): el armado sale de la página y queda testeado"
```

---

### Task 5: Acotar la historia que trae el dashboard

`listMovements(user.id)` sin filtros trae todos los movimientos de siempre —y `listMovements` además trae todas sus cuotas— para pintar una torta del mes en curso y barras de doce meses. Crece sin techo con la antigüedad de la cuenta.

Antes de la tarea 4 no se podía acotar: `statusByMovement` necesitaba los movimientos viejos con cuotas pendientes. Ahora el estado sale de `pending`, así que la lista de movimientos sólo se usa para la torta y las barras, y los dos miran como mucho doce meses hacia atrás.

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`
- Modify: `src/lib/dashboard-view.test.ts` (agregar un caso)

**Interfaces:**
- Consumes: `MovementFilters` de `@/server/queries`, que ya soporta `from`. No hace falta tocar la consulta.

- [ ] **Step 1: Escribir el test que falla**

En `src/lib/dashboard-view.test.ts`, agregar:

```ts
  it("arma los vencimientos aunque el movimiento no esté en la lista de movimientos", () => {
    // El caso que habilita el corte de fecha de la página: un plan viejo con
    // cuotas que todavía vencen. Su movimiento quedó fuera de los últimos 12
    // meses, y el enlace de la cuota tiene que seguir saliendo bien.
    const view = buildDashboardView({
      ...BASE,
      movements: [],
      pending: [
        {
          id: "ins-1",
          number: 30,
          dueDate: "2026-08-20",
          amountCents: 10_000,
          movementId: "mov-viejo",
          description: "Plan de 2023",
          currency: "ARS",
          rate: "1",
          kind: "expense",
        },
      ],
    })

    expect(view.upcoming).toHaveLength(1)
    expect(view.upcoming[0].status).toBe("pending")
  })
```

- [ ] **Step 2: Correr el test**

```bash
pnpm test -- dashboard-view
```

Esperado: PASS. Este test no falla primero, y está bien que así sea: documenta y protege la propiedad de la que depende el cambio de la página. Es una red, no un rojo.

- [ ] **Step 3: Acotar la consulta**

En `src/app/(app)/dashboard/page.tsx`, cambiar el import de fechas:

```tsx
import { addMonthsClamped, monthKey, todayInAr } from "@/lib/dates"
```

Agregar, justo después de `const today = todayInAr()`:

```tsx
  /*
   * La torta mira el mes en curso y las barras los últimos HISTORY_MONTHS, así
   * que traer la historia entera es traer filas que nadie mira: sin este piso,
   * cada carga del dashboard se lleva todos los movimientos de la cuenta y
   * todas sus cuotas.
   *
   * Los vencimientos NO dependen de esta lista: su estado sale de las cuotas
   * pendientes (ver el comentario de `overdueMovements` en
   * @/lib/dashboard-view), que vienen completas. Un plan de hace tres años con
   * cuotas que todavía vencen sigue apareciendo en "Vencimientos" y sigue
   * enlazando bien, aunque su movimiento quede afuera de acá.
   */
  const historyFrom = `${monthKey(addMonthsClamped(today, -(HISTORY_MONTHS - 1)))}-01`
```

Y cambiar la línea de la consulta:

```tsx
    listMovements(user.id),
```

por:

```tsx
    listMovements(user.id, { from: historyFrom }),
```

- [ ] **Step 4: Verificar**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Esperado: sin salida; 266 tests passed.

- [ ] **Step 5: Verificar a ojo en el navegador**

```bash
pnpm dev
```

Abrir `http://localhost:3100/dashboard` con una cuenta que tenga movimientos. Confirmar que la torta, las barras y los vencimientos siguen mostrando lo mismo que antes del cambio.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/dashboard/page.tsx" src/lib/dashboard-view.test.ts
git commit -m "perf(dashboard): la torta y las barras traen doce meses, no toda la historia"
```

---

### Task 6: `/cambios` no lista operaciones que sus tarjetas ignoran

`cambios/page.tsx` usa `listExchanges` sin piso de fecha, mientras Tenencia, TC promedio y Diferencia de cambio salen de `listUsdPositionEvents`, que sí corta en `initialBalanceDate`. Una operación cargada con fecha anterior al saldo inicial aparece en la lista y no mueve ninguna de las tres tarjetas. `exchangeSchema` no impide esa fecha, así que es alcanzable.

**Files:**
- Modify: `src/server/queries.ts:142-150`
- Modify: `src/app/(app)/cambios/page.tsx:12-16`
- Modify: `src/server/queries.db.test.ts` (agregar un caso)

**Interfaces:**
- Produces: `listExchanges(userId: string, from?: string)`. El segundo parámetro es opcional, así que el llamador del dashboard no cambia.

- [ ] **Step 1: Escribir el test que falla**

No hace falta sembrar nada: el archivo ya tiene `MOV.cambioViejo` (2026-02-20, anterior al saldo inicial), `MOV.cambioBorde` (el día exacto de `SALDO_INICIAL_A`) y `MOV.cambioVenta`. Es exactamente el fixture que hace falta.

En `src/server/queries.db.test.ts`, dentro del `describe("listExchanges")` (línea 824), **debajo** del test que dice `"no aplica el corte de la fecha del saldo inicial"` —ese test se queda como está, porque sigue describiendo el llamado sin argumento que usa el dashboard—, agregar:

```ts
  it("con piso de fecha deja afuera lo anterior a ese día", async () => {
    // El llamado que hace /cambios: el mismo corte que listUsdPositionEvents
    // aplica para las tres tarjetas de esa pantalla.
    const desde = ids(await listExchanges(USUARIO_A, SALDO_INICIAL_A))

    expect(desde).not.toContain(MOV.cambioViejo)
    // El del día exacto SÍ entra: el corte es `>=`, igual que el de
    // listUsdPositionEvents. Un `gt` acá volvería a abrir la brecha entre las
    // dos pantallas que ese otro describe protege.
    expect(desde).toContain(MOV.cambioBorde)
    expect(desde).toContain(MOV.cambioVenta)
  })
```

- [ ] **Step 2: Correr el test para verlo fallar**

```bash
pnpm typecheck
```

Esperado: FAIL con `Expected 1 arguments, but got 2` sobre la llamada nueva. Ese es el rojo: la firma todavía no acepta el piso.

- [ ] **Step 3: Agregar el piso a la consulta**

En `src/server/queries.ts`, reemplazar las líneas 141 a 150, que dicen hoy:

```ts
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

por:

```ts
/**
 * Cambios de divisa, para saldo y posición.
 *
 * `from` es opcional y existe para /cambios: las tres tarjetas de esa pantalla
 * salen de `listUsdPositionEvents`, que corta en `initialBalanceDate`. Sin el
 * mismo corte en la lista, una operación anterior al saldo inicial se veía en
 * la lista sin mover ninguna de las tarjetas de arriba.
 *
 * El dashboard lo llama SIN `from` a propósito: `computeBalances` (@/lib/balance)
 * aplica su propio corte en memoria, y ese corte es el que está testeado.
 */
export async function listExchanges(userId: string, from?: string) {
  return withUser(userId, (tx) => {
    const conditions = [eq(movement.userId, userId), eq(movement.kind, "exchange")]
    if (from) conditions.push(gte(movement.date, from))

    return tx
      .select()
      .from(movement)
      .where(and(...conditions))
      .orderBy(asc(movement.date))
  })
}
```

`gte` ya está importado en la línea 3 del archivo.

- [ ] **Step 4: Usarlo en `/cambios`**

En `src/app/(app)/cambios/page.tsx`, reemplazar la línea 14, que dice:

```tsx
    listExchanges(user.id),
```

por:

```tsx
    // El mismo piso de fecha que usa listUsdPositionEvents para las tres
    // tarjetas de arriba: una operación anterior al saldo inicial no las mueve,
    // así que tampoco tiene que aparecer en la lista de abajo.
    listExchanges(user.id, settings.initialBalanceDate),
```

- [ ] **Step 5: Correr los tests para verlos pasar**

```bash
pnpm typecheck && pnpm test && pnpm test:db -- queries
```

Esperado: sin salida; 266 tests passed; suite de base verde.

- [ ] **Step 6: Commit**

```bash
git add src/server/queries.ts src/server/queries.db.test.ts "src/app/(app)/cambios/page.tsx"
git commit -m "fix(cambios): la lista respeta el mismo piso de fecha que las tarjetas"
```

---

### Task 7: `/ajustes` avisa que guardó

`SettingsForm` sólo reacciona al éxito si le pasan `redirectTo`, y `/ajustes` no se lo pasa. El guardado funciona —`revalidatePath` refresca el árbol— pero el usuario aprieta "Guardar cambios" y no ve nada. Sólo hay feedback en el camino de error.

**Files:**
- Modify: `src/components/settings-form.tsx:112`

- [ ] **Step 1: Agregar el mensaje**

En `src/components/settings-form.tsx`, reemplazar la línea 112, que dice:

```tsx
      {state && !state.ok && <p className="text-destructive text-sm">{state.message}</p>}
```

por:

```tsx
      {state && !state.ok && <p className="text-destructive text-sm">{state.message}</p>}
      {/*
       * En /onboarding el éxito se ve porque la pantalla se va a /dashboard.
       * En /ajustes no hay `redirectTo`, así que sin esto guardar no producía
       * ninguna señal: el único feedback del formulario era el de error.
       */}
      {state?.ok && !redirectTo && (
        <p className="text-pulse-green text-sm" role="status">
          Guardado.
        </p>
      )}
```

- [ ] **Step 2: Verificar a ojo**

```bash
pnpm dev
```

Abrir `http://localhost:3100/ajustes`, cambiar el dólar de referencia, guardar. Esperado: aparece "Guardado." en verde debajo del select. Volver a `/onboarding` con una cuenta nueva: ahí el mensaje **no** tiene que aparecer, porque la pantalla se va al dashboard.

- [ ] **Step 3: Verificar tipos y lint**

```bash
pnpm typecheck && pnpm lint
```

Esperado: sin salida.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings-form.tsx
git commit -m "fix(ajustes): guardar avisa que guardó"
```

---

### Task 8: Cuotas que no se bloquean entre sí, y un solo reloj

Dos arreglos en el mismo archivo:

1. `InstallmentRows` usa un único `useTransition` para toda la lista, así que mientras una cuota va en vuelo los botones de todas las demás quedan muertos. En `Upcoming` son hasta 20 filas.
2. `todayInAr()` se llama en el cliente. El resultado es correcto en cualquier zona horaria —el `Intl` fija Buenos Aires— pero se evalúa en dos relojes distintos: alrededor de medianoche AR el servidor renderiza un día y el cliente hidrata con otro, y el badge "vencida" aparece o desaparece solo. `today` ya viaja desde `MovementScreen`; falta un nivel más.

**Files:**
- Modify: `src/components/installment-rows.tsx`
- Modify: `src/components/movement-list.tsx:65`
- Modify: `src/components/dashboard/upcoming.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx` (pasar `today` a `Upcoming`)

**Interfaces:**
- Produces: `InstallmentRows` pasa a recibir `today: IsoDate` como prop obligatoria. `Upcoming` también.

- [ ] **Step 1: Reescribir `InstallmentRows`**

Reemplazar el contenido completo de `src/components/installment-rows.tsx` por:

```tsx
"use client"

import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { isOverdue, type IsoDate } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { setInstallmentPaid } from "@/server/actions/movements"

type Row = {
  id: string
  number: number
  dueDate: string
  amountCents: number
  paid: boolean
}

/**
 * `today` llega como prop y no se calcula acá: este es un componente cliente,
 * y `todayInAr()` evaluado en el navegador puede dar un día distinto al que
 * usó el servidor para el mismo render. Alrededor de medianoche eso es un
 * mismatch de hidratación y un badge "vencida" que aparece o desaparece solo.
 * El servidor ya tiene la fecha; se pasa.
 */
export function InstallmentRows({
  rows,
  currency,
  today,
}: {
  rows: Row[]
  currency: "ARS" | "USD"
  today: IsoDate
}) {
  const [, startTransition] = useTransition()
  // El id en vuelo, no un booleano de la lista entera: con un flag compartido,
  // marcar una cuota dejaba muertos los botones de las otras 19.
  const [enVuelo, setEnVuelo] = useState<string | null>(null)
  const [error, setError] = useState<{ id: string; message: string } | null>(null)

  function handleToggle(row: Row) {
    setError(null)
    setEnVuelo(row.id)
    startTransition(async () => {
      const result = await setInstallmentPaid(row.id, !row.paid)
      setEnVuelo(null)
      if (!result.ok) {
        setError({ id: row.id, message: result.message })
      }
    })
  }

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
          <span className="flex flex-col items-end gap-1">
            <span className="flex items-center gap-2">
              <span className="tabular-nums">{formatMoney(row.amountCents, currency)}</span>
              <Button
                type="button"
                size="sm"
                variant={row.paid ? "secondary" : "outline"}
                disabled={enVuelo === row.id}
                onClick={() => handleToggle(row)}
              >
                {row.paid ? "Pagada" : "Marcar pagada"}
              </Button>
            </span>
            {error?.id === row.id && <p className="text-destructive text-xs">{error.message}</p>}
          </span>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 2: Pasar `today` desde `MovementList`**

En `src/components/movement-list.tsx`, reemplazar la línea 65, que dice:

```tsx
              <InstallmentRows rows={m.installments} currency={currency} />
```

por:

```tsx
              <InstallmentRows rows={m.installments} currency={currency} today={today} />
```

- [ ] **Step 3: Pasar `today` desde `Upcoming`**

En `src/components/dashboard/upcoming.tsx`, cambiar la firma y el uso. Reemplazar la línea 20:

```tsx
export function Upcoming({ items }: { items: Item[] }) {
```

por:

```tsx
export function Upcoming({ items, today }: { items: Item[]; today: IsoDate }) {
```

Agregar el import del tipo, debajo del import de `Link`:

```tsx
import type { IsoDate } from "@/lib/dates"
```

Y reemplazar las líneas 48-51:

```tsx
                  <InstallmentRows
                    rows={[{ ...item, paid: false }]}
                    currency={item.currency}
                  />
```

por:

```tsx
                  <InstallmentRows
                    rows={[{ ...item, paid: false }]}
                    currency={item.currency}
                    today={today}
                  />
```

- [ ] **Step 4: Pasarlo desde el dashboard**

En `src/app/(app)/dashboard/page.tsx`, reemplazar:

```tsx
      <Upcoming items={view.upcoming} />
```

por:

```tsx
      <Upcoming items={view.upcoming} today={today} />
```

- [ ] **Step 5: Quitar el reloj del formulario de alta**

`movement-form.tsx` usa `todayInAr()` para el valor inicial de la fecha y del primer vencimiento. Es un valor inicial de un campo editable, no un cálculo de estado, así que un día de diferencia no rompe ninguna cuenta — pero sí es el mismo mismatch de hidratación. Reemplazar en `src/components/movement-form.tsx` las líneas 39 y 41:

```tsx
  const [date, setDate] = useState(todayInAr())
  const [count, setCount] = useState(1)
  const [rows, setRows] = useState<Row[]>([{ amount: "", dueDate: todayInAr() }])
```

por:

```tsx
  const [date, setDate] = useState(today)
  const [count, setCount] = useState(1)
  const [rows, setRows] = useState<Row[]>([{ amount: "", dueDate: today }])
```

Agregar `today: IsoDate` al tipo `Props` (línea 24-29):

```tsx
type Props = {
  kind: "income" | "expense"
  categories: Category[]
  /** Cotización sugerida. null cuando dolarapi no respondió: se tipea a mano. */
  suggestedRate: number | null
  /** Hoy según el reloj de Buenos Aires, calculado en el servidor. */
  today: IsoDate
}
```

Y a la desestructuración de la línea 33:

```tsx
export function MovementForm({ kind, categories, suggestedRate, today }: Props) {
```

Ajustar los imports: sacar `todayInAr` y agregar el tipo.

```tsx
import { isValidIsoDate, type IsoDate } from "@/lib/dates"
```

En `src/components/movement-screen.tsx`, pasarlo (línea 59-63):

```tsx
      <MovementForm
        kind={kind}
        categories={activeCategories}
        suggestedRate={rate?.referenceRate ?? null}
        today={today}
      />
```

Y en `src/components/movement-form.test.tsx`, agregar `today="2026-08-10"` a las tres llamadas a `render`.

- [ ] **Step 6: Verificar**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Esperado: sin salida; 266 tests passed. Si el typecheck se queja de un `InstallmentRows` sin `today`, es un llamador que faltó: buscarlo con `grep -rn "InstallmentRows" src`.

- [ ] **Step 7: Verificar a ojo**

```bash
pnpm dev
```

Abrir `/egresos` con al menos dos movimientos con cuotas impagas, desplegar los dos, y marcar una cuota pagada. Esperado: sólo ese botón queda deshabilitado mientras la acción está en vuelo; los de las otras filas siguen andando.

- [ ] **Step 8: Commit**

```bash
git add src/components/installment-rows.tsx src/components/movement-list.tsx src/components/dashboard/upcoming.tsx src/components/movement-form.tsx src/components/movement-form.test.tsx src/components/movement-screen.tsx "src/app/(app)/dashboard/page.tsx"
git commit -m "fix(cuotas): marcar una cuota no bloquea el resto, y hoy lo calcula el servidor"
```

---

### Task 9: El alta de ajustes, a prueba de carrera

`saveSettings` hace select-después-insert. Dos submits simultáneos del onboarding: ambos leen vacío, ambos insertan, el segundo choca contra la PK, la transacción entera vuelve atrás y el usuario ve "No pudimos guardar los ajustes" aunque sus ajustes quedaron guardados por el otro request. Se recupera recargando, pero el mensaje miente.

**Files:**
- Modify: `src/server/actions/settings.ts:41-66`
- Modify: `src/server/actions/actions.db.test.ts` (agregar un caso)

- [ ] **Step 1: Sembrar un usuario propio para el caso**

`USUARIO_NUEVO` no sirve: los dos tests que ya existen en `describe("saveSettings")` lo dejan con ajustes y con categorías, y el caso de carrera necesita arrancar en cero. Va un cuarto usuario.

En `src/server/actions/actions.db.test.ts`, junto a las otras constantes de usuario (líneas 48-60), agregar:

```ts
/**
 * Otro recién llegado, aparte de USUARIO_NUEVO: el caso de carrera necesita
 * arrancar sin ajustes y sin categorías, y los dos tests de onboarding que ya
 * están dejan a USUARIO_NUEVO con las dos cosas.
 */
const USUARIO_CARRERA = "actions-test-carrera"
```

Y agregarlo a la lista de sembrados (línea 82):

```ts
const USUARIOS_SEMBRADOS = [USUARIO_A, USUARIO_B, USUARIO_NUEVO, USUARIO_CARRERA]
```

`USUARIOS_A_LIMPIAR` se arma a partir de `USUARIOS_SEMBRADOS`, así que la limpieza lo toma solo.

- [ ] **Step 2: Escribir el test que falla**

En el mismo archivo, dentro del `describe("saveSettings")` (línea 1420), agregar:

```ts
  it("dos altas simultáneas del mismo usuario terminan las dos en ok", async () => {
    comoUsuario(USUARIO_CARRERA)
    expect(await categoriasDe(USUARIO_CARRERA)).toEqual([])

    // Dos clics en "Listo, empezar". Los dos requests hacen su SELECT antes de
    // que el otro haya insertado, así que los dos toman la rama del alta.
    const [a, b] = await Promise.all([
      saveSettings(null, formulario(AJUSTES_VALIDOS)),
      saveSettings(null, formulario(AJUSTES_VALIDOS)),
    ])

    expect(a).toEqual({ ok: true })
    expect(b).toEqual({ ok: true })

    // Y las categorías por default quedaron sembradas UNA sola vez.
    expect(await categoriasDe(USUARIO_CARRERA)).toHaveLength(DEFAULT_CATEGORIES.length)
  })
```

`AJUSTES_VALIDOS`, `formulario`, `comoUsuario` y `categoriasDe` ya existen en el archivo.

- [ ] **Step 3: Correr el test para verlo fallar**

```bash
pnpm test:db -- actions
```

Esperado: FAIL. Uno de los dos resultados viene con `ok: false`, o las categorías salen duplicadas.

- [ ] **Step 4: Hacer el alta idempotente**

En `src/server/actions/settings.ts`, reemplazar el bloque de las líneas 41 a 66, que dice hoy:

```ts
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
```

por:

```ts
  try {
    await withUser(user.id, async (tx) => {
      const existing = await tx
        .select({ userId: userSettings.userId })
        .from(userSettings)
        .where(eq(userSettings.userId, user.id))
        .limit(1)

      // `onConflictDoUpdate` en vez de ramificar entre INSERT y UPDATE: entre
      // el SELECT de arriba y esta línea puede colarse otro request del mismo
      // usuario (dos clics en "Listo, empezar"). Con el INSERT pelado, el
      // segundo chocaba contra la PK, la transacción entera volvía atrás y el
      // usuario veía "no pudimos guardar" con los ajustes ya guardados.
      await tx
        .insert(userSettings)
        .values({ userId: user.id, ...values })
        .onConflictDoUpdate({ target: userSettings.userId, set: values })

      if (existing.length > 0) return

      // Primera vez: se precargan las categorías para que nadie arranque con
      // una pantalla en blanco.
      //
      // `onConflictDoNothing` por la misma carrera: si el otro request ya las
      // sembró, el índice único parcial (category_active_unique) las rechaza
      // una por una en vez de tumbar la transacción. NO se llega acá en un
      // guardado desde /ajustes —`existing` corta antes—, así que archivar una
      // categoría y volver a guardar los ajustes no la resucita.
      await tx
        .insert(category)
        .values(
          DEFAULT_CATEGORIES.map((c) => ({
            id: randomUUID(),
            userId: user.id,
            name: c.name,
            kind: c.kind,
          })),
        )
        .onConflictDoNothing()
    })
  } catch (error) {
```

- [ ] **Step 5: Correr los tests para verlos pasar**

```bash
pnpm typecheck && pnpm test:db -- actions
```

Esperado: sin salida; suite de acciones verde.

- [ ] **Step 6: Commit**

```bash
git add src/server/actions/settings.ts src/server/actions/actions.db.test.ts
git commit -m "fix(ajustes): dos altas simultáneas no dejan un error falso"
```

---

### Task 10: Limpieza — lo que sobra

Cuatro exports que nadie usa, un wrapper con un solo llamador cuya inyección nadie inyecta, y tres entradas que faltan en el `.gitignore`.

**Files:**
- Modify: `src/server/actions/result.ts:13`
- Modify: `src/auth-client.ts:7`
- Modify: `src/lib/schemas.ts:161` y `:175`
- Modify: `src/db/client.ts:64-85`
- Modify: `.gitignore`

- [ ] **Step 1: Borrar los exports muertos**

En `src/server/actions/result.ts`, borrar la última línea:

```ts
export const idle: ActionResult | null = null
```

En `src/auth-client.ts`, reemplazar la línea 7:

```ts
export const { signIn, signUp, signOut, useSession } = authClient
```

por:

```ts
export const { signIn, signUp, signOut } = authClient
```

En `src/lib/schemas.ts`, borrar las dos líneas de tipos inferidos que nadie consume:

```ts
export type MovementInput = z.infer<typeof movementSchema>
```

```ts
export type ExchangeInput = z.infer<typeof exchangeSchema>
```

- [ ] **Step 2: Inlinear el wrapper de la verificación de rol**

En `src/db/client.ts`, reemplazar las líneas 64 a 85, que dicen hoy:

```ts
/**
 * El ejecutor es inyectable y con el ejecutor real como default: withUser()
 * sigue llamando esta función sin argumentos, igual que antes de separar la
 * verificación en @/lib/rls-guard.
 */
async function consultarRolDeConexion(
  ejecutarConsulta: EjecutorConsultaRol = ejecutarConsultaRolReal,
): Promise<void> {
  await verificarRolNoSalteaRls(ejecutarConsulta)
}

function verificarRolSinBypassRls(): Promise<void> {
  const enCurso =
    verificacionDeRol ??
    consultarRolDeConexion().catch((error: unknown) => {
      verificacionDeRol = undefined
      throw error
    })

  verificacionDeRol = enCurso
  return enCurso
}
```

por:

```ts
function verificarRolSinBypassRls(): Promise<void> {
  const enCurso =
    verificacionDeRol ??
    verificarRolNoSalteaRls(ejecutarConsultaRolReal).catch((error: unknown) => {
      verificacionDeRol = undefined
      throw error
    })

  verificacionDeRol = enCurso
  return enCurso
}
```

El wrapper tenía un solo llamador y su parámetro inyectable nunca se inyectaba: los tests de `src/lib/rls-guard.test.ts` llaman `verificarRolNoSalteaRls` directo con su propio doble, que es justamente el punto de haberla separado en `@/lib/rls-guard`.

- [ ] **Step 3: Completar el `.gitignore`**

Agregar al final de `.gitignore`:

```gitignore
# Estado local de las herramientas de agentes: no es del proyecto.
/.agents/
/.playwright/
/.playwright-cli/
/.superpowers/
skills-lock.json
```

- [ ] **Step 4: Verificar**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Esperado: sin salida; 266 tests passed. Si el typecheck se queja de un `idle`, un `useSession` o un `MovementInput` que sí se usaba, revertir esa línea puntual y anotarlo.

```bash
git status --short
```

Esperado: `.agents/`, `.playwright-cli/` y `skills-lock.json` ya no aparecen como sin trackear.

- [ ] **Step 5: Commit**

```bash
git add src/server/actions/result.ts src/auth-client.ts src/lib/schemas.ts src/db/client.ts .gitignore
git commit -m "chore: se van cuatro exports muertos, un wrapper y tres huecos del gitignore"
```

---

### Task 11: Importe mayor a cero, y logs que no vuelcan la fila

Dos cosas chicas con el mismo criterio de fondo: el borde de confianza.

1. `amountCents` permite cero, así que se puede guardar un movimiento de $0 con una cuota de $0. `exchangeSchema` sí exige `> 0`. La pieza compartida tiene que seguir permitiendo cero —el saldo inicial en dólares puede ser cero, y `settingsSchema` la usa—, así que la cota va en `movementSchema`, igual que ya está en `exchangeSchema`.
2. `console.error("createMovement", error)` vuelca el error de Drizzle completo, cuyo `message` es `Failed query: insert into … params: <los valores de la fila>`. En una app de finanzas eso son importes y descripciones en los logs del hosting.

**Files:**
- Create: `src/lib/log-db-error.ts`
- Modify: `src/lib/schemas.ts` (`movementSchema.amountCents`)
- Modify: `src/lib/schemas.test.ts` (un caso)
- Modify: `src/server/actions/movements.ts` (3 `console.error`)
- Modify: `src/server/actions/categories.ts` (2 `console.error`)
- Modify: `src/server/actions/settings.ts` (1 `console.error`)

**Interfaces:**
- Produces: `logDbError(donde: string, error: unknown): void` en `@/lib/log-db-error`.

- [ ] **Step 1: Escribir el test que falla**

En `src/lib/schemas.test.ts`, dentro del `describe` de `movementSchema`:

```ts
  it("rechaza un movimiento de importe cero", () => {
    const result = movementSchema.safeParse({
      kind: "expense",
      description: "Nada",
      categoryId: "cat-1",
      date: "2026-08-10",
      currency: "ARS",
      amountCents: "0",
      rate: "1",
      installments: [{ amountCents: 0, dueDate: "2026-08-10" }],
    })

    expect(result.success).toBe(false)
    expect(fieldError(result, "amountCents")).toBeDefined()
  })
```

Y, para dejar claro que la pieza compartida sigue admitiendo cero, en el `describe` de `settingsSchema`:

```ts
  it("sigue admitiendo un saldo inicial en cero", () => {
    // `amountCents` la comparten los dos esquemas: la cota de "mayor a cero"
    // es de movementSchema y no puede haberse colado acá, donde arrancar sin
    // un peso y sin un dólar es un caso legítimo.
    const result = settingsSchema.safeParse({
      initialBalanceArsCents: "0",
      initialBalanceUsdCents: "0",
      initialBalanceUsdRate: "0",
      initialBalanceDate: "2026-08-10",
      preferredRate: "blue",
    })

    expect(result.success).toBe(true)
  })
```

- [ ] **Step 2: Correr los tests para verlos fallar**

```bash
pnpm test -- schemas
```

Esperado: FAIL en el primero (hoy un movimiento de cero pasa), PASS en el segundo.

- [ ] **Step 3: Poner la cota donde corresponde**

En `src/lib/schemas.ts`, dentro de `movementSchema`, reemplazar la línea:

```ts
    amountCents: amountCents,
```

por:

```ts
    /**
     * Mayor a cero, no sólo no-negativo: un movimiento de $0 no es un dato, es
     * una fila que después aparece en la torta y en las barras aportando nada.
     * La cota va acá y no en `amountCents` porque esa pieza la comparte
     * `settingsSchema`, donde el cero SÍ es válido (un saldo inicial sin
     * dólares). Mismo patrón que `exchangeSchema.usdCents`.
     */
    amountCents: amountCents.refine((c) => c > 0, "El importe tiene que ser mayor a cero."),
```

- [ ] **Step 4: Escribir el log que no filtra**

Crear `src/lib/log-db-error.ts`:

```ts
/**
 * Loguea un error de la base sin volcar los valores de la fila.
 *
 * Drizzle envuelve el error de postgres.js en un `DrizzleQueryError` cuyo
 * `message` es `Failed query: insert into … params: <LOS VALORES>`. Pasarle ese
 * objeto entero a `console.error` deja importes y descripciones en los logs del
 * hosting. El `PostgresError` original vive en `cause`, y su propio `message`
 * es el de Postgres ("duplicate key value violates unique constraint …"), que
 * no trae los valores.
 *
 * Mismo camino que recorre `isUniqueViolation` (@/lib/db-errors) para llegar al
 * código, y por el mismo motivo.
 */
export function logDbError(donde: string, error: unknown): void {
  const cause = error instanceof Error && error.cause !== undefined ? error.cause : error

  if (typeof cause === "object" && cause !== null) {
    const { code, constraint_name: constraint, message } = cause as {
      code?: unknown
      constraint_name?: unknown
      message?: unknown
    }
    console.error(donde, { code, constraint, message })
    return
  }

  console.error(donde, cause)
}
```

- [ ] **Step 5: Usarlo en las seis Server Actions**

En `src/server/actions/movements.ts`, agregar el import:

```ts
import { logDbError } from "@/lib/log-db-error"
```

y reemplazar las tres líneas:

```ts
    console.error("createMovement", error)
    console.error("createExchange", error)
    console.error("setInstallmentPaid", error)
```

y la de `deleteMovement`, por su equivalente con `logDbError("createMovement", error)`, `logDbError("createExchange", error)`, `logDbError("deleteMovement", error)` y `logDbError("setInstallmentPaid", error)`.

En `src/server/actions/categories.ts`, mismo import, y reemplazar:

```ts
      console.error("createCategory: nombre repetido", error)
      console.error("createCategory", error)
      console.error("archiveCategory", error)
```

por `logDbError("createCategory: nombre repetido", error)`, `logDbError("createCategory", error)` y `logDbError("archiveCategory", error)`.

En `src/server/actions/settings.ts`, mismo import, y reemplazar `console.error("saveSettings", error)` por `logDbError("saveSettings", error)`.

- [ ] **Step 6: Verificar**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Esperado: sin salida; 268 tests passed.

```bash
pnpm test:db
```

Esperado: verde. `actions.db.test.ts` espía `console.error` (línea 158) para silenciarlo; sigue funcionando porque `logDbError` termina llamando a `console.error` igual.

- [ ] **Step 7: Commit**

```bash
git add src/lib/schemas.ts src/lib/schemas.test.ts src/lib/log-db-error.ts src/server/actions/movements.ts src/server/actions/categories.ts src/server/actions/settings.ts
git commit -m "fix(alta): el importe tiene que ser mayor a cero, y los logs dejan de volcar la fila"
```

---

### Task 12: Esqueleto de carga y medición de cobertura

Lo último, y lo menos urgente. El dashboard hace varias idas a Supabase antes del primer byte y hoy no muestra nada mientras tanto. Y no hay forma de ver qué quedó sin tocar por los tests sin instalar la herramienta.

**Files:**
- Create: `src/app/(app)/loading.tsx`
- Modify: `package.json` (devDependency y script)
- Modify: `docs/PENDIENTES.md` (cerrar la sección 3.4)

- [ ] **Step 1: Escribir el esqueleto**

Crear `src/app/(app)/loading.tsx`:

```tsx
/**
 * Esqueleto de cualquier pantalla de la app mientras el servidor trae sus
 * datos. No imita la grilla de ninguna en particular a propósito: las seis
 * tienen layouts distintos y un esqueleto que promete la forma equivocada es
 * peor que uno genérico.
 */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="h-8 w-48 animate-pulse rounded-md bg-obsidian" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg border border-graphite" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-lg border border-graphite" />
    </div>
  )
}
```

- [ ] **Step 2: Instalar la cobertura**

```bash
pnpm add -D @vitest/coverage-v8@4.1.10
```

La versión tiene que coincidir con la de `vitest` (hoy `4.1.10`) o vitest se queja al arrancar.

Agregar el script a `package.json`, debajo de `"test:db"`:

```json
    "test:coverage": "vitest run --coverage",
```

- [ ] **Step 3: Correr la cobertura y leer el resultado**

```bash
pnpm test:coverage
```

Esperado: la suite pasa y sale una tabla. Anotar en `docs/PENDIENTES.md` qué archivos quedaron por debajo del resto — no hace falta subir ningún número en esta tarea, la tarea es tener la medición.

- [ ] **Step 4: Actualizar PENDIENTES.md**

Reemplazar la sección `### 3.4 Herramientas`, que dice hoy:

```markdown
No hay medición de cobertura instalada. Las suites son grandes y buscan el caso
que rompe, no el porcentaje, pero hoy no hay forma de ver qué quedó sin tocar sin
agregar la herramienta.
```

por:

```markdown
La cobertura se mide con `pnpm test:coverage` (`@vitest/coverage-v8`). El
criterio sigue siendo el mismo —buscar el caso que rompe, no el porcentaje—,
pero ahora se puede ver qué quedó sin tocar.

Los tests de componente corren en la misma suite que los de lógica: los `.tsx`
declaran su entorno con `// @vitest-environment jsdom` en la primera línea, así
que el resto sigue corriendo en node y no paga jsdom.
```

- [ ] **Step 5: Verificar**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Esperado: sin salida; 268 tests passed.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml "src/app/(app)/loading.tsx" docs/PENDIENTES.md
git commit -m "chore: esqueleto de carga y medición de cobertura"
```

---

## Cierre

Después de la tarea 12, actualizar `docs/PENDIENTES.md` con lo que quedó afuera de este plan y sigue abierto de la auditoría:

- **Lo que el plan no toca porque es una decisión de negocio**, ya documentado en la sección 1: caja vs. devengado en el dashboard (1.1), desarchivar categorías (1.2), el mensaje de error de `saveSettings` (1.3), el favicon (1.4).
- **La cobertura de componentes sigue siendo parcial.** Después de la tarea 1 hay tests de `MovementForm` y nada más. `ExchangeForm`, `SettingsForm`, `CategoryManager` y `AuthForm` siguen sin una sola prueba. La infraestructura ya está puesta, así que agregarlos es escribir el test y nada más.
- **Sin verificación por imagen.** Todo lo visual de este plan se verificó a ojo en el navegador, no con capturas comparadas.
