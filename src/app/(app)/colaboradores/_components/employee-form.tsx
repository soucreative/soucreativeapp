'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { createEmployee } from '../actions'
import { DEPARTMENTS } from '@/lib/departments'

export default function EmployeeForm() {
  const [state, action, pending] = useActionState(createEmployee, null)
  const [regime, setRegime] = useState<'full_time' | 'part_time'>('full_time')

  return (
    <form action={action} className="max-w-2xl space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">

        <div className="grid grid-cols-2 gap-4">
          <Field label="Primeiro nome" name="first_name" required />
          <Field label="Apelido" name="last_name" required />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Email" name="email" type="email" />
          <Field label="Telefone" name="phone" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Select label="Posição" name="position_type" required options={[
            { value: 'management',          label: 'Management' },
            { value: 'director',            label: 'Diretor' },
            { value: 'employee',            label: 'Colaborador' },
            { value: 'professional_intern', label: 'Estágio Profissional' },
            { value: 'curricular_intern',   label: 'Estágio Curricular' },
          ]} />
          <Select label="Departamento" name="department" required options={
            DEPARTMENTS.map(d => ({ value: d, label: d }))
          } />
          <Select label="Perfil de acesso" name="app_role" options={[
            { value: 'intern',     label: 'Estagiário/a' },
            { value: 'employee',   label: 'Colaborador/a' },
            { value: 'director',   label: 'Diretor/a' },
            { value: 'management', label: 'Gestão' },
            { value: 'master',     label: 'Master' },
          ]} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Select label="Estado" name="status" options={[
            { value: 'active',   label: 'Ativo' },
            { value: 'inactive', label: 'Inativo' },
            { value: 'on_leave', label: 'Licença' },
          ]} />
        </div>


        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Regime"
            name="work_regime"
            value={regime}
            onChange={(v) => setRegime(v as 'full_time' | 'part_time')}
            options={[
              { value: 'full_time', label: 'Full-time' },
              { value: 'part_time', label: 'Part-time' },
            ]}
          />
          {regime === 'part_time' && (
            <Field label="Dias por semana" name="days_per_week" type="number" placeholder="ex: 3" />
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Data de início" name="start_date" type="date" required />
          <Field label="Data de saída" name="end_date" type="date" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Notas</label>
          <textarea
            name="notes"
            rows={3}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>

        {state?.error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{state.error}</p>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={pending}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {pending ? 'A guardar...' : 'Guardar colaborador'}
          </button>
          <Link href="/colaboradores" className="text-sm text-slate-500 hover:text-slate-700">
            Cancelar
          </Link>
        </div>
      </div>
    </form>
  )
}

function Field({
  label, name, type = 'text', required, placeholder,
}: {
  label: string; name: string; type?: string; required?: boolean; placeholder?: string
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        id={name} name={name} type={type} required={required} placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
      />
    </div>
  )
}

function Select({
  label, name, options, value, required, onChange,
}: {
  label: string; name: string; options: { value: string; label: string }[]
  value?: string; required?: boolean; onChange?: (v: string) => void
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <select
        id={name} name={name}
        value={value}
        required={required}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}
