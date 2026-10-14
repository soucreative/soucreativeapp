'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getCurrentEmployee, getSessionWithRole } from '@/lib/auth'
import { isFullAccess } from '@/lib/permissions'
import { revalidatePath } from 'next/cache'
import type { UserRole } from '@/types/database'

export async function upsertContract(_: unknown, formData: FormData) {
  if (!(await getSessionWithRole(['management']))) return { error: 'Sem permissão.' }
  const supabase = createAdminClient()
  const employeeId = formData.get('employee_id') as string
  const contractId = formData.get('contract_id') as string | null

  const data = {
    contract_type: formData.get('contract_type') as string,
    start_date:    formData.get('start_date') as string,
    end_date:      (formData.get('end_date') as string) || null,
    status:        formData.get('status') as string,
    notes:         (formData.get('notes') as string) || null,
  }

  const { error } = contractId
    ? await supabase.from('contracts').update(data).eq('id', contractId)
    : await supabase.from('contracts').insert({ ...data, employee_id: employeeId })

  if (error) return { error: 'Erro ao guardar contrato.' }
  revalidatePath(`/colaboradores/${employeeId}`)
  return { success: true }
}

const POSITION_LABELS: Record<string, string> = {
  management:          'Management',
  director:            'Diretor',
  employee:            'Colaborador',
  professional_intern: 'Estágio Profissional',
  curricular_intern:   'Estágio Curricular',
}

export async function updateEmployeeProfile(_: unknown, formData: FormData) {
  const session = await getSessionWithRole(['management'])
  if (!session) return { error: 'Sem permissão.' }

  const supabase = createAdminClient()
  const id = formData.get('employee_id') as string
  const positionType = (formData.get('position_type') as string) || 'employee'
  const appRole = formData.get('app_role') as UserRole

  // Contas com acesso total só as mexe quem também o tem: a gestão não pode
  // promover-se a master nem despromover ou alterar um master
  if (!isFullAccess(session.app_role)) {
    const { data: target } = await supabase
      .from('employees').select('app_role').eq('id', id).maybeSingle()
    if (isFullAccess(appRole) || (target && isFullAccess(target.app_role as UserRole))) {
      return { error: 'Só um master pode alterar contas master ou admin.' }
    }
  }

  const { error } = await supabase.from('employees').update({
    first_name:   formData.get('first_name') as string,
    last_name:    formData.get('last_name') as string,
    // Vazio tem de ir a null: há um índice único no email e o "" colide entre
    // colaboradores sem email preenchido (nulls não colidem em Postgres)
    email:        ((formData.get('email') as string) ?? '').trim() || null,
    phone:        (formData.get('phone') as string) || null,
    role:          POSITION_LABELS[positionType] ?? positionType,
    department:    formData.get('department') as string,
    position_type: positionType,
    app_role:      appRole,
    status:       formData.get('status') as 'active' | 'inactive' | 'on_leave',
    work_regime:  formData.get('work_regime') as 'full_time' | 'part_time',
    days_per_week: formData.get('work_regime') === 'part_time' && formData.get('days_per_week')
      ? Number(formData.get('days_per_week')) : null,
    start_date:      formData.get('start_date') as string,
    end_date:        (formData.get('end_date') as string) || null,
    notes:           (formData.get('notes') as string) || null,
  }).eq('id', id)

  if (error) {
    // Mostrar a causa real — a mensagem genérica escondia, por exemplo, o
    // conflito de email duplicado e tornava o problema impossível de perceber
    const msg = error.code === '23505' && error.message.includes('email')
      ? 'Já existe um colaborador com esse email.'
      : `Erro ao guardar perfil: ${error.message}`
    return { error: msg }
  }

  // outros_pct: coluna adicionada via migration — update separado para não bloquear o perfil
  const outrosPctRaw = formData.get('outros_pct')
  if (outrosPctRaw !== null) {
    await supabase.from('employees')
      .update({ outros_pct: outrosPctRaw !== '' ? Number(outrosPctRaw) : 0 })
      .eq('id', id)
  }

  revalidatePath(`/colaboradores/${id}`)
  return { success: true }
}

