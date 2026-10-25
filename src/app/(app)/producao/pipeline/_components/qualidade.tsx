"use client";

import { useState } from "react";
import { PERGUNTAS_QUALIDADE, qualidadeAprovada, respostasIniciais } from "@/lib/producao/qualidade";
import type { ControloQualidade, Orcamento, RespostaQualidade } from "@/lib/producao/types";

const BOTOES: { v: RespostaQualidade; rotulo: string; classe: string }[] = [
  { v: "ok", rotulo: "✓ Está bem", classe: "bg-verde text-white" },
  { v: "falha", rotulo: "✗ Falha", classe: "bg-alerta text-white" },
  { v: "na", rotulo: "Não se aplica", classe: "bg-linha text-tinta" },
];

/**
 * Controlo de qualidade antes de passar a pronto. Com tudo bem (ou "não se
 * aplica"), grava e passa a pronto; com alguma falha, grava e o trabalho fica
 * em produção até ser corrigido.
 */
export function FormQualidade({
  o,
  nomesArtigos,
  equipa,
  aoGravar,
  aoCancelar,
}: {
  o: Orcamento;
  nomesArtigos: string[];
  equipa: { id: string; nome: string }[];
  aoGravar: (cq: ControloQualidade, aprovado: boolean) => void;
  aoCancelar: () => void;
}) {
  const anterior = o.producao?.qualidade;
  const [respostas, setRespostas] = useState<Record<string, RespostaQualidade>>(
    anterior?.respostas ?? respostasIniciais(o, nomesArtigos),
  );
  const [porId, setPorId] = useState(anterior?.porId ?? o.producao?.responsavelId ?? "");
  const [notas, setNotas] = useState(anterior?.notas ?? "");
  const cq: ControloQualidade = { feitoEm: new Date().toISOString(), porId: porId || undefined, respostas, notas: notas.trim() || undefined };
  const aprovado = qualidadeAprovada(cq);
  const falhas = PERGUNTAS_QUALIDADE.filter((p) => respostas[p.id] === "falha");
  const faltam = PERGUNTAS_QUALIDADE.filter((p) => !respostas[p.id]).length;

  return (
    <div className="rounded-md border border-verde/40 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="titulo text-base text-verde">Controlo de qualidade antes de entregar</h3>
        <span className="text-xs text-cinza">{faltam ? `Faltam ${faltam}` : aprovado ? "Tudo verificado" : `${falhas.length} com falha`}</span>
      </div>
      <ol className="space-y-2">
        {PERGUNTAS_QUALIDADE.map((p, i) => (
          <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-linha/60 pb-2">
            <div className="min-w-56 flex-1">
              <div className="text-sm font-medium">
                {i + 1}. {p.texto}
              </div>
              <div className="text-xs text-cinza">{p.ajuda}</div>
            </div>
            <div className="flex gap-1">
              {BOTOES.filter((b) => b.v !== "na" || p.podeNaoAplicar).map((b) => (
                <button
                  key={b.v}
                  type="button"
                  className={`rounded px-2 py-1 text-xs ${respostas[p.id] === b.v ? b.classe : "bg-papel text-cinza ring-1 ring-linha hover:text-tinta"}`}
                  onClick={() => setRespostas({ ...respostas, [p.id]: b.v })}
                >
                  {b.rotulo}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-3 grid gap-3 sm:grid-cols-[14rem_1fr]">
        <label>
          <span className="rotulo">Verificado por</span>
          <select className="campo" value={porId} onChange={(e) => setPorId(e.target.value)}>
            <option value="">— escolher —</option>
            {equipa.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="rotulo">{falhas.length ? "O que falhou e o que vai ser feito" : "Notas (opcional)"}</span>
          <input
            className={`campo ${falhas.length && !notas.trim() ? "border-alerta" : ""}`}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder={falhas.length ? "ex.: 2 bonés com mancha, refazer" : ""}
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className="botao-principal" disabled={!aprovado || !porId} onClick={() => aoGravar(cq, true)}>
          Gravar e passar a pronto
        </button>
        {falhas.length > 0 && (
          <button className="botao-secundario" disabled={!porId || !notas.trim()} onClick={() => aoGravar(cq, false)}>
            Gravar as falhas (fica em produção)
          </button>
        )}
        <button className="botao-secundario" onClick={aoCancelar}>
          Cancelar
        </button>
        {!porId && <span className="text-xs text-cinza">Escolha quem verificou.</span>}
      </div>
    </div>
  );
}

/** Etiqueta do estado do controlo, para a linha do pipeline. */
export function EtiquetaQualidade({ cq }: { cq?: ControloQualidade }) {
  if (!cq) return null;
  return qualidadeAprovada(cq) ? (
    <span className="etiqueta bg-verde-claro text-verde" title="Controlo de qualidade feito">
      QC ✓
    </span>
  ) : (
    <span className="etiqueta bg-alerta/15 text-alerta" title={cq.notas ?? "Controlo de qualidade com falhas"}>
      QC: falhas
    </span>
  );
}
