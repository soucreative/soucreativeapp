'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import * as XLSX from 'xlsx'

// ── Types ─────────────────────────────────────────────────────────────────

export type TocFormat = 'salary_full' | 'salary_category' | 'cadastral' | 'salary_basic'

export type TocRow = {
  toc_code:   number
  nome:       string
  admissao:   string | null
  salario:    number | null
  // personal (file 1)
  date_of_birth: string | null
  iban:          string | null
  nif:           string | null
  cc:            string | null
  // category (file 2)
  job_title:     string | null
  // cadastral (file 3)
  meal_allowance_daily:  number | null
  meal_allowance_type:   'card' | 'cash' | null
  subsidy_payment_mode:  'full' | 'twelfths' | null
  marital_status:        'single' | 'married_two_earners' | 'married_single_earner' | null
  dependents_count:      number | null
}

export type MatchedRow = TocRow & {
  employee_id:    string | null
  db_name:        string | null
  current_salary: number | null
  status: 'match' | 'no_match' | 'no_change'
  format: TocFormat
}

const NAZARE_CODE = 21

function norm(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
}

function parseDate(v: unknown): string | null {
  if (!v) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'string' && /\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10)
  return null
}

function parseStr(v: unknown): string | null {
  const s = String(v ?? '').trim()
  return s || null
}

// ── Detect format from header row ─────────────────────────────────────────

function detectFormat(header: string[]): TocFormat {
  const h = header.join('|').toLowerCase()
  if (h.includes('subsidio de alimenta') || h.includes('subsídio de alimenta') || h.includes('tipo de funcionário') || h.includes('tipo de funcionario')) return 'cadastral'
  if (h.includes('data de nascimento') || h.includes('iban') || h.includes('nif')) return 'salary_full'
  if (h.includes('categoria') || h.includes('descrição') || h.includes('descricao')) return 'salary_category'
  return 'salary_basic'
}

// ── Parse rows from sheet ─────────────────────────────────────────────────

function parseRows(raw: unknown[][], format: TocFormat): TocRow[] {
  const headerIdx = raw.findIndex(r =>
    Array.isArray(r) && r.some(c => String(c).includes('Nome completo'))
  )
  if (headerIdx === -1) return []

  const header = (raw[headerIdx] as unknown[]).map(c => String(c).trim())
  const col = (name: string) => header.findIndex(h => norm(h).includes(norm(name)))

  const iNome    = col('Nome completo')
  const iCode    = col('Código')
  const iAdmiss  = col('Data de admissão')
  const iSalario = col('Vencimento')
  const iDob     = col('Data de nascimento')
  const iIban    = col('IBAN')
  const iNif     = col('NIF')
  const iCc      = col('BI / CC')
  const iDescr   = col('Descrição')
  const iMeal    = col('Subsídio de alimentação')
  const iMealPay = col('Pag. sub. de alimentação')
  const iSubFer  = col('Pag. sub. de férias')
  const iEstate  = col('Estado fiscal')
  const iDeps    = col('N. total de dependentes')

  const rows: TocRow[] = []
  for (let i = headerIdx + 1; i < raw.length; i++) {
    const r = raw[i] as unknown[]
    const nome = parseStr(r[iNome])
    if (!nome) continue

    const code = iCode >= 0 ? Number(r[iCode]) : 0
    if (code === NAZARE_CODE) continue

    const salRaw = iSalario >= 0 ? r[iSalario] : null
    const sal    = salRaw != null && salRaw !== '' ? parseFloat(String(salRaw).replace(',', '.')) : null

    // marital status
    let marital: 'single' | 'married_two_earners' | 'married_single_earner' | null = null
    if (iEstate >= 0) {
      const estate = norm(String(r[iEstate] ?? ''))
      if (estate.includes('nao casado') || estate.includes('não casado')) marital = 'single'
      else if (estate.includes('2 titular')) marital = 'married_two_earners'
      else if (estate.includes('1 titular')) marital = 'married_single_earner'
    }

    // subsidy payment mode (férias)
    let subMode: 'full' | 'twelfths' | null = null
    if (iSubFer >= 0) {
      const v = norm(String(r[iSubFer] ?? ''))
      if (v.includes('duodecimo') || v.includes('duodécimo')) subMode = 'twelfths'
      else if (v.includes('sem duo') || v.includes('sem duod')) subMode = 'full'
    }

    // meal allowance type
    let mealType: 'card' | 'cash' | null = null
    if (iMealPay >= 0) {
      const v = norm(String(r[iMealPay] ?? ''))
      if (v.includes('ticket') || v.includes('cartao') || v.includes('cartão')) mealType = 'card'
      else if (v.includes('dinheiro') || v.includes('numerario')) mealType = 'cash'
    }

    rows.push({
      toc_code:   code,
      nome,
      admissao:              iAdmiss >= 0 ? parseDate(r[iAdmiss]) : null,
      salario:               sal && sal > 0 ? sal : null,
      date_of_birth:         iDob     >= 0 ? parseDate(r[iDob])     : null,
      iban:                  iIban    >= 0 ? parseStr(r[iIban])     : null,
      nif:                   iNif     >= 0 ? parseStr(r[iNif])      : null,
      cc:                    iCc      >= 0 ? parseStr(r[iCc])       : null,
      job_title:             iDescr   >= 0 ? parseStr(r[iDescr])    : null,
      meal_allowance_daily:  iMeal    >= 0 && r[iMeal] !== '' ? Number(r[iMeal]) : null,
      meal_allowance_type:   mealType,
      subsidy_payment_mode:  subMode,
      marital_status:        marital,
      dependents_count:      iDeps    >= 0 && r[iDeps] !== '' ? Number(r[iDeps]) : null,
    })
  }
  return rows
}

