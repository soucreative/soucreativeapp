import type { EstadoOrcamento } from "./types";

export const ESTADOS: Record<EstadoOrcamento, { nome: string; classe: string }> = {
  rascunho: { nome: "Rascunho", classe: "bg-linha text-tinta" },
  enviado: { nome: "Enviado", classe: "bg-beige text-tinta" },
  ganho: { nome: "Ganho", classe: "bg-verde text-white" },
  perdido: { nome: "Perdido", classe: "bg-alerta/15 text-alerta" },
};

export const MOTIVOS_PERDA = [
  "Preço",
  "Prazo",
  "Técnica ou acabamento",
  "Quantidade fora do nosso alcance",
  "Cliente desistiu",
  "Sem resposta",
  "Outro",
];
