import { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { waterLevelApi, type WaterLevelResponse } from '../api';
import './WaterLevelWidget.css';

export default function WaterLevelWidget() {
    const { token } = useAuth();
    const [data, setData] = useState<WaterLevelResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!token) return;
        waterLevelApi.get(token)
            .then(setData)
            .catch(() => setError('Nie udało się pobrać danych IMGW'))
            .finally(() => setLoading(false));
    }, [token]);

    if (loading) {
        return (
            <div className="wl-widget card">
                <div className="wl-header">
                    <span className="wl-icon">🌊</span>
                    <h3 className="wl-title">Poziom wody</h3>
                </div>
                <div className="wl-loading">
                    <div className="spinner" style={{ width: 24, height: 24 }} />
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="wl-widget card wl-error">
                <div className="wl-header">
                    <span className="wl-icon">🌊</span>
                    <h3 className="wl-title">Poziom wody</h3>
                </div>
                <p className="wl-error-msg">⚠️ {error || 'Brak danych'}</p>
            </div>
        );
    }

    const { data: wl, alerts } = data;
    const maxAlert = alerts.reduce((max, a) => {
        const levels = { danger: 3, warning: 2, ok: 1 };
        return levels[a.level] > levels[max.level] ? a : max;
    }, alerts[0]);

    const levelClass = maxAlert?.level === 'danger' ? 'wl-danger'
        : maxAlert?.level === 'warning' ? 'wl-warning'
        : 'wl-ok';

    // Water level gauge percentage (normalized around 440-560 range for display)
    const gaugeMin = 420;
    const gaugeMax = 560;
    const gaugePercent = wl.water_level
        ? Math.min(100, Math.max(0, ((wl.water_level - gaugeMin) / (gaugeMax - gaugeMin)) * 100))
        : 50;

    // Format measurement time
    const measureTime = wl.water_level_date
        ? new Date(wl.water_level_date).toLocaleString('pl-PL', {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
        })
        : 'brak daty';

    return (
        <div className={`wl-widget card ${levelClass}`}>
            <div className="wl-header">
                <span className="wl-icon">🌊</span>
                <div>
                    <h3 className="wl-title">Poziom wody — {wl.station_name}</h3>
                    <span className="wl-river">{wl.river}</span>
                </div>
            </div>

            <div className="wl-body">
                {/* Main gauge */}
                <div className="wl-gauge">
                    <div className="wl-gauge-bar">
                        <div className="wl-gauge-fill" style={{ height: `${gaugePercent}%` }} />
                        <div className="wl-gauge-danger-line" title="Niebezpieczny próg: 440 cm" />
                        <div className="wl-gauge-warning-line" title="Próg ostrzegawczy: 460 cm" />
                    </div>
                    <div className="wl-gauge-value">
                        <span className="wl-level-number">{wl.water_level ?? '—'}</span>
                        <span className="wl-level-unit">cm</span>
                    </div>
                </div>

                {/* Details */}
                <div className="wl-details">
                    {wl.water_temp !== null && (
                        <div className="wl-detail-item">
                            <span className="wl-detail-icon">🌡️</span>
                            <span className="wl-detail-value">{wl.water_temp}°C</span>
                            <span className="wl-detail-label">Temp. wody</span>
                        </div>
                    )}
                    <div className="wl-detail-item">
                        <span className="wl-detail-icon">🧊</span>
                        <span className="wl-detail-value">{wl.ice_phenomenon === 0 ? 'Brak' : `Kod ${wl.ice_phenomenon}`}</span>
                        <span className="wl-detail-label">Lód</span>
                    </div>
                    <div className="wl-detail-item">
                        <span className="wl-detail-icon">📅</span>
                        <span className="wl-detail-value wl-time">{measureTime}</span>
                        <span className="wl-detail-label">Pomiar</span>
                    </div>
                </div>
            </div>

            {/* Alerts */}
            {alerts.length > 0 && (
                <div className="wl-alerts">
                    {alerts.map((alert, i) => (
                        <div key={i} className={`wl-alert wl-alert-${alert.level}`}>
                            {alert.message}
                        </div>
                    ))}
                </div>
            )}

            <div className="wl-footer">
                Źródło: IMGW-PIB • dane aktualizowane co 30 min
            </div>
        </div>
    );
}
