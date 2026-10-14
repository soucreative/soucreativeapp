"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import * as acoes from "../actions";
import type { DadosProducao } from "./dados";
import type { Artigo, Cliente, Orcamento, Parametros } from "@/lib/producao/types";

// Os ecrãs leem daqui e escrevem por aqui. A cópia local muda logo (o ecrã não
// espera pela rede) e a gravação segue para o Supabase por trás. Se falhar,
// aparece o aviso de gravação — a cópia local não se perde.

export type Dados = DadosProducao;

let cache: Dados | null = null;
let erro: string | null = null;
const ouvintes = new Set<() => void>();
const pendentes = new Map<string, ReturnType<typeof setTimeout>>();

function avisar() {
  for (const f of ouvintes) f();
}

function mudar(novo: Dados) {
  cache = novo;
  avisar();
}

function ler(): Dados {
  if (!cache) throw new Error("Dados de produção por carregar: falta o <HidratarProducao> no layout.");
  return cache;
}

// No servidor não há cópia em memória partilhada entre pedidos: cada render lê
// os dados do contexto. No browser, o contexto só serve para a primeira leitura.
export const ContextoProducao = createContext<Dados | null>(null);

/** Chamado pelo layout com os dados frescos do servidor. Não pisa gravações por fazer. */
export function hidratar(d: Dados) {
  if (typeof window === "undefined" || pendentes.size > 0) return;
  cache = d;
}

function subscrever(f: () => void) {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}

export function useDados(): Dados {
  const inicial = useContext(ContextoProducao);
  if (!inicial) throw new Error("useDados fora do <HidratarProducao>.");
  return useSyncExternalStore(
    subscrever,
    () => cache ?? inicial,
    () => inicial,
  );
}

export function useCarregado(): boolean {
  return true;
}

export function useErroGravacao(): string | null {
  return useSyncExternalStore(subscrever, () => erro, () => null);
}

async function gravar(p: Promise<{ ok: boolean; erro?: string }>) {
  try {
    const r = await p;
    erro = r.ok ? null : (r.erro ?? "Erro ao gravar.");
  } catch (e) {
    erro = e instanceof Error ? e.message : "Sem ligação ao servidor.";
  }
  avisar();
}

export function novoId(): string {
  return crypto.randomUUID();
}

function agora() {
  return new Date().toISOString();
}

// Data local (Portugal), não UTC: depois da meia-noite em UTC ainda é ontem.
export function hoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Parâmetros e stock ────────────────────────────────────────────────────

export function guardarParametros(p: Parametros) {
  mudar({ ...ler(), parametros: p });
  agendar("parametros", () => acoes.guardarParametros(ler().parametros));
}

/** Altera uma cópia dos parâmetros mais recentes e grava-a. */
export function atualizarParametros(fn: (d: Parametros) => void) {
  const d = structuredClone(ler().parametros);
  fn(d);
  guardarParametros(d);
}

export async function reporParametros() {
  const r = await acoes.reporParametros();
  if (r.ok) mudar({ ...ler(), parametros: r.valor });
  else {
    erro = r.erro;
    avisar();
  }
}

export function atualizarStock(id: string, stock: number | undefined, stockMinimo: number | undefined) {
  const d = ler();
  mudar({
    ...d,
    parametros: {
      ...d.parametros,
      consumiveis: d.parametros.consumiveis.map((c) => (c.id === id ? { ...c, stock, stockMinimo } : c)),
    },
  });
  agendar(`stock:${id}`, () => acoes.atualizarStock(id, stock, stockMinimo));
}

// ── Artigos e clientes ────────────────────────────────────────────────────

export function guardarArtigo(a: Artigo) {
  const d = ler();
  const existe = d.artigos.some((x) => x.id === a.id);
  const artigos = existe ? d.artigos.map((x) => (x.id === a.id ? a : x)) : [...d.artigos, a];
  mudar({ ...d, artigos });
  // O catálogo de partida só existe no ecrã até à primeira gravação: grava-se tudo.
  agendar(`artigo:${a.id}`, () => acoes.semearArtigos(ler().artigos));
}

export function apagarArtigo(id: string) {
  const d = ler();
  mudar({ ...d, artigos: d.artigos.filter((x) => x.id !== id) });
  void gravar(acoes.apagarArtigo(id));
}

