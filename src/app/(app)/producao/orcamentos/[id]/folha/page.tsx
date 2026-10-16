import { requirePageAccess } from '@/lib/auth'
import FolhaObra from './folha'

export default async function Pagina() {
  await requirePageAccess('/producao/orcamentos')
  return <FolhaObra />
}
