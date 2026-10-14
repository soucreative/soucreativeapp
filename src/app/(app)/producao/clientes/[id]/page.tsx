import { requirePageAccess } from '@/lib/auth'
import FichaCliente from './ficha'

export default async function Pagina() {
  await requirePageAccess('/producao/clientes')
  return <FichaCliente />
}
