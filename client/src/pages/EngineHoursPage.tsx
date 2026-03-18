import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { engineHoursApi, type EngineHoursEntry, type ServiceInterval, type ServiceAlert, type ServiceLog } from '../api';

export default function EngineHoursPage() {
    const { token } = useAuth();
    const [hours, setHours] = useState<EngineHoursEntry[]>([]);
    const [intervals, setIntervals] = useState<ServiceInterval[]>([]);
    const [alerts, setAlerts] = useState<ServiceAlert[]>([]);
    const [logs, setLogs] = useState<ServiceLog[]>([]);
    const [loading, setLoading] = useState(true);

    const loadData = useCallback(() => {
        if (!token) return;
        Promise.all([
            engineHoursApi.list(token),
            engineHoursApi.intervals(token),
            engineHoursApi.alerts(token),
            engineHoursApi.logs(token),
        ]).then(([h, i, a, l]) => {
            setHours(h.engine_hours);
            setIntervals(i.intervals);
            setAlerts(a.alerts);
            setLogs(l.logs);
        }).catch(console.error)
            .finally(() => setLoading(false));
    }, [token]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleLogService = async (intervalId: number) => {
        if (!token) return;
        const notes = prompt('Notatki serwisowe (opcjonalne):');
        try {
            await engineHoursApi.logService(token, { interval_id: intervalId, notes: notes || undefined });
            loadData();
        } catch (e) { console.error(e); }
    };

    const handleAddHours = async (equipmentId: number) => {
        if (!token) return;
        const input = prompt('Ile motogodzin dodać?');
        if (!input) return;
        const h = parseFloat(input);
        if (isNaN(h) || h <= 0) return;
        try {
            await engineHoursApi.addHours(token, equipmentId, h);
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

    return (
        <div className="page-container">
            <header className="page-header">
                <div>
                    <h1>⚙️ Motogodziny i serwis</h1>
                    <p className="page-subtitle">Moduł 2.9 — Liczniki godzin pracy, interwały serwisowe, historia serwisów</p>
                </div>
                <Link to="/dashboard" className="btn btn-ghost btn-sm">← Dashboard</Link>
            </header>

            {/* Alerts */}
            {alerts.length > 0 && (
                <div className="card" style={{ borderLeft: '4px solid var(--error)', marginBottom: '1.5rem' }}>
                    <h3 style={{ margin: '0 0 0.75rem', color: 'var(--error)' }}>🔔 Alerty serwisowe</h3>
                    {alerts.map((a, i) => (
                        <div key={i} style={{
                            padding: '0.5rem 0.75rem', marginBottom: '0.25rem', borderRadius: '6px',
                            background: a.level === 'overdue' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                            color: a.level === 'overdue' ? '#f87171' : '#fbbf24',
                            fontSize: 'var(--font-sm)',
                        }}>
                            {a.message}
                        </div>
                    ))}
                </div>
            )}

            {/* Engine hours counters */}
            <section style={{ marginBottom: '2rem' }}>
                <h2 className="section-title">📊 Liczniki motogodzin</h2>
                {hours.length === 0 ? (
                    <div className="card empty-state"><p>Brak zarejestrowanych liczników. Dodaj z poziomu sprzętu.</p></div>
                ) : (
                    <div className="grid-2" style={{ gap: '1rem' }}>
                        {hours.map(h => (
                            <div key={h.id} className="card" style={{ padding: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <h4 style={{ margin: 0 }}>{h.equipment_name}</h4>
                                        <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
                                            {h.ship_name ?? 'Brak statku'} • {h.equipment_type}
                                        </span>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{h.current_hours.toFixed(1)}h</div>
                                        <button className="btn btn-ghost btn-sm" onClick={() => handleAddHours(h.equipment_id)}
                                            style={{ fontSize: 'var(--font-xs)' }}>
                                            ➕ Dodaj godziny
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Service intervals */}
            <section style={{ marginBottom: '2rem' }}>
                <h2 className="section-title">🔧 Interwały serwisowe</h2>
                {intervals.length === 0 ? (
                    <div className="card empty-state"><p>Brak zdefiniowanych interwałów.</p></div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {intervals.map(interval => {
                            const pct = interval.interval_hours > 0
                                ? Math.min(100, (interval.hours_since_service / interval.interval_hours) * 100) : 0;
                            const barColor = interval.is_overdue ? 'var(--error)' : interval.is_due_soon ? 'var(--warning)' : 'var(--primary)';

                            return (
                                <div key={interval.id} className="card" style={{ padding: '1rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                        <div>
                                            <strong>{interval.name}</strong>
                                            <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                                                {interval.equipment_name}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                            {interval.is_overdue && <span className="badge" style={{ background: 'var(--error)', color: '#fff' }}>PRZETERMINOWANY</span>}
                                            {interval.is_due_soon && <span className="badge" style={{ background: 'var(--warning)', color: '#000' }}>ZBLIŻA SIĘ</span>}
                                            <button className="btn btn-primary btn-sm" onClick={() => handleLogService(interval.id)}
                                                style={{ fontSize: 'var(--font-xs)' }}>
                                                ✅ Wykonano
                                            </button>
                                        </div>
                                    </div>
                                    <div className="progress-bar" style={{ height: 8 }}>
                                        <div className="progress-fill" style={{ width: `${pct}%`, background: barColor }} />
                                    </div>
                                    <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'flex', justifyContent: 'space-between' }}>
                                        <span>{interval.hours_since_service.toFixed(0)}h / {interval.interval_hours}h</span>
                                        <span>{interval.hours_until_due > 0 ? `Za ${interval.hours_until_due.toFixed(0)}h` : `Przekroczone o ${Math.abs(interval.hours_until_due).toFixed(0)}h`}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* Service logs */}
            <section>
                <h2 className="section-title">📝 Historia serwisów</h2>
                {logs.length === 0 ? (
                    <div className="card empty-state"><p>Brak wpisów serwisowych.</p></div>
                ) : (
                    <div className="card" style={{ padding: 0 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                    <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: 'var(--font-xs)' }}>Data</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: 'var(--font-xs)' }}>Serwis</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: 'var(--font-xs)' }}>Urządzenie</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'right', fontSize: 'var(--font-xs)' }}>Przy h</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: 'var(--font-xs)' }}>Notatki</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.slice(0, 20).map(log => (
                                    <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '0.5rem 0.75rem', fontSize: 'var(--font-sm)' }}>
                                            {new Date(log.created_at).toLocaleDateString('pl-PL')}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.75rem', fontSize: 'var(--font-sm)' }}>{log.interval_name}</td>
                                        <td style={{ padding: '0.5rem 0.75rem', fontSize: 'var(--font-sm)' }}>{log.equipment_name}</td>
                                        <td style={{ padding: '0.5rem 0.75rem', fontSize: 'var(--font-sm)', textAlign: 'right' }}>{log.hours_at_service.toFixed(0)}h</td>
                                        <td style={{ padding: '0.5rem 0.75rem', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>{log.notes || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}
