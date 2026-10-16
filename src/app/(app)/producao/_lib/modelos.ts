"use client";

import { useMemo } from "react";
import { useDados } from "@/app/(app)/producao/_lib/store";
import { agruparVariantes } from "@/lib/producao/variantes";

/** Modelos com variantes de cor e tamanho, a partir do catálogo e dos ajustes à mão. */
export function useModelos() {
  const { artigos, parametros } = useDados();
  const ajustes = parametros.ajustesVariantes;
  return useMemo(() => agruparVariantes(artigos, ajustes), [artigos, ajustes]);
}
