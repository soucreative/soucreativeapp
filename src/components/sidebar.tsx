'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, FileText, DollarSign,
  Target, ClipboardList, TrendingUp, LogOut,
  CalendarDays, Database, Gauge, Clock, Star, ScrollText, Calculator,
  Factory, Contact, Shirt, Package, SlidersHorizontal, Wallet, SquareKanban, Handshake,
} from 'lucide-react'
import { logout } from '@/app/login/actions'
import { canAccess, ROLE_LABELS } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

type NavItem = { href: string; label: string; icon: React.ElementType }
type NavGroup = { label: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Produção',
    items: [
      { href: '/producao',                label: 'Painel de produção', icon: Factory },
      { href: '/producao/orcamentos',     label: 'Orçamentos',         icon: FileText },
      { href: '/producao/pipeline',       label: 'Pipeline',           icon: SquareKanban },
      { href: '/producao/tabela-precos',  label: 'Calculadora',        icon: Calculator },
      { href: '/producao/clientes',       label: 'Clientes',           icon: Contact },
      { href: '/producao/artigos',        label: 'Artigos',            icon: Shirt },
      { href: '/producao/consumiveis',    label: 'Consumíveis',        icon: Package },
      { href: '/horas',                   label: 'Registo de horas',   icon: Clock },
      { href: '/producao/parametros',     label: 'Parâmetros',         icon: SlidersHorizontal },
    ],
  },
  {
    label: 'Pessoas',
    items: [
      { href: '/colaboradores', label: 'Colaboradores',   icon: Users },
      { href: '/ferias',        label: 'Férias & Faltas', icon: CalendarDays },
      { href: '/remuneracao',   label: 'Remuneração',     icon: DollarSign },
    ],
  },
  {
    label: 'Performance',
    items: [
      { href: '/objetivos',      label: 'Objetivos',       icon: Target },
      { href: '/meus-objetivos', label: 'Os meus obj.',   icon: Star },
      { href: '/produtividade',  label: 'Produtividade',  icon: Gauge },
      { href: '/avaliacoes',     label: 'Avaliações',     icon: ClipboardList },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { href: '/',              label: 'Painel de gestão', icon: LayoutDashboard },
      { href: '/financeiro',    label: 'Financeiro',       icon: TrendingUp },
      { href: '/orcamento',     label: 'Orçamento anual',  icon: Wallet },
      { href: '/consignacoes',  label: 'Consignações',     icon: Handshake },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { href: '/dados',           label: 'Dados',    icon: Database   },
      { href: '/sistema/devlog',  label: 'Devlog',   icon: ScrollText },
    ],
  },
]

export default function Sidebar({ role, name, employeeId }: { role: UserRole; name?: string; employeeId?: string }) {
  const pathname = usePathname()

  const visibleGroups = NAV_GROUPS
    .map(group => ({
      ...group,
      items: group.items.flatMap((item): NavItem[] => {
        if (canAccess(role, item.href)) return [item]
        // Quem não vê a lista de colaboradores abre a sua própria ficha
        if (item.href === '/colaboradores' && employeeId && role !== 'intern') {
          return [{ href: `/colaboradores/${employeeId}`, label: 'A minha ficha', icon: item.icon }]
        }
        return []
      }),
    }))
    .filter(group => group.items.length > 0)

  return (
    <aside className="w-60 bg-verde-escuro flex flex-col h-screen fixed left-0 top-0 z-40">
      <Link href="/producao" className="flex items-center gap-3 px-6 py-5 border-b border-white/10">
        <Image src="/brand/logo-branco.png" alt="SOU creative" width={48} height={35} priority />
        <span className="text-[10px] uppercase tracking-[0.2em] text-white/60 leading-tight">Produção<br />e gestão</span>
      </Link>

      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-4">
        {visibleGroups.map(group => (
          <div key={group.label}>
            <p className="px-3 mb-1 text-xs font-semibold uppercase tracking-wider text-white/50">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      active
                        ? 'bg-white/10 text-white'
                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Icon size={16} strokeWidth={1.75} />
                    {label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-3 pb-3 border-t border-white/10">
        {name && (
          <Link
            href="/perfil"
            className="flex flex-col px-3 pt-3 pb-1 rounded-lg hover:bg-white/10 transition-colors group"
          >
            <p className="text-xs font-semibold text-white truncate group-hover:text-white">{name}</p>
            <p className="text-xs text-white/50">{ROLE_LABELS[role] ?? role}</p>
          </Link>
        )}
        <form action={logout}>
          <button
            type="submit"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors w-full mt-1"
          >
            <LogOut size={16} strokeWidth={1.75} />
            Sair
          </button>
        </form>
      </div>
    </aside>
  )
}
