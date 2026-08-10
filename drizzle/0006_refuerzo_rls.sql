-- Refuerzo de la segunda capa de autorización. Tres cosas distintas que salieron
-- de la revisión de la Task 9.
--
-- ACLARACIÓN SOBRE LA 0003, QUE QUEDÓ AFIRMANDO ALGO FALSO
--
-- El encabezado de `0003_rls_tablas_de_la_app.sql` dice que con FORCE "el dueño
-- tampoco ve nada". Se creía que FORCE alcanzaba para que una consulta hecha con
-- el rol dueño devolviera cero filas. No es así: en Supabase el rol `postgres`
-- tiene además el atributo BYPASSRLS, y BYPASSRLS le gana a FORCE — saltea RLS
-- por completo, sea dueño o no. Lo que sostiene el aislamiento no es FORCE: es
-- que la app conecte con `app_user`, un rol NOBYPASSRLS (migración 0004, que ya
-- refuta la 0003 en su propio encabezado). La 0003 no se edita porque ya está
-- aplicada y drizzle guarda su hash; el aclarador vive acá.
--
-- 1. INTEGRIDAD REFERENCIAL ENTRE USUARIOS
--
-- Los triggers de integridad referencial corren como dueño de la tabla
-- referenciada — `postgres`, con BYPASSRLS — así que una FK se valida contra
-- TODAS las filas, no contra las visibles bajo RLS. Y el WITH CHECK de las
-- policies sólo mira user_id. Resultado: adentro de withUser(A) se podía
-- insertar un movement con user_id = 'A' y category_id de una categoría de B, y
-- pasaba las dos verificaciones. Igual con installment.movement_id, donde además
-- nada obligaba a que installment.user_id coincidiera con movement.user_id.
--
-- Las FK pasan a ser compuestas con user_id. Al meter user_id adentro de la
-- misma FK, la fila referenciada tiene que ser del mismo usuario: lo garantiza
-- la base, no el código de las Server Actions.
--
-- MATCH SIMPLE (el default, y el que se quiere) no exige nada cuando alguna
-- columna de la FK es NULL: por eso los movimientos de tipo exchange siguen
-- entrando con category_id nulo.
--
-- 2. EL PREDICADO DE LAS POLICIES, EN UN SOLO LUGAR
--
-- Estaba copiado textual 8 veces (USING + WITH CHECK por tabla). El bug de
-- `''::json` de la 0005 hubo que arreglarlo en cuatro lugares. Ahora vive en
-- public.app_user_id().
--
-- 3. CINTURONES QUE FALTABAN
--
-- El REVOKE a `anon` sobre las 4 tablas de la app (la 0001 lo hizo sobre las de
-- auth y lo justificó; a éstas se les había olvidado) y los atributos de
-- `app_user` declarados explícitamente en vez de heredados del default.

-- ---------------------------------------------------------------------------
-- 1. FK compuestas
-- ---------------------------------------------------------------------------
-- Orden obligatorio: Postgres exige una restricción única sobre las columnas
-- referenciadas ANTES de poder crear la FK que las apunta. drizzle-kit genera
-- estas sentencias al revés (primero las FK, después los UNIQUE) y la migración
-- falla con "there is no unique constraint matching given keys"; por eso este
-- archivo está reordenado a mano.

ALTER TABLE "category" ADD CONSTRAINT "category_user_id_id_unique" UNIQUE("user_id","id");--> statement-breakpoint
ALTER TABLE "movement" ADD CONSTRAINT "movement_user_id_id_unique" UNIQUE("user_id","id");--> statement-breakpoint

