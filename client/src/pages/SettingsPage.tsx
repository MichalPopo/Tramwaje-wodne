import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../AuthContext';
import { apiKeysApi, configApi, type ApiKeyStatus } from '../api';
import './SettingsPage.css';

export default function SettingsPage() {
    const { token } = useAuth();
    const [keys, setKeys] = useState<ApiKeyStatus[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newKey, setNewKey] = useState('');
    const [newLabel, setNewLabel] = useState('');
    const [error, setError] = useState('');
    const [seasonStart, setSeasonStart] = useState('');

    const loadKeys = useCallback(async () => {
        if (!token) return;
        try {
            const data = await apiKeysApi.list(token);
            setKeys(data.keys);
        } catch { /* ignore */ }
        setLoading(false);
    }, [token]);

    const loadConfig = useCallback(async () => {
        if (!token) return;
        try {
            const data = await configApi.get(token, 'season_start');
            setSeasonStart(data.value);
        } catch { /* ignore */ }
    }, [token]);

    useEffect(() => { loadKeys(); loadConfig(); }, [loadKeys, loadConfig]);

    const handleAddKey = async () => {
        if (!token || !newKey.trim()) return;
        setError('');
        try {
            const data = await apiKeysApi.add(token, newKey.trim(), newLabel.trim());
            setKeys(prev => [...prev, data.key]);
            setNewKey('');
            setNewLabel('');
            setShowAddForm(false);
        } catch (e: any) {
            setError(e.message || 'Nie udało się dodać klucza');
        }
    };

    const handleRemoveKey = async (id: number) => {
        if (!token || !confirm('Na pewno usunąć ten klucz?')) return;
        await apiKeysApi.remove(token, id);
        setKeys(prev => prev.filter(k => k.id !== id));
    };

    const handleToggle = async (id: number, active: boolean) => {
        if (!token) return;
        await apiKeysApi.toggle(token, id, active);
        setKeys(prev => prev.map(k => k.id === id ? { ...k, is_active: active, is_available: active } : k));
    };

    const handleClearCooldown = async (id: number) => {
        if (!token) return;
        await apiKeysApi.clearCooldown(token, id);
        setKeys(prev => prev.map(k => k.id === id ? { ...k, cooldown_until: null, is_available: k.is_active } : k));
    };

    const handleSeasonSave = async () => {
        if (!token || !seasonStart) return;
        await configApi.set(token, 'season_start', seasonStart);
    };

    const activeCount = keys.filter(k => k.is_active).length;
    const availableCount = keys.filter(k => k.is_available).length;
    const totalRequests = keys.reduce((s, k) => s + k.total_requests, 0);

    return (
        <div className="settings-page">
            <header className="settings-header">
                <div className="dash-header-left">
                    <span className="dash-logo">⚓</span>
                    <div>
                        <h1 className="dash-title">Ustawienia</h1>
                        <p className="dash-subtitle">Konfiguracja systemu</p>
                    </div>
                </div>
                <a href="/dashboard" className="btn btn-ghost btn-sm">← Dashboard</a>
            </header>

            <main className="settings-content container">
                {/* API Keys Section */}
                <section className="settings-section animate-fade-in">
                    <div className="settings-section-header">
                        <h2>🔑 Klucze API Gemini</h2>
                        <div className="key-stats">
                            <span className="key-stat">{activeCount} aktywnych</span>
                            <span className="key-stat available">{availableCount} dostępnych</span>
                            <span className="key-stat">{totalRequests} zapytań łącznie</span>
                        </div>
                    </div>

                    <p className="settings-desc">
                        System automatycznie rotuje klucze API. Gdy jeden klucz wyczerpie limit (429/403),
                        przełącza się na następny. Dodaj kilka kluczy z różnych kont Google.
                    </p>

                    {error && <div className="settings-error">⚠️ {error}</div>}

                    {loading ? (
                        <div className="spinner" style={{ width: 24, height: 24, margin: '2rem auto' }} />
                    ) : (
                        <div className="key-list">
                            {keys.length === 0 && !showAddForm && (
                                <div className="key-empty">
                                    <p>Brak kluczy API w bazie. System używa klucza z pliku .env</p>
                                    <p style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
                                        Dodaj klucze tutaj, żeby włączyć auto-rotację
                                    </p>
                                </div>
                            )}

                            {keys.map(key => (
                                <div key={key.id} className={`key-card ${!key.is_active ? 'disabled' : ''} ${!key.is_available && key.is_active ? 'cooldown' : ''}`}>
                                    <div className="key-card-main">
                                        <div className="key-card-left">
                                            <span className={`key-dot ${key.is_available ? 'green' : key.is_active ? 'orange' : 'red'}`} />
                                            <div>
                                                <span className="key-label">{key.label || 'Klucz API'}</span>
                                                <span className="key-masked">{key.masked_key}</span>
                                            </div>
                                        </div>
                                        <div className="key-card-stats">
                                            <span title="Zapytania">📊 {key.total_requests}</span>
                                            <span title="Błędy">❌ {key.total_errors}</span>
                                            {key.last_used && (
                                                <span title="Ostatnio użyty">
                                                    🕐 {new Date(key.last_used).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {key.cooldown_until && new Date(key.cooldown_until) > new Date() && (
                                        <div className="key-cooldown">
                                            ⏳ Cooldown do: {new Date(key.cooldown_until).toLocaleTimeString('pl-PL')}
                                            <button className="btn btn-ghost btn-sm" onClick={() => handleClearCooldown(key.id)}>
                                                Wyczyść
                                            </button>
                                        </div>
                                    )}

                                    <div className="key-card-actions">
                                        <button
                                            className={`btn btn-sm ${key.is_active ? 'btn-warning' : 'btn-success'}`}
                                            onClick={() => handleToggle(key.id, !key.is_active)}
                                        >
                                            {key.is_active ? '⏸ Wstrzymaj' : '▶️ Aktywuj'}
                                        </button>
                                        <button className="btn btn-ghost btn-sm" onClick={() => handleRemoveKey(key.id)}>
                                            🗑️ Usuń
                                        </button>
                                    </div>
                                </div>
                            ))}

                            {showAddForm ? (
                                <div className="key-add-form card">
                                    <h3>Dodaj nowy klucz</h3>
                                    <div className="input-group">
                                        <label className="input-label">Klucz API</label>
                                        <input
                                            className="input"
                                            type="password"
                                            placeholder="AIzaSy..."
                                            value={newKey}
                                            onChange={e => setNewKey(e.target.value)}
                                            autoFocus
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label className="input-label">Nazwa (opcjonalnie)</label>
                                        <input
                                            className="input"
                                            type="text"
                                            placeholder="np. Konto Michał #2"
                                            value={newLabel}
                                            onChange={e => setNewLabel(e.target.value)}
                                        />
                                    </div>
                                    <div className="key-add-actions">
                                        <button className="btn btn-ghost" onClick={() => { setShowAddForm(false); setError(''); }}>
                                            Anuluj
                                        </button>
                                        <button className="btn btn-primary" onClick={handleAddKey} disabled={!newKey.trim()}>
                                            ✅ Dodaj klucz
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button className="btn btn-primary key-add-btn" onClick={() => setShowAddForm(true)}>
                                    ➕ Dodaj klucz API
                                </button>
                            )}
                        </div>
                    )}
                </section>

                {/* Season start */}
                <section className="settings-section animate-fade-in" style={{ animationDelay: '0.1s' }}>
                    <h2>📅 Start sezonu</h2>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <input
                            className="input"
                            type="date"
                            value={seasonStart}
                            onChange={e => setSeasonStart(e.target.value)}
                            style={{ maxWidth: 200 }}
                        />
                        <button className="btn btn-primary btn-sm" onClick={handleSeasonSave}>
                            💾 Zapisz
                        </button>
                    </div>
                </section>
            </main>
        </div>
    );
}
