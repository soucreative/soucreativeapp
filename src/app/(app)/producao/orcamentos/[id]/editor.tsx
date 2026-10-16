"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AplicacaoEditor, novaAplicacao } from "@/app/(app)/producao/_components/aplicacao-editor";
import { EstadoGravacao } from "@/app/(app)/producao/_components/estado-gravacao";
import { SeletorArtigo } from "@/app/(app)/producao/_components/seletor-artigo";
import { ImagemArtigo } from "@/app/(app)/producao/_components/imagem-artigo";
import { Avisos, CampoNumero, EtiquetaEstimativa, Interruptor, Rotulado } from "@/app/(app)/producao/_components/campos";
import { calcularOrcamento, type ResultadoLinha } from "@/lib/producao/engine";
import { ESTADOS, MOTIVOS_PERDA } from "@/lib/producao/estados";
import { dataPt, euros, horasMin, numero, percent } from "@/lib/producao/format";
import { etapaDe, ETAPAS } from "@/lib/producao/agenda";
import {
  apagarOrcamento,
  duplicarOrcamento,
  guardarCliente,
  atualizarOrcamento,
  novoId,
  useCarregado,
  useDados,
} from "@/app/(app)/producao/_lib/store";
import type { Aplicacao, Artigo, EstadoOrcamento, LinhaOrcamento, Orcamento, TipoCliente } from "@/lib/producao/types";

export default function EditorOrcamento() {
  const { id } = useParams<{ id: string }>();
  const dados = useDados();
  const carregado = useCarregado();
  const o = dados.orcamentos.find((x) => x.id === id);

  if (!carregado) return null;
  if (!o) {
    return (
      <p className="text-cinza">
        Orçamento não encontrado. <Link className="text-verde underline" href="/producao/orcamentos">Voltar à lista</Link>
      </p>
    );
  }
  return <Editor o={o} />;
}

