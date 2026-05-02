'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, FileSpreadsheet, MessageSquare, Vote } from 'lucide-react';

const links = [
    { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
    { href: '/oficial', label: 'Cómputo Oficial', icon: FileSpreadsheet },
    { href: '/sms-admin', label: 'SMS Admin', icon: MessageSquare },
];

export default function NavBar() {
    const pathname = usePathname();

    return (
        <header className="app-header">
            <Link href="/" className="brand">
                <Vote size={22} className="brand-icon" />
                <div className="brand-text">
                    <span className="brand-title">OEP</span>
                    <span className="brand-sub">Cómputo Electoral Plurinacional</span>
                </div>
            </Link>

            <nav className="app-nav">
                {links.map(({ href, label, icon: Icon }) => {
                    const active = pathname === href || pathname?.startsWith(href + '/');
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={`nav-link ${active ? 'active' : ''}`}
                        >
                            <Icon size={16} />
                            <span>{label}</span>
                        </Link>
                    );
                })}
            </nav>
        </header>
    );
}
