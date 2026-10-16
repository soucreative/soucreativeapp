import type { Artigo, AjusteVariante } from "./types";

/**
 * Variantes de cor e tamanho do mesmo modelo.
 *
 * No TOC cada cor e cada tamanho é um artigo (é o código que se fatura e se
 * encomenda). Para orçamentar, juntam-se num modelo: escolhe-se o modelo e
 * reparte-se a quantidade por cores e tamanhos.
 *
 * O agrupamento sai do código do TOC, que segue Família-Modelo-…_Fornecedor
 * (Sweat-K474-XL-RoyBl_TT). Nos códigos de 8 dígitos os 5 primeiros são o
 * modelo e os 3 últimos a cor (Bone-88100342 = Boné Buffalo cinzento). Mulher
 * e criança são cortes diferentes, por isso ficam em modelos à parte. O que a
 * regra não apanhar corrige-se à mão na página dos artigos.
 */

export interface Variante {
  artigo: Artigo;
  cor: string;
  tamanho: string;
}

export interface Modelo {
  id: string; // "modelo:<chave>"
  nome: string;
  codigo: string; // referência do fornecedor no código do TOC (K474, 88100…)
  categoria: string;
  variantes: Variante[];
  cores: string[];
  tamanhos: string[];
  custoMin: number;
  custoMax: number;
}

const ORDEM_TAMANHOS = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL", "4XL", "5XL", "6XL"];
const TAMANHO_NO_FIM = new RegExp(`\\s+(${ORDEM_TAMANHOS.join("|")})$`, "i");

/** Ordena tamanhos: idades de criança primeiro, depois XS…5XL, depois o resto. */
export function compararTamanhos(a: string, b: string): number {
  const idade = (t: string) => {
    const m = t.match(/^(\d+)/);
    return /anos|^\d+[-/]\d+a?$/i.test(t) && m ? Number(m[1]) : null;
  };
  const ia = idade(a);
  const ib = idade(b);
  if (ia != null || ib != null) return ia == null ? 1 : ib == null ? -1 : ia - ib;
  const pa = ORDEM_TAMANHOS.indexOf(a.toUpperCase());
  const pb = ORDEM_TAMANHOS.indexOf(b.toUpperCase());
  if (pa >= 0 || pb >= 0) return pa < 0 ? 1 : pb < 0 ? -1 : pa - pb;
  return a.localeCompare(b, "pt", { numeric: true });
}

/** Tamanho escrito no nome ("tamanho XL", "5-6 anos", "tamanho único", "Branca L"). */
function tamanhoDoNome(nome: string): string {
  const t =
    nome.match(/tamanho\s+([^,]+?)\s*(?:,|$)/i)?.[1] ??
    nome.match(/(\d+\s*[-/]\s*\d+\s*anos)/i)?.[1] ??
    nome.trim().match(TAMANHO_NO_FIM)?.[1]?.toUpperCase();
  if (!t) return "";
  return /único/i.test(t) ? "Único" : t.replace(/\s+/g, " ").trim();
}

/** Nome sem o tamanho e sem pontuação solta no fim. */
function semTamanho(nome: string): string {
  return nome
    .replace(/,?\s*tamanho\s+[^,]+/i, "")
    .replace(/,?\s*\d+\s*[-/]\s*\d+\s*anos/i, "")
    .trim()
    .replace(TAMANHO_NO_FIM, "")
    .replace(/[\s,]+$/, "")
    .trim();
}

/** Chave do modelo a partir do código do TOC, ou null se o código não tem variantes. */
export function chaveModelo(a: Artigo): string | null {
  if (!a.id.startsWith("toc:")) return null;
  const codigo = a.id.slice(4);
  const fornecedor = codigo.includes("_") ? codigo.slice(codigo.lastIndexOf("_") + 1) : "";
  const partes = (fornecedor ? codigo.slice(0, codigo.lastIndexOf("_")) : codigo).split("-");
  if (partes.length < 3) return null;
  const familia = partes[0];
  const ref = /^\d{8}$/.test(partes[1]) ? partes[1].slice(0, 5) : partes[1];
  const corte = /\bmulher\b/i.test(a.nome) ? "mulher" : /\bcriança\b/i.test(a.nome) ? "crianca" : "";
  return [familia, ref, corte, fornecedor].filter(Boolean).join("-").toLowerCase();
}

/** Palavras iniciais comuns a todos os nomes. */
function prefixoComum(nomes: string[]): string {
  const listas = nomes.map((n) => n.split(/\s+/));
  const comum: string[] = [];
  for (let i = 0; i < listas[0].length; i++) {
    const p = listas[0][i];
    if (listas.every((l) => l[i]?.toLowerCase() === p.toLowerCase())) comum.push(p);
    else break;
  }
  return comum.join(" ").replace(/[\s,]+$/, "");
}

