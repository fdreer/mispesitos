"use client"

import { useActionState, useCallback, useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import { Archive, ChevronRight, FolderInput, MoreHorizontal, Pencil, Plus } from "lucide-react"

import { CategoryBadge } from "@/components/category-badge"
import { CategoryDialog, type CategoryDialogMode } from "@/components/category-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { useActionSuccess } from "@/hooks/use-action-success"
import { categoryIcon } from "@/lib/category-icons"
import { buildCategoryTree, categoryLabels } from "@/lib/category-tree"
import { cn } from "@/lib/utils"
import {
  archiveCategory,
  createCategory,
  unarchiveCategory,
} from "@/server/actions/categories"
import type { Category } from "@/server/queries"

export function CategoryManager({
  kind,
  categories,
  movementCounts = {},
}: {
  kind: "income" | "expense"
  categories: Category[]
  movementCounts?: Record<string, number>
}) {
  const [state, action, pending] = useActionState(createCategory, null)
  const [archiving, startTransition] = useTransition()
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null)
  const [dialog, setDialog] = useState<CategoryDialogMode | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const closeDialog = useCallback(() => setDialog(null), [])

  useActionSuccess(state, () => {
    toast.success("Categoría creada")
  })

  const labels = useMemo(() => categoryLabels(categories), [categories])
  const tree = useMemo(() => buildCategoryTree(categories.filter((c) => !c.archived)), [categories])
  const archivadas = categories.filter((c) => c.archived)

  function handleArchivedToggle(id: string, archived: boolean) {
    setRowError(null)
    startTransition(async () => {
      const result = archived ? await unarchiveCategory(id) : await archiveCategory(id)
      if (!result.ok) {
        setRowError({ id, message: result.message })
      } else {
        toast.success(archived ? "Categoría desarchivada" : "Categoría archivada")
      }
    })
  }

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function renderRow(category: Category, depth: 0 | 1, childCount: number) {
    const Icon = categoryIcon(category.icon)
    const isCollapsed = collapsed.has(category.id)
    const label = labels.get(category.id)!
    const childrenId = `subcategorias-${category.id}`
    return (
      // La hija lleva el MISMO hueco del chevron que su padre, más la sangría:
      // sin el hueco, la sangría quedaba por debajo de los 28px del chevron y
      // la hija se dibujaba más a la izquierda que el padre.
      <div className={cn("flex min-h-10 items-center gap-2 py-1", depth === 1 && "pl-6")}>
        {depth === 0 && childCount > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-expanded={!isCollapsed}
            aria-controls={childrenId}
            aria-label={`${isCollapsed ? "Mostrar" : "Ocultar"} subcategorías de ${category.name}`}
            onClick={() => toggle(category.id)}
          >
            <ChevronRight className={cn("transition-transform", !isCollapsed && "rotate-90")} />
          </Button>
        ) : (
          <span aria-hidden className="size-7 shrink-0" />
        )}
        {Icon ? (
          <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <span aria-hidden className="size-4 shrink-0" />
        )}
        <span className="min-w-0 flex-1">
          <CategoryBadge name={category.name} hue={label.hue} />
          {depth === 0 && childCount > 0 && isCollapsed && (
            <span className="text-muted-foreground ml-2 text-xs">
              {childCount} {childCount === 1 ? "subcategoría" : "subcategorías"}
            </span>
          )}
        </span>
        <span className="flex flex-col items-end gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={archiving}
                aria-label={`Acciones de ${category.name}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {depth === 0 && (
                <DropdownMenuItem onSelect={() => setDialog({ type: "create-child", parent: category })}>
                  <Plus />
                  Agregar subcategoría
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => setDialog({ type: "edit", category })}>
                <Pencil />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDialog({ type: "move", category })}>
                <FolderInput />
                Mover a…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => handleArchivedToggle(category.id, false)}>
                <Archive />
                {childCount > 0 ? "Archivar con sus subcategorías" : "Archivar"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {rowError?.id === category.id && (
            <p className="text-destructive text-xs">{rowError.message}</p>
          )}
        </span>
      </div>
    )
  }

  return (
    // La misma tarjeta que agrupa los bloques del dashboard y de /cambios.
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-base">
          {kind === "income" ? "De ingresos" : "De egresos"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Alta rápida de una de primer nivel: sólo el nombre. El color, el
            icono y las subcategorías se eligen después, desde su menú ⋯. El
            campo va acotado: es para un nombre, no para un párrafo. */}
        <form action={action} className="flex max-w-sm gap-2">
          <input type="hidden" name="kind" value={kind} />
          <Input name="name" placeholder="Nombre de la categoría" required maxLength={60} />
          <Button type="submit" variant="outline" disabled={pending}>
            Agregar
          </Button>
        </form>

        {state && !state.ok && <p className="text-destructive text-sm">{state.message}</p>}

        <ul className="divide-y" aria-label={kind === "income" ? "Categorías de ingresos" : "Categorías de egresos"}>
          {tree.map((node) => (
            <li key={node.id}>
              {renderRow(node, 0, node.children.length)}
              {node.children.length > 0 && !collapsed.has(node.id) && (
                <ul id={`subcategorias-${node.id}`} aria-label={`Subcategorías de ${node.name}`}>
                  {node.children.map((child) => (
                    <li key={child.id}>
                      {renderRow(child, 1, 0)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}

          {tree.length === 0 && (
            <li className="text-muted-foreground py-2 text-sm">
              No tenés categorías activas de este tipo.
            </li>
          )}

          {/* Atenuadas por opacidad y no por `text-muted-foreground`: el color
              del badge viene por `style`, que le gana a cualquier clase de
              color. */}
          {archivadas.map((c) => (
            <li key={c.id} className="flex min-h-10 items-center justify-between gap-2 py-1.5">
              <CategoryBadge {...labels.get(c.id)!} className="opacity-50" />
              <span className="flex flex-col items-end gap-1">
                <span className="flex items-center gap-2">
                  <Badge variant="outline">Archivada</Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={archiving}
                    onClick={() => handleArchivedToggle(c.id, true)}
                  >
                    Desarchivar
                  </Button>
                </span>
                {rowError?.id === c.id && (
                  <p className="text-destructive text-xs">{rowError.message}</p>
                )}
              </span>
            </li>
          ))}
        </ul>

        {archivadas.length > 0 && (
          <p className="text-muted-foreground text-xs">
            Las archivadas no aparecen al cargar un movimiento, pero los movimientos que ya las
            usaban las siguen mostrando. Desarchivar una subcategoría desarchiva también su
            categoría padre.
          </p>
        )}
      </CardContent>

      <CategoryDialog
        kind={kind}
        categories={categories}
        movementCounts={movementCounts}
        mode={dialog}
        onClose={closeDialog}
      />
    </Card>
  )
}
