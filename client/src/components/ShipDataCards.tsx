import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../AuthContext';
import { shipsApi, type Ship } from '../api';
import './ShipDataCards.css';

const SPEC_LABELS: Record<string, string> = {
    length_m: 'Długość',
    width_m: 'Szerokość',
    height_m: 'Wysokość',
    draft_m: 'Zanurzenie',
    engine: 'Napęd',
    generator: 'Generator',
    fuel_capacity_l: 'Paliwo',
    construction: 'Konstrukcja',
    wintering: 'Zimowanie',
    route: 'Trasa',
    capacity_indoor: 'Salon',
    capacity_outdoor: 'Pokład',
};

const SPEC_UNITS: Record<string, string> = {
    length_m: 'm',
    width_m: 'm',
    height_m: 'm',
    draft_m: 'm',
    fuel_capacity_l: 'L',
    capacity_indoor: 'os.',
    capacity_outdoor: 'os.',
};

const SPEC_ICONS: Record<string, string> = {
    length_m: '📏',
    width_m: '↔️',
    height_m: '↕️',
    draft_m: '🌊',
    engine: '⚙️',
    generator: '🔌',
    fuel_capacity_l: '⛽',
    construction: '🔧',
    wintering: '❄️',
    route: '🗺️',
    capacity_indoor: '🪑',
    capacity_outdoor: '☀️',
};

const SHIP_EMOJIS = ['⛵', '🚤', '🛥️', '🚢', '⛴️', '🛳️'];

interface EditForm {
    name: string;
    short_name: string;
    notes: string;
    specs: { key: string; value: string }[];
}

function emptyForm(): EditForm {
    return { name: '', short_name: '', notes: '', specs: [] };
}

function shipToForm(ship: Ship): EditForm {
    return {
        name: ship.name,
        short_name: ship.short_name,
        notes: ship.notes || '',
        specs: Object.entries(ship.specs).map(([key, value]) => ({
            key,
            value: String(value),
        })),
    };
}

