import type { LinhaOrcamento } from "./types";

/**
 * Copiar um artigo do orçamento, logo a seguir ao original.
 *
 * O caso que isto resolve é querer o mesmo boné com outra técnica: copia-se e
 * troca-se só a aplicação, em vez de voltar a escolher artigo, custo,
 * fornecedor, portes e quantidade.
 *
 * `comoOpcao` põe os dois no mesmo grupo, que é o que faz deles alternativas
 * entre si em vez de duas linhas a somar no total.
 *
 * Tudo leva id novo — a linha e cada aplicação. Partilhar ids faria as duas
 * linhas mexerem-se ao mesmo tempo quando se editasse uma, que é precisamente
 * o contrário do que se quer ao duplicar.
 */
export function duplicarLinha(
  linhas: LinhaOrcamento[],
  id: string,
  comoOpcao: boolean,
  novoId: () => string,
): LinhaOrcamento[] {
  const i = linhas.findIndex((x) => x.id === id);
  if (i < 0) return linhas;

  const base = linhas[i];
  // O nome do grupo parte da descrição para o cliente perceber do que são
  // alternativas; sem descrição fica o genérico
  const grupo = comoOpcao ? base.grupoOpcao || base.descricao.trim() || "Opção" : base.grupoOpcao;

  const copia: LinhaOrcamento = {
    ...structuredClone(base),
    id: novoId(),
    grupoOpcao: grupo,
    aplicacoes: base.aplicacoes.map((a) => ({ ...structuredClone(a), id: novoId() })),
  };
  // Duplicar como opção arrasta o original para o grupo: uma alternativa
  // sozinha não é alternativa nenhuma
  const original = comoOpcao ? { ...base, grupoOpcao: grupo } : base;

  return [...linhas.slice(0, i), original, copia, ...linhas.slice(i + 1)];
}
