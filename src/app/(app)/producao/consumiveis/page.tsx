import { requirePageAccess } from '@/lib/auth'
import Consumiveis from './_components/consumiveis'

export default async function Pagina() {
  await requirePageAccess('/producao/consumiveis')
  return <Consumiveis />
}