ALTER TABLE "movement" DROP CONSTRAINT "movement_category_id_category_id_fk";--> statement-breakpoint
ALTER TABLE "movement" ADD CONSTRAINT "movement_user_id_category_id_category_user_id_id_fk" FOREIGN KEY ("user_id","category_id") REFERENCES "public"."category"("user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "installment" DROP CONSTRAINT "installment_movement_id_movement_id_fk";--> statement-breakpoint
ALTER TABLE "installment" ADD CONSTRAINT "installment_user_id_movement_id_movement_user_id_id_fk" FOREIGN KEY ("user_id","movement_id") REFERENCES "public"."movement"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Las FK contra "user"(id) se quedan como estaban: `user` no tiene dueño por
-- usuario, es la tabla que define quién es cada uno.

-- ---------------------------------------------------------------------------
-- 2. El predicado, una sola vez
-- ---------------------------------------------------------------------------
-- STABLE, no IMMUTABLE: depende de un parámetro de sesión, que cambia entre
-- transacciones. STABLE alcanza para que el planner la evalúe una vez por
-- consulta.

CREATE OR REPLACE FUNCTION public.app_user_id() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub'
$$;--> statement-breakpoint

-- Postgres le da EXECUTE a PUBLIC por default en toda función nueva, y PUBLIC
-- incluye a `anon` — el rol con el que Supabase atiende /rest/v1 usando la anon
-- key, que es pública por diseño. Se revoca y se concede sólo a `authenticated`,
-- el rol al que withUser() baja adentro de la transacción. `app_user` la puede
-- ejecutar porque es miembro de `authenticated` y hereda (ver punto 3).
REVOKE ALL ON FUNCTION public.app_user_id() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_user_id() FROM anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_user_id() TO authenticated;--> statement-breakpoint

-- DROP + CREATE en vez de ALTER POLICY para que la migración sea idempotente.
DROP POLICY IF EXISTS "user_settings_own" ON "user_settings";--> statement-breakpoint
CREATE POLICY "user_settings_own" ON "user_settings" FOR ALL TO authenticated
  USING (user_id = public.app_user_id()) WITH CHECK (user_id = public.app_user_id());--> statement-breakpoint

DROP POLICY IF EXISTS "category_own" ON "category";--> statement-breakpoint
CREATE POLICY "category_own" ON "category" FOR ALL TO authenticated
  USING (user_id = public.app_user_id()) WITH CHECK (user_id = public.app_user_id());--> statement-breakpoint

DROP POLICY IF EXISTS "movement_own" ON "movement";--> statement-breakpoint
CREATE POLICY "movement_own" ON "movement" FOR ALL TO authenticated
  USING (user_id = public.app_user_id()) WITH CHECK (user_id = public.app_user_id());--> statement-breakpoint

DROP POLICY IF EXISTS "installment_own" ON "installment";--> statement-breakpoint
CREATE POLICY "installment_own" ON "installment" FOR ALL TO authenticated
  USING (user_id = public.app_user_id()) WITH CHECK (user_id = public.app_user_id());--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 3. Cinturones
-- ---------------------------------------------------------------------------
-- Mismo criterio que la 0001 sobre las tablas de auth: estas 4 tablas viven en
-- `public`, que Supabase expone por PostgREST con la anon key. RLS ya las tapa
-- (no hay ninguna policy TO anon), pero el patrón era revocar además de habilitar
-- RLS y acá se había abandonado sin decirlo. `authenticated` NO se toca: sus
-- privilegios son los que usa withUser().
REVOKE ALL ON TABLE "user_settings" FROM anon;--> statement-breakpoint
REVOKE ALL ON TABLE "category" FROM anon;--> statement-breakpoint
REVOKE ALL ON TABLE "movement" FROM anon;--> statement-breakpoint
REVOKE ALL ON TABLE "installment" FROM anon;--> statement-breakpoint

-- La 0004 creó el rol con `CREATE ROLE app_user NOBYPASSRLS` y se apoyó en que
-- INHERIT es el default. Toda la garantía de "cero filas fuera de withUser"
-- depende de esas dos cosas: NOBYPASSRLS para que las policies se evalúen, e
-- INHERIT para que los privilegios y las policies `TO authenticated` le alcancen
-- sin hacer SET ROLE. Un `ALTER ROLE app_user NOINHERIT` hecho a mano rompería
-- el aislamiento en silencio. Se declaran explícitos para que se lean como
-- decisión, no como default heredado.
ALTER ROLE app_user INHERIT NOBYPASSRLS;
