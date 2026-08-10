-- Rol de aplicación dedicado: lo que hace que la segunda capa de autorización
-- exista de verdad.
--
-- La migración 0003 dejó las tablas de la app con ENABLE + FORCE RLS, pero eso
-- no alcanzaba: la app conectaba como `postgres`, y en Supabase ese rol tiene el
-- atributo BYPASSRLS, que le gana a FORCE. Con BYPASSRLS el rol saltea RLS por
-- completo, sea dueño o no, así que una consulta fuera de withUser() devolvía
-- las filas de todos los usuarios.
--
-- `app_user` es NOBYPASSRLS y miembro de `authenticated`, que es de donde saca
-- los privilegios sobre las tablas de la app (concedidos en la 0003). Con
-- INHERIT — el default, y se deja a propósito — las policies `TO authenticated`
-- le aplican también afuera de withUser(): ahí `request.jwt.claims` no está
-- seteado, la comparación da NULL y no pasa ninguna fila. Cero filas, no un
-- error de permisos.
--
-- Adentro de withUser() nada cambia: `SET LOCAL ROLE authenticated` sigue
-- funcionando justamente porque app_user es miembro de ese rol.
--
-- La contraseña NO va acá: este archivo se commitea. Se pone una sola vez, a
-- mano, contra la base (ver .env.example):
--   ALTER ROLE app_user LOGIN PASSWORD '<generada con openssl rand -hex 24>';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOBYPASSRLS;
  END IF;
END
$$;--> statement-breakpoint

GRANT authenticated TO app_user;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_user;--> statement-breakpoint

-- Sobre las tablas de la app (user_settings, category, movement, installment) NO
-- se da GRANT directo: los privilegios llegan por `authenticated`, y así la
-- única forma de leerlas es que alguna policy `TO authenticated` deje pasar.

-- Las cuatro tablas de better-auth son el caso opuesto. better-auth las consulta
-- FUERA de withUser, con el rol de conexión. `app_user` no es su dueño, así que
-- el RLS que ya tienen (migración 0001) sí le aplica y sin policy no vería nada
-- y el login se rompería. Se le da acceso explícito y sin condición: el
-- aislamiento por usuario de estas tablas lo hace better-auth, no RLS.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "user", "session", "account", "verification"
TO app_user;--> statement-breakpoint

CREATE POLICY "user_app_user" ON "user" FOR ALL TO app_user
  USING (true) WITH CHECK (true);--> statement-breakpoint

CREATE POLICY "session_app_user" ON "session" FOR ALL TO app_user
  USING (true) WITH CHECK (true);--> statement-breakpoint

CREATE POLICY "account_app_user" ON "account" FOR ALL TO app_user
  USING (true) WITH CHECK (true);--> statement-breakpoint

CREATE POLICY "verification_app_user" ON "verification" FOR ALL TO app_user
  USING (true) WITH CHECK (true);
