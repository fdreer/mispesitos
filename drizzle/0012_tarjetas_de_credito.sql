-- Tarjetas de crédito (§1 del plan v2, Fase 3).
--
-- QUÉ ENTRA
--
-- * `credit_card`: la tarjeta, con su día de cierre y de vencimiento
--   HABITUALES, el límite opcional y un color. Se archiva, no se borra.
-- * `card_statement`: un resumen por tarjeta y período (`YYYY-MM`), con sus
--   fechas reales de cierre y vencimiento —editables, porque los bancos las
--   corren cada mes—, la fecha en que se pagó y, si la parte en dólares se
--   pagó con pesos, el TC (decisión 7.1).
-- * `movement.credit_card_id`: el medio de pago. Null = efectivo/débito, que
--   es como quedan todos los movimientos que ya existían: ninguno cambia.
-- * `installment.statement_id`: el resumen en el que cae cada cuota de una
--   compra con tarjeta.
--
-- Criterio de lo percibido (§0): una compra con tarjeta no es un gasto el día
-- que se hace, sino el día que se paga el resumen. Por eso la cuota de una
-- compra con tarjeta no tiene vida propia: vence cuando vence su resumen y se
-- paga cuando se paga su resumen.
--
-- LAS FK, COMPUESTAS COMO TODAS
--
-- Mismo patrón que la 0006, la 0008 y la 0011: las FK las evalúa el dueño de
-- la tabla, que ve TODAS las filas, así que cada una lleva `user_id` adentro.
-- Un resumen no puede colgar de la tarjeta de otro usuario, ni una compra
-- apuntar a una tarjeta ajena, ni una cuota caer en un resumen ajeno. Los
-- destinos son los UNIQUE (user_id, id) de cada tabla, creados en el mismo
-- CREATE TABLE para que existan antes que las FK que los apuntan (el problema
-- de orden que la 0006 tuvo que arreglar a mano).
--
-- Las tres FK nuevas son NO ACTION, no RESTRICT, por lo que explica la 0011:
-- el borrado de una cuenta se lleva tarjetas, resúmenes, movimientos y cuotas
-- en cascada desde `user`, en la misma sentencia, y RESTRICT chequea fila por
-- fila según el orden en que Postgres las recorra. NO ACTION protege lo mismo
-- —no se borra una tarjeta con resúmenes ni un resumen con cuotas— pero mira
-- al final de la sentencia.
--
-- LO QUE NO CABE EN UNA FK: `installment_matches_statement`
--
-- La regla de §1.2 —una cuota de una compra con tarjeta cae en un resumen DE
-- ESA tarjeta, vence cuando vence el resumen y está pagada sólo si el resumen
-- está pagado, con la misma fecha; una cuota de una compra sin tarjeta no
-- tiene resumen— cruza tres tablas. Va en un trigger, disparado desde las
-- tres, porque cualquiera de las tres la puede romper: una cuota que cambia
-- de resumen, un movimiento que cambia de tarjeta, un resumen que cambia de
-- vencimiento o se paga.
--
-- Diferido (CONSTRAINT TRIGGER DEFERRABLE INITIALLY DEFERRED) por el mismo
-- motivo que los de la 0011: pagar un resumen es actualizar el resumen y
-- después sus cuotas, y cargar una compra es insertar el movimiento y después
-- las cuotas. Entre las dos sentencias la regla está rota; al COMMIT tiene
-- que cumplirse. Por eso las funciones releen las filas en vez de confiar en
-- NEW.
--
-- `card_statement_paid_is_frozen`: las fechas de un resumen pagado no se
-- editan (§1.3), para que el saldo no cambie sin aviso; y ningún resumen se
-- muda de tarjeta o de período. BEFORE y no diferido: no hay estado
-- intermedio legítimo.
--
-- RLS
--
-- Las dos tablas nuevas, igual que las cuatro de la 0003 con las correcciones
-- de la 0005 a la 0007: ENABLE + FORCE, privilegios para `authenticated`,
-- policy con `public.app_user_id()` y REVOKE a `anon`. Las funciones de los
-- triggers corren como quien escribe (SECURITY INVOKER), bajo esa misma RLS,
-- y con `search_path` fijo.

