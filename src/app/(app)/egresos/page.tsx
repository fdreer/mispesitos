import { MovementScreen } from "@/components/movement-screen"

type Props = {
  searchParams: Promise<{ status?: string }>
}

export default async function EgresosPage({ searchParams }: Props) {
  const { status } = await searchParams
  return <MovementScreen kind="expense" statusParam={status} />
}
