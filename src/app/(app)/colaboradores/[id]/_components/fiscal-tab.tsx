'use client'

import { useActionState } from 'react'
import type { EmployeeTaxInfo } from '@/types/database'
import { upsertTaxInfo } from '../actions'

const maritalOptions = [
  { value: 'single',                label: 'Não casado(a)' },
  { value: 'married_two_earners',   label: 'Casado(a) — 2 titulares' },
  { value: 'married_single_earner', label: 'Casado(a) — único titular' },
]

const tableMap: Record<string, string> = {
  single_0_false:                 'Tabela I',
  single_0_true:                  'Tabela IV',
  single_dep_false:               'Tabela II',
  single_dep_true:                'Tabela V',
  married_two_earners_0_false:    'Tabela I',
  married_two_earners_0_true:     'Tabela IV',
  married_two_earners_dep_false:  'Tabela I',
  married_two_earners_dep_true:   'Tabela VI',
  married_single_earner_0_false:  'Tabela III',
  married_single_earner_0_true:   'Tabela VII',
  married_single_earner_dep_false:'Tabela III',
  married_single_earner_dep_true: 'Tabela VII',
}

function getTableLabel(marital: string, deps: number, disabled: boolean): string {
  const depKey = deps > 0 ? 'dep' : '0'
  return tableMap[`${marital}_${depKey}_${disabled}`] ?? '—'
}

export default function FiscalTab({ tax, employeeId, readOnly = false }: {
  tax: EmployeeTaxInfo | null
  employeeId: string
  /** Diretores do departamento veem os dados, mas só a gestão os altera */
  readOnly?: boolean
}) {
  const [state, action, pending] = useActionState(upsertTaxInfo, null)

  const defaultMarital = tax?.marital_status ?? 'single'
  const defaultDeps = tax?.dependents_count ?? 0
  const defaultDisabled = tax?.is_disabled ?? false

  return (
    <form action={action} className="max-w-3xl">
      <input type="hidden" name="employee_id" value={employeeId} />
      <fieldset disabled={readOnly} className="space-y-6 min-w-0">

      <Section title="Dados pessoais e bancários">
        <Grid2>
          <Field label="NIF" name="nif" defaultValue={tax?.nif ?? ''} placeholder="123 456 789" />
          <Field label="NISS" name="niss" defaultValue={tax?.niss ?? ''} placeholder="12345678901" />
        </Grid2>
        <Grid2>
          <Field label="Data de nascimento" name="date_of_birth" type="date" defaultValue={tax?.date_of_birth ?? ''} />
          <Field label="IBAN" name="iban" defaultValue={tax?.iban ?? ''} placeholder="PT50 0000 0000 0000 0000 000 0" />
        </Grid2>
        <Field label="Morada" name="address" defaultValue={tax?.address ?? ''} />
        <Grid2>
          <Field label="Cidade" name="city" defaultValue={tax?.city ?? ''} />
          <Field label="Código postal" name="postal_code" defaultValue={tax?.postal_code ?? ''} placeholder="0000-000" />
        </Grid2>
      </Section>

      <Section title="Situação fiscal — IRS (Continente 2026)">
        <Grid2>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Estado civil / Situação</label>
            <select name="marital_status" defaultValue={defaultMarital}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
              {maritalOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <Field label="Nº de dependentes" name="dependents_count" type="number"
            defaultValue={String(defaultDeps)} placeholder="0" />
        </Grid2>
        <div className="flex items-center gap-3">
          <input type="hidden" name="is_disabled" value="false" />
          <input id="is_disabled" name="is_disabled" type="checkbox" value="true"
            defaultChecked={defaultDisabled}
            className="w-4 h-4 text-indigo-600 border-slate-300 rounded" />
          <label htmlFor="is_disabled" className="text-sm font-medium text-slate-700">
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
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 text-sm text-indigo-700">
          Tabela aplicável: <strong>{getTableLabel(defaultMarital, defaultDeps, defaultDisabled)}</strong>
          {' '}— Categoria A, Trabalho Dependente, Continente 2026
        </div>
      </Section>

      <Section title="Segurança Social">
        <div className="max-w-xs">
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Taxa do colaborador (%)
          </label>
          <div className="relative">
            <input name="social_security_rate" type="number" step="0.001" min="0" max="1"
              defaultValue={tax?.social_security_rate ?? 0.11}
              className="w-full px-3 py-2 pr-8 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">Regime geral: 11%. Inserir em decimal (ex: 0.11)</p>
        </div>
      </Section>

      <Section title="Subsídio de alimentação">
        <Grid2>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Tipo</label>
            <select name="meal_allowance_type" defaultValue={tax?.meal_allowance_type ?? 'card'}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
              <option value="card">Cartão refeição (isento até €10,46/dia)</option>
              <option value="cash">Dinheiro (isento até €6,00/dia)</option>
            </select>
          </div>
          <Field label="Valor diário (€)" name="meal_allowance_daily" type="number" step="0.01"
            defaultValue={String(tax?.meal_allowance_daily ?? 10.46)} />
        </Grid2>
        <div className="max-w-xs">
          <Field label="Dias de trabalho por mês" name="working_days_per_month" type="number"
            defaultValue={String(tax?.working_days_per_month ?? 22)} />
        </div>
      </Section>

      {state?.error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">Dados fiscais guardados.</p>}

      {!readOnly && (
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {pending ? 'A guardar...' : 'Guardar dados fiscais'}
          </button>
        </div>
      )}
      </fieldset>
    </form>
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
function Field({ label, name, type = 'text', defaultValue, placeholder, step }: {
  label: string; name: string; type?: string; defaultValue?: string; placeholder?: string; step?: string
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      <input id={name} name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} step={step}
        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
    </div>
  )
}
