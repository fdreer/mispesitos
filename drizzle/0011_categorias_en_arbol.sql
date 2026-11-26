-- Categorías en dos niveles, con color e icono (§2 del plan v2, Fase 2).
--
-- QUÉ ENTRA
--
-- * `parent_id`: la categoría padre, o NULL si es de primer nivel. Sin tabla
--   nueva: una autorreferencia alcanza para dos niveles.
-- * `color` e `icon`: claves de las listas fijas de `src/lib/category-color.ts`
--   y `src/lib/category-icons.tsx`. NULL = sin elección, que es como quedan
--   todas las que ya existían: su color sigue saliendo del hash del nombre y
--   se ven igual que antes de esta migración.
--
-- Las categorías existentes quedan todas de primer nivel (decisión 7.5 del
-- plan): no se toca ningún dato, se agrupan a mano desde /categorias.
--
-- LAS TRES REGLAS, Y POR QUÉ VIVEN ACÁ
--
-- El mismo criterio que la 0006, la 0008 y la 0009: el borde de confianza es
-- la base, no la Server Action que hoy escribe bien.
--
-- 1. El padre es del mismo usuario y del mismo tipo. FK compuesta
--    (user_id, kind, parent_id) → category (user_id, kind, id), el mismo
--    patrón que la FK de `movement`. Los triggers de integridad referencial
--    corren como dueño (BYPASSRLS): una FK sobre `parent_id` sola dejaría
--    colgar una categoría de la de otro usuario, o una de egresos de una de
--    ingresos. El destino ya existe: es el UNIQUE (user_id, kind, id) que
--    creó la 0008.
--
--    ON DELETE NO ACTION y no RESTRICT: RESTRICT mira fila por fila, en el
--    momento, y un DELETE que se lleva al padre y a sus hijas en la misma
--    sentencia (la cascada desde `user` al borrar una cuenta) podía fallar
--    según el orden en que se recorrieran las filas. NO ACTION protege lo
--    mismo —no se puede borrar un padre que conserva hijas— pero mira al
--    final de la sentencia.
--
-- 2. No hay tercer nivel (trigger `category_two_levels`). Una FK no puede
--    mirar el `parent_id` de la fila a la que apunta, así que va por trigger.
--    Cubre las dos puntas: colgar una categoría de una que ya es hija, y
--    colgar de otra a una que ya tiene hijas.
--
-- 3. Un movimiento sólo apunta a una categoría HOJA (decisión 7.4): una
--    subcategoría, o una de primer nivel sin hijas. Va en dos triggers, uno
--    por cada tabla que la puede romper: cargar un movimiento en un padre, y
--    darle la primera hija a una categoría que ya tiene movimientos.
--
--    Son CONSTRAINT TRIGGER DEFERRABLE INITIALLY DEFERRED, y es a propósito:
--    "crear la primera subcategoría de una categoría con movimientos" (§2.1)
--    es, adentro de una misma transacción, crear la hija y después pasarle
--    los movimientos. Entre las dos sentencias la regla está rota, y recién
--    vuelve a cumplirse al final. Diferidos, los dos triggers miran el estado
--    al COMMIT, no el de cada sentencia suelta.
--
--    Por eso mismo releen la fila en vez de confiar en NEW: si un movimiento
--    se actualizó dos veces en la transacción, el evento de la primera trae
--    una categoría que ya no es la suya.
--
-- RLS
--
-- No hay tabla nueva: las columnas nuevas quedan bajo la policy
-- `category_own` de la 0006, que filtra la fila entera por `user_id`. Las
-- funciones de los triggers corren con los privilegios de quien escribe
-- (SECURITY INVOKER, el default), o sea bajo esa misma RLS: sólo ven filas
-- del propio usuario, que son las únicas que pueden estar en juego porque las
-- FK compuestas ya obligan a que padre, hija y movimiento sean del mismo.
--
-- `search_path` fijo en las tres, igual que `app_user_id()` desde la 0007.
--
-- EL ÍNDICE ÚNICO DE NOMBRES
--
-- `category_active_unique` pasa a ser único entre HERMANAS: "Hogar › General"
-- y "Comida › General" tienen que poder convivir (la "General" es justamente
-- la que se propone al crear la primera subcategoría de una categoría con
-- movimientos). Conserva el nombre, así que el manejo del 23505 en
-- `createCategory` y `unarchiveCategory` no cambia. El `coalesce` hace que las
-- de primer nivel choquen entre sí: en un índice único dos NULL no son
-- iguales. Las filas existentes no pueden violarlo: el índice nuevo es más
-- permisivo que el viejo.

