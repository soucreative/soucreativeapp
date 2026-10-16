"use client";

import { useMemo, useState } from "react";
import { CampoNumero, Titulo } from "@/app/(app)/producao/_components/campos";
import { EstadoGravacao } from "@/app/(app)/producao/_components/estado-gravacao";
import { ImagemArtigo } from "@/app/(app)/producao/_components/imagem-artigo";
import { apagarArtigo, guardarArtigo, novoId, sincronizarArtigos, useDados } from "@/app/(app)/producao/_lib/store";
import { familiasToc } from "@/app/(app)/producao/actions";
import { dataPt } from "@/lib/producao/format";
import type { Artigo } from "@/lib/producao/types";

const POR_PAGINA = 100;

export default function ListaArtigos() {
  const dados = useDados();
  const [filtro, setFiltro] = useState("");
  const [origem, setOrigem] = useState<"todos" | "toc" | "app">("todos");
  const [categoria, setCategoria] = useState("");
  const [limite, setLimite] = useState(POR_PAGINA);
  const [novo, setNovo] = useState(false);
  const set = (a: Artigo, p: Partial<Artigo>) => guardarArtigo({ ...a, ...p });

  const categorias = useMemo(
    () => [...new Set(dados.artigos.map((a) => a.categoria))].sort((a, b) => a.localeCompare(b, "pt")),
    [dados.artigos],
  );
  const q = filtro.trim().toLowerCase();
  const artigos = [...dados.artigos]
    .filter((a) => origem === "todos" || (origem === "toc") === a.id.startsWith("toc:"))
    .filter((a) => !categoria || a.categoria === categoria)
    .filter((a) => !q || [a.nome, a.categoria, a.fornecedor, a.nota ?? ""].some((t) => t.toLowerCase().includes(q)))
    .sort(
      (a, b) =>
        Number(a.id.startsWith("toc:")) - Number(b.id.startsWith("toc:")) ||
        a.categoria.localeCompare(b.categoria, "pt") ||
        a.nome.localeCompare(b.nome, "pt"),
    );

  return (
    <>
      <Titulo
        sub="Peças em branco (t-shirts, toalhas, canecas…). O custo é sem IVA, tal como vem na fatura do fornecedor."
        acoes={
          <>
            <EstadoGravacao />
            <button className="botao-principal" onClick={() => setNovo(true)}>
              + Novo artigo
            </button>
          </>
        }
      >
        Artigos
      </Titulo>

      {novo && (
        <NovoArtigo
          categorias={categorias}
          aoFechar={() => setNovo(false)}
          aoCriar={() => {
            setOrigem("todos");
            setCategoria("");
            setFiltro("");
            setNovo(false);
          }}
        />
      )}

      <SincronizarToc />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className="campo max-w-xs" placeholder="Procurar nome, código ou fornecedor" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        <select className="campo w-auto" value={origem} onChange={(e) => setOrigem(e.target.value as typeof origem)}>
          <option value="todos">Todas as origens</option>
          <option value="toc">Do TOC</option>
          <option value="app">Provisórios (só na app)</option>
        </select>
        <select className="campo w-auto" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">Todas as famílias</option>
          {categorias.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <span className="ml-auto text-xs text-cinza">{artigos.length} artigos</span>
      </div>

      <div className="cartao overflow-x-auto p-0">
        <table className="tabela">
          <thead>
            <tr>
              <th className="w-14">Imagem</th>
              <th className="w-36">Família</th>
              <th>Artigo</th>
              <th className="w-44">Fornecedor</th>
              <th className="w-28 num">Custo/un</th>
              <th className="w-24 num">Mínimo</th>
              <th className="w-28 num">Portes</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {artigos.slice(0, limite).map((a) => {
              const doToc = a.id.startsWith("toc:");
              return (
                <tr key={a.id}>
                  <td>
                    <ImagemArtigo artigo={a} editavel />
                  </td>
                  <td>
                    <input className="campo" value={a.categoria} disabled={doToc} onChange={(e) => set(a, { categoria: e.target.value })} />
                  </td>
                  <td>
                    <input className="campo" value={a.nome} disabled={doToc} onChange={(e) => set(a, { nome: e.target.value })} />
                    {a.nota && <div className="mt-0.5 text-[11px] text-cinza">{a.nota}</div>}
                  </td>
                  <td>
                    <input className="campo" value={a.fornecedor} onChange={(e) => set(a, { fornecedor: e.target.value })} />
                  </td>
                  <td>
                    <CampoNumero valor={a.custo} aoMudar={(n) => set(a, { custo: n ?? 0 })} sufixo="€" min={0} />
                  </td>
                  <td>
                    <CampoNumero valor={a.minimo} aoMudar={(n) => set(a, { minimo: Math.max(1, Math.round(n ?? 1)) })} min={1} />
                  </td>
                  <td>
                    <CampoNumero valor={a.portes} aoMudar={(n) => set(a, { portes: n ?? 0 })} sufixo="€" min={0} />
                  </td>
                  <td>
                    {doToc ? (
                      <span className="etiqueta bg-verde-claro text-verde" title="Sincronizado do TOC Online">
                        TOC
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                      <span className="etiqueta bg-beige-claro text-mostarda" title="Criado na app; ainda não existe no TOC">
                        Provisório
                      </span>
                      <button
                        className="botao-perigo"
                        title="Apagar artigo"
                        onClick={() => confirm(`Apagar "${a.nome}" do catálogo?`) && apagarArtigo(a.id)}
                      >
                        ✕
                      </button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {artigos.length > limite && (
          <div className="p-3 text-center">
            <button className="botao-secundario" onClick={() => setLimite(limite + POR_PAGINA)}>
              Mostrar mais {Math.min(POR_PAGINA, artigos.length - limite)} de {artigos.length - limite}
            </button>
          </div>
        )}
      </div>
      <p className="mt-3 text-xs text-cinza">
        Um artigo novo fica provisório até ser criado no TOC: quando entrar na sincronização seguinte, apague o provisório.
        Nos artigos do TOC, o nome, a família e o custo vêm do TOC e atualizam-se a cada sincronização; o fornecedor, o mínimo e os
        portes ficam como os deixar aqui. Os portes contam uma vez por fornecedor em cada orçamento. Apagar um artigo não mexe nos
        orçamentos que já o usam.
      </p>
    </>
  );
}

function NovoArtigo({
  categorias,
  aoFechar,
  aoCriar,
}: {
  categorias: string[];
  aoFechar: () => void;
  aoCriar: () => void;
}) {
  const [a, setA] = useState<Artigo>({ id: novoId(), nome: "", categoria: "", fornecedor: "", custo: 0, minimo: 1, portes: 0 });
  const set = (p: Partial<Artigo>) => setA({ ...a, ...p });
  return (
    <section className="cartao mb-4 border-verde/40">
      <h2 className="titulo mb-3 text-lg text-verde">Novo artigo provisório</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <label className="lg:col-span-2">
          <span className="rotulo">Nome</span>
          <input className="campo" autoFocus value={a.nome} onChange={(e) => set({ nome: e.target.value })} placeholder="ex.: Toalha 50×100 algodão 500g" />
        </label>
        <label>
          <span className="rotulo">Família</span>
          <input className="campo" list="familias-artigos" value={a.categoria} onChange={(e) => set({ categoria: e.target.value })} placeholder="ex.: Toalhas" />
          <datalist id="familias-artigos">
            {categorias.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label>
          <span className="rotulo">Fornecedor</span>
          <input className="campo" value={a.fornecedor} onChange={(e) => set({ fornecedor: e.target.value })} />
        </label>
        <label>
          <span className="rotulo">Custo/un (sem IVA)</span>
          <CampoNumero valor={a.custo} aoMudar={(n) => set({ custo: n ?? 0 })} sufixo="€" min={0} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className="rotulo">Mínimo</span>
            <CampoNumero valor={a.minimo} aoMudar={(n) => set({ minimo: Math.max(1, Math.round(n ?? 1)) })} min={1} />
          </label>
          <label>
            <span className="rotulo">Portes</span>
            <CampoNumero valor={a.portes} aoMudar={(n) => set({ portes: n ?? 0 })} sufixo="€" min={0} />
          </label>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          className="botao-principal"
          disabled={!a.nome.trim()}
          onClick={() => {
            guardarArtigo({ ...a, nome: a.nome.trim(), categoria: a.categoria.trim() || "Outro", nota: "Provisório: criar no TOC quando for faturado" });
            aoCriar();
          }}
        >
          Criar artigo
        </button>
        <button className="botao-secundario" onClick={aoFechar}>
          Cancelar
        </button>
      </div>
    </section>
  );
}

function SincronizarToc() {
  const p = useDados().parametros;
  const [aberto, setAberto] = useState(false);
  const [familias, setFamilias] = useState<{ nome: string; produtos: number }[] | null>(null);
  const [escolhidas, setEscolhidas] = useState<string[]>(p.tocFamiliasArtigos ?? []);
  const [estado, setEstado] = useState<{ aCorrer: boolean; texto?: string; erro?: boolean }>({ aCorrer: false });
  const [apagarOutros, setApagarOutros] = useState(false);

  const abrir = async () => {
    setAberto(true);
    if (familias) return;
    setEstado({ aCorrer: true, texto: "A ler as famílias do TOC…" });
    const r = await familiasToc();
    if (r.ok) {
      setFamilias(r.valor);
      setEstado({ aCorrer: false });
    } else setEstado({ aCorrer: false, texto: r.erro, erro: true });
  };

  const sincronizar = async () => {
    setEstado({ aCorrer: true, texto: "A sincronizar…" });
    if (apagarOutros && !confirm("Apagar do catálogo todos os artigos que não vêm do TOC? Os orçamentos já feitos não mudam.")) {
      setEstado({ aCorrer: false });
      return;
    }
    const r = await sincronizarArtigos(escolhidas, apagarOutros);
    setEstado(
      r
        ? { aCorrer: false, texto: `Feito: ${r.novos} artigos novos, ${r.atualizados} atualizados, ${r.removidos} retirados.` }
        : { aCorrer: false, texto: "Não foi possível sincronizar. Veja o aviso no topo.", erro: true },
    );
  };

  const total = (familias ?? []).filter((f) => escolhidas.includes(f.nome)).reduce((s, f) => s + f.produtos, 0);

  return (
    <section className="cartao mb-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h2 className="titulo text-lg text-verde">Artigos do TOC Online</h2>
          <p className="text-xs text-cinza">
            {p.tocUltimaSincronizacao
              ? `Última sincronização: ${dataPt(p.tocUltimaSincronizacao)} às ${new Date(p.tocUltimaSincronizacao).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}.`
              : "Ainda não sincronizado."}{" "}
            Entram só os produtos ativos das famílias escolhidas.
          </p>
        </div>
        {!aberto ? (
          <button className="botao-secundario" onClick={() => void abrir()}>
            Escolher famílias e sincronizar
          </button>
        ) : (
          <button className="botao-principal" disabled={estado.aCorrer || !escolhidas.length} onClick={() => void sincronizar()}>
            Sincronizar {total ? `${total} produtos` : ""}
          </button>
        )}
      </div>
      {estado.texto && <p className={`mt-2 text-sm ${estado.erro ? "text-alerta" : "text-verde"}`}>{estado.texto}</p>}
      {aberto && familias && (
        <div className="mt-3 border-t border-linha pt-3">
          <label className="mb-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--color-verde)]"
              checked={apagarOutros}
              onChange={(e) => setApagarOutros(e.target.checked)}
            />
            Apagar os artigos que não vêm do TOC (criados na app)
          </label>
          <div className="mb-2 flex gap-3 text-xs">
            <button className="text-verde hover:underline" onClick={() => setEscolhidas(familias.map((f) => f.nome))}>
              Marcar todas
            </button>
            <button className="text-verde hover:underline" onClick={() => setEscolhidas([])}>
              Desmarcar todas
            </button>
          </div>
          <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-4">
            {familias.map((f) => (
              <label key={f.nome} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--color-verde)]"
                  checked={escolhidas.includes(f.nome)}
                  onChange={(e) =>
                    setEscolhidas(e.target.checked ? [...escolhidas, f.nome] : escolhidas.filter((x) => x !== f.nome))
                  }
                />
                {f.nome} <span className="text-xs text-cinza">{f.produtos}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