// ── parseTocExcel ─────────────────────────────────────────────────────────

export async function parseTocExcel(_: unknown, formData: FormData): Promise<{
  error?: string
  rows?: MatchedRow[]
  format?: TocFormat
}> {
  const session = await getCurrentEmployee()
  if (!session || !['master', 'admin', 'management'].includes(session.app_role)) {
    return { error: 'Sem permissão.' }
  }

  const file = formData.get('file') as File | null
  if (!file) return { error: 'Ficheiro em falta.' }

  const buffer = Buffer.from(await file.arrayBuffer())
  const wb     = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const ws     = wb.Sheets[wb.SheetNames[0]]
  const raw    = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

  const headerIdx = raw.findIndex(r =>
    Array.isArray(r) && r.some(c => String(c).includes('Nome completo'))
  )
  if (headerIdx === -1) return { error: 'Formato não reconhecido — cabeçalho "Nome completo" não encontrado.' }

  const header = (raw[headerIdx] as unknown[]).map(c => String(c).trim())
  const format = detectFormat(header)
  const tocRows = parseRows(raw, format)
  if (tocRows.length === 0) return { error: 'Nenhuma linha de dados encontrada.' }

  // Fetch employees + current salary
  const supabase = createAdminClient()
  const { data: employees } = await supabase
    .from('employees').select('id, first_name, last_name').eq('status', 'active')

  const { data: comps } = await supabase
    .from('compensation').select('employee_id, base_salary')
    .is('end_date', null).order('effective_date', { ascending: false })

  const latestSalary: Record<string, number> = {}
  for (const c of (comps ?? [])) {
    if (!(c.employee_id in latestSalary)) latestSalary[c.employee_id] = c.base_salary
  }

  const rows: MatchedRow[] = tocRows.map(toc => {
    const normToc = norm(toc.nome)
    const match   = (employees ?? []).find(e => {
      const full = norm(`${e.first_name} ${e.last_name}`)
      return full === normToc || normToc.includes(full) || full.includes(normToc)
    })
    if (!match) return { ...toc, employee_id: null, db_name: null, current_salary: null, status: 'no_match', format }

    const current      = latestSalary[match.id] ?? null
    const salaryChanged = toc.salario != null && current !== toc.salario
    const hasExtraData  = !!(toc.nif || toc.iban || toc.date_of_birth || toc.job_title ||
                             toc.meal_allowance_daily != null || toc.marital_status ||
                             toc.subsidy_payment_mode || toc.admissao)
    const status = salaryChanged || hasExtraData ? 'match' : 'no_change'

    return { ...toc, employee_id: match.id, db_name: `${match.first_name} ${match.last_name}`, current_salary: current, status, format }
  })

  return { rows, format }
}

// ── applyTocImport ────────────────────────────────────────────────────────

