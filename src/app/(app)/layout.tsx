import { AppSidebar } from "@/components/app-sidebar"
import { requireSettings } from "@/server/session"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireSettings()

  return (
    <div className="flex">
      <AppSidebar />
      <main className="min-w-0 flex-1 px-6 py-8">
        <div className="mx-auto max-w-[1200px]">{children}</div>
      </main>
    </div>
  )
}
