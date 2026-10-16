import type { UserRole } from '@/types/database'

// ─── Full-access roles (bypass all checks) ────────────────────────────────

const SUPER = new Set<UserRole>(['master', 'admin'])

export function isFullAccess(role: UserRole): boolean {
  return SUPER.has(role)
}

// ─── Nav / route access matrix ────────────────────────────────────────────
//
// master / admin → always allowed (SUPER check above)
// Listed roles are non-super roles that CAN access the route.

// Nesta fase: os colaboradores (e diretores) usam a Produção e, em Pessoas,
// só veem o que é seu (a própria ficha e as próprias férias). Performance,
// Gestão e Sistema são só para a gestão.
const EQUIPA: UserRole[] = ['management', 'director', 'employee']
const GESTAO: UserRole[] = ['management']

export const NAV_ACCESS: Record<string, UserRole[]> = {
  // Gestão
  '/':              GESTAO,
  '/financeiro':    GESTAO,
  '/orcamento':     GESTAO,
  '/consignacoes':  GESTAO,
  // Produção — a equipa usa no dia a dia. Os parâmetros têm o custo/hora de
  // cada pessoa (vem dos salários) e mexem em todos os preços: só a gestão.
  '/producao':               EQUIPA,
  '/producao/orcamentos':    EQUIPA,
  '/producao/pipeline':      EQUIPA,
  '/producao/clientes':      EQUIPA,
  '/producao/artigos':       EQUIPA,
  '/producao/consumiveis':   EQUIPA,
  '/producao/tabela-precos': EQUIPA,
  '/producao/parametros':    GESTAO,
  '/horas':                  EQUIPA,
  // Pessoas — a lista de colaboradores é da gestão; cada um abre a sua ficha
  // (ver colaboradores/[id]) e vê só as suas férias
  '/colaboradores': GESTAO,
  '/ferias':        ['management', 'director', 'employee', 'intern'],
  '/remuneracao':   GESTAO,
  // Performance
  '/objetivos':      GESTAO,
  '/meus-objetivos': GESTAO,
  '/produtividade':  GESTAO,
  '/avaliacoes':     GESTAO,
  // Sistema
  '/dados':           GESTAO,
  '/sistema/devlog':  GESTAO,
  '/perfil':        ['management', 'director', 'employee', 'intern'],
}

/** Gestão: vê e decide sobre toda a gente (master e admin incluídos). */
export function isGestao(role: UserRole): boolean {
  return SUPER.has(role) || role === 'management'
}

export function canAccess(role: UserRole, path: string): boolean {
  if (SUPER.has(role)) return true
  return (NAV_ACCESS[path] ?? []).includes(role)
}

/** Vê e escreve as avaliações de toda a gente; as outras pessoas só veem as suas, depois de submetidas. */
export function canManageReviews(role: UserRole): boolean {
  return isGestao(role)
}

// ─── Role metadata ────────────────────────────────────────────────────────

export const ROLE_LABELS: Record<UserRole, string> = {
  master:           'Master',
  admin:            'Admin',
  management:       'Gestão',
  director:         'Diretor/a',
  employee:         'Colaborador/a',
  intern:           'Estagiário/a',
}

/** Roles that only have access to /perfil and /avaliacoes */
export const RESTRICTED_ROLES: UserRole[] = ['intern']
