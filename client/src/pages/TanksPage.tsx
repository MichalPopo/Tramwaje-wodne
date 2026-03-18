import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { tanksApi, type Tank, type TankAlert } from '../api';

const TYPE_CONFIG: Record<string, { icon: string; label: string; color: string; bgLow: string }> = {
    fuel: { icon: '⛽', label: 'Paliwo', color: '#f59e0b', bgLow: 'rgba(245,158,11,0.15)' },
    fresh_water: { icon: '💧', label: 'Woda pitna', color: '#3b82f6', bgLow: 'rgba(59,130,246,0.15)' },
    waste_water: { icon: '🚽', label: 'Nieczystości', color: '#8b5cf6', bgLow: 'rgba(139,92,246,0.15)' },
};

export default function TanksPage() {
    const { token } = useAuth();
    const [tanks, setTanks] = useState<Tank[]>([]);
    const [alerts, setAlerts] = useState<TankAlert[]>([]);
    const [loading, setLoading] = useState(true);

    const loadData = useCallback(() => {
        if (!token) return;
        Promise.all([
            tanksApi.list(token),
            tanksApi.alerts(token),
        ]).then(([t, a]) => {
            setTanks(t.tanks);
            setAlerts(a.alerts);
        }).catch(console.error)
            .finally(() => setLoading(false));
    }, [token]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleLogChange = async (tankId: number, logType: 'refill' | 'consumption' | 'drain') => {
        if (!token) return;
        const labels = { refill: 'Ile uzupełnić (L)?', consumption: 'Ile zużyto (L)?', drain: 'Ile odpompować (L)?' };
        const input = prompt(labels[logType]);
        if (!input) return;
        const amount = parseFloat(input);
        if (isNaN(amount) || amount <= 0) return;

        const changeAmount = logType === 'consumption' || logType === 'drain' ? -amount : amount;
        const notes = prompt('Notatki (opcjonalne):');

        try {
            await tanksApi.logChange(token, tankId, {
                change_amount: changeAmount,
                log_type: logType,
                notes: notes || undefined,
            });
            loadData();
        } catch (e) { console.error(e); }
    };

    if (loading) return (
        <div className="page-container">
            <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                <div className="spinner" style={{ width: 40, height: 40 }} />
            </div>
        </div>
    );

    // Group by ship
    const byShip = tanks.reduce((acc, t) => {
        const ship = t.ship_name;
        if (!acc[ship]) acc[ship] = [];
        acc[ship].push(t);
        return acc;
    }, {} as Record<string, Tank[]>);

    return (
        <div className="page-container">
            <header className="page-header">
                <div>
                    <h1>⛽ Zbiorniki i zużycie</h1>
                    <p className="page-subtitle">Moduł 2.10 — Paliwo, woda pitna, nieczystości</p>
                </div>
                <Link to="/dashboard" className="btn btn-ghost btn-sm">← Dashboard</Link>
            </header>

            {/* Alerts */}
            {alerts.length > 0 && (
                <div className="card" style={{ borderLeft: '4px solid var(--error)', marginBottom: '1.5rem' }}>
                    <h3 style={{ margin: '0 0 0.75rem', color: 'var(--error)' }}>🔔 Alerty zbiorników</h3>
                    {alerts.map((a, i) => (
                        <div key={i} style={{
                            padding: '0.5rem 0.75rem', marginBottom: '0.25rem', borderRadius: '6px',
                            background: a.level === 'danger' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                            color: a.level === 'danger' ? '#f87171' : '#fbbf24',
                            fontSize: 'var(--font-sm)',
                        }}>
                            {a.message}
                        </div>
                    ))}
                </div>
            )}

            {/* By ship */}
            {Object.entries(byShip).map(([shipName, shipTanks]) => (
                <section key={shipName} style={{ marginBottom: '2rem' }}>
                    <h2 className="section-title">🚢 {shipName}</h2>
                    <div className="grid-2" style={{ gap: '1rem' }}>
                        {shipTanks.map(tank => {
                            const cfg = TYPE_CONFIG[tank.type] ?? { icon: '📦', label: tank.type, color: '#6b7280', bgLow: 'rgba(107,114,128,0.15)' };
                            const isAlert = tank.is_low || tank.is_high;
                            const isWaste = tank.type === 'waste_water';
                            const barColor = isAlert ? 'var(--error)' : cfg.color;

                            return (
                                <div key={tank.id} className="card" style={{
                                    padding: '1.25rem',
                                    borderLeft: isAlert ? '4px solid var(--error)' : `4px solid ${cfg.color}`,
                                    background: isAlert ? cfg.bgLow : undefined,
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                        <div>
                                            <span style={{ fontSize: '1.25rem', marginRight: '0.5rem' }}>{cfg.icon}</span>
                                            <strong>{tank.name}</strong>
                                        </div>
                                        <span style={{ fontSize: '1.75rem', fontWeight: 700, color: isAlert ? 'var(--error)' : cfg.color }}>
                                            {tank.percent}%
                                        </span>
                                    </div>

                                    {/* Tank gauge bar */}
                                    <div style={{
                                        height: 12, borderRadius: 6,
                                        background: 'var(--bg-secondary)', overflow: 'hidden',
                                        marginBottom: '0.5rem',
                                    }}>
                                        <div style={{
                                            height: '100%', borderRadius: 6,
                                            width: `${tank.percent}%`,
                                            background: barColor,
                                            transition: 'width 0.5s ease',
                                        }} />
                                    </div>

                                    <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                        <span>{tank.current_level.toFixed(0)} / {tank.capacity} {tank.unit}</span>
                                        <span>Próg alertu: {isWaste ? `>${100 - tank.alert_threshold}%` : `<${tank.alert_threshold}%`}</span>
                                    </div>

                                    {/* Actions */}
                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        {!isWaste && (
                                            <button className="btn btn-primary btn-sm" style={{ fontSize: 'var(--font-xs)' }}
                                                onClick={() => handleLogChange(tank.id, 'refill')}>
                                                ➕ Uzupełnij
                                            </button>
                                        )}
                                        <button className="btn btn-ghost btn-sm" style={{ fontSize: 'var(--font-xs)' }}
                                            onClick={() => handleLogChange(tank.id, 'consumption')}>
                                            📉 Zużycie
                                        </button>
                                        {isWaste && (
                                            <button className="btn btn-ghost btn-sm" style={{ fontSize: 'var(--font-xs)' }}
                                                onClick={() => handleLogChange(tank.id, 'drain')}>
                                                🚽 Opróżnij
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            ))}

            {tanks.length === 0 && (
                <div className="card empty-state">
                    <p>🔧 Brak zarejestrowanych zbiorników. Dodaj zbiorniki poprzez API.</p>
                </div>
            )}
        </div>
    );
}
