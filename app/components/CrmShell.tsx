'use client';

import Link from 'next/link';
import React from 'react';
import { LayoutDashboard, ClipboardList, Boxes, Calculator, ShoppingBag, FlaskConical, Settings } from 'lucide-react';
import { Input } from '@/components/ui/input';

const navItems = [
  { href: '/', label: 'ダッシュボード', icon: LayoutDashboard },
  { href: '/orders', label: '注文一覧', icon: ClipboardList },
  { href: '/inventory', label: '在庫情報', icon: Boxes },
  { href: '/calculator', label: 'ダンボール計算機', icon: Calculator },
  { href: '/buy', label: '買取サービス', icon: ShoppingBag },
  { href: '/test', label: 'Test ツール', icon: FlaskConical },
  { href: '/buyback-settings', label: '買取設定', icon: Settings },
];

export default function CrmShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--secondary)] text-[var(--foreground)]">
      <div className="flex min-h-screen">
        <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-[var(--border)] bg-white">
          <div className="h-16 flex items-center px-4 border-b border-[var(--border)]">
            <Link href="/" className="text-base font-bold tracking-tight text-[var(--accent-foreground)]">
              発送管理システム
            </Link>
          </div>
          <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-1">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="group flex items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900"
              >
                <Icon className="h-4 w-4 text-gray-500 group-hover:text-gray-700" />
                <span className="truncate">{label}</span>
              </Link>
            ))}
          </nav>
          <div className="px-3 py-4 border-t border-[var(--border)] text-xs text-gray-500">
            © {new Date().getFullYear()}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 h-16 w-full border-b border-[var(--border)] bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
            <div className="flex h-full items-center gap-4 px-4 md:px-6">
              <div className="hidden md:block text-sm font-medium text-gray-700">CRMビュー</div>
              <div className="flex-1 max-w-xl">
                <Input type="search" placeholder="検索（注文番号・SKU・お客様名など）" aria-label="検索" />
              </div>
              <div className="hidden md:flex items-center gap-3 text-sm text-gray-600">
                <Link href="/system" className="hover:text-gray-900">システム</Link>
                <Link href="/client" className="hover:text-gray-900">クライアント</Link>
                <Link href="/userclient" className="hover:text-gray-900">ユーザー</Link>
              </div>
            </div>
          </header>

          <main className="flex-1 min-w-0 overflow-y-auto p-4 md:p-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
