import { NextResponse, type NextRequest } from 'next/server'
import { buildSyncPreview } from '@/lib/toc'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

// GET /api/toc/sync?year=2025&month=1
// Returns a preview of what would be synced (no DB writes)
export async function GET(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const emp = await getCurrentEmployee()
  if (!emp || !['master', 'admin', 'management'].includes(emp.app_role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const year  = Number(searchParams.get('year'))
  const month = Number(searchParams.get('month'))

  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json({ error: 'Ano e mês obrigatórios (1–12)' }, { status: 400 })
  }

  try {
    const preview = await buildSyncPreview(year, month)
    return NextResponse.json({ preview })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// POST /api/toc/sync  body: { year, month, revenue, fse, direct_costs }
// Applies the preview values to financial_records
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const emp = await getCurrentEmployee()
  if (!emp || !['master', 'admin', 'management'].includes(emp.app_role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  let body: {
    year: number; month: number
    revenue: number; fse: number; direct_costs: number
    financial_costs?: number; investments?: number
    unmapped_accounts?: { account_code: string; description: string; amount: number }[]
    fse_exclusion?: number; fse_exclusion_notes?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const {
    year, month, revenue, fse, direct_costs,
    financial_costs, investments, unmapped_accounts, fse_exclusion, fse_exclusion_notes,
  } = body
  if (!year || !month) return NextResponse.json({ error: 'year e month obrigatórios' }, { status: 400 })

  const supabase = createAdminClient()

  // Upsert into financial_records — only overwrite TOC fields; preserve payroll, notes, etc.
  const { data: existing } = await supabase
    .from('financial_records')
    .select('id, total_payroll, notes, fse_suppliers, other_revenue, other_revenue_notes, plunet_revenue')
    .eq('year', year).eq('month', month)
    .maybeSingle()

  const payload = {
    year, month,
    revenue,
    fse,
    direct_costs,
    // Juros e investimentos ficam abaixo do EBITDA — a coluna `ebitda` é gerada
    // e não os inclui, que é o que se quer
    financial_costs:     financial_costs ?? 0,
    investments:         investments     ?? 0,
    // Guardadas no mês para o aviso não desaparecer ao gravar: quem abrir o
    // registo volta a ver que há contas por classificar dentro daquele FSE
    unmapped_accounts:   Array.isArray(unmapped_accounts) ? unmapped_accounts.slice(0, 50) : [],
    fse_exclusion:       fse_exclusion       ?? 0,
    fse_exclusion_notes: fse_exclusion_notes ?? null,
    // Preserve fields not sourced from TOC
    total_payroll:        existing?.total_payroll        ?? 0,
    other_revenue:        existing?.other_revenue        ?? 0,
    other_revenue_notes:  existing?.other_revenue_notes  ?? null,
    plunet_revenue:       existing?.plunet_revenue       ?? 0,
    notes:                existing?.notes                ?? null,
  }

  const { error } = existing
    ? await supabase.from('financial_records').update(payload).eq('id', existing.id)
    : await supabase.from('financial_records').insert(payload)

  if (error) {
    // Estas colunas vêm de SQL que se corre à mão; diz-se qual falta
    const msg = error.message ?? ''
    const missingColumn = ['42703', 'PGRST204'].includes(error.code ?? '') ||
      /financial_costs|investments|unmapped_accounts/.test(msg)
    const ficheiro = /unmapped_accounts/.test(msg)
      ? 'supabase/financeiro-contas-por-mapear.sql'
      : 'supabase/financeiro-juros-investimentos.sql'
    return NextResponse.json({
      error: missingColumn
        ? `Falta correr ${ficheiro} no SQL Editor do Supabase.`
        : error.message,
    }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
