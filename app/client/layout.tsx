import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "買取申込フォーム | 買取博士",
  description: "買取博士の買取申込フォーム。買取をオンラインで申し込めます。",
};

export default function ClientLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen">
      <header className="no-print" style={{
        background: 'linear-gradient(135deg, #007bff 0%, #0056b3 100%)',
        color: 'white',
        padding: '8px 0',
        boxShadow: '0 2px 8px rgba(0,123,255,0.2)'
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <h1 style={{
            fontSize: 'clamp(1.1rem, 3.5vw, 1.4rem)',
            fontWeight: '700',
            margin: 0,
            letterSpacing: '0.5px'
          }}>
            買取博士
          </h1>
          <span style={{
            fontSize: 'clamp(0.75rem, 2.5vw, 0.85rem)',
            opacity: 0.9,
            fontWeight: '400'
          }}>
            買取申込フォーム
          </span>
        </div>
      </header>
      {children}
    </div>
  );
}
