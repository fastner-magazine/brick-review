import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function OrdersIndexPage() {
    return (
        <main className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100">
            <div className="container mx-auto px-4 py-12">
                <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">注文管理</h1>

                <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
                    <Link href="/orders/new-order">
                        <Card className="hover:shadow-xl transition-shadow cursor-pointer border-t-4 border-blue-500">
                            <CardHeader>
                                <div className="text-4xl mb-3">🆕</div>
                                <CardTitle className="text-xl">新規注文の作成</CardTitle>
                                <CardDescription>手動入力または商品マスタから注文を作成します。</CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>

                    <Link href="/orders/all-order">
                        <Card className="hover:shadow-xl transition-shadow cursor-pointer border-t-4 border-green-500">
                            <CardHeader>
                                <div className="text-4xl mb-3">📦</div>
                                <CardTitle className="text-xl">注文一覧（全件）</CardTitle>
                                <CardDescription>登録済みの注文を一覧で確認します。</CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>

                    <Link href="/">
                        <Card className="hover:shadow-xl transition-shadow cursor-pointer border-t-4 border-amber-500">
                            <CardHeader>
                                <div className="text-4xl mb-3">🏠</div>
                                <CardTitle className="text-xl">ホームに戻る</CardTitle>
                                <CardDescription>ダッシュボードへ戻ります。</CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>
                </div>
            </div>
        </main>
    );
}
