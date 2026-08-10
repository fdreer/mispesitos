import { AppNav } from "@/components/app-nav"
import { requireSettings } from "@/server/session"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireSettings()

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8">
      <AppNav />
      {children}
    </div>
  )
}
