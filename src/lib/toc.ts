/**
 * TOC Online API client
 *
 * OAuth2 Authorization Code flow:
 *   Auth  → https://app9.toconline.pt/oauth/auth
 *   Token → https://app9.toconline.pt/oauth/token
 *   API   → https://api9.toconline.pt
 */

import { createAdminClient } from '@/lib/supabase/admin'

const TOC_OAUTH_URL = process.env.TOC_OAUTH_URL ?? 'https://app9.toconline.pt/oauth'
const TOC_API_URL   = process.env.TOC_API_URL   ?? 'https://api9.toconline.pt'
const CLIENT_ID     = process.env.TOC_CLIENT_ID!
const CLIENT_SECRET = process.env.TOC_CLIENT_SECRET!

// ── Token storage (single row in toc_tokens) ──────────────────────────────

export type TocTokenRow = {
  access_token:  string
  refresh_token: string
  expires_at:    string   // ISO timestamp
}

export async function getStoredToken(): Promise<TocTokenRow | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('toc_tokens')
    .select('access_token, refresh_token, expires_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data as TocTokenRow | null
}

export async function saveToken(token: {
  access_token: string
  refresh_token: string
  expires_in: number
}) {
  const supabase  = createAdminClient()
  const expiresAt = new Date(Date.now() + token.expires_in * 1000 - 60_000).toISOString()

  // Upsert the single token row
  const { error } = await supabase.from('toc_tokens').upsert({
    id:            1,
    access_token:  token.access_token,
    refresh_token: token.refresh_token,
    expires_at:    expiresAt,
    updated_at:    new Date().toISOString(),
  }, { onConflict: 'id' })

  if (error) throw new Error(`Erro ao guardar token TOC: ${error.message}`)
}

// ── OAuth helpers ─────────────────────────────────────────────────────────

export function buildAuthUrl(redirectUri: string, state?: string): string {
  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         'commercial',
    ...(state ? { state } : {}),
  })
  return `${TOC_OAUTH_URL}/auth?${params}`
}

export async function exchangeCodeForToken(code: string, redirectUri: string) {
  // TOC Online expects client credentials in the POST body (not Basic auth)
  const res = await fetch(`${TOC_OAUTH_URL}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept':       'application/json',
    },
    body: new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      redirect_uri:  redirectUri,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Erro OAuth TOC (${res.status}): ${text}`)
  }

  return res.json() as Promise<{
    access_token:  string
    refresh_token: string
    expires_in:    number
    token_type:    string
  }>
}

async function refreshToken(refreshTok: string) {
  const res = await fetch(`${TOC_OAUTH_URL}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept':       'application/json',
    },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: refreshTok,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Erro ao renovar token TOC (${res.status}): ${text}`)
  }

  return res.json() as Promise<{
    access_token:  string
    refresh_token: string
    expires_in:    number
    token_type:    string
  }>
}

/** Returns a valid access token, refreshing if needed */
export async function getValidAccessToken(): Promise<string> {
  const stored = await getStoredToken()
  if (!stored) throw new Error('TOC Online não está ligado. Autoriza a ligação primeiro.')

  // Refresh proactively 30 min before expiry (rotating refresh tokens mean
  // we must save the new refresh_token returned by each refresh call)
  const expiresAt  = new Date(stored.expires_at)
  const refreshAt  = new Date(expiresAt.getTime() - 30 * 60 * 1000)
  const needsRefresh = new Date() >= refreshAt

  if (!needsRefresh) return stored.access_token

  // Refresh
  const fresh = await refreshToken(stored.refresh_token)
  await saveToken(fresh)  // saves both new access_token AND new refresh_token
  return fresh.access_token
}

// ── API requests ──────────────────────────────────────────────────────────
// TOC Online API returns a flat JSON array — no filtering or pagination params
// are supported (any query param causes JA000/JA010). We fetch all docs and
// filter in memory by date.

