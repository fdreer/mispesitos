"use client"

import { useSyncExternalStore } from "react"

const SIDEBAR_STORAGE_KEY = "mispesitos:sidebar-expanded"
const SIDEBAR_EVENT = "mispesitos:sidebar-change"

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback)
  window.addEventListener(SIDEBAR_EVENT, callback)
  return () => {
    window.removeEventListener("storage", callback)
    window.removeEventListener(SIDEBAR_EVENT, callback)
  }
}

function getSnapshot() {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true"
  } catch {
    return false
  }
}

function getServerSnapshot() {
  return false
}

/** Estado expandido/contraído de la barra lateral de escritorio, persistido en localStorage. */
export function useSidebarExpanded() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function toggleSidebar() {
  const next = !getSnapshot()
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next))
  } catch {
    // Ignorar errores de acceso al storage
  }
  window.dispatchEvent(new Event(SIDEBAR_EVENT))
}