export async function upsertCompensation(_: unknown, formData: FormData) {
  if (!(await getSessionWithRole(['management']))) return { error: 'Sem permissão.' }
  const supabase = createAdminClient()
  const employeeId = formData.get('employee_id') as string
  const variableModel = formData.get('variable_model') as string

  const effectiveDate = (formData.get('effective_date') as string)?.trim()
  if (!effectiveDate) return { error: 'Data de início obrigatória.' }

  // Fecha o registo anterior na véspera do novo — fechar com a data de hoje
  // deixava lacunas quando a alteração era retroactiva ou futura, e criava
  // registos de duração zero ao guardar duas vezes no mesmo dia. Esses
  // registos nunca chegavam a aplicar-se e o cálculo caía no salário antigo.
  const vespera = new Date(`${effectiveDate}T00:00:00Z`)
  vespera.setUTCDate(vespera.getUTCDate() - 1)

  await supabase
    .from('compensation')
    .update({ end_date: vespera.toISOString().split('T')[0] })
    .eq('employee_id', employeeId)
    .is('end_date', null)
    .lt('effective_date', effectiveDate)   // não fechar registos que começam depois

  const { error } = await supabase.from('compensation').insert({
    employee_id:    employeeId,
    base_salary:    Number(formData.get('base_salary')),
    variable_model: variableModel || null,
    effective_date: effectiveDate,
    end_date:       null,
    notes:          (formData.get('notes') as string) || null,
  })

  if (error) return { error: `Erro ao guardar remuneração: ${error.message}` }
  revalidatePath(`/colaboradores/${employeeId}`)
  return { success: true }
}

export async function deleteCompensation(id: string, employeeId: string) {
  const session = await getCurrentEmployee()
  if (!session || !['master', 'admin'].includes(session.app_role)) {
    return { error: 'Sem permissão.' }
  }
  const supabase = createAdminClient()
  const { error } = await supabase.from('compensation').delete().eq('id', id)
  if (error) return { error: 'Erro ao eliminar registo.' }
  revalidatePath(`/colaboradores/${employeeId}`)
  return { success: true }
}

export async function updateFiscalSituation(_: unknown, formData: FormData) {
  if (!(await getSessionWithRole(['management']))) return { error: 'Sem permissão.' }
  const supabase = createAdminClient()
  const employeeId = formData.get('employee_id') as string

  const { error } = await supabase
    .from('employee_tax_info')
    .upsert({
      employee_id:           employeeId,
      marital_status:        formData.get('marital_status') as string,
      dependents_count:      Number(formData.get('dependents_count') ?? 0),
      is_disabled:           formData.get('is_disabled') === 'true',
      subsidy_payment_mode:  formData.get('subsidy_payment_mode') as string || 'full',
    }, { onConflict: 'employee_id' })

  if (error) return { error: 'Erro ao guardar situação fiscal.' }
  revalidatePath(`/colaboradores/${employeeId}`)
  return { success: true }
}

export async function savePrizePayment(_: unknown, formData: FormData) {
  if (!(await getSessionWithRole(['management']))) return { error: 'Sem permissão.' }
  const supabase   = createAdminClient()
  const employeeId = formData.get('employee_id') as string
  const method     = formData.get('prize_payment_method') as string || 'payroll'
  const kmRaw      = formData.get('km_monthly_amount') as string

  const update: Record<string, unknown> = {
    prize_payment_method: method,
    km_monthly_amount: kmRaw && kmRaw.trim() !== '' ? Number(kmRaw) : null,
  }

  // Try update first; if no row exists yet, insert a minimal record
  const { data: existing } = await supabase
    .from('employee_tax_info').select('id').eq('employee_id', employeeId).maybeSingle()

  const { error } = existing
    ? await supabase.from('employee_tax_info').update(update).eq('employee_id', employeeId)
    : await supabase.from('employee_tax_info').insert({
        employee_id:          employeeId,
        prize_payment_method: method,
        km_monthly_amount:    kmRaw && kmRaw.trim() !== '' ? Number(kmRaw) : null,
        marital_status:       'single',
        dependents_count:     0,
        is_disabled:          false,
        social_security_rate: 0.11,
        meal_allowance_type:  'card',
        working_days_per_month: 22,
        subsidy_payment_mode: 'full',
      })

  if (error) return { error: 'Erro ao guardar método de pagamento.' }
  revalidatePath(`/colaboradores/${employeeId}`)
  return { success: true }
}

