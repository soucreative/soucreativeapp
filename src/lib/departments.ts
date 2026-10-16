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

// Departamentos das pessoas: os centros de custo e mais os que ainda não são
// centro de custo (a Loja). Se a Loja passar a centro, muda-se para DEPARTMENTS.
export const EMPLOYEE_DEPARTMENTS = [...DEPARTMENTS, 'Loja'] as const

/** Departamentos que geram faturação diretamente */
export const OPERATIONAL_DEPTS = [
  'Produção',
  'Design',
] as const

/** Departamentos de suporte/overhead — custos redistribuídos pelos operacionais */
export const OVERHEAD_DEPTS = [
  'Gestão',
] as const