async function tocFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${TOC_API_URL}${path}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept':        'application/json',
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`TOC API erro ${res.status} em ${path}: ${text}`)
  }
  return res.json() as Promise<T>
}

// ── Sales documents (faturação) ───────────────────────────────────────────

export type TocSaleDoc = {
  document_no:         string
  document_type:       string   // FT, FP, NC, GT, OR, ...
  date:                string   // YYYY-MM-DD
  status:              number
  gross_total:         number
  net_total:           number   // sem IVA — usado para agregar faturação
  tax_payable:         number
  // campos de cliente — confirmados via /api/toc/debug-doc?endpoint=commercial_sales_documents
  customer_business_name?:          string
  customer_tax_registration_number?: string
}

/** Fetches ALL sales docs and returns those in the given year+month */
export async function fetchSalesDocuments(year: number, month: number): Promise<TocSaleDoc[]> {
  const token     = await getValidAccessToken()
  const dateStart = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay   = new Date(year, month, 0).getDate()
  const dateEnd   = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const all = await tocFetch<TocSaleDoc[]>('/api/v1/commercial_sales_documents', token)
  // Excluir documentos anulados (status 4); as notas de crédito (NC) continuam a
  // ser subtraídas em buildSyncPreview
  return all.filter(d => d.date >= dateStart && d.date <= dateEnd && d.status !== 4)
}

// ── Purchase documents (despesas / FSE) ───────────────────────────────────

export type TocPurchaseDoc = {
  document_no:    string
  document_type:  string   // FC, DSP, NCF, SIF, ...
  date:           string
  status:         number
  gross_total:    number
  net_total:      number   // sem IVA — usado para agregar FSE/custos
  tax_payable:    number
}

/** Fetches ALL purchase docs and returns those in the given year+month */
export async function fetchPurchaseDocuments(year: number, month: number): Promise<TocPurchaseDoc[]> {
  const token     = await getValidAccessToken()
  const dateStart = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay   = new Date(year, month, 0).getDate()
  const dateEnd   = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const all = await tocFetch<TocPurchaseDoc[]>('/api/v1/commercial_purchases_documents', token)
  // Excluir documentos anulados (status 4)
  return all.filter(d => d.date >= dateStart && d.date <= dateEnd && d.status !== 4)
}

// ── TOC Item Map (item_code → departamento) ───────────────────────────────

export type TocItemMapRow = {
  id:         number
  item_code:  string
  department: string | null
  label:      string
}

/**
 * Fallback hardcoded — usado enquanto a tabela toc_item_map não existir no Supabase.
 * Corre o SQL de migração em /financeiro/item-codes para activar a gestão dinâmica.
 */

// A SOU começa sem mapa: os códigos de artigo definem-se em /financeiro/item-codes.
const HORA_DEPT_MAP_FALLBACK: Record<string, string | null> = {}

/**
 * Lê o mapeamento item_code → departamento da tabela toc_item_map no Supabase.
 * Se a tabela não existir ou estiver vazia, usa o mapa hardcoded como fallback.
 */
export async function getItemMap(): Promise<{ map: Record<string, string | null>; rows: TocItemMapRow[] }> {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('toc_item_map')
      .select('id, item_code, department, label')
      .order('item_code')

    if (error || !data?.length) {
      const rows = Object.entries(HORA_DEPT_MAP_FALLBACK).map(([item_code, department], i) => ({
        id: i + 1,
        item_code,
        department,
        label: department ? `Hora – ${department}` : `Hora genérica (${item_code})`,
      }))
      return { map: { ...HORA_DEPT_MAP_FALLBACK }, rows }
    }

    const map: Record<string, string | null> = {}
    for (const row of data) map[row.item_code] = row.department
    return { map, rows: data as TocItemMapRow[] }
  } catch {
    const rows = Object.entries(HORA_DEPT_MAP_FALLBACK).map(([item_code, department], i) => ({
      id: i + 1,
      item_code,
      department,
      label: department ? `Hora – ${department}` : `Hora genérica (${item_code})`,
    }))
    return { map: { ...HORA_DEPT_MAP_FALLBACK }, rows }
  }
}

