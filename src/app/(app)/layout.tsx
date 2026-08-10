import { requireSettings } from "@/server/session"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireSettings()
  return <div className="mx-auto max-w-5xl px-4 py-6">{children}</div>
}
