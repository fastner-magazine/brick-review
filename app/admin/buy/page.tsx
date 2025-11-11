import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function BuyIndexPage() {
    return (
        <main className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100">
            <div className="container mx-auto px-4 py-12">
                <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">買取サービス</h1>

                <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
                    <Link href="/buy/client">
                        <Card className="hover:shadow-xl transition-shadow cursor-pointer border-t-4 border-blue-500">
                            <CardHeader>
                                <div className="text-4xl mb-3">✍️</div>
                                <CardTitle className="text-xl">申込フォーム</CardTitle>
                                <CardDescription>買取申込フォームへ進みます（テスト版のフォームを使用）</CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>

                    <Link href="/buy/check">
                        <Card className="hover:shadow-xl transition-shadow cursor-pointer border-t-4 border-green-500">
                            <CardHeader>
                                <div className="text-4xl mb-3">🎥</div>
                                <CardTitle className="text-xl">検品</CardTitle>
                                <CardDescription>受け取った買取品を検品・評価するページ</CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>

                    <Link href="/buy/price-master">
                        <Card className="hover:shadow-xl transition-shadow cursor-pointer border-t-4 border-red-500">
                            <CardHeader>
                                <div className="text-4xl mb-3">💰</div>
                                <CardTitle className="text-xl">価格マスター</CardTitle>
                                <CardDescription>商品ごとの買取価格を設定・管理します</CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>

                    <Link href="/buy/payout">
                        <Card className="hover:shadow-xl transition-shadow cursor-pointer border-t-4 border-amber-500">
                            <CardHeader>
                                <div className="text-4xl mb-3">💸</div>
                                <CardTitle className="text-xl">振込・支払について</CardTitle>
                                <CardDescription>振込や支払に関する案内</CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>

                    <Link href="/buy/booking">
                        <Card className="hover:shadow-xl transition-shadow cursor-pointer border-t-4 border-purple-500">
                            <CardHeader>
                                <div className="text-4xl mb-3">🗓️</div>
                                <CardTitle className="text-xl">来店予約</CardTitle>
                                <CardDescription>来店予約の管理ページ。</CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>

                    <Link href="/buy/on-hold">
                        <Card className="hover:shadow-xl transition-shadow cursor-pointer border-t-4 border-pink-500">
                            <CardHeader>
                                <div className="text-4xl mb-3">⏸️</div>
                                <CardTitle className="text-xl">保留中</CardTitle>
                                <CardDescription>確認待ち・連絡待ち等の案件管理。</CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>

                    <Link href="/buy/store-settings">
                        <Card className="hover:shadow-xl transition-shadow cursor-pointer border-t-4 border-teal-500">
                            <CardHeader>
                                <div className="text-4xl mb-3">🏪</div>
                                <CardTitle className="text-xl">店舗設定</CardTitle>
                                <CardDescription>店舗情報や営業時間などの設定。</CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>
                </div>

                <div className="mt-10 max-w-4xl mx-auto text-center">
                    <p className="text-sm text-gray-600">テスト用フォームを使用しています。本番の申込フォームは別途ご案内予定です。</p>
                </div>
            </div>
        </main>
    );
}
