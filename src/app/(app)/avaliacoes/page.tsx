import { createAdminClient } from '@/lib/supabase/admin'
import { requirePageAccess } from '@/lib/auth'
import { canManageReviews } from '@/lib/permissions'
import Link from 'next/link'
import type { QuarterlyReview, Employee } from '@/types/database'

const statusLabel: Record<string, string> = {
  draft:     'Rascunho',
  submitted: 'Submetida',
  approved:  'Aprovada',
}
const statusStyle: Record<string, string> = {
  draft:     'bg-slate-100 text-slate-500 border border-slate-200',
  submitted: 'bg-amber-50 text-amber-700 border border-amber-200',
  approved:  'bg-emerald-50 text-emerald-700 border border-emerald-200',
}

function scoreColor(s: number | null) {
  if (s == null) return 'text-slate-300'
  if (s >= 8) return 'text-emerald-600'
  if (s >= 6) return 'text-amber-600'
  return 'text-red-500'
}

type ReviewRow = QuarterlyReview & {
  employee: Pick<Employee, 'id' | 'first_name' | 'last_name' | 'department'> | null
  reviewer: Pick<Employee, 'id' | 'first_name' | 'last_name'> | null
}

export default async function AvaliacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; quarter?: string; status?: string }>
}) {
  const session   = await requirePageAccess('/avaliacoes')
  const canManage = canManageReviews(session.app_role)

  const { year, quarter, status } = await searchParams
  const now         = new Date()
  const currentYear = now.getFullYear()
  const currentQ    = Math.ceil((now.getMonth() + 1) / 3)
  const filterYear  = Number(year ?? currentYear)

  const supabase = createAdminClient()

  // Quem não gere avaliações só vê as suas, e só depois de submetidas — um
  // rascunho ainda é trabalho do avaliador. O filtro é na base de dados, para
  // as avaliações dos outros nunca saírem do servidor.
  let reviewsQuery = supabase.from('quarterly_reviews').select('*').eq('year', filterYear)
  if (!canManage) reviewsQuery = reviewsQuery.eq('employee_id', session.id).neq('status', 'draft')

  const [reviewsRes, empsRes] = await Promise.all([
    reviewsQuery
      .order('quarter', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase.from('employees')
      .select('id, first_name, last_name, department')
      .order('first_name'),
  ])

  const allEmps = (empsRes.data ?? []) as Pick<Employee, 'id' | 'first_name' | 'last_name' | 'department'>[]
  const empMap  = Object.fromEntries(allEmps.map(e => [e.id, e]))

  let reviews = ((reviewsRes.data ?? []) as QuarterlyReview[]).map(r => ({
    ...r,
    employee: empMap[r.employee_id] ?? null,
    reviewer: r.reviewer_id ? (empMap[r.reviewer_id] ?? null) : null,
  })) as ReviewRow[]

  // Filters
  if (quarter) reviews = reviews.filter(r => r.quarter === Number(quarter))
  if (status)  reviews = reviews.filter(r => r.status === status)

  // KPIs from unfiltered year data
  const allYear = ((reviewsRes.data ?? []) as QuarterlyReview[])
  const totalCount   = allYear.length
  const draftCount   = allYear.filter(r => r.status === 'draft').length
  const submittedCount = allYear.filter(r => r.status === 'submitted').length
  const approvedCount  = allYear.filter(r => r.status === 'approved').length
  const scored = allYear.filter(r => r.score != null)
  const avgScore = scored.length > 0
    ? scored.reduce((s, r) => s + r.score!, 0) / scored.length
    : null

  return (
    <div className="p-8 space-y-8">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Avaliações</h1>
          <p className="text-slate-500 text-sm mt-1">
            Revisões trimestrais de desempenho — {filterYear}
          </p>
        </div>
        {canManage && (
          <Link
            href={`/avaliacoes/nova?year=${filterYear}&quarter=${currentQ}`}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            + Nova avaliação
          </Link>
        )}
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total</p>
          <p className="text-3xl font-bold text-slate-900 mt-3">{totalCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Rascunho</p>
          <p className="text-3xl font-bold text-slate-500 mt-3">{draftCount}</p>
        </div>
        <div className={`rounded-xl border p-5 ${submittedCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
          <p className={`text-xs font-semibold uppercase tracking-wider ${submittedCount > 0 ? 'text-amber-600' : 'text-slate-500'}`}>
            Submetidas
          </p>
          <p className={`text-3xl font-bold mt-3 ${submittedCount > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
            {submittedCount}
          </p>
          {submittedCount > 0 && (
            <p className="text-xs text-amber-500 mt-1">Aguardam aprovação</p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Aprovadas</p>
          <p className="text-3xl font-bold text-emerald-600 mt-3">{approvedCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Nota média</p>
          <p className={`text-3xl font-bold mt-3 tabular-nums ${scoreColor(avgScore)}`}>
            {avgScore != null ? avgScore.toFixed(1) : '—'}
          </p>
          {avgScore != null && (
            <p className="text-xs text-slate-400 mt-1">em {scored.length} avaliações com nota</p>
          )}
        </div>
      </div>

      {/* ── Filtros ───────────────────────────────────────────────── */}
      <div className="space-y-2">
        {/* Ano */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-400 font-medium w-12">Ano:</span>
          {[currentYear - 1, currentYear, currentYear + 1].map(y => (
            <FilterChip
              key={y}
              label={String(y)}
              href={`/avaliacoes?year=${y}`}
              active={y === filterYear}
            />
          ))}
        </div>
        {/* Trimestre */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-400 font-medium w-12">Trim.:</span>
          <FilterChip label="Todos" href={`/avaliacoes?year=${filterYear}${status ? `&status=${status}` : ''}`} active={!quarter} />
          {[1, 2, 3, 4].map(q => (
            <FilterChip
              key={q}
              label={`Q${q}`}
              href={`/avaliacoes?year=${filterYear}&quarter=${q}${status ? `&status=${status}` : ''}`}
              active={quarter === String(q)}
            />
          ))}
        </div>
        {/* Estado */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-400 font-medium w-12">Estado:</span>
          <FilterChip label="Todos" href={`/avaliacoes?year=${filterYear}${quarter ? `&quarter=${quarter}` : ''}`} active={!status} />
          <FilterChip label="Rascunho"  href={`/avaliacoes?year=${filterYear}${quarter ? `&quarter=${quarter}` : ''}&status=draft`}     active={status === 'draft'} />
          <FilterChip label="Submetidas" href={`/avaliacoes?year=${filterYear}${quarter ? `&quarter=${quarter}` : ''}&status=submitted`} active={status === 'submitted'} />
          <FilterChip label="Aprovadas"  href={`/avaliacoes?year=${filterYear}${quarter ? `&quarter=${quarter}` : ''}&status=approved`}  active={status === 'approved'} />
        </div>
      </div>

      {/* ── Tabela ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {reviews.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Colaborador</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Departamento</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Período</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Nota</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Avaliador</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Data</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reviews.map(r => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-3 font-medium text-slate-900">
                    {r.employee
                      ? `${r.employee.first_name} ${r.employee.last_name}`
                      : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-6 py-3 text-slate-500 text-xs">
                    {r.employee?.department ?? <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-6 py-3 text-slate-700 font-medium">
                    Q{r.quarter} <span className="text-slate-400 font-normal">{r.year}</span>
                  </td>
                  <td className="px-6 py-3 text-right">
                    {r.score != null ? (
                      <span className={`text-lg font-bold tabular-nums ${scoreColor(r.score)}`}>
                        {r.score.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-slate-300 text-sm">—</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-slate-500 text-xs">
                    {r.reviewer
                      ? `${r.reviewer.first_name} ${r.reviewer.last_name}`
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle[r.status]}`}>
                      {statusLabel[r.status]}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-slate-400 text-xs">
                    {r.approved_at
                      ? new Date(r.approved_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })
                      : r.submitted_at
                      ? new Date(r.submitted_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })
                      : new Date(r.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <Link
                      href={`/avaliacoes/${r.id}`}
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      {!canManage ? 'Ver →' : r.status === 'submitted' ? 'Aprovar →' : 'Editar →'}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="px-6 py-16 text-center text-slate-400 text-sm">
            <p className="text-base font-medium text-slate-500 mb-1">
              Sem avaliações em {filterYear}{quarter ? ` Q${quarter}` : ''}
            </p>
            {canManage && (
              <>
                <p className="mb-4">Cria a primeira avaliação trimestral para um colaborador.</p>
                <Link
                  href={`/avaliacoes/nova?year=${filterYear}&quarter=${currentQ}`}
                  className="inline-flex bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                >
                  + Nova avaliação
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function FilterChip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        active
          ? 'bg-indigo-600 text-white'
          : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600'
      }`}
    >
      {label}
    </Link>
  )
}
