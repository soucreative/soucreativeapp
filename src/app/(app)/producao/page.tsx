import { requirePageAccess } from '@/lib/auth'
import PainelProducao from './_components/painel'

export default async function Pagina() {
  await requirePageAccess('/producao')
  return <PainelProducao />
}