export default function ShipDataCards() {
    const { token, user } = useAuth();
    const [ships, setShips] = useState<Ship[]>([]);
    const [expanded, setExpanded] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<number | 'new' | null>(null);
    const [form, setForm] = useState<EditForm>(emptyForm());
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

    const isAdmin = user?.role === 'admin';

    const loadShips = () => {
        if (!token) return;
        shipsApi.list(token)
            .then(data => setShips(data.ships))
            .catch(() => { })
            .finally(() => setLoading(false));
    };

    useEffect(() => { loadShips(); }, [token]);

    const startEdit = (ship: Ship) => {
        setEditingId(ship.id);
        setForm(shipToForm(ship));
        setError('');
    };

    const startCreate = () => {
        setEditingId('new');
        setForm(emptyForm());
        setError('');
    };

    const cancelEdit = () => {
        setEditingId(null);
        setForm(emptyForm());
        setError('');
        setDeleteConfirm(null);
    };

    const updateSpec = (index: number, field: 'key' | 'value', val: string) => {
        setForm(prev => ({
            ...prev,
            specs: prev.specs.map((s, i) => i === index ? { ...s, [field]: val } : s),
        }));
    };

    const addSpec = () => {
        setForm(prev => ({
            ...prev,
            specs: [...prev.specs, { key: '', value: '' }],
        }));
    };

    const removeSpec = (index: number) => {
        setForm(prev => ({
            ...prev,
            specs: prev.specs.filter((_, i) => i !== index),
        }));
    };

    const saveShip = async () => {
        if (!token || !form.name.trim() || !form.short_name.trim()) {
            setError('Nazwa i skrót są wymagane');
            return;
        }

        setSaving(true);
        setError('');

        const specsObj: Record<string, string | number> = {};
        for (const { key, value } of form.specs) {
            if (key.trim()) {
                const num = Number(value);
                specsObj[key.trim()] = !isNaN(num) && value.trim() !== '' && /^[\d.]+$/.test(value.trim())
                    ? num
                    : value;
            }
        }

        try {
            if (editingId === 'new') {
                await shipsApi.create(token, {
                    name: form.name.trim(),
                    short_name: form.short_name.trim(),
                    specs: specsObj,
                    notes: form.notes.trim() || undefined,
                });
            } else if (typeof editingId === 'number') {
                await shipsApi.update(token, editingId, {
                    name: form.name.trim(),
                    short_name: form.short_name.trim(),
                    specs: specsObj,
                    notes: form.notes.trim() || null,
                });
            }
            cancelEdit();
            loadShips();
        } catch (err: any) {
            setError(err?.message || 'Błąd zapisu');
        } finally {
            setSaving(false);
        }
    };

    const deleteShip = async (id: number) => {
        if (!token) return;
        setSaving(true);
        try {
            await shipsApi.delete(token, id);
            cancelEdit();
            loadShips();
        } catch (err: any) {
            setError(err?.data?.error || err?.message || 'Nie można usunąć');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="ship-cards-wrapper">
                <h2 className="section-title">🚢 Dane techniczne statków</h2>
                <div className="grid-2">
                    <div className="card skeleton" style={{ height: 150 }} />
                    <div className="card skeleton" style={{ height: 150 }} />
                </div>
            </div>
        );
    }

    const editModal = (
        <div className="ship-edit-overlay">
            <div className="ship-edit-modal card">
                <h3>{editingId === 'new' ? '➕ Nowy statek' : '✏️ Edytuj statek'}</h3>

                <div className="ship-form-grid">
                    <div className="ship-form-field">
                        <label>Nazwa</label>
                        <input
                            className="input"
                            value={form.name}
                            onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="np. m/s Zefir"
                        />
                    </div>
                    <div className="ship-form-field">
                        <label>Skrót</label>
                        <input
                            className="input"
                            value={form.short_name}
                            onChange={e => setForm(prev => ({ ...prev, short_name: e.target.value }))}
                            placeholder="np. Zefir"
                        />
                    </div>
                </div>

                <div className="ship-form-field">
                    <label>Notatki</label>
                    <textarea
                        className="input ship-textarea"
                        value={form.notes}
                        onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                        placeholder="Opcjonalne notatki..."
                        rows={2}
                    />
                </div>

                <div className="ship-specs-editor">
                    <div className="ship-specs-header">
                        <label>Dane techniczne</label>
                        <button className="btn btn-ghost btn-sm" onClick={addSpec} type="button">
                            + Dodaj pole
                        </button>
                    </div>

                    {form.specs.map((spec, i) => (
                        <div key={i} className="ship-spec-row">
                            <input
                                className="input ship-spec-key"
                                value={spec.key}
                                onChange={e => updateSpec(i, 'key', e.target.value)}
                                placeholder="Nazwa (np. length_m)"
                                list="spec-keys"
                            />
                            <input
                                className="input ship-spec-val"
                                value={spec.value}
                                onChange={e => updateSpec(i, 'value', e.target.value)}
                                placeholder="Wartość"
                            />
                            <button
                                className="btn btn-ghost btn-sm ship-spec-del"
                                onClick={() => removeSpec(i)}
                                type="button"
                                title="Usuń"
                            >
                                ✕
                            </button>
                        </div>
                    ))}

                    <datalist id="spec-keys">
                        {Object.keys(SPEC_LABELS).map(k => (
                            <option key={k} value={k}>{SPEC_LABELS[k]}</option>
                        ))}
                    </datalist>
                </div>

                {error && <div className="ship-edit-error">{error}</div>}

                <div className="ship-edit-actions">
                    {typeof editingId === 'number' && (
                        deleteConfirm === editingId ? (
                            <div className="ship-delete-confirm">
                                <span>Na pewno?</span>
                                <button className="btn btn-ghost btn-sm" onClick={() => setDeleteConfirm(null)}>Nie</button>
                                <button className="btn btn-sm" style={{ background: 'var(--accent-red)' }} onClick={() => deleteShip(editingId)}>
                                    Tak, usuń
                                </button>
                            </div>
                        ) : (
                            <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => setDeleteConfirm(editingId)}
                                style={{ color: 'var(--accent-red)' }}
                            >
                                🗑 Usuń statek
                            </button>
                        )
                    )}
                    <div style={{ flex: 1 }} />
                    <button className="btn btn-ghost" onClick={cancelEdit} disabled={saving}>Anuluj</button>
                    <button className="btn btn-primary" onClick={saveShip} disabled={saving}>
                        {saving ? '⏳ Zapisuję...' : '💾 Zapisz'}
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <div className="ship-cards-wrapper">
            <div className="ship-header-row">
                <h2 className="section-title">🚢 Dane techniczne statków</h2>
                {isAdmin && !editingId && (
                    <button className="btn btn-primary btn-sm" onClick={startCreate}>
                        ➕ Dodaj statek
                    </button>
                )}
            </div>

            {/* Edit / Create modal — portaled to body to escape stacking contexts */}
            {editingId !== null && createPortal(editModal, document.body)}

            <div className="grid-2">
                {ships.map((ship, idx) => (
                    <div
                        key={ship.id}
                        className={`card ship-data-card ${expanded === ship.id ? 'expanded' : ''}`}
                    >
                        <button
                            className="ship-data-header"
                            onClick={() => setExpanded(expanded === ship.id ? null : ship.id)}
                            type="button"
                        >
                            <div className="sdh-left">
                                <span className="sdh-emoji">{SHIP_EMOJIS[idx % SHIP_EMOJIS.length]}</span>
                                <div>
                                    <div className="sdh-name">{ship.name}</div>
                                    <div className="sdh-route">
                                        {String(ship.specs.route || '')}
                                    </div>
                                </div>
                            </div>
                            <div className="sdh-right">
                                {isAdmin && (
                                    <button
                                        className="btn btn-ghost btn-sm ship-edit-btn"
                                        onClick={(e) => { e.stopPropagation(); startEdit(ship); }}
                                        type="button"
                                        title="Edytuj"
                                    >
                                        ✏️
                                    </button>
                                )}
                                <span className={`sdh-chevron ${expanded === ship.id ? 'open' : ''}`}>▾</span>
                            </div>
                        </button>

                        {expanded === ship.id && (
                            <div className="ship-specs-grid">
                                {Object.entries(ship.specs).map(([key, value]) => {
                                    const label = SPEC_LABELS[key] || key;
                                    const unit = SPEC_UNITS[key] || '';
                                    const icon = SPEC_ICONS[key] || '📋';

                                    return (
                                        <div key={key} className="spec-item">
                                            <span className="spec-icon">{icon}</span>
                                            <div>
                                                <div className="spec-label">{label}</div>
                                                <div className="spec-value">
                                                    {value}{unit && ` ${unit}`}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                                {ship.notes && (
                                    <div className="spec-item spec-notes">
                                        <span className="spec-icon">📝</span>
                                        <div>
                                            <div className="spec-label">Notatki</div>
                                            <div className="spec-value">{ship.notes}</div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
