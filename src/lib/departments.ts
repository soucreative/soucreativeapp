// Centros de custo da SOU Creative. Provisório: a repartição por centros ainda
// está por decidir. Ao mudar esta lista, mudar também os CHECK do schema
// (supabase/sou-schema.sql: toc_expense_map, revenue_distribution, budget_lines).
export const DEPARTMENTS = [
  'Produção',
  'Design',
  'Gestão',
  'Outros',
] as const

export type Department = (typeof DEPARTMENTS)[number]

/** Departamentos que geram faturação diretamente */
export const OPERATIONAL_DEPTS = [
  'Produção',
  'Design',
] as const

/** Departamentos de suporte/overhead — custos redistribuídos pelos operacionais */
export const OVERHEAD_DEPTS = [
  'Gestão',
] as const