export async function applyTocImport(_: unknown, formData: FormData): Promise<{
  error?: string
  updated?: number
  skipped?: number
  details?: string[]
}> {
  const session = await getCurrentEmployee()
  if (!session || !['master', 'admin', 'management'].includes(session.app_role)) {
    return { error: 'Sem permissão.' }
  }

  const rawRows       = formData.get('rows') as string
  const effectiveDate = (formData.get('effective_date') as string) || new Date().toISOString().slice(0, 10)
  if (!rawRows) return { error: 'Dados em falta.' }

  let rows: MatchedRow[]
  try { rows = JSON.parse(rawRows) } catch { return { error: 'Dados inválidos.' } }

  const toApply = rows.filter(r => r.employee_id && r.status !== 'no_match')
  if (toApply.length === 0) return { updated: 0, skipped: rows.length }

  const supabase  = createAdminClient()
  const importNote = `Importado TOC Online — ${new Date().toLocaleDateString('pt-PT')}`
  let updated = 0
  const details: string[] = []

  for (const row of toApply) {
    const empId = row.employee_id!

    // ── Compensation ────────────────────────────────────────────────────
    if (row.salario != null && row.status === 'match') {
      await supabase.from('compensation')
        .update({ end_date: effectiveDate })
        .eq('employee_id', empId).is('end_date', null)

      await supabase.from('compensation').insert({
        employee_id:    empId,
        base_salary:    row.salario,
        effective_date: effectiveDate,
        end_date:       null,
        variable_model: null,
        notes:          importNote,
      })
      details.push(`${row.db_name}: salário → ${row.salario}€`)
    }

    // ── Employee: start_date, job_title ─────────────────────────────────
    const empUpdate: Record<string, unknown> = {}
    if (row.admissao)   empUpdate.start_date = row.admissao
    if (row.job_title)  empUpdate.role        = row.job_title
    if (Object.keys(empUpdate).length > 0) {
      await supabase.from('employees').update(empUpdate).eq('id', empId)
    }

    // ── Contract: upsert active contract with start_date ─────────────────
    if (row.admissao) {
      const { data: existingContract } = await supabase
        .from('contracts')
        .select('id')
        .eq('employee_id', empId)
        .eq('status', 'active')
        .maybeSingle()

      if (existingContract) {
        await supabase.from('contracts')
          .update({ start_date: row.admissao })
          .eq('id', existingContract.id)
      } else {
        await supabase.from('contracts').insert({
          employee_id:   empId,
          contract_type: 'permanent',
          start_date:    row.admissao,
          end_date:      null,
          status:        'active',
          document_url:  null,
          notes:         importNote,
        })
      }
      details.push(`${row.db_name}: contrato → ${row.admissao}`)
    }

    // ── EmployeeTaxInfo: upsert ─────────────────────────────────────────
    const taxUpdate: Record<string, unknown> = {}
    if (row.nif            != null) taxUpdate.nif                  = row.nif
    if (row.iban           != null) taxUpdate.iban                 = row.iban
    if (row.date_of_birth  != null) taxUpdate.date_of_birth        = row.date_of_birth
    if (row.meal_allowance_daily != null) taxUpdate.meal_allowance_daily = row.meal_allowance_daily
    if (row.meal_allowance_type  != null) taxUpdate.meal_allowance_type  = row.meal_allowance_type
    if (row.subsidy_payment_mode != null) taxUpdate.subsidy_payment_mode = row.subsidy_payment_mode
    if (row.marital_status       != null) taxUpdate.marital_status       = row.marital_status
    if (row.dependents_count     != null) taxUpdate.dependents_count     = row.dependents_count

    if (Object.keys(taxUpdate).length > 0) {
      const { data: existing, error: fetchErr } = await supabase
        .from('employee_tax_info').select('id').eq('employee_id', empId).maybeSingle()

      if (fetchErr) {
        details.push(`⚠ ${row.db_name}: erro ao verificar dados fiscais — ${fetchErr.message}`)
      } else if (existing) {
        const { error: updErr } = await supabase
          .from('employee_tax_info').update(taxUpdate).eq('employee_id', empId)
        if (updErr) details.push(`⚠ ${row.db_name}: erro ao actualizar dados fiscais — ${updErr.message}`)
        else        details.push(`${row.db_name}: dados fiscais actualizados`)
      } else {
        const { error: insErr } = await supabase.from('employee_tax_info').insert({
          employee_id:            empId,
          nif:                    null,
          niss:                   null,
          date_of_birth:          null,
          address:                null,
          city:                   null,
          postal_code:            null,
          iban:                   null,
          marital_status:         'single',
          dependents_count:       0,
          is_disabled:            false,
          social_security_rate:   11,
          meal_allowance_daily:   null,
          meal_allowance_type:    'card',
          working_days_per_month: 22,
          subsidy_payment_mode:   'full',
          prize_payment_method:   'payroll',
          km_monthly_amount:      null,
          ...taxUpdate,
        })
        if (insErr) details.push(`⚠ ${row.db_name}: erro ao criar dados fiscais — ${insErr.message}`)
        else        details.push(`${row.db_name}: dados fiscais criados`)
      }
    }

    updated++
  }

  revalidatePath('/colaboradores')
  return { updated, skipped: rows.length - updated, details }
}
