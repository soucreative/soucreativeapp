import { requirePageAccess } from '@/lib/auth'
import EditorOrcamento from './editor'

export default async function Pagina() {
  await requirePageAccess('/producao/orcamentos')
  return <EditorOrcamento />
}
