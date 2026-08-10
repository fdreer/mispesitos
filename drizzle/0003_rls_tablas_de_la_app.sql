-- Segunda capa de autorización (sección 6 del spec).
-- La primera capa es que toda consulta pasa por withUser() filtrando por user_id.
-- Esta capa hace que un WHERE olvidado devuelva cero filas igual.
--
-- ENABLE no alcanza: la app conecta como `postgres`, que es DUEÑO de estas
-- tablas, y el dueño saltea RLS salvo que la tabla declare FORCE. Con FORCE, y
-- como las policies son TO authenticated, el dueño tampoco ve nada: cualquier
-- consulta que se olvide de pasar por withUser() devuelve cero filas en vez de
-- devolver datos ajenos. Eso es exactamente lo que se busca.
--
-- Las cuatro tablas de better-auth (user, session, account, verification) NO
-- llevan FORCE: better-auth las consulta fuera de withUser, con el rol de
-- conexión, y tiene que poder.

ALTER TABLE "user_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "category" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "movement" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "installment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "user_settings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "category" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "movement" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "installment" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- El rol al que withUser() cambia dentro de la transacción.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "user_settings", "category", "movement", "installment"
TO authenticated;--> statement-breakpoint

CREATE POLICY "user_settings_own" ON "user_settings" FOR ALL TO authenticated
  USING (user_id = current_setting('request.jwt.claims', true)::json ->> 'sub')
  WITH CHECK (user_id = current_setting('request.jwt.claims', true)::json ->> 'sub');--> statement-breakpoint

CREATE POLICY "category_own" ON "category" FOR ALL TO authenticated
  USING (user_id = current_setting('request.jwt.claims', true)::json ->> 'sub')
  WITH CHECK (user_id = current_setting('request.jwt.claims', true)::json ->> 'sub');--> statement-breakpoint

CREATE POLICY "movement_own" ON "movement" FOR ALL TO authenticated
  USING (user_id = current_setting('request.jwt.claims', true)::json ->> 'sub')
  WITH CHECK (user_id = current_setting('request.jwt.claims', true)::json ->> 'sub');--> statement-breakpoint

CREATE POLICY "installment_own" ON "installment" FOR ALL TO authenticated
  USING (user_id = current_setting('request.jwt.claims', true)::json ->> 'sub')
  WITH CHECK (user_id = current_setting('request.jwt.claims', true)::json ->> 'sub');
