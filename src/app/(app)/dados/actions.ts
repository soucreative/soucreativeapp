'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import * as XLSX from 'xlsx'
import type { EmployeeInsert } from '@/types/database'

// ── helpers ────────────────────────────────────────────────────────────────

function mapStatus(v: string): 'active' | 'inactive' | 'on_leave' {
  const m: Record<string, 'active' | 'inactive' | 'on_leave'> = {
    ativo: 'active', active: 'active',
    inativo: 'inactive', inactive: 'inactive',
    'licença': 'on_leave', on_leave: 'on_leave',
  }
  return m[v.toLowerCase()] ?? 'active'
}

function mapRegime(v: string): 'full_time' | 'part_time' {
  return v?.toLowerCase().includes('part') ? 'part_time' : 'full_time'
}

function parseDate(v: unknown): string | null {
  if (!v && v !== 0) return null
  // JavaScript Date (from XLSX cellDates: true)
  if (v instanceof Date) {
    return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10)
  }
  const s = String(v).trim()
  if (!s) return null
  // DD/MM/YYYY
  const pt = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (pt) return `${pt[3]}-${pt[2].padStart(2, '0')}-${pt[1].padStart(2, '0')}`
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  // Excel serial number fallback: days since 1900-01-00 (+ leap year offset)
  const n = Number(s)
  if (!isNaN(n) && n > 1000) {
    const js = new Date(Math.round((n - 25569) * 86400 * 1000))
    if (!isNaN(js.getTime())) return js.toISOString().slice(0, 10)
  }
  return null
}

export type ImportResult = {
  inserted: number
  skipped:  number
  errors:   string[]
}

// ── Import Colaboradores ───────────────────────────────────────────────────

export async function importColaboradores(
  _prev: unknown,
  formData: FormData,
): Promise<ImportResult> {
  const session = await getCurrentEmployee()
  if (!session || !['master', 'admin', 'management'].includes(session.app_role)) {
    return { inserted: 0, skipped: 0, errors: ['Sem permissão.'] }
  }

  const file = formData.get('file') as File | null
  if (!file || !file.size) {
    return { inserted: 0, skipped: 0, errors: ['Nenhum ficheiro selecionado.'] }
  }

  // Parse file (supports .xlsx, .xls, .csv)
  let rows: Record<string, unknown>[]
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    const wb  = XLSX.read(buf, { type: 'buffer', cellDates: true })
    const ws  = wb.Sheets[wb.SheetNames[0]]
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
  } catch {
    return { inserted: 0, skipped: 0, errors: ['Não foi possível ler o ficheiro. Usa CSV ou XLSX.'] }
  }

  if (!rows.length) {
    return { inserted: 0, skipped: 0, errors: ['O ficheiro está vazio.'] }
  }

  const supabase = createAdminClient()

  // Load existing emails to detect duplicates
  const { data: existing } = await supabase.from('employees').select('email')
  const seen = new Set((existing ?? []).map(e => e.email.toLowerCase()))

  const toInsert: EmployeeInsert[] = []
  const errors: string[] = []
  let skipped = 0

  for (let i = 0; i < rows.length; i++) {
    const r   = rows[i]
    const row = i + 2 // 1-indexed + header

    const firstName = String(r['Nome']         ?? '').trim()
    const lastName  = String(r['Apelido']      ?? '').trim()
    const email     = String(r['Email']        ?? '').trim().toLowerCase()
    const role      = String(r['Função']       ?? '').trim()
    const startDate = parseDate(r['Data Entrada'])

    if (!firstName || !lastName || !email || !role || !startDate) {
      errors.push(`Linha ${row}: campos obrigatórios em falta (Nome, Apelido, Email, Função, Data Entrada).`)
      continue
    }

    if (seen.has(email)) {
      skipped++
      continue
    }
    seen.add(email)

    const regime  = mapRegime(String(r['Regime'] ?? ''))
    const daysRaw = String(r['Dias/Semana'] ?? '').trim()
    const days    = daysRaw ? Number(daysRaw) : null

    toInsert.push({
      first_name:    firstName,
      last_name:     lastName,
      email,
      phone:         String(r['Telefone']     ?? '').trim() || null,
      role,
      department:    String(r['Departamento'] ?? '').trim() || null,
      position_type: 'employee',
      app_role:      'employee',
      status:        mapStatus(String(r['Estado'] ?? '')),
      work_regime:   regime,
      days_per_week: regime === 'part_time' && days ? days : null,
      start_date:    startDate,
      end_date:      parseDate(r['Data Saída']),
      notes:         String(r['Notas'] ?? '').trim() || null,
      auth_user_id:  null,
    })
  }

  let inserted = 0
  if (toInsert.length > 0) {
    const { data, error } = await supabase.from('employees').insert(toInsert).select()
    if (error) {
      errors.push(`Erro ao inserir: ${error.message}`)
    } else {
      inserted = data?.length ?? 0
    }
  }

  revalidatePath('/colaboradores')
  revalidatePath('/dados')
  return { inserted, skipped, errors }
}
