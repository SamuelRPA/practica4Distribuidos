'use client';

import Link from 'next/link';
import { BarChart3, FileSpreadsheet, MessageSquare, Smartphone, ArrowRight, Activity, Zap, ScrollText, Server } from 'lucide-react';

const cards = [
    {
        href: '/dashboard',
        title: 'Dashboard analítico',
        desc: 'Visualizaciones en tiempo real con 3 métricas (Oficial, Rápido y Combinado), mapa de calor, ganador territorial y horarios.',
        icon: BarChart3,
        accent: 'from-blue-500 to-indigo-600',
        tag: 'Tiempo real',
    },
    {
        href: '/rrv',
        title: 'Cómputo Rápido (RRV)',
        desc: 'Pipeline rápido — actas desde PDF, SMS y N8N. Aprobar, observar o rechazar en tiempo real.',
        icon: Zap,
        accent: 'from-amber-500 to-yellow-600',
        tag: 'Pipeline',
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
        href: '/auditoria',
        title: 'Auditoría',
        desc: 'Línea de tiempo unificada de todos los eventos: Oficial, RRV, SMS y errores del sistema.',
        icon: ScrollText,
        accent: 'from-purple-500 to-violet-600',
        tag: 'Eventos',
    },
    {
        href: '/cluster',
        title: 'Estado del clúster',
        desc: '3 nodos PostgreSQL (primary + 2 standbys) y MongoDB replica set. Test de replicación en vivo.',
        icon: Server,
        accent: 'from-green-500 to-emerald-600',
        tag: 'Infraestructura',
    },
    {
        href: '/sms-admin',
        title: 'Administración SMS',
        desc: 'Lista blanca de números, simulador de SMS y auditoría completa de mensajes recibidos.',
        icon: MessageSquare,
        accent: 'from-amber-500 to-orange-600',
        tag: 'SMS',
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
                    integrando OCR, SMS, PDF y dashboard analítico en tiempo real.
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
                        <strong>Carga de PDFs</strong>
                        <p>La captura de actas usa Expo + React Native. Ver instrucciones en <code>mobile-app/README.md</code>.</p>
                    </div>
                </div>
            </section>
        </div>
    );
}
