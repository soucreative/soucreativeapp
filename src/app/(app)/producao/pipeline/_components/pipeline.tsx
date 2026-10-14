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

      {/* Carga na fila: uma faixa, para as tabelas ficarem à vista */}
      <section className="cartao mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 py-3 text-sm">
        <span className="text-xs font-medium text-cinza">Carga na fila</span>
        {plano.carga.map((c) => (
          <span
            key={c.recurso.id}
            title={
              c.recurso.minutosDia > 0
                ? `${c.dias.toFixed(1).replace(".", ",")} dias de trabalho`
                : "Sem pessoas registadas: ver Parâmetros"
            }
          >
            {c.recurso.nome} <b className="text-verde">{horasMin(c.minutos)}</b>
            <span className="text-xs text-cinza">
              {c.recurso.minutosDia <= 0 ? " · sem pessoas" : c.ocupadoAte ? ` · até ${dataPt(c.ocupadoAte)}` : ""}
            </span>
          </span>
        ))}
        {atrasados > 0 && (
          <span className="ml-auto rounded-full bg-alerta/10 px-3 py-0.5 text-xs font-medium text-alerta">
            {atrasados} {atrasados === 1 ? "trabalho passa" : "trabalhos passam"} o prazo prometido
          </span>
        )}
      </section>

      <SimularPrazo />

      <div className="space-y-6">
        {ATIVAS.map((etapa) => {
          const lista = porEtapa(etapa);
          return (
            <section key={etapa} className="cartao overflow-x-auto p-0">
              <h2 className="titulo flex items-center gap-2 px-5 pt-4 text-lg text-verde">
                {ETAPAS.find((e) => e.id === etapa)!.nome}
                <span className="font-sans text-sm text-cinza">{lista.length}</span>
              </h2>
              {lista.length ? (
                <table className="tabela mt-2">
                  <thead>
                    <tr>
                      <th />
                      <th>Nº</th>
                      <th>Cliente</th>
                      <th>Peças e técnicas</th>
                      <th className="num">Máquina</th>
                      <th>Prazo prometido</th>
                      <th>{etapa === "pronto" ? "Pronto em" : "Previsto"}</th>
                      <th>Responsável</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((o, i) => (
                      <Linha
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
                  </tbody>
                </table>
              ) : (
                <p className="px-5 pb-4 pt-1 text-sm text-cinza">Nada nesta etapa.</p>
              )}
            </section>
          );
        })}
      </div>

      <Arquivo />
    </>
  );
}

