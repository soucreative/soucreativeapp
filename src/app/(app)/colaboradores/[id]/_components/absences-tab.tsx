'use client'

import { useActionState, useState, useEffect, useRef } from 'react'
import type { Absence, Compensation, AnnualBonus, VacationPrizeExchange } from '@/types/database'
import { createAbsence, deleteAbsence, exchangePrizeForVacation } from '../../../ferias/actions'
import { workingDaysBetween } from '@/lib/holidays'

const VACATION_DAYS_PER_YEAR = 24
const MAX_EXCHANGE_DAYS      = 7

const TYPE_LABEL: Record<string, string> = {
  vacation:    'Férias',
  sick_leave:  'Baixa Médica',
  justified:   'Falta Justificada',
  unjustified: 'Falta Injustificada',
  other:       'Outro',
  company_day: 'Dia Oferecido',
}
const TYPE_COLOR: Record<string, string> = {
  vacation:    'bg-indigo-100 text-indigo-700 border-indigo-200',
  sick_leave:  'bg-red-100 text-red-700 border-red-200',
  justified:   'bg-amber-100 text-amber-700 border-amber-200',
  unjustified: 'bg-rose-100 text-rose-700 border-rose-200',
  other:       'bg-slate-100 text-slate-600 border-slate-200',
  company_day: 'bg-emerald-100 text-emerald-700 border-emerald-200',
}
const STATUS_COLOR: Record<string, string> = {
  pending:  'bg-amber-50 text-amber-700 border border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  rejected: 'bg-slate-100 text-slate-500 border border-slate-200',
}
const STATUS_LABEL: Record<string, string> = {
  pending:  'Pendente',
  approved: 'Aprovada',
  rejected: 'Rejeitada',
}


// ── Company Days Section ──────────────────────────────────────────────────

