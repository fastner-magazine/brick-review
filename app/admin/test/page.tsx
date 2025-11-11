import Link from 'next/link';

type TestPageLink = {
    href: string;
    title: string;
    description: string;
};

type TestPageSection = {
    heading: string;
    summary: string;
    pages: TestPageLink[];
};

const sections: TestPageSection[] = [
    {
        heading: '買取関連',
        summary: '店頭向けの申込／検品／支払に関するページへのショートカットです。',
        pages: [
            { href: '/buy', title: '買取ランディング', description: '買取の案内ページ。申込フォームや関連ページへ移動します。' },
            { href: '/buy/client', title: '買取申込フォーム（テスト）', description: '店頭向けのシンプルな受付フォーム（テスト実装）。' },
            { href: '/buy/check', title: '検品ページ', description: '受け取った買取品の検品・評価を行うページ。' },
            { href: '/buy/payout', title: '振込・支払', description: '振込や支払に関する案内ページ。' },
            { href: '/buyback-settings', title: '買取設定', description: '同意書など買取に関する運用設定ページ。' },
        ],
    },
    {
        heading: 'プロダクト整備',
        summary: '商品マスタの設計や分類に関連するツール群です。商品データと税onomiesを整え、Firestore に流し込む前の準備を担います。',
        pages: [
            {
                href: '/test/inventory-variants',
                title: 'Inventory Variant Explorer',
                description: '商品マスタと在庫マスタを突き合わせ、variant_group ごとの在庫バリエーションを一覧化するビュー。',
            },
            {
                href: '/test/products-import',
                title: 'Products Import Builder',
                description: '商品マスタを編集し、ULID/variant 情報を含む Firestore ペイロードを生成するエディタ。',
            },
            {
                href: '/test/database-creator',
                title: 'Database Creator',
                description: 'CSV から Firestore へドキュメントを登録する際のマッピング・投入設定ツール。',
            },
            {
                href: '/test/taxonomies',
                title: 'Taxonomy Manager',
                description: 'カテゴリやタグといった taxonomy コレクションを設計・編集する管理画面。',
            },
            {
                href: '/test/category-sync',
                title: 'Category Sync Tool',
                description: 'inventory_master や products_master からカテゴリを抽出し、taxonomies/categories/terms へ同期するツール。また、既存カテゴリの統合も可能。',
            },
        ],
    },
    {
        heading: 'データ入出力',
        summary: '既存データの取り込みやエクスポートをサポートするツールです。補助 CSV の生成やFirestore バックアップに利用します。',
        pages: [
            {
                href: '/test/csv-import',
                title: 'Buyback CSV Importer',
                description: '買取価格表 CSV を解析し、FireStore のコレクションとして取り込むためのインポーター。',
            },
            {
                href: '/test/firestore-export',
                title: 'Firestore Exporter',
                description: 'Firestore コレクションをバッチ出力するためのエクスポートユーティリティ。',
            },
        ],
    },
    {
        heading: '設定・検証',
        summary: '外部連携や UI コンポーネントの検証に使う補助ページです。開発時の動作確認にどうぞ。',
        pages: [
            {
                href: '/test/sheets-config',
                title: 'Sheets Config',
                description: 'Google スプレッドシート連携時のフィールドマッピングを編集する設定画面。',
            },
            {
                href: '/test/client',
                title: 'Client Playground',
                description: 'Client Components の挙動確認や UI スニペットを試すためのサンドボックス。',
            },
        ],
    },
];

export default function TestIndexPage() {
    return (
        <main
            style={{
                minHeight: '100vh',
                padding: '48px 24px',
                backgroundColor: '#f4f6fb',
            }}
        >
            <div
                style={{
                    maxWidth: '960px',
                    margin: '0 auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '32px',
                }}
            >
                <header>
                    <h1
                        style={{
                            fontSize: '2rem',
                            fontWeight: 700,
                            marginBottom: '12px',
                            color: '#1f2a44',
                        }}
                    >
                        テストツール一覧
                    </h1>
                    <p
                        style={{
                            color: '#4b5563',
                            fontSize: '1rem',
                            lineHeight: 1.6,
                            maxWidth: '720px',
                        }}
                    >
                        開発・検証用に用意したテストページのハブです。各ツールを選択して、目的に合わせた管理画面へ移動してください。
                    </p>
                </header>

                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '32px',
                    }}
                >
                    {sections.map((section) => (
                        <section
                            key={section.heading}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '16px',
                            }}
                        >
                            <div>
                                <h2
                                    style={{
                                        fontSize: '1.4rem',
                                        fontWeight: 700,
                                        color: '#1f2937',
                                        marginBottom: '8px',
                                    }}
                                >
                                    {section.heading}
                                </h2>
                                <p
                                    style={{
                                        color: '#4b5563',
                                        lineHeight: 1.6,
                                        margin: 0,
                                    }}
                                >
                                    {section.summary}
                                </p>
                            </div>
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                                    gap: '20px',
                                }}
                            >
                                {section.pages.map((page) => (
                                    <Link
                                        key={page.href}
                                        href={page.href}
                                        style={{
                                            textDecoration: 'none',
                                        }}
                                    >
                                        <article
                                            style={{
                                                height: '100%',
                                                backgroundColor: '#ffffff',
                                                borderRadius: '12px',
                                                padding: '24px',
                                                boxShadow: '0 10px 22px rgba(15, 23, 42, 0.08)',
                                                border: '1px solid rgba(148, 163, 184, 0.3)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '12px',
                                            }}
                                        >
                                            <h3
                                                style={{
                                                    fontSize: '1.1rem',
                                                    fontWeight: 700,
                                                    color: '#1f2937',
                                                    margin: 0,
                                                }}
                                            >
                                                {page.title}
                                            </h3>
                                            <p
                                                style={{
                                                    flexGrow: 1,
                                                    color: '#4b5563',
                                                    fontSize: '0.95rem',
                                                    lineHeight: 1.6,
                                                    margin: 0,
                                                }}
                                            >
                                                {page.description}
                                            </p>
                                            <span
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                    color: '#2563eb',
                                                    fontWeight: 600,
                                                }}
                                            >
                                                ページを開く
                                                <span aria-hidden="true">→</span>
                                            </span>
                                        </article>
                                    </Link>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            </div>
        </main>
    );
}
