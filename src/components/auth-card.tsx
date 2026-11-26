import Image from "next/image"

import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"

export function AuthCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center justify-center px-4 py-8">
      <Card className="w-full border border-border/80 shadow-hairline">
        <CardHeader className="gap-5 px-6 pb-5 pt-8 text-center sm:px-8">
          <div className="flex flex-col items-center gap-3">
            <Image src="/brand/mark.svg" alt="Mis Pesitos" width={48} height={60} priority className="h-12 w-auto" />
            <div className="space-y-1.5">
              <h1 className="text-2xl font-semibold tracking-tight text-paper">{title}</h1>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 px-6 pb-8 sm:px-8">{children}</CardContent>
      </Card>
    </main>
  )
}

export function AuthNotice({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {children}
    </p>
  )
}
