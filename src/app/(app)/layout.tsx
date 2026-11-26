import { Suspense } from "react"

import { AppSidebar } from "@/components/app-sidebar"
import { MobileQuickAddLoader } from "@/components/mobile-quick-add-loader"
import { requireSettings } from "@/server/session"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireSettings()

  return (
    // Fila sólo desde `lg`: por debajo, el riel de escritorio no existe y la
    // barra inferior fija móvil necesita padding inferior + safe-area en `main`
    // para que el último bloque o botón nunca quede tapado.
    <div className="lg:flex">
      <AppSidebar />
      <Suspense fallback={null}>
        <MobileQuickAddLoader />
      </Suspense>
      <main className="min-w-0 flex-1 px-4 pt-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-8 lg:pb-8">
        <div className="mx-auto max-w-[1200px]">{children}</div>
      </main>
    </div>
  )
}
