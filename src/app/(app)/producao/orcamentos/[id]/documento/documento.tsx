"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { calcularOrcamento, NOME_TECNICA, precosPorQuantidade, type GrupoOpcoes, type ResultadoLinha } from "@/lib/producao/engine";
import { dataPt, euros, numero, percent } from "@/lib/producao/format";
import { useCarregado, useDados } from "@/app/(app)/producao/_lib/store";
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
  // Linhas que entram na tabela: as normais e, depois de ganho, a opção escolhida
  const linhasTabela = r.linhas.filter((l) => l.incluida);
  const gruposAbertos = r.grupos.filter((g) => !g.escolhida);
  const pecasDoCliente = o.linhas.some((l) => l.artigoDoCliente);
  const imagemDe = (l: (typeof r.linhas)[number]) => dados.artigos.find((a) => a.id === l.linha.artigoId)?.imagem;
  const alternativasDe = (l: (typeof r.linhas)[number]) =>
    l.linha.quantidadesAlternativas?.length ? precosPorQuantidade(p, o, l.linha.id, l.linha.quantidadesAlternativas) : undefined;
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
                <th className="py-2 pl-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {linhasTabela.map((l) => (
                <LinhaDoc key={l.linha.id} l={l} precoUnit={precoUnit(l)} total={totalLinha(l)} imagem={imagemDe(l)} alternativas={alternativasDe(l)} />
              ))}
              {r.vendaCriacao > 0 && (
                <tr className="border-b border-linha">
                  <td className="py-3 pr-2">
                    <div className="font-medium">Criação gráfica</div>
                    <div className="text-xs text-cinza">{numero(o.horasCriacao)} h de design</div>
                  </td>
                  <td />
                  <td />
                  <td className="py-3 pl-2 text-right tabular-nums">{euros(r.vendaCriacao * fator)}</td>
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
                  <th className="py-2 px-2 text-right font-medium">Total da opção</th>
                </tr>
              </thead>
              <tbody>
                {r.linhas
                  .filter((l) => l.linha.grupoOpcao === g.grupo)
                  .map((l, i) => {
                    return (
                      <LinhaDoc
                        key={l.linha.id}
                        l={l}
                        rotulo={`Opção ${String.fromCharCode(65 + i)}`}
                        precoUnit={precoUnit(l)}
                        total={totalLinha(l)}
                        imagem={imagemDe(l)}
                        alternativas={alternativasDe(l)}
                      />
                    );
                  })}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-cinza">
              Valores sem IVA. O total do orçamento, com cada opção, está no fim.
            </p>
          </section>
        ))}

        <div className="mt-6 ml-auto w-full max-w-xs space-y-1 text-sm">
          {gruposAbertos.length > 0 ? (
            <TotaisComOpcoes
              grupos={gruposAbertos}
              base={linhasTabela.length > 0 || r.vendaCriacao > 0 ? r.total * fator : 0}
              fator={fator}
              iva={p.iva}
            />
          ) : (
            <>
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
        {(e.condicoes || (pecasDoCliente && e.condicoesPecasCliente)) && (
          <section className="mt-8 break-before-auto">
            <h2 className="mb-2 text-xs uppercase tracking-[0.2em] text-mostarda">Termos e condições</h2>
            <Condicoes texto={[pecasDoCliente ? e.condicoesPecasCliente : "", e.condicoes].filter(Boolean).join("\n\n")} />
          </section>
        )}

        <footer className="mt-12 border-t border-linha pt-3 text-center text-[8pt] tracking-[0.3em] text-cinza uppercase">
          creative hands
        </footer>
      </article>
    </>
  );
}

function LinhaDoc({
  l,
  rotulo,
  precoUnit,
  total,
  totalOrcamento,
  imagem,
  alternativas,
}: {
  l: ResultadoLinha;
  rotulo?: string;
  precoUnit: number;
  total: number;
  totalOrcamento?: number;
  imagem?: string;
  alternativas?: { quantidade: number; precoUnit: number; total: number }[];
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
        {l.linha.artigoDoCliente && <div className="text-xs text-cinza">Peça fornecida pelo cliente</div>}
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
      <td className="py-3 px-2 text-right tabular-nums">{euros(precoUnit)}</td>
      <td className="py-3 px-2 text-right tabular-nums">{euros(total)}</td>
      {totalOrcamento != null && <td className="py-3 pl-2 text-right font-medium tabular-nums">{euros(totalOrcamento)}</td>}
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

/**
 * Total do orçamento com cada opção, no fim do documento. Os artigos sem opção
 * aparecem à parte, para se ver de onde vem cada total.
 */
function TotaisComOpcoes({ grupos, base, fator, iva }: { grupos: GrupoOpcoes[]; base: number; fator: number; iva: number }) {
  return (
    <div className="w-full">
      <div className="mb-1 text-xs uppercase tracking-[0.2em] text-mostarda">Total do orçamento</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-cinza">
            <th />
            <th className="py-1 text-right font-medium">s/ IVA</th>
            <th className="py-1 pl-3 text-right font-medium">c/ IVA</th>
          </tr>
        </thead>
        <tbody>
          {base > 0 && (
            <tr className="text-cinza">
              <td className="py-1">Artigos sem opção</td>
              <td className="py-1 text-right tabular-nums">{euros(base)}</td>
              <td className="py-1 pl-3 text-right tabular-nums">{euros(base * (1 + iva))}</td>
            </tr>
          )}
          {grupos.map((g) =>
            g.opcoes.map((x, i) => (
              <tr key={x.linhaId} className="border-t border-linha font-medium">
                <td className="py-1.5">
                  {grupos.length > 1 ? `${g.grupo}: ` : ""}com a Opção {String.fromCharCode(65 + i)}
                  {base > 0 && <span className="font-normal text-cinza"> (artigos + opção)</span>}
                </td>
                <td className="py-1.5 text-right tabular-nums">{euros(x.totalComBase * fator)}</td>
                <td className="py-1.5 pl-3 text-right tabular-nums">{euros(x.totalComBase * fator * (1 + iva))}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}
