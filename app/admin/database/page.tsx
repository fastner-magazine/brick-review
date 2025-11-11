import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function DatabaseIndexPage() {
    return (
        <main className="min-h-screen bg-linear-to-br from-slate-50 via-blue-50 to-indigo-100">
            <div className="container mx-auto px-4 py-12">
                {/* Page Header */}
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-bold bg-linear-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-3">
                        データベース管理
                    </h1>
                    <p className="text-gray-600 text-sm">商品、在庫、価格などのマスターデータを管理します</p>
                </div>

                {/* Cards Grid */}
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
                    <Link href="/admin/database/products" className="group">
                        <Card className="h-full relative">
                            <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-blue-500 to-blue-600"></div>
                            <CardHeader className="pb-6">
                                <div className="w-14 h-14 rounded-xl bg-linear-to-br from-blue-500 to-blue-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                                    <span className="text-2xl">📦</span>
                                </div>
                                <CardTitle>商品マスター</CardTitle>
                                <CardDescription>商品情報の登録・編集・削除を行います。</CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>

                    <Link href="/admin/database/variants" className="group">
                        <Card className="h-full relative">
                            <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-purple-500 to-pink-600"></div>
                            <CardHeader className="pb-6">
                                <div className="w-14 h-14 rounded-xl bg-linear-to-br from-purple-500 to-pink-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                                    <span className="text-2xl">🎨</span>
                                </div>
                                <CardTitle>バリアントマスター</CardTitle>
                                <CardDescription>商品バリエーション（色・サイズ等）を管理します。</CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>

                    <Link href="/admin/database/inventory" className="group">
                        <Card className="h-full relative">
                            <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-green-500 to-emerald-600"></div>
                            <CardHeader className="pb-6">
                                <div className="w-14 h-14 rounded-xl bg-linear-to-br from-green-500 to-emerald-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                                    <span className="text-2xl">📊</span>
                                </div>
                                <CardTitle>在庫マスター</CardTitle>
                                <CardDescription>在庫データの一括管理・更新を行います。</CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>

                    <Link href="/admin/database/prices" className="group">
                        <Card className="h-full relative">
                            <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-amber-500 to-orange-500"></div>
                            <CardHeader className="pb-6">
                                <div className="w-14 h-14 rounded-xl bg-linear-to-br from-amber-500 to-orange-500 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                                    <span className="text-2xl">💰</span>
                                </div>
                                <CardTitle>価格マスター</CardTitle>
                                <CardDescription>買取価格・販売価格の設定を管理します。</CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>

                    <Link href="/admin/database/taxonomies" className="group">
                        <Card className="h-full relative">
                            <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-indigo-500 to-purple-600"></div>
                            <CardHeader className="pb-6">
                                <div className="w-14 h-14 rounded-xl bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                                    <span className="text-2xl">🏷️</span>
                                </div>
                                <CardTitle>タクソノミー管理</CardTitle>
                                <CardDescription>カテゴリー、タグなどの分類体系を管理します。</CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>

                    <Link href="/admin/database/import-export" className="group">
                        <Card className="h-full relative">
                            <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-cyan-500 to-blue-600"></div>
                            <CardHeader className="pb-6">
                                <div className="w-14 h-14 rounded-xl bg-linear-to-br from-cyan-500 to-blue-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                                    <span className="text-2xl">📤📥</span>
                                </div>
                                <CardTitle>インポート/エクスポート</CardTitle>
                                <CardDescription>データの一括インポート・エクスポートを行います。</CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>

                    <Link href="/admin/database/merge" className="group">
                        <Card className="h-full relative">
                            <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-red-500 to-rose-600"></div>
                            <CardHeader className="pb-6">
                                <div className="w-14 h-14 rounded-xl bg-linear-to-br from-red-500 to-rose-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                                    <span className="text-2xl">🔀</span>
                                </div>
                                <CardTitle>データ統合</CardTitle>
                                <CardDescription>重複データの統合・マージを行います。</CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>

                    <Link href="/admin/database/backup" className="group">
                        <Card className="h-full relative">
                            <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-teal-500 to-green-600"></div>
                            <CardHeader className="pb-6">
                                <div className="w-14 h-14 rounded-xl bg-linear-to-br from-teal-500 to-green-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                                    <span className="text-2xl">💾</span>
                                </div>
                                <CardTitle>バックアップ</CardTitle>
                                <CardDescription>データベースのバックアップ・復元を行います。</CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>

                    <Link href="/admin" className="group">
                        <Card className="h-full relative">
                            <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-gray-500 to-slate-600"></div>
                            <CardHeader className="pb-6">
                                <div className="w-14 h-14 rounded-xl bg-linear-to-br from-gray-500 to-slate-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                                    <span className="text-2xl">🏠</span>
                                </div>
                                <CardTitle>ホームに戻る</CardTitle>
                                <CardDescription>管理画面トップへ戻ります。</CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>
                </div>
            </div>
        </main>
    );
}
