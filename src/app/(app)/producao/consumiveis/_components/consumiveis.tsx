"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CampoNumero, EtiquetaEstimativa, Titulo } from "@/app/(app)/producao/_components/campos";
import { calcularOrcamento } from "@/lib/producao/engine";
import { euros, eurosFino, numero } from "@/lib/producao/format";
import { atualizarStock, useDados } from "@/app/(app)/producao/_lib/store";
import { EstadoGravacao } from "@/app/(app)/producao/_components/estado-gravacao";

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

  const maquinas = p.maquinas.filter((m) => p.consumiveis.some((c) => c.maquinaId === m.id));

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
                  <th className="num">Preço</th>
                  <th className="w-36 num">Stock atual</th>
                  <th className="w-36 num">Stock mínimo</th>
                  <th className="num">Reservado</th>
                  <th className="num">Fica</th>
                  <th>Estado</th>
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
                          {c.nome} {c.estimativa && <EtiquetaEstimativa />}
                        </td>
                        <td className="num text-cinza">
                          {c.preco < 0.01 ? eurosFino(c.preco) : euros(c.preco)}/{c.unidade}
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
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </section>
        ))}
      </div>
      <p className="mt-4 text-xs text-cinza">
        Os preços e as quantidades gastas por cm² ou por ponto alteram-se nos Parâmetros. O consumo é estimado: convém uma contagem
        física de vez em quando para acertar o stock.
      </p>
    </>
  );
}
