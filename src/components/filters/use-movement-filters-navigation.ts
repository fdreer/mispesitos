"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import type { MovementSort } from "@/lib/movement-list-view"
import {
  buildMovementHref,
  FILTER_DEFAULTS,
  parseMovementQuery,
  rawParamsFromSearchParams,
  type MovementQuery,
} from "@/lib/movement-query"

const DEBOUNCE_MS = 400

function hrefToQuery(href: string, defaultSort: MovementSort): MovementQuery {
  const qs = href.split("?")[1] ?? ""
  return parseMovementQuery(rawParamsFromSearchParams(new URLSearchParams(qs)), defaultSort)
}

export function useMovementFiltersNavigation({
  basePath,
  query,
  defaultSort,
  extraParams,
}: {
  basePath: string
  query: MovementQuery
  defaultSort: MovementSort
  extraParams?: Record<string, string | undefined>
}) {
  const { push } = useRouter()
  const [search, setSearch] = useState(query.search)
  const [lastQuerySearch, setLastQuerySearch] = useState(query.search)
  if (query.search !== lastQuerySearch) {
    setLastQuerySearch(query.search)
    setSearch(query.search)
  }

  const [pending, startTransition] = useTransition()
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const queryRef = useRef(query)

  useEffect(() => {
    queryRef.current = query
  }, [query])

  useEffect(() => () => clearTimeout(searchTimeout.current), [])

  function pushHref(href: string) {
    queryRef.current = hrefToQuery(href, defaultSort)
    startTransition(() => {
      push(href)
    })
  }

  function go(patch: Partial<MovementQuery>) {
    clearTimeout(searchTimeout.current)
    const href = buildMovementHref(
      basePath,
      queryRef.current,
      patch,
      defaultSort,
      extraParams,
    )
    pushHref(href)
  }

  function handleSearchChange(value: string) {
    setSearch(value)
    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => {
      const href = buildMovementHref(
        basePath,
        queryRef.current,
        { search: value },
        defaultSort,
        extraParams,
      )
      pushHref(href)
    }, DEBOUNCE_MS)
  }

  function limpiar() {
    clearTimeout(searchTimeout.current)
    setSearch("")
    const emptyHref = buildMovementHref(
      basePath,
      queryRef.current,
      { ...FILTER_DEFAULTS, page: 1 },
      defaultSort,
      extraParams,
    )
    pushHref(emptyHref)
  }

  return {
    search,
    setSearch,
    pending,
    queryRef,
    go,
    handleSearchChange,
    limpiar,
  }
}
