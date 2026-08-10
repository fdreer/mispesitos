import { MovementScreen } from "@/components/movement-screen"

type Props = {
  searchParams: Promise<{ status?: string }>
}

export default async function IngresosPage({ searchParams }: Props) {
  const { status } = await searchParams
  return <MovementScreen kind="income" statusParam={status} />
}
