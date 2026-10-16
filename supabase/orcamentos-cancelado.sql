-- Orçamentos cancelados em vez de apagados (a numeração não fica com buracos)
ALTER TABLE prod_orcamentos DROP CONSTRAINT IF EXISTS prod_orcamentos_estado_check;
ALTER TABLE prod_orcamentos ADD CONSTRAINT prod_orcamentos_estado_check
  CHECK (estado IN ('rascunho', 'enviado', 'ganho', 'perdido', 'cancelado'));
