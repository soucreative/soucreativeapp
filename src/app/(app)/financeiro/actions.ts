'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { DEPARTMENTS, OPERATIONAL_DEPTS } from '@/lib/departments'
import { fetchBillableHoursByMonth } from '@/lib/horas'
import { getCurrentEmployee, getSessionWithRole } from '@/lib/auth'
import { NAV_ACCESS } from '@/lib/permissions'
import { estimatePayrollByYear } from '@/lib/payroll'
import type {
  PayrollAbsenceRow, PayrollCompRow, PayrollContractRow, PayrollEmpRow, PayrollTaxRow,
} from '@/lib/payroll'
import { siteUrl } from '@/lib/site-url'
import { exchangeCodeForToken, saveToken } from '@/lib/toc'

/** Quem abre o Financeiro é quem pode escrever nele */
async function canEditFinance(): Promise<boolean> {
  return !!(await getSessionWithRole(NAV_ACCESS['/financeiro']))
}

// ── TOC Online: exchange auth code for tokens ──────────────────────────────
export async function exchangeTocCode(_: unknown, formData: FormData) {
  const session = await getCurrentEmployee()
  if (!session || !['master', 'admin', 'management'].includes(session.app_role)) {
    return { error: 'Sem permissão.' }
  }

  const code = (formData.get('code') as string)?.trim()
  if (!code) return { error: 'Código obrigatório.' }

  const redirectUri = `${await siteUrl()}/api/toc/callback`

  try {
    const tokens = await exchangeCodeForToken(code, redirectUri)
    await saveToken(tokens)
    revalidatePath('/financeiro')
    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return { error: msg }
  }
}

// ── TOC Online: save tokens manually (obtained via Postman/browser) ────────
export async function saveTocTokensManually(_: unknown, formData: FormData) {
  const session = await getCurrentEmployee()
  if (!session || !['master', 'admin', 'management'].includes(session.app_role)) {
    return { error: 'Sem permissão.' }
  }

  const accessToken  = (formData.get('access_token')  as string)?.trim()
  const refreshToken = (formData.get('refresh_token') as string)?.trim()
  const expiresInRaw = formData.get('expires_in')

  if (!accessToken)  return { error: 'Access token obrigatório.' }
  if (!refreshToken) return { error: 'Refresh token obrigatório.' }

  const expiresIn = expiresInRaw ? Number(expiresInRaw) : 3600
  const expiresAt = new Date(Date.now() + expiresIn * 1000 - 60_000).toISOString()

  const supabase = createAdminClient()
  const { error } = await supabase.from('toc_tokens').upsert({
    id:            1,
    access_token:  accessToken,
    refresh_token: refreshToken,
    expires_at:    expiresAt,
    updated_at:    new Date().toISOString(),
  }, { onConflict: 'id' })

  if (error) return { error: `Erro ao guardar tokens: ${error.message}` }

  revalidatePath('/financeiro')
  return { success: true }
}

function ccKey(name: string): string {
  return name
    .replace(/\s+/g, '_')
    .replace(/[áàãâ]/gi, 'a').replace(/[éèê]/gi, 'e')
    .replace(/[íì]/gi, 'i').replace(/[óòõô]/gi, 'o').replace(/[úù]/gi, 'u')
    .replace(/ç/gi, 'c').toLowerCase()
}

