import { requirePageAccess } from '@/lib/auth'
import EditorParametros from './_components/parametros'

export default async function Pagina() {
  await requirePageAccess('/producao/parametros')
  return <EditorParametros />
}
