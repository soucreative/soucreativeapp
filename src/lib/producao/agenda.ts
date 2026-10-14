import { getPortugueseHolidays } from "../holidays";
import { calcularOrcamento, tempoProducao, type ResultadoOrcamento } from "./engine";
import type { EtapaProducao, Orcamento, Parametros } from "./types";

// Pipeline de produção: fila dos trabalhos ganhos e data prevista de cada um.
//
// Cada máquina, os operadores e os designers são recursos com uma capacidade
// diária (horas por dia útil). Os trabalhos entram na fila pela ordem do
// pipeline (primeiro os que estão em produção) e cada um ocupa os recursos de
// que precisa. A data prevista de um trabalho é o dia em que o último recurso
// de que precisa acaba a sua parte. É uma estimativa: os recursos trabalham em
// paralelo e não se conta o que já foi feito de um trabalho em curso.

export const ETAPAS: { id: EtapaProducao; nome: string }[] = [
  { id: "por_iniciar", nome: "Por iniciar" },
  { id: "em_producao", nome: "Em produção" },
  { id: "pronto", nome: "Pronto para entrega" },
  { id: "entregue", nome: "Entregue" },
];

/** Etapa de um orçamento ganho; os que ainda não têm produção começam por iniciar. */
export function etapaDe(o: Orcamento): EtapaProducao | null {
  if (o.estado !== "ganho") return null;
  return o.producao?.etapa ?? (o.produzidoEm ? "pronto" : "por_iniciar");
}

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Dia útil (sem fins de semana nem feriados nacionais) ao fim de `dias` dias de trabalho, a contar de hoje. */
export function somarDiasUteis(inicio: Date, dias: number): string {
  const d = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
  const feriados = new Map<number, Set<string>>();
  const eUtil = (x: Date) => {
    const ano = x.getFullYear();
    if (!feriados.has(ano)) feriados.set(ano, getPortugueseHolidays(ano));
    return x.getDay() !== 0 && x.getDay() !== 6 && !feriados.get(ano)!.has(iso(x));
  };
  // Hoje conta se for dia útil: um trabalho de meio dia fica pronto hoje
  let restantes = Math.max(1, Math.ceil(dias - 1e-9));
  while (!eUtil(d)) d.setDate(d.getDate() + 1);
  while (--restantes > 0) {
    d.setDate(d.getDate() + 1);
    while (!eUtil(d)) d.setDate(d.getDate() + 1);
  }
  return iso(d);
}

export interface Recurso {
  id: string;
  nome: string;
  minutosDia: number;
}

export function recursos(params: Parametros): Recurso[] {
  const cap = params.capacidade ?? { horasDiaMaquina: 7, horasDiaPessoa: 7 };
  const pessoa = (id: "designer" | "operador") => {
    const p = params.pessoas.find((x) => x.id === id);
    return p ? tempoProducao(p) : 0;
  };
  return [
    ...params.maquinas.map((m) => ({ id: m.id, nome: m.nome.split(" (")[0], minutosDia: cap.horasDiaMaquina * 60 * (m.cabecas ?? 1) })),
    { id: "operador", nome: "Operadores", minutosDia: cap.horasDiaPessoa * 60 * Math.max(pessoa("operador"), 0) },
    { id: "designer", nome: "Design", minutosDia: cap.horasDiaPessoa * 60 * Math.max(pessoa("designer"), 0) },
  ];
}

/** Minutos de cada recurso de que um orçamento precisa. */
export function necessidades(r: ResultadoOrcamento): Record<string, number> {
  return { ...r.minutosMaquina, operador: r.minutosOperador, designer: r.minutosDesigner };
}

export interface Planeado {
  o: Orcamento;
  r: ResultadoOrcamento;
  etapa: EtapaProducao;
  diasTrabalho: number;
  dataPrevista: string;
  atrasado: boolean; // a data prevista passa o prazo prometido
}

export interface Plano {
  trabalhos: Planeado[];
  carga: { recurso: Recurso; minutos: number; dias: number; ocupadoAte: string | null }[];
}

/** Ordem da fila: primeiro o que está em produção, depois o que está por iniciar, cada um pela sua ordem. */
export function ordenarFila(orcs: Orcamento[]): Orcamento[] {
  const peso = (e: EtapaProducao | null) => (e === "em_producao" ? 0 : e === "por_iniciar" ? 1 : 2);
  return [...orcs].sort(
    (a, b) => peso(etapaDe(a)) - peso(etapaDe(b)) || (a.producao?.ordem ?? 0) - (b.producao?.ordem ?? 0),
  );
}

export function planear(params: Parametros, orcamentos: Orcamento[], hoje = new Date()): Plano {
  const rec = recursos(params);
  const acumulado: Record<string, number> = {};
  const trabalhos: Planeado[] = [];

  for (const o of ordenarFila(orcamentos.filter((x) => ["por_iniciar", "em_producao"].includes(etapaDe(x) ?? "")))) {
    const r = calcularOrcamento(params, o);
    let dias = 0;
    for (const [id, min] of Object.entries(necessidades(r))) {
      if (min <= 0) continue;
      acumulado[id] = (acumulado[id] ?? 0) + min;
      const cap = rec.find((x) => x.id === id)?.minutosDia ?? 0;
      // Sem capacidade (ninguém registado) não se consegue prever: conta como um dia
      dias = Math.max(dias, cap > 0 ? acumulado[id] / cap : 1);
    }
    const dataPrevista = somarDiasUteis(hoje, dias);
    trabalhos.push({
      o,
      r,
      etapa: etapaDe(o)!,
      diasTrabalho: dias,
      dataPrevista,
      atrasado: !!o.producao?.prazo && dataPrevista > o.producao.prazo,
    });
  }

  const carga = rec
    .map((recurso) => {
      const minutos = acumulado[recurso.id] ?? 0;
      const dias = recurso.minutosDia > 0 ? minutos / recurso.minutosDia : 0;
      return { recurso, minutos, dias, ocupadoAte: minutos > 0 ? somarDiasUteis(hoje, dias) : null };
    })
    .filter((c) => c.minutos > 0 || c.recurso.id === "operador");

  return { trabalhos, carga };
}

/** Data prevista para um trabalho novo se fosse ganho agora (entra no fim da fila). */
export function preverNovo(params: Parametros, orcamentos: Orcamento[], novo: Orcamento, hoje = new Date()): Planeado | undefined {
  const simulado: Orcamento = {
    ...novo,
    estado: "ganho",
    producao: { etapa: "por_iniciar", ordem: Number.MAX_SAFE_INTEGER },
  };
  return planear(params, [...orcamentos.filter((o) => o.id !== novo.id), simulado], hoje).trabalhos.find((t) => t.o.id === novo.id);
}

