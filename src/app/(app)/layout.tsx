import { AppSidebar } from "@/components/app-sidebar"
import { requireSettings } from "@/server/session"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireSettings()

  return (
    // Fila sólo desde `lg`: por debajo, la barra mobile de AppSidebar tiene
    // que apilarse arriba de `main`, no ir al lado.
    <div className="lg:flex">
      <AppSidebar />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <div className="mx-auto max-w-[1200px]">{children}</div>
      </main>
    </div>
  )
}
