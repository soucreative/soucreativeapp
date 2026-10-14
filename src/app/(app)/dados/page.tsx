import { redirect } from 'next/navigation'
import { getCurrentEmployee } from '@/lib/auth'
import { canAccess } from '@/lib/permissions'
import {
  Download, Users, DollarSign, Truck,
  Receipt, TrendingUp, BarChart2,
} from 'lucide-react'
import ImportForm from './_components/import-form'

// ── Dataset definitions ────────────────────────────────────────────────────

const EXPORTS = [
  {
    id:          'colaboradores',
    label:       'Colaboradores',
    description: 'Lista de colaboradores com dados pessoais e contratuais.',
    icon:        Users,
    iconBg:      'bg-indigo-50',
    iconColor:   'text-indigo-600',
  },
  {
    id:          'remuneracoes',
    label:       'Remunerações',
    description: 'Histórico de salários base e modelos variáveis.',
    icon:        DollarSign,
    iconBg:      'bg-emerald-50',
    iconColor:   'text-emerald-600',
  },
  {
    id:          'financeiro',
    label:       'Registos Financeiros',
    description: 'Dados mensais de faturação, FSE, custos e EBITDA.',
    icon:        TrendingUp,
    iconBg:      'bg-blue-50',
    iconColor:   'text-blue-600',
  },
  {
    id:          'centros_custo',
    label:       'Centros de Custo',
    description: 'Faturação e custos mensais por departamento.',
    icon:        BarChart2,
    iconBg:      'bg-purple-50',
    iconColor:   'text-purple-600',
  },
]

// ── Page ──────────────────────────────────────────────────────────────────

export default async function DadosPage() {
  const emp = await getCurrentEmployee()
  if (!emp || !canAccess(emp.app_role, '/dados')) redirect('/')

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Dados</h1>
        <p className="text-slate-500 text-sm mt-1">
          Exporta ou importa informação em Excel (.xlsx) ou CSV.
        </p>
      </div>

      {/* ── Export ─────────────────────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
          Exportar
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {EXPORTS.map(({ id, label, description, icon: Icon, iconBg, iconColor }) => (
            <div
              key={id}
              className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-4"
            >
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={17} className={iconColor} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{label}</p>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{description}</p>
                </div>
              </div>

              <div className="flex gap-2">
                <a
                  href={`/api/export?dataset=${id}&format=csv`}
                  download
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                >
                  <Download size={13} />
                  CSV
                </a>
                <a
                  href={`/api/export?dataset=${id}&format=xlsx`}
                  download
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-emerald-700 border border-emerald-200 rounded-lg px-3 py-2 hover:bg-emerald-50 hover:border-emerald-300 transition-colors"
                >
                  <Download size={13} />
                  Excel
                </a>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Import ─────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
          Importar
        </h2>
        <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-md">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center">
              <Users size={17} className="text-indigo-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Colaboradores</p>
              <p className="text-xs text-slate-400">
                Importa novos colaboradores via CSV ou Excel.
              </p>
            </div>
          </div>
          <ImportForm />
        </div>
      </section>
    </div>
  )
}