export async function upsertRevenueTargets(_: unknown, formData: FormData) {
  if (!(await canEditFinance())) return { error: 'Sem permissão.' }
  const supabase = createAdminClient()
  const year = Number(formData.get('year'))
  if (!year) return { error: 'Ano inválido.' }

  const errors: string[] = []

  async function save(type: string, department: string | null, targetField: string, baseField: string) {
    const rawTarget = formData.get(targetField) as string
    const rawBase   = formData.get(baseField) as string

    // Se nem target nem base foram preenchidos, não fazer nada
    if ((!rawTarget || rawTarget.trim() === '') && (!rawBase || rawBase.trim() === '')) return

    const targetValue   = rawTarget && rawTarget.trim() !== '' ? Number(rawTarget) : null
    const minimumBase   = rawBase   && rawBase.trim()   !== '' ? Number(rawBase)   : null

    if (targetValue !== null && (isNaN(targetValue) || targetValue < 0)) return
    if (minimumBase !== null && (isNaN(minimumBase) || minimumBase < 0)) return

    const title = department
      ? `Meta Faturação ${year} — ${department}`
      : `Meta Faturação ${year}`

    // Find existing objective for this slot
    const baseQuery = supabase.from('objectives')
      .select('id')
      .eq('year', year)
      .eq('type', type)
      .eq('unit', '€')

    const { data: existing, error: findErr } = department
      ? await baseQuery.eq('department', department).maybeSingle()
      : await baseQuery.is('department', null).maybeSingle()

    if (findErr) { errors.push(`Erro ao procurar objetivo (${department ?? 'empresa'}): ${findErr.message}`); return }

    const payload: Record<string, unknown> = { title }
    if (targetValue !== null) payload.target_value = targetValue
    if (minimumBase !== null) payload.minimum_base = minimumBase

    if (existing) {
      const { error } = await supabase.from('objectives')
        .update(payload)
        .eq('id', existing.id)
      if (error) errors.push(`Erro ao atualizar (${department ?? 'empresa'}): ${error.message}`)
    } else {
      const { error } = await supabase.from('objectives').insert({
        title, type, department, unit: '€', year,
        target_value: targetValue,
        minimum_base: minimumBase,
        actual_value: null,
        weight: null,
        description: null,
        responsible_id: null,
        employee_id: null,
        quarter: null,
        status: 'in_progress',
      })
      if (error) errors.push(`Erro ao criar (${department ?? 'empresa'}): ${error.message}`)
    }
  }

  await save('team', null, 'company_target', 'company_base')
  for (const dept of DEPARTMENTS) {
    await save('department', dept, `dept_${dept}`, `base_${dept}`)
  }

  // Save EBITDA margin target (for Management prize condition)
  const rawMargin = formData.get('margin_target') as string
  if (rawMargin && rawMargin.trim() !== '') {
    const marginValue = Number(rawMargin)
    if (!isNaN(marginValue) && marginValue >= 0) {
      const { data: existingMargin } = await supabase.from('objectives')
        .select('id')
        .eq('year', year)
        .eq('type', 'team')
        .eq('unit', '%')
        .is('department', null)
        .maybeSingle()

      if (existingMargin) {
        const { error } = await supabase.from('objectives')
          .update({ title: `Meta Margem EBITDA ${year}`, target_value: marginValue })
          .eq('id', existingMargin.id)
        if (error) errors.push(`Erro ao guardar margem: ${error.message}`)
      } else {
        const { error } = await supabase.from('objectives').insert({
          title: `Meta Margem EBITDA ${year}`,
          year, type: 'team', unit: '%', department: null,
          target_value: marginValue,
          minimum_base: null, actual_value: null,
          weight: null, description: null, responsible_id: null,
          employee_id: null, quarter: null, status: 'in_progress',
        })
        if (error) errors.push(`Erro ao criar margem: ${error.message}`)
      }
    }
  }

  // Tarifa hora praticada — decisão comercial, guardada ao nível da empresa e
  // não no browser de cada pessoa, para toda a gente ver o mesmo número
  const rawRate = formData.get('hourly_rate') as string
  if (rawRate && rawRate.trim() !== '') {
    const rateValue = Number(rawRate)
    if (!isNaN(rateValue) && rateValue >= 0) {
      const { data: existingRate } = await supabase.from('objectives')
        .select('id')
        .eq('year', year)
        .eq('type', 'team')
        .eq('unit', '€/h')
        .is('department', null)
        .maybeSingle()

      if (existingRate) {
        const { error } = await supabase.from('objectives')
          .update({ title: `Tarifa hora ${year}`, target_value: rateValue })
          .eq('id', existingRate.id)
        if (error) errors.push(`Erro ao guardar tarifa: ${error.message}`)
      } else {
        const { error } = await supabase.from('objectives').insert({
          title: `Tarifa hora ${year}`,
          year, type: 'team', unit: '€/h', department: null,
          target_value: rateValue,
          minimum_base: null, actual_value: null,
          weight: null, description: null, responsible_id: null,
          employee_id: null, quarter: null, status: 'in_progress',
        })
        if (error) errors.push(`Erro ao criar tarifa: ${error.message}`)
      }
    }
  }

  if (errors.length > 0) return { error: errors.join(' | ') }

  revalidatePath('/financeiro')
  revalidatePath('/')
  revalidatePath('/produtividade')
  return { success: true as const }
}

