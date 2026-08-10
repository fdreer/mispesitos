-- El `kind` entra en la FK compuesta hacia `category`.
--
-- QUÉ SE ESTABA ESCAPANDO
--
-- `createMovement` no verifica que el tipo de la categoría coincida con el del
-- movimiento: se podía guardar un ingreso con una categoría de egresos. Desde
-- la interfaz no pasa —el desplegable ya viene filtrado por tipo— pero el borde
-- de confianza es la Server Action, no el formulario. El efecto era un
-- dashboard mostrando un ingreso adentro de la torta de egresos.
--
-- POR QUÉ ACÁ Y NO CON UN SELECT EN LA ACCIÓN
--
-- Es exactamente la misma clase de problema que la propiedad cruzada entre
-- usuarios, que la 0006 cerró metiendo `user_id` adentro de la FK en vez de
-- confiar en el código: una consulta extra en la acción se puede olvidar, queda
-- fuera de la transacción de la escritura y no protege a nadie que escriba por
-- otro camino. La FK la evalúa la base en el mismo INSERT.
--
-- La FK pasa de (user_id, category_id) → category (user_id, id) a
-- (user_id, kind, category_id) → category (user_id, kind, id). Con `kind`
-- adentro, la categoría referenciada tiene que ser del mismo usuario Y del
-- mismo tipo.
--
-- LO QUE NO SE ROMPE
--
-- MATCH SIMPLE (el default, y el que se quiere) no exige nada cuando alguna
-- columna de la FK es NULL: los movimientos de tipo exchange siguen entrando
-- con category_id nulo. Vale la pena subrayarlo acá, porque el `kind` de un
-- exchange es "exchange" y no existe ninguna categoría de ese tipo: si esta FK
-- dejara de ser MATCH SIMPLE, ningún cambio de divisa entraría nunca más.
--
-- El UNIQUE viejo (user_id, id) se va: su única razón de ser era ser el destino
-- de la FK anterior, y como unicidad es redundante con la PK sobre `id`. El
-- nuevo (user_id, kind, id) lo reemplaza en ese rol.

-- ---------------------------------------------------------------------------
-- Orden obligatorio, reacomodado a mano
-- ---------------------------------------------------------------------------
-- drizzle-kit genera estas cuatro sentencias en un orden que no corre: arranca
-- borrando el UNIQUE viejo, del que todavía depende la FK vieja, y agrega la FK
-- nueva antes que el UNIQUE que la sostiene. Postgres exige lo contrario en las
-- dos puntas: una restricción única sobre las columnas referenciadas ANTES de
-- crear la FK, y ninguna FK colgando de la única ANTES de borrarla. Es el mismo
-- reordenado que hubo que hacer en la 0006.

ALTER TABLE "category" ADD CONSTRAINT "category_user_id_kind_id_unique" UNIQUE("user_id","kind","id");--> statement-breakpoint

ALTER TABLE "movement" DROP CONSTRAINT "movement_user_id_category_id_category_user_id_id_fk";--> statement-breakpoint
ALTER TABLE "movement" ADD CONSTRAINT "movement_user_id_kind_category_id_category_user_id_kind_id_fk" FOREIGN KEY ("user_id","kind","category_id") REFERENCES "public"."category"("user_id","kind","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "category" DROP CONSTRAINT "category_user_id_id_unique";
