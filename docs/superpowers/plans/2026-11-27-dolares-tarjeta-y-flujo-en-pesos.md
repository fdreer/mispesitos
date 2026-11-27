# Dólares con tarjeta y flujo de fondos en pesos

Fecha: 2026-11-27. Reemplaza la decisión 7.1 del plan v2 (`specs/2026-11-26-v2-plan.md`,
§1.3) en lo que hace al tipo de cambio.

## Problema

Una compra con tarjeta en dólares no tiene tipo de cambio cuando se hace: se conoce al
pagar el resumen, y sólo si se paga con pesos. Si se paga con dólares, no hay tipo de
cambio de por medio. Hoy la app pide un TC en cada movimiento en USD y lo usa para
convertir a pesos en los informes, lo que obliga a inventar un valor y mezcla monedas.

## Decisiones (acordadas con el usuario)

1. **Ingresos y egresos no llevan tipo de cambio.** Ni en pesos ni en dólares, con o sin
   tarjeta. El TC queda sólo en la **compra y venta de dólares**, donde es el dato central.
   Los movimientos ya cargados pierden su TC en la migración.
2. **Saldo real por moneda.** Saldo en $ y saldo en US$ por separado, sin cuentas. Cada uno
   coincide con efectivo + bancos. Sólo cambia con lo pagado/cobrado y con compras o ventas
   de dólares.
3. **Pago del resumen:**
   - **Con pesos:** se ingresa el **total en pesos** debitado por la parte en dólares, con
     impuestos y cargos incluidos. Se guarda ese total; el TC efectivo (total ÷ US$) sólo se
     muestra.
   - **Con dólares:** sale del saldo en US$. Si no alcanza, la app avisa y ofrece registrar
     la compra de dólares en el mismo paso. También se puede registrar aunque alcance.
   - Sin pago mixto.
4. **Flujo de fondos: todo en pesos y sólo desde hoy hacia adelante.**
   - Punto de partida: saldo $ real + saldo US$ real × **oficial comprador de hoy**.
   - Pendientes en $: por su valor. Ingresos pendientes en US$: × **oficial comprador** de
     hoy. Egresos pendientes en US$ (incluida la parte en USD de los resúmenes): ×
     **oficial vendedor** de hoy.
   - Lo vencido e impago se muestra aparte ("Atrasado").
   - Sin selector de moneda. El pasado no se muestra.
   - Al lado del flujo, un panel con: saldo $, saldo US$ (≈ $), cotización usada,
     próximos vencimientos de tarjetas y atrasado.
5. **Ingresos y gastos (informe): pesos y dólares lado a lado, sin convertir.** Se saca
   "Todo en pesos". Lo pagado en dólares se ve en dólares; un resumen pagado con pesos
   cuenta en pesos.
6. **Cotización:** dólar **oficial** de `https://dolarapi.com/v1/dolares/oficial`. La
   "venta" de la API es el vendedor (lo que pagás); la "compra", el comprador.

## Fases

Cada fase deja la app funcionando y con los tests en verde. Orden pensado para que la base
cambie primero y la UI la siga.

### Fase 1 — Base de datos

Migración `0015_tc_solo_en_cambios.sql` (generada con drizzle-kit + SQL a mano, como las
anteriores):

- `movement.rate` pasa a **nullable**. Nuevo CHECK: `rate IS NOT NULL` si y sólo si
  `kind = 'exchange'` (y `> 0`). Reemplaza el CHECK actual de "1 cuando es ARS".
- Datos: `UPDATE movement SET rate = NULL WHERE kind <> 'exchange'`. **Irreversible**:
  hacer un `pg_dump` antes de aplicarla en producción.
- `card_statement`: nueva columna `usd_paid_ars_cents bigint` (total en pesos de la parte
  en USD). Se completa desde los pagos existentes: `round(total_usd × usd_paid_rate)`,
  con la misma función de redondeo que `convertToArs`. Luego se borra `usd_paid_rate`.
  CHECK: sólo con `paid_date` y `> 0`.
- `user_settings`: columnas nuevas `last_official_buy`, `last_official_sell`
  (`numeric(12,4)`) y `last_official_at` (`timestamptz`), todas nullable, para guardar la
  última cotización oficial obtenida. Se borra `initial_balance_usd_rate`: sólo la usaban
  la tenencia y el modo "Todo en pesos", que se van.
- `schema.ts` acorde. Test de RLS/integridad en `rls.db.test.ts` para los CHECK nuevos.

### Fase 2 — Cotización oficial

- `src/lib/rate.ts`: `fetchOfficialRate()` → `{ compra, venta, fetchedAt } | null`, siempre
  sobre `/dolares/oficial`, con el mismo cache y timeout que hoy. `fetchSuggestedRate`
  (según la preferencia de Ajustes) queda sólo para precargar el formulario de cambios.
- Cada vez que la API responde, la cotización se guarda en `user_settings`. Si no
  responde, se usa la última guardada, mostrando de cuándo es ("oficial de ayer 14:30").
  Sólo si nunca se obtuvo una, el flujo muestra un aviso y no convierte los dólares.
