import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function InventoryIndexPage() {
    return (
        <main className="min-h-screen bg-linear-to-br from-slate-50 via-blue-50 to-indigo-100">
            <div className="container mx-auto px-4 py-12">
                {/* Page Header */}
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-bold bg-linear-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-3">
                        在庫管理
                    </h1>
                    <p className="text-gray-600 text-sm">在庫の入出庫、棚卸、管理を行います</p>
                </div>

                {/* Cards Grid */}
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
                    <Link href="/inventory/inbound" className="group">
                        <Card className="h-full relative">
                            <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-blue-500 to-blue-600"></div>
                            <CardHeader className="pb-6">
                                <div className="w-14 h-14 rounded-xl bg-linear-to-br from-blue-500 to-blue-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                                    <span className="text-2xl">📥</span>
                                </div>
                                <CardTitle>入庫（検品完了）</CardTitle>
                                <CardDescription>検品済みの入庫待ちを在庫へ反映します。</CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>

                    <Link href="/inventory/inventory-check" className="group">
                        <Card className="h-full relative">
                            <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-green-500 to-emerald-600"></div>
                            <CardHeader className="pb-6">
                                <div className="w-14 h-14 rounded-xl bg-linear-to-br from-green-500 to-emerald-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                                    <span className="text-2xl">📊</span>
                                </div>
                                <CardTitle>棚卸</CardTitle>
                                <CardDescription>在庫の数量・状態を確認・更新します。</CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>

                    <Link href="/inventory/inventory-variants" className="group">
                        <Card className="h-full relative">
                            <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-amber-500 to-orange-500"></div>
                            <CardHeader className="pb-6">
                                <div className="w-14 h-14 rounded-xl bg-linear-to-br from-amber-500 to-orange-500 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                                    <span className="text-2xl">🧩</span>
                                </div>
                                <CardTitle>Inventory Variants</CardTitle>
                                <CardDescription>variant ごとの在庫バリエーション編集ツール。</CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>

                    <Link href="/inventory/outbound" className="group">
                        <Card className="h-full relative">
                            <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-red-500 to-rose-600"></div>
                            <CardHeader className="pb-6">
                                <div className="w-14 h-14 rounded-xl bg-linear-to-br from-red-500 to-rose-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                                    <span className="text-2xl">📤</span>
                                </div>
                                <CardTitle>出庫 / 出荷</CardTitle>
                                <CardDescription>出庫処理や出荷予定の管理を行います。</CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>

                    <Link href="/inventory/stock" className="group">
                        <Card className="h-full relative">
                            <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-indigo-500 to-purple-600"></div>
                            <CardHeader className="pb-6">
                                <div className="w-14 h-14 rounded-xl bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                                    <span className="text-2xl">🗃️</span>
                                </div>
                                <CardTitle>在庫一覧</CardTitle>
                                <CardDescription>現在の在庫を確認・検索・エクスポートできます。</CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>

                    <Link href="/" className="group">
                        <Card className="h-full relative">
                            <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-gray-500 to-slate-600"></div>
                            <CardHeader className="pb-6">
                                <div className="w-14 h-14 rounded-xl bg-linear-to-br from-gray-500 to-slate-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                                    <span className="text-2xl">🏠</span>
                                </div>
                                <CardTitle>ホームに戻る</CardTitle>
                                <CardDescription>ダッシュボードへ戻ります。</CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>
                </div>
            </div>
        </main>
    );
}