// ── TOC articles (catálogo de artigos) ───────────────────────────────────

export type TocArticle = {
  item_code:   string
  description: string
}

type RawDocLine = {
  item_code?:         unknown
  description?:       unknown
  item_description?:  unknown
  name?:              unknown
  [key: string]:      unknown
}

/**
 * The TOC /api/v1/items endpoint is not accessible with the `commercial` scope.
 * Instead we scan all lines across every sales document to discover which item
 * codes are actually in use — those are the only ones that matter.
 */
export async function fetchAllTocArticles(): Promise<TocArticle[]> {
  const token = await getValidAccessToken()

  const docs = await tocFetch<({ lines?: RawDocLine[] } & Record<string, unknown>)[]>(
    '/api/v1/commercial_sales_documents',
    token,
  )

  const seen = new Map<string, string>()   // item_code → description

  for (const doc of docs) {
    if (!Array.isArray(doc.lines)) continue
    for (const line of doc.lines) {
      const code = String(line.item_code ?? '').trim()
      if (!code || seen.has(code)) continue
      const label = String(
        line.description ??
        line.item_description ??
        line.name ??
        `Artigo ${code}`
      ).trim()
      seen.set(code, label)
    }
  }

  return Array.from(seen.entries()).map(([item_code, description]) => ({ item_code, description }))
}

// ── Faturação por cliente ─────────────────────────────────────────────────

export type ClientBillingEntry = {
  name:      string
  tax_id:    string | null
  net_total: number
  doc_count: number
}

/**
 * Groups sales documents for the given month by customer (third_party_name).
 * Credit notes (NC, NCF, …) subtract from the total.
 * Returns entries sorted by net_total descending.
 */
export async function fetchSalesByClient(year: number, month: number): Promise<ClientBillingEntry[]> {
  const token     = await getValidAccessToken()
  const dateStart = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay   = new Date(year, month, 0).getDate()
  const dateEnd   = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const all         = await tocFetch<TocSaleDoc[]>('/api/v1/commercial_sales_documents', token)
  const CREDIT_TYPES = new Set(['NC', 'NCF', 'NDE', 'NDEP'])
  const byClient    = new Map<string, ClientBillingEntry>()

  for (const doc of all) {
    if (doc.date < dateStart || doc.date > dateEnd) continue
    const name   = doc.customer_business_name          ?? ''
    const tax_id = doc.customer_tax_registration_number ?? null
    const sign   = CREDIT_TYPES.has(doc.document_type) ? -1 : 1
    const amount = (doc.net_total ?? 0) * sign

    const entry  = byClient.get(name) ?? { name, tax_id, net_total: 0, doc_count: 0 }
    entry.net_total += amount
    entry.doc_count++
    byClient.set(name, entry)
  }

  return Array.from(byClient.values())
    .filter(e => e.name !== '')
    .sort((a, b) => b.net_total - a.net_total)
}

// ── Aggregation ───────────────────────────────────────────────────────────

export type TocSyncPreview = {
  year:    number
  month:   number
  revenue: number          // sales FT/FS/FR minus NC
  fse:     number          // só custo operacional, decidido por toc_expense_map
  direct_costs: number     // purchase docs DSP (despesas)
  financial_costs: number  // juros e encargos (classe 69) — abaixo do EBITDA
  investments:     number  // imobilizado (classe 4) — abaixo do EBITDA
  excluded:        number  // empréstimos e leasing (classe 2) — não é custo
  /** contas que o mapa não conhece: contam como FSE, mas ficam à vista */
  unmapped:   { account_code: string; description: string; amount: number }[]
  /** sem a tabela do mapa não há classificação: o FSE volta ao total dos documentos */
  mapMissing: boolean
  sales_count:    number
  purchase_count: number
  details: {
    sales_by_type:    Record<string, number>
    purchases_by_type: Record<string, number>
  }
}

