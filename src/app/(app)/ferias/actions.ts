'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee, getSessionWithRole } from '@/lib/auth'
import { isFullAccess } from '@/lib/permissions'
import { revalidatePath } from 'next/cache'
import { validateVacation, type VacationPeriod } from '@/lib/vacation-rules'
import { workingDaysBetween } from '@/lib/holidays'

/** Quem gere as ausências de toda a gente — as outras pessoas só tratam das suas */
const ABSENCE_MANAGERS = ['management'] as const

// ── createAbsence ──────────────────────────────────────────────────────────

export async function createAbsence(_: unknown, formData: FormData) {
  const session = await getCurrentEmployee()
  if (!session) return { error: 'Sem permissão.' }

  const supabase       = createAdminClient()
  const employeeId     = formData.get('employee_id')   as string
  const isManager      = isFullAccess(session.app_role)
    || (ABSENCE_MANAGERS as readonly string[]).includes(session.app_role)
  if (!isManager && employeeId !== session.id) return { error: 'Sem permissão.' }

  const startDate      = formData.get('start_date')    as string
  const endDate        = formData.get('end_date')      as string
  const type           = formData.get('type')          as string
  // Quem não gere ausências só as pede: ficam pendentes até alguém aprovar
  const status         = isManager ? ((formData.get('status') as string) || 'approved') : 'pending'
  const rawDays        = formData.get('working_days')  as string
  const notes          = (formData.get('notes') as string) || null
  const skipValidation = isManager && formData.get('skip_validation') === '1'

  if (!employeeId || !startDate || !endDate) return { error: 'Campos obrigatórios em falta.' }
  if (startDate > endDate) return { error: 'A data de início não pode ser posterior à data de fim.' }

  // Fetch company gift/bridge days to exclude from working day count
  const year = startDate.slice(0, 4)
  const { data: yearSettings } = await createAdminClient()
    .from('vacation_settings').select('company_gift_day, bridge_day').eq('year', Number(year)).maybeSingle()
  const companyExcluded = new Set<string>(
    [yearSettings?.company_gift_day, yearSettings?.bridge_day].filter(Boolean) as string[]
  )

  const working_days = rawDays?.trim()
    ? Number(rawDays)
    : workingDaysBetween(startDate, endDate, companyExcluded)

  // ── Company day validation ────────────────────────────────────────────────
  if (type === 'company_day') {
    if (startDate !== endDate) {
      return { error: 'Dias oferecidos devem ser registados um de cada vez (1 dia).' }
    }
    const d   = new Date(startDate + 'T00:00:00')
    const mm  = d.getMonth() + 1  // 1-12
    const dd  = d.getDate()
    const dow = d.getDay()         // 0=Sun 6=Sat
    const isGiftDay   = (mm === 12 && (dd === 24 || dd === 31))
    const isBridgeDay = (dow === 1 || dow === 5)  // Monday or Friday
    if (!isGiftDay && !isBridgeDay) {
      return { error: 'O dia oferecido deve ser 24 ou 31 de dezembro, ou uma 2ª ou 6ª feira (ponte).' }
    }
  }

  // ── Vacation-specific team validation ────────────────────────────────────
  if (type === 'vacation' && !skipValidation) {
    const year = startDate.slice(0, 4)

    const { data: empRow } = await supabase
      .from('employees').select('department').eq('id', employeeId).single()
    const dept = empRow?.department ?? null

    if (dept) {
      // Other active team members
      const { data: teammates } = await supabase
        .from('employees')
        .select('id')
        .eq('department', dept)
        .eq('status', 'active')
        .neq('id', employeeId)

      let teamPeriods: VacationPeriod[] = []
      const teamIds = (teammates ?? []).map(e => e.id)

      if (teamIds.length > 0) {
        const { data: teamAbs } = await supabase
          .from('absences')
          .select('id, employee_id, start_date, end_date, working_days')
          .in('employee_id', teamIds)
          .eq('type', 'vacation')
          .in('status', ['approved', 'pending'])
          .gte('start_date', `${year}-01-01`)
          .lte('end_date',   `${year}-12-31`)

        teamPeriods = (teamAbs ?? []).map(a => ({
          id: a.id,
          employeeId: a.employee_id,
          department: dept,
          startDate:  a.start_date,
          endDate:    a.end_date,
          workingDays: a.working_days,
        }))
      }

      // Employee's own existing vacation periods
      const { data: empAbs } = await supabase
        .from('absences')
        .select('id, employee_id, start_date, end_date, working_days')
        .eq('employee_id', employeeId)
        .eq('type', 'vacation')
        .in('status', ['approved', 'pending'])
        .gte('start_date', `${year}-01-01`)
        .lte('end_date',   `${year}-12-31`)

      const empPeriods: VacationPeriod[] = (empAbs ?? []).map(a => ({
        id: a.id,
        employeeId: a.employee_id,
        department: dept,
        startDate:  a.start_date,
        endDate:    a.end_date,
        workingDays: a.working_days,
      }))

      const newPeriod: VacationPeriod = {
        id: '',
        employeeId,
        department: dept,
        startDate,
        endDate,
        workingDays: working_days,
      }

      const violations = validateVacation(newPeriod, teamPeriods, empPeriods)
      const errors     = violations.filter(v => v.severity === 'error')
      const warnings   = violations.filter(v => v.severity === 'warning')

      if (errors.length > 0) {
        return { error: errors.map(v => v.message).join(' | '), violations }
      }

      // Insert + return warnings
      const { error: dbErr } = await supabase.from('absences').insert({
        employee_id: employeeId, type, start_date: startDate,
        end_date: endDate, working_days, status, notes,
      })
      if (dbErr) return { error: `Erro ao registar ausência: ${dbErr.message}` }

      revalidatePath(`/colaboradores/${employeeId}`)
      revalidatePath('/ferias')
      return {
        success: true as const,
        warnings: warnings.length > 0 ? warnings.map(v => v.message) : undefined,
      }
    }
  }

  // Non-vacation or no dept → insert directly
  const { error } = await supabase.from('absences').insert({
    employee_id: employeeId, type, start_date: startDate,
    end_date: endDate, working_days, status, notes,
  })
  if (error) return { error: `Erro ao registar ausência: ${error.message}` }

  revalidatePath(`/colaboradores/${employeeId}`)
  revalidatePath('/ferias')
  return { success: true as const }
}

