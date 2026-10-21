"use client";

import { useEffect } from "react";

import { CampoNumero, Interruptor, Rotulado } from "@/app/(app)/producao/_components/campos";
import { NOME_SETUP, NOME_TECNICA, TAMANHOS_A, type ResultadoAplicacao } from "@/lib/producao/engine";
import { dataPt, euros, horasMin, numero } from "@/lib/producao/format";
import { novoId } from "@/app/(app)/producao/_lib/store";
import type { Repeticao } from "@/lib/producao/historico";
import type { Aplicacao, Tecnica } from "@/lib/producao/types";

export const TECNICAS: Tecnica[] = ["bordado", "dtg", "dtf", "sublimacao", "cricut"];

export function novaAplicacao(tecnica: Tecnica): Aplicacao {
  const base = { id: novoId(), tecnica, jaProduzido: false, arteCliente: false, suporteConfigurado: false };
  switch (tecnica) {
    case "bordado":
      return { ...base, posicao: "Peito esquerdo", larguraCm: 5, alturaCm: 5, cores: 3, complexidade: "medio" };
    case "dtg":
      return { ...base, posicao: "Frente", larguraCm: 21, alturaCm: 29.7, coberturaPct: 60, pecaEscura: false };
    case "dtf":
      return { ...base, posicao: "Frente", larguraCm: 10, alturaCm: 10, coberturaPct: 80 };
    case "sublimacao":
      return { ...base, posicao: "Volta completa", larguraCm: 20, alturaCm: 9, coberturaPct: 80, suporte: "caneca" };
    case "cricut":
      return { ...base, posicao: "Frente", larguraCm: 10, alturaCm: 10, complexidadeCorte: "simples" };
  }
}