export async function upsertMonthlyRecord(_: unknown, formData: FormData) {
  if (!(await canEditFinance())) return { error: 'Sem permissão.' }
  const supabase = createAdminClient()
  const year    = Number(formData.get('year'))
  const month   = Number(formData.get('month'))
  const revenue = Number(formData.get('revenue') ?? 0)
  const otherRevenue = Number(formData.get('other_revenue') ?? 0)
  const plunetRevenue = Number(formData.get('plunet_revenue') ?? 0)
  const fse     = Number(formData.get('fse') ?? 0)
  const dc      = Number(formData.get('direct_costs') ?? 0)
  const payroll = Number(formData.get('total_payroll') ?? 0)

  const data = {
    year, month, revenue,
    other_revenue:       otherRevenue,
    other_revenue_notes: (formData.get('other_revenue_notes') as string) || null,
    plunet_revenue:      plunetRevenue,
    fse,
    direct_costs: dc,
    total_payroll: payroll,
    notes: (formData.get('notes') as string) || null,
  }

  const { data: existing } = await supabase.from('financial_records')
    .select('id').eq('year', year).eq('month', month).maybeSingle()

  const { error } = existing
    ? await supabase.from('financial_records').update(data).eq('id', existing.id)
    : await supabase.from('financial_records').insert(data)

  if (error) return { error: `Erro ao guardar registo: ${error.message}` }

  await syncDeptActuals(year)

  revalidatePath('/financeiro')
  revalidatePath('/')
  return { success: true as const }
}

export async function updateDeptActual(_: unknown, formData: FormData) {
  if (!(await canEditFinance())) return { error: 'Sem permissão.' }
  const supabase = createAdminClient()
  const id = formData.get('id') as string
  const actual_value = Number(formData.get('actual_value'))

  const { error } = await supabase.from('objectives')
    .update({ actual_value, status: 'in_progress' })
    .eq('id', id)

  if (error) return { error: 'Erro ao atualizar realizado.' }
  revalidatePath('/financeiro')
  revalidatePath('/')
  return { success: true as const }
}

// ── Auto-sync objective actuals (B4) ──────────────────────────────────────
// Called after any write to financial_records or cost_center_records.
// Updates actual_value on:
//   • team objective (type=team, unit=€)  → YTD sum from financial_records
//   • department objectives (type=dept, unit=€) → YTD sum from cost_center_records
async function syncDeptActuals(year: number) {
  const supabase = createAdminClient()

  const [ccRes, frRes] = await Promise.all([
    supabase.from('cost_center_records').select('cost_center, revenue').eq('year', year),
    supabase.from('financial_records').select('revenue, other_revenue, plunet_revenue').eq('year', year),
  ])

  // ── 1. Department objectives ────────────────────────────────────────────
  const revByDept: Record<string, number> = {}
  for (const row of (ccRes.data ?? []) as { cost_center: string; revenue: number }[]) {
    revByDept[row.cost_center] = (revByDept[row.cost_center] ?? 0) + row.revenue
  }

  for (const [dept, ytdRevenue] of Object.entries(revByDept)) {
    const { data: obj } = await supabase
      .from('objectives')
      .select('id')
      .eq('year', year)
      .eq('type', 'department')
      .eq('department', dept)
      .eq('unit', '€')
      .maybeSingle()

    if (obj) {
      await supabase.from('objectives')
        .update({ actual_value: Math.round(ytdRevenue) })
        .eq('id', obj.id)
    }
  }

  // ── 2. Team (empresa) objective ─────────────────────────────────────────
  const ytdTotal = (frRes.data ?? []).reduce((sum, r) => {
    return sum + (r.revenue ?? 0) + (r.other_revenue ?? 0) + (r.plunet_revenue ?? 0)
  }, 0)

  const { data: teamObj } = await supabase
    .from('objectives')
    .select('id')
    .eq('year', year)
    .eq('type', 'team')
    .eq('unit', '€')
    .is('department', null)
    .maybeSingle()

  if (teamObj) {
    await supabase.from('objectives')
      .update({ actual_value: Math.round(ytdTotal) })
      .eq('id', teamObj.id)
  }
}

