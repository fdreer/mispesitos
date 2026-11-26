ALTER TABLE "installment" ADD CONSTRAINT "installment_movement_id_number_unique" UNIQUE("movement_id","number");--> statement-breakpoint
ALTER TABLE "installment" ADD CONSTRAINT "installment_number_positive" CHECK ("number" >= 1);--> statement-breakpoint
ALTER TABLE "installment" ADD CONSTRAINT "installment_amount_nonnegative" CHECK ("amount_cents" >= 0);--> statement-breakpoint
ALTER TABLE "movement" ADD CONSTRAINT "movement_kind_valid" CHECK ("kind" IN ('income', 'expense', 'exchange'));--> statement-breakpoint
ALTER TABLE "movement" ADD CONSTRAINT "movement_currency_valid" CHECK ("currency" IN ('ARS', 'USD'));--> statement-breakpoint
ALTER TABLE "movement" ADD CONSTRAINT "movement_amount_positive" CHECK ("amount_cents" > 0);--> statement-breakpoint
ALTER TABLE "movement" ADD CONSTRAINT "movement_rate_positive" CHECK ("rate" > 0);--> statement-breakpoint
ALTER TABLE "movement" ADD CONSTRAINT "movement_direction_valid" CHECK (("kind" = 'exchange' AND "direction" IN ('buy', 'sell')) OR ("kind" <> 'exchange' AND "direction" IS NULL));--> statement-breakpoint

-- `check_installment_statement` (migración 0012) devuelve `void`, no `trigger`:
-- Postgres concede EXECUTE a PUBLIC por default, lo que la deja invocable
-- desde `anon` (p. ej. vía PostgREST en Supabase). Mismo criterio que
-- `app_user_id()` en la 0006: sólo `authenticated` (y `app_user` por herencia).
REVOKE ALL ON FUNCTION public.check_installment_statement(text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.check_installment_statement(text) FROM anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.check_installment_statement(text) TO authenticated;
