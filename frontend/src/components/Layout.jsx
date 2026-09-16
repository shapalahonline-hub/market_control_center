import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, KanbanSquare, CalendarDays, BarChart3,
  Trophy, Megaphone, Plug, CircleDot, BrainCircuit, Send,
} from 'lucide-react'

const NAV = [
  { to: '/', label: 'Обзор', icon: LayoutDashboard, end: true },
  { to: '/review', label: 'Авто-пилот', icon: BrainCircuit },
  { to: '/pipeline', label: 'Контент-конвейер', icon: KanbanSquare },
  { to: '/publishing', label: 'Публикация', icon: Send },
  { to: '/calendar', label: 'Календарь', icon: CalendarDays },
  { to: '/performance', label: 'Аналитика', icon: BarChart3 },
  { to: '/winners', label: 'Винеры', icon: Trophy },
  { to: '/ads', label: 'Реклама', icon: Megaphone },
  { to: '/connectors', label: 'Коннекторы', icon: Plug },
]

const TITLES = {
  '/': 'Обзор', '/review': 'Авто-пилот', '/pipeline': 'Контент-конвейер',
  '/publishing': 'Публикация', '/calendar': 'Календарь', '/performance': 'Аналитика',
  '/winners': 'Винеры', '/ads': 'Реклама', '/connectors': 'Коннекторы',
}

export default function Layout({ children }) {
  const loc = useLocation()
  return (
    <div className="min-h-screen flex bg-paper">
      {/* sidebar */}
      <aside className="w-[240px] shrink-0 border-r border-line bg-raised/60 flex flex-col fixed inset-y-0">
        <div className="px-5 h-16 flex items-center gap-2.5 border-b border-line-soft">
          <div className="w-8 h-8 rounded-lg bg-ink flex items-center justify-center">
            <CircleDot size={17} className="text-clay-500" />
          </div>
          <div className="leading-tight">
            <div className="font-display text-[15px] text-ink">Control Center</div>
            <div className="text-[11px] text-muted -mt-0.5">Envizhl · контент</div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                  isActive ? 'bg-clay-50 text-clay-700 font-medium'
                           : 'text-ink-soft hover:bg-line-soft'}`}>
              <Icon size={17} strokeWidth={2} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-line-soft text-[11px] text-faint">
          v0.1 · standalone
        </div>
      </aside>

      {/* main */}
      <div className="flex-1 ml-[240px] flex flex-col min-w-0">
        <header className="h-16 border-b border-line bg-paper/80 backdrop-blur sticky top-0 z-10
                           flex items-center px-8">
          <h1 className="font-display text-xl text-ink">{TITLES[loc.pathname] || 'Control Center'}</h1>
        </header>
        <main className="flex-1 px-8 py-7 max-w-[1280px] w-full mx-auto">{children}</main>
      </div>
    </div>
  )
}
