import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function InventoryLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-50 pl-20 pr-6">
            {/* ヘッダー */}
            <header className="sticky top-0 z-40 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 shadow-sm -ml-20 -mr-6 pr-6">
                <div className="max-w-[1320px] mx-auto px-4 py-3 w-full">
                    <div className="flex items-center justify-between">
                        {/* ロゴとタイトル */}
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center shadow-md">
                                    <span className="text-white text-xl font-bold">📦</span>
                                </div>
                                <div>
                                    <h1 className="text-xl font-bold text-gray-900 tracking-tight">買取管理システム</h1>
                                    <p className="text-xs text-gray-500">Inventory Management</p>
                                </div>
                            </div>
                        </div>

                        {/* ナビゲーションボタン */}
                        <nav className="flex items-center gap-2">
                            <Link href="/inventory/inventory-variants">
                                <Button variant="ghost" className="gap-2 hover:bg-blue-50">
                                    <span>🔍</span>
                                    <span className="hidden sm:inline">在庫一覧</span>
                                </Button>
                            </Link>
                            <Link href="/inventory/inbound">
                                <Button variant="ghost" className="gap-2 hover:bg-green-50">
                                    <span>📥</span>
                                    <span className="hidden sm:inline">入庫</span>
                                </Button>
                            </Link>
                            <Link href="/inventory/inventory-check">
                                <Button variant="ghost" className="gap-2 hover:bg-purple-50">
                                    <span>✅</span>
                                    <span className="hidden sm:inline">棚卸</span>
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
                        <Link href="/inventory/inventory-variants" className="flex-shrink-0">
                            <Button variant="outline" size="sm" className="gap-1 text-xs">
                                <span>🔍</span>
                                <span>在庫一覧</span>
                            </Button>
                        </Link>
                        <Link href="/inventory/inbound" className="flex-shrink-0">
                            <Button variant="outline" size="sm" className="gap-1 text-xs">
                                <span>📥</span>
                                <span>入庫</span>
                            </Button>
                        </Link>
                        <Link href="/inventory/inventory-check" className="flex-shrink-0">
                            <Button variant="outline" size="sm" className="gap-1 text-xs">
                                <span>✅</span>
                                <span>棚卸</span>
                            </Button>
                        </Link>
                    </div>
                </div>
            </header>

            {/* メインコンテンツ */}
            <main className="w-full px-0 py-6">
                {children}
            </main>

            {/* フッター */}
            <footer className="mt-auto border-t bg-white py-6 -ml-20 -mr-6 pr-6">
                <div className="max-w-[1320px] mx-auto px-4 w-full">
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
    );
}
