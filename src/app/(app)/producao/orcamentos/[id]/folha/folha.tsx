"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { calcularOrcamento, custosPorRubrica, NOME_TECNICA, type ResultadoAplicacao } from "@/lib/producao/engine";
import { ETAPAS, etapaDe } from "@/lib/producao/agenda";
import { ESTADOS } from "@/lib/producao/estados";
import { dataPt, euros, horasMin, numero, percent } from "@/lib/producao/format";
import { useModelos } from "@/app/(app)/producao/_lib/modelos";
import { useCarregado, useDados } from "@/app/(app)/producao/_lib/store";

/**
 * Folha de obra: documento interno do orçamento. Junta o resumo de custos e
 * margem, o que é preciso produzir (artigos por código do TOC, técnicas,
 * consumíveis, tempos), o que se fatura e uma lista de controlo para imprimir
 * e acompanhar o trabalho. Não é para o cliente: tem custos.
 */
export default function FolhaObra() {
  const { id } = useParams<{ id: string }>();
  const dados = useDados();
  const carregado = useCarregado();
  const { modelos } = useModelos();
  const o = dados.orcamentos.find((x) => x.id === id);
  const p = dados.parametros;
  const r = useMemo(() => (o ? calcularOrcamento(p, o) : null), [p, o]);

  if (!carregado) return null;
  if (!o || !r) return <p className="text-cinza">Orçamento não encontrado.</p>;

  const c = custosPorRubrica(p, r);
  const cliente = dados.clientes.find((x) => x.id === o.clienteId);
  const responsavel = dados.equipa.find((x) => x.id === o.producao?.responsavelId)?.nome;
  const linhas = r.linhas.filter((l) => l.incluida);
  const nomeMaquina = (mid: string) => p.maquinas.find((m) => m.id === mid)?.nome.split(" (")[0] ?? mid;

  // Preços como no documento do cliente: depois de enviado, os fixados
  const fixados = o.estado !== "rascunho" ? o.congelado?.linhas : undefined;
  const fator = !fixados && o.congelado && o.estado !== "rascunho" && r.total > 0 ? o.congelado.total / r.total : 1;
  const totalLinha = (l: (typeof linhas)[number]) => (fixados?.[l.linha.id] ?? l.total) * fator;
  const sugeridos = o.estado !== "rascunho" ? o.congelado?.sugeridos : undefined;
  const venda = r.total * fator;
  const margemEur = venda - c.total;
  const margem = venda > 0 ? margemEur / venda : 0;

  const rubricas: [string, number, string][] = [
    ["Artigos (peças em branco)", c.artigos, "custo de compra das peças"],
    ["Consumíveis", c.consumiveis, "tintas, linhas, filmes, papel…"],
    ["Máquinas", c.maquinas, "amortização, manutenção e energia"],
    ["Operador", c.operador, "produção e preparação das máquinas"],
    ["Designer", c.designer, "artes, digitalização, nomes e criação"],
    ["Portes", c.portes, "uma vez por fornecedor"],
  ];

  // Linhas de faturação: as linhas com grelha partem-se por variante (um código do TOC cada)
  type LinhaFatura = { codigo: string; descricao: string; qtd: number; precoUnit: number; desconto: number; total: number };
  const faturacao: LinhaFatura[] = linhas.flatMap((l) => {
    const total = totalLinha(l);
    const precoUnit = l.qtdFaturada > 0 ? total / l.qtdFaturada : 0;
    const tabela = (sugeridos?.[l.linha.id] ?? l.totalSugerido) * fator;
    const desconto = (l.linha.precoUnitManual || l.linha.descontoPct) && tabela - total >= 0.005 ? 1 - total / tabela : 0;
    const codigo = (id?: string) => (id?.startsWith("toc:") ? id.slice(4) : id ? "provisório" : "—");
    const modelo = l.linha.modeloId ? modelos.find((m) => m.id === l.linha.modeloId) : undefined;
    const grelha = (l.linha.grelha ?? []).filter((g) => g.quantidade > 0);
    if (modelo && grelha.length) {
      const partes = grelha.map((g) => {
        const v = modelo.variantes.find((x) => x.artigo.id === g.artigoId);
        return {
          codigo: codigo(g.artigoId),
          descricao: `${l.linha.descricao}${v ? ` · ${[v.cor, v.tamanho].filter(Boolean).join(" ")}` : ""}`,
          qtd: g.quantidade,
          precoUnit,
          desconto,
          total: precoUnit * g.quantidade,
        };
      });
      const resto = l.qtdFaturada - grelha.reduce((s, g) => s + g.quantidade, 0);
      if (resto > 0) partes.push({ codigo: "—", descricao: `${l.linha.descricao} · mínimo do fornecedor`, qtd: resto, precoUnit, desconto, total: precoUnit * resto });
      return partes;
    }
    return [{ codigo: codigo(l.linha.artigoId), descricao: l.linha.descricao || "Artigo", qtd: l.qtdFaturada, precoUnit, desconto, total }];
  });

  const etapaId = etapaDe(o);
  const etapa = etapaId ? ETAPAS.find((x) => x.id === etapaId) : undefined;

  return (
    <>
      <div className="nao-imprimir mb-4 flex flex-wrap items-center gap-2">
        <Link href={`/producao/orcamentos/${o.id}`} className="botao-secundario">
          ← Voltar ao orçamento
        </Link>
        <button className="botao-principal" onClick={() => window.print()}>
          Imprimir / Guardar PDF
        </button>
        <span className="text-xs text-cinza">Documento interno: tem custos e margens. Não enviar ao cliente.</span>
      </div>

      <article className="mx-auto max-w-[210mm] space-y-6 bg-white p-[12mm] text-[10pt] leading-snug shadow-sm print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b-2 border-verde pb-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-mostarda">Folha de obra · uso interno</div>
            <h1 className="mt-1 text-2xl font-semibold text-verde">
              {o.numero} {o.titulo && <span className="font-normal text-tinta">· {o.titulo}</span>}
            </h1>
            <div className="mt-1 text-sm">
              <b>{cliente?.nome ?? "Sem cliente"}</b>
              {cliente?.nif && ` · NIF ${cliente.nif}`}
              {cliente?.email && ` · ${cliente.email}`}
              {cliente?.telefone && ` · ${cliente.telefone}`}
            </div>
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-right text-xs">
            <dt className="text-cinza">Estado</dt>
            <dd>{ESTADOS[o.estado].nome}</dd>
            <dt className="text-cinza">Orçamento</dt>
            <dd>{dataPt(o.data)}</dd>
            {o.congelado?.em && (
              <>
                <dt className="text-cinza">Preço fixado</dt>
                <dd>{dataPt(o.congelado.em)}</dd>
              </>
            )}
            {o.producao?.prazo && (
              <>
                <dt className="text-cinza">Prazo</dt>
                <dd className="font-semibold">{dataPt(o.producao.prazo)}</dd>
              </>
            )}
            {etapa && (
              <>
                <dt className="text-cinza">Etapa</dt>
                <dd>{etapa.nome}</dd>
              </>
            )}
            {responsavel && (
              <>
                <dt className="text-cinza">Responsável</dt>
                <dd>{responsavel}</dd>
              </>
            )}
          </dl>
        </header>

        {r.opcoesPorEscolher && (
          <p className="rounded bg-beige-claro px-3 py-2 text-xs text-mostarda">
            Há opções por escolher: os valores contam só os artigos sem opção. Ao marcar o orçamento como ganho, escolha a opção e a
            folha passa a incluí-la.
          </p>
        )}

        {/* ── Resumo económico ── */}
        <section className="break-inside-avoid">
          <Titulo>Resumo económico</Titulo>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] print:grid-cols-[1fr_auto]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-linha text-left text-xs text-cinza">
                  <th className="py-1 font-medium">Custo</th>
                  <th className="py-1 text-right font-medium">Valor</th>
                  <th className="py-1 text-right font-medium">% da venda</th>
                </tr>
              </thead>
              <tbody>
                {rubricas
                  .filter(([, v]) => v > 0.004)
                  .map(([nome, v, nota]) => (
                    <tr key={nome} className="border-b border-linha/60">
                      <td className="py-1">
                        {nome} <span className="text-xs text-cinza">· {nota}</span>
                      </td>
                      <td className="py-1 text-right tabular-nums">{euros(v)}</td>
                      <td className="py-1 text-right tabular-nums text-cinza">{venda > 0 ? percent(v / venda) : "—"}</td>
                    </tr>
                  ))}
                <tr className="font-semibold">
                  <td className="py-1.5">Custo total</td>
                  <td className="py-1.5 text-right tabular-nums">{euros(c.total)}</td>
                  <td className="py-1.5 text-right tabular-nums">{venda > 0 ? percent(c.total / venda) : "—"}</td>
                </tr>
              </tbody>
            </table>
            <div className="min-w-48 space-y-1 rounded-md bg-papel p-3 text-sm">
              <Par nome="Venda s/ IVA" valor={euros(venda)} />
              <Par nome="Custo" valor={`− ${euros(c.total)}`} />
              <div className="border-t border-linha" />
              <Par nome="Margem" valor={euros(margemEur)} forte alerta={margemEur < 0} />
              <Par nome="Margem %" valor={percent(margem)} forte alerta={margem < 0} />
              <div className="border-t border-linha" />
              <Par nome="Pessoas" valor={`${euros(c.operador + c.designer)} · ${horasMin(r.minutosOperador + r.minutosDesigner)}`} />
            </div>
          </div>
          {fixados && <p className="mt-1 text-[11px] text-cinza">Venda ao preço fixado no envio; custos com os parâmetros de hoje.</p>}
        </section>

        {/* ── Produção ── */}
        <section>
          <Titulo>Produção</Titulo>
          <div className="space-y-3">
            {linhas.map((l, i) => {
              const modelo = l.linha.modeloId ? modelos.find((m) => m.id === l.linha.modeloId) : undefined;
              const grelha = (l.linha.grelha ?? []).filter((g) => g.quantidade > 0);
              return (
                <div key={l.linha.id} className="break-inside-avoid rounded-md border border-linha p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="font-semibold">
                      {i + 1}. {l.linha.descricao || "Artigo"}
                    </div>
                    <div className="text-sm">
                      <b>{numero(l.qtdFaturada)} un</b>
                      {l.qtdFaturada > l.linha.quantidade && <span className="text-xs text-cinza"> (pedidas {numero(l.linha.quantidade)})</span>}
                    </div>
                  </div>
                  <div className="text-xs text-cinza">
                    {l.linha.artigoDoCliente
                      ? "Peça fornecida pelo cliente: conferir quantidades e estado na receção"
                      : [l.linha.fornecedor && `Fornecedor: ${l.linha.fornecedor}`, `custo ${euros(l.linha.custoArtigo)}/un`].filter(Boolean).join(" · ")}
                  </div>

                  {modelo && grelha.length > 0 ? (
                    <table className="mt-2 w-full text-xs">
                      <thead>
                        <tr className="text-left text-cinza">
                          <th className="font-medium">Código TOC</th>
                          <th className="font-medium">Cor</th>
                          <th className="font-medium">Tamanho</th>
                          <th className="text-right font-medium">Qtd</th>
                          <th className="w-10 text-center font-medium">✓</th>
                        </tr>
                      </thead>
                      <tbody>
                        {modelo.variantes
                          .filter((v) => grelha.some((g) => g.artigoId === v.artigo.id))
                          .map((v) => (
                            <tr key={v.artigo.id} className="border-t border-linha/60">
                              <td className="py-0.5 font-mono">{v.artigo.id.replace(/^toc:/, "")}</td>
                              <td>{v.cor || "—"}</td>
                              <td>{v.tamanho || "—"}</td>
                              <td className="text-right tabular-nums">{grelha.find((g) => g.artigoId === v.artigo.id)?.quantidade}</td>
                              <td className="text-center">☐</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  ) : (
                    l.linha.artigoId?.startsWith("toc:") && <div className="mt-1 font-mono text-xs">Código TOC: {l.linha.artigoId.slice(4)}</div>
                  )}

                  {l.aplicacoes.length > 0 && (
                    <table className="mt-2 w-full text-xs">
                      <thead>
                        <tr className="text-left text-cinza">
                          <th className="font-medium">Técnica</th>
                          <th className="font-medium">Posição e medidas</th>
                          <th className="font-medium">Máquina</th>
                          <th className="text-right font-medium">Máquina</th>
                          <th className="text-right font-medium">Operador</th>
                          <th className="text-right font-medium">Designer</th>
                        </tr>
                      </thead>
                      <tbody>
                        {l.aplicacoes.map((a) => (
                          <tr key={a.aplicacao.id} className="border-t border-linha/60 align-top">
                            <td className="py-0.5">{NOME_TECNICA[a.aplicacao.tecnica].split(" (")[0]}</td>
                            <td>{detalheAplicacao(a)}</td>
                            <td>{a.maquinasIds.map(nomeMaquina).join(" + ")}</td>
                            <td className="text-right tabular-nums">{horasMin(a.peca.maquinaMin * l.qtdFaturada)}</td>
                            <td className="text-right tabular-nums">{horasMin(a.peca.operadorMin * l.qtdFaturada + a.setupOperadorMin)}</td>
                            <td className="text-right tabular-nums">{horasMin(a.peca.designerMin * l.qtdFaturada + a.setupDesignerMin)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
            {o.horasCriacao > 0 && (
              <div className="rounded-md border border-linha p-3 text-sm">
                <b>Criação gráfica</b> · {numero(o.horasCriacao)} h de design
              </div>
            )}
          </div>

          <div className="mt-3 grid gap-4 sm:grid-cols-2 print:grid-cols-2">
            <div className="break-inside-avoid">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-cinza">Consumíveis previstos</h3>
              {c.detalheConsumiveis.length ? (
                <table className="w-full text-xs">
                  <tbody>
                    {c.detalheConsumiveis.map((k) => (
                      <tr key={k.id} className="border-t border-linha/60">
                        <td className="py-0.5">{k.nome}</td>
                        <td className="text-right tabular-nums">
                          {numero(Math.round(k.quantidade * 100) / 100)} {k.unidade}
                        </td>
                        <td className="w-20 text-right tabular-nums text-cinza">{euros(k.custo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-xs text-cinza">Sem consumíveis.</p>
              )}
            </div>
            <div className="break-inside-avoid">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-cinza">Tempos previstos</h3>
              <table className="w-full text-xs">
                <tbody>
                  {Object.entries(r.minutosMaquina).map(([mid, min]) => (
                    <tr key={mid} className="border-t border-linha/60">
                      <td className="py-0.5">{nomeMaquina(mid)}</td>
                      <td className="text-right tabular-nums">{horasMin(min)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-linha/60">
                    <td className="py-0.5">Operador</td>
                    <td className="text-right tabular-nums">{horasMin(r.minutosOperador)}</td>
                  </tr>
                  <tr className="border-t border-linha/60">
                    <td className="py-0.5">Designer</td>
                    <td className="text-right tabular-nums">{horasMin(r.minutosDesigner)}</td>
                  </tr>
                  {Object.keys(r.minutosMaquina).length > 0 && (
                    <tr className="border-t border-linha font-semibold">
                      <td className="py-0.5">Prazo de máquina</td>
                      <td className="text-right tabular-nums">{horasMin(r.prazoMaquinaMin)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ── Faturação ── */}
        <section className="break-inside-avoid">
          <Titulo>Para faturação</Titulo>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-linha text-left text-cinza">
                <th className="py-1 font-medium">Código TOC</th>
                <th className="py-1 font-medium">Descrição</th>
                <th className="py-1 text-right font-medium">Qtd</th>
                <th className="py-1 text-right font-medium">Preço/un</th>
                <th className="py-1 text-right font-medium">Desc.</th>
                <th className="py-1 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {faturacao.map((f, i) => (
                <tr key={i} className="border-b border-linha/60">
                  <td className="py-1 font-mono">{f.codigo}</td>
                  <td className="py-1">{f.descricao}</td>
                  <td className="py-1 text-right tabular-nums">{numero(f.qtd)}</td>
                  <td className="py-1 text-right tabular-nums">{euros(f.precoUnit)}</td>
                  <td className="py-1 text-right tabular-nums">{f.desconto ? percent(f.desconto) : ""}</td>
                  <td className="py-1 text-right tabular-nums">{euros(f.total)}</td>
                </tr>
              ))}
              {r.vendaCriacao > 0 && (
                <tr className="border-b border-linha/60">
                  <td className="py-1 font-mono">—</td>
                  <td className="py-1">Criação gráfica ({numero(o.horasCriacao)} h)</td>
                  <td className="py-1 text-right tabular-nums">1</td>
                  <td className="py-1 text-right tabular-nums">{euros(r.vendaCriacao * fator)}</td>
                  <td />
                  <td className="py-1 text-right tabular-nums">{euros(r.vendaCriacao * fator)}</td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="ml-auto mt-2 w-64 space-y-0.5 text-sm">
            {r.desconto > 0 && (
              <>
                <Par nome="Subtotal" valor={euros(r.subtotal * fator)} />
                <Par nome={`Desconto ${percent(o.descontoPotencialPct)}`} valor={`− ${euros(r.desconto * fator)}`} />
              </>
            )}
            <Par nome="Total s/ IVA" valor={euros(venda)} />
            <Par nome={`IVA ${percent(p.iva)}`} valor={euros(r.iva * fator)} />
            <Par nome="Total c/ IVA" valor={euros(r.totalComIva * fator)} forte />
          </div>
          {faturacao.some((f) => f.codigo === "provisório") && (
            <p className="mt-2 text-xs text-alerta">Há artigos provisórios: criar o artigo no TOC antes de faturar.</p>
          )}
        </section>

        {/* ── Controlo ── */}
        <section className="break-inside-avoid">
          <Titulo>Controlo</Titulo>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-linha text-left text-cinza">
                <th className="w-8 py-1" />
                <th className="py-1 font-medium">Passo</th>
                <th className="w-28 py-1 font-medium">Data</th>
                <th className="w-32 py-1 font-medium">Visto</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Orçamento aceite por escrito", o.estado === "ganho" ? o.congelado?.em : undefined],
                ["Pagamento recebido (100%)", undefined],
                ["Maquete aprovada pelo cliente", undefined],
                ["Artigos encomendados ao fornecedor", undefined],
                ["Artigos recebidos e conferidos", undefined],
                ["Produção iniciada", o.producao?.iniciadoEm],
                ["Produção concluída e controlo de qualidade", o.producao?.prontoEm ?? o.produzidoEm],
                ["Entregue / levantado", o.producao?.entregueEm],
                ["Faturado · n.º ____________", undefined],
              ].map(([passo, data]) => (
                <tr key={passo} className="border-b border-linha/60">
                  <td className="py-1.5 text-center text-base">{data ? "☑" : "☐"}</td>
                  <td className="py-1.5">{passo}</td>
                  <td className="py-1.5 tabular-nums">{data ? dataPt(data) : "____/____/______"}</td>
                  <td className="py-1.5 text-cinza">______________</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {(o.notas || o.producao?.notas) && (
          <section className="break-inside-avoid">
            <Titulo>Observações</Titulo>
            {o.notas && <p className="whitespace-pre-line text-sm">{o.notas}</p>}
            {o.producao?.notas && <p className="mt-1 whitespace-pre-line text-sm">Produção: {o.producao.notas}</p>}
          </section>
        )}

        {r.avisos.length > 0 && (
          <section className="break-inside-avoid">
            <Titulo>Avisos do cálculo</Titulo>
            <ul className="list-disc pl-5 text-xs text-cinza">
              {r.avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </>
  );
}

function detalheAplicacao(a: ResultadoAplicacao): string {
  const x = a.aplicacao;
  return [
    x.posicao,
    x.larguraCm && x.alturaCm ? `${numero(x.larguraCm)}×${numero(x.alturaCm)} cm` : "",
    x.tecnica === "bordado" && x.pontos ? `${numero(x.pontos)} pontos` : "",
    x.cores ? `${x.cores} ${x.cores === 1 ? "cor" : "cores"}` : "",
    x.pecaEscura ? "peça escura" : "",
    x.nomesIndividuais ? "nomes individuais" : "",
    x.jaProduzido ? "repetição" : x.arteCliente ? "arte do cliente" : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function Titulo({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-mostarda">{children}</h2>;
}

function Par({ nome, valor, forte, alerta }: { nome: string; valor: string; forte?: boolean; alerta?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-cinza">{nome}</span>
      <span className={`tabular-nums ${forte ? "font-semibold" : ""} ${alerta ? "text-alerta" : ""}`}>{valor}</span>
    </div>
  );
}