- `fetchSuggestedRate` y la preferencia de Ajustes quedan sólo para precargar el TC de una
  compra o venta de dólares: en /cambios y en el bloque "Registrar compra de dólares" del
  pago del resumen. El texto del ajuste se cambia para decir eso.

### Fase 3 — Carga de movimientos sin TC

- `movement-form.tsx`: se saca el campo "Tipo de cambio" y el `rate` oculto.
- `schemas.ts`: el esquema de ingreso/egreso deja de tener `rate`. El de cambios lo
  mantiene.
- `server/actions/movements.ts`: alta y edición sin `rate`; inline edit de importe igual.
- `movement-screen.tsx`, `mobile-quick-add-loader.tsx`, `quick-add-sheet`: sin
  `suggestedRate`.
- `movement-list-view.ts`: el total de la lista deja de convertir; muestra $ y US$ por
  separado.
- Tests de formulario y acciones actualizados.

### Fase 4 — Pago del resumen

- `lib/cards.ts`:
  - `resolveStatementPayment`: modo `ars` pide `usdPaidArsCents > 0`; modo `usd` no.
  - `perceivedPayment`: reparte `usd_paid_ars_cents` entre las cuotas en USD del resumen
    en proporción a su importe, con **resto mayor** para que la suma dé exacto el total
    ingresado.
  - `availableCredit`: la parte en USD se convierte al oficial vendedor de hoy (sin
    cotización: se informa aparte "+ US$ X").
- `statement-actions.tsx`:
  - Con pesos: campo "Total en pesos debitado por los US$ X", precargado con la
    estimación (US$ × oficial vendedor); debajo, el TC efectivo calculado.
  - Con dólares: muestra el saldo en US$ disponible. Si no alcanza, aviso + bloque
    "Registrar compra de dólares" (US$ = faltante editable, TC precargado con la
    cotización de compra según la preferencia, fecha = la del pago). Ese bloque también se
    puede abrir aunque alcance.
- `server/actions/cards.ts`: el pago y la compra de dólares en **una sola transacción**.
  Desmarcar el pago **no** borra la compra de dólares (es una operación real aparte).
- Detalle del resumen (`tarjetas/[cardId]/page.tsx`) y `/tarjetas`: si está impago con
  dólares, "US$ X ≈ $ Y si lo pagás en pesos (oficial vendedor de hoy)". Si está pagado
  con pesos, el total y el TC efectivo.

### Fase 5 — Flujo de fondos en pesos

- `lib/reports-cashflow.ts` se reescribe alrededor de un solo modo:
  - Entrada: saldos reales de hoy (`computeBalances`), pendientes y la cotización oficial.
  - Filas mensuales desde el mes en curso (sólo lo que falta de él) y semanales para los
    próximos 3 meses. Ya no hay filas "real" ni "mixed".
  - Conversión: ingresos USD × compra, egresos USD × venta, saldo US$ × compra.
  - "Atrasado" y la alerta de saldo negativo se mantienen.
- `report-query.ts` / `report-controls.tsx`: el selector de moneda desaparece de la pestaña
  Flujo, y el rango de fechas arranca hoy.
- `cashflow-report.tsx`: panel lateral (saldo $, saldo US$ ≈ $, cotización usada con hora,
  vencimientos de tarjetas en $ y US$ ≈ $, atrasado).
- Dashboard: la mini proyección usa la misma función, así los dos números coinciden.

### Fase 6 — Ingresos y gastos lado a lado

- `lib/reports-pnl.ts`: sin modo `todo`. Cada celda lleva `arsCents` y `usdCents`; totales y
  neto por moneda.
- `pnl-report.tsx`: cada celda muestra `$ X` y, debajo, `US$ Y` cuando hay dólares. Los
  gráficos tienen un selector $ | US$.
- `REPORT_CURRENCIES` pierde `todo`. Un enlace viejo con `?moneda=todo` cae en el default.
- Dashboard: "Ingresos / Gastos del mes" muestran $ y US$; la torta y las barras, con
  selector $ | US$ (default $). El total consolidado se valúa al oficial comprador, igual
  que el punto de partida del flujo.

### Fase 7 — Sacar la tenencia y cierre

- Se elimina la lógica de tenencia (costo promedio y resultado realizado):
  `lib/position.ts`, su test, la consulta `buildUsdPositionEvents` en `server/queries.ts`
  y la sección "Tenencia" de `/cambios`. `/cambios` queda con el formulario y la lista de
  compras y ventas.
- Ajustes y onboarding (comparten `settings-form.tsx`): se saca el campo "¿A qué tipo de
  cambio promedio los compraste?". "¿Qué dólar usás de referencia?" se queda, con un texto
  que aclare que sólo precarga compras y ventas de dólares.
- Actualizar `specs/2026-11-26-v2-plan.md` §1.3 y §3.3 marcando lo reemplazado por este
  documento, y `docs/notas-tecnicas.md` si corresponde.
- Pasada final: `pnpm lint`, `pnpm test`, tests de base, y prueba en el navegador de: compra
  USD con tarjeta → pago con pesos; compra USD → pago con dólares con y sin saldo
  suficiente; flujo con cotización en vivo y con la última guardada.
