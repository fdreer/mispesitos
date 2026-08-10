import { requireUser } from "@/server/session"

export default async function DashboardPage() {
  const user = await requireUser()
  return <p>Hola, {user.name}.</p>
}
