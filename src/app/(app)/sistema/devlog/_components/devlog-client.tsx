'use client'

import { useState } from 'react'

// ── Types (shared with page.tsx) ──────────────────────────────────────────

export type CheckItem = { done: boolean; text: string }

export type DevlogEntry = {
  title:       string
  priority?:   string
  status?:     string
  description: string
  items:       CheckItem[]
  date?:       string
}

export type DevlogSection = {
  kind:      'done' | 'progress' | 'ai' | 'blocked' | 'summary'
  heading:   string
  entries:   DevlogEntry[]
  topItems:  CheckItem[]
}

// ── Tab config ────────────────────────────────────────────────────────────

type Tab = { kind: DevlogSection['kind']; label: string; emoji: string; color: string }

const TABS: Tab[] = [
  { kind: 'progress', label: 'Em Curso',     emoji: '🔵', color: 'indigo' },
  { kind: 'done',     label: 'Concluído',    emoji: '✅', color: 'emerald' },
  { kind: 'ai',       label: 'Pipeline IA',  emoji: '🤖', color: 'violet' },
  { kind: 'blocked',  label: 'Bloqueados',   emoji: '🚫', color: 'amber'  },
]

// ── Priority badge ────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    'alta':       'bg-red-50 text-red-700 border-red-200',
    'média-alta': 'bg-orange-50 text-orange-700 border-orange-200',
    'média':      'bg-amber-50 text-amber-700 border-amber-200',
    'baixa-média':'bg-slate-50 text-slate-600 border-slate-200',
    'baixa':      'bg-slate-50 text-slate-500 border-slate-200',
  }
  const cls = map[priority.toLowerCase()] ?? 'bg-slate-50 text-slate-600 border-slate-200'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {priority}
    </span>
  )
}

// ── Entry card ────────────────────────────────────────────────────────────

