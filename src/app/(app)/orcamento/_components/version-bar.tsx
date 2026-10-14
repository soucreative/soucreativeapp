import Link from 'next/link'
import { STATUS_LABEL, STATUS_STYLE, versionLabel } from '@/types/orcamento'
import type { BudgetVersion } from '@/types/orcamento'

export default function VersionBar({
  year,
  years,
  versions,
  selectedId,
}: {
  year: number
  years: number[]
  versions: Pick<BudgetVersion, 'id' | 'revision' | 'status'>[]
  selectedId: string | null
}) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-2">
        {years.map(y => (
          <Link
            key={y}
            href={`/orcamento?ano=${y}`}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              y === year
                ? 'bg-indigo-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600'
            }`}
          >
            {y}
          </Link>
        ))}
      </div>

      {versions.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {versions.map(v => (
            <Link
              key={v.id}
              href={`/orcamento?ano=${year}&versao=${v.id}`}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs bg-white border transition-colors ${
                v.id === selectedId
                  ? 'border-indigo-500 ring-1 ring-indigo-500 text-slate-900'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              <span className="font-medium">{versionLabel(v)}</span>
              <span className={`px-1.5 py-0.5 rounded-full border text-[10px] font-medium ${STATUS_STYLE[v.status]}`}>
                {STATUS_LABEL[v.status]}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