export async function upsertVariableRule(_: unknown, formData: FormData) {
  const session = await getCurrentEmployee()
  if (!session || !['master', 'admin', 'management'].includes(session.app_role)) {
    return { error: 'Sem permissão para configurar regras de prémio.' }
  }

  const supabase    = createAdminClient()
  const employeeId  = formData.get('employee_id') as string
  const model       = formData.get('model') as '1' | '2' | '3'
  const maxVariable = formData.get('max_variable_amount') ? Number(formData.get('max_variable_amount')) : null
  const effectiveDate = formData.get('effective_date') as string

  // Build rule_data
  let rule_data: Record<string, unknown> = {}
  if (model === '1') {
    const tiers = []
    for (let i = 0; i < 6; i++) {
      const minV = formData.get(`tier_${i}_min`)
      const maxV = formData.get(`tier_${i}_max`)
      const pctV = formData.get(`tier_${i}_pct`)
      if (minV === null || minV === '') break
      tiers.push({
        min: Number(minV),
        max: maxV && maxV !== '' ? Number(maxV) : null,
        pct: Number(pctV ?? 0) / 100,
      })
    }
    rule_data = { tiers }
  } else if (model === '2') {
    rule_data = { objectives: [] }
  } else if (model === '3') {
    const teamWeight  = Number(formData.get('team_weight')        ?? 70) / 100
    const indivWeight = Number(formData.get('individual_weight')  ?? 30) / 100
    rule_data = { team_weight: teamWeight, individual_weight: indivWeight }
  }

  // Close existing active rule
  await supabase
    .from('variable_rules')
    .update({ end_date: effectiveDate })
    .eq('employee_id', employeeId)
    .is('end_date', null)

  const { error } = await supabase.from('variable_rules').insert({
    employee_id:        employeeId,
    model,
    max_variable_amount: maxVariable,
    rule_data,
    effective_date:     effectiveDate,
    end_date:           null,
  })

  if (error) return { error: `Erro ao guardar regras: ${error.message}` }
  revalidatePath(`/colaboradores/${employeeId}`)
  return { success: true }
}

export async function inviteEmployee(_: unknown, formData: FormData) {
  const session = await getCurrentEmployee()
  if (!session || !['master', 'admin', 'management'].includes(session.app_role)) {
    return { error: 'Sem permissão para convidar colaboradores.' }
  }

  const employeeId = formData.get('employee_id') as string
  const supabase = createAdminClient()

  // O email vem da ficha e não do pedido: aceitar o do pedido deixava associar
  // a própria conta à ficha de outra pessoa e entrar com o papel dela
  const { data: target } = await supabase
    .from('employees').select('email, app_role').eq('id', employeeId).maybeSingle()
  if (!target) return { error: 'Colaborador não encontrado.' }
  if (isFullAccess(target.app_role as UserRole) && !isFullAccess(session.app_role)) {
    return { error: 'Só um master pode dar acesso a contas master ou admin.' }
  }
  const email = target.email as string | null
  if (!email) return { error: 'Email não encontrado no perfil do colaborador.' }

  // Send Supabase Auth invite
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/auth/callback`,
  })

  let authUserId: string | null = null

  if (error) {
    // User already registered — find them and link
    if (error.status === 422 || error.message?.toLowerCase().includes('already')) {
      const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 })
      const existing = list?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())
      if (existing) {
        authUserId = existing.id
      } else {
        return { error: `Erro ao convidar: ${error.message}` }
      }
    } else {
      return { error: `Erro ao convidar: ${error.message}` }
    }
  } else {
    authUserId = data.user.id
  }

  // Link auth user to employee record
  const { error: linkError } = await supabase
    .from('employees')
    .update({ auth_user_id: authUserId })
    .eq('id', employeeId)

  if (linkError) return { error: 'Convite enviado mas erro ao associar a conta. Verifica manualmente.' }

  revalidatePath(`/colaboradores/${employeeId}`)
  return { success: true, alreadyExisted: !data }
}

export async function resendInvite(_: unknown, formData: FormData) {
  const session = await getCurrentEmployee()
  if (!session || !['master', 'admin', 'management'].includes(session.app_role)) {
    return { error: 'Sem permissão para reenviar convites.' }
  }

  const email = formData.get('email') as string
  if (!email) return { error: 'Email não encontrado no perfil do colaborador.' }

  const siteUrl  = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3200'
  const supabase = await createClient()

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/auth/set-password`,
  })

  if (error) return { error: `Erro ao reenviar: ${error.message}` }
  return { success: true }
}

