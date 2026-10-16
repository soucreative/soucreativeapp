"use client";

import type { ReactNode } from "react";
import { CampoNumero, EtiquetaEstimativa, Interruptor, Rotulado, Titulo } from "@/app/(app)/producao/_components/campos";
import {
  amortizacaoAnual,
  custoAnualPessoa,
  custoHoraMaquina,
  custoHoraPessoa,
  fseAnual,
  horasFaturaveisPorPessoa,
  NOME_SETUP,
  NOME_TECNICA,
  quotaFseHora,
  tipoClienteDe,
  usaRegisto,
} from "@/lib/producao/engine";
import { euros, eurosFino, numero, percent } from "@/lib/producao/format";
import { atualizarParametros, novoId, reporParametros, useDados } from "@/app/(app)/producao/_lib/store";
import { EstadoGravacao } from "@/app/(app)/producao/_components/estado-gravacao";
import type { TipoSetup } from "@/lib/producao/types";

const NOMES_K: Record<string, string> = {
  cmykMlCm2: "Tinta CMYK (ml/cm² a 100%)",
  brancoMlCm2: "Tinta branca (ml/cm² a 100%)",
  pretratMlCm2: "Pré-tratamento (ml/cm²)",
  impressaoMinA4Clara: "Impressão A4, peça clara (min)",
  impressaoMinA4Escura: "Impressão A4, peça escura (min)",
  impressaoMinA4: "Impressão A4 (min)",
  curaMin: "Cura (min)",
  pretratOperadorMin: "Pré-tratar, operador (min)",
  filmeFator: "Filme gasto ÷ área do desenho",
  poGCm2: "Pó adesivo (g/cm²)",
  prensaMin: "Prensa (min)",
  tintaMlCm2: "Tinta (ml/cm² a 100%)",
  papelFator: "Papel gasto ÷ área do desenho",
  prensaMinTexteis: "Prensa têxtil (min)",
  prensaMinCaneca: "Prensa caneca (min)",
  prensaMinRigido: "Prensa rígido (min)",
  pontosMinuto: "Pontos por minuto (efetivo)",
  trocaCorMin: "Troca de cor (min)",
  linhaMPor1000: "Linha (m por 1000 pontos)",
  entretelaFator: "Entretela ÷ área do desenho",
  pontosPorCm2: "Pontos por cm² (para estimar)",
  atencaoOperadorPct: "Operador preso à máquina (0 a 1)",
  paraleloAPartirDe: "2 máquinas a partir de (peças)",
  vinilFator: "Vinil gasto ÷ área do desenho",
  corteMinPor100cm2: "Corte (min por 100 cm²)",
  descasqueMinSimples: "Descasque simples (min/100 cm²)",
  descasqueMinMedio: "Descasque médio (min/100 cm²)",
  descasqueMinComplexo: "Descasque complexo (min/100 cm²)",
};

