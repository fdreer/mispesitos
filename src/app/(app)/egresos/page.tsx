import { MovementScreen } from "@/components/movement-screen"

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function EgresosPage({ searchParams }: Props) {
  return <MovementScreen kind="expense" searchParams={await searchParams} />
}