// ── updateAbsenceStatus ────────────────────────────────────────────────────

export async function updateAbsenceStatus(_: unknown, formData: FormData) {
  if (!(await getSessionWithRole(ABSENCE_MANAGERS))) return { error: 'Sem permissão.' }
  const supabase   = createAdminClient()
  const id         = formData.get('id')          as string
  const status     = formData.get('status')      as string
  const employeeId = formData.get('employee_id') as string

  const { error } = await supabase.from('absences').update({ status }).eq('id', id)
  if (error) return { error: 'Erro ao actualizar estado.' }

  revalidatePath(`/colaboradores/${employeeId}`)
  revalidatePath('/ferias')
  return { success: true as const }
}

// ── deleteAbsence ──────────────────────────────────────────────────────────

export async function deleteAbsence(formData: FormData): Promise<void> {
  const session = await getCurrentEmployee()
  if (!session) return

  const supabase   = createAdminClient()
  const id         = formData.get('id')          as string
  const employeeId = formData.get('employee_id') as string

  // Fora da gestão e dos diretores, cada um só retira os seus pedidos pendentes
  const isManager = isFullAccess(session.app_role)
    || (ABSENCE_MANAGERS as readonly string[]).includes(session.app_role)
  if (!isManager) {
    const { data: absence } = await supabase
      .from('absences').select('employee_id, status').eq('id', id).maybeSingle()
    if (!absence || absence.employee_id !== session.id || absence.status !== 'pending') return
  }

  await supabase.from('absences').delete().eq('id', id)
  revalidatePath(`/colaboradores/${employeeId}`)
  revalidatePath('/ferias')
}