function Linha({
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
  const [aberta, setAberta] = useState(false);
  const r = previsto?.r ?? calcularOrcamento(p, o);
  const etapa = etapaDe(o)!;
  const i = ETAPAS.findIndex((e) => e.id === etapa);
  const anterior = ETAPAS[i - 1];
  const seguinte = ETAPAS[i + 1];
  const prazo = o.producao?.prazo;
  const pecas = o.linhas.reduce((s, l) => s + l.quantidade, 0);
  const tecnicas = [...new Set(o.linhas.flatMap((l) => l.aplicacoes.map((a) => NOME_TECNICA[a.tecnica].split(" (")[0])))];
  const minutosMaquina = Object.values(r.minutosMaquina).reduce((s, m) => s + m, 0);
  // Os controlos dentro da linha não a abrem nem fecham
  const parar = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <>
      <tr
        className={`cursor-pointer hover:bg-papel ${previsto?.atrasado ? "bg-alerta/5" : ""} ${aberta ? "bg-papel" : ""}`}
        onClick={() => setAberta(!aberta)}
      >
        <td className="w-8 text-center" onClick={parar}>
          {(podeSubir || podeDescer) && (
            <div className="flex flex-col leading-none">
              <button
                className="text-[10px] text-cinza hover:text-verde disabled:opacity-20"
                disabled={!podeSubir}
                onClick={aoSubir}
                title="Subir prioridade"
              >
                ▲
              </button>
              <button
                className="text-[10px] text-cinza hover:text-verde disabled:opacity-20"
                disabled={!podeDescer}
                onClick={aoDescer}
                title="Baixar prioridade"
              >
                ▼
              </button>
            </div>
          )}
        </td>
        <td className="whitespace-nowrap">
          <span className={`mr-1 inline-block text-[10px] text-cinza transition-transform ${aberta ? "rotate-90" : ""}`}>▶</span>
          <span className="font-semibold text-verde">{o.numero}</span>
        </td>
        <td>
          <div className="font-medium">{cliente ?? "sem cliente"}</div>
          {o.titulo && <div className="text-xs text-cinza">{o.titulo}</div>}
        </td>
        <td className="text-xs">
          <b>{pecas}</b> peças · <span className="text-cinza">{tecnicas.join(", ") || "—"}</span>
        </td>
        <td className="num whitespace-nowrap text-xs">{horasMin(minutosMaquina)}</td>
        <td onClick={parar}>
          <input
            type="date"
            className="campo w-36 py-0.5 text-xs"
            value={prazo ?? ""}
            onChange={(e) => atualizarProducao(o.id, { prazo: e.target.value || undefined })}
          />
        </td>
        <td className={`whitespace-nowrap text-xs ${previsto?.atrasado ? "font-semibold text-alerta" : "text-verde"}`}>
          {previsto
            ? dataPt(previsto.dataPrevista)
            : etapa === "pronto" && o.producao?.prontoEm
              ? dataPt(o.producao.prontoEm)
              : "—"}
        </td>
        <td onClick={parar}>
          <select
            className="campo w-36 py-0.5 text-xs"
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
        </td>
        <td className="whitespace-nowrap text-right" onClick={parar}>
          {anterior && (
            <button
              className="mr-1 px-1.5 text-xs text-cinza hover:text-verde"
              title={`Voltar a ${anterior.nome}`}
              onClick={() => void moverEtapa(o.id, anterior.id)}
            >
              ←
            </button>
          )}
          {seguinte && (
            <button
              className="botao-principal px-2 py-0.5 text-xs"
              onClick={() => {
                if (seguinte.id === "pronto" && !o.produzidoEm && !confirm("Marcar como pronto? O consumo estimado sai do stock de consumíveis.")) return;
                void moverEtapa(o.id, seguinte.id);
              }}
            >
              {seguinte.id === "entregue" ? "Entregue ✓" : seguinte.id === "em_producao" ? "Iniciar →" : "Pronto →"}
            </button>
          )}
        </td>
      </tr>
      {aberta && (
        <tr className="bg-papel">
          <td />
          <td colSpan={8} className="pb-4">
            <div className="grid gap-4 md:grid-cols-[2fr_1fr_1fr]">
              <div>
                <div className="rotulo">Artigos</div>
                <ul className="space-y-0.5 text-sm">
                  {o.linhas.map((l) => (
                    <li key={l.id}>
                      <b>{l.quantidade}×</b> {l.descricao || "artigo"}
                      <ul className="ml-4 text-xs text-cinza">
                        {l.aplicacoes.map((a) => (
                          <li key={a.id}>
                            {NOME_TECNICA[a.tecnica]}
                            {a.posicao ? ` · ${a.posicao}` : ""}
                            {a.larguraCm && a.alturaCm ? ` · ${a.larguraCm}×${a.alturaCm} cm` : ""}
                            {a.tecnica === "bordado" && a.pontos ? ` · ${a.pontos.toLocaleString("pt-PT")} pontos` : ""}
                            {a.tecnica === "bordado" && a.cores ? ` · ${a.cores} cores` : ""}
                            {a.pecaEscura ? " · peça escura" : ""}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="rotulo">Tempos</div>
                <dl className="space-y-0.5 text-xs">
                  {Object.entries(r.minutosMaquina).map(([id, min]) => (
                    <div key={id} className="flex justify-between gap-2">
                      <dt className="text-cinza">{nomeMaquina(id)}</dt>
                      <dd>{horasMin(min)}</dd>
                    </div>
                  ))}
                  <div className="flex justify-between gap-2">
                    <dt className="text-cinza">Operador</dt>
                    <dd>{horasMin(r.minutosOperador)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-cinza">Design</dt>
                    <dd>{horasMin(r.minutosDesigner)}</dd>
                  </div>
                </dl>
                {previsto?.atrasado && prazo && (
                  <p className="mt-2 text-xs text-alerta">
                    Previsto para {dataPt(previsto.dataPrevista)}, depois do prazo de {dataPt(prazo)}.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <label className="block">
                  <span className="rotulo">Notas para a produção</span>
                  <textarea
                    className="campo min-h-16 text-xs"
                    value={o.producao?.notas ?? ""}
                    onChange={(e) => atualizarProducao(o.id, { notas: e.target.value })}
                  />
                </label>
                <Link href={`/producao/orcamentos/${o.id}`} className="botao-secundario w-full text-xs">
                  Abrir o orçamento
                </Link>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
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