CREATE TABLE "card_statement" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"card_id" text NOT NULL,
	"period" text NOT NULL,
	"closing_date" date NOT NULL,
	"due_date" date NOT NULL,
	"paid_date" date,
	"usd_paid_rate" numeric(12, 4),
	CONSTRAINT "card_statement_card_id_period_unique" UNIQUE("card_id","period"),
	CONSTRAINT "card_statement_user_id_id_unique" UNIQUE("user_id","id"),
	CONSTRAINT "card_statement_period_format" CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "card_statement_due_after_closing" CHECK ("due_date" >= "closing_date"),
	CONSTRAINT "card_statement_usd_rate_only_when_paid" CHECK ("usd_paid_rate" IS NULL OR ("paid_date" IS NOT NULL AND "usd_paid_rate" > 0))
);
--> statement-breakpoint
CREATE TABLE "credit_card" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"closing_day" integer NOT NULL,
	"due_day" integer NOT NULL,
	"credit_limit_cents" bigint,
	"color" text,
	"archived" boolean DEFAULT false NOT NULL,
	CONSTRAINT "credit_card_user_id_id_unique" UNIQUE("user_id","id"),
	CONSTRAINT "credit_card_closing_day_range" CHECK ("closing_day" BETWEEN 1 AND 31),
	CONSTRAINT "credit_card_due_day_range" CHECK ("due_day" BETWEEN 1 AND 31),
	CONSTRAINT "credit_card_limit_positive" CHECK ("credit_limit_cents" IS NULL OR "credit_limit_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "installment" ADD COLUMN "statement_id" text;--> statement-breakpoint
ALTER TABLE "movement" ADD COLUMN "credit_card_id" text;--> statement-breakpoint
ALTER TABLE "card_statement" ADD CONSTRAINT "card_statement_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_statement" ADD CONSTRAINT "card_statement_user_id_card_id_credit_card_user_id_id_fk" FOREIGN KEY ("user_id","card_id") REFERENCES "public"."credit_card"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_card" ADD CONSTRAINT "credit_card_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_statement_user_due_idx" ON "card_statement" USING btree ("user_id","due_date");--> statement-breakpoint
CREATE INDEX "credit_card_user_idx" ON "credit_card" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_card_active_name_unique" ON "credit_card" USING btree ("user_id","name") WHERE archived = false;--> statement-breakpoint
ALTER TABLE "installment" ADD CONSTRAINT "installment_user_id_statement_id_card_statement_user_id_id_fk" FOREIGN KEY ("user_id","statement_id") REFERENCES "public"."card_statement"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement" ADD CONSTRAINT "movement_user_id_credit_card_id_credit_card_user_id_id_fk" FOREIGN KEY ("user_id","credit_card_id") REFERENCES "public"."credit_card"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "installment_statement_idx" ON "installment" USING btree ("statement_id");--> statement-breakpoint
CREATE INDEX "movement_credit_card_idx" ON "movement" USING btree ("credit_card_id");--> statement-breakpoint
ALTER TABLE "movement" ADD CONSTRAINT "movement_credit_card_only_expense" CHECK ("credit_card_id" IS NULL OR "kind" = 'expense');--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE "credit_card" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "card_statement" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "credit_card" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "card_statement" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "credit_card", "card_statement" TO authenticated;--> statement-breakpoint

CREATE POLICY "credit_card_own" ON "credit_card" FOR ALL TO authenticated
  USING (user_id = public.app_user_id()) WITH CHECK (user_id = public.app_user_id());--> statement-breakpoint

CREATE POLICY "card_statement_own" ON "card_statement" FOR ALL TO authenticated
  USING (user_id = public.app_user_id()) WITH CHECK (user_id = public.app_user_id());--> statement-breakpoint

REVOKE ALL ON TABLE "credit_card" FROM anon;--> statement-breakpoint
REVOKE ALL ON TABLE "card_statement" FROM anon;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- La cuota y su resumen
-- ---------------------------------------------------------------------------
-- Una sola función con la regla entera, por cuota; los tres triggers sólo
-- deciden QUÉ cuotas revisar. ERRCODE check_violation con CONSTRAINT, igual
-- que la 0011, para que `isCheckViolation` (src/lib/db-errors.ts) la
-- reconozca por nombre.

CREATE FUNCTION public.check_installment_statement(target_id text) RETURNS void
LANGUAGE plpgsql SET search_path = public, pg_catalog AS $$
DECLARE
  cuota record;
  tarjeta text;
  resumen record;
BEGIN
  SELECT movement_id, statement_id, due_date, paid, paid_date
    INTO cuota FROM installment WHERE id = target_id;
  -- Borrada en la misma transacción: no queda nada que revisar.
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT credit_card_id INTO tarjeta FROM movement WHERE id = cuota.movement_id;

  IF tarjeta IS NULL THEN
    IF cuota.statement_id IS NOT NULL THEN
      RAISE EXCEPTION 'Una cuota de una compra sin tarjeta no puede estar en un resumen.'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'installment_matches_statement';
    END IF;
    RETURN;
  END IF;

  IF cuota.statement_id IS NULL THEN
    RAISE EXCEPTION 'Cada cuota de una compra con tarjeta tiene que estar en un resumen.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'installment_matches_statement';
  END IF;

  SELECT card_id, due_date, paid_date INTO resumen FROM card_statement WHERE id = cuota.statement_id;

  IF resumen.card_id <> tarjeta THEN
    RAISE EXCEPTION 'La cuota está en un resumen de otra tarjeta.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'installment_matches_statement';
  END IF;

  IF cuota.due_date <> resumen.due_date THEN
    RAISE EXCEPTION 'Una cuota con tarjeta vence cuando vence su resumen.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'installment_matches_statement';
  END IF;

  IF cuota.paid <> (resumen.paid_date IS NOT NULL)
     OR (cuota.paid AND cuota.paid_date <> resumen.paid_date) THEN
    RAISE EXCEPTION 'Una cuota con tarjeta se paga junto con su resumen.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'installment_matches_statement';
  END IF;
END
$$;--> statement-breakpoint

-- Desde la cuota: alta, o cambio de resumen, vencimiento o pago.
CREATE FUNCTION public.installment_matches_statement() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_catalog AS $$
BEGIN
  PERFORM public.check_installment_statement(NEW.id);
  RETURN NULL;
END
$$;--> statement-breakpoint

CREATE CONSTRAINT TRIGGER "installment_matches_statement"
  AFTER INSERT OR UPDATE OF "statement_id", "due_date", "paid", "paid_date" ON "installment"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.installment_matches_statement();--> statement-breakpoint

-- Desde el movimiento: pasar una compra a otra tarjeta, a tarjeta o a
-- efectivo. Revisa TODAS sus cuotas.
CREATE FUNCTION public.movement_card_matches_statements() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_catalog AS $$
DECLARE
  fila record;
BEGIN
  FOR fila IN SELECT id FROM installment WHERE movement_id = NEW.id LOOP
    PERFORM public.check_installment_statement(fila.id);
  END LOOP;
  RETURN NULL;
END
$$;--> statement-breakpoint

CREATE CONSTRAINT TRIGGER "movement_card_matches_statements"
  AFTER UPDATE OF "credit_card_id" ON "movement"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.movement_card_matches_statements();--> statement-breakpoint

-- Desde el resumen: corregirle el vencimiento, pagarlo o desmarcarlo. Las
-- cuotas tienen que acompañarlo en la misma transacción.
CREATE FUNCTION public.statement_matches_installments() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_catalog AS $$
DECLARE
  fila record;
BEGIN
  FOR fila IN SELECT id FROM installment WHERE statement_id = NEW.id LOOP
    PERFORM public.check_installment_statement(fila.id);
  END LOOP;
  RETURN NULL;
END
$$;--> statement-breakpoint

CREATE CONSTRAINT TRIGGER "statement_matches_installments"
  AFTER UPDATE OF "due_date", "paid_date" ON "card_statement"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.statement_matches_installments();--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Un resumen pagado no cambia de fechas
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.card_statement_paid_is_frozen() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_catalog AS $$
BEGIN
  IF NEW.card_id <> OLD.card_id OR NEW.period <> OLD.period THEN
    RAISE EXCEPTION 'Un resumen no cambia de tarjeta ni de período.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'card_statement_paid_is_frozen';
  END IF;

  IF OLD.paid_date IS NOT NULL AND NEW.paid_date IS NOT NULL
     AND (NEW.closing_date <> OLD.closing_date OR NEW.due_date <> OLD.due_date) THEN
    RAISE EXCEPTION 'El resumen está pagado: desmarcalo para cambiarle las fechas.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'card_statement_paid_is_frozen';
  END IF;

  RETURN NEW;
END
$$;--> statement-breakpoint

CREATE TRIGGER "card_statement_paid_is_frozen"
  BEFORE UPDATE ON "card_statement"
  FOR EACH ROW EXECUTE FUNCTION public.card_statement_paid_is_frozen();