export async function deleteEmployee(_: unknown, formData: FormData) {
  const session = await getCurrentEmployee()
  if (!session || !['master', 'admin'].includes(session.app_role)) {
    return { error: 'Sem permissão para eliminar colaboradores.' }
  }

  const supabase    = createAdminClient()
  const employeeId  = formData.get('employee_id') as string
  const confirmation = (formData.get('confirmation') as string ?? '').trim()
  const fullName    = (formData.get('full_name') as string ?? '').trim()

  if (confirmation !== fullName) {
    return { error: 'O nome introduzido não corresponde. Operação cancelada.' }
  }

  // Remove auth user if linked
  const { data: emp } = await supabase
    .from('employees').select('auth_user_id').eq('id', employeeId).single()

  if (emp?.auth_user_id) {
    await supabase.auth.admin.deleteUser(emp.auth_user_id)
  }

  const { error } = await supabase.from('employees').delete().eq('id', employeeId)
  if (error) return { error: `Erro ao eliminar colaborador: ${error.message}` }

  revalidatePath('/colaboradores')
  return { success: true as const }
}

export async function upsertTaxInfo(_: unknown, formData: FormData) {
  if (!(await getSessionWithRole(['management']))) return { error: 'Sem permissão.' }
  const supabase = createAdminClient()
  const employeeId = formData.get('employee_id') as string

  const taxData = {
    employee_id:           employeeId,
    nif:                   (formData.get('nif') as string) || null,
    niss:                  (formData.get('niss') as string) || null,
    date_of_birth:         (formData.get('date_of_birth') as string) || null,
    address:               (formData.get('address') as string) || null,
    city:                  (formData.get('city') as string) || null,
    postal_code:           (formData.get('postal_code') as string) || null,
    iban:                  (formData.get('iban') as string) || null,
    marital_status:        formData.get('marital_status') as string,
    dependents_count:      Number(formData.get('dependents_count') ?? 0),
    is_disabled:           formData.get('is_disabled') === 'true',
    social_security_rate:  Number(formData.get('social_security_rate') ?? 0.11),
    meal_allowance_daily:  formData.get('meal_allowance_daily') ? Number(formData.get('meal_allowance_daily')) : null,
    meal_allowance_type:    (formData.get('meal_allowance_type') as string) || 'card',
    working_days_per_month: Number(formData.get('working_days_per_month') ?? 22),
    subsidy_payment_mode:   (formData.get('subsidy_payment_mode') as string) || 'full',
  }

  const { error } = await supabase
    .from('employee_tax_info')
    .upsert(taxData, { onConflict: 'employee_id' })

  if (error) return { error: 'Erro ao guardar dados fiscais.' }
  revalidatePath(`/colaboradores/${employeeId}`)
  return { success: true }
}