/** Syncs cost center revenue from TOC Online sales documents using item_code → dept mapping */
export async function syncCostCenterRevenue(year: number) {
  const session = await getCurrentEmployee()
  if (!session || !['master', 'admin', 'management'].includes(session.app_role)) {
    return { error: 'Sem permissão.' }
  }

  const { getValidAccessToken, getItemMap } = await import('@/lib/toc')
  const CREDIT_TYPES = new Set(['NC', 'NCF', 'NDE', 'NDEP'])
  const TOC_API_URL  = process.env.TOC_API_URL ?? 'https://api9.toconline.pt'

  try {
    const supabase = createAdminClient()
    const [token, { map: HORA_DEPT_MAP }, { data: finRecords }, { data: empRows }] = await Promise.all([
      getValidAccessToken(),
      getItemMap(),
      supabase.from('financial_records')
        .select('month, plunet_revenue, other_revenue')
        .eq('year', year),
      supabase.from('employees')
        .select('id, department'),
    ])

    // ── Repartição fixa, se estiver definida ────────────────────────────────
    // Enquanto o registo de horas não der horas de confiança, valem percentagens postas
    // à mão. Todas a zero significa "usa as horas", sem mudar código.
    const { data: fixedRows } = await supabase
      .from('revenue_distribution')
      .select('department, share')
    const fixed = (fixedRows ?? []) as { department: string; share: number }[]
    const fixedTotal = fixed.reduce((s, r) => s + (Number(r.share) || 0), 0)

    const distByMonth: Record<number, Record<string, number>> = {}
    const mesesSemHoras: number[] = []
    const reparticao: 'fixa' | 'horas' = fixedTotal > 0 ? 'fixa' : 'horas'

    if (reparticao === 'fixa') {
      // Normaliza: as percentagens não têm de somar exactamente 100
      const dist = Object.fromEntries(
        fixed.filter(r => Number(r.share) > 0).map(r => [r.department, Number(r.share) / fixedTotal]),
      )
      for (let m = 1; m <= 12; m++) distByMonth[m] = dist
    } else {

    // ── Distribuição por mês, na proporção das horas faturáveis do registo de horas ──
    // A receita sem departamento próprio (avenças e outros proveitos) segue o
    // trabalho que foi realmente feito nesse mês.
    const deptOf = new Map<string, string>()
    for (const e of (empRows ?? []) as { id: string; department: string | null }[]) {
      if (e.department) deptOf.set(e.id, e.department)
    }

    // Sem horas não há repartição possível. Preferimos falhar a escrever
    // valores adivinhados: na interface ficariam indistinguíveis dos reais.
    let billableByMonth: Record<number, Record<string, number>>
    try {
      billableByMonth = await fetchBillableHoursByMonth(year)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'erro desconhecido'
      return { error: `Não foi possível ler as horas do registo de horas (${msg}). São elas que definem a repartição da receita pelos departamentos — sincronizar sem elas escreveria valores errados. Tenta novamente daqui a pouco.` }
    }

    /** Agrega horas faturáveis por departamento operacional */
    function horasPorDept(porUtilizador: Record<string, number>) {
      const acc: Record<string, number> = {}
      let total = 0
      for (const [uid, h] of Object.entries(porUtilizador)) {
        const dept = deptOf.get(uid)
        if (!dept || !OPERATIONAL_DEPTS.includes(dept as typeof OPERATIONAL_DEPTS[number])) continue
        acc[dept] = (acc[dept] ?? 0) + h
        total += h
      }
      return { acc, total }
    }
    const proporcoes = (acc: Record<string, number>, total: number) =>
      Object.fromEntries(Object.entries(acc).map(([d, h]) => [d, h / total]))

    // Meses sem registo caem na repartição do ano — menos específica, mas
    // continua a ser medida e não inventada
    const horasAnoPorUtilizador: Record<string, number> = {}
    for (const mes of Object.values(billableByMonth)) {
      for (const [uid, h] of Object.entries(mes)) {
        horasAnoPorUtilizador[uid] = (horasAnoPorUtilizador[uid] ?? 0) + h
      }
    }
    const anual = horasPorDept(horasAnoPorUtilizador)
    if (anual.total === 0) {
      return { error: `Não há horas faturáveis registadas no registo de horas em ${year}. A repartição da receita pelos departamentos depende delas.` }
    }
    const distAnual = proporcoes(anual.acc, anual.total)

    for (let m = 1; m <= 12; m++) {
      const { acc, total } = horasPorDept(billableByMonth[m] ?? {})
      if (total > 0) {
        distByMonth[m] = proporcoes(acc, total)
      } else {
        distByMonth[m] = distAnual
        mesesSemHoras.push(m)
      }
    }

    }  // fim da via das horas do registo de horas

    const HORA_ITEM_CODES = new Set(Object.keys(HORA_DEPT_MAP))
    const all   = await fetch(`${TOC_API_URL}/api/v1/commercial_sales_documents`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    }).then(r => r.json()) as { document_type: string; date: string; status?: number; voided_reason?: string | null; lines?: { item_code: string; net_amount: number }[] }[]

    // Aggregate net_amount per dept per month
    const revenueByMonthDept: Record<number, Record<string, number>> = {}
    // A parte que a fatura confirma, separada da que é repartida por uma regra:
    // um resultado feito quase só de pressuposto não pode parecer medido
    const directByMonthDept: Record<number, Record<string, number>> = {}
    for (let m = 1; m <= 12; m++) { revenueByMonthDept[m] = {}; directByMonthDept[m] = {} }

    // Artigos que o mapa não conhece: repartem-se como genéricos, mas ficam
    // assinalados para alguém lhes dar um departamento
    const artigosPorMapear = new Map<string, { item_code: string; amount: number }>()

    // ── 1. TOC document lines ────────────────────────────────────────────────
    const yearStr = String(year)
    for (const doc of all) {
      if (!doc.date?.startsWith(yearStr)) continue
      if (doc.status === 4 || doc.voided_reason) continue  // ignorar documentos anulados
      if (!doc.lines?.length) continue
      const month = Number(doc.date.split('-')[1])
      if (!month) continue
      const sign = CREDIT_TYPES.has(doc.document_type) ? -1 : 1

      for (const line of doc.lines) {
        const code = String(line.item_code)
        const amt  = (line.net_amount ?? 0) * sign
        // Um artigo genérico (sem departamento) é trabalho de várias equipas:
        // reparte-se pelas horas do mês, que é o que "genérica" quer dizer.
        // Antes desaparecia — e o artigo 1 sozinho vale 85 747 € em 2026.
        const known = HORA_ITEM_CODES.has(code)
        const dept  = known ? HORA_DEPT_MAP[code] : null
        if (!known) {
          const prev = artigosPorMapear.get(code)
          if (prev) prev.amount += amt
          else artigosPorMapear.set(code, { item_code: code, amount: amt })
        }

        if (!dept || dept === 'Geral') {
          for (const [d, pct] of Object.entries(distByMonth[month])) {
            revenueByMonthDept[month][d] = (revenueByMonthDept[month][d] ?? 0) + amt * pct
          }
        } else {
          revenueByMonthDept[month][dept] = (revenueByMonthDept[month][dept] ?? 0) + amt
          directByMonthDept[month][dept]  = (directByMonthDept[month][dept]  ?? 0) + amt
        }
      }
    }

    // ── 2. Plunet → Conteúdos; Outros Proveitos → horas do mês ──────────────
    for (const rec of (finRecords ?? []) as { month: number; plunet_revenue: number | null; other_revenue: number | null }[]) {
      const m = rec.month
      if (!m || m < 1 || m > 12) continue
      const plunet = rec.plunet_revenue ?? 0
      const outros = rec.other_revenue  ?? 0
      if (plunet > 0) {
        // A Plunet é toda de Conteúdos: é medida, não repartida
        revenueByMonthDept[m]['Produção'] = (revenueByMonthDept[m]['Produção'] ?? 0) + plunet
        directByMonthDept[m]['Produção']  = (directByMonthDept[m]['Produção']  ?? 0) + plunet
      }
      if (outros > 0) {
        for (const [d, pct] of Object.entries(distByMonth[m])) {
          revenueByMonthDept[m][d] = (revenueByMonthDept[m][d] ?? 0) + outros * pct
        }
      }
    }

    // Um departamento que deixe de ter receita tem de ficar a zero. Sem isto,
    // o valor da sincronização anterior permanecia — foi o que aconteceu a
    // Conteúdos, que manteve 617 € em Agosto depois de a repartição desse mês
    // lhe passar a dar 0%, inflacionando o total dos centros de custo.
    // "Outros" também: leva eventos e projetos, e pode receber faturação se um
    // código de artigo lhe for atribuído
    for (let m = 1; m <= 12; m++) {
      for (const dept of [...OPERATIONAL_DEPTS, 'Outros']) {
        revenueByMonthDept[m][dept] = revenueByMonthDept[m][dept] ?? 0
      }
    }

    // Upsert cost_center_records revenue per dept per month
    let updated = 0

    for (let m = 1; m <= 12; m++) {
      for (const [dept, revenue] of Object.entries(revenueByMonthDept[m])) {
        const rounded = Math.round(revenue * 100) / 100
        const direct  = Math.round((directByMonthDept[m][dept] ?? 0) * 100) / 100
        const { data: existing } = await supabase
          .from('cost_center_records')
          .select('id')
          .eq('year', year).eq('month', m).eq('cost_center', dept)
          .maybeSingle()

        // Sem verificar o erro, uma coluna em falta fazia a gravação não
        // acontecer e a sincronização dizer que correu bem à mesma
        const { error: wErr } = existing
          ? await supabase.from('cost_center_records')
              .update({ revenue: rounded, revenue_direct: direct }).eq('id', existing.id)
          : await supabase.from('cost_center_records').insert({
              year, month: m, cost_center: dept,
              revenue: rounded, revenue_direct: direct, fse: 0, direct_costs: 0, payroll: 0,
            })
        if (wErr) {
          const falta = ['42703', 'PGRST204'].includes(wErr.code ?? '') ||
            /revenue_direct/.test(wErr.message ?? '')
          return { error: falta
            ? 'Falta correr supabase/centros-receita-direta.sql no SQL Editor do Supabase.'
            : `Erro ao gravar ${dept} em ${m}/${year}: ${wErr.message}` }
        }
        updated++
      }
    }

    await syncDeptActuals(year)

    revalidatePath('/financeiro')
    // mesesSemHoras é informativo: nesses meses a repartição usou o peso do ano
    // em vez do peso do próprio mês, e convém o utilizador saber
    return {
      success: true,
      updated,
      reparticao,
      mesesSemHoras,
      artigosPorMapear: Array.from(artigosPorMapear.values()).sort((a, b) => b.amount - a.amount),
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return { error: msg }
  }
}

