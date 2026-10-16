'use client'

import { useActionState, useState } from 'react'
import type { Employee, EmployeeTaxInfo, Contract } from '@/types/database'
import { updateEmployeeProfile, updateFiscalSituation, inviteEmployee, resendInvite } from '../actions'
import { EMPLOYEE_DEPARTMENTS } from '@/lib/departments'

const irsTableLabel: Record<string, string> = {
  single_0_false:                  'Tabela I',
  single_0_true:                   'Tabela IV',
  single_dep_false:                'Tabela II',
  single_dep_true:                 'Tabela V',
  married_two_earners_0_false:     'Tabela I',
  married_two_earners_0_true:      'Tabela IV',
  married_two_earners_dep_false:   'Tabela I',
  married_two_earners_dep_true:    'Tabela VI',
  married_single_earner_0_false:   'Tabela III',
  married_single_earner_0_true:    'Tabela VII',
  married_single_earner_dep_false: 'Tabela III',
  married_single_earner_dep_true:  'Tabela VII',
}

function FiscalSituationForm({ employeeId, tax }: { employeeId: string; tax: EmployeeTaxInfo | null }) {
  const [state, action, pending] = useActionState(updateFiscalSituation, null)
  const [marital, setMarital] = useState<string>(tax?.marital_status ?? 'single')
  const [deps, setDeps] = useState(tax?.dependents_count ?? 0)
  const [disabled, setDisabled] = useState(tax?.is_disabled ?? false)

  const key = `${marital}_${deps > 0 ? 'dep' : '0'}_${disabled}`
  const tableLabel = irsTableLabel[key] ?? '—'

  return (
    <form action={action} className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
      <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Situação para IRS</h3>
      <input type="hidden" name="employee_id" value={employeeId} />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Estado civil / Situação</label>
          <select name="marital_status" value={marital}
            onChange={(e) => setMarital(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
            <option value="single">Não casado(a)</option>
            <option value="married_two_earners">Casado(a) — 2 titulares</option>
            <option value="married_single_earner">Casado(a) — único titular</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Nº de dependentes</label>
          <input type="number" name="dependents_count" min="0" value={deps}
            onChange={(e) => setDeps(Number(e.target.value))}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input type="hidden" name="is_disabled" value="false" />
        <input id="is_disabled_profile" name="is_disabled" type="checkbox" value="true"
          checked={disabled} onChange={(e) => setDisabled(e.target.checked)}
          className="w-4 h-4 text-indigo-600 border-slate-300 rounded" />
        <label htmlFor="is_disabled_profile" className="text-sm font-medium text-slate-700">
          Pessoa com deficiência (grau ≥ 60%)
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Subsídios de férias e Natal</label>
        <select name="subsidy_payment_mode" defaultValue={tax?.subsidy_payment_mode ?? 'full'}
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
          <option value="full">Pagos na totalidade (junho / novembro)</option>
          <option value="twelfths">Pagos em duodécimos (incluídos no vencimento mensal)</option>
          <option value="none">Sem subsídios (bolsa de estágio)</option>
        </select>
      </div>

      <div className="flex items-center justify-between pt-1">
        <div className="text-sm text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-lg">
          Tabela aplicável: <strong>{tableLabel}</strong>
        </div>
        <button type="submit" disabled={pending}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
          {pending ? 'A guardar...' : 'Guardar'}
        </button>
      </div>

      {state?.error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">Situação fiscal guardada.</p>}
    </form>
  )
}

function InviteSection({ employee }: { employee: Employee }) {
  const [inviteState, inviteAction, invitePending]   = useActionState(inviteEmployee, null)
  const [resendState, resendAction, resendPending]   = useActionState(resendInvite, null)
  const hasAccess = !!employee.auth_user_id

  return (
    <div className={`rounded-xl border-2 p-5 flex items-start gap-4 ${
      hasAccess ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'
    }`}>
      <span className="text-2xl mt-0.5">{hasAccess ? '✅' : '📧'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900 mb-0.5">
          {hasAccess ? 'Acesso à aplicação ativo' : 'Sem acesso à aplicação'}
        </p>
        <p className="text-xs text-slate-500 mb-3">
          {hasAccess
            ? `Conta associada ao email ${employee.email}.`
            : `${employee.email} ainda não tem conta. Ao convidar, será enviado um email com um link para definir a password.`}
        </p>

        <div className="flex items-center gap-3 flex-wrap">
          {!hasAccess && !employee.email && (
            <span className="text-xs text-slate-400">
              Sem email — preenche o email para poder convidar
            </span>
          )}

          {!hasAccess && employee.email && (
            <form action={inviteAction}>
              <input type="hidden" name="employee_id" value={employee.id} />
              <input type="hidden" name="email" value={employee.email} />
              <button
                type="submit"
                disabled={invitePending}
                className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {invitePending ? 'A enviar convite...' : 'Enviar convite por email'}
              </button>
            </form>
          )}

          {hasAccess && employee.email && (
            <form action={resendAction}>
              <input type="hidden" name="email" value={employee.email} />
              <button
                type="submit"
                disabled={resendPending}
                className="border border-slate-300 text-slate-600 px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-white disabled:opacity-50 transition-colors"
              >
                {resendPending ? 'A enviar...' : 'Reenviar link de acesso'}
              </button>
            </form>
          )}
        </div>

        {inviteState?.error && (
          <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
            {inviteState.error}
          </p>
        )}
        {inviteState?.success && (
          <p className="mt-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg">
            {(inviteState as { alreadyExisted?: boolean }).alreadyExisted
              ? `✓ Conta já existia — associada ao colaborador com sucesso.`
              : `✓ Convite enviado para ${employee.email}. O colaborador receberá um email para definir a password.`}
          </p>
        )}
        {resendState?.error && (
          <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
            {resendState.error}
          </p>
        )}
        {resendState?.success && (
          <p className="mt-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg">
            ✓ Link de redefinição de password enviado para {employee.email}.
          </p>
        )}
      </div>
    </div>
  )
}

const CONTRACT_TYPE_LABEL: Record<string, string> = {
  permanent:          'Sem Termo',
  fixed_term:         'A Termo Certo',
  internship:         'Estágio',
  service_agreement:  'Prestação de Serviços',
}

const CONTRACT_STATUS_STYLE: Record<string, string> = {
  active:     'bg-emerald-100 text-emerald-700',
  terminated: 'bg-red-100 text-red-600',
  expired:    'bg-slate-100 text-slate-500',
}
const CONTRACT_STATUS_LABEL: Record<string, string> = {
  active: 'Ativo', terminated: 'Rescindido', expired: 'Expirado',
}

function ContractsSection({ contracts }: { contracts: Contract[] }) {
  const active     = contracts.find(c => c.status === 'active')
  const historical = contracts.filter(c => c.status !== 'active')

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
      <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Contrato</h3>

      {active ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <p className="text-xs text-emerald-600 font-medium mb-0.5">Tipo</p>
            <p className="text-slate-900 font-semibold">{CONTRACT_TYPE_LABEL[active.contract_type] ?? active.contract_type}</p>
          </div>
          <div>
            <p className="text-xs text-emerald-600 font-medium mb-0.5">Estado</p>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CONTRACT_STATUS_STYLE[active.status]}`}>
              {CONTRACT_STATUS_LABEL[active.status]}
            </span>
          </div>
          <div>
            <p className="text-xs text-emerald-600 font-medium mb-0.5">Data de início</p>
            <p className="text-slate-800">{active.start_date ?? '—'}</p>
          </div>
          {active.end_date && (
            <div>
              <p className="text-xs text-emerald-600 font-medium mb-0.5">Data de fim</p>
              <p className="text-slate-800">{active.end_date}</p>
            </div>
          )}
          {active.notes && (
            <div className="col-span-2">
              <p className="text-xs text-emerald-600 font-medium mb-0.5">Notas</p>
              <p className="text-slate-700 text-xs">{active.notes}</p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-400">Sem contrato ativo.</p>
      )}

      {historical.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Histórico</p>
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Tipo</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Início</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Fim</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {historical.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-700">{CONTRACT_TYPE_LABEL[c.contract_type] ?? c.contract_type}</td>
                    <td className="px-4 py-2.5 text-slate-500">{c.start_date ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-500">{c.end_date ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CONTRACT_STATUS_STYLE[c.status]}`}>
                        {CONTRACT_STATUS_LABEL[c.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ProfileTab({
  employee, tax, isAdmin, contracts = [], hideNotes = false,
}: {
  employee: Employee
  tax: EmployeeTaxInfo | null
  isAdmin: boolean
  contracts?: Contract[]
  /** Na própria ficha as notas internas não aparecem */
  hideNotes?: boolean
}) {
  const [state, action, pending] = useActionState(updateEmployeeProfile, null)
  const [regime, setRegime] = useState(employee.work_regime)

  return (
    <div className="space-y-6 max-w-3xl">

      {/* Invite / access status — admins only */}
      {isAdmin && <InviteSection employee={employee} />}

    <form action={action}>
      <input type="hidden" name="employee_id" value={employee.id} />
      {/* Só a gestão grava perfis — os diretores veem os dados sem os poder mudar */}
      <fieldset disabled={!isAdmin} className="space-y-6 min-w-0">

      <Section title="Dados pessoais">
        <Grid2>
          <Field label="Primeiro nome" name="first_name" defaultValue={employee.first_name} required />
          <Field label="Apelido" name="last_name" defaultValue={employee.last_name} required />
        </Grid2>
        <Grid2>
          <Field label="Email" name="email" type="email" defaultValue={employee.email ?? ''} />
          <Field label="Telefone" name="phone" defaultValue={employee.phone ?? ''} />
        </Grid2>
        <Grid2>
          <Field label="Função" name="role" defaultValue={employee.role ?? ''} placeholder="ex: Programador Informática" />
        </Grid2>
      </Section>

      <Section title="Dados profissionais">
        <Grid2>
          <Select label="Posição" name="position_type" defaultValue={employee.position_type ?? 'employee'} required options={[
            { value: 'management',          label: 'Management' },
            { value: 'director',            label: 'Diretor' },
            { value: 'employee',            label: 'Colaborador' },
            { value: 'professional_intern', label: 'Estágio Profissional' },
            { value: 'curricular_intern',   label: 'Estágio Curricular' },
          ]} />
          <Select label="Departamento" name="department" defaultValue={employee.department ?? ''} required options={
            EMPLOYEE_DEPARTMENTS.map(d => ({ value: d, label: d }))
          } />
          <Select label="Perfil de acesso" name="app_role" defaultValue={employee.app_role} options={[
            { value: 'intern',     label: 'Estagiário/a' },
            { value: 'employee',   label: 'Colaborador/a' },
            { value: 'director',   label: 'Diretor/a' },
            { value: 'management', label: 'Gestão' },
            { value: 'master',     label: 'Master' },
          ]} />
          <Select label="Estado" name="status" defaultValue={employee.status} options={[
            { value: 'active',   label: 'Ativo' },
            { value: 'inactive', label: 'Inativo' },
            { value: 'on_leave', label: 'Licença' },
          ]} />
        </Grid2>
        <Grid2>
          <Select
            label="Regime"
            name="work_regime"
            defaultValue={regime}
            onChange={(v) => setRegime(v as 'full_time' | 'part_time')}
            options={[
              { value: 'full_time', label: 'Full-time' },
              { value: 'part_time', label: 'Part-time' },
            ]}
          />
          {regime === 'part_time' && (
            <Field label="Dias por semana" name="days_per_week" type="number"
              defaultValue={employee.days_per_week?.toString() ?? ''} placeholder="ex: 3" />
          )}
        </Grid2>
        <Grid2>
          <Field label="Data de início" name="start_date" type="date" defaultValue={employee.start_date} required />
          <Field label="Data de saída" name="end_date" type="date" defaultValue={employee.end_date ?? ''} />
        </Grid2>
        <Grid2>
          <div>
            <label htmlFor="outros_pct" className="block text-sm font-medium text-slate-700 mb-1.5">
              % Tempo Produtivo
            </label>
            <input id="outros_pct" name="outros_pct" type="number" min="0" max="100"
              defaultValue={employee.outros_pct?.toString() ?? ''}
              placeholder="ex: 30"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
            <p className="text-xs text-slate-400 mt-1">
              % das horas que entram na capacidade produtiva (dept. Outros)
            </p>
          </div>
        </Grid2>
        {!hideNotes && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Notas</label>
            <textarea name="notes" rows={3} defaultValue={employee.notes ?? ''}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
          </div>
        )}
      </Section>

      {state?.error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{state.error}</p>
      )}
      {state?.success && (
        <p className="text-sm text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">Guardado com sucesso.</p>
      )}

      {isAdmin && (
        <button type="submit" disabled={pending}
          className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
          {pending ? 'A guardar...' : 'Guardar alterações'}
        </button>
      )}
      </fieldset>
    </form>

    {isAdmin && <FiscalSituationForm employeeId={employee.id} tax={tax} />}
    <ContractsSection contracts={contracts} />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
      <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  )
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-4">{children}</div>
}

function Field({ label, name, type = 'text', defaultValue, required, placeholder }: {
  label: string; name: string; type?: string; defaultValue?: string
  required?: boolean; placeholder?: string
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input id={name} name={name} type={type} defaultValue={defaultValue}
        required={required} placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
    </div>
  )
}

function Select({ label, name, defaultValue, options, required, onChange }: {
  label: string; name: string; defaultValue?: string; required?: boolean
  options: { value: string; label: string }[]; onChange?: (v: string) => void
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <select id={name} name={name} defaultValue={defaultValue} required={required}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}
