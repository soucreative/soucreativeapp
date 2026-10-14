import { requirePageAccess } from '@/lib/auth'
import Pipeline from './_components/pipeline'

export default async function Pagina() {
  await requirePageAccess('/producao/pipeline')
  return <Pipeline />
}