export async function buildSyncPreview(year: number, month: number): Promise<TocSyncPreview> {
  const [sales, purchases] = await Promise.all([
    fetchSalesDocuments(year, month),
    fetchPurchaseDocuments(year, month),
  ])

  // ── Sales: group by document_type (net_total = sem IVA) ──────────────
  const salesByType: Record<string, number> = {}
  for (const doc of sales) {
    const t = doc.document_type ?? 'OTHER'
    salesByType[t] = (salesByType[t] ?? 0) + (doc.net_total ?? 0)
  }

  // Revenue = FT + OR + GT - NC (credit notes subtract)
  const CREDIT_TYPES = new Set(['NC', 'NCF', 'NDE', 'NDEP'])
  let revenue = 0
  for (const [type, val] of Object.entries(salesByType)) {
    revenue += CREDIT_TYPES.has(type) ? -val : val
  }

  // ── Purchases: group by document_type (net_total = sem IVA) ──────────
  const purchasesByType: Record<string, number> = {}
  for (const doc of purchases) {
    const t = doc.document_type ?? 'OTHER'
    purchasesByType[t] = (purchasesByType[t] ?? 0) + (doc.net_total ?? 0)
  }

  // DSP = despesas internas (custos diretos), como antes; tudo o resto é
  // classificado linha a linha pela conta SNC
  const COST_TYPES   = new Set(['DSP'])
  const CREDIT_PURCH = new Set(['NCF', 'NLCF', 'NLDF'])

  let direct_costs = 0
  for (const [type, val] of Object.entries(purchasesByType)) {
    if (COST_TYPES.has(type)) direct_costs += val
  }

  const { rows: expenseMap, missing: mapMissing } = await getExpenseMap()
  const byCode = new Map(expenseMap.map(r => [r.account_code, r]))

  let fse = 0, financial_costs = 0, investments = 0, excluded = 0
  const unmapped = new Map<string, { account_code: string; description: string; amount: number }>()

  for (const doc of purchases) {
    const type = doc.document_type ?? 'OTHER'
    if (COST_TYPES.has(type)) continue                       // já contado acima
    const sign  = CREDIT_PURCH.has(type) ? -1 : 1
    const lines = (doc as { lines?: RawDocLine[] }).lines

    // Um documento sem linhas não pode ser classificado — conta inteiro como FSE
    // em vez de desaparecer
    if (!Array.isArray(lines) || lines.length === 0) {
      fse += (doc.net_total ?? 0) * sign
      continue
    }

    for (const line of lines) {
      const code   = String(line.item_code ?? '').trim()
      const amount = Number(line.net_amount ?? line.amount ?? 0) * sign
      if (!Number.isFinite(amount)) continue

      const row = code ? byCode.get(code) : undefined
      if (!row) {
        fse += amount
        if (code) {
          const prev = unmapped.get(code)
          if (prev) prev.amount += amount
          else unmapped.set(code, {
            account_code: code,
            description:  String(line.description ?? '').trim(),
            amount,
          })
        }
        continue
      }

      switch (row.kind) {
        case 'financeiro':   financial_costs += amount; break
        case 'investimento': investments     += amount; break
        case 'ignorar':      excluded        += amount; break
        default:             fse             += amount
      }
    }
  }

  const r2 = (v: number) => Math.round(v * 100) / 100

  return {
    year, month,
    revenue:         r2(revenue),
    fse:             r2(Math.max(0, fse)),
    direct_costs:    r2(direct_costs),
    financial_costs: r2(financial_costs),
    investments:     r2(investments),
    excluded:        r2(excluded),
    unmapped:        Array.from(unmapped.values()).sort((a, b) => b.amount - a.amount),
    mapMissing,
    sales_count:    sales.length,
    purchase_count: purchases.length,
    details: { sales_by_type: salesByType, purchases_by_type: purchasesByType },
  }
}

// ── Mapa de contas de despesa (conta SNC → centro de custo) ───────────────
// As linhas dos documentos de compra trazem a conta SNC em `item_code`
// (6221001, 6224001, 6261001…). É por aí que os custos se repartem pelos
// centros — o balancete não é acessível pela API, mas isto dá o mesmo detalhe.

