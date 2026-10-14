"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Titulo } from "@/app/(app)/producao/_components/campos";
import { EstadoGravacao } from "@/app/(app)/producao/_components/estado-gravacao";
import { etapaDe, ETAPAS, ordenarFila, planear, preverNovo, type Planeado } from "@/lib/producao/agenda";
import { calcularOrcamento, NOME_TECNICA } from "@/lib/producao/engine";
import { dataPt, euros, horasMin } from "@/lib/producao/format";
import { atualizarProducao, moverEtapa, useDados } from "@/app/(app)/producao/_lib/store";
import type { EtapaProducao, Orcamento } from "@/lib/producao/types";

const ATIVAS: EtapaProducao[] = ["por_iniciar", "em_producao", "pronto"];

export default function Pipeline() {
  const dados = useDados();
  const p = dados.parametros;
  const ganhos = useMemo(() => dados.orcamentos.filter((o) => o.estado === "ganho"), [dados.orcamentos]);
  const plano = useMemo(() => planear(p, ganhos), [p, ganhos]);
  const previsto = (id: string) => plano.trabalhos.find((t) => t.o.id === id);
  const cliente = (o: Orcamento) => dados.clientes.find((c) => c.id === o.clienteId)?.nome;
  const nomeMaquina = (id: string) => p.maquinas.find((m) => m.id === id)?.nome.split(" (")[0] ?? id;

  const porEtapa = (e: EtapaProducao) => ordenarFila(ganhos.filter((o) => etapaDe(o) === e));
  const atrasados = plano.trabalhos.filter((t) => t.atrasado).length;

  // Trocar a prioridade com o vizinho de cima ou de baixo na mesma etapa
  const subir = (lista: Orcamento[], i: number, dir: -1 | 1) => {
    const a = lista[i];
    const b = lista[i + dir];
    if (!a || !b) return;
    atualizarProducao(a.id, { ordem: b.producao?.ordem ?? 0 });
    atualizarProducao(b.id, { ordem: a.producao?.ordem ?? 0 });
  };

  return (
    <>
      <Titulo
        sub="Trabalhos ganhos, do início à entrega. As datas previstas contam com a carga de cada máquina e da equipa."
        acoes={<EstadoGravacao />}
      >
        Pipeline de produção
      </Titulo>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {plano.carga.map((c) => (
          <div key={c.recurso.id} className="cartao py-4">
            <div className="text-xs text-cinza">{c.recurso.nome}</div>
            <div className="titulo mt-1 text-2xl text-verde">{horasMin(c.minutos)}</div>
            <div className="text-xs text-cinza">
              {c.recurso.minutosDia > 0
                ? c.ocupadoAte
                  ? `${c.dias.toFixed(1).replace(".", ",")} dias de trabalho · ocupado até ${dataPt(c.ocupadoAte)}`
                  : "sem trabalho na fila"
                : "sem pessoas registadas: ver Parâmetros"}
            </div>
          </div>
        ))}
        {atrasados > 0 && (
          <div className="cartao border-alerta/40 bg-alerta/5 py-4">
            <div className="text-xs text-alerta">Em risco</div>
            <div className="titulo mt-1 text-2xl text-alerta">{atrasados}</div>
            <div className="text-xs text-alerta">trabalho(s) com data prevista depois do prazo prometido</div>
          </div>
        )}
      </section>

      <SimularPrazo />

      <div className="grid gap-4 lg:grid-cols-3">
        {ATIVAS.map((etapa) => {
          const lista = porEtapa(etapa);
          return (
            <section key={etapa} className="rounded-xl bg-beige-claro/60 p-3">
              <h2 className="titulo mb-3 flex items-center justify-between px-1 text-lg text-verde">
                {ETAPAS.find((e) => e.id === etapa)!.nome}
                <span className="font-sans text-sm text-cinza">{lista.length}</span>
              </h2>
              <div className="space-y-3">
                {lista.map((o, i) => (
                  <Cartao
                    key={o.id}
                    o={o}
                    cliente={cliente(o)}
                    previsto={previsto(o.id)}
                    equipa={dados.equipa}
                    nomeMaquina={nomeMaquina}
                    podeSubir={etapa !== "pronto" && i > 0}
                    podeDescer={etapa !== "pronto" && i < lista.length - 1}
                    aoSubir={() => subir(lista, i, -1)}
                    aoDescer={() => subir(lista, i, 1)}
                  />
                ))}
                {!lista.length && <p className="px-1 py-6 text-center text-sm text-cinza">Nada aqui.</p>}
              </div>
            </section>
          );
        })}
      </div>

      <Arquivo />
    </>
  );
}