function CompanyDaySlot({
  employeeId,
  label,
  hint,
  registered,
  canManage,
  onDelete,
}: {
  employeeId: string
  label: string
  hint: string
  registered: Absence | null
  canManage: boolean
  onDelete?: () => void
}) {
  const [state, action, pending] = useActionState(createAbsence, null)
  const [open, setOpen] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state?.success) { setOpen(false); formRef.current?.reset() }
  }, [state])

  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <div className={`rounded-lg border px-4 py-3 space-y-2 ${registered ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-700">{label}</p>
          <p className="text-xs text-slate-400">{hint}</p>
        </div>
        {registered ? (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-emerald-700 bg-emerald-100 border border-emerald-200 rounded-full px-2.5 py-0.5">
              ✓ {fmt(registered.start_date)}{registered.status === 'pending' && ' · pendente'}
            </span>
            {/* Quem não gere ausências só retira pedidos ainda pendentes */}
            {(canManage || registered.status === 'pending') && (
              <form action={deleteAbsence}>
                <input type="hidden" name="id" value={registered.id} />
                <input type="hidden" name="employee_id" value={employeeId} />
                <button type="submit"
                  className="text-xs text-slate-300 hover:text-red-500 transition-colors"
                  onClick={e => { if (!confirm('Remover este dia oferecido?')) e.preventDefault() }}>
                  ✕
                </button>
              </form>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors">
            {open ? 'Cancelar' : '+ Registar'}
          </button>
        )}
      </div>

      {!registered && open && (
        <form ref={formRef} action={action} className="pt-2 border-t border-slate-100 space-y-2">
          <input type="hidden" name="employee_id" value={employeeId} />
          <input type="hidden" name="type" value="company_day" />
          <input type="hidden" name="status" value="approved" />
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-600 mb-1">Data</label>
              <input type="date" name="start_date" required
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <input type="hidden" name="end_date" id={`end_${label}`} />
            </div>
            <button type="submit" disabled={pending}
              onClick={e => {
                const form = (e.currentTarget as HTMLButtonElement).form!
                const start = (form.elements.namedItem('start_date') as HTMLInputElement).value
                ;(form.elements.namedItem('end_date') as HTMLInputElement).value = start
              }}
              className="px-3 py-2 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors whitespace-nowrap">
              {pending ? 'A guardar…' : 'Guardar'}
            </button>
          </div>
          {state?.error && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{state.error}</p>
          )}
        </form>
      )}
    </div>
  )
}

function CompanyDaysSection({ employeeId, yearAbsences, year, canManage }: {
  employeeId: string
  yearAbsences: Absence[]
  year: number
  canManage: boolean
}) {
  const companyDays = yearAbsences.filter(a => a.type === 'company_day' && a.status !== 'rejected')

  // Classify: natal = Dec 24 or Dec 31; ponte = Mon or Fri
  const natalDay = companyDays.find(a => {
    const d = new Date(a.start_date + 'T00:00:00')
    return d.getMonth() === 11 && (d.getDate() === 24 || d.getDate() === 31)
  }) ?? null

  const bridgeDay = companyDays.find(a => {
    const d = new Date(a.start_date + 'T00:00:00')
    const dow = d.getDay()
    const isNatal = d.getMonth() === 11 && (d.getDate() === 24 || d.getDate() === 31)
    return (dow === 1 || dow === 5) && !isNatal
  }) ?? null

  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
          🎁 Dias oferecidos pela empresa — {year}
        </h4>
        <span className="text-xs text-slate-400">{companyDays.length}/2 registados</span>
      </div>
      <p className="text-xs text-slate-400">
        Cada colaborador tem direito a 2 dias oferecidos: um dia de natal (24 ou 31 de dezembro) e uma ponte à escolha (2ª ou 6ª feira). Coordenar com a equipa.
      </p>
      <CompanyDaySlot
        employeeId={employeeId}
        label="Dia de natal"
        hint="24 ou 31 de dezembro"
        registered={natalDay}
        canManage={canManage}
      />
      <CompanyDaySlot
        employeeId={employeeId}
        label="Ponte anual"
        hint="2ª ou 6ª feira, à escolha"
        registered={bridgeDay}
        canManage={canManage}
      />
    </div>
  )
}

// ── Add Absence Form ──────────────────────────────────────────────────────

function AddAbsenceForm({ employeeId, canManage }: { employeeId: string; canManage: boolean }) {
  const [state, action, pending] = useActionState(createAbsence, null)
  const [startDate, setStartDate] = useState('')
  const [endDate,   setEndDate]   = useState('')
  const [calcDays,  setCalcDays]  = useState(0)

  useEffect(() => {
    setCalcDays(workingDaysBetween(startDate, endDate))
  }, [startDate, endDate])

  return (
    <form action={action} className="bg-slate-50 rounded-xl border border-slate-200 p-5 space-y-4">
      <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
        {canManage ? 'Registar ausência' : 'Pedir ausência'}
      </h4>
      <input type="hidden" name="employee_id" value={employeeId} />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Tipo</label>
          <select name="type" defaultValue="vacation"
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="vacation">Férias</option>
            <option value="sick_leave">Baixa Médica</option>
            <option value="justified">Falta Justificada</option>
            {canManage && <option value="unjustified">Falta Injustificada</option>}
            <option value="other">Outro</option>
          </select>
        </div>
        {/* Quem não gere ausências não escolhe o estado: o pedido fica pendente */}
        {canManage ? (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Estado</label>
            <select name="status" defaultValue="approved"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="approved">Aprovada</option>
              <option value="pending">Pendente</option>
              <option value="rejected">Rejeitada</option>
            </select>
          </div>
        ) : (
          <p className="text-xs text-slate-400 self-end pb-2">
            O pedido fica pendente até ser aprovado pela gestão ou pelo diretor.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Data de início *</label>
          <input type="date" name="start_date" required
            value={startDate} onChange={e => setStartDate(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Data de fim *</label>
          <input type="date" name="end_date" required
            value={endDate} onChange={e => setEndDate(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Dias úteis
            {calcDays > 0 && startDate && endDate && (
              <span className="ml-2 text-indigo-600 font-normal">(calculado: {calcDays})</span>
            )}
          </label>
          <input type="number" name="working_days" min="0"
            placeholder={calcDays > 0 ? String(calcDays) : '0'}
            defaultValue=""
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <p className="text-xs text-slate-400 mt-0.5">Deixar vazio para calcular automaticamente</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Notas</label>
          <input type="text" name="notes" placeholder="Motivo, CIT, etc."
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
      </div>

      {state?.error && (
        <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{state.error}</p>
      )}
      {state?.success && (
        <div>
          <p className="text-xs text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">
            {canManage ? 'Ausência registada.' : 'Pedido enviado — fica pendente até ser aprovado.'}
          </p>
          {'warnings' in state && state.warnings && (
            <p className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg mt-1">
              ⚠ {(state.warnings as string[]).join(' | ')}
            </p>
          )}
        </div>
      )}

      <button type="submit" disabled={pending}
        className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
        {pending ? 'A guardar…' : canManage ? 'Registar ausência' : 'Enviar pedido'}
      </button>
    </form>
  )
}

// ── Prize Exchange Form ───────────────────────────────────────────────────

function PrizeExchangeForm({
  employeeId,
  year,
  baseSalary,
  annualBonus,
  currentExchange,
}: {
  employeeId: string
  year: number
  baseSalary: number | null
  annualBonus: AnnualBonus | null
  currentExchange: VacationPrizeExchange | null
}) {
  const [state, action, pending] = useActionState(exchangePrizeForVacation, null)
  const [days, setDays] = useState(currentExchange?.extra_days ?? 0)

  const dailyRate     = baseSalary ? baseSalary / 22 : 0
  const deduction     = days * dailyRate
  const prizeLeft     = annualBonus ? annualBonus.total_amount - deduction : null
  const canAfford     = !annualBonus || deduction <= (annualBonus?.total_amount ?? 0)
  const maxAffordable = annualBonus && baseSalary
    ? Math.min(MAX_EXCHANGE_DAYS, Math.floor(annualBonus.total_amount / dailyRate))
    : MAX_EXCHANGE_DAYS

  if (!annualBonus) {
    return (
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
        <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
          Trocar prémio por dias de férias
        </h4>
        <p className="text-xs text-slate-400">
          Sem prémio anual registado para {year}. Registe um prémio na aba Prémio para activar esta funcionalidade.
        </p>
      </div>
    )
  }

  return (
    <form action={action} className="bg-amber-50 rounded-xl border border-amber-200 p-5 space-y-4">
      <div className="flex items-start justify-between">
        <h4 className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
          🏖 Trocar prémio por dias extra de férias — {year}
        </h4>
        {currentExchange && currentExchange.extra_days > 0 && (
          <span className="text-xs text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-2.5 py-0.5">
            Activo: +{currentExchange.extra_days}d
          </span>
        )}
      </div>

      <input type="hidden" name="employee_id" value={employeeId} />
      <input type="hidden" name="year" value={year} />

      {/* Info row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-lg border border-amber-200 p-3 text-center">
          <p className="text-lg font-bold text-slate-900">
            {annualBonus.total_amount.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">Prémio total</p>
        </div>
        <div className="bg-white rounded-lg border border-amber-200 p-3 text-center">
          <p className="text-lg font-bold text-slate-900">
            {baseSalary
              ? dailyRate.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })
              : '—'}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">Valor/dia (salário/22)</p>
        </div>
        <div className="bg-white rounded-lg border border-amber-200 p-3 text-center">
          <p className="text-lg font-bold text-slate-900">máx. {maxAffordable}d</p>
          <p className="text-xs text-slate-400 mt-0.5">Dias disponíveis</p>
        </div>
      </div>

      {/* Slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-amber-800">
            Dias de férias extra
          </label>
          <span className="text-sm font-bold text-amber-900">{days} dia{days !== 1 ? 's' : ''}</span>
        </div>
        <input
          type="range"
          name="extra_days"
          min={0}
          max={MAX_EXCHANGE_DAYS}
          value={days}
          onChange={e => setDays(Number(e.target.value))}
          className="w-full accent-amber-500"
        />
        <div className="flex justify-between text-xs text-slate-400">
          <span>0</span>
          <span>{MAX_EXCHANGE_DAYS} máx.</span>
        </div>
      </div>

      {/* Deduction summary */}
      {days > 0 && (
        <div className={`rounded-lg border px-4 py-3 flex items-center justify-between ${
          canAfford ? 'bg-white border-amber-200' : 'bg-red-50 border-red-200'
        }`}>
          <span className="text-xs text-slate-600">
            Dedução do prémio:
            <span className="font-semibold text-slate-900 ml-1">
              {deduction.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })}
            </span>
          </span>
          {prizeLeft !== null && (
            <span className={`text-xs font-medium ${canAfford ? 'text-emerald-700' : 'text-red-600'}`}>
              Prémio restante: {prizeLeft.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })}
            </span>
          )}
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-amber-800 mb-1">Notas (opcional)</label>
        <input
          type="text"
          name="notes"
          defaultValue={currentExchange?.notes ?? ''}
          placeholder="Observações…"
          className="w-full px-3 py-2 text-sm border border-amber-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
      </div>

      {state && 'error' in state && (
        <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{state.error}</p>
      )}
      {state && 'success' in state && (
        <p className="text-xs text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">
          Troca registada — +{'extra_days' in state ? state.extra_days : days} dia(s) de férias.
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !canAfford}
        className="bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
      >
        {pending ? 'A guardar…' : days === 0 ? 'Remover troca' : `Confirmar +${days} dia(s)`}
      </button>

      <p className="text-xs text-amber-700">
        Máximo de {MAX_EXCHANGE_DAYS} dias extra por ano. O valor é descontado do prémio anual à taxa de salário base / 22 dias.
      </p>
    </form>
  )
}

// ── Main component ────────────────────────────────────────────────────────

export default function AbsencesTab({
  employeeId,
  canManage,
  absences,
  compensation,
  annualBonus,
  prizeExchange,
}: {
  employeeId: string
  /** Gestão e diretores registam e aprovam; as outras pessoas só pedem as suas */
  canManage: boolean
  absences: Absence[]
  compensation: Compensation | null
  annualBonus: AnnualBonus | null
  prizeExchange: VacationPrizeExchange | null
}) {
  const currentYear  = new Date().getFullYear()
  const yearAbsences = absences.filter(a => a.start_date.startsWith(String(currentYear)))

  const extraDays    = prizeExchange?.extra_days ?? 0
  const totalAllowed = VACATION_DAYS_PER_YEAR + extraDays

  // Vacation balance
  const vacationUsed = yearAbsences
    .filter(a => a.type === 'vacation' && a.status === 'approved')
    .reduce((s, a) => s + a.working_days, 0)
  const vacationRemaining = totalAllowed - vacationUsed
  const vacationPct = Math.min(100, (vacationUsed / totalAllowed) * 100)

  // Absence counts
  const sickDays        = yearAbsences.filter(a => a.type === 'sick_leave'  && a.status === 'approved').reduce((s, a) => s + a.working_days, 0)
  const justifiedDays   = yearAbsences.filter(a => a.type === 'justified'   && a.status === 'approved').reduce((s, a) => s + a.working_days, 0)
  const unjustifiedDays = yearAbsences.filter(a => a.type === 'unjustified' && a.status === 'approved').reduce((s, a) => s + a.working_days, 0)

  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pt-PT', {
    day: '2-digit', month: 'short', year: 'numeric',
  })

  return (
    <div className="space-y-6 max-w-3xl">

      {/* ── Saldo de férias ──────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider flex items-center gap-2">
          Saldo de férias — {currentYear}
          {extraDays > 0 && (
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5 font-normal">
              +{extraDays}d de prémio
            </span>
          )}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-3xl font-bold text-slate-900">{totalAllowed}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Dias/ano{extraDays > 0 ? ` (${VACATION_DAYS_PER_YEAR}+${extraDays})` : ''}
            </p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-indigo-600">{vacationUsed}</p>
            <p className="text-xs text-slate-400 mt-0.5">Dias gozados</p>
          </div>
          <div className={`text-center ${vacationRemaining < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            <p className="text-3xl font-bold">{Math.max(0, vacationRemaining)}</p>
            <p className="text-xs text-slate-400 mt-0.5">Dias restantes</p>
          </div>
          <div className="text-center">
            <p className={`text-3xl font-bold ${sickDays > 0 ? 'text-red-500' : 'text-slate-300'}`}>{sickDays}</p>
            <p className="text-xs text-slate-400 mt-0.5">Dias de baixa</p>
          </div>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>0 dias</span>
            <span>{totalAllowed} dias ({vacationPct.toFixed(0)}% usados)</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full transition-all ${
                vacationPct >= 100 ? 'bg-red-400' : vacationPct >= 80 ? 'bg-amber-400' : 'bg-indigo-500'
              }`}
              style={{ width: `${Math.min(100, vacationPct)}%` }}
            />
          </div>
          {vacationUsed > totalAllowed && (
            <p className="text-xs text-red-600 mt-1">
              ⚠ Excedeu o limite em {vacationUsed - totalAllowed} dia(s)
            </p>
          )}
        </div>

        {(justifiedDays > 0 || unjustifiedDays > 0) && (
          <div className="flex gap-4 pt-1 border-t border-slate-100">
            {justifiedDays > 0 && (
              <span className="text-xs text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                {justifiedDays} falta(s) justificada(s)
              </span>
            )}
            {unjustifiedDays > 0 && (
              <span className="text-xs text-rose-700 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200">
                {unjustifiedDays} falta(s) injustificada(s)
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Dias oferecidos pela empresa ─────────────────────────── */}
      <CompanyDaysSection employeeId={employeeId} yearAbsences={yearAbsences} year={currentYear} canManage={canManage} />

      {/* ── Registar ausência ────────────────────────────────────── */}
      <AddAbsenceForm employeeId={employeeId} canManage={canManage} />

      {/* ── Trocar prémio por férias ─────────────────────────────── */}
      <PrizeExchangeForm
        employeeId={employeeId}
        year={currentYear}
        baseSalary={compensation?.base_salary ?? null}
        annualBonus={annualBonus}
        currentExchange={prizeExchange}
      />

      {/* ── Histórico ────────────────────────────────────────────── */}
      {absences.length > 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-3 border-b border-slate-100">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Registo de ausências
            </h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Tipo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Período</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Dias úteis</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Notas</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {absences
                .sort((a, b) => b.start_date.localeCompare(a.start_date))
                .map(abs => (
                  <tr key={abs.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${TYPE_COLOR[abs.type]}`}>
                        {TYPE_LABEL[abs.type]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <span className="font-medium">{fmt(abs.start_date)}</span>
                      {abs.start_date !== abs.end_date && (
                        <span className="text-slate-400"> → {fmt(abs.end_date)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{abs.working_days}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[abs.status]}`}>
                        {STATUS_LABEL[abs.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{abs.notes ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {(canManage || abs.status === 'pending') && (
                        <form action={deleteAbsence}>
                          <input type="hidden" name="id" value={abs.id} />
                          <input type="hidden" name="employee_id" value={employeeId} />
                          <button type="submit"
                            className="text-xs text-slate-400 hover:text-red-500 transition-colors"
                            onClick={e => { if (!confirm('Eliminar esta ausência?')) e.preventDefault() }}>
                            ✕
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
          Sem ausências registadas.
        </div>
      )}
    </div>
  )
}
