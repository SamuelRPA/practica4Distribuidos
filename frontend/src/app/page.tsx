'use client';

import Link from 'next/link';
import { BarChart3, FileSpreadsheet, MessageSquare, Smartphone, ArrowRight, Activity } from 'lucide-react';

const cards = [
    {
        href: '/dashboard',
        title: 'Dashboard analítico',
        desc: 'Visualizaciones en tiempo real RRV vs Cómputo Oficial, mapa de calor y exploración por jerarquía territorial.',
        icon: BarChart3,
        accent: 'from-blue-500 to-indigo-600',
        tag: 'Tiempo real',
    },
    {
        href: '/oficial',
        title: 'Cómputo oficial',
        desc: 'Transcripción manual de actas, gestión CRUD de actas y mesas electorales.',
        icon: FileSpreadsheet,
        accent: 'from-emerald-500 to-teal-600',
        tag: 'Gestión',
    },
    {
        href: '/sms-admin',
        title: 'Administración SMS',
        desc: 'Lista blanca de números, simulador de SMS y auditoría completa de mensajes recibidos.',
        icon: MessageSquare,
        accent: 'from-amber-500 to-orange-600',
        tag: 'Auditoría',
    },
];

export default function Home() {
    return (
        <div className="home-wrap">
            <section className="home-hero">
                <span className="hero-eyebrow">
                    <Activity size={14} /> Sistemas Distribuidos · Práctica 4
                </span>
                <h1 className="hero-title">Sistema Nacional de Cómputo Electoral</h1>
                <p className="hero-sub">
                    Plataforma distribuida con pipeline RRV (recepción rápida) y Cómputo Oficial,
                    integrando OCR, SMS, app móvil y dashboard analítico en tiempo real.
                </p>
                <div className="hero-cta">
                    <Link href="/dashboard" className="btn-primary">
                        Ir al Dashboard <ArrowRight size={16} />
                    </Link>
                    <Link href="/oficial" className="btn-ghost">
                        Cómputo Oficial
                    </Link>
                </div>
            </section>

            <section className="home-grid">
                {cards.map(({ href, title, desc, icon: Icon, tag }) => (
                    <Link key={href} href={href} className="home-card">
                        <div className="home-card-head">
                            <div className="home-card-icon"><Icon size={22} /></div>
                            <span className="home-card-tag">{tag}</span>
                        </div>
                        <h3>{title}</h3>
                        <p>{desc}</p>
                        <span className="home-card-link">
                            Abrir <ArrowRight size={14} />
                        </span>
                    </Link>
                ))}
            </section>

            <section className="home-info">
                <div className="info-card">
                    <Smartphone size={20} />
                    <div>
                        <strong>App móvil nativa</strong>
                        <p>La captura de actas usa Expo + React Native. Ver instrucciones en <code>mobile-app/README.md</code>.</p>
                    </div>
                </div>
            </section>
        </div>
    );
}