/** Recalculates payroll for all months of a year based on compensation history + absences */
export async function recalculateMonthlyPayroll(year: number) {
  const session = await getCurrentEmployee()
  if (!session || !['master', 'admin', 'management'].includes(session.app_role)) {
    return { error: 'Sem permissão.' }
  }

  const supabase = createAdminClient()

  const [empsRes, compsRes, taxRes, absRes, ctrRes, ccRes, frRes] = await Promise.all([
    supabase.from('employees').select('id, department').eq('status', 'active'),
    supabase.from('compensation').select('employee_id, base_salary, effective_date, end_date'),
    supabase.from('employee_tax_info').select('employee_id, subsidy_payment_mode, meal_allowance_daily, working_days_per_month'),
    supabase.from('absences')
      .select('employee_id, type, working_days, start_date, end_date')
      .gte('start_date', `${year}-01-01`)
      .lte('end_date',   `${year}-12-31`)
      .eq('status', 'approved'),
    supabase.from('contracts').select('employee_id, contract_type, start_date, end_date').eq('contract_type', 'internship'),
    supabase.from('cost_center_records').select('id, month, cost_center, payroll').eq('year', year),
    supabase.from('financial_records').select('id, month, total_payroll').eq('year', year),
  ])

  // O mesmo cálculo que o Financeiro e a Produtividade mostram. Havia aqui uma
  // cópia da fórmula, que ignorava os contratos de estágio e somava subsídios a
  // quem não os recebe.
  const payrollByYear = estimatePayrollByYear(
    (empsRes.data  ?? []) as PayrollEmpRow[],
    (compsRes.data ?? []) as PayrollCompRow[],
    (taxRes.data   ?? []) as PayrollTaxRow[],
    (absRes.data   ?? []) as PayrollAbsenceRow[],
    year,
    new Map(DEPARTMENTS.map(d => [d.toLowerCase(), d])),
    (ctrRes.data   ?? []) as PayrollContractRow[],
  )

  let updated = 0

  for (let m = 1; m <= 12; m++) {
    const deptPay  = payrollByYear[m].byDept
    const totalPay = payrollByYear[m].total

    // Update cost_center_records payroll per dept
    for (const [dept, pay] of Object.entries(deptPay)) {
      const existing = (ccRes.data ?? []).find((r: { month: number; cost_center: string }) => r.month === m && r.cost_center === dept)
      const rounded  = Math.round(pay)
      if (existing) {
        await supabase.from('cost_center_records').update({ payroll: rounded }).eq('id', existing.id)
        updated++
      } else {
        await supabase.from('cost_center_records').insert({
          year, month: m, cost_center: dept,
          revenue: 0, fse: 0, direct_costs: 0, payroll: rounded,
        })
        updated++
      }
    }

    // Update financial_records total_payroll
    const frRow = (frRes.data ?? []).find((r: { month: number }) => r.month === m)
    const totalRounded = Math.round(totalPay)
    if (frRow) {
      await supabase.from('financial_records').update({ total_payroll: totalRounded }).eq('id', frRow.id)
    }
  }

  revalidatePath('/financeiro')
  return { success: true, updated }
}

