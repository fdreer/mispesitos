import { redirect } from "next/navigation"

import { getOptionalUser } from "@/server/session"

export default async function HomePage() {
  redirect((await getOptionalUser()) ? "/dashboard" : "/login")
}
