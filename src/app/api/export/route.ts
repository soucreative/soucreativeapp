import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import * as XLSX from 'xlsx'

// ── helpers ────────────────────────────────────────────────────────────────

function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ''
  const keys = Object.keys(rows[0])
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }
  return [keys.join(','), ...rows.map(r => keys.map(k => esc(r[k])).join(','))].join('\n')
}

function toXLSXBuffer(rows: Record<string, unknown>[], sheet = 'Dados'): Buffer {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheet)
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
}

// ── route ──────────────────────────────────────────────────────────────────

const ALLOWED_ROLES = new Set(['master', 'admin', 'management'])

export async function GET(request: NextRequest) {
  // 1. Auth
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const admin = createAdminClient()
  // Só colaboradores ativos: a conta de quem saiu continua a existir no login
  const { data: emp } = await admin
    .from('employees')
    .select('app_role')
    .eq('auth_user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (!emp || !ALLOWED_ROLES.has(emp.app_role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const dataset = searchParams.get('dataset') ?? ''
  const format  = searchParams.get('format') === 'xlsx' ? 'xlsx' : 'csv'

  // 2. Fetch & map data
  let rows: Record<string, unknown>[] = []

  switch (dataset) {
    case 'colaboradores': {
      const { data } = await admin
        .from('employees')
        .select('*')
        .order('first_name')
      rows = (data ?? []).map(e => ({
        'Nome':         e.first_name,
        'Apelido':      e.last_name,
        'Email':        e.email,
        'Telefone':     e.phone ?? '',
        'Função':       e.role,
        'Departamento': e.department ?? '',
        'Regime':       e.work_regime === 'full_time' ? 'Full-time' : 'Part-time',
        'Dias/Semana':  e.days_per_week ?? '',
        'Estado':       e.status,
        'Data Entrada': e.start_date,
        'Data Saída':   e.end_date ?? '',
        'Notas':        e.notes ?? '',
      }))
      break
    }
    case 'remuneracoes': {
      const { data } = await admin
        .from('compensation')
        .select('*, employees(first_name, last_name, email)')
        .order('effective_date', { ascending: false })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rows = (data ?? []).map((c: any) => ({
        'Nome':             c.employees?.first_name ?? '',
        'Apelido':          c.employees?.last_name  ?? '',
        'Email':            c.employees?.email      ?? '',
        'Salário Base (€)': c.base_salary,
        'Modelo Variável':  c.variable_model ?? '',
        'Data Início':      c.effective_date,
        'Data Fim':         c.end_date ?? '',
        'Notas':            c.notes ?? '',
      }))
      break
    }
    case 'financeiro': {
      const { data } = await admin
        .from('financial_records')
        .select('*')
        .order('year', { ascending: false })
        .order('month', { ascending: false })
      rows = (data ?? []).map(r => ({
        'Ano':                    r.year,
        'Mês':                    r.month,
        'Faturação (€)':          r.revenue,
        'FSE (€)':                r.fse,
        'FSE Fornecedores (€)':   r.fse_suppliers,
        'Custos Diretos (€)':     r.direct_costs,
        'Vencimentos (€)':        r.total_payroll,
        'EBITDA (€)':             r.ebitda,
        'Notas':                  r.notes ?? '',
      }))
      break
    }
    case 'centros_custo': {
      const { data } = await admin
        .from('cost_center_records')
        .select('*')
        .order('year', { ascending: false })
        .order('month', { ascending: false })
      rows = (data ?? []).map(r => ({
        'Ano':             r.year,
        'Mês':             r.month,
        'Departamento':    r.cost_center,
        'Faturação (€)':   r.revenue,
        'FSE (€)':         r.fse,
        'Custos Diretos (€)': r.direct_costs,
        'Vencimentos (€)': r.payroll,
        'Notas':           r.notes ?? '',
      }))
      break
    }
    default:
      return NextResponse.json({ error: 'Dataset inválido' }, { status: 400 })
  }

  // 3. Respond as file
  if (format === 'xlsx') {
    const buf = toXLSXBuffer(rows, dataset)
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${dataset}.xlsx"`,
      },
    })
  }

  const csv = toCSV(rows)
  return new NextResponse(csv, {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${dataset}.csv"`,
    },
  })
}