/** Unified: saves financial_records + cost_center_records in one shot */
export async function upsertMonthlyData(_: unknown, formData: FormData) {
  if (!(await canEditFinance())) return { error: 'Sem permissão.' }
  const supabase = createAdminClient()
  const year  = Number(formData.get('year'))
  const month = Number(formData.get('month'))
  if (!year || !month) return { error: 'Ano/mês inválido.' }

  const errors: string[] = []

  // ── 1. Global financial record ─────────────────────────────────────────
  const globalData = {
    year, month,
    revenue:              Number(formData.get('revenue')         ?? 0),
    other_revenue:        Number(formData.get('other_revenue')   ?? 0),
    other_revenue_notes:  (formData.get('other_revenue_notes') as string) || null,
    plunet_revenue:       Number(formData.get('plunet_revenue')  ?? 0),
    fse:                  Number(formData.get('fse')             ?? 0),
    direct_costs:         Number(formData.get('direct_costs')    ?? 0),
    total_payroll:        Number(formData.get('total_payroll')   ?? 0),
    notes:                (formData.get('notes') as string) || null,
  }

  const { data: existing } = await supabase.from('financial_records')
    .select('id').eq('year', year).eq('month', month).maybeSingle()

  const { error: globalErr } = existing
    ? await supabase.from('financial_records').update(globalData).eq('id', existing.id)
    : await supabase.from('financial_records').insert(globalData)

  if (globalErr) errors.push(`Registo global: ${globalErr.message}`)

  // ── 2. Cost center records ─────────────────────────────────────────────
  for (const dept of DEPARTMENTS) {
    const key = ccKey(dept)
    const ccData = {
      year, month, cost_center: dept,
      revenue:      Number(formData.get(`rev_${key}`) ?? 0) || 0,
      fse:          Number(formData.get(`fse_${key}`) ?? 0) || 0,
      direct_costs: Number(formData.get(`dc_${key}`)  ?? 0) || 0,
      payroll:      Number(formData.get(`pay_${key}`) ?? 0) || 0,
    }

    const { data: existingCc } = await supabase.from('cost_center_records')
      .select('id').eq('year', year).eq('month', month).eq('cost_center', dept).maybeSingle()

    const { error: ccErr } = existingCc
      ? await supabase.from('cost_center_records').update(ccData).eq('id', existingCc.id)
      : await supabase.from('cost_center_records').insert(ccData)

    if (ccErr) errors.push(`${dept}: ${ccErr.message}`)
  }

  if (errors.length > 0) return { error: errors.join(' | ') }

  await syncDeptActuals(year)

  revalidatePath('/financeiro')
  revalidatePath('/')
  return { success: true as const }
}