export default function EditorParametros() {
  const p = useDados().parametros;
  // Os parâmetros são um único documento: cada alteração grava-o inteiro.
  const mudar = atualizarParametros;
  const horasPessoa = horasFaturaveisPorPessoa(p);
  const margemRef = tipoClienteDe(p, "empresa").margemPersonalizacao;

  return (
    <>
      <Titulo
        sub="Tudo o que muda o preço vive aqui. Os campos a amarelo são estimativas de partida, a substituir pelos valores reais."
        acoes={
          <>
          <EstadoGravacao forcar={() => atualizarParametros(() => {})} />
          <button
            className="botao-perigo"
            onClick={() => confirm("Repor todos os parâmetros nos valores de partida? Perde as alterações feitas.") && void reporParametros()}
          >
            Repor valores de partida
          </button>
          </>
        }
      >
        Parâmetros
      </Titulo>

      <div className="space-y-6">
        <Seccao titulo="Pessoas e preço da hora">
          <div className="grid gap-4 lg:grid-cols-2">
            {p.pessoas.map((pe, i) => {
              const custoH = custoHoraPessoa(p, pe.id);
              const registo = pe.registo;
              const doRegisto = usaRegisto(pe);
              const manual = !doRegisto;
              return (
                <div key={pe.id} className="rounded-lg border border-linha p-4">
                  <h3 className="mb-3 font-medium">{pe.nome}</h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <Rotulado rotulo="Como se conta">
                      <select
                        className="campo"
                        value={pe.modo}
                        onChange={(e) => mudar((d) => void (d.pessoas[i].modo = e.target.value as typeof pe.modo))}
                      >
                        <option value="colaboradores">Colaboradores registados</option>
                        <option value="ordenado">À mão: ordenado + encargos</option>
                        <option value="custo_total">À mão: custo total mensal</option>
                      </select>
                    </Rotulado>
                    <Rotulado rotulo="Preço de venda/hora">
                      <CampoNumero valor={pe.precoVendaHora} sufixo="€" aoMudar={(n) => mudar((d) => void (d.pessoas[i].precoVendaHora = n ?? 0))} />
                    </Rotulado>
                  </div>

                  {pe.modo === "colaboradores" && (
                    <div className="mt-3 rounded-md bg-papel p-3 text-sm">
                      {registo && registo.pessoas.length > 0 ? (
                        <>
                          <ul className="space-y-0.5">
                            {registo.pessoas.map((c) => (
                              <li key={c.nome} className="flex justify-between gap-3">
                                <span>
                                  {c.nome}
                                  {c.fte < 1 && <span className="text-cinza"> · {percent(c.fte)} do tempo</span>}
                                </span>
                                <span className="tabular-nums text-cinza">{euros(c.custoAnual)}/ano</span>
                              </li>
                            ))}
                          </ul>
                          <p className="mt-2 text-xs text-cinza">
                            Colaboradores ativos em {registo.departamento}: custo dos próximos 12 meses com o salário atual (TSU,
                            subsídios e subsídio de alimentação), como na Remuneração.
                          </p>
                        </>
                      ) : (
                        <p className="text-mostarda">
                          Não há colaboradores ativos em {registo?.departamento ?? "este departamento"} com remuneração registada. Enquanto
                          não houver, contam os valores à mão abaixo.
                        </p>
                      )}
                    </div>
                  )}

                  {manual && (
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <Rotulado rotulo={pe.modo === "custo_total" ? "Custo total mensal" : "Ordenado base mensal"}>
                      <CampoNumero valor={pe.valorMensal} sufixo="€" aoMudar={(n) => mudar((d) => void (d.pessoas[i].valorMensal = n ?? 0))} />
                    </Rotulado>
                    <Rotulado rotulo="Nº de meses">
                      <CampoNumero valor={pe.meses} aoMudar={(n) => mudar((d) => void (d.pessoas[i].meses = n ?? 12))} />
                    </Rotulado>
                    {pe.modo !== "custo_total" && (
                      <>
                        <Rotulado rotulo="TSU + seguro">
                          <CampoNumero valor={pe.encargosPct} percentagem aoMudar={(n) => mudar((d) => void (d.pessoas[i].encargosPct = n ?? 0))} />
                        </Rotulado>
                        <Rotulado rotulo="Subsídio de alimentação/ano">
                          <CampoNumero valor={pe.subsidioAnual} sufixo="€" aoMudar={(n) => mudar((d) => void (d.pessoas[i].subsidioAnual = n ?? 0))} />
                        </Rotulado>
                      </>
                    )}
                    <Rotulado rotulo="Outros custos/ano">
                      <CampoNumero valor={pe.outrosAnual} sufixo="€" aoMudar={(n) => mudar((d) => void (d.pessoas[i].outrosAnual = n ?? 0))} />
                    </Rotulado>
                    <Rotulado rotulo="Tempo na produção">
                      <CampoNumero valor={pe.pctProducao} percentagem aoMudar={(n) => mudar((d) => void (d.pessoas[i].pctProducao = n ?? 1))} />
                    </Rotulado>
                  </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-x-5 text-sm">
                    <span>Custo anual {euros(custoAnualPessoa(pe))}</span>
                    <span>
                      Custo/hora <b>{euros(custoH)}</b>
                    </span>
                    <span className={pe.precoVendaHora < custoH ? "text-alerta" : "text-verde"}>
                      Margem da hora {percent(pe.precoVendaHora > 0 ? (pe.precoVendaHora - custoH) / pe.precoVendaHora : 0)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Seccao>

        <Seccao titulo="Horas vendáveis">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {(
              [
                ["horasSemana", "Horas/semana", "h"],
                ["semanasAno", "Semanas/ano", ""],
                ["diasFerias", "Dias de férias", ""],
                ["feriados", "Feriados", ""],
                ["horasFormacao", "Formação/ano", "h"],
              ] as const
            ).map(([k, nome, suf]) => (
              <Rotulado key={k} rotulo={nome}>
                <CampoNumero valor={p.horas[k]} sufixo={suf} aoMudar={(n) => mudar((d) => void (d.horas[k] = n ?? 0))} />
              </Rotulado>
            ))}
            <Rotulado rotulo="Absentismo">
              <CampoNumero valor={p.horas.absentismoPct} percentagem aoMudar={(n) => mudar((d) => void (d.horas.absentismoPct = n ?? 0))} />
            </Rotulado>
            <Rotulado rotulo="Produtividade" ajuda="O parâmetro mais sensível">
              <CampoNumero
                valor={p.horas.produtividadePct}
                percentagem
                estimativa
                aoMudar={(n) => mudar((d) => void (d.horas.produtividadePct = n ?? 0))}
              />
            </Rotulado>
          </div>
          <p className="mt-3 text-sm">
            <b>{numero(horasPessoa)} h</b> faturáveis por pessoa e por ano. Atualizar a produtividade com o que o registo de horas mostrar.
          </p>
        </Seccao>

        <Seccao titulo="Nomes individuais">
          <div className="grid max-w-md grid-cols-2 gap-3">
            <Rotulado rotulo="Designer por peça" ajuda="Preparar e verificar cada nome">
              <CampoNumero
                valor={p.nomes?.designerMin}
                sufixo="min"
                estimativa
                aoMudar={(n) => mudar((d) => void (d.nomes = { ...(d.nomes ?? { designerMin: 1, operadorMin: 0.5 }), designerMin: n ?? 0 }))}
              />
            </Rotulado>
            <Rotulado rotulo="Operador por peça" ajuda="Trocar o ficheiro e posicionar">
              <CampoNumero
                valor={p.nomes?.operadorMin}
                sufixo="min"
                estimativa
                aoMudar={(n) => mudar((d) => void (d.nomes = { ...(d.nomes ?? { designerMin: 1, operadorMin: 0.5 }), operadorMin: n ?? 0 }))}
              />
            </Rotulado>
          </div>
          <p className="mt-2 text-xs text-cinza">
            Soma-se a cada peça das técnicas marcadas com &quot;Nomes individuais&quot; no orçamento.
          </p>
        </Seccao>

        <Seccao titulo="Capacidade diária (pipeline)">
          <div className="grid max-w-md grid-cols-2 gap-3">
            <Rotulado rotulo="Horas de máquina por dia útil" ajuda="Por cabeça, em cada máquina">
              <CampoNumero
                valor={p.capacidade?.horasDiaMaquina}
                sufixo="h"
                aoMudar={(n) => mudar((d) => void (d.capacidade = { ...d.capacidade, horasDiaMaquina: n ?? 7 }))}
              />
            </Rotulado>
            <Rotulado rotulo="Horas por pessoa por dia útil" ajuda="Multiplica pelo tempo de cada função">
              <CampoNumero
                valor={p.capacidade?.horasDiaPessoa}
                sufixo="h"
                aoMudar={(n) => mudar((d) => void (d.capacidade = { ...d.capacidade, horasDiaPessoa: n ?? 7 }))}
              />
            </Rotulado>
          </div>
          <p className="mt-2 text-xs text-cinza">
            O pipeline usa estes valores para calcular quando cada trabalho fica pronto. Contam só dias úteis, sem feriados nacionais.
          </p>
        </Seccao>

        <Seccao titulo="Estrutura (FSE imputados à produção)">
          <table className="tabela">
            <thead>
              <tr>
                <th>Rubrica</th>
                <th className="w-36 num">Mensal</th>
                <th className="w-32 num">% produção</th>
                <th className="num">Anual imputado</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {p.fse.map((r, i) => (
                <tr key={r.id}>
                  <td>
                    <input className="campo" value={r.nome} onChange={(e) => mudar((d) => void (d.fse[i].nome = e.target.value))} />
                  </td>
                  <td>
                    <CampoNumero valor={r.mensal} sufixo="€" aoMudar={(n) => mudar((d) => void (d.fse[i].mensal = n ?? 0))} />
                  </td>
                  <td>
                    <CampoNumero valor={r.pctProducao} percentagem aoMudar={(n) => mudar((d) => void (d.fse[i].pctProducao = n ?? 0))} />
                  </td>
                  <td className="num">{euros(r.mensal * 12 * r.pctProducao)}</td>
                  <td>
                    <button className="botao-perigo" onClick={() => mudar((d) => void d.fse.splice(i, 1))}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
            <button className="botao-secundario" onClick={() => mudar((d) => void d.fse.push({ id: novoId(), nome: "Nova rubrica", mensal: 0, pctProducao: 1 }))}>
              + Rubrica
            </button>
            <span>
              Total {euros(fseAnual(p))}/ano · quota de estrutura <b>{euros(quotaFseHora(p))}/h</b>
            </span>
            <span className="text-xs text-cinza">A amortização das máquinas entra no custo/hora de cada máquina, não aqui.</span>
          </div>
        </Seccao>

        <Seccao titulo="Máquinas: custo por hora e aluguer">
          <table className="tabela">
            <thead>
              <tr>
                <th>Máquina</th>
                <th className="w-32 num">Valor</th>
                <th className="w-24 num">Vida (anos)</th>
                <th className="w-32 num">Manutenção/ano</th>
                <th className="w-28 num">Horas uso/ano</th>
                <th className="w-28 num">Energia/h</th>
                <th className="num">Amortização/ano</th>
                <th className="num">Custo/h</th>
                <th className="num" title={`Custo/h com a margem de personalização de Empresa (${percent(margemRef)}), sem operador`}>
                  Aluguer/h sugerido
                </th>
                <th>Estimativa</th>
                <th title="Desligado: a máquina ainda não chegou e não entra nos orçamentos nem no pipeline">Já na SOU</th>
              </tr>
            </thead>
            <tbody>
              {p.maquinas.map((m, i) => {
                const ch = custoHoraMaquina(m);
                return (
                  <tr key={m.id}>
                    <td>
                      <input className="campo" value={m.nome} onChange={(e) => mudar((d) => void (d.maquinas[i].nome = e.target.value))} />
                      {m.nota && <div className="mt-1 text-xs text-cinza">{m.nota}</div>}
                    </td>
                    <td>
                      <CampoNumero valor={m.valor} sufixo="€" aoMudar={(n) => mudar((d) => void (d.maquinas[i].valor = n ?? 0))} />
                    </td>
                    <td>
                      <CampoNumero valor={m.vidaAnos} estimativa={m.estimativa} aoMudar={(n) => mudar((d) => void (d.maquinas[i].vidaAnos = n ?? 1))} />
                    </td>
                    <td>
                      <CampoNumero valor={m.manutencaoAnual} sufixo="€" estimativa={m.estimativa} aoMudar={(n) => mudar((d) => void (d.maquinas[i].manutencaoAnual = n ?? 0))} />
                    </td>
                    <td>
                      <CampoNumero valor={m.horasUsoAno} sufixo="h" estimativa={m.estimativa} aoMudar={(n) => mudar((d) => void (d.maquinas[i].horasUsoAno = n ?? 0))} />
                    </td>
                    <td>
                      <CampoNumero valor={m.energiaHora} sufixo="€" estimativa={m.estimativa} aoMudar={(n) => mudar((d) => void (d.maquinas[i].energiaHora = n ?? 0))} />
                    </td>
                    <td className="num">{euros(amortizacaoAnual(m))}</td>
                    <td className="num font-medium">{euros(ch)}</td>
                    <td className="num">{euros(ch / (1 - margemRef))}</td>
                    <td>
                      <Interruptor ligado={m.estimativa} aoMudar={(v) => mudar((d) => void (d.maquinas[i].estimativa = v))} rotulo="" />
                    </td>
                    <td>
                      <Interruptor ligado={m.disponivel !== false} aoMudar={(v) => mudar((d) => void (d.maquinas[i].disponivel = v))} rotulo="" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-cinza">
            As horas de uso por ano são o valor que mais mexe no custo/hora. O registo de horas e os orçamentos produzidos vão mostrar o uso real.
          </p>
        </Seccao>

        <Seccao titulo="Consumíveis: preço por unidade">
          <table className="tabela">
            <thead>
              <tr>
                <th>Consumível</th>
                <th>Máquina</th>
                <th className="w-44 num">Preço</th>
                <th>Estimativa</th>
              </tr>
            </thead>
            <tbody>
              {p.consumiveis.map((c, i) => (
                <tr key={c.id}>
                  <td>{c.nome}</td>
                  <td className="text-cinza">{p.maquinas.find((m) => m.id === c.maquinaId)?.nome.split(" (")[0]}</td>
                  <td>
                    <CampoNumero
                      valor={c.preco}
                      sufixo={`€/${c.unidade}`}
                      estimativa={c.estimativa}
                      aoMudar={(n) => mudar((d) => void (d.consumiveis[i].preco = n ?? 0))}
                    />
                    <div className="mt-0.5 text-right text-[11px] text-cinza">{eurosFino(c.preco)}</div>
                  </td>
                  <td>
                    <Interruptor ligado={c.estimativa} aoMudar={(v) => mudar((d) => void (d.consumiveis[i].estimativa = v))} rotulo="" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Seccao>

        <Seccao titulo="Técnicas: tempos, consumos e mínimos">
          <div className="grid gap-4 xl:grid-cols-2">
            {p.tecnicas.map((t, i) => (
              <div key={t.tecnica} className="rounded-lg border border-linha p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-medium">{NOME_TECNICA[t.tecnica]}</h3>
                  <Interruptor ligado={t.estimativa} aoMudar={(v) => mudar((d) => void (d.tecnicas[i].estimativa = v))} rotulo="estimativa" />
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Rotulado rotulo="Setup: designer (min)">
                    <CampoNumero valor={t.setupDesignerMin} aoMudar={(n) => mudar((d) => void (d.tecnicas[i].setupDesignerMin = n ?? 0))} />
                  </Rotulado>
                  <Rotulado rotulo="Setup: operador (min)">
                    <CampoNumero valor={t.setupOperadorMin} aoMudar={(n) => mudar((d) => void (d.tecnicas[i].setupOperadorMin = n ?? 0))} />
                  </Rotulado>
                  <Rotulado rotulo="Manuseamento/peça (min)">
                    <CampoNumero valor={t.manuseamentoMin} aoMudar={(n) => mudar((d) => void (d.tecnicas[i].manuseamentoMin = n ?? 0))} />
                  </Rotulado>
                  <Rotulado rotulo="Desperdício">
                    <CampoNumero valor={t.desperdicioPct} percentagem aoMudar={(n) => mudar((d) => void (d.tecnicas[i].desperdicioPct = n ?? 0))} />
                  </Rotulado>
                  <Rotulado rotulo="Mínimo por peça">
                    <CampoNumero valor={t.minimoPorPeca} sufixo="€" aoMudar={(n) => mudar((d) => void (d.tecnicas[i].minimoPorPeca = n ?? 0))} />
                  </Rotulado>
                  <Rotulado rotulo="Área máxima (cm)">
                    <div className="flex gap-1">
                      <CampoNumero valor={t.areaMaxCm[0]} aoMudar={(n) => mudar((d) => void (d.tecnicas[i].areaMaxCm[0] = n ?? 0))} />
                      <CampoNumero valor={t.areaMaxCm[1]} aoMudar={(n) => mudar((d) => void (d.tecnicas[i].areaMaxCm[1] = n ?? 0))} />
                    </div>
                  </Rotulado>
                  {Object.entries(t.k).map(([k, v]) => (
                    <Rotulado key={k} rotulo={NOMES_K[k] ?? k}>
                      <CampoNumero valor={v} estimativa={t.estimativa} aoMudar={(n) => mudar((d) => void (d.tecnicas[i].k[k] = n ?? 0))} />
                    </Rotulado>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 sm:max-w-md">
            {(["simples", "medio", "complexo"] as const).map((c) => (
              <Rotulado key={c} rotulo={`Digitalização ${c === "medio" ? "média" : c === "simples" ? "simples" : "complexa"} (min)`}>
                <CampoNumero valor={p.complexidadeBordado[c]} aoMudar={(n) => mudar((d) => void (d.complexidadeBordado[c] = n ?? 0))} />
              </Rotulado>
            ))}
          </div>
        </Seccao>

        <div className="grid gap-6 lg:grid-cols-2">
          <Seccao titulo="Tipos de cliente: margens">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th className="num">Margem peça</th>
                  <th className="num">Margem personalização</th>
                  <th className="num">Fator hora</th>
                </tr>
              </thead>
              <tbody>
                {p.tiposCliente.map((t, i) => (
                  <tr key={t.id}>
                    <td>
                      {t.nome}
                      <div className="text-xs text-cinza">{t.nota}</div>
                    </td>
                    <td>
                      <CampoNumero valor={t.margemProduto} percentagem aoMudar={(n) => mudar((d) => void (d.tiposCliente[i].margemProduto = n ?? 0))} />
                    </td>
                    <td>
                      <CampoNumero
                        valor={t.margemPersonalizacao}
                        percentagem
                        aoMudar={(n) => mudar((d) => void (d.tiposCliente[i].margemPersonalizacao = n ?? 0))}
                      />
                    </td>
                    <td>
                      <CampoNumero valor={t.fatorHora} aoMudar={(n) => mudar((d) => void (d.tiposCliente[i].fatorHora = n ?? 1))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Seccao>

          <Seccao titulo="Escalões de quantidade">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Escalão</th>
                  <th className="num">Até (un)</th>
                  <th className="num">Desconto na personalização</th>
                </tr>
              </thead>
              <tbody>
                {p.escaloes.map((e, i) => (
                  <tr key={i}>
                    <td>
                      <input className="campo" value={e.nome} onChange={(ev) => mudar((d) => void (d.escaloes[i].nome = ev.target.value))} />
                    </td>
                    <td>
                      <CampoNumero valor={e.ate} aoMudar={(n) => mudar((d) => void (d.escaloes[i].ate = Math.round(n ?? 0)))} />
                    </td>
                    <td>
                      <CampoNumero
                        valor={e.descontoPersonalizacao}
                        percentagem
                        aoMudar={(n) => mudar((d) => void (d.escaloes[i].descontoPersonalizacao = n ?? 0))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 max-w-xs">
              <Rotulado rotulo="Acima disto, subcontratar (un)">
                <CampoNumero valor={p.limiteSubcontratar} aoMudar={(n) => mudar((d) => void (d.limiteSubcontratar = Math.round(n ?? 300)))} />
              </Rotulado>
            </div>
          </Seccao>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Seccao titulo="Tipos de setup (% do setup completo)">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {(Object.keys(p.setups) as TipoSetup[]).map((k) => (
                <Rotulado key={k} rotulo={NOME_SETUP[k]}>
                  <CampoNumero valor={p.setups[k]} percentagem aoMudar={(n) => mudar((d) => void (d.setups[k] = n ?? 0))} />
                </Rotulado>
              ))}
            </div>
            <p className="mt-2 text-xs text-cinza">
              O tipo escolhe-se sozinho pelas três perguntas de cada técnica no orçamento. A repetição nunca é zero: há sempre arranque de máquina e prova.
            </p>
          </Seccao>

          <Seccao titulo="Empresa e documento">
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ["nome", "Nome"],
                  ["nif", "NIF"],
                  ["email", "Email"],
                  ["telefone", "Telefone"],
                  ["site", "Site"],
                ] as const
              ).map(([k, nome]) => (
                <Rotulado key={k} rotulo={nome}>
                  <input className="campo" value={p.empresa[k]} onChange={(e) => mudar((d) => void (d.empresa[k] = e.target.value))} />
                </Rotulado>
              ))}
              <Rotulado rotulo="IVA">
                <CampoNumero valor={p.iva} percentagem aoMudar={(n) => mudar((d) => void (d.iva = n ?? 0))} />
              </Rotulado>
              <Rotulado rotulo="Validade (dias)">
                <CampoNumero valor={p.validadeDias} aoMudar={(n) => mudar((d) => void (d.validadeDias = Math.round(n ?? 30)))} />
              </Rotulado>
              <Rotulado rotulo="Desconto máximo" ajuda="Quanto o preço praticado pode ficar abaixo do sugerido. Para cima não há limite.">
                <CampoNumero valor={p.descontoMaximo ?? 0.05} percentagem aoMudar={(n) => mudar((d) => void (d.descontoMaximo = n ?? 0))} />
              </Rotulado>
              <Rotulado rotulo="Margem de revenda (PVP)" ajuda="Para sugerir o PVP recomendado aos parceiros: a margem que lhes fica sobre o PVP sem IVA.">
                <CampoNumero valor={p.margemRevenda ?? 0.5} percentagem aoMudar={(n) => mudar((d) => void (d.margemRevenda = n ?? 0))} />
              </Rotulado>
              <Rotulado rotulo="Margem segura" ajuda="Um desconto que deixe a margem abaixo disto é assinalado como arriscado.">
                <CampoNumero valor={p.margemSegura ?? 0.3} percentagem aoMudar={(n) => mudar((d) => void (d.margemSegura = n ?? 0))} />
              </Rotulado>
              <Rotulado rotulo="Valor mínimo de encomenda">
                <CampoNumero valor={p.valorMinimoEncomenda} sufixo="€" aoMudar={(n) => mudar((d) => void (d.valorMinimoEncomenda = n ?? 0))} />
              </Rotulado>
            </div>
            <Rotulado rotulo="Morada">
              <textarea className="campo mt-1 min-h-16" value={p.empresa.morada} onChange={(e) => mudar((d) => void (d.empresa.morada = e.target.value))} />
            </Rotulado>
            <Rotulado rotulo="Rodapé do orçamento" ajuda="Entidade legal: nome, NIPC e morada.">
              <input className="campo mt-1" value={p.empresa.rodape ?? ""} onChange={(e) => mudar((d) => void (d.empresa.rodape = e.target.value))} />
            </Rotulado>
            <Rotulado rotulo="Dados para pagamento" ajuda="Saem no orçamento antes dos termos e condições. Uma informação por linha.">
              <textarea
                className="campo mt-1 min-h-28 text-xs"
                value={p.empresa.dadosPagamento ?? ""}
                onChange={(e) => mudar((d) => void (d.empresa.dadosPagamento = e.target.value))}
              />
            </Rotulado>
            <Rotulado rotulo="Termos e condições (saem em todos os orçamentos)" ajuda="Linhas em MAIÚSCULAS são títulos de secção; uma linha em branco separa secções.">
              <textarea
                className="campo mt-1 min-h-64 text-xs"
                value={p.empresa.condicoes}
                onChange={(e) => mudar((d) => void (d.empresa.condicoes = e.target.value))}
              />
            </Rotulado>
            <Rotulado rotulo="Peças fornecidas pelo cliente" ajuda="Só sai nos orçamentos com algum artigo marcado com &quot;O cliente traz a peça&quot;.">
              <textarea
                className="campo mt-1 min-h-32 text-xs"
                value={p.empresa.condicoesPecasCliente ?? ""}
                onChange={(e) => mudar((d) => void (d.empresa.condicoesPecasCliente = e.target.value))}
              />
            </Rotulado>
          </Seccao>
        </div>
      </div>
      <p className="mt-6 flex items-center gap-2 text-xs text-cinza">
        <EtiquetaEstimativa /> Valores de partida do SOU_Calculadora_v27 e estimativas de mercado (out 2026).
      </p>
    </>
  );
}

function Seccao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="cartao overflow-x-auto">
      <h2 className="titulo mb-4 text-lg text-verde">{titulo}</h2>
      {children}
    </section>
  );
}

