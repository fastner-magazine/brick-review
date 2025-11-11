/**
 * 左サイドバーメニュー
 */

import React from 'react';
import Link from 'next/link';
import { Home, Package, ShoppingCart, Settings, FileText, BarChart3 } from 'lucide-react';

type SidebarProps = {
 activeItem?: string;
 onItemClick?: (_item: string) => void;
};

export function Sidebar({ activeItem = 'inventory', onItemClick }: SidebarProps) {
 const menuItems = [
  { id: 'home', icon: Home, label: 'ホーム' },
  { id: 'inventory', icon: Package, label: '在庫管理' },
  { id: 'orders', icon: ShoppingCart, label: '注文管理' },
  { id: 'reports', icon: FileText, label: 'レポート' },
  { id: 'analytics', icon: BarChart3, label: '分析' },
  { id: 'settings', icon: Settings, label: '設定' },
 ];

 return (
  <div className="fixed left-0 top-0 bottom-0 w-16 bg-gray-900 text-white flex flex-col items-center py-4 space-y-6 z-50">
   {/* ロゴエリア */}
   <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center mb-4">
    <span className="text-xl font-bold">B</span>
   </div>

   {/* メニューアイテム */}
   <nav className="flex-1 flex flex-col items-center space-y-4">
    {menuItems.map((item) => {
     const Icon = item.icon;
     const isActive = activeItem === item.id;
     // 在庫管理ボタンは専用のリンクにする
     if (item.id === 'inventory') {
      return (
       <Link
        key={item.id}
        href="/inventory/inventory-variants"
        className={`w-12 h-12 rounded-lg flex items-center justify-center transition-colors relative group ${isActive ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
         }`}
        title={item.label}
       >
        <Icon className="w-6 h-6" />
        {/* ツールチップ */}
        <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
         {item.label}
        </div>
       </Link>
      );
     }

     return (
      <button
       key={item.id}
       onClick={() => onItemClick?.(item.id)}
       className={`w-12 h-12 rounded-lg flex items-center justify-center transition-colors relative group ${isActive ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
        }`}
       title={item.label}
      >
       <Icon className="w-6 h-6" />
       {/* ツールチップ */}
       <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
        {item.label}
       </div>
      </button>
     );
    })}
   </nav>
  </div>
 );
}
