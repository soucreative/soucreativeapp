import { requirePageAccess } from '@/lib/auth'
import ListaArtigos from './_components/artigos'

export default async function Pagina() {
  await requirePageAccess('/producao/artigos')
  return <ListaArtigos />
}
