import type { Aplicacao, Orcamento } from "./types";

/**
 * Descobrir sozinho se um grafismo já foi produzido para este cliente.
 *
 * A pergunta no orçamento é "já produzimos este grafismo nesta peça?", e a
 * resposta muda o preço: uma repetição não leva o piso de preço nem o
 * agravamento da peça única, e o setup cai a 25%. Deixá-la à memória de quem
 * orçamenta é pedir que se engane — para cima num cliente fiel, para baixo num
 * trabalho novo.
 *
 * Não há identificador da arte, por isso a comparação é pelos atributos que
 * descrevem o trabalho: mesma peça, mesma técnica, mesma posição e as mesmas
 * medidas. No bordado o número de pontos é quase uma impressão digital; nas
 * técnicas de impressão as medidas são mais fracas, e por isso a interface
 * mostra sempre de que orçamento veio a conclusão, para quem orçamenta poder
 * discordar.
 *
 * Só contam orçamentos **ganhos**: um orçamento enviado e nunca fechado não
 * produziu nada, e cobrar como repetição aquilo que nunca se fez é oferecer
 * trabalho.
 */
export type Repeticao = {
  orcamentoId: string;
  numero: string;
  data: string;
  titulo: string;
};

const texto = (v: string | undefined) => (v ?? "").trim().toLowerCase();
const perto = (a: number | undefined, b: number | undefined) =>
  a == null && b == null ? true : a != null && b != null && Math.abs(a - b) < 0.05;

/** Duas aplicações descrevem o mesmo trabalho? */
export function mesmaAplicacao(a: Aplicacao, b: Aplicacao): boolean {
  if (a.tecnica !== b.tecnica) return false;
  if (texto(a.posicao) !== texto(b.posicao)) return false;

  if (a.tecnica === "bordado") {
    // Pontos e cores saem da digitalização: duas artes diferentes raramente
    // coincidem nos dois ao mesmo tempo
    return a.pontos === b.pontos && a.cores === b.cores;
  }
  return (
    perto(a.larguraCm, b.larguraCm) &&
    perto(a.alturaCm, b.alturaCm) &&
    texto(a.suporte) === texto(b.suporte) &&
    texto(a.complexidadeCorte) === texto(b.complexidadeCorte)
  );
}

export function procurarRepeticao(
  orcamentos: Orcamento[],
  opcoes: {
    clienteId: string | undefined;
    orcamentoAtualId: string;
    artigoId: string | undefined;
    aplicacao: Aplicacao;
  },
): Repeticao | null {
  const { clienteId, orcamentoAtualId, artigoId, aplicacao } = opcoes;
  // Sem cliente não há histórico de quem: dois clientes diferentes podem ter
  // encomendado grafismos parecidos, e a arte de um não serve o outro
  if (!clienteId) return null;

  const anteriores = orcamentos
    .filter((o) => o.id !== orcamentoAtualId && o.clienteId === clienteId && o.estado === "ganho")
    .sort((x, y) => y.data.localeCompare(x.data));

  for (const o of anteriores) {
    for (const linha of o.linhas) {
      // A mesma arte noutra peça é outro trabalho: o bastidor e a prova mudam
      if (artigoId && linha.artigoId && linha.artigoId !== artigoId) continue;
      if (linha.aplicacoes.some((x) => mesmaAplicacao(x, aplicacao))) {
        return { orcamentoId: o.id, numero: o.numero, data: o.data, titulo: o.titulo };
      }
    }
  }
  return null;
}
