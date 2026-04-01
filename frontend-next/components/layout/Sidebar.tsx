'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  BarChart3,
  Users,
  FileText,
  CreditCard,
  GitBranch,
  ShieldCheck,
  BookOpen,
  Package,
  ShoppingBasket,
  AlertTriangle,
  Search,
  LogOut,
  Menu,
  X,
  Coins,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
  collectorOnly?: boolean;
}

const navItems: NavItem[] = [
  { href: '/dashboard',     label: 'Resumo',               icon: <BarChart3 className="h-4 w-4" /> },
  { href: '/customers',     label: 'Clientes',             icon: <Users className="h-4 w-4" /> },
  { href: '/contracts',     label: 'Contratos',            icon: <FileText className="h-4 w-4" /> },
  { href: '/assignments',   label: 'Distribuição',         icon: <GitBranch className="h-4 w-4" />, adminOnly: true },
  { href: '/payments',      label: 'Pagamentos',           icon: <CreditCard className="h-4 w-4" /> },
  { href: '/users',         label: 'Usuários',             icon: <ShieldCheck className="h-4 w-4" />, adminOnly: true },
  { href: '/cash-accounts', label: 'Prestação de contas',  icon: <BookOpen className="h-4 w-4" />, adminOnly: true },
  { href: '/estoque',       label: 'Estoque',              icon: <Package className="h-4 w-4" />, adminOnly: true },
  { href: '/cestas',        label: 'Cestas Básicas',       icon: <ShoppingBasket className="h-4 w-4" />, adminOnly: true },
  { href: '/spc',           label: 'SPC',                  icon: <AlertTriangle className="h-4 w-4" />, adminOnly: true },
  { href: '/audit',         label: 'Auditoria',            icon: <Search className="h-4 w-4" />, adminOnly: true },
  { href: '/cobranca',      label: 'Cobrança',             icon: <Coins className="h-4 w-4" />, collectorOnly: true },
];

const Logo = () => (
  <svg width="130" height="34" viewBox="0 0 300 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="sidebarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#60a5fa" />
        <stop offset="100%" stopColor="#c084fc" />
      </linearGradient>
    </defs>
    <g transform="translate(10, 5) scale(0.9)">
      <path d="M 15 50 L 30 15 L 50 40 L 70 15 L 90 35 L 70 55 L 50 40 L 30 65 L 50 85 L 85 80" stroke="url(#sidebarGrad)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <circle cx="50" cy="40" r="6" fill="#8B5CF6"/>
      <circle cx="30" cy="15" r="5" fill="rgba(255,255,255,0.3)" stroke="url(#sidebarGrad)" strokeWidth="3"/>
      <circle cx="70" cy="15" r="5" fill="rgba(255,255,255,0.3)" stroke="url(#sidebarGrad)" strokeWidth="3"/>
    </g>
    <text x="105" y="65" fontFamily="'Sora', sans-serif" fontSize="42" fontWeight="900" fill="#60a5fa">
      Mi<tspan fontWeight="300" fill="#c084fc">Pixi</tspan>
    </text>
  </svg>
);

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAdmin, isCollector, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleItems = navItems.filter((item) => {
    if (item.collectorOnly) return isCollector;
    if (item.adminOnly) return isAdmin;
    if (isCollector) return false; // collectors only see /cobranca
    return true;
  });

  const NavLink = ({ item }: { item: NavItem }) => {
    const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
    return (
      <button
        onClick={() => {
          router.push(item.href);
          setMobileOpen(false);
        }}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
          isActive
            ? 'bg-white/15 text-white shadow-sm'
            : 'text-white/60 hover:bg-white/10 hover:text-white/90'
        )}
      >
        <span className={isActive ? 'text-blue-300' : 'text-white/40'}>{item.icon}</span>
        {item.label}
      </button>
    );
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-white/10">
        <Logo />
      </div>

      {/* User info */}
      <div className="px-4 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8 bg-blue-600/30">
            <AvatarFallback className="text-blue-300 text-xs font-semibold bg-transparent">
              {user?.name?.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.name}</p>
            <p className="text-xs text-white/40 truncate">
              {user?.role === 'ADMIN' ? 'Administrador' : 'Cobrador'}
            </p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {visibleItems.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
      </nav>

      {/* Logout */}
      <div className="px-3 py-3 border-t border-white/10">
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/50 hover:bg-white/10 hover:text-white/80 transition-all duration-150"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex flex-col w-60 flex-shrink-0 h-screen sticky top-0"
        style={{ background: 'linear-gradient(180deg, var(--blue-950) 0%, var(--blue-900) 100%)' }}
      >
        <SidebarContent />
      </aside>

      {/* Mobile top bar */}
      <div
        className="lg:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 border-b border-white/10"
        style={{ background: 'var(--blue-950)' }}
      >
        <Logo />
        <Button
          variant="ghost"
          size="icon"
          className="text-white/70 hover:text-white hover:bg-white/10"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="relative z-10 w-72 h-full flex flex-col"
            style={{ background: 'linear-gradient(180deg, var(--blue-950) 0%, var(--blue-900) 100%)' }}
          >
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-3 right-3 text-white/50 hover:text-white hover:bg-white/10"
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
            <SidebarContent />
          </aside>
        </div>
      )}
    </>
  );
}