export function guardarCliente(c: Cliente) {
  const d = ler();
  const existe = d.clientes.some((x) => x.id === c.id);
  mudar({ ...d, clientes: existe ? d.clientes.map((x) => (x.id === c.id ? c : x)) : [...d.clientes, c] });
  agendar(`cliente:${c.id}`, () => acoes.guardarCliente(c));
}

// ── Orçamentos ────────────────────────────────────────────────────────────

export async function criarOrcamento(parcial: Partial<Orcamento> = {}): Promise<Orcamento | null> {
  const o: Orcamento = {
    id: novoId(),
    numero: "",
    tipoCliente: "empresa",
    titulo: "",
    data: hoje(),
    estado: "rascunho",
    horasCriacao: 0,
    descontoPotencialPct: 0,
    linhas: [],
    atualizadoEm: agora(),
    ...parcial,
  };
  const r = await acoes.criarOrcamento(o);
  if (!r.ok) {
    erro = r.erro;
    avisar();
    return null;
  }
  mudar({ ...ler(), orcamentos: [r.valor, ...ler().orcamentos] });
  return r.valor;
}

// Aplica a alteração sobre a versão mais recente, e não sobre a que o ecrã
// tinha quando renderizou: duas alterações seguidas não se apagam.
export function atualizarOrcamento(id: string, fn: (o: Orcamento) => Orcamento) {
  const d = ler();
  mudar({
    ...d,
    orcamentos: d.orcamentos.map((x) => (x.id === id ? { ...fn(x), atualizadoEm: agora() } : x)),
  });
  agendar(`orcamento:${id}`, () => {
    const o = ler().orcamentos.find((x) => x.id === id);
    return o ? acoes.guardarOrcamento(o) : Promise.resolve({ ok: true as const, valor: null });
  });
}

export async function duplicarOrcamento(id: string): Promise<Orcamento | null> {
  const original = ler().orcamentos.find((x) => x.id === id);
  if (!original) return null;
  const { id: _id, numero: _n, congelado: _c, motivoPerda: _m, produzidoEm: _p, ...resto } = original;
  return criarOrcamento({
    ...structuredClone(resto),
    estado: "rascunho",
    data: hoje(),
    titulo: original.titulo ? `${original.titulo} (cópia)` : "",
  });
}

export function apagarOrcamento(id: string) {
  const d = ler();
  const t = pendentes.get(`orcamento:${id}`);
  if (t) clearTimeout(t);
  pendentes.delete(`orcamento:${id}`);
  mudar({ ...d, orcamentos: d.orcamentos.filter((x) => x.id !== id) });
  void gravar(acoes.apagarOrcamento(id));
}

/** O stock desconta-se no servidor, a partir do orçamento gravado. */
export async function marcarProduzido(id: string) {
  await descarregar();
  const r = await acoes.marcarProduzido(id);
  if (!r.ok) {
    erro = r.erro;
    avisar();
    return;
  }
  const d = ler();
  mudar({
    ...d,
    parametros: r.valor,
    orcamentos: d.orcamentos.map((x) => (x.id === id ? { ...x, produzidoEm: agora() } : x)),
  });
}

// ── Gravação diferida ─────────────────────────────────────────────────────

const ATRASO_MS = 600;
const tarefas = new Map<string, () => Promise<{ ok: boolean; erro?: string }>>();

function agendar(chave: string, tarefa: () => Promise<{ ok: boolean; erro?: string }>) {
  const t = pendentes.get(chave);
  if (t) clearTimeout(t);
  tarefas.set(chave, tarefa);
  pendentes.set(
    chave,
    setTimeout(() => {
      pendentes.delete(chave);
      tarefas.delete(chave);
      void gravar(tarefa());
    }, ATRASO_MS),
  );
}

/** Grava já tudo o que está à espera (antes de ações que dependem do servidor). */
export async function descarregar() {
  const lista = [...tarefas.entries()];
  for (const [chave] of lista) {
    const t = pendentes.get(chave);
    if (t) clearTimeout(t);
    pendentes.delete(chave);
    tarefas.delete(chave);
  }
  await Promise.all(lista.map(([, tarefa]) => gravar(tarefa())));
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (e) => {
    if (pendentes.size > 0) {
      void descarregar();
      e.preventDefault();
    }
  });
}
