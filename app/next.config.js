/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true, // Firebase Hostingの画像最適化不要（SSRなし領域軽量化）
  },
  // NEXT_PUBLIC_ で始まる変数は自動インライン化されるため env再定義は不要。
  // サーバーサイド秘密値は .env から直接参照し、このファイルへ書かない。
  productionBrowserSourceMaps: false, // ソースマップ無効化でビルドサイズ・メモリ削減
  output: 'standalone', // Firebase functions backend 用に最小構成出力
  eslint: {
    // CIでの高速化: lintは開発者が個別に実行
    ignoreDuringBuilds: true,
  },
  typescript: {
    // ビルド時の型チェックをスキップしてメモリ削減
    ignoreBuildErrors: true,
  },
  experimental: {
    // メモリ効率化: 並列処理を抑制
    workerThreads: false,
    cpus: 1,
  },
  async redirects() {
    return [
      // 旧URL → 新URL（/admin配下）へのリダイレクト
      // 既存のブックマークや外部リンク対応
      {
        source: '/inventory/:path*',
        destination: '/admin/inventory/:path*',
        permanent: false, // 302リダイレクト（一時的）
      },
      {
        source: '/orders/:path*',
        destination: '/admin/orders/:path*',
        permanent: false,
      },
      {
        source: '/system/:path*',
        destination: '/admin/system/:path*',
        permanent: false,
      },
      {
        source: '/calculator/:path*',
        destination: '/admin/calculator/:path*',
        permanent: false,
      },
      {
        source: '/buy/:path*',
        destination: '/admin/buy/:path*',
        permanent: false,
      },
      {
        source: '/test/:path*',
        destination: '/admin/test/:path*',
        permanent: false,
      },
    ];
  },
  // trailingSlash: true, // 必要に応じて有効化
};

module.exports = nextConfig;
