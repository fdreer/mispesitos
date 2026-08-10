-- Las policies de la 0003 tienen que devolver CERO FILAS cuando no hay usuario
-- declarado, no reventar.
--
-- Tal como estaban, evaluaban `current_setting('request.jwt.claims', true)::json`.
-- El segundo argumento en true hace que la función devuelva NULL si el
-- parámetro no existe — pero en Supabase el parámetro SÍ existe y viene con
-- cadena vacía por defecto (verificado: `current_setting(...) IS NULL` da false
-- y `= ''` da true). Y `''::json` no es NULL: es el error 22P02
-- "invalid input syntax for type json".
--
-- Mientras la app conectaba como `postgres` esto no se notaba, porque BYPASSRLS
-- hacía que las policies ni se evaluaran fuera de withUser(). Con `app_user`
-- (migración 0004) sí se evalúan, y cualquier consulta que se olvide de
-- withUser() fallaba con un error de JSON en vez de devolver cero filas.
--
-- `nullif(..., '')` convierte la cadena vacía en NULL antes del cast: NULL::json
-- es NULL, `user_id = NULL` es NULL, y la fila no pasa el filtro. Falla cerrado,
-- que es lo que se quiere. Adentro de withUser() no cambia nada: ahí
-- request.jwt.claims trae un JSON real.

ALTER POLICY "user_settings_own" ON "user_settings"
  USING (user_id = nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub')
  WITH CHECK (user_id = nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub');--> statement-breakpoint

ALTER POLICY "category_own" ON "category"
  USING (user_id = nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub')
  WITH CHECK (user_id = nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub');--> statement-breakpoint

ALTER POLICY "movement_own" ON "movement"
  USING (user_id = nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub')
  WITH CHECK (user_id = nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub');--> statement-breakpoint

ALTER POLICY "installment_own" ON "installment"
  USING (user_id = nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub')
  WITH CHECK (user_id = nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub');
