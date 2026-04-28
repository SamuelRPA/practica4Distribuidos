import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'OEP — Cómputo Electoral',
    description: 'Dashboard, cómputo oficial y administración de SMS',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="es">
            <body>
                <header style={{ padding: '12px 24px', borderBottom: '1px solid #eee', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                    <strong>OEP — Cómputo Electoral</strong>
                    <a href="/dashboard">📊 Dashboard</a>
                    <a href="/oficial">📝 Cómputo oficial</a>
                    <a href="/sms-admin">📱 SMS Admin</a>
                    <span style={{ color: '#888' }}>📷 App móvil → Expo Go (mobile-app/)</span>
                </header>
                <main style={{ padding: 24 }}>{children}</main>
            </body>
        </html>
    );
}