function Editor({ o }: { o: Orcamento }) {
  const dados = useDados();
  const router = useRouter();
  const p = dados.parametros;
  const r = useMemo(() => calcularOrcamento(p, o), [p, o]);
  const editavel = o.estado === "rascunho";
  const set = (patch: Partial<Orcamento>) => atualizarOrcamento(o.id, (cur) => ({ ...cur, ...patch }));
  const mudarLinhas = (fn: (ls: LinhaOrcamento[]) => LinhaOrcamento[]) =>
    atualizarOrcamento(o.id, (cur) => ({ ...cur, linhas: fn(cur.linhas) }));
  const cliente = dados.clientes.find((c) => c.id === o.clienteId);

  const mudarEstado = (estado: EstadoOrcamento, extra: Partial<Orcamento> = {}) => {
    let congelado =
      estado === "rascunho"
        ? undefined
        : (o.congelado ?? {
            total: r.total,
            totalComIva: r.totalComIva,
            margem: r.margem,
            em: new Date().toISOString(),
            linhas: Object.fromEntries(r.linhas.map((l) => [l.linha.id, l.total])),
          });
    // Com opções, o total fixado passa a ser o da opção que o cliente escolheu
    if (estado === "ganho" && extra.opcaoEscolhida && congelado) {
      const r2 = calcularOrcamento(p, { ...o, ...extra, estado: "ganho", congelado });
      congelado = { ...congelado, total: r2.total, totalComIva: r2.totalComIva, margem: r2.margem };
    }
    // Ao ganhar, o trabalho entra no pipeline por iniciar, no fim da fila
    const producao = estado === "ganho" && !o.producao ? { etapa: "por_iniciar" as const, ordem: Date.now() } : o.producao;
    set({ estado, congelado, producao, ...extra });
  };

  const mudarLinha = (id: string, fn: (l: LinhaOrcamento) => LinhaOrcamento) =>
    mudarLinhas((ls) => ls.map((x) => (x.id === id ? fn(x) : x)));

  const adicionarLinha = () => {
    const l: LinhaOrcamento = {
      id: novoId(),
      descricao: "",
      custoArtigo: 0,
      minimoArtigo: 1,
      portes: 0,
      fornecedor: "",
      quantidade: 10,
      artigoDoCliente: false,
      aplicacoes: [novaAplicacao("dtf")],
    };
    mudarLinhas((ls) => [...ls, l]);
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/producao/orcamentos" className="text-xs text-cinza hover:text-verde">
            ← Orçamentos
          </Link>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-verde">{o.numero}</h1>
          <div className="mt-1 flex items-center gap-2">
            <span className={`etiqueta ${ESTADOS[o.estado].classe}`}>{ESTADOS[o.estado].nome}</span>
            {o.produzidoEm && <span className="etiqueta bg-verde-claro text-verde">produzido</span>}
            {o.motivoPerda && <span className="text-xs text-cinza">Motivo: {o.motivoPerda}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {editavel && <EstadoGravacao forcar={() => atualizarOrcamento(o.id, (x) => x)} />}
          <Link className="botao-secundario" href={`/producao/orcamentos/${o.id}/documento`}>
            Documento / PDF
          </Link>
          <button
            className="botao-secundario"
            onClick={async () => {
              const n = await duplicarOrcamento(o.id);
              if (n) router.push(`/producao/orcamentos/${n.id}`);
            }}
          >
            Duplicar
          </button>
          <button
            className="botao-perigo"
            onClick={() => {
              if (confirm(`Apagar o orçamento ${o.numero}? Não há forma de o recuperar.`)) {
                apagarOrcamento(o.id);
                router.push("/producao/orcamentos");
              }
            }}
          >
            Apagar
          </button>
        </div>
      </div>

      <BarraEstado o={o} r={r} mudarEstado={mudarEstado} />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <fieldset disabled={!editavel} className="min-w-0 space-y-6">
          <section className="cartao">
            <h2 className="titulo mb-4 text-lg text-verde">Cliente e pedido</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Rotulado rotulo="Cliente">
                <SeletorCliente
                  valor={o.clienteId}
                  aoMudar={(clienteId, tipo) => set({ clienteId, ...(tipo ? { tipoCliente: tipo } : {}) })}
                />
              </Rotulado>
              <Rotulado rotulo="Tipo de cliente (define a margem)">
                <select
                  className="campo"
                  value={o.tipoCliente}
                  onChange={(e) => set({ tipoCliente: e.target.value as TipoCliente })}
                >
                  {p.tiposCliente.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </select>
              </Rotulado>
              <Rotulado rotulo="Título">
                <input className="campo" value={o.titulo} onChange={(e) => set({ titulo: e.target.value })} placeholder="ex.: T-shirts evento junho" />
              </Rotulado>
              <Rotulado rotulo="Data">
                <input type="date" className="campo" value={o.data} onChange={(e) => set({ data: e.target.value })} />
              </Rotulado>
            </div>
            {cliente && cliente.tipo !== o.tipoCliente && (
              <p className="mt-2 text-xs text-mostarda">
                A ficha do cliente diz {p.tiposCliente.find((t) => t.id === cliente.tipo)?.nome}; este orçamento usa outro tipo.
              </p>
            )}
          </section>

          {o.linhas.map((l, i) => (
            <EditorLinha
              key={l.id}
              indice={i}
              linha={l}
              r={r.linhas[i]}
              artigos={dados.artigos}
              aoMudar={(fn) => mudarLinha(l.id, fn)}
              aoRemover={() => mudarLinhas((ls) => ls.filter((x) => x.id !== l.id))}
            />
          ))}

          {editavel && (
            <button className="botao-secundario w-full border-dashed py-3" onClick={adicionarLinha}>
              + Adicionar artigo
            </button>
          )}

          <section className="cartao">
            <h2 className="titulo mb-4 text-lg text-verde">Criação, desconto e notas</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <Rotulado rotulo="Horas de criação (arte feita pela SOU)" ajuda={`${euros(r.vendaCriacao)} ao preço/hora da designer`}>
                <CampoNumero valor={o.horasCriacao} aoMudar={(n) => set({ horasCriacao: n ?? 0 })} sufixo="h" min={0} />
              </Rotulado>
              <Rotulado rotulo="Desconto por potencial do cliente">
                <CampoNumero
                  valor={o.descontoPotencialPct}
                  aoMudar={(n) => set({ descontoPotencialPct: n ?? 0 })}
                  percentagem
                  min={0}
                />
              </Rotulado>
              <Rotulado rotulo="Motivo do desconto" ajuda="Obrigatório quando há desconto: serve para ver depois se compensou.">
                <input className="campo" value={o.descontoMotivo ?? ""} onChange={(e) => set({ descontoMotivo: e.target.value })} />
              </Rotulado>
            </div>
            <Rotulado rotulo="Notas (saem no documento)">
              <textarea className="campo mt-1 min-h-20" value={o.notas ?? ""} onChange={(e) => set({ notas: e.target.value })} />
            </Rotulado>
          </section>
        </fieldset>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Resumo o={o} r={r} />
        </aside>
      </div>
    </div>
  );
}

function BarraEstado({
  o,
  r,
  mudarEstado,
}: {
  o: Orcamento;
  r: ReturnType<typeof calcularOrcamento>;
  mudarEstado: (e: EstadoOrcamento, extra?: Partial<Orcamento>) => void;
}) {
  const [aGanhar, setAGanhar] = useState(false);
  const [escolha, setEscolha] = useState<Record<string, string>>(o.opcaoEscolhida ?? {});
  const faltaEscolher = r.grupos.some((g) => !escolha[g.grupo]);
  const [aPerder, setAPerder] = useState(false);
  const [motivo, setMotivo] = useState(MOTIVOS_PERDA[0]);

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 rounded-lg bg-beige-claro px-4 py-3 text-sm">
      {o.estado === "rascunho" && (
        <>
          <span className="mr-2 text-cinza">Pronto?</span>
          <button className="botao-principal" onClick={() => mudarEstado("enviado")}>
            Marcar como enviado
          </button>
          <span className="text-xs text-cinza">O preço fica fixo a partir daqui.</span>
        </>
      )}
      {o.estado === "enviado" && aGanhar && (
        <>
          <span className="text-cinza">Que opção escolheu o cliente?</span>
          {r.grupos.map((g) => (
            <select
              key={g.grupo}
              className="campo w-auto"
              value={escolha[g.grupo] ?? ""}
              onChange={(e) => setEscolha({ ...escolha, [g.grupo]: e.target.value })}
            >
              <option value="">{g.grupo}: escolher…</option>
              {g.opcoes.map((x) => (
                <option key={x.linhaId} value={x.linhaId}>
                  {x.descricao || "opção"} · {euros(x.total)}
                </option>
              ))}
            </select>
          ))}
          <button
            className="botao-principal"
            disabled={faltaEscolher}
            onClick={() => {
              mudarEstado("ganho", { opcaoEscolhida: escolha });
              setAGanhar(false);
            }}
          >
            Confirmar ganho
          </button>
          <button className="botao-secundario" onClick={() => setAGanhar(false)}>
            Cancelar
          </button>
        </>
      )}
      {o.estado === "enviado" && !aPerder && !aGanhar && (
        <>
          <span className="mr-2 text-cinza">Resposta do cliente:</span>
          <button className="botao-principal" onClick={() => (r.grupos.length ? setAGanhar(true) : mudarEstado("ganho"))}>
            Ganho
          </button>
          <button className="botao-secundario" onClick={() => setAPerder(true)}>
            Perdido
          </button>
          <button className="botao-secundario ml-auto" onClick={() => mudarEstado("rascunho")}>
            Reabrir para editar
          </button>
        </>
      )}
      {aPerder && (
        <>
          <span className="text-cinza">Porque perdemos?</span>
          <select className="campo w-auto" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            {MOTIVOS_PERDA.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <button
            className="botao-principal"
            onClick={() => {
              mudarEstado("perdido", { motivoPerda: motivo });
              setAPerder(false);
            }}
          >
            Confirmar
          </button>
          <button className="botao-secundario" onClick={() => setAPerder(false)}>
            Cancelar
          </button>
        </>
      )}
      {o.estado === "ganho" && (
        <>
          <span className="mr-2 text-cinza">
            Produção: <b className="text-tinta">{ETAPAS.find((e) => e.id === etapaDe(o))?.nome}</b>
            {o.producao?.prazo && <> · prazo {dataPt(o.producao.prazo)}</>}
          </span>
          <Link className="botao-principal" href="/producao/pipeline">
            Ver no pipeline
          </Link>
        </>
      )}
      {o.estado === "perdido" && (
        <button className="botao-secundario" onClick={() => mudarEstado("enviado", { motivoPerda: undefined })}>
          Voltar a enviado
        </button>
      )}
      {o.estado !== "rascunho" && o.congelado && (
        <span className="ml-auto text-xs text-cinza">Preço fixado: {euros(o.congelado.total)} s/ IVA</span>
      )}
    </div>
  );
}

function SeletorCliente({
  valor,
  aoMudar,
}: {
  valor?: string;
  aoMudar: (id: string | undefined, tipo?: TipoCliente) => void;
}) {
  const dados = useDados();
  const [novo, setNovo] = useState(false);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TipoCliente>("empresa");

  if (novo) {
    return (
      <div className="space-y-1">
        <input className="campo" autoFocus placeholder="Nome do cliente" value={nome} onChange={(e) => setNome(e.target.value)} />
        <div className="flex gap-1">
          <select className="campo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoCliente)}>
            {dados.parametros.tiposCliente.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="botao-principal"
            disabled={!nome.trim()}
            onClick={() => {
              const id = novoId();
              guardarCliente({ id, nome: nome.trim(), tipo, criadoEm: new Date().toISOString() });
              aoMudar(id, tipo);
              setNovo(false);
              setNome("");
            }}
          >
            OK
          </button>
        </div>
      </div>
    );
  }

  return (
    <select
      className="campo"
      value={valor ?? ""}
      onChange={(e) => {
        if (e.target.value === "__novo") return setNovo(true);
        const c = dados.clientes.find((x) => x.id === e.target.value);
        aoMudar(c?.id, c?.tipo);
      }}
    >
      <option value="">— escolher —</option>
      {[...dados.clientes]
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt"))
        .map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      <option value="__novo">+ Novo cliente…</option>
    </select>
  );
}

function EditorLinha({
  indice,
  linha: l,
  r,
  artigos,
  aoMudar,
  aoRemover,
}: {
  indice: number;
  linha: LinhaOrcamento;
  r?: ResultadoLinha & { incluida: boolean };
  artigos: Artigo[];
  aoMudar: (fn: (l: LinhaOrcamento) => LinhaOrcamento) => void;
  aoRemover: () => void;
}) {
  const set = (p: Partial<LinhaOrcamento>) => aoMudar((cur) => ({ ...cur, ...p }));
  const mudarAplicacoes = (fn: (as: Aplicacao[]) => Aplicacao[]) => aoMudar((cur) => ({ ...cur, aplicacoes: fn(cur.aplicacoes) }));

  const escolherArtigo = (id: string) => {
    const a = artigos.find((x) => x.id === id);
    if (!a) return set({ artigoId: undefined });
    set({
      artigoId: a.id,
      descricao: a.nome,
      custoArtigo: a.custo,
      minimoArtigo: a.minimo,
      portes: a.portes,
      fornecedor: a.fornecedor,
    });
  };

  return (
    <section className="cartao">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="titulo text-lg text-verde">Artigo {indice + 1}</h2>
          <Interruptor
            ligado={!!l.grupoOpcao}
            aoMudar={(v) => set({ grupoOpcao: v ? "Opção" : undefined })}
            rotulo="É uma opção (o cliente escolhe uma)"
          />
          {l.grupoOpcao && (
            <input
              className="campo w-40 py-1 text-xs"
              value={l.grupoOpcao}
              onChange={(e) => set({ grupoOpcao: e.target.value || "Opção" })}
              title="Artigos com o mesmo nome de grupo são alternativas entre si"
            />
          )}
          {l.grupoOpcao && r && !r.incluida && <span className="etiqueta bg-beige-claro text-mostarda">não conta no total</span>}
        </div>
        <button className="botao-perigo" onClick={aoRemover}>
          Remover artigo
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-3">
          <Rotulado rotulo="Artigo do catálogo">
            <div className="flex items-center gap-2">
            {l.artigoId && <ImagemArtigo artigo={artigos.find((a) => a.id === l.artigoId)} tamanho={36} editavel />}
            <div className="flex-1">
            <SeletorArtigo
              artigos={artigos}
              escolhido={artigos.find((a) => a.id === l.artigoId)}
              aoEscolher={(id) => escolherArtigo(id ?? "")}
            />
            </div>
            </div>
          </Rotulado>
        </div>
        <div className="lg:col-span-3">
          <Rotulado rotulo="Descrição">
            <input className="campo" value={l.descricao} onChange={(e) => set({ descricao: e.target.value })} />
          </Rotulado>
        </div>
        <Rotulado rotulo="Quantidade">
          <CampoNumero valor={l.quantidade} aoMudar={(n) => set({ quantidade: Math.round(n ?? 0) })} min={0} />
        </Rotulado>
        <Rotulado rotulo="Custo da peça">
          <CampoNumero valor={l.custoArtigo} aoMudar={(n) => set({ custoArtigo: n ?? 0 })} sufixo="€" min={0} />
        </Rotulado>
        <Rotulado rotulo="Mínimo fornecedor">
          <CampoNumero valor={l.minimoArtigo} aoMudar={(n) => set({ minimoArtigo: n ?? 1 })} min={1} />
        </Rotulado>
        <Rotulado rotulo="Portes">
          <CampoNumero valor={l.portes} aoMudar={(n) => set({ portes: n ?? 0 })} sufixo="€" min={0} />
        </Rotulado>
        <Rotulado rotulo="Fornecedor">
          <input className="campo" value={l.fornecedor} onChange={(e) => set({ fornecedor: e.target.value })} />
        </Rotulado>
        <div className="flex items-end pb-2">
          <Interruptor ligado={l.artigoDoCliente} aoMudar={(v) => set({ artigoDoCliente: v })} rotulo="O cliente traz a peça" />
        </div>
        {!l.grupoOpcao && (
          <div className="lg:col-span-2">
            <Rotulado rotulo="Lote (variantes do mesmo trabalho)" ajuda="Mesmo nome = somam para o escalão e o setup paga-se uma vez">
              <input
                className="campo"
                value={l.lote ?? ""}
                placeholder="ex.: Bonés escola"
                onChange={(e) => set({ lote: e.target.value || undefined })}
              />
            </Rotulado>
          </div>
        )}
        <Rotulado rotulo="Peças já encomendadas" ajuda="De encomendas anteriores; contam para o escalão">
          <CampoNumero valor={l.pecasAnteriores} vazio min={0} aoMudar={(n) => set({ pecasAnteriores: n ? Math.round(n) : undefined })} />
        </Rotulado>
      </div>

      <div className="mt-4 space-y-3">
        {l.aplicacoes.map((a, i) => (
          <AplicacaoEditor
            key={a.id}
            a={a}
            r={r?.aplicacoes[i]}
            aoMudar={(fn) => mudarAplicacoes((as) => as.map((x) => (x.id === a.id ? fn(x) : x)))}
            aoRemover={() => mudarAplicacoes((as) => as.filter((x) => x.id !== a.id))}
          />
        ))}
        <button
          className="botao-secundario"
          onClick={() => mudarAplicacoes((as) => [...as, novaAplicacao("bordado")])}
        >
          + Juntar outra técnica a este artigo
        </button>
      </div>

      {r && (
        <div className="mt-4 grid gap-3 border-t border-linha pt-4 sm:grid-cols-2 lg:grid-cols-5">
          <Dado
            nome="Qtd faturada"
            valor={numero(r.qtdFaturada)}
            detalhe={[
              `escalão ${r.escalao.nome}`,
              r.qtdEscalao !== r.qtdFaturada ? `conta como ${numero(r.qtdEscalao)} peças` : "",
              r.setupRepartido ? "setup repartido pelo lote" : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          />
          <Dado nome="Preço sugerido/un" valor={euros(r.precoUnitSugerido)} />
          <Rotulado rotulo="Preço praticado/un" ajuda={l.precoUnitManual ? `${percent(l.precoUnitManual / r.precoUnitSugerido - 1)} vs sugerido` : "vazio = sugerido"}>
            <CampoNumero valor={l.precoUnitManual} aoMudar={(n) => set({ precoUnitManual: n })} sufixo="€" min={0} vazio />
          </Rotulado>
          <Dado nome="Total da linha" valor={euros(r.total)} />
          <Dado nome="Margem" valor={percent(r.margem)} alerta={r.margem < 0} detalhe={`custo ${euros(r.custo)}`} />
        </div>
      )}
    </section>
  );
}

function Dado({ nome, valor, detalhe, alerta }: { nome: string; valor: string; detalhe?: string; alerta?: boolean }) {
  return (
    <div>
      <div className="rotulo">{nome}</div>
      <div className={`text-lg font-medium tabular-nums ${alerta ? "text-alerta" : ""}`}>{valor}</div>
      {detalhe && <div className="text-xs text-cinza">{detalhe}</div>}
    </div>
  );
}

function Resumo({ o, r }: { o: Orcamento; r: ReturnType<typeof calcularOrcamento> }) {
  const p = useDados().parametros;
  const nomeMaquina = (id: string) => p.maquinas.find((m) => m.id === id)?.nome.split(" (")[0] ?? id;
  const fixo = o.estado !== "rascunho" && o.congelado;

  return (
    <>
      <div className="cartao">
        <h2 className="titulo mb-3 text-lg text-verde">Resumo</h2>
        {r.grupos.map((g) => (
          <div key={g.grupo} className="mb-3 rounded-md bg-beige-claro/60 p-2 text-sm">
            <div className="mb-1 text-xs font-medium text-mostarda">{g.grupo}: o cliente escolhe uma</div>
            {g.opcoes.map((x) => (
              <div key={x.linhaId} className={`flex justify-between gap-2 ${g.escolhida === x.linhaId ? "font-semibold text-verde" : ""}`}>
                <span className="truncate">{x.descricao || "opção"}</span>
                <span className="tabular-nums" title="Total do orçamento com esta opção, sem IVA">
                  {euros(x.totalComBase)}
                </span>
              </div>
            ))}
          </div>
        ))}
        <dl className="space-y-1.5 text-sm">
          <Linha nome="Artigos e personalização" valor={euros(r.subtotal - r.vendaCriacao)} />
          {r.vendaCriacao > 0 && <Linha nome="Criação" valor={euros(r.vendaCriacao)} />}
          {r.desconto > 0 && <Linha nome="Desconto por potencial" valor={`− ${euros(r.desconto)}`} />}
          <div className="my-2 border-t border-linha" />
          <Linha nome={r.opcoesPorEscolher ? "Total s/ IVA, sem opções" : "Total s/ IVA"} valor={euros(r.total)} forte />
          <Linha nome={`IVA ${percent(p.iva)}`} valor={euros(r.iva)} />
          <Linha nome="Total c/ IVA" valor={euros(r.totalComIva)} forte />
          <div className="my-2 border-t border-linha" />
          <Linha nome="Custo" valor={euros(r.custo)} />
          <Linha nome="Margem" valor={percent(r.margem)} alerta={r.margem < 0} />
        </dl>
        {fixo && Math.abs(o.congelado!.total - r.total) > 0.01 && (
          <p className="mt-3 rounded bg-beige-claro p-2 text-xs text-mostarda">
            Com os parâmetros de hoje daria {euros(r.total)}. O preço enviado ao cliente foi {euros(o.congelado!.total)}.
          </p>
        )}
        {r.usaEstimativas && (
          <p className="mt-3 flex items-center gap-2 text-xs text-cinza">
            <EtiquetaEstimativa /> Usa valores ainda por confirmar.
          </p>
        )}
      </div>

      <div className="cartao">
        <h2 className="titulo mb-3 text-lg text-verde">Tempo de produção</h2>
        <dl className="space-y-1.5 text-sm">
          {Object.entries(r.minutosMaquina).map(([id, min]) => (
            <Linha key={id} nome={nomeMaquina(id)} valor={horasMin(min)} />
          ))}
          <Linha nome="Operador" valor={horasMin(r.minutosOperador)} />
          <Linha nome="Designer" valor={horasMin(r.minutosDesigner)} />
          {Object.keys(r.minutosMaquina).length > 0 && (
            <>
              <div className="my-2 border-t border-linha" />
              <Linha nome="Prazo de máquina" valor={horasMin(r.prazoMaquinaMin)} forte />
            </>
          )}
        </dl>
        {Object.keys(r.minutosMaquina).length > 1 && (
          <p className="mt-2 text-xs text-cinza">As máquinas trabalham ao mesmo tempo: o prazo é o da mais carregada.</p>
        )}
      </div>

      <Avisos lista={r.avisos} />
    </>
  );
}

function Linha({ nome, valor, forte, alerta }: { nome: string; valor: string; forte?: boolean; alerta?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-cinza">{nome}</dt>
      <dd className={`tabular-nums ${forte ? "font-semibold" : ""} ${alerta ? "text-alerta" : ""}`}>{valor}</dd>
    </div>
  );
}
