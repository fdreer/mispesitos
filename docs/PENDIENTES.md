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
- **Modo oscuro.** Las variables del tema están en `globals.css`, pero nada agrega
  nunca la clase `dark`: no hay selector ni proveedor de tema.

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

No hay medición de cobertura instalada. Las suites son grandes y buscan el caso
que rompe, no el porcentaje, pero hoy no hay forma de ver qué quedó sin tocar sin
agregar la herramienta.

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