function EntryCard({ entry, kind }: { entry: DevlogEntry; kind: DevlogSection['kind'] }) {
  const [expanded, setExpanded] = useState(false)
  const hasItems = entry.items.length > 0
  const doneCount = entry.items.filter(i => i.done).length
  const total = entry.items.length

  const borderColor = {
    done:     'border-l-emerald-400',
    progress: 'border-l-indigo-400',
    ai:       'border-l-violet-400',
    blocked:  'border-l-amber-400',
    summary:  'border-l-slate-300',
  }[kind]

  return (
    <div className={`bg-white rounded-xl border border-slate-200 border-l-4 ${borderColor} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={`text-sm font-semibold ${kind === 'done' ? 'text-slate-500' : 'text-slate-900'}`}>
              {entry.title}
            </h3>
            {entry.priority && <PriorityBadge priority={entry.priority} />}
            {entry.date && (
              <span className="text-xs text-slate-400">{entry.date}</span>
            )}
          </div>

          {entry.status && (
            <p className="text-xs text-slate-500 mt-0.5 italic">{entry.status}</p>
          )}

          {entry.description && (
            <p className={`text-xs mt-1.5 leading-relaxed ${kind === 'done' ? 'text-slate-400' : 'text-slate-600'}`}>
              {entry.description.length > 160 && !expanded
                ? entry.description.slice(0, 160) + '…'
                : entry.description}
            </p>
          )}
        </div>

        {hasItems && (
          <div className="shrink-0 text-right">
            <span className={`text-xs font-medium tabular-nums ${
              doneCount === total ? 'text-emerald-600' : 'text-slate-500'
            }`}>
              {doneCount}/{total}
            </span>
            <div className="w-12 h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  doneCount === total ? 'bg-emerald-400' : 'bg-indigo-400'
                }`}
                style={{ width: `${total > 0 ? (doneCount / total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {hasItems && (
        <div className="mt-3 space-y-1.5">
          {(expanded ? entry.items : entry.items.slice(0, 4)).map((item, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className={`mt-0.5 shrink-0 text-xs ${item.done ? 'text-emerald-500' : 'text-slate-300'}`}>
                {item.done ? '✓' : '○'}
              </span>
              <span className={`text-xs leading-relaxed ${
                item.done ? 'text-slate-400 line-through decoration-slate-300' : 'text-slate-600'
              }`}>
                {/* strip bold/code markdown for display */}
                {item.text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1')}
              </span>
            </div>
          ))}
          {entry.items.length > 4 && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-xs text-indigo-500 hover:text-indigo-700 mt-1 transition-colors"
            >
              {expanded ? 'Ver menos' : `+ ${entry.items.length - 4} mais`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Top-level checklist items (done section) ──────────────────────────────

function TopItems({ items, kind }: { items: CheckItem[]; kind: DevlogSection['kind'] }) {
  const [expanded, setExpanded] = useState(false)
  if (!items.length) return null
  const shown = expanded ? items : items.slice(0, 6)

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
        Itens gerais
      </h3>
      <div className="space-y-1.5">
        {shown.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className={`mt-0.5 shrink-0 text-xs ${item.done ? 'text-emerald-500' : 'text-amber-500'}`}>
              {item.done ? '✓' : '○'}
            </span>
            <span className={`text-xs leading-relaxed ${
              item.done ? 'text-slate-400 line-through decoration-slate-300' : 'text-slate-600'
            }`}>
              {item.text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1')}
            </span>
          </div>
        ))}
      </div>
      {items.length > 6 && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-xs text-indigo-500 hover:text-indigo-700 mt-2 transition-colors"
        >
          {expanded ? 'Ver menos' : `+ ${items.length - 6} mais`}
        </button>
      )}
    </div>
  )
}

// ── Main client component ─────────────────────────────────────────────────

export default function DevlogClient({
  sections,
  lastUpdated,
}: {
  sections:    DevlogSection[]
  lastUpdated: string
}) {
  const [activeTab, setActiveTab] = useState<DevlogSection['kind']>('progress')

  const byKind = Object.fromEntries(sections.map(s => [s.kind, s])) as
    Partial<Record<DevlogSection['kind'], DevlogSection>>

  // Stats
  const doneSection   = byKind.done
  const totalDone     = (doneSection?.entries.length ?? 0) + (doneSection?.topItems.filter(i => i.done).length ?? 0)
  const totalProgress = byKind.progress?.entries.length ?? 0
  const totalAi       = byKind.ai?.entries.length ?? 0
  const totalBlocked  = (byKind.blocked?.topItems.length ?? 0) + (byKind.blocked?.entries.length ?? 0)

  const activeSection = byKind[activeTab]

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Devlog</h1>
        <p className="text-slate-500 text-sm mt-1">
          Pipeline de desenvolvimento — o que está feito, em curso e por fazer.
          {lastUpdated && (
            <span className="ml-2 text-slate-400">Última atualização: {lastUpdated}</span>
          )}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Concluídos',  value: totalDone,     color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Em Curso',    value: totalProgress, color: 'text-indigo-600',  bg: 'bg-indigo-50'  },
          { label: 'Pipeline IA', value: totalAi,        color: 'text-violet-600',  bg: 'bg-violet-50'  },
          { label: 'Bloqueados',  value: totalBlocked,   color: 'text-amber-600',   bg: 'bg-amber-50'   },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-xl p-4`}>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-slate-100 p-1 rounded-xl w-fit">
        {TABS.map(tab => {
          const countMap: Record<string, number> = {
            progress: totalProgress,
            done:     totalDone,
            ai:       totalAi,
            blocked:  totalBlocked,
          }
          const count = countMap[tab.kind] ?? 0
          return (
            <button
              key={tab.kind}
              onClick={() => setActiveTab(tab.kind)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.kind
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span>{tab.emoji}</span>
              {tab.label}
              <span className={`text-xs rounded-full px-1.5 py-0.5 ${
                activeTab === tab.kind ? 'bg-slate-100 text-slate-600' : 'bg-slate-200 text-slate-500'
              }`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Content */}
      {activeSection ? (
        <div className="space-y-3">
          {activeSection.entries.map((entry, i) => (
            <EntryCard key={i} entry={entry} kind={activeSection.kind} />
          ))}
          <TopItems items={activeSection.topItems} kind={activeSection.kind} />
        </div>
      ) : (
        <p className="text-sm text-slate-400 italic">Sem dados para esta secção.</p>
      )}
    </div>
  )
}
