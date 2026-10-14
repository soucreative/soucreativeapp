import { requirePageAccess } from '@/lib/auth'
import { isFullAccess } from '@/lib/permissions'
import { createAdminClient } from '@/lib/supabase/admin'
import RegistoHoras, { type Entrada } from './_components/registo-horas'

export const dynamic = 'force-dynamic'

export default async function PaginaHoras({ searchParams }: { searchParams: Promise<{ mes?: string; pessoa?: string }> }) {
  const s = await requirePageAccess('/horas')
  const { mes: mesParam, pessoa } = await searchParams
  const gestor = isFullAccess(s.app_role) || ['management', 'director'].includes(s.app_role)

  const hoje = new Date()
  const mes = /^\d{4}-\d{2}$/.test(mesParam ?? '') ? mesParam! : `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
  const [ano, m] = mes.split('-').map(Number)
  const ultimoDia = new Date(ano, m, 0).getDate()

  const admin = createAdminClient()
  let consulta = admin
    .from('time_entries')
    .select('id, employee_id, date, hours, billable, orcamento_id, description')
    .gte('date', `${mes}-01`)
    .lte('date', `${mes}-${String(ultimoDia).padStart(2, '0')}`)
    .order('date', { ascending: false })
  // Quem não gere vê só as suas; a gestão vê toda a gente ou uma pessoa
  if (!gestor) consulta = consulta.eq('employee_id', s.id)
  else if (pessoa) consulta = consulta.eq('employee_id', pessoa)

  const [entradasRes, pessoasRes, orcRes] = await Promise.all([
    consulta,
    admin.from('employees').select('id, first_name, last_name').eq('status', 'active').order('first_name'),
    admin.from('prod_orcamentos').select('id, numero, conteudo->>titulo, estado').in('estado', ['enviado', 'ganho']).order('numero', { ascending: false }).limit(200),
  ])

  return (
    <div className="min-h-full bg-papel p-6 sm:p-8">
      <RegistoHoras
        mes={mes}
        pessoa={pessoa ?? ''}
        gestor={gestor}
        euId={s.id}
        entradas={(entradasRes.data ?? []) as Entrada[]}
        pessoas={(pessoasRes.data ?? []).map(p => ({ id: p.id as string, nome: `${p.first_name} ${p.last_name}` }))}
        orcamentos={(orcRes.data ?? []).map(o => ({ id: o.id as string, nome: `${o.numero}${o.titulo ? ` · ${o.titulo}` : ''}` }))}
      />
    </div>
  )
}