export function agruparVariantes(
  artigos: Artigo[],
  ajustes: Record<string, AjusteVariante> = {},
): {
  modelos: Modelo[];
  modeloDe: Map<string, Modelo>; // id do artigo → modelo
} {
  // Um artigo posto à mão num modelo com o nome de um modelo automático junta-se
  // a esse modelo; com outro nome, forma um modelo novo.
  const temManuais = Object.values(ajustes).some((aj) => typeof aj.modelo === "string");
  const automaticos = new Map<string, string>();
  if (temManuais) {
    const semManuais = Object.fromEntries(Object.entries(ajustes).filter(([, aj]) => typeof aj.modelo !== "string"));
    for (const m of agruparVariantes(artigos, semManuais).modelos) {
      if (!m.id.startsWith("modelo:manual-")) automaticos.set(m.nome.toLowerCase(), m.id.slice("modelo:".length));
    }
  }
  const chaveManual = (nome: string) => automaticos.get(nome.trim().toLowerCase()) ?? `manual-${nome.trim().toLowerCase()}`;

  const grupos = new Map<string, Artigo[]>();
  for (const a of artigos) {
    const aj = ajustes[a.id];
    const chave = aj?.modelo === null ? null : aj?.modelo ? chaveManual(aj.modelo) : chaveModelo(a);
    if (!chave) continue;
    grupos.set(chave, [...(grupos.get(chave) ?? []), a]);
  }

  const modelos: Modelo[] = [];
  const modeloDe = new Map<string, Modelo>();
  for (const [chave, membros] of grupos) {
    if (membros.length < 2) continue;
    const manual = chave.startsWith("manual-");
    const base = membros.map((a) => semTamanho(a.nome));
    const comum = prefixoComum(base);
    const codigo = manual ? "" : (chave.split("-")[1] ?? "").toUpperCase();

    // O que sobra do nome depois das palavras comuns é a cor, menos as palavras
    // que aparecem em todas (oversize, Regent…), que são do modelo
    const restos = base.map((b) =>
      b
        .slice(comum.length)
        .replace(/\b(mulher|homem|criança|adulto|cor)\b/gi, " ")
        .replace(/,/g, " ")
        .split(/\s+/)
        .filter(Boolean),
    );
    const contagem = new Map<string, number>();
    for (const r of restos) for (const p of new Set(r.map((x) => x.toLowerCase()))) contagem.set(p, (contagem.get(p) ?? 0) + 1);
    const minimo = membros.length;
    const doModelo = new Set([...contagem].filter(([, n]) => n >= minimo).map(([p]) => p));
    const extra = [...new Set((restos.find((r) => r.some((p) => doModelo.has(p.toLowerCase()))) ?? []).filter((p) => doModelo.has(p.toLowerCase())))];

    let nome = manual ? ajustes[membros[0].id]!.modelo!.trim() : [comum, ...extra].filter(Boolean).join(" ") || base[0];
    if (!manual && nome.split(/\s+/).length < 2 && codigo) nome = `${nome} ${codigo}`;

    const variantes = membros.map((a, i) => {
      const aj = ajustes[a.id];
      const resto = restos[i].filter((p) => !doModelo.has(p.toLowerCase())).join(" ");
      const cor = resto ? resto.charAt(0).toUpperCase() + resto.slice(1).toLowerCase() : "";
      return { artigo: a, cor: aj?.cor ?? cor, tamanho: aj?.tamanho ?? tamanhoDoNome(a.nome) };
    });
    const cores = [...new Set(variantes.map((v) => v.cor))].sort((a, b) => a.localeCompare(b, "pt"));
    const tamanhos = [...new Set(variantes.map((v) => v.tamanho))].sort(compararTamanhos);
    variantes.sort((a, b) => a.cor.localeCompare(b.cor, "pt") || compararTamanhos(a.tamanho, b.tamanho));
    const custos = membros.map((a) => a.custo);
    const m: Modelo = {
      id: `modelo:${chave}`,
      nome,
      codigo,
      categoria: membros[0].categoria,
      variantes,
      cores,
      tamanhos,
      custoMin: Math.min(...custos),
      custoMax: Math.max(...custos),
    };
    modelos.push(m);
    for (const a of membros) modeloDe.set(a.id, m);
  }
  modelos.sort((a, b) => a.categoria.localeCompare(b.categoria, "pt") || a.nome.localeCompare(b.nome, "pt"));
  return { modelos, modeloDe };
}

/** Texto curto da repartição: "Royal Blue: S 5 · M 10; Preto: L 3". */
export function descreverGrelha(modelo: Modelo | undefined, grelha: { artigoId: string; quantidade: number }[]): string {
  if (!modelo) return "";
  const porCor = new Map<string, string[]>();
  for (const v of modelo.variantes) {
    const q = grelha.find((g) => g.artigoId === v.artigo.id)?.quantidade ?? 0;
    if (q <= 0) continue;
    porCor.set(v.cor, [...(porCor.get(v.cor) ?? []), v.tamanho ? `${v.tamanho} ${q}` : String(q)]);
  }
  return [...porCor].map(([cor, ts]) => (cor ? `${cor}: ${ts.join(" · ")}` : ts.join(" · "))).join("; ");
}
