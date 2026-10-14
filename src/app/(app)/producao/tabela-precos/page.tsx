import { requirePageAccess } from '@/lib/auth'
import TabelaPrecos from './_components/tabela'

export default async function Pagina() {
  await requirePageAccess('/producao/tabela-precos')
  return <TabelaPrecos />
}