export function AplicacaoEditor({
  a,
  r,
  repeticao,
  aoMudar,
  aoRemover,
}: {
  a: Aplicacao;
  r?: ResultadoAplicacao;
  /** Trabalho igual encontrado no histórico ganho deste cliente */
  repeticao?: Repeticao | null;
  aoMudar: (fn: (a: Aplicacao) => Aplicacao) => void;
  aoRemover: () => void;
}) {
  const set = (p: Partial<Aplicacao>) => aoMudar((cur) => ({ ...cur, ...p }));

  // Enquanto ninguém responder à mão, a resposta vem do histórico. Mexer nela
  // aqui e não ao gravar faz com que o preço no ecrã seja já o preço certo.
  const automatico = a.repeticaoManual == null;
  const detetada = !!repeticao;
  useEffect(() => {
    if (!automatico || a.jaProduzido === detetada) return;
    set({ jaProduzido: detetada });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automatico, detetada, a.jaProduzido]);

  return (
    <div className="rounded-lg border border-linha bg-papel/60 p-3">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Rotulado rotulo="Técnica">
          <select
            className="campo"
            value={a.tecnica}
            onChange={(e) => {
              const t = e.target.value as Tecnica;
              const nova = novaAplicacao(t);
              aoMudar((cur) => ({
                ...nova,
                id: cur.id,
                jaProduzido: cur.jaProduzido,
                arteCliente: cur.arteCliente,
                suporteConfigurado: cur.suporteConfigurado,
              }));
            }}
          >
            {TECNICAS.map((t) => (
              <option key={t} value={t}>
                {NOME_TECNICA[t]}
              </option>
            ))}
            <option disabled>Impressão 3D (Bambu) — em breve</option>
            <option disabled>Laser — em breve</option>
          </select>
        </Rotulado>
        <Rotulado rotulo="Posição">
          <input className="campo w-40" value={a.posicao} onChange={(e) => set({ posicao: e.target.value })} />
        </Rotulado>
        <button className="botao-perigo ml-auto" onClick={aoRemover} type="button">
          Remover técnica
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <Rotulado rotulo="Largura">
          <CampoNumero valor={a.larguraCm} aoMudar={(n) => set({ larguraCm: n })} sufixo="cm" min={0} />
        </Rotulado>
        <Rotulado rotulo="Altura">
          <CampoNumero valor={a.alturaCm} aoMudar={(n) => set({ alturaCm: n })} sufixo="cm" min={0} />
        </Rotulado>

        {a.tecnica === "bordado" ? (
          <>
            <Rotulado rotulo="Pontos (do ficheiro)">
              <CampoNumero valor={a.pontos} aoMudar={(n) => set({ pontos: n })} min={0} vazio placeholder="estimar" />
            </Rotulado>
            <Rotulado rotulo="Nº de cores">
              <CampoNumero valor={a.cores} aoMudar={(n) => set({ cores: n })} min={1} />
            </Rotulado>
            <Rotulado rotulo="Digitalização">
              <select
                className="campo"
                value={a.complexidade ?? "medio"}
                onChange={(e) => set({ complexidade: e.target.value as Aplicacao["complexidade"] })}
              >
                <option value="simples">Simples</option>
                <option value="medio">Médio</option>
                <option value="complexo">Complexo</option>
              </select>
            </Rotulado>
            <Rotulado rotulo="Máquinas">
              <select
                className="campo"
                value={a.maquinasParalelo ?? 0}
                onChange={(e) => set({ maquinasParalelo: Number(e.target.value) || undefined })}
              >
                <option value={0}>Automático</option>
                <option value={1}>1 máquina</option>
                <option value={2}>2 em paralelo</option>
              </select>
            </Rotulado>
          </>
        ) : (
          <Rotulado rotulo="Cobertura de tinta">
            <CampoNumero valor={a.coberturaPct} aoMudar={(n) => set({ coberturaPct: n })} sufixo="%" min={0} />
          </Rotulado>
        )}

        {a.tecnica === "dtg" && (
          <div className="flex items-end pb-2">
            <Interruptor ligado={!!a.pecaEscura} aoMudar={(v) => set({ pecaEscura: v })} rotulo="Peça escura (branco + pré-tratamento)" />
          </div>
        )}
        {/* A cobertura em percentagem é um palpite; o software da Brother dá os
            mililitros deste desenho. Em branco mantém-se a estimativa por área. */}
        {(a.tecnica === "dtg" || a.tecnica === "dtf") && (
          <>
            <Rotulado
              rotulo="Tinta de cor medida"
              dica="Mililitros de ciano, magenta, amarelo e preto que o software da Brother dá para este desenho. Preenchido, substitui a estimativa por área e cobertura."
            >
              <CampoNumero valor={a.tintaCorMl} aoMudar={(n) => set({ tintaCorMl: n })} sufixo="ml" min={0} vazio />
            </Rotulado>
            {(a.tecnica === "dtf" || a.pecaEscura) && (
              <Rotulado
                rotulo="Tinta branca medida"
                dica="Mililitros de branco para este desenho, também do software da Brother."
              >
                <CampoNumero valor={a.tintaBrancoMl} aoMudar={(n) => set({ tintaBrancoMl: n })} sufixo="ml" min={0} vazio />
              </Rotulado>
            )}
          </>
        )}
        {a.tecnica === "sublimacao" && (
          <Rotulado rotulo="Suporte">
            <select className="campo" value={a.suporte ?? "texteis"} onChange={(e) => set({ suporte: e.target.value as Aplicacao["suporte"] })}>
              <option value="texteis">Têxtil (poliéster)</option>
              <option value="caneca">Caneca</option>
              <option value="rigido">Rígido</option>
            </select>
          </Rotulado>
        )}
        {a.tecnica === "cricut" && (
          <Rotulado rotulo="Descasque">
            <select
              className="campo"
              value={a.complexidadeCorte ?? "simples"}
              onChange={(e) => set({ complexidadeCorte: e.target.value as Aplicacao["complexidadeCorte"] })}
            >
              <option value="simples">Simples</option>
              <option value="medio">Médio</option>
              <option value="complexo">Complexo</option>
            </select>
          </Rotulado>
        )}
      </div>

      {a.tecnica !== "bordado" && (
        <div className="mt-2 flex flex-wrap gap-1">
          {TAMANHOS_A.slice(0, 6).map((t) => (
            <button
              key={t.nome}
              type="button"
              className="rounded border border-linha bg-white px-2 py-0.5 text-xs hover:border-verde"
              onClick={() => set({ larguraCm: t.l, alturaCm: t.a })}
            >
              {t.nome}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3">
        <Interruptor
          ligado={!!a.nomesIndividuais}
          aoMudar={(v) => set({ nomesIndividuais: v || undefined })}
          rotulo="Nomes individuais (cada peça com um texto diferente)"
        />
      </div>

      <div className="mt-3 grid gap-2 border-t border-linha pt-3 sm:grid-cols-3">
        <div>
          <Interruptor
            ligado={a.jaProduzido}
            aoMudar={(v) => set({ jaProduzido: v, repeticaoManual: v })}
            rotulo="1. Já produzimos este grafismo nesta peça?"
          />
          {/* Dizer de onde veio a conclusão: a comparação é por medidas e
              posição, não pela arte em si, e quem orçamenta tem de poder
              discordar com conhecimento de causa */}
          {repeticao ? (
            <p className="mt-1 text-xs text-verde">
              Encontrado no orçamento {repeticao.numero} ({dataPt(repeticao.data)}), ganho
              {automatico ? "" : " — mas a resposta está à mão"}
            </p>
          ) : automatico ? (
            <p className="mt-1 text-xs text-cinza">
              Sem igual no histórico ganho deste cliente.
            </p>
          ) : (
            <p className="mt-1 text-xs text-mostarda">Resposta à mão.</p>
          )}
          {!automatico && (
            <button
              type="button"
              className="mt-0.5 text-xs text-cinza underline hover:text-verde"
              onClick={() => set({ repeticaoManual: undefined })}
            >
              voltar ao automático
            </button>
          )}
        </div>
        <Interruptor ligado={a.arteCliente} aoMudar={(v) => set({ arteCliente: v })} rotulo="2. A arte vem pronta do cliente?" />
        <Interruptor
          ligado={a.suporteConfigurado}
          aoMudar={(v) => set({ suporteConfigurado: v })}
          rotulo="3. Suporte já configurado ou arte já preparada?"
        />
      </div>

      {r && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 rounded-md bg-white px-3 py-2 text-xs text-cinza">
          <span>
            Preço/peça <b className="text-tinta">{euros(r.vendaPeca)}</b>
            {r.aplicouMinimo && <span className="text-mostarda"> (mínimo por peça)</span>}
          </span>
          <span>
            Setup <b className="text-tinta">{euros(r.vendaSetup)}</b> · {NOME_SETUP[r.tipoSetup]}
          </span>
          {a.tecnica === "bordado" && (
            <span>
              {numero(r.peca.pontos)} pontos · {r.maquinasIds.length === 1 ? "1 máquina" : `${r.maquinasIds.length} máquinas em paralelo`}
            </span>
          )}
          <span>Máquina {horasMin(r.peca.maquinaMin)}/peça</span>
          <span>Operador {horasMin(r.peca.operadorMin)}/peça</span>
          <span>
            Custo/peça {euros(r.custoConsumiveis + r.custoMaquina + r.custoOperador)} (consumível {euros(r.custoConsumiveis)})
          </span>
        </div>
      )}
    </div>
  );
}
