import { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { weatherApi, type WeatherForecast, type DailyForecast } from '../api';
import './WeatherWidget.css';

const DAY_NAMES = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'];

function formatDay(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (d.getTime() === today.getTime()) return 'Dziś';
    if (d.getTime() === tomorrow.getTime()) return 'Jutro';
    return DAY_NAMES[d.getDay()];
}

export default function WeatherWidget() {
    const { token } = useAuth();
    const [forecast, setForecast] = useState<WeatherForecast | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!token) return;
        weatherApi.forecast(token)
            .then(setForecast)
            .catch(() => setError('Nie udało się pobrać pogody'))
            .finally(() => setLoading(false));
    }, [token]);

    if (loading) {
        return (
            <div className="weather-widget card">
                <div className="card-title">🌤️ Pogoda</div>
                <div className="skeleton" style={{ height: 120 }} />
            </div>
        );
    }

    if (error || !forecast) {
        return (
            <div className="weather-widget card">
                <div className="card-title">🌤️ Pogoda</div>
                <p className="weather-error">{error || 'Brak danych'}</p>
            </div>
        );
    }

    return (
        <div className="weather-widget card">
            <div className="card-header">
                <div className="card-title">🌤️ Pogoda — {forecast.location}</div>
            </div>

            {/* Work windows summary */}
            <div className="weather-windows">
                <div className={`weather-window ${forecast.painting_windows > 0 ? 'ok' : 'bad'}`}>
                    <span className="ww-icon">🎨</span>
                    <div>
                        <div className="ww-count">{forecast.painting_windows} / 7</div>
                        <div className="ww-label">Dni na malowanie</div>
                    </div>
                </div>
                <div className={`weather-window ${forecast.welding_windows > 0 ? 'ok' : 'bad'}`}>
                    <span className="ww-icon">🔥</span>
                    <div>
                        <div className="ww-count">{forecast.welding_windows} / 7</div>
                        <div className="ww-label">Dni na spawanie</div>
                    </div>
                </div>
            </div>

            {/* 7-day forecast */}
            <div className="weather-grid">
                {forecast.daily.map((day) => (
                    <DayCard key={day.date} day={day} />
                ))}
            </div>
        </div>
    );
}

function DayCard({ day }: { day: DailyForecast }) {
    return (
        <div className={`weather-day ${day.is_painting_window || day.is_welding_window ? 'good' : ''}`}>
            <div className="wd-name">{formatDay(day.date)}</div>
            <div className="wd-icon">{day.weather_icon}</div>
            <div className="wd-temp">
                <span className="wd-max">{Math.round(day.temp_max)}°</span>
                <span className="wd-min">{Math.round(day.temp_min)}°</span>
            </div>
            <div className="wd-details">
                <span title="Wiatr">💨 {Math.round(day.wind_speed_max)}</span>
                <span title="Opady">💧 {Math.round(day.precipitation_probability_max)}%</span>
            </div>
            <div className="wd-tags">
                {day.is_painting_window && <span className="wd-tag paint" title="Malowanie OK">🎨</span>}
                {day.is_welding_window && <span className="wd-tag weld" title="Spawanie OK">🔥</span>}
            </div>
        </div>
    );
}
