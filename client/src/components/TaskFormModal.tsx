import { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { shipsApi, authApi, tasksApi, aiApi, inventoryApi, type Ship, type User } from '../api';
import './TaskFormModal.css';

const CATEGORIES = [
    { value: 'spawanie', label: '🔥 Spawanie' },
    { value: 'malowanie', label: '🎨 Malowanie' },
    { value: 'mechanika_silnikowa', label: '⚙️ Mechanika' },
    { value: 'elektryka', label: '⚡ Elektryka' },
    { value: 'hydraulika', label: '🔧 Hydraulika' },
    { value: 'stolarka', label: '🪵 Stolarka' },
    { value: 'inspekcja', label: '🔍 Inspekcja' },
    { value: 'logistyka', label: '🚚 Logistyka' },
    { value: 'rejs_probny', label: '⛵ Rejs próbny' },
    { value: 'inne', label: '📋 Inne' },
];

const PRIORITIES = [
    { value: 'critical', label: '🔴 Krytyczny' },
    { value: 'high', label: '🟠 Wysoki' },
    { value: 'normal', label: '🔵 Normalny' },
    { value: 'low', label: '⚪ Niski' },
];

interface TaskFormData {
    title: string;
    description: string;
    ship_id: number | null;
    category: string;
    priority: string;
    estimated_hours: string;
    deadline: string;
    weather_dependent: boolean;
    assignee_ids: number[];
    logistics_notes: string;
}

interface MaterialItem {
    name: string;
    quantity: number;
    unit: string;
    inventory_id: number | null;
    in_stock: number;
    to_buy: number;
    selected: boolean;
}

interface Props {
    onClose: () => void;
    onSave: (data: Record<string, unknown>) => void;
    onDelete?: (id: number) => void;
    initialData?: Partial<TaskFormData> & { id?: number };
    mode: 'create' | 'edit';
}

const emptyForm: TaskFormData = {
    title: '',
    description: '',
    ship_id: null,
    category: 'inne',
    priority: 'normal',
    estimated_hours: '',
    deadline: '',
    weather_dependent: false,
    assignee_ids: [],
    logistics_notes: '',
};

export default function TaskFormModal({ onClose, onSave, onDelete, initialData, mode }: Props) {
    const { token } = useAuth();
    const [form, setForm] = useState<TaskFormData>({ ...emptyForm, ...initialData });
    const [ships, setShips] = useState<Ship[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [expanded, setExpanded] = useState(mode === 'edit');

    // --- Materials step (create mode only) ---
    const [step, setStep] = useState<'form' | 'materials'>('form');
    const [materials, setMaterials] = useState<MaterialItem[]>([]);
    const [loadingMaterials, setLoadingMaterials] = useState(false);
    const [createdTaskId, setCreatedTaskId] = useState<number | null>(null);
    const [savingMaterials, setSavingMaterials] = useState(false);
    const [newMatName, setNewMatName] = useState('');
    const [newMatQty, setNewMatQty] = useState('');
    const [newMatUnit, setNewMatUnit] = useState('szt');

    useEffect(() => {
        if (!token) return;
        shipsApi.list(token).then(d => setShips(d.ships)).catch(() => { });
        authApi.listUsers(token).then(d => setUsers(d.users.filter(u => u.is_active))).catch(() => { });
    }, [token]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.title.trim() || form.title.trim().length < 3) {
            setError('Tytuł musi mieć min. 3 znaki');
            return;
        }
        setSaving(true);
        setError('');

        const data: Record<string, unknown> = {
            title: form.title.trim(),
            category: form.category,
            priority: form.priority,
            weather_dependent: form.weather_dependent,
        };
        if (form.description.trim()) data.description = form.description.trim();
        if (form.ship_id) data.ship_id = form.ship_id;
        if (form.estimated_hours) data.estimated_hours = parseFloat(form.estimated_hours);
        if (form.deadline) data.deadline = form.deadline;
        if (form.assignee_ids.length > 0) data.assignee_ids = form.assignee_ids;
        if (form.logistics_notes.trim()) data.logistics_notes = form.logistics_notes.trim();

        if (mode === 'edit') {
            // Edit mode — just save and close (no material generation)
            onSave(data);
            return;
        }

        // Create mode — create task, then generate materials
        try {
            if (!token) return;
            const result = await tasksApi.create(token, data);
            setCreatedTaskId(result.task.id);

            // Start AI material generation in parallel
            setStep('materials');
            setLoadingMaterials(true);
            setSaving(false);

            try {
                const aiResult = await aiApi.generateMaterials(token, {
                    title: form.title.trim(),
                    category: form.category,
                    ship_id: form.ship_id,
                    description: form.description.trim() || undefined,
                });

                setMaterials(aiResult.materials.map(m => ({ ...m, selected: true })));
            } catch {
                // AI failed — still show the modal with empty materials
                setMaterials([]);
            } finally {
                setLoadingMaterials(false);
            }
        } catch {
            setError('Błąd tworzenia zadania');
            setSaving(false);
        }
    };

    const handleSaveMaterials = async () => {
        if (!token || !createdTaskId) {
            onClose();
            window.dispatchEvent(new Event('tasks-updated'));
            return;
        }

        setSavingMaterials(true);
        const selected = materials.filter(m => m.selected);

        try {
            for (const mat of selected) {
                await inventoryApi.addTaskMaterial(token, createdTaskId, {
                    name: mat.name,
                    quantity_needed: mat.quantity,
                    unit: mat.unit,
                    inventory_id: mat.inventory_id || undefined,
                });
            }
        } catch {
            // Ignore — some might fail
        }

        setSavingMaterials(false);
        onClose();
        // Force parent refresh by navigating (onSave already happened via tasksApi.create)
        window.dispatchEvent(new Event('tasks-updated'));
    };

    const handleSkipMaterials = () => {
        onClose();
        window.dispatchEvent(new Event('tasks-updated'));
    };

    const toggleMaterial = (idx: number) => {
        setMaterials(prev => prev.map((m, i) => i === idx ? { ...m, selected: !m.selected } : m));
    };

    const addCustomMaterial = () => {
        const name = newMatName.trim();
        if (!name) return;
        const qty = parseFloat(newMatQty) || 1;
        setMaterials(prev => [...prev, {
            name,
            quantity: qty,
            unit: newMatUnit.trim() || 'szt',
            inventory_id: null,
            in_stock: 0,
            to_buy: qty,
            selected: true,
        }]);
        setNewMatName('');
        setNewMatQty('');
        setNewMatUnit('szt');
    };

    const toggleAssignee = (userId: number) => {
        setForm(prev => ({
            ...prev,
            assignee_ids: prev.assignee_ids.includes(userId)
                ? prev.assignee_ids.filter(id => id !== userId)
                : [...prev.assignee_ids, userId],
        }));
    };

    // --- Materials Step UI ---
    if (step === 'materials') {
        const shopping = materials.filter(m => m.selected && m.to_buy > 0);

        return (
            <div className="modal-overlay" onClick={handleSkipMaterials}>
                <div className="modal-content task-form-modal" onClick={e => e.stopPropagation()}>
                    <div className="tfm-header">
                        <h2>📦 Materiały do zadania</h2>
                        <button className="modal-close" onClick={handleSkipMaterials} type="button">✕</button>
                    </div>

                    <div className="tfm-materials-info">
                        <span className="tfm-task-title">🔧 {form.title}</span>
                    </div>

                    {loadingMaterials ? (
                        <div className="tfm-materials-loading">
                            <div className="ai-typing"><span></span><span></span><span></span></div>
                            <p>AI analizuje zadanie i generuje listę materiałów...</p>
                        </div>
                    ) : materials.length === 0 ? (
                        <div className="tfm-materials-empty">
                            <p>AI nie wygenerowało listy materiałów. Dodaj ręcznie:</p>
                            <div className="tfm-add-material-row">
                                <input className="tfm-input" type="text" placeholder="Nazwa materiału..."
                                    value={newMatName} onChange={e => setNewMatName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomMaterial())} />
                                <input className="tfm-input tfm-add-qty" type="number" min="0.1" step="0.1" placeholder="Ile"
                                    value={newMatQty} onChange={e => setNewMatQty(e.target.value)} />
                                <input className="tfm-input tfm-add-unit" type="text" placeholder="j."
                                    value={newMatUnit} onChange={e => setNewMatUnit(e.target.value)} />
                                <button type="button" className="btn btn-sm btn-primary" onClick={addCustomMaterial}>+ Dodaj</button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="tfm-materials-list">
                                {materials.map((mat, i) => (
                                    <label key={i} className={`tfm-material-item ${mat.to_buy > 0 ? 'shortage' : 'ok'}`}>
                                        <input
                                            type="checkbox"
                                            checked={mat.selected}
                                            onChange={() => toggleMaterial(i)}
                                        />
                                        <span className="tfm-mat-name">{mat.name}</span>
                                        <span className="tfm-mat-qty">{mat.quantity} {mat.unit}</span>
                                        <span className={`tfm-mat-stock ${mat.in_stock >= mat.quantity ? 'enough' : 'low'}`}>
                                            {mat.in_stock > 0
                                                ? `📦 ${mat.in_stock} ${mat.unit}`
                                                : '📦 brak'}
                                        </span>
                                        {mat.to_buy > 0 && (
                                            <span className="tfm-mat-buy">🛒 kup {mat.to_buy} {mat.unit}</span>
                                        )}
                                    </label>
                                ))}
                            </div>

                            {/* Add custom material */}
                            <div className="tfm-add-material-row">
                                <input
                                    className="tfm-input"
                                    type="text"
                                    placeholder="Nazwa materiału..."
                                    value={newMatName}
                                    onChange={e => setNewMatName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomMaterial())}
                                />
                                <input
                                    className="tfm-input tfm-add-qty"
                                    type="number"
                                    min="0.1"
                                    step="0.1"
                                    placeholder="Ile"
                                    value={newMatQty}
                                    onChange={e => setNewMatQty(e.target.value)}
                                />
                                <input
                                    className="tfm-input tfm-add-unit"
                                    type="text"
                                    placeholder="j."
                                    value={newMatUnit}
                                    onChange={e => setNewMatUnit(e.target.value)}
                                />
                                <button type="button" className="btn btn-sm btn-primary" onClick={addCustomMaterial}>
                                    + Dodaj
                                </button>
                            </div>

                            {shopping.length > 0 && (
                                <div className="tfm-shopping-summary">
                                    ⚠️ <strong>{shopping.length}</strong> pozycji do kupienia
                                </div>
                            )}
                        </>
                    )}

                    <div className="tfm-actions">
                        <button type="button" className="btn btn-ghost" onClick={handleSkipMaterials}>
                            Pomiń
                        </button>
                        {materials.length > 0 && (
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleSaveMaterials}
                                disabled={savingMaterials || materials.filter(m => m.selected).length === 0}
                            >
                                {savingMaterials ? '⏳ Zapisuję...' : `💾 Zapisz materiały (${materials.filter(m => m.selected).length})`}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // --- Form Step UI ---
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content task-form-modal" onClick={e => e.stopPropagation()}>
                <div className="tfm-header">
                    <h2>{mode === 'create' ? '➕ Nowe zadanie' : '✏️ Edycja zadania'}</h2>
                    <button className="modal-close" onClick={onClose} type="button">✕</button>
                </div>

                <form onSubmit={handleSubmit} className="tfm-form">
                    {error && <div className="tfm-error">{error}</div>}

                    {/* Delete button for edit mode */}
                    {mode === 'edit' && onDelete && initialData?.id && (
                        <button
                            type="button"
                            className="btn btn-danger btn-sm tfm-delete-btn"
                            onClick={() => onDelete(initialData.id!)}
                        >
                            🗑️ Usuń zadanie
                        </button>
                    )}

                    {/* Tytuł — zawsze widoczny */}
                    <div className="tfm-row">
                        <input
                            className="tfm-input tfm-title"
                            type="text"
                            placeholder="Nazwa zadania..."
                            value={form.title}
                            onChange={e => setForm({ ...form, title: e.target.value })}
                            autoFocus
                        />
                    </div>

                    {/* Szybki wiersz: kategoria + priorytet + statek */}
                    <div className="tfm-row tfm-quick-row">
                        <select
                            className="tfm-select"
                            value={form.category}
                            onChange={e => setForm({ ...form, category: e.target.value })}
                        >
                            {CATEGORIES.map(c => (
                                <option key={c.value} value={c.value}>{c.label}</option>
                            ))}
                        </select>
                        <select
                            className="tfm-select"
                            value={form.priority}
                            onChange={e => setForm({ ...form, priority: e.target.value })}
                        >
                            {PRIORITIES.map(p => (
                                <option key={p.value} value={p.value}>{p.label}</option>
                            ))}
                        </select>
                        <select
                            className="tfm-select"
                            value={form.ship_id ?? ''}
                            onChange={e => setForm({ ...form, ship_id: e.target.value ? parseInt(e.target.value) : null })}
                        >
                            <option value="">Oba / brak</option>
                            {ships.map(s => (
                                <option key={s.id} value={s.id}>{s.short_name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Toggle: więcej opcji */}
                    {!expanded && (
                        <button
                            type="button"
                            className="tfm-expand-btn"
                            onClick={() => setExpanded(true)}
                        >
                            ▾ Więcej opcji
                        </button>
                    )}

                    {expanded && (
                        <div className="tfm-details">
                            <textarea
                                className="tfm-input tfm-textarea"
                                placeholder="Opis (opcjonalnie)..."
                                value={form.description}
                                onChange={e => setForm({ ...form, description: e.target.value })}
                                rows={3}
                            />

                            <div className="tfm-row tfm-quick-row">
                                <div className="tfm-field">
                                    <label>⏱ Szacowany czas (h)</label>
                                    <input
                                        className="tfm-input"
                                        type="number"
                                        step="0.5"
                                        min="0"
                                        placeholder="np. 8"
                                        value={form.estimated_hours}
                                        onChange={e => setForm({ ...form, estimated_hours: e.target.value })}
                                    />
                                </div>
                                <div className="tfm-field">
                                    <label>📅 Deadline</label>
                                    <input
                                        className="tfm-input"
                                        type="date"
                                        value={form.deadline}
                                        onChange={e => setForm({ ...form, deadline: e.target.value })}
                                    />
                                </div>
                            </div>

                            <label className="tfm-checkbox">
                                <input
                                    type="checkbox"
                                    checked={form.weather_dependent}
                                    onChange={e => setForm({ ...form, weather_dependent: e.target.checked })}
                                />
                                🌤️ Pogodozależne
                            </label>

                            <textarea
                                className="tfm-input tfm-textarea"
                                placeholder="Notatki logistyczne (opcjonalnie)..."
                                value={form.logistics_notes}
                                onChange={e => setForm({ ...form, logistics_notes: e.target.value })}
                                rows={2}
                            />

                            {users.length > 0 && (
                                <div className="tfm-assignees">
                                    <label>👷 Przypisz do:</label>
                                    <div className="tfm-assignee-list">
                                        {users.map(u => (
                                            <button
                                                key={u.id}
                                                type="button"
                                                className={`tfm-assignee-btn ${form.assignee_ids.includes(u.id) ? 'active' : ''}`}
                                                onClick={() => toggleAssignee(u.id)}
                                            >
                                                {u.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="tfm-actions">
                        <button type="button" className="btn btn-ghost" onClick={onClose}>
                            Anuluj
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? 'Tworzę...' : mode === 'create' ? '➕ Utwórz' : '💾 Zapisz'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
