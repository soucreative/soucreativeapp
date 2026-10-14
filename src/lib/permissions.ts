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

export const NAV_ACCESS: Record<string, UserRole[]> = {
  '/':              ['management', 'director', 'employee'],
  // Produção — a equipa usa no dia a dia; a gestão supervisiona
  '/producao':               ['management', 'director', 'employee'],
  '/producao/orcamentos':    ['management', 'director', 'employee'],
  '/producao/pipeline':      ['management', 'director', 'employee'],
  '/producao/clientes':      ['management', 'director', 'employee'],
  '/producao/artigos':       ['management', 'director', 'employee'],
  '/producao/consumiveis':   ['management', 'director', 'employee'],
  '/producao/tabela-precos': ['management', 'director', 'employee'],
  '/producao/parametros':    ['management', 'director'],
  '/horas':          ['management', 'director', 'employee'],
  '/colaboradores': ['management', 'director'],
  '/ferias':        ['management', 'director', 'employee', 'intern'],
  '/remuneracao':   ['management'],
  '/objetivos':      ['management', 'director', 'employee'],
  '/meus-objetivos': ['management', 'director', 'employee'],
  '/produtividade':  ['management', 'director'],
  '/avaliacoes':     ['management', 'director', 'employee', 'intern'],
  '/financeiro':    ['management'],
  '/orcamento':     ['management'],
  '/dados':           ['management'],
  '/sistema/devlog':  ['management', 'director', 'employee'],
  '/perfil':        ['management', 'director', 'employee', 'intern'],
}

export function canAccess(role: UserRole, path: string): boolean {
  if (SUPER.has(role)) return true
  return (NAV_ACCESS[path] ?? []).includes(role)
}

/** Vê e escreve as avaliações de toda a gente; as outras pessoas só veem as suas, depois de submetidas. */
export function canManageReviews(role: UserRole): boolean {
  return isFullAccess(role) || role === 'management' || role === 'director'
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