export async function upsertCostCenterRecords(_: unknown, formData: FormData) {
  if (!(await canEditFinance())) return { error: 'Sem permissão.' }
  const supabase = createAdminClient()
  const year  = Number(formData.get('year'))
  const month = Number(formData.get('month'))
  if (!year || !month) return { error: 'Ano/mês inválido.' }

  const errors: string[] = []

  for (const dept of DEPARTMENTS) {
    const key = ccKey(dept)
    const revenue = Number(formData.get(`rev_${key}`) ?? 0) || 0
    const fse     = Number(formData.get(`fse_${key}`) ?? 0) || 0
    const dc      = Number(formData.get(`dc_${key}`)  ?? 0) || 0
    const payroll = Number(formData.get(`pay_${key}`) ?? 0) || 0

    const { data: existing } = await supabase.from('cost_center_records')
      .select('id').eq('year', year).eq('month', month).eq('cost_center', dept).maybeSingle()

    const data = { year, month, cost_center: dept, revenue, fse, direct_costs: dc, payroll }

    const { error } = existing
      ? await supabase.from('cost_center_records').update(data).eq('id', existing.id)
      : await supabase.from('cost_center_records').insert(data)

    if (error) errors.push(`${dept}: ${error.message}`)
  }

  if (errors.length) return { error: errors.join(' | ') }

  await syncDeptActuals(year)

  revalidatePath('/financeiro')
  revalidatePath('/')
  return { success: true as const }
}

/** Upsert a department billing objective (target_value + optional minimum_base) */
export async function upsertDeptObjective(
  year: number,
  department: string,
  targetValue: number,
  minimumBase: number | null,
) {
  if (!(await canEditFinance())) return { error: 'Sem permissão.' }
  const supabase = createAdminClient()

  const { data: existing } = await supabase.from('objectives')
    .select('id')
    .eq('year', year).eq('type', 'department').eq('department', department)
    .maybeSingle()

  const payload = {
    year,
    type: 'department',
    department,
    unit: '€',
    title: `Meta Faturação ${year} — ${department}`,
    target_value: targetValue,
    minimum_base: minimumBase,
    status: 'in_progress',
  }

  const { error } = existing
    ? await supabase.from('objectives').update(payload).eq('id', existing.id)
    : await supabase.from('objectives').insert(payload)

  if (error) return { error: error.message }

  revalidatePath('/financeiro')
  revalidatePath('/')
  return { success: true as const }
}

// ── FSE por centro de custo, a partir das contas do TOC ────────────────────
// O balancete não é acessível pela API, mas cada linha de compra traz a conta
// SNC — e é ela que diz a que centro o custo pertence.

