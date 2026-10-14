import { requirePageAccess } from '@/lib/auth'
import Documento from './documento'

export default async function Pagina() {
  await requirePageAccess('/producao/orcamentos')
  return <Documento />
}
