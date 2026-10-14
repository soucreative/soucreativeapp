import { createAdminClient } from '@/lib/supabase/admin'
import { ARTIGOS_INICIAIS, completarParametros } from '@/lib/producao/defaults'
import type { Artigo, Cliente, Orcamento, Parametros, Pessoa, RegistoPessoas } from '@/lib/producao/types'
import { estimatePayrollForMonth } from '@/lib/payroll'
import type { PayrollCompRow, PayrollContractRow, PayrollEmpRow, PayrollTaxRow } from '@/lib/payroll'

export interface DadosProducao {
  parametros: Parametros
  artigos: Artigo[]
  clientes: Cliente[]
  orcamentos: Orcamento[]
}

type LinhaArtigo = {
  id: string; nome: string; categoria: string; fornecedor: string
  custo: number; minimo: number; portes: number; nota: string | null
}
type LinhaCliente = {
  id: string; nome: string; tipo: Cliente['tipo']; nif: string | null; email: string | null
  telefone: string | null; notas: string | null; created_at: string
}

export function artigoDeLinha(r: LinhaArtigo): Artigo {
  return {
    id: r.id, nome: r.nome, categoria: r.categoria, fornecedor: r.fornecedor,
    custo: Number(r.custo), minimo: Number(r.minimo), portes: Number(r.portes), nota: r.nota ?? undefined,
  }
}

export function clienteDeLinha(r: LinhaCliente): Cliente {
  return {
    id: r.id, nome: r.nome, tipo: r.tipo, nif: r.nif ?? undefined, email: r.email ?? undefined,
    telefone: r.telefone ?? undefined, notas: r.notas ?? undefined, criadoEm: r.created_at,
  }
}

/** Que departamento faz cada função da calculadora. */
const DEPARTAMENTO_DA_FUNCAO: Record<Pessoa['id'], string> = {
  designer: 'Design',
  operador: 'Produção',
}

/**
 * Custo dos colaboradores ativos de cada função, para os próximos 12 meses ao
 * salário em vigor: o mesmo cálculo da Remuneração (TSU, subsídios conforme o
 * modo, subsídio de alimentação, estágios), sem ausências.
 */
async function custosDoRegisto(): Promise<Record<Pessoa['id'], RegistoPessoas>> {
  const admin = createAdminClient()
  const [empsRes, compsRes, taxRes, ctrRes] = await Promise.all([
    admin.from('employees')
      .select('id, first_name, last_name, department, work_regime, days_per_week, position_type')
      .eq('status', 'active')
      .in('department', Object.values(DEPARTAMENTO_DA_FUNCAO))
      .not('position_type', 'eq', 'outsourcing'),
    admin.from('compensation').select('employee_id, base_salary, effective_date, end_date'),
    admin.from('employee_tax_info').select('employee_id, subsidy_payment_mode, meal_allowance_daily, working_days_per_month'),
    admin.from('contracts').select('employee_id, contract_type, start_date, end_date').eq('contract_type', 'internship'),
  ])
  type Emp = { id: string; first_name: string; last_name: string; department: string; work_regime: string; days_per_week: number | null }
  const emps = (empsRes.data ?? []) as Emp[]

  // Próximos 12 meses a partir do mês corrente
  const custo: Record<string, number> = {}
  const hoje = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1)
    const mes = estimatePayrollForMonth(
      emps.map(e => ({ id: e.id, department: e.department })) as PayrollEmpRow[],
      (compsRes.data ?? []) as PayrollCompRow[],
      (taxRes.data ?? []) as PayrollTaxRow[],
      [],
      d.getFullYear(),
      d.getMonth() + 1,
      undefined,
      (ctrRes.data ?? []) as PayrollContractRow[],
    )
    for (const [id, v] of Object.entries(mes.byEmployee)) custo[id] = (custo[id] ?? 0) + v
  }

  const registo = {} as Record<Pessoa['id'], RegistoPessoas>
  for (const [funcao, departamento] of Object.entries(DEPARTAMENTO_DA_FUNCAO) as [Pessoa['id'], string][]) {
    const pessoas = emps
      .filter(e => e.department === departamento && (custo[e.id] ?? 0) > 0)
      .map(e => ({
        nome: `${e.first_name} ${e.last_name}`,
        custoAnual: custo[e.id],
        fte: e.work_regime === 'part_time' ? (e.days_per_week ?? 5) / 5 : 1,
      }))
    registo[funcao] = {
      departamento,
      custoAnual: pessoas.reduce((s, p) => s + p.custoAnual, 0),
      fte: pessoas.reduce((s, p) => s + p.fte, 0),
      pessoas,
    }
  }
  return registo
}

/** Parâmetros gravados, completados com os de partida e com o custo dos colaboradores registados. */
export async function carregarParametros(): Promise<Parametros> {
  const [{ data }, registo] = await Promise.all([
    createAdminClient().from('prod_parametros').select('dados').eq('id', 1).maybeSingle(),
    custosDoRegisto(),
  ])
  const params = completarParametros((data?.dados ?? {}) as Partial<Parametros>)
  return { ...params, pessoas: params.pessoas.map(p => ({ ...p, registo: registo[p.id] })) }
}

export async function carregarDadosProducao(): Promise<DadosProducao> {
  const admin = createAdminClient()
  const [parametros, artigosRes, clientesRes, orcRes] = await Promise.all([
    carregarParametros(),
    admin.from('prod_artigos').select('*').order('categoria').order('nome'),
    admin.from('prod_clientes').select('*').order('nome'),
    admin.from('prod_orcamentos').select('conteudo').order('created_at', { ascending: false }),
  ])

  // Catálogo vazio (primeira utilização): mostra os artigos do v27 até alguém gravar.
  const artigos = artigosRes.data?.length
    ? (artigosRes.data as LinhaArtigo[]).map(artigoDeLinha)
    : structuredClone(ARTIGOS_INICIAIS)

  return {
    parametros,
    artigos,
    clientes: ((clientesRes.data ?? []) as LinhaCliente[]).map(clienteDeLinha),
    orcamentos: ((orcRes.data ?? []) as { conteudo: Orcamento }[]).map(r => r.conteudo),
  }
}
