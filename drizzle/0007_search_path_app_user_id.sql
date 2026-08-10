-- Segunda pasada de arreglos sobre la Task 9. Una sola cosa: search_path fijo
-- en public.app_user_id(), que el linter de Supabase marca como
-- function_search_path_mutable. El riesgo real es bajo (la función no hace
-- ningún lookup calificable por otro search_path: sólo llama a
-- current_setting/nullif, que son de pg_catalog, y aplica ->> y ::json, que son
-- operadores), pero fijarlo es una línea y cierra el aviso del linter.
--
-- ACLARACIÓN SOBRE LA 0006, QUE TAMPOCO SE EDITA (YA ESTÁ APLICADA)
--
-- Su comentario dice que usa DROP + CREATE "para que la migración sea
-- idempotente", pero eso sólo es cierto para los DROP POLICY IF EXISTS +
-- CREATE POLICY. Los ADD CONSTRAINT de las FK compuestas y el DROP CONSTRAINT
-- sin IF EXISTS de la sección 1 no lo son: correr la 0006 una segunda vez
-- contra una base donde ya se aplicó falla (la constraint ya existe, o el
-- nombre viejo que intenta dropear ya no está). No hace falta que la 0006 sea
-- idempotente para andar bien —drizzle-kit migrate no reaplica una migración
-- ya registrada—, pero el comentario afirmaba más de lo que el archivo hace.

ALTER FUNCTION public.app_user_id() SET search_path = pg_catalog;