export type TocExpenseKind = 'fse' | 'investimento' | 'financeiro' | 'ignorar'

export type TocExpenseMapRow = {
  id:           number
  account_code: string
  cost_center:  string | null
  label:        string
  kind:         TocExpenseKind
}

/** Notas de crédito de compra: subtraem ao custo */
const CREDIT_PURCHASE_TYPES = new Set(['NCF', 'NLCF', 'NLDF'])

export type TocExpenseLine = {
  month:        number
  account_code: string
  description:  string
  supplier:     string
  amount:       number   // líquido, já com o sinal das notas de crédito
}

type RawPurchaseDoc = {
  date?:          unknown
  status?:        unknown
  voided_reason?: unknown
  document_type?: unknown
  supplier_business_name?: unknown
  lines?: { item_code?: unknown; description?: unknown; net_amount?: unknown; amount?: unknown }[]
}

/** Todas as linhas de compra de um ano, com a conta SNC de cada uma */
export async function fetchPurchaseLines(year: number): Promise<TocExpenseLine[]> {
  const token = await getValidAccessToken()
  const docs  = await tocFetch<RawPurchaseDoc[]>('/api/v1/commercial_purchases_documents', token)

  const out: TocExpenseLine[] = []
  const yearStr = String(year)

  for (const doc of docs) {
    const date = String(doc.date ?? '')
    if (!date.startsWith(yearStr)) continue
    if (doc.status === 4 || doc.voided_reason) continue     // anulados
    if (!Array.isArray(doc.lines)) continue

    const month = Number(date.slice(5, 7))
    if (!month || month < 1 || month > 12) continue

    const type = String(doc.document_type ?? '')
    const sign = CREDIT_PURCHASE_TYPES.has(type) ? -1 : 1
    const supplier = String(doc.supplier_business_name ?? '').trim()

    for (const line of doc.lines) {
      const account_code = String(line.item_code ?? '').trim()
      if (!account_code) continue
      const raw = Number(line.net_amount ?? line.amount ?? 0)
      if (!Number.isFinite(raw)) continue
      out.push({
        month,
        account_code,
        description: String(line.description ?? '').trim(),
        supplier,
        amount: raw * sign,
      })
    }
  }

  return out
}

/**
 * Lê o mapa conta → centro. Ao contrário do mapa de artigos não há fallback:
 * sem a tabela não se adivinha a que centro pertence um custo, e inventar a
 * repartição seria pior do que não a fazer.
 */
export async function getExpenseMap(): Promise<{
  rows:    TocExpenseMapRow[]
  missing: boolean
}> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('toc_expense_map')
    .select('id, account_code, cost_center, label, kind')
    .order('account_code')

  if (error) return { rows: [], missing: true }
  return { rows: (data ?? []) as TocExpenseMapRow[], missing: false }
}

/** Contas de despesa em uso, descobertas a varrer as linhas de compra */
export async function fetchAllTocExpenseAccounts(): Promise<
  { account_code: string; description: string }[]
> {
  const token = await getValidAccessToken()
  const docs  = await tocFetch<RawPurchaseDoc[]>('/api/v1/commercial_purchases_documents', token)

  const seen = new Map<string, string>()
  for (const doc of docs) {
    if (doc.status === 4 || !Array.isArray(doc.lines)) continue
    for (const line of doc.lines) {
      const code = String(line.item_code ?? '').trim()
      if (!code) continue
      const label = String(line.description ?? '').trim() || `Conta ${code}`
      // fica a descrição mais completa que aparecer
      const prev = seen.get(code)
      if (!prev || label.length > prev.length) seen.set(code, label)
    }
  }

  return Array.from(seen.entries())
    .map(([account_code, description]) => ({ account_code, description }))
    .sort((a, b) => a.account_code.localeCompare(b.account_code, 'pt', { numeric: true }))
}
