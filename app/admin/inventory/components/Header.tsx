import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function InventoryHeader() {
    return (
        <div className="w-full pl-20 pr-6 py-3">
            <div className="flex items-center justify-between">
                {/* ロゴとタイトル */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center shadow-md">
                            <span className="text-white text-xl font-bold">📦</span>
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900 tracking-tight">在庫管理システム</h1>
                            <p className="text-xs text-gray-500">Inventory Management</p>
                        </div>
                    </div>
                </div>

                {/* ナビゲーションボタン */}
                <nav className="flex items-center gap-2">
                    <Link href="/inventory/import">
                        <Button variant="ghost" className="gap-2 hover:bg-blue-50">
                            <span>�</span>
                            <span className="hidden sm:inline">Import</span>
                        </Button>
                    </Link>
                    <Link href="/inventory/export">
                        <Button variant="ghost" className="gap-2 hover:bg-green-50">
                            <span>�</span>
                            <span className="hidden sm:inline">Export</span>
                        </Button>
                    </Link>
                    <Link href="/inventory">
                        <Button variant="outline" size="sm" className="gap-1">
                            <span>🏠</span>
                            <span className="hidden sm:inline">ホーム</span>
                        </Button>
                    </Link>
                </nav>
            </div>

            {/* サブナビゲーション（モバイル対応） */}
            <div className="flex sm:hidden gap-2 mt-3 overflow-x-auto pb-2">
                <Link href="/inventory/import" className="shrink-0">
                    <Button variant="outline" size="sm" className="gap-1 text-xs">
                        <span>�</span>
                        <span>Import</span>
                    </Button>
                </Link>
                <Link href="/inventory/export" className="shrink-0">
                    <Button variant="outline" size="sm" className="gap-1 text-xs">
                        <span>📤</span>
                        <span>Export</span>
                    </Button>
                </Link>
            </div>
        </div>
    );
}
