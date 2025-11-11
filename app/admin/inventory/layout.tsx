'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import InventoryHeader from './components/Header';
import { Sidebar } from './components/Sidebar';

export default function InventoryLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-50">
            {/* サイドバー */}
            <Sidebar activeItem="inventory" />

            {/* メインコンテンツエリア */}
            <div className="pl-16">
                {/* ヘッダー */}
                <header className="sticky top-0 z-40 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 shadow-sm">
                    <InventoryHeader />
                </header>

                {/* メインコンテンツ */}
                <main className="w-full px-2">
                    {children}
                </main>

                {/* フッター */}
                <footer className="mt-auto border-t bg-white py-6">
                    <div className="container mx-auto px-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* クイックアクション */}
                            <Card className="p-4 bg-gradient-to-br from-blue-50 to-white border-blue-100">
                                <h3 className="font-semibold text-sm text-gray-900 mb-3 flex items-center gap-2">
                                    <span>⚡</span>
                                    クイックアクション
                                </h3>
                                <div className="space-y-2">
                                    <Link href="/inventory/inventory-variants" className="block">
                                        <Button variant="ghost" size="sm" className="w-full justify-start text-xs hover:bg-blue-100">
                                            <span className="mr-2">→</span>
                                            在庫検索・編集
                                        </Button>
                                    </Link>
                                    <Link href="/inventory/inbound" className="block">
                                        <Button variant="ghost" size="sm" className="w-full justify-start text-xs hover:bg-green-100">
                                            <span className="mr-2">→</span>
                                            新規入庫登録
                                        </Button>
                                    </Link>
                                </div>
                            </Card>

                            {/* システム情報 */}
                            <Card className="p-4 bg-gradient-to-br from-purple-50 to-white border-purple-100">
                                <h3 className="font-semibold text-sm text-gray-900 mb-3 flex items-center gap-2">
                                    <span>ℹ️</span>
                                    システム情報
                                </h3>
                                <div className="space-y-1 text-xs text-gray-600">
                                    <p>• Firestore連携: 3テーブル構造</p>
                                    <p>• リアルタイム更新対応</p>
                                    <p>• バリアント管理機能</p>
                                    <p>• CSV一括インポート</p>
                                </div>
                            </Card>

                            {/* ヘルプ */}
                            <Card className="p-4 bg-gradient-to-br from-amber-50 to-white border-amber-100">
                                <h3 className="font-semibold text-sm text-gray-900 mb-3 flex items-center gap-2">
                                    <span>💡</span>
                                    ヘルプ
                                </h3>
                                <div className="space-y-1 text-xs text-gray-600">
                                    <p>• <strong>在庫一覧:</strong> 商品検索・編集・統合</p>
                                    <p>• <strong>入庫:</strong> 新規在庫の登録</p>
                                    <p>• <strong>棚卸:</strong> 在庫数の確認・調整</p>
                                </div>
                            </Card>
                        </div>

                        {/* コピーライト */}
                        <div className="mt-6 text-center text-xs text-gray-500">
                            <p>© 2025 Inventory Management System. All rights reserved.</p>
                        </div>
                    </div>
                </footer>
            </div>
        </div>
    );
}
