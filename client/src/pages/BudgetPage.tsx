import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { budgetApi, type SeasonSummary, type ShipCost, type CategoryCost } from '../api';
import './BudgetPage.css';

const CATEGORY_LABELS: Record<string, string> = {
    spawanie: 'Spawanie',
    malowanie: 'Malowanie',
    mechanika_silnikowa: 'Mechanika',
    elektryka: 'Elektryka',
    hydraulika: 'Hydraulika',
    stolarka: 'Stolarka',
    inspekcja: 'Inspekcja',
    logistyka: 'Logistyka',
    rejs_probny: 'Rejs próbny',
    inne: 'Inne',
};

const COLORS = [
    '#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444',
    '#ec4899', '#06b6d4', '#f97316', '#84cc16', '#6366f1',
];

function formatPLN(n: number): string {
    return n.toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' zł';
}

export default function BudgetPage() {
    const { user, token } = useAuth();
    const navigate = useNavigate();

    const [summary, setSummary] = useState<SeasonSummary | null>(null);
    const [shipCosts, setShipCosts] = useState<ShipCost[]>([]);
    const [catCosts, setCatCosts] = useState<CategoryCost[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Config editing
    const [editBudget, setEditBudget] = useState('');
    const [editRate, setEditRate] = useState('');
    const [saving, setSaving] = useState(false);

    // Canvas refs
    const shipChartRef = useRef<HTMLCanvasElement>(null);
    const catChartRef = useRef<HTMLCanvasElement>(null);

    const loadData = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        try {
            const [s, sc, cc] = await Promise.all([
                budgetApi.summary(token),
                budgetApi.byShip(token),
                budgetApi.byCategory(token),
            ]);
            setSummary(s);
            setShipCosts(sc.costs);
            setCatCosts(cc.costs);
            setEditBudget(String(s.budget));
            setEditRate(String(s.hourly_rate));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Błąd ładowania');
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => { loadData(); }, [loadData]);

    // Draw ship bar chart
    useEffect(() => {
        const canvas = shipChartRef.current;
        if (!canvas || shipCosts.length === 0) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);

        ctx.clearRect(0, 0, w, h);

        const maxVal = Math.max(...shipCosts.map(c => Math.max(c.total_actual, c.estimated_cost)), 1);
        const barHeight = Math.min(40, (h - 20) / (shipCosts.length * 2));
        const labelWidth = 160;
        const chartWidth = w - labelWidth - 60;

        shipCosts.forEach((cost, i) => {
            const y = i * (barHeight * 2 + 12) + 10;

            // Label
            ctx.font = '12px Inter, sans-serif';
            ctx.fillStyle = '#94a3b8';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(cost.ship_name, labelWidth - 10, y + barHeight);

            // Estimated bar (ghost)
            const estW = (cost.estimated_cost / maxVal) * chartWidth;
            ctx.fillStyle = 'rgba(148, 163, 184, 0.15)';
            ctx.roundRect(labelWidth, y, Math.max(estW, 2), barHeight, 4);
            ctx.fill();

            // Actual bar (colored)
            const actW = (cost.total_actual / maxVal) * chartWidth;
            const gradient = ctx.createLinearGradient(labelWidth, 0, labelWidth + actW, 0);
            gradient.addColorStop(0, COLORS[i % COLORS.length]);
            gradient.addColorStop(1, COLORS[i % COLORS.length] + '88');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.roundRect(labelWidth, y + barHeight + 2, Math.max(actW, 2), barHeight, 4);
            ctx.fill();

            // Values
            ctx.fillStyle = '#64748b';
            ctx.font = '11px Inter, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(`Plan: ${formatPLN(cost.estimated_cost)}`, labelWidth + Math.max(estW, 2) + 8, y + barHeight / 2);
            ctx.fillStyle = '#e2e8f0';
            ctx.fillText(`Fakt: ${formatPLN(cost.total_actual)}`, labelWidth + Math.max(actW, 2) + 8, y + barHeight + 2 + barHeight / 2);
        });
    }, [shipCosts]);

    // Draw category donut chart
    useEffect(() => {
        const canvas = catChartRef.current;
        if (!canvas || catCosts.length === 0) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);

        ctx.clearRect(0, 0, w, h);

        const total = catCosts.reduce((s, c) => s + c.estimated_cost, 0);
        if (total === 0) {
            ctx.font = '14px Inter, sans-serif';
            ctx.fillStyle = '#64748b';
            ctx.textAlign = 'center';
            ctx.fillText('Brak danych kosztowych', w / 2, h / 2);
            return;
        }

        const cx = w / 2;
        const cy = h / 2;
        const radius = Math.min(cx, cy) - 30;
        const innerRadius = radius * 0.55;

        let start = -Math.PI / 2;
        catCosts.forEach((cost, i) => {
            const slice = (cost.estimated_cost / total) * Math.PI * 2;
            if (slice < 0.01) return;

            ctx.beginPath();
            ctx.arc(cx, cy, radius, start, start + slice);
            ctx.arc(cx, cy, innerRadius, start + slice, start, true);
            ctx.closePath();
            ctx.fillStyle = COLORS[i % COLORS.length];
            ctx.fill();

            // Label
            if (slice > 0.15) {
                const mid = start + slice / 2;
                const lx = cx + Math.cos(mid) * (radius + innerRadius) / 2;
                const ly = cy + Math.sin(mid) * (radius + innerRadius) / 2;
                ctx.font = 'bold 11px Inter, sans-serif';
                ctx.fillStyle = '#fff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(CATEGORY_LABELS[cost.category] || cost.category, lx, ly);
            }

            start += slice;
        });

        // Center text
        ctx.font = 'bold 18px Inter, sans-serif';
        ctx.fillStyle = '#e2e8f0';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(formatPLN(total), cx, cy - 8);
        ctx.font = '12px Inter, sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText('szacowany koszt', cx, cy + 12);
    }, [catCosts]);

    const handleSaveConfig = async () => {
        if (!token) return;
        setSaving(true);
        try {
            const data: { season_budget?: number; hourly_rate?: number } = {};
            const b = parseFloat(editBudget);
            const r = parseFloat(editRate);
            if (!isNaN(b)) data.season_budget = b;
            if (!isNaN(r)) data.hourly_rate = r;
            const result = await budgetApi.updateConfig(token, data);
            setSummary(result);
        } catch { /* ignore */ } finally {
            setSaving(false);
        }
    };

    if (!user || user.role !== 'admin') return null;

    return (
        <div className="budget-page">
            <div className="budget-header">
                <div className="budget-header-left">
                    <button className="budget-back-btn" onClick={() => navigate('/dashboard')}>
                        ← Dashboard
                    </button>
                    <h1>💰 Budżet i koszty</h1>
                </div>
            </div>

            {loading ? (
                <div className="budget-loading">Ładowanie danych budżetowych…</div>
            ) : error ? (
                <div className="budget-error">{error}</div>
            ) : summary && (
                <>
                    {/* Summary cards */}
                    <div className="budget-cards">
                        <div className="budget-card budget-card-total">
                            <div className="budget-card-label">Budżet sezonu</div>
                            <div className="budget-card-value">{formatPLN(summary.budget)}</div>
                            <div className="budget-card-sub">{summary.task_count} zadań • {summary.done_count} ukończonych</div>
                        </div>
                        <div className={`budget-card ${summary.percent_used > 90 ? 'budget-card-danger' : summary.percent_used > 70 ? 'budget-card-warn' : 'budget-card-ok'}`}>
                            <div className="budget-card-label">Wydano</div>
                            <div className="budget-card-value">{formatPLN(summary.total_spent)}</div>
                            <div className="budget-card-sub">{summary.percent_used}% budżetu</div>
                            <div className="budget-progress">
                                <div className="budget-progress-bar" style={{ width: `${Math.min(summary.percent_used, 100)}%` }} />
                            </div>
                        </div>
                        <div className="budget-card">
                            <div className="budget-card-label">Pozostało</div>
                            <div className="budget-card-value" style={{ color: summary.remaining < 0 ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                                {formatPLN(summary.remaining)}
                            </div>
                            <div className="budget-card-sub">
                                {summary.remaining < 0 ? '⚠️ Przekroczony budżet!' : '✅ W budżecie'}
                            </div>
                        </div>
                        <div className="budget-card">
                            <div className="budget-card-label">Podział kosztów</div>
                            <div className="budget-card-breakdown">
                                <div><span>🔧 Robocizna:</span> <strong>{formatPLN(summary.total_labor_cost)}</strong></div>
                                <div><span>📦 Materiały:</span> <strong>{formatPLN(summary.total_material_cost)}</strong></div>
                                <div><span>📋 Inne koszty:</span> <strong>{formatPLN(summary.total_actual_cost)}</strong></div>
                            </div>
                        </div>
                    </div>

                    {/* Config row */}
                    <div className="budget-config">
                        <div className="budget-config-field">
                            <label>💰 Budżet sezonu (PLN)</label>
                            <input type="number" value={editBudget} onChange={e => setEditBudget(e.target.value)} />
                        </div>
                        <div className="budget-config-field">
                            <label>⏱️ Stawka godzinowa (PLN/h)</label>
                            <input type="number" value={editRate} onChange={e => setEditRate(e.target.value)} />
                        </div>
                        <button className="btn btn-primary" onClick={handleSaveConfig} disabled={saving}>
                            {saving ? 'Zapisuję…' : '💾 Zapisz'}
                        </button>
                    </div>

                    {/* Charts */}
                    <div className="budget-charts">
                        <div className="budget-chart-box">
                            <h2>🚢 Koszty per statek</h2>
                            <canvas ref={shipChartRef} className="budget-canvas budget-canvas-bar" />
                            {/* Legend */}
                            <div className="budget-legend">
                                <span className="budget-legend-item"><span className="budget-legend-swatch" style={{ background: 'rgba(148,163,184,0.3)' }} /> Plan</span>
                                <span className="budget-legend-item"><span className="budget-legend-swatch" style={{ background: '#3b82f6' }} /> Fakt</span>
                            </div>
                        </div>
                        <div className="budget-chart-box">
                            <h2>📊 Koszty per kategoria</h2>
                            <canvas ref={catChartRef} className="budget-canvas budget-canvas-donut" />
                            <div className="budget-legend budget-legend-wrap">
                                {catCosts.map((c, i) => (
                                    <span key={c.category} className="budget-legend-item">
                                        <span className="budget-legend-swatch" style={{ background: COLORS[i % COLORS.length] }} />
                                        {CATEGORY_LABELS[c.category] || c.category} ({formatPLN(c.estimated_cost)})
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Task costs table */}
                    <div className="budget-table-section">
                        <h2>📋 Koszty zadań</h2>
                        <div className="budget-table-wrapper">
                            <table className="budget-table">
                                <thead>
                                    <tr>
                                        <th>Statek</th>
                                        <th>Zadań</th>
                                        <th>Plan (szac.)</th>
                                        <th>Robocizna</th>
                                        <th>Materiały</th>
                                        <th>Faktyczny</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {shipCosts.map(c => (
                                        <tr key={c.ship_id ?? 'infra'}>
                                            <td className="budget-table-name">{c.ship_name}</td>
                                            <td>{c.task_count}</td>
                                            <td>{formatPLN(c.estimated_cost)}</td>
                                            <td>{formatPLN(c.labor_cost)}</td>
                                            <td>{formatPLN(c.material_cost)}</td>
                                            <td className={c.total_actual > c.estimated_cost && c.estimated_cost > 0 ? 'budget-over' : ''}>
                                                {formatPLN(c.total_actual)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td><strong>Razem</strong></td>
                                        <td><strong>{shipCosts.reduce((s, c) => s + c.task_count, 0)}</strong></td>
                                        <td><strong>{formatPLN(shipCosts.reduce((s, c) => s + c.estimated_cost, 0))}</strong></td>
                                        <td><strong>{formatPLN(shipCosts.reduce((s, c) => s + c.labor_cost, 0))}</strong></td>
                                        <td><strong>{formatPLN(shipCosts.reduce((s, c) => s + c.material_cost, 0))}</strong></td>
                                        <td><strong>{formatPLN(shipCosts.reduce((s, c) => s + c.total_actual, 0))}</strong></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
