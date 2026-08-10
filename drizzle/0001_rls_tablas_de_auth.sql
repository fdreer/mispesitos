-- Las cuatro tablas de better-auth viven en el esquema `public`, que Supabase
-- expone por PostgREST usando la anon key — que es pública por diseño.
-- `account` guarda el hash de la contraseña y los access_token / refresh_token
-- de OAuth. Sin esto, cualquiera con la anon key los lee y los escribe en
-- /rest/v1/account.
--
-- RLS habilitada sin una sola policy = nadie entra por PostgREST. La app nunca
-- las consulta por ahí: las toca server-side con postgres.js, como rol dueño,
-- que saltea RLS.
--
-- Todo acá es idempotente a propósito: estas sentencias ya se aplicaron a mano
-- sobre la base de desarrollo antes de existir este archivo.
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "verification" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Cinturón además del tirante: se revocan los permisos que Supabase le da por
-- defecto a anon y authenticated sobre lo que crea el rol `postgres`.
REVOKE ALL ON "user" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON "session" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON "account" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON "verification" FROM anon, authenticated;
