"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { calcularOrcamento, NOME_TECNICA, precosPorQuantidade, tipoClienteDe, type ResultadoLinha } from "@/lib/producao/engine";
import { dataPt, euros, numero, percent } from "@/lib/producao/format";
import { atualizarOrcamento, useCarregado, useDados } from "@/app/(app)/producao/_lib/store";
import { useModelos } from "@/app/(app)/producao/_lib/modelos";
import { descreverGrelha } from "@/lib/producao/variantes";
import type { Aplicacao } from "@/lib/producao/types";

function descreverAplicacao(a: Aplicacao): string {
  const tecnica = NOME_TECNICA[a.tecnica].split(" (")[0];
  const medida = a.larguraCm && a.alturaCm ? ` ${numero(a.larguraCm)}×${numero(a.alturaCm)} cm` : "";
  const extra = a.tecnica === "bordado" && a.cores ? `, ${a.cores} ${a.cores === 1 ? "cor" : "cores"}` : "";
  return `${tecnica} ${a.posicao ? a.posicao.toLowerCase() : ""}${medida}${extra}`.replace(/\s+/g, " ").trim();
}

export default function Documento() {
  const { id } = useParams<{ id: string }>();
  const dados = useDados();
  const carregado = useCarregado();
  const o = dados.orcamentos.find((x) => x.id === id);
  const p = dados.parametros;
  const r = useMemo(() => (o ? calcularOrcamento(p, o) : null), [p, o]);

  // O mesmo orçamento feito a um particular. Uma empresa ou um parceiro já leva
  // desconto nas margens e no fator hora, mas isso não aparece em lado nenhum:
  // o cliente vê um preço e não sabe que é melhor do que o de balcão.
  //
  // Compara-se pela proporção e não pelo valor: num orçamento já enviado o
  // total está congelado, e recalcular a referência com os parâmetros de hoje
  // daria uma diferença que não corresponde ao que foi proposto.
  const racioBalcao = useMemo(() => {
    if (!o || !r || o.tipoCliente === "particular" || r.total <= 0) return null;
    const balcao = calcularOrcamento(p, { ...o, tipoCliente: "particular" });
    const racio = balcao.total / r.total;
    return racio > 1.0005 ? racio : null;
  }, [p, o, r]);
  const { modelos } = useModelos();

  if (!carregado) return null;
  if (!o || !r) return <p className="text-cinza">Orçamento não encontrado.</p>;

  const cliente = dados.clientes.find((c) => c.id === o.clienteId);
  const e = p.empresa;
  // Depois de enviado, o documento mostra sempre o preço fixado. Os orçamentos
  // novos guardam o total de cada linha (o motor já os usa); nos antigos só há
  // o total, e os preços escalam-se por ele.
  const fixados = o.estado !== "rascunho" ? o.congelado?.linhas : undefined;
  const fator = !fixados && o.congelado && o.estado !== "rascunho" && r.total > 0 ? o.congelado.total / r.total : 1;
  const totalLinha = (l: (typeof r.linhas)[number]) => (fixados?.[l.linha.id] ?? l.total) * fator;
  const precoUnit = (l: (typeof r.linhas)[number]) => (l.qtdFaturada > 0 ? totalLinha(l) / l.qtdFaturada : 0);
  // Preço praticado abaixo do sugerido: o sugerido é o preço de tabela e a diferença mostra-se como desconto
  const sugeridos = o.estado !== "rascunho" ? o.congelado?.sugeridos : undefined;
  const totalTabela = (l: (typeof r.linhas)[number]) => {
    const tabela = (sugeridos?.[l.linha.id] ?? l.totalSugerido) * fator;
    return (l.linha.precoUnitManual || l.linha.descontoPct) && tabela - totalLinha(l) >= 0.005 ? tabela : totalLinha(l);
  };
  const precoTabela = (l: (typeof r.linhas)[number]) =>
    totalTabela(l) > totalLinha(l) && l.qtdFaturada > 0 ? totalTabela(l) / l.qtdFaturada : undefined;
  // O que a mesma linha custaria ao balcão. Só quando não há já um desconto
  // explícito a ocupar o preço riscado — dois riscados pela mesma linha seriam
  // dois descontos a dizer o mesmo.
  const precoBalcao = (l: (typeof r.linhas)[number]) =>
    racioBalcao && o.mostrarDescontoCliente !== false && precoTabela(l) == null && l.qtdFaturada > 0
      ? precoUnit(l) * racioBalcao
      : undefined;
  // Linhas que entram na tabela: as normais e, depois de ganho, a opção escolhida
  const linhasTabela = r.linhas.filter((l) => l.incluida);
  const gruposAbertos = r.grupos.filter((g) => !g.escolhida);
  const descontoArtigos = linhasTabela.reduce((s, l) => s + totalTabela(l) - totalLinha(l), 0);
  const pecasDoCliente = o.linhas.some((l) => l.artigoDoCliente);
  const imagemDe = (l: (typeof r.linhas)[number]) => dados.artigos.find((a) => a.id === l.linha.artigoId)?.imagem;
  const alternativasDe = (l: (typeof r.linhas)[number]) =>
    l.linha.quantidadesAlternativas?.length ? precosPorQuantidade(p, o, l.linha.id, l.linha.quantidadesAlternativas) : undefined;
  const reparticaoDe = (l: (typeof r.linhas)[number]) =>
    l.linha.modeloId && l.linha.grelha?.length
      ? descreverGrelha(modelos.find((m) => m.id === l.linha.modeloId), l.linha.grelha) || undefined
      : undefined;
  const validade = new Date(o.data);
  validade.setDate(validade.getDate() + p.validadeDias);

  return (
    <>
      <div className="nao-imprimir mb-4 flex flex-wrap items-center gap-2">
        <Link href={`/producao/orcamentos/${o.id}`} className="botao-secundario">
          ← Voltar ao orçamento
        </Link>
        <button className="botao-principal" onClick={() => window.print()}>
          Imprimir / Guardar PDF
        </button>
        {gruposAbertos.length === 0 ? (
          <label className="flex items-center gap-2 rounded-md bg-white px-3 py-1.5 text-sm ring-1 ring-linha">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--color-verde)]"
              checked={o.mostrarTotal !== false}
              onChange={(ev) => atualizarOrcamento(o.id, (x) => ({ ...x, mostrarTotal: ev.target.checked }))}
            />
            Mostrar o total do orçamento
          </label>
        ) : (
          <span className="rounded-md bg-beige-claro px-3 py-1.5 text-xs text-mostarda">Com opções, cada opção mostra o seu total: não há total do orçamento.</span>
        )}
        {racioBalcao && (
          <label className="flex items-center gap-2 rounded-md bg-white px-3 py-1.5 text-sm ring-1 ring-linha">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--color-verde)]"
              checked={o.mostrarDescontoCliente !== false}
              onChange={(ev) => atualizarOrcamento(o.id, (x) => ({ ...x, mostrarDescontoCliente: ev.target.checked }))}
            />
            {/* A percentagem é sobre o preço de balcão, que é o que o cliente
                compara. Sobre o que ele paga daria um número maior e errado. */}
            Mostrar a poupança face ao balcão ({percent(1 - 1 / racioBalcao)})
          </label>
        )}
        <span className="text-xs text-cinza">
          No diálogo de impressão escolha &quot;Guardar como PDF&quot;. Para uma proposta especial, o PDF importa-se no Canva.
        </span>
      </div>

      <article className="mx-auto max-w-[210mm] bg-white p-[14mm] text-[10.5pt] leading-relaxed shadow-sm print:shadow-none">
        <header className="mb-10 flex items-start justify-between gap-6">
          <Image src="/brand/logo-verde.png" alt="SOU creative" width={110} height={81} priority />
          <div className="text-right text-xs text-cinza">
            <div className="font-medium text-tinta">{e.nome}</div>
            {e.nif && <div>NIF {e.nif}</div>}
            {e.morada && <div className="whitespace-pre-line">{e.morada}</div>}
            {e.email && <div>{e.email}</div>}
            {e.telefone && <div>{e.telefone}</div>}
            {e.site && <div>{e.site}</div>}
          </div>
        </header>

        <div className="mb-8 flex flex-wrap justify-between gap-6">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-mostarda">Orçamento</div>
            <h1 className="text-3xl font-semibold tracking-tight text-verde">{o.numero}</h1>
            {o.titulo && <div className="mt-1 text-sm">{o.titulo}</div>}
          </div>
          <div className="text-sm">
            <div className="text-xs text-cinza">Para</div>
            <div className="font-medium">{cliente?.nome ?? "—"}</div>
            {cliente?.nif && <div className="text-xs text-cinza">NIF {cliente.nif}</div>}
            {cliente?.email && <div className="text-xs text-cinza">{cliente.email}</div>}
            <div className="mt-2 text-xs text-cinza">
              Data {dataPt(o.data)} · Válido até {dataPt(validade.toISOString())}
            </div>
          </div>
        </div>

        {(linhasTabela.length > 0 || r.vendaCriacao > 0) && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-verde text-left text-xs text-cinza">
                <th className="py-2 pr-2 font-medium">Artigo</th>
                <th className="py-2 px-2 text-right font-medium">Qtd</th>
                <th className="py-2 px-2 text-right font-medium">Preço/un</th>
                <th className="py-2 px-2 text-right font-medium">Total s/ IVA</th>
                <th className="py-2 pl-2 text-right font-medium">Total c/ IVA</th>
              </tr>
            </thead>
            <tbody>
              {linhasTabela.map((l) => (
                <LinhaDoc key={l.linha.id} l={l} iva={p.iva} precoUnit={precoUnit(l)} precoTabela={precoTabela(l)} precoBalcao={precoBalcao(l)} total={totalLinha(l)} imagem={imagemDe(l)} alternativas={alternativasDe(l)} reparticao={reparticaoDe(l)} pvp={o.tipoCliente === "parceiro" ? l.linha.pvpRecomendado : undefined} />
              ))}
              {r.vendaCriacao > 0 && (
                <tr className="border-b border-linha">
                  <td className="py-3 pr-2">
                    <div className="font-medium">Criação gráfica</div>
                    <div className="text-xs text-cinza">{numero(o.horasCriacao)} h de design</div>
                  </td>
                  <td />
                  <td />
                  <td className="py-3 px-2 text-right tabular-nums">{euros(r.vendaCriacao * fator)}</td>
                  <td className="py-3 pl-2 text-right tabular-nums">{euros(r.vendaCriacao * fator * (1 + p.iva))}</td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {gruposAbertos.map((g) => (
          <section key={g.grupo} className="mt-8 break-inside-avoid">
            <h2 className="mb-1 text-xs uppercase tracking-[0.2em] text-mostarda">{g.grupo} · escolha uma</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-mostarda text-left text-xs text-cinza">
                  <th className="py-2 pr-2 font-medium">Opção</th>
                  <th className="py-2 px-2 text-right font-medium">Qtd</th>
                  <th className="py-2 px-2 text-right font-medium">Preço/un</th>
                  <th className="py-2 px-2 text-right font-medium">Total s/ IVA</th>
                  <th className="py-2 pl-2 text-right font-medium">Total c/ IVA</th>
                </tr>
              </thead>
              <tbody>
                {r.linhas
                  .filter((l) => l.linha.grupoOpcao === g.grupo)
                  .map((l, i) => {
                    return (
                      <LinhaDoc
                        iva={p.iva}
                        key={l.linha.id}
                        l={l}
                        rotulo={`Opção ${String.fromCharCode(65 + i)}`}
                        precoUnit={precoUnit(l)}
                        precoTabela={precoTabela(l)}
                        precoBalcao={precoBalcao(l)}
                        total={totalLinha(l)}
                        imagem={imagemDe(l)}
                        alternativas={alternativasDe(l)}
                        reparticao={reparticaoDe(l)}
                        pvp={o.tipoCliente === "parceiro" ? l.linha.pvpRecomendado : undefined}
                      />
                    );
                  })}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-cinza">
              Valores por opção, sem IVA (acresce IVA à taxa legal).
            </p>
          </section>
        ))}

        <div className="mt-6 ml-auto w-full max-w-xs space-y-1 text-sm">
          {/* Com opções por escolher não há um total: cada opção tem o seu */}
          {gruposAbertos.length > 0 || o.mostrarTotal === false ? null : (
            <>
              {descontoArtigos > 0 && (
                <>
                  <div className="flex justify-between">
                    <span className="text-cinza">Preço de tabela</span>
                    <span className="tabular-nums">{euros(r.subtotal * fator + descontoArtigos)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-cinza">Desconto nos artigos</span>
                    <span className="tabular-nums">− {euros(descontoArtigos)}</span>
                  </div>
                </>
              )}
              {r.desconto > 0 && (
                <>
                  <div className="flex justify-between">
                    <span className="text-cinza">Subtotal</span>
                    <span className="tabular-nums">{euros(r.subtotal * fator)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-cinza">Desconto {percent(o.descontoPotencialPct)}</span>
                    <span className="tabular-nums">− {euros(r.desconto * fator)}</span>
                  </div>
                </>
              )}
              {/* O que já vai descontado por ser empresa ou parceiro. Sem isto
                  o cliente vê um preço e não sabe que é melhor do que o de
                  balcão — e a condição que tem connosco passa despercebida. */}
              {racioBalcao && o.mostrarDescontoCliente !== false && (
                <>
                  <div className="flex justify-between">
                    <span className="text-cinza">Preço de balcão</span>
                    <span className="tabular-nums">{euros(r.total * fator * racioBalcao)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-cinza">
                      Condição {tipoClienteDe(p, o.tipoCliente).nome.toLowerCase()}
                    </span>
                    <span className="tabular-nums">
                      − {euros(r.total * fator * (racioBalcao - 1))}
                    </span>
                  </div>
                </>
              )}
              <div className="flex justify-between">
                <span className="text-cinza">Total s/ IVA</span>
                <span className="tabular-nums">{euros(r.total * fator)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-cinza">IVA {percent(p.iva)}</span>
                <span className="tabular-nums">{euros(r.iva * fator)}</span>
              </div>
              <div className="flex justify-between border-t-2 border-verde pt-2 text-base font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{euros(r.totalComIva * fator)}</span>
              </div>
            </>
          )}
        </div>

        {o.notas && (
          <section className="mt-10">
            <h2 className="mb-1 text-xs uppercase tracking-[0.2em] text-mostarda">Observações</h2>
            <p className="whitespace-pre-line text-sm">{o.notas}</p>
          </section>
        )}
        {e.dadosPagamento && (
          <section className="mt-8 break-inside-avoid rounded-md border border-linha bg-papel/60 px-4 py-3">
            <h2 className="mb-1.5 text-xs uppercase tracking-[0.2em] text-mostarda">Dados para pagamento</h2>
            <div className="space-y-0.5 text-sm">
              {e.dadosPagamento
                .split("\n")
                .filter((t) => t.trim())
                .map((t, i) => {
                  const dois = t.indexOf(":");
                  return dois > 0 && dois < 40 ? (
                    <p key={i}>
                      <span className="text-cinza">{t.slice(0, dois + 1)}</span>
                      <span className={/^IBAN|BIC/i.test(t) ? "font-medium tabular-nums" : ""}>{t.slice(dois + 1)}</span>
                    </p>
                  ) : (
                    <p key={i} className={i === 0 ? "font-medium" : ""}>
                      {t}
                    </p>
                  );
                })}
            </div>
          </section>
        )}
        {(e.condicoes || (pecasDoCliente && e.condicoesPecasCliente)) && (
          <section className="mt-8 break-inside-avoid print:mt-0 print:break-before-page">
            <h2 className="mb-2 text-xs uppercase tracking-[0.2em] text-mostarda">Termos e condições</h2>
            <Condicoes texto={[pecasDoCliente ? e.condicoesPecasCliente : "", e.condicoes].filter(Boolean).join("\n\n")} />
          </section>
        )}

        {e.rodape && (
          <footer className="mt-12 border-t border-linha pt-3 text-center text-[8pt] text-cinza">{e.rodape}</footer>
        )}
      </article>
    </>
  );
}

function LinhaDoc({
  l,
  rotulo,
  precoUnit,
  precoTabela,
  precoBalcao,
  total,
  iva,
  imagem,
  alternativas,
  reparticao,
  pvp,
}: {
  l: ResultadoLinha;
  rotulo?: string;
  precoUnit: number;
  precoTabela?: number;
  /** O que custaria ao balcão, quando este cliente tem condição melhor */
  precoBalcao?: number;
  total: number;
  iva: number;
  imagem?: string;
  alternativas?: { quantidade: number; precoUnit: number; total: number }[];
  reparticao?: string;
  pvp?: number;
}) {
  return (
    <tr className="break-inside-avoid border-b border-linha">
      <td className="py-3 pr-2">
        <div className="flex gap-3">
        {imagem && (
          // eslint-disable-next-line @next/next/no-img-element -- imagens do Supabase, já reduzidas
          <img src={imagem} alt="" className="h-16 w-16 shrink-0 rounded object-cover" />
        )}
        <div>
        {rotulo && <div className="text-xs font-medium uppercase tracking-wider text-mostarda">{rotulo}</div>}
        <div className="font-medium">{l.linha.descricao || "Artigo"}</div>
        {reparticao && <div className="text-xs text-cinza">{reparticao}</div>}
        {pvp != null && pvp > 0 && (
          <div className="text-xs font-medium text-mostarda">PVP recomendado: {euros(pvp)} (c/ IVA)</div>
        )}
        {l.linha.artigoDoCliente && <div className="text-xs text-cinza">Peça fornecida pelo cliente</div>}
        {precoTabela != null && (
          <div className="text-xs font-medium text-verde">Desconto de {percent(1 - precoUnit / precoTabela)} sobre o preço de tabela</div>
        )}
        {precoBalcao != null && (
          <div className="text-xs font-medium text-verde">Desconto de {percent(1 - precoUnit / precoBalcao)} sobre o preço de balcão</div>
        )}
        {l.aplicacoes.map((a) => (
          <div key={a.aplicacao.id} className="text-xs text-cinza">
            {descreverAplicacao(a.aplicacao)}
          </div>
        ))}
        {alternativas && alternativas.length > 0 && (
          <div className="mt-1.5 rounded bg-beige-claro/70 px-2 py-1 text-xs">
            <span className="text-cinza">Noutras quantidades: </span>
            {alternativas.map((x) => (
              <span key={x.quantidade} className="mr-3 whitespace-nowrap">
                <b>{numero(x.quantidade)} un</b> a {euros(x.precoUnit)}/un ({euros(x.total)})
              </span>
            ))}
          </div>
        )}
        </div>
        </div>
      </td>
      <td className="py-3 px-2 text-right tabular-nums">{numero(l.qtdFaturada)}</td>
      <td className="py-3 px-2 text-right tabular-nums">
        {precoTabela != null && <div className="text-xs text-cinza line-through">{euros(precoTabela)}</div>}
        {precoBalcao != null && <div className="text-xs text-cinza line-through">{euros(precoBalcao)}</div>}
        {euros(precoUnit)}
      </td>
      <td className="py-3 px-2 text-right tabular-nums">{euros(total)}</td>
      <td className="py-3 pl-2 text-right tabular-nums">{euros(total * (1 + iva))}</td>
    </tr>
  );
}

/** Texto das condições: as linhas em maiúsculas são títulos de secção. */
function Condicoes({ texto }: { texto: string }) {
  const blocos = texto.split(/\n\s*\n/).map((b) => b.split("\n").filter((x) => x.trim()));
  return (
    <div className="columns-1 gap-6 text-[8pt] leading-snug text-cinza sm:columns-2 print:columns-2">
      {blocos.map((linhas, i) => {
        const titulo = linhas[0] && linhas[0] === linhas[0].toUpperCase() && linhas[0].length < 60 ? linhas[0] : null;
        return (
          <div key={i} className="mb-3 break-inside-avoid">
            {titulo && <div className="mb-0.5 font-semibold text-tinta">{titulo.charAt(0) + titulo.slice(1).toLowerCase()}</div>}
            {(titulo ? linhas.slice(1) : linhas).map((t, j) => (
              <p key={j} className="mb-0.5">
                {t}
              </p>
            ))}
          </div>
        );
      })}
    </div>
  );
}