DROP INDEX "category_active_unique";--> statement-breakpoint
ALTER TABLE "category" ADD COLUMN "parent_id" text;--> statement-breakpoint
ALTER TABLE "category" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "category" ADD COLUMN "icon" text;--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_user_id_kind_parent_id_category_user_id_kind_id_fk" FOREIGN KEY ("user_id","kind","parent_id") REFERENCES "public"."category"("user_id","kind","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "category_parent_idx" ON "category" USING btree ("parent_id");--> statement-breakpoint
-- Lo consultan los dos triggers de categoría hoja (punto 3) y el filtro por
-- categoría de los listados.
CREATE INDEX "movement_category_idx" ON "movement" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "category_active_unique" ON "category" USING btree ("user_id","kind",coalesce("parent_id", ''),"name") WHERE archived = false;--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_not_own_parent" CHECK ("parent_id" IS NULL OR "parent_id" <> "id");--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. Dos niveles y no más
-- ---------------------------------------------------------------------------
-- BEFORE y no diferido: acá no hay ningún estado intermedio legítimo que
-- esperar. ERRCODE check_violation con CONSTRAINT para que el error llegue a
-- la app como cualquier otra CHECK, con `constraint_name` puesto (ver
-- `isCheckViolation` en src/lib/db-errors.ts).

CREATE FUNCTION public.category_two_levels() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_catalog AS $$
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM category WHERE id = NEW.parent_id AND parent_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Una subcategoría no puede tener subcategorías.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'category_two_levels';
  END IF;

  IF EXISTS (SELECT 1 FROM category WHERE parent_id = NEW.id) THEN
    RAISE EXCEPTION 'Una categoría con subcategorías no puede ser subcategoría.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'category_two_levels';
  END IF;

  RETURN NEW;
END
$$;--> statement-breakpoint

CREATE TRIGGER "category_two_levels"
  BEFORE INSERT OR UPDATE OF "parent_id" ON "category"
  FOR EACH ROW EXECUTE FUNCTION public.category_two_levels();--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 3. Los movimientos van a categorías hoja
-- ---------------------------------------------------------------------------

-- Desde `movement`: cargar o mover un movimiento a una categoría con hijas.
CREATE FUNCTION public.movement_category_is_leaf() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_catalog AS $$
DECLARE
  current_category text;
BEGIN
  -- La categoría que el movimiento tiene AL COMMIT, no la de este evento.
  SELECT category_id INTO current_category FROM movement WHERE id = NEW.id;

  IF current_category IS NOT NULL
     AND EXISTS (SELECT 1 FROM category WHERE parent_id = current_category) THEN
    RAISE EXCEPTION 'Un movimiento no puede ir a una categoría que tiene subcategorías.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'movement_category_is_leaf';
  END IF;

  RETURN NULL;
END
$$;--> statement-breakpoint

CREATE CONSTRAINT TRIGGER "movement_category_is_leaf"
  AFTER INSERT OR UPDATE OF "category_id" ON "movement"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.movement_category_is_leaf();--> statement-breakpoint

-- Desde `category`: darle una hija a una categoría que tiene movimientos.
CREATE FUNCTION public.category_parent_has_no_movements() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_catalog AS $$
DECLARE
  current_parent text;
BEGIN
  SELECT parent_id INTO current_parent FROM category WHERE id = NEW.id;

  IF current_parent IS NOT NULL
     AND EXISTS (SELECT 1 FROM movement WHERE category_id = current_parent) THEN
    RAISE EXCEPTION 'La categoría padre todavía tiene movimientos: pasalos a una subcategoría.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'movement_category_is_leaf';
  END IF;

  RETURN NULL;
END
$$;--> statement-breakpoint

CREATE CONSTRAINT TRIGGER "category_parent_has_no_movements"
  AFTER INSERT OR UPDATE OF "parent_id" ON "category"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.category_parent_has_no_movements();