// ── upsertVacationSettings ────────────────────────────────────────────────

export async function upsertVacationSettings(_: unknown, formData: FormData) {
  const session = await getCurrentEmployee()
  if (!session || !['master', 'admin', 'management'].includes(session.app_role)) {
    return { error: 'Sem permissão.' }
  }

  const supabase        = createAdminClient()
  const year            = Number(formData.get('year'))
  const company_gift_day = (formData.get('company_gift_day') as string) || null
  const bridge_day       = (formData.get('bridge_day')       as string) || null
  const notes            = (formData.get('notes')            as string) || null

  if (!year || isNaN(year)) return { error: 'Ano inválido.' }

  // Bridge day must be Monday (1) or Friday (5)
  if (bridge_day) {
    const dow = new Date(bridge_day + 'T00:00:00').getDay()
    if (dow !== 1 && dow !== 5) {
      return { error: 'A ponte deve ser uma segunda-feira (2ª) ou uma sexta-feira (6ª).' }
    }
  }

  const { error } = await supabase
    .from('vacation_settings')
    .upsert({ year, company_gift_day, bridge_day, notes }, { onConflict: 'year' })

  if (error) return { error: `Erro ao guardar configurações: ${error.message}` }

  revalidatePath('/ferias')
  return { success: true as const }
}

// ── exchangePrizeForVacation ──────────────────────────────────────────────

export async function exchangePrizeForVacation(_: unknown, formData: FormData) {
  const session = await getCurrentEmployee()
  if (!session) return { error: 'Não autenticado.' }

  const supabase   = createAdminClient()
  const employeeId = formData.get('employee_id') as string
  const year       = Number(formData.get('year'))
  const extra_days = Number(formData.get('extra_days'))
  const notes      = (formData.get('notes') as string) || null

  // Only the employee themselves or management can submit
  if (
    session.id !== employeeId &&
    !['master', 'admin', 'management'].includes(session.app_role)
  ) {
    return { error: 'Sem permissão.' }
  }

  if (isNaN(extra_days) || extra_days < 0 || extra_days > 7) {
    return { error: 'Número de dias inválido (0–7).' }
  }

  // Get current base salary
  const { data: comp } = await supabase
    .from('compensation')
    .select('base_salary')
    .eq('employee_id', employeeId)
    .is('end_date', null)
    .order('effective_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!comp) return { error: 'Sem remuneração registada para este colaborador.' }

  const dailyRate             = comp.base_salary / 22
  const prize_amount_deducted = extra_days * dailyRate

  // Verify prize balance is sufficient
  if (extra_days > 0) {
    const { data: bonus } = await supabase
      .from('annual_bonus')
      .select('total_amount')
      .eq('employee_id', employeeId)
      .eq('year', year)
      .maybeSingle()

    if (!bonus) return { error: 'Sem prémio anual registado para este ano.' }

    if (prize_amount_deducted > bonus.total_amount) {
      const avail = bonus.total_amount.toFixed(2)
      const need  = prize_amount_deducted.toFixed(2)
      return { error: `Prémio insuficiente (disponível: ${avail}€; necessário: ${need}€).` }
    }
  }

  const { error } = await supabase
    .from('vacation_prize_exchanges')
    .upsert(
      { employee_id: employeeId, year, extra_days, prize_amount_deducted, notes },
      { onConflict: 'employee_id,year' },
    )

  if (error) return { error: `Erro ao registar troca: ${error.message}` }

  revalidatePath(`/colaboradores/${employeeId}`)
  revalidatePath('/ferias')
  return { success: true as const, extra_days, prize_amount_deducted }
}
