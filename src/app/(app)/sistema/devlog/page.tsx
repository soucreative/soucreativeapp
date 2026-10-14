import { readFileSync } from 'fs'
import { join } from 'path'
import { requirePageAccess } from '@/lib/auth'
import { isFullAccess } from '@/lib/permissions'
import { createAdminClient } from '@/lib/supabase/admin'
import QuadroIdeias, { type Ideia } from './_components/ideias'
import DevlogClient, {
  type CheckItem,
  type DevlogEntry,
  type DevlogSection,
} from './_components/devlog-client'

export const dynamic = 'force-dynamic'

// ── Parser ────────────────────────────────────────────────────────────────

function parseEntryBlock(raw: string): DevlogEntry {
  const lines = raw.split('\n')
  const title = lines[0].replace(/^### /, '').trim()
    // strip trailing date/status markers like ✅ *(2026-06-11)*
    .replace(/\s*✅.*$/, '').replace(/\s*\*\(.*?\)\*\s*$/, '').trim()

  let priority: string | undefined
  let status:   string | undefined
  let date:     string | undefined
  let description = ''
  const items: CheckItem[] = []

  for (const line of lines.slice(1)) {
    const t = line.trim()
    if (!t) continue

    const doneM    = t.match(/^- \[x\] (.+)/i)
    const pendingM = t.match(/^- \[ \] (.+)/i)
    const priM     = t.match(/^\*\*Prioridade:\*\*\s*(.+)/i)
    const statM    = t.match(/^\*\*Estado[^:]*:\*\*\s*(.+)/i)
    const dateM    = t.match(/\*\((\d{4}-\d{2}-\d{2})\)\*/)

    if      (doneM)    items.push({ done: true,  text: doneM[1] })
    else if (pendingM) items.push({ done: false, text: pendingM[1] })
    else if (priM)     priority = priM[1].replace(/\*\*/g, '').replace(/\s+$/, '')
    else if (statM)    status   = statM[1].replace(/\*\*/g, '').replace(/\s+$/, '')
    else if (dateM)    date     = dateM[1]
    else if (
      !description &&
      !t.startsWith('#') && !t.startsWith('|') && !t.startsWith('>') &&
      !t.startsWith('**O que') && !t.startsWith('**Fonte') &&
      !t.startsWith('**Tabela') && !t.startsWith('**Precisa') &&
      !t.startsWith('**Próximo') && !t.startsWith('**Mapeamento') &&
      !t.startsWith('**Notas') && !t.startsWith('```') &&
      !t.match(/^\d+\./) && !t.startsWith('- ') && t.length > 20
    ) {
      description = t.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*/g, '').trim()
    }
  }

  return { title, priority, status, description, items, date }
}

function parseTopItems(block: string): CheckItem[] {
  const items: CheckItem[] = []
  for (const line of block.split('\n')) {
    const t = line.trim()
    const doneM    = t.match(/^- \[x\] (.+)/i)
    const pendingM = t.match(/^- \[ \] (.+)/i)
    // Table rows for the 🚫 section: | Item | Bloqueio |
    const tableM   = t.match(/^\|([^|]+)\|([^|]+)\|/)
    if      (doneM)    items.push({ done: true,  text: doneM[1] })
    else if (pendingM) items.push({ done: false, text: pendingM[1] })
    else if (tableM && !t.includes('---') && !t.toLowerCase().includes('| item')) {
      const col1 = tableM[1].trim()
      const col2 = tableM[2].trim()
      if (col1 && col2) items.push({ done: false, text: `${col1} — ${col2}` })
    }
  }
  return items
}

function parseDevlog(md: string): DevlogSection[] {
  const sections: DevlogSection[] = []

  // Split on top-level ## headings
  const sectionBlocks = md.split(/^(?=## )/m).filter(s => s.trim())

  for (const block of sectionBlocks) {
    const firstLine = block.split('\n')[0]
    if (!firstLine.startsWith('## ')) continue
    const heading = firstLine.replace(/^## /, '').trim()

    let kind: DevlogSection['kind'] = 'summary'
    if (heading.includes('✅'))  kind = 'done'
    else if (heading.includes('🔵')) kind = 'progress'
    else if (heading.includes('🤖')) kind = 'ai'
    else if (heading.includes('🚫')) kind = 'blocked'
    else if (heading.includes('📊')) kind = 'summary'

    // Split into entry blocks (### subsections)
    const subBlocks = block.split(/^(?=### )/m)
    const topBlock  = subBlocks[0]
    const entryBlocks = subBlocks.slice(1)

    const topItems = parseTopItems(topBlock)
    const entries  = entryBlocks.map(parseEntryBlock)

    // Merge duplicate sections (DEVLOG has two ✅ CONCLUÍDO blocks)
    const existing = sections.find(s => s.kind === kind)
    if (existing) {
      existing.entries.push(...entries)
      existing.topItems.push(...topItems)
    } else {
      sections.push({ kind, heading, entries, topItems })
    }
  }

  return sections
}

// ── Page ──────────────────────────────────────────────────────────────────

export default async function DevlogPage() {
  const emp = await requirePageAccess('/sistema/devlog')

  let content = ''
  try {
    content = readFileSync(join(process.cwd(), 'DEVLOG.md'), 'utf-8')
  } catch {
    content = '## 🔵 EM CURSO\n### DEVLOG.md não encontrado\nO ficheiro DEVLOG.md não existe na raiz do projecto.\n'
  }

  const sections    = parseDevlog(content)
  const updatedMatch = content.match(/> Última atualização:\s*(\S+)/)
  const lastUpdated  = updatedMatch?.[1] ?? ''

  const { data: ideiasRows } = await createAdminClient()
    .from('dev_ideias')
    .select('id, titulo, descricao, area, tipo, estado, created_at, autor:employees(first_name, last_name)')
    .order('created_at', { ascending: false })
  const ideias: Ideia[] = (ideiasRows ?? []).map(r => {
    const autor = (Array.isArray(r.autor) ? r.autor[0] : r.autor) as { first_name: string; last_name: string } | null
    return {
      id: r.id, titulo: r.titulo, descricao: r.descricao, area: r.area, tipo: r.tipo, estado: r.estado,
      created_at: r.created_at, autor: autor ? `${autor.first_name} ${autor.last_name}` : '—',
    }
  })

  return (
    <>
      <div className="px-8 pt-8">
        <QuadroIdeias ideias={ideias} podeDecidir={isFullAccess(emp.app_role) || emp.app_role === 'management'} />
      </div>
      <DevlogClient sections={sections} lastUpdated={lastUpdated} />
    </>
  )
}