function Cartao({
  o,
  cliente,
  previsto,
  equipa,
  nomeMaquina,
  podeSubir,
  podeDescer,
  aoSubir,
  aoDescer,
}: {
  o: Orcamento;
  cliente?: string;
  previsto?: Planeado;
  equipa: { id: string; nome: string; departamento: string | null }[];
  nomeMaquina: (id: string) => string;
  podeSubir: boolean;
  podeDescer: boolean;
  aoSubir: () => void;
  aoDescer: () => void;
}) {
  const p = useDados().parametros;
  const r = previsto?.r ?? calcularOrcamento(p, o);
  const etapa = etapaDe(o)!;
  const i = ETAPAS.findIndex((e) => e.id === etapa);
  const anterior = ETAPAS[i - 1];
  const seguinte = ETAPAS[i + 1];
  const prazo = o.producao?.prazo;

  return (
    <article className={`cartao space-y-2 p-4 ${previsto?.atrasado ? "border-alerta/60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <Link href={`/producao/orcamentos/${o.id}`} className="text-sm font-semibold text-verde hover:underline">
            {o.numero}
          </Link>
          <div className="text-sm">{cliente ?? "sem cliente"}</div>
          {o.titulo && <div className="text-xs text-cinza">{o.titulo}</div>}
        </div>
        {(podeSubir || podeDescer) && (
          <div className="flex flex-col">
            <button className="px-1 text-xs text-cinza hover:text-verde disabled:opacity-20" disabled={!podeSubir} onClick={aoSubir} title="Subir prioridade">
              ▲
            </button>
            <button className="px-1 text-xs text-cinza hover:text-verde disabled:opacity-20" disabled={!podeDescer} onClick={aoDescer} title="Baixar prioridade">
              ▼
            </button>
          </div>
        )}
      </div>

      <ul className="space-y-0.5 text-xs">
        {o.linhas.map((l) => (
          <li key={l.id}>
            <b>{l.quantidade}×</b> {l.descricao || "artigo"}
            <span className="text-cinza">
              {" "}
              · {l.aplicacoes.map((a) => `${NOME_TECNICA[a.tecnica].split(" (")[0]}${a.posicao ? ` ${a.posicao.toLowerCase()}` : ""}`).join(", ")}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-x-3 text-xs text-cinza">
        {Object.entries(r.minutosMaquina).map(([id, min]) => (
          <span key={id}>
            {nomeMaquina(id)} {horasMin(min)}
          </span>
        ))}
        <span>Operador {horasMin(r.minutosOperador)}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <label>
          <span className="rotulo">Prazo prometido</span>
          <input
            type="date"
            className="campo py-1 text-xs"
            value={prazo ?? ""}
            onChange={(e) => atualizarProducao(o.id, { prazo: e.target.value || undefined })}
          />
        </label>
        <label>
          <span className="rotulo">Responsável</span>
          <select
            className="campo py-1 text-xs"
            value={o.producao?.responsavelId ?? ""}
            onChange={(e) => atualizarProducao(o.id, { responsavelId: e.target.value || undefined })}
          >
            <option value="">—</option>
            {equipa.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
        </label>
      </div>

      {previsto ? (
        <p className={`text-xs ${previsto.atrasado ? "font-medium text-alerta" : "text-verde"}`}>
          Pronto previsto: {dataPt(previsto.dataPrevista)}
          {previsto.atrasado && prazo && ` · passa o prazo de ${dataPt(prazo)}`}
        </p>
      ) : (
        etapa === "pronto" &&
        o.producao?.prontoEm && <p className="text-xs text-verde">Pronto desde {dataPt(o.producao.prontoEm)}</p>
      )}

      <textarea
        className="campo min-h-0 py-1 text-xs"
        rows={1}
        placeholder="Notas para a produção"
        value={o.producao?.notas ?? ""}
        onChange={(e) => atualizarProducao(o.id, { notas: e.target.value })}
      />

      <div className="flex justify-between gap-2 pt-1">
        {anterior ? (
          <button className="botao-secundario px-2 py-1 text-xs" onClick={() => void moverEtapa(o.id, anterior.id)}>
            ← {anterior.nome}
          </button>
        ) : (
          <span />
        )}
        {seguinte && (
          <button
            className="botao-principal px-2 py-1 text-xs"
            onClick={() => {
              if (seguinte.id === "pronto" && !o.produzidoEm && !confirm("Marcar como pronto? O consumo estimado sai do stock de consumíveis.")) return;
              void moverEtapa(o.id, seguinte.id);
            }}
          >
            {seguinte.id === "entregue" ? "Entregue ✓" : `${seguinte.nome} →`}
          </button>
        )}
      </div>
    </article>
  );
}

/** Quando ficaria pronto um orçamento enviado, se fosse ganho hoje. Serve para dar prazos ao cliente. */
function SimularPrazo() {
  const dados = useDados();
  const enviados = dados.orcamentos.filter((o) => o.estado === "enviado" || o.estado === "rascunho");
  const [id, setId] = useState("");
  const escolhido = enviados.find((o) => o.id === id);
  const ganhos = dados.orcamentos.filter((o) => o.estado === "ganho");
  const previsto = escolhido ? preverNovo(dados.parametros, ganhos, escolhido) : undefined;

  return (
    <section className="cartao mb-6 flex flex-wrap items-end gap-4">
      <label className="min-w-64 flex-1">
        <span className="rotulo">Que prazo posso dar? Escolha um orçamento ainda não ganho</span>
        <select className="campo" value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">—</option>
          {enviados.map((o) => (
            <option key={o.id} value={o.id}>
              {o.numero} · {dados.clientes.find((c) => c.id === o.clienteId)?.nome ?? "sem cliente"}
              {o.titulo ? ` · ${o.titulo}` : ""}
            </option>
          ))}
        </select>
      </label>
      {previsto && (
        <p className="pb-2 text-sm">
          Se for adjudicado hoje e entrar no fim da fila, fica pronto a <b className="text-verde">{dataPt(previsto.dataPrevista)}</b>.{" "}
          <span className="text-cinza">Convém dar ao cliente uma margem de alguns dias.</span>
        </p>
      )}
    </section>
  );
}

function Arquivo() {
  const dados = useDados();
  const [procura, setProcura] = useState("");
  const entregues = dados.orcamentos
    .filter((o) => etapaDe(o) === "entregue")
    .sort((a, b) => (b.producao?.entregueEm ?? "").localeCompare(a.producao?.entregueEm ?? ""));
  const q = procura.trim().toLowerCase();
  const visiveis = entregues.filter((o) => {
    const c = dados.clientes.find((x) => x.id === o.clienteId)?.nome;
    return !q || [o.numero, o.titulo, c].some((t) => t?.toLowerCase().includes(q));
  });

  return (
    <section className="cartao mt-8 overflow-x-auto p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <h2 className="titulo text-lg text-verde">Arquivo · entregues</h2>
        <input className="campo max-w-xs" placeholder="Procurar nº, título ou cliente" value={procura} onChange={(e) => setProcura(e.target.value)} />
      </div>
      <table className="tabela mt-3">
        <thead>
          <tr>
            <th>Nº</th>
            <th>Cliente</th>
            <th>Título</th>
            <th>Início</th>
            <th>Entregue</th>
            <th>Prazo</th>
            <th>Cumprido</th>
            <th className="num">Total s/ IVA</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {visiveis.map((o) => {
            const pr = o.producao;
            const cumprido = pr?.prazo && pr.entregueEm ? pr.entregueEm.slice(0, 10) <= pr.prazo : null;
            return (
              <tr key={o.id}>
                <td className="font-medium text-verde">
                  <Link href={`/producao/orcamentos/${o.id}`}>{o.numero}</Link>
                </td>
                <td>{dados.clientes.find((c) => c.id === o.clienteId)?.nome ?? "—"}</td>
                <td>{o.titulo || "—"}</td>
                <td>{pr?.iniciadoEm ? dataPt(pr.iniciadoEm) : "—"}</td>
                <td>{pr?.entregueEm ? dataPt(pr.entregueEm) : "—"}</td>
                <td>{pr?.prazo ? dataPt(pr.prazo) : "—"}</td>
                <td className={cumprido === false ? "text-alerta" : "text-verde"}>
                  {cumprido == null ? "—" : cumprido ? "sim" : "atrasado"}
                </td>
                <td className="num">{euros(o.congelado?.total ?? calcularOrcamento(dados.parametros, o).total)}</td>
                <td>
                  <button className="text-xs text-cinza hover:text-verde" onClick={() => void moverEtapa(o.id, "pronto")}>
                    reabrir
                  </button>
                </td>
              </tr>
            );
          })}
          {!visiveis.length && (
            <tr>
              <td colSpan={9} className="py-8 text-center text-cinza">
                {entregues.length ? "Nada com esta procura." : "Ainda não há trabalhos entregues."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