export async function syncCostCenterFse(year: number) {
  if (!(await canEditFinance())) return { error: 'Sem permissão.' }

  const { fetchPurchaseLines, getExpenseMap } = await import('@/lib/toc')
  const { splitExpenses, round2, sumMonths } = await import('@/lib/cost-centers')

  try {
    const { rows: expenseMap, missing } = await getExpenseMap()
    if (missing) {
      return { error: 'Falta a tabela toc_expense_map. Corre supabase/toc-expense-map.sql no SQL Editor do Supabase.' }
    }

    const lines = await fetchPurchaseLines(year)
    if (!lines.length) {
      return { error: `O TOC Online não devolveu linhas de compra para ${year}.` }
    }

    // Todos os departamentos são destino possível, não só os operacionais: uma
    // conta marcada como Comercial ou Management fica onde a puseram
    const split = splitExpenses(lines, expenseMap, DEPARTMENTS)

    // "Outros" é um centro a sério — leva eventos e projetos — por isso a
    // estrutura não pode aterrar lá. Guarda-se em Management, que é um centro
    // de overhead e já é repartido na apresentação. O mapa continua a mostrá-la
    // como "estrutura": Management é só onde ela fica guardada.
    const fseByCenter: Record<string, number[]> = { ...split.byCenter }
    fseByCenter.Management = (fseByCenter.Management ?? Array<number>(12).fill(0))
      .map((v, i) => round2(v + split.structure[i]))

    const supabase = createAdminClient()
    const { data: existingRows } = await supabase
      .from('cost_center_records')
      .select('id, month, cost_center')
      .eq('year', year)
    const existing = new Map(
      (existingRows ?? []).map(r => [`${r.month}:${r.cost_center}`, r.id as number]),
    )

    let updated = 0
    for (const [center, byMonth] of Object.entries(fseByCenter)) {
      for (let m = 1; m <= 12; m++) {
        // Um mês que deixe de ter custo tem de ficar a zero, senão fica lá o
        // valor da sincronização anterior
        const value = round2(byMonth[m - 1] ?? 0)
        const id    = existing.get(`${m}:${center}`)

        if (!id && value === 0) continue

        const { error: wErr } = id
          ? await supabase.from('cost_center_records').update({ fse: value }).eq('id', id)
          : await supabase.from('cost_center_records').insert({
              year, month: m, cost_center: center,
              revenue: 0, fse: value, direct_costs: 0, payroll: 0,
            })
        if (wErr) return { error: `Erro ao gravar ${center} em ${m}/${year}: ${wErr.message}` }
        updated++
      }
    }

    revalidatePath('/financeiro')

    return {
      success:      true as const,
      updated,
      totalFse:     round2(Object.values(fseByCenter).reduce((s, v) => s + sumMonths(v), 0)),
      byCenter:     Object.fromEntries(
        Object.entries(fseByCenter).map(([c, v]) => [c, sumMonths(v)]),
      ),
      investimento: sumMonths(split.investment),
      financeiro:   sumMonths(split.financial),
      ignorado:     sumMonths(split.ignored),
      unmapped:     split.unmapped.slice(0, 20),
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro desconhecido' }
  }
}

// ── Repartição da receita genérica pelos centros ──────────────────────────
// O pacote de horas e os outros proveitos não têm departamento próprio. Estas
// percentagens dizem a quem pertencem enquanto o registo de horas não der horas de
// confiança; todas a zero devolve a repartição às horas.

export async function upsertRevenueDistribution(
  _prev: unknown,
  formData: FormData,
): Promise<{ error?: string; ok?: boolean; total?: number }> {
  if (!(await canEditFinance())) return { error: 'Sem permissão.' }

  const linhas: { department: string; share: number }[] = []
  for (const dept of DEPARTMENTS) {
    const raw = (formData.get(`share:${dept}`) as string | null)?.trim().replace(',', '.')
    if (raw === null || raw === undefined) continue
    const n = raw === '' ? 0 : Number(raw)
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return { error: `Percentagem inválida em ${dept}: usa um número entre 0 e 100.` }
    }
    linhas.push({ department: dept, share: Math.round(n * 100) / 100 })
  }
  if (!linhas.length) return { error: 'Nada para gravar.' }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('revenue_distribution')
    .upsert(
      linhas.map(l => ({ ...l, updated_at: new Date().toISOString() })),
      { onConflict: 'department' },
    )

  if (error) {
    const missing = ['PGRST205', '42P01'].includes(error.code ?? '')
    return { error: missing
      ? 'Falta correr supabase/reparticao-receita.sql no SQL Editor do Supabase.'
      : error.message }
  }

  revalidatePath('/financeiro')
  return { ok: true, total: linhas.reduce((s, l) => s + l.share, 0) }
}
