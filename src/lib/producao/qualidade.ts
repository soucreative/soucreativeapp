import type { ControloQualidade, Orcamento, RespostaQualidade } from "./types";

/**
 * Controlo de qualidade antes de um trabalho passar a pronto para entrega.
 * Curto de propósito: seis perguntas que se respondem com um clique. As que
 * nem sempre se aplicam (etiqueta SOU, bolsas) têm "não se aplica".
 */
export interface PerguntaQualidade {
  id: string;
  texto: string;
  ajuda: string;
  podeNaoAplicar: boolean;
  // Se nenhum artigo do trabalho corresponder, começa como "não se aplica"
  aplicaSe?: RegExp;
}

export const PERGUNTAS_QUALIDADE: PerguntaQualidade[] = [
  {
    id: "folha",
    texto: "Confere com a folha de obra",
    ajuda: "Artigos, quantidades, cores, tamanhos e posições como o cliente encomendou",
    podeNaoAplicar: false,
  },
  {
    id: "limpo",
    texto: "Peças limpas",
    ajuda: "Sem nódoas, manchas, marcas da prensa nem pó",
    podeNaoAplicar: false,
  },
  {
    id: "personalizacao",
    texto: "Personalização bem feita",
    ajuda: "Estampagem ou bordado nítido, centrado, bem fixo e nas cores certas",
    podeNaoAplicar: false,
  },
  {
    id: "verso",
    texto: "Nada se vê do avesso",
    ajuda: "A etiqueta ou o que está impresso no verso não se vê por fora",
    podeNaoAplicar: false,
  },
  {
    id: "etiqueta_sou",
    texto: "Etiqueta SOU",
    ajuda: "Produto SOU: tem a etiqueta SOU colocada como está nos requisitos",
    podeNaoAplicar: true,
    aplicaSe: /\bSOU\b/,
  },
  {
    id: "bolsa",
    texto: "Bolsas: frente certa",
    ajuda: "A estampagem está na frente, com a bolsa a abrir da esquerda para a direita",
    podeNaoAplicar: true,
    aplicaSe: /bolsa|n[eé]cessaire|estojo/i,
  },
];

/** Respostas de partida: "não se aplica" onde nenhum artigo do trabalho corresponde. */
export function respostasIniciais(o: Orcamento, nomesArtigos: string[]): Record<string, RespostaQualidade> {
  const textos = [...o.linhas.map((l) => l.descricao), ...nomesArtigos].join(" \n ");
  const r: Record<string, RespostaQualidade> = {};
  for (const p of PERGUNTAS_QUALIDADE) if (p.podeNaoAplicar && p.aplicaSe && !p.aplicaSe.test(textos)) r[p.id] = "na";
  return r;
}

/** Aprovado: todas respondidas, nenhuma com falha. */
export function qualidadeAprovada(cq: ControloQualidade | undefined): boolean {
  if (!cq) return false;
  return PERGUNTAS_QUALIDADE.every((p) => {
    const v = cq.respostas[p.id];
    return v === "ok" || (v === "na" && p.podeNaoAplicar);
  });
}
