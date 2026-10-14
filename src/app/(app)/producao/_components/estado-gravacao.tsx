"use client";

import { descarregar, useErroGravacao, useEstadoGravacao } from "@/app/(app)/producao/_lib/store";

/**
 * Estado das gravações e botão para gravar já. As alterações gravam-se sozinhas
 * meio segundo depois; o botão serve para ter a certeza antes de sair.
 * `forcar` agenda uma gravação mesmo sem alterações, para confirmar que corre.
 */
export function EstadoGravacao({ forcar }: { forcar?: () => void }) {
  const { estado, em } = useEstadoGravacao();
  const erro = useErroGravacao();
  const hora = em ? new Date(em).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }) : null;
  const texto = erro
    ? "Erro ao gravar"
    : estado === "a_gravar"
      ? "A gravar…"
      : estado === "pendente"
        ? "Alterações por gravar"
        : hora
          ? `Gravado às ${hora}`
          : "Tudo gravado";
  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs ${erro ? "text-alerta" : estado === "gravado" ? "text-verde" : "text-mostarda"}`}>{texto}</span>
      <button
        className="botao-principal"
        disabled={estado === "a_gravar"}
        onClick={async () => {
          forcar?.();
          await descarregar();
        }}
      >
        Gravar alterações
      </button>
    </div>
  );
}
