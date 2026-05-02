import './globals.css';
import type { Metadata } from 'next';
import NavBar from '@/components/NavBar';

export const metadata: Metadata = {
    title: 'OEP — Cómputo Electoral',
    description: 'Dashboard, cómputo oficial y administración de SMS',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="es">
            <body>
                <NavBar />
                <main className="app-main">{children}</main>
            </body>
        </html>
    );
}
