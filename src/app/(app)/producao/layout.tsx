import { redirect } from 'next/navigation'
import { getSessionWithRole } from '@/lib/auth'
import { carregarDadosProducao } from './_lib/dados'
import { HidratarProducao } from './_lib/hidratar'

export const dynamic = 'force-dynamic'

// Cada página da Produção verifica o seu próprio acesso (requirePageAccess);
// o layout só carrega os dados que todas partilham.
export default async function LayoutProducao({ children }: { children: React.ReactNode }) {
  // Verificado também aqui: os dados do layout seguem para o browser mesmo que
  // a página a seguir recuse o acesso.
  if (!(await getSessionWithRole(['management', 'director', 'employee']))) redirect('/perfil')
  const dados = await carregarDadosProducao()
  return (
    <HidratarProducao dados={dados}>
      <div className="min-h-full bg-papel p-6 sm:p-8">{children}</div>
    </HidratarProducao>
  )
}
