"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CampoNumero, Interruptor, Titulo } from "@/app/(app)/producao/_components/campos";
import { calcularOrcamento, precoConsumivel, CONSUMIVEIS_DO_MOTOR } from "@/lib/producao/engine";
import { eurosFino, numero } from "@/lib/producao/format";
import { atualizarParametros, atualizarStock, novoId, useDados } from "@/app/(app)/producao/_lib/store";
import { EstadoGravacao } from "@/app/(app)/producao/_components/estado-gravacao";
import type { Consumivel, Parametros } from "@/lib/producao/types";

const UNIDADES: Consumivel["unidade"][] = ["ml", "cm²", "g", "m", "un"];

export default function Consumiveis() {
  const dados = useDados();
  const p = dados.parametros;

  // Consumo reservado: orçamentos ganhos que ainda não foram produzidos.
  const { reservado, porProduzir } = useMemo(() => {
    const acc: Record<string, number> = {};
    const lista = dados.orcamentos.filter((o) => o.estado === "ganho" && !o.produzidoEm);
    for (const o of lista) {
      for (const [id, q] of Object.entries(calcularOrcamento(p, o).consumos)) acc[id] = (acc[id] ?? 0) + q;
    }
    return { reservado: acc, porProduzir: lista };
  }, [dados.orcamentos, p]);

  // Todas as máquinas têm secção, mesmo sem consumíveis ainda: é lá que se
  // carrega para acrescentar o primeiro.
  const maquinas = p.maquinas;

  // Os preços vivem aqui, que é onde se olha quando chega uma factura. Os
  // parâmetros leem-nos; não se escrevem nos dois sítios.
  const mexer = (id: string, fn: (c: Parametros["consumiveis"][number]) => void) =>
    atualizarParametros((d) => {
      const c = d.consumiveis.find((x) => x.id === id);
      if (c) fn(c);
    });
  const temEmbalagem = (c: { embalagemPreco?: number; embalagemQtd?: number }) =>
    c.embalagemPreco != null && c.embalagemQtd != null && c.embalagemQtd > 0;

  return (
    <>
      <Titulo acoes={<EstadoGravacao />} sub="Stock por máquina. O consumo dos orçamentos ganhos fica reservado e sai do stock quando a produção é marcada como feita.">
        Consumíveis
      </Titulo>

      {porProduzir.length > 0 && (
        <p className="mb-4 text-sm text-cinza">
          Reservado para {porProduzir.length} {porProduzir.length === 1 ? "orçamento ganho" : "orçamentos ganhos"} por produzir:{" "}
          {porProduzir.map((o, i) => (
            <span key={o.id}>
              {i > 0 && ", "}
              <Link className="text-verde underline" href={`/producao/orcamentos/${o.id}`}>
                {o.numero}
              </Link>
            </span>
          ))}
          .
        </p>
      )}

      <div className="space-y-6">
        {maquinas.map((m) => (
          <section key={m.id} className="cartao overflow-x-auto">
            <h2 className="titulo mb-3 text-lg text-verde">{m.nome}</h2>
            <table className="tabela">
              <thead>
                <tr>
                  <th>Consumível</th>
                  <th className="w-28 num">Embalagem</th>
                  <th className="w-28 num">Traz</th>
                  <th className="w-32 num">Preço/un</th>
                  <th className="w-24 num">Mistura</th>
                  <th className="w-28 num" title="Gasta-se um a cada tantas impressões: o kit, a limpeza, as esponjas">A cada N impr.</th>
                  <th className="w-36 num">Stock atual</th>
                  <th className="w-36 num">Stock mínimo</th>
                  <th className="num">Reservado</th>
                  <th className="num">Fica</th>
                  <th>Estado</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {p.consumiveis
                  .filter((c) => c.maquinaId === m.id)
                  .map((c) => {
                    const res = reservado[c.id] ?? 0;
                    const fica = c.stock != null ? c.stock - res : null;
                    const estado =
                      fica == null
                        ? { t: "sem contagem", cl: "text-cinza" }
                        : fica < 0
                          ? { t: "falta para os ganhos", cl: "text-alerta font-medium" }
                          : c.stockMinimo != null && fica < c.stockMinimo
                            ? { t: "encomendar", cl: "text-mostarda font-medium" }
                            : { t: "ok", cl: "text-verde" };
                    return (
                      <tr key={c.id}>
                        <td>
                          <div className="flex items-center gap-2">
                            <input
                              className="campo flex-1 min-w-40"
                              value={c.nome}
                              onChange={(ev) => mexer(c.id, (x) => void (x.nome = ev.target.value))}
                            />
                            {/* Mudar a unidade não converte o que lá está: os
                                stocks e os consumos por cm² continuam com o
                                número que tinham, agora a querer dizer outra
                                coisa. Daí o aviso. */}
                            <select
                              className="campo w-20"
                              value={c.unidade}
                              title="Mudar a unidade não converte os valores já escritos"
                              onChange={(ev) => mexer(c.id, (x) => void (x.unidade = ev.target.value as Consumivel["unidade"]))}
                            >
                              {UNIDADES.map((u) => (
                                <option key={u} value={u}>
                                  {u}
                                </option>
                              ))}
                            </select>
                            <Interruptor
                              ligado={c.estimativa}
                              aoMudar={(v) => mexer(c.id, (x) => void (x.estimativa = v))}
                              rotulo="estimativa"
                            />
                          </div>
                        </td>
                        <td>
                          <CampoNumero
                            valor={c.embalagemPreco}
                            sufixo="€"
                            vazio
                            min={0}
                            aoMudar={(n) => mexer(c.id, (x) => void (x.embalagemPreco = n))}
                          />
                        </td>
                        <td>
                          <CampoNumero
                            valor={c.embalagemQtd}
                            sufixo={c.unidade}
                            vazio
                            min={0}
                            aoMudar={(n) => mexer(c.id, (x) => void (x.embalagemQtd = n))}
                          />
                        </td>
                        {/* Mexer no preço/un acerta a embalagem, para os dois
                            nunca discordarem sem se saber qual vale */}
                        <td>
                          <CampoNumero
                            valor={precoConsumivel(c)}
                            sufixo={`€/${c.unidade}`}
                            min={0}
                            aoMudar={(n) =>
                              mexer(c.id, (x) => {
                                const novo = n ?? 0;
                                if (temEmbalagem(x)) x.embalagemPreco = novo * (x.embalagemQtd ?? 1);
                                else x.preco = novo;
                              })
                            }
                          />
                        </td>
                        {/* Só os que fazem parte de uma mistura: para os outros
                            um peso não quer dizer nada */}
                        <td>
                          {c.grupoMistura ? (
                            <CampoNumero
                              valor={c.pesoMistura}
                              percentagem
                              vazio
                              min={0}
                              aoMudar={(n) => mexer(c.id, (x) => void (x.pesoMistura = n))}
                            />
                          ) : (
                            <span className="block text-right text-xs text-cinza/50">—</span>
                          )}
                        </td>
                        {/* Desgaste da máquina: gasta-se com o uso e não com o
                            tamanho do trabalho */}
                        <td>
                          <CampoNumero
                            valor={c.aCadaImpressoes}
                            vazio
                            min={0}
                            aoMudar={(n) => mexer(c.id, (x) => void (x.aCadaImpressoes = n))}
                          />
                        </td>
                        <td>
                          <CampoNumero
                            valor={c.stock}
                            vazio
                            min={0}
                            sufixo={c.unidade}
                            aoMudar={(n) => atualizarStock(c.id, n, c.stockMinimo)}
                          />
                        </td>
                        <td>
                          <CampoNumero
                            valor={c.stockMinimo}
                            vazio
                            min={0}
                            sufixo={c.unidade}
                            aoMudar={(n) => atualizarStock(c.id, c.stock, n)}
                          />
                        </td>
                        <td className="num">
                          {numero(res)} {c.unidade}
                        </td>
                        <td className="num">{fica == null ? "—" : `${numero(fica)} ${c.unidade}`}</td>
                        <td className={estado.cl}>{estado.t}</td>
                        <td>
                          <ApagarConsumivel id={c.id} nome={c.nome} temStock={(c.stock ?? 0) > 0 || res > 0} />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            <Misturas consumiveis={p.consumiveis.filter((c) => c.maquinaId === m.id)} />
            <NovoConsumivel maquinaId={m.id} />
          </section>
        ))}
      </div>
      <p className="mt-4 text-xs text-cinza">
        Quanto se gasta por cm² ou por ponto altera-se nos Parâmetros, por técnica. O consumo é estimado: convém uma contagem
        física de vez em quando para acertar o stock.
      </p>
    </>
  );
}


/**
 * Acrescentar um consumível a uma máquina.
 *
 * Fica logo com stock por contar e sem embalagem: o que interessa é tê-lo na
 * lista para se poder contar, e os números entram a seguir na própria linha.
 *
 * Um consumível acrescentado à mão não entra sozinho no custo de nenhuma
 * técnica — para isso é preciso dizer, nos Parâmetros, quanto dele se gasta.
 * Daí o aviso: sem isso fica a contar stock e mais nada.
 */
function NovoConsumivel({ maquinaId }: { maquinaId: string }) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [unidade, setUnidade] = useState<Consumivel["unidade"]>("un");

  if (!aberto) {
    return (
      <button type="button" className="mt-3 text-sm text-cinza underline hover:text-verde" onClick={() => setAberto(true)}>
        + Novo consumível
      </button>
    );
  }

  const criar = () => {
    const n = nome.trim();
    if (!n) return;
    atualizarParametros((d) => {
      d.consumiveis.push({ id: novoId(), nome: n, unidade, preco: 0, maquinaId, estimativa: true });
    });
    setNome("");
    setAberto(false);
  };

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-linha bg-papel/60 p-3">
      <label className="flex-1 min-w-48">
        <span className="rotulo">Nome</span>
        <input
          className="campo"
          autoFocus
          value={nome}
          placeholder="ex.: Tinta de limpeza"
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && criar()}
        />
      </label>
      <label>
        <span className="rotulo">Unidade</span>
        <select className="campo" value={unidade} onChange={(e) => setUnidade(e.target.value as Consumivel["unidade"])}>
          {UNIDADES.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="botao-principal" onClick={criar} disabled={!nome.trim()}>
        Criar
      </button>
      <button type="button" className="px-2 py-1.5 text-sm text-cinza hover:text-tinta" onClick={() => setAberto(false)}>
        Cancelar
      </button>
      <p className="w-full text-xs text-cinza">
        Entra na lista para se contar o stock. Para entrar no custo de uma técnica, é preciso dizer nos Parâmetros quanto dela se gasta.
      </p>
    </div>
  );
}

/**
 * Apagar um consumível.
 *
 * Confirma-se sempre, e avisa-se quando o consumível é um dos que o motor sabe
 * gastar: apagá-lo não dá erro nenhum — o custo dele desaparece em silêncio e
 * todos os orçamentos ficam mais baratos sem que ninguém perceba porquê.
 */
function ApagarConsumivel({ id, nome, temStock }: { id: string; nome: string; temStock: boolean }) {
  const [confirmar, setConfirmar] = useState(false);
  const doMotor = (CONSUMIVEIS_DO_MOTOR as readonly string[]).includes(id);

  if (!confirmar) {
    return (
      <button
        type="button"
        className="p-1 text-cinza/50 transition hover:text-alerta"
        title={`Apagar ${nome}`}
        onClick={() => setConfirmar(true)}
      >
        ✕
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 whitespace-nowrap text-xs">
      <button
        type="button"
        className="rounded px-2 py-1 text-white"
        style={{ background: "var(--color-alerta)" }}
        onClick={() => atualizarParametros((d) => void (d.consumiveis = d.consumiveis.filter((c) => c.id !== id)))}
      >
        Apagar
      </button>
      <button type="button" className="text-cinza hover:text-tinta" onClick={() => setConfirmar(false)}>
        Não
      </button>
      {(doMotor || temStock) && (
        <span className="text-mostarda">
          {doMotor ? "entra no custo das técnicas" : "tem stock contado"}
        </span>
      )}
    </span>
  );
}

/**
 * Resumo de cada mistura: a média ponderada que vai para o custo.
 *
 * Mostra-se porque é um número que ninguém escreve e que manda no preço de
 * todos os orçamentos da técnica. Enquanto os pesos estiverem por preencher,
 * diz-se isso em vez de fingir uma média.
 */
function Misturas({ consumiveis }: { consumiveis: Consumivel[] }) {
  const grupos = [...new Set(consumiveis.map((c) => c.grupoMistura).filter(Boolean))] as string[];
  if (!grupos.length) return null;

  return (
    <div className="mt-3 space-y-1">
      {grupos.map((g) => {
        const membros = consumiveis.filter((c) => c.grupoMistura === g);
        const total = membros.reduce((s, c) => s + (c.pesoMistura ?? 0), 0);
        if (total <= 0) {
          return (
            <p key={g} className="text-xs text-mostarda">
              Mistura <b>{g}</b>: pesos por preencher. Até lá o custo usa a estimativa de sempre.
            </p>
          );
        }
        const media = membros.reduce((s, c) => s + precoConsumivel(c) * ((c.pesoMistura ?? 0) / total), 0);
        return (
          <p key={g} className="text-xs text-cinza">
            Mistura <b>{g}</b>: média ponderada de <b>{eurosFino(media)}</b>/{membros[0].unidade}
            {Math.abs(total - 1) > 0.005 && (
              <span className="text-mostarda"> · os pesos somam {Math.round(total * 100)} %, não 100</span>
            )}
          </p>
        );
      })}
    </div>
  );
}
