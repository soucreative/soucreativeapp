import { requirePageAccess } from '@/lib/auth'
import ListaClientes from './_components/clientes'

export default async function Pagina() {
  await requirePageAccess('/producao/clientes')
  return <ListaClientes />
}
