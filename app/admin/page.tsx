import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function AdminIndexPage() {
  return (
    <div className="container mx-auto px-4 py-12">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
        <Link href="/admin/buy">
          <Card className="hover:shadow-xl transition-shadow cursor-pointer border-t-4 border-blue-500 h-full">
            <CardHeader>
              <div className="text-5xl mb-3">🛒</div>
              <CardTitle className="text-2xl">買取サービス</CardTitle>
              <CardDescription className="text-base">
                買取申込フォーム、検品、価格マスター、振込管理など買取関連の全機能
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/admin/inventory">
          <Card className="hover:shadow-xl transition-shadow cursor-pointer border-t-4 border-green-500 h-full">
            <CardHeader>
              <div className="text-5xl mb-3">📦</div>
              <CardTitle className="text-2xl">在庫管理</CardTitle>
              <CardDescription className="text-base">
                入庫、棚卸、在庫バリエーション、出庫・出荷など在庫関連機能
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/admin/orders">
          <Card className="hover:shadow-xl transition-shadow cursor-pointer border-t-4 border-purple-500 h-full">
            <CardHeader>
              <div className="text-5xl mb-3">📋</div>
              <CardTitle className="text-2xl">注文管理</CardTitle>
              <CardDescription className="text-base">
                新規注文作成、注文一覧、注文詳細の確認・編集
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/admin/calculator">
          <Card className="hover:shadow-xl transition-shadow cursor-pointer border-t-4 border-amber-500 h-full">
            <CardHeader>
              <div className="text-5xl mb-3">📐</div>
              <CardTitle className="text-2xl">ダンボール計算機</CardTitle>
              <CardDescription className="text-base">
                商品のダンボールサイズ計算、設定管理
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/admin/system">
          <Card className="hover:shadow-xl transition-shadow cursor-pointer border-t-4 border-red-500 h-full">
            <CardHeader>
              <div className="text-5xl mb-3">⚙️</div>
              <CardTitle className="text-2xl">システムツール</CardTitle>
              <CardDescription className="text-base">
                診断ツール、Firestoreマイグレーション、システム設定
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/admin/test">
          <Card className="hover:shadow-xl transition-shadow cursor-pointer border-t-4 border-teal-500 h-full">
            <CardHeader>
              <div className="text-5xl mb-3">🧪</div>
              <CardTitle className="text-2xl">テスト・開発ツール</CardTitle>
              <CardDescription className="text-base">
                プロダクト整備、データ移行、検証用ツール群
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  );
}
