import { requirePageAccess } from '@/lib/auth'
import ListaOrcamentos from './_components/lista'

export default async function Pagina() {
  await requirePageAccess('/producao/orcamentos')
  return <ListaOrcamentos />
}
