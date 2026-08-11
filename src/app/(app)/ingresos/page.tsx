import { MovementScreen } from "@/components/movement-screen"

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function IngresosPage({ searchParams }: Props) {
  return <MovementScreen kind="income" searchParams={await searchParams} />
}
