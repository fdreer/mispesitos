CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"email" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_by" text,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "invitation_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "disabled_at" timestamp;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_used_by_user_id_fk" FOREIGN KEY ("used_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitation_created_by_idx" ON "invitation" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "user_single_admin" ON "user" USING btree ("role") WHERE role = 'admin';--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_role_valid" CHECK ("user"."role" IN ('admin', 'member'));--> statement-breakpoint

-- Instalaciones que ya tienen usuarios: el más antiguo pasa a ser el
-- administrador. Es quien instaló la app, que es justamente la definición de
-- admin del plan v2 (§0.1). En una base vacía no hace nada, y el primer
-- registro lo resuelve src/auth.ts.
UPDATE "user" SET "role" = 'admin'
WHERE "id" = (SELECT "id" FROM "user" ORDER BY "created_at", "id" LIMIT 1);--> statement-breakpoint

-- `invitation` es del lado de auth: la leen el alta de better-auth y la
-- pantalla del admin, FUERA de withUser(), conectados como `app_user`. Recibe
-- el mismo trato que `user`, `session`, `account` y `verification` en la 0001
-- y la 0004: RLS habilitada, nada para anon ni authenticated, y acceso
-- explícito y sin condición para `app_user`. Sin la policy, la RLS habilitada
-- dejaría a app_user sin ver una sola fila.
ALTER TABLE "invitation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "invitation" FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "invitation" TO app_user;--> statement-breakpoint
CREATE POLICY "invitation_app_user" ON "invitation" FOR ALL TO app_user
  USING (true) WITH CHECK (true);
