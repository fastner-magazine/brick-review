import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function SystemIndexPage() {
  return (
    <main className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">システムツール</h1>

        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <Link href="/system/diagnostics">
            <Card className="hover:shadow-xl transition-shadow cursor-pointer border-t-4 border-blue-500">
              <CardHeader>
                <div className="text-4xl mb-3">🩺</div>
                <CardTitle className="text-xl">診断ツール</CardTitle>
                <CardDescription>環境や Firestore 接続の状態を確認します。</CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/system/migrate-to-firestore">
            <Card className="hover:shadow-xl transition-shadow cursor-pointer border-t-4 border-green-500">
              <CardHeader>
                <div className="text-4xl mb-3">📤</div>
                <CardTitle className="text-xl">Firestore へ移行</CardTitle>
                <CardDescription>既存データの移行ユーティリティ。</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </div>
      </div>
    </main>
  );
}

