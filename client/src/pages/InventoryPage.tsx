import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { inventoryApi, shipsApi, type InventoryItem, type ShoppingListItem, type Ship } from '../api';
import AiChat from '../components/AiChat';
import VoiceNoteButton from '../components/VoiceNoteButton';
import './InventoryPage.css';

const CATEGORY_LABELS: Record<string, string> = {
    tool: '🔧 Narzędzie',
    material: '🧱 Materiał',
    part: '⚙️ Część',
};

const PREDEFINED_LOCATIONS = [
    'Magazyn główny',
    'Magazyn narzędzi',
    'Maszynownia Zefir',
    'Maszynownia Wiatr',
    'Pokład Zefir',
    'Pokład Wiatr',
    'Sterówka Zefir',
    'Sterówka Wiatr',
    'Garaż',
    'Warsztat',
    'Biuro',
    'Stocznia',
];

export default function InventoryPage() {
    const { user, token, logout } = useAuth();
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [ships, setShips] = useState<Ship[]>([]);
    const [shoppingList, setShoppingList] = useState<ShoppingListItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    // Filters
    const [filterCategory, setFilterCategory] = useState('');
    const [filterSearch, setFilterSearch] = useState('');
    const [showLowStock, setShowLowStock] = useState(false);
    const [activeTab, setActiveTab] = useState<'inventory' | 'shopping'>('inventory');

    // Modal
    const [showModal, setShowModal] = useState(false);
    const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

    // Purchase modal
    const [purchaseItem, setPurchaseItem] = useState<ShoppingListItem | null>(null);
    const [purchaseQty, setPurchaseQty] = useState('');

    // Form
    const [form, setForm] = useState({
        name: '', category: 'material', unit: '', quantity: '0',
        min_quantity: '', location: '', ship_id: '', notes: '',
    });

    const loadData = useCallback(() => {
        if (!token) return;
        Promise.all([
            inventoryApi.list(token),
            inventoryApi.shoppingList(token).catch(() => ({ items: [] as ShoppingListItem[] })),
            shipsApi.list(token),
        ]).then(([inv, shopping, sh]) => {
            setItems(inv.items);
            setShoppingList(shopping.items);
            setShips(sh.ships);
        }).catch(console.error)
            .finally(() => setIsLoading(false));
    }, [token]);

    useEffect(() => { loadData(); }, [loadData]);

    const filteredItems = items.filter(item => {
        if (filterCategory && item.category !== filterCategory) return false;
        if (filterSearch && !item.name.toLowerCase().includes(filterSearch.toLowerCase())) return false;
        if (showLowStock && !item.is_low_stock) return false;
        return true;
    });

    const lowStockCount = items.filter(i => i.is_low_stock).length;

    // Unique locations: predefined + from existing items
    const allLocations = useMemo(() => {
        const fromItems = items.map(i => i.location).filter(Boolean) as string[];
        const merged = new Set([...PREDEFINED_LOCATIONS, ...fromItems]);
        return [...merged].sort((a, b) => a.localeCompare(b, 'pl'));
    }, [items]);

    const openCreate = () => {
        setEditingItem(null);
        setForm({ name: '', category: 'material', unit: '', quantity: '0', min_quantity: '', location: '', ship_id: '', notes: '' });
        setShowModal(true);
    };

    const openEdit = (item: InventoryItem) => {
        setEditingItem(item);
        setForm({
            name: item.name,
            category: item.category,
            unit: item.unit || '',
            quantity: item.quantity.toString(),
            min_quantity: item.min_quantity?.toString() || '',
            location: item.location || '',
            ship_id: item.ship_id?.toString() || '',
            notes: item.notes || '',
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!token || !form.name.trim()) return;
        setError('');
        try {
            const data: Record<string, unknown> = {
                name: form.name.trim(),
                category: form.category,
            };
            if (form.unit) data.unit = form.unit;
            if (form.quantity) data.quantity = parseFloat(form.quantity);
            if (form.min_quantity) data.min_quantity = parseFloat(form.min_quantity);
            if (form.location) data.location = form.location;
            if (form.ship_id) data.ship_id = parseInt(form.ship_id);
            if (form.notes) data.notes = form.notes;

            if (editingItem) {
                await inventoryApi.update(token, editingItem.id, data);
            } else {
                await inventoryApi.create(token, data);
            }
            setShowModal(false);
            loadData();
        } catch { setError('Błąd zapisu'); }
    };

    const handleDelete = async (id: number) => {
        if (!token || !confirm('Usunąć tę pozycję?')) return;
        try {
            await inventoryApi.remove(token, id);
            loadData();
        } catch { setError('Błąd usuwania'); }
    };

    const handleAdjust = async (id: number, delta: number) => {
        if (!token) return;
        try {
            await inventoryApi.adjustQuantity(token, id, delta);
            loadData();
        } catch { setError('Błąd zmiany stanu'); }
    };

    const handlePurchased = async () => {
        if (!token || !purchaseItem) return;
        const amount = parseFloat(purchaseQty);
        if (isNaN(amount) || amount <= 0) {
            setError('Podaj poprawną ilość');
            return;
        }
        try {
            const invItem = items.find(i => i.name === purchaseItem.name);
            if (invItem) {
                await inventoryApi.adjustQuantity(token, invItem.id, amount);
            }
            setPurchaseItem(null);
            setPurchaseQty('');
            loadData();
        } catch { setError('Błąd aktualizacji stanu magazynowego'); }
    };

    if (isLoading) {
        return (
            <div className="inventory-page">
                <div className="dashboard-loading">
                    <div className="spinner" style={{ width: 40, height: 40 }} />
                    <p>Ładowanie magazynu...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="inventory-page">
            {/* Header */}
            <header className="dash-header">
                <div className="dash-header-left">
                    <Link to="/" className="dash-logo">⚓</Link>
                    <div>
                        <h1 className="dash-title">Magazyn</h1>
                        <p className="dash-subtitle">Narzędzia, materiały, części</p>
                    </div>
                </div>
                <div className="dash-header-right">
                    <Link to={user?.role === 'admin' ? '/dashboard' : '/worker'} className="btn btn-ghost btn-sm">← Powrót</Link>
                    <div className="dash-user">
                        <span className="dash-user-name">{user?.name}</span>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={logout}>Wyloguj</button>
                </div>
            </header>

            <main className="inv-content container">
                {error && <div className="dash-error" onClick={() => setError('')}>⚠️ {error} <span style={{ opacity: 0.5 }}>×</span></div>}

                {/* Low stock alert */}
                {lowStockCount > 0 && (
                    <div className="inv-alert animate-fade-in">
                        ⚠️ <strong>{lowStockCount}</strong> pozycji poniżej minimalnego stanu
                        <button className="btn btn-ghost btn-sm" onClick={() => { setShowLowStock(true); setActiveTab('inventory'); }}>
                            Pokaż
                        </button>
                    </div>
                )}

                {/* Tabs */}
                <div className="inv-tabs">
                    <button className={`inv-tab ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => setActiveTab('inventory')}>
                        📦 Magazyn ({items.length})
                    </button>
                    <button className={`inv-tab ${activeTab === 'shopping' ? 'active' : ''}`} onClick={() => setActiveTab('shopping')}>
                        🛒 Lista zakupów ({shoppingList.length})
                    </button>
                </div>

                {activeTab === 'inventory' && (
                    <>
                        {/* Filters */}
                        <div className="inv-filters">
                            <input
                                className="inv-search"
                                type="text"
                                placeholder="Szukaj..."
                                value={filterSearch}
                                onChange={e => setFilterSearch(e.target.value)}
                            />
                            <select className="inv-filter-select" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                                <option value="">Wszystkie kategorie</option>
                                <option value="tool">🔧 Narzędzia</option>
                                <option value="material">🧱 Materiały</option>
                                <option value="part">⚙️ Części</option>
                            </select>
                            <label className="inv-checkbox">
                                <input type="checkbox" checked={showLowStock} onChange={e => setShowLowStock(e.target.checked)} />
                                ⚠️ Niski stan
                            </label>
                            {user?.role === 'admin' && (
                                <button className="btn btn-primary btn-sm" onClick={openCreate}>➕ Dodaj</button>
                            )}
                        </div>

                        {/* Table */}
                        <div className="inv-table-wrap card">
                            <table className="inv-table">
                                <thead>
                                    <tr>
                                        <th>Nazwa</th>
                                        <th>Kategoria</th>
                                        <th>Stan</th>
                                        <th>Lokalizacja</th>
                                        <th>Statek</th>
                                        <th>Akcje</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredItems.map(item => (
                                        <tr key={item.id} className={item.is_low_stock ? 'low-stock-row' : ''}>
                                            <td className="inv-name">
                                                {item.name}
                                                {item.notes && <span className="inv-note-icon" title={item.notes}>📝</span>}
                                            </td>
                                            <td>{CATEGORY_LABELS[item.category]}</td>
                                            <td className="inv-qty">
                                                <div className="inv-qty-group">
                                                    <button className="inv-qty-btn" onClick={() => handleAdjust(item.id, -1)}>−</button>
                                                    <span className={`inv-qty-value ${item.is_low_stock ? 'low' : ''}`}>
                                                        {item.quantity}{item.unit ? ` ${item.unit}` : ''}
                                                    </span>
                                                    <button className="inv-qty-btn" onClick={() => handleAdjust(item.id, 1)}>+</button>
                                                </div>
                                                {item.min_quantity !== null && (
                                                    <span className="inv-min">min: {item.min_quantity}</span>
                                                )}
                                            </td>
                                            <td>{item.location || '—'}</td>
                                            <td>{item.ship_name || 'Oba'}</td>
                                            <td className="inv-actions">
                                                {user?.role === 'admin' && (
                                                    <>
                                                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(item)}>✏️</button>
                                                        <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(item.id)}>🗑️</button>
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredItems.length === 0 && (
                                        <tr><td colSpan={6} className="inv-empty">Brak pozycji</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                {activeTab === 'shopping' && (
                    <div className="inv-shopping card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <div>
                                <h3>🛒 Lista zakupów</h3>
                                <p className="inv-shopping-subtitle">Zagregowane potrzeby materiałowe z aktywnych zadań</p>
                            </div>
                            <button className="btn btn-ghost btn-sm" onClick={() => setActiveTab('inventory')}>📦 Wróć do magazynu</button>
                        </div>
                        {shoppingList.length === 0 ? (
                            <p className="inv-empty">Wszystko zakupione! 🎉</p>
                        ) : (
                            <table className="inv-table">
                                <thead>
                                    <tr>
                                        <th>Materiał</th>
                                        <th>Potrzeba</th>
                                        <th>Na stanie</th>
                                        <th>Do kupienia</th>
                                        <th>Zadania</th>
                                        <th>Akcje</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {shoppingList.map((item, i) => (
                                        <tr key={i}>
                                            <td className="inv-name">{item.name}</td>
                                            <td>{item.total_needed}{item.unit ? ` ${item.unit}` : ''}</td>
                                            <td>{item.in_stock}{item.unit ? ` ${item.unit}` : ''}</td>
                                            <td className={`inv-qty-value ${item.to_buy > 0 ? 'low' : ''}`}>
                                                {item.to_buy}{item.unit ? ` ${item.unit}` : ''}
                                            </td>
                                            <td className="inv-tasks-cell">{item.tasks.join(', ')}</td>
                                            <td className="inv-actions">
                                                {item.to_buy > 0 && (
                                                    <button className="btn btn-primary btn-sm" onClick={() => { setPurchaseItem(item); setPurchaseQty(String(item.to_buy)); }} title="Oznacz jako kupione i dodaj do magazynu">
                                                        ✅ Kupiono
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}
            </main>

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content inv-modal" onClick={e => e.stopPropagation()}>
                        <div className="tfm-header">
                            <h2>{editingItem ? '✏️ Edycja' : '➕ Nowa pozycja'}</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
                        </div>
                        <div className="tfm-form">
                            <input className="tfm-input tfm-title" placeholder="Nazwa..." value={form.name}
                                onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
                            <div className="tfm-quick-row">
                                <select className="tfm-select" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                                    <option value="tool">🔧 Narzędzie</option>
                                    <option value="material">🧱 Materiał</option>
                                    <option value="part">⚙️ Część</option>
                                </select>
                                <input className="tfm-input" placeholder="Jednostka (szt, L, kg)" value={form.unit}
                                    onChange={e => setForm({ ...form, unit: e.target.value })} />
                            </div>
                            <div className="tfm-quick-row">
                                <div className="tfm-field">
                                    <label>Ilość</label>
                                    <input className="tfm-input" type="number" step="0.5" min="0" value={form.quantity}
                                        onChange={e => setForm({ ...form, quantity: e.target.value })} />
                                </div>
                                <div className="tfm-field">
                                    <label>Minimum</label>
                                    <input className="tfm-input" type="number" step="0.5" min="0" placeholder="opcjonalne" value={form.min_quantity}
                                        onChange={e => setForm({ ...form, min_quantity: e.target.value })} />
                                </div>
                            </div>
                            <div className="tfm-quick-row">
                                <div className="tfm-field" style={{ flex: 1 }}>
                                    <label>Lokalizacja</label>
                                    <input className="tfm-input" list="location-options" placeholder="Wybierz lub wpisz..." value={form.location}
                                        onChange={e => setForm({ ...form, location: e.target.value })} />
                                    <datalist id="location-options">
                                        {allLocations.map((loc: string) => <option key={loc} value={loc} />)}
                                    </datalist>
                                </div>
                                <select className="tfm-select" value={form.ship_id} onChange={e => setForm({ ...form, ship_id: e.target.value })}>
                                    <option value="">Oba / brak</option>
                                    {ships.map(s => <option key={s.id} value={String(s.id)}>{s.short_name}</option>)}
                                </select>
                            </div>
                            <textarea className="tfm-input tfm-textarea" placeholder="Notatki (opcjonalnie)" value={form.notes}
                                onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />
                            <div className="tfm-actions">
                                <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Anuluj</button>
                                <button className="btn btn-primary" onClick={handleSave}>
                                    {editingItem ? '💾 Zapisz' : '➕ Dodaj'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Purchase modal */}
            {purchaseItem && (
                <div className="modal-overlay" onClick={() => { setPurchaseItem(null); setPurchaseQty(''); }}>
                    <div className="modal-content inv-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
                        <div className="tfm-header">
                            <h2>✅ Kupiono</h2>
                            <button className="modal-close" onClick={() => { setPurchaseItem(null); setPurchaseQty(''); }}>✕</button>
                        </div>
                        <div className="tfm-form">
                            <p style={{ marginBottom: '0.75rem', color: 'var(--text-muted)' }}>
                                <strong>{purchaseItem.name}</strong> — potrzeba: {purchaseItem.to_buy} {purchaseItem.unit || 'szt'}
                            </p>
                            <label style={{ fontSize: 'var(--font-sm)', color: 'var(--text-dim)', marginBottom: '0.25rem', display: 'block' }}>Ile kupiono?</label>
                            <input
                                className="tfm-input"
                                type="number"
                                min="0.1"
                                step="0.5"
                                value={purchaseQty}
                                onChange={e => setPurchaseQty(e.target.value)}
                                autoFocus
                                style={{ fontSize: 'var(--font-lg)', textAlign: 'center', marginBottom: '0.5rem' }}
                            />
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                                {[purchaseItem.to_buy, Math.ceil(purchaseItem.to_buy * 1.5), purchaseItem.to_buy * 2].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map(v => (
                                    <button key={v} className="btn btn-ghost btn-sm" type="button" onClick={() => setPurchaseQty(String(v))}>
                                        {v} {purchaseItem.unit || 'szt'}
                                    </button>
                                ))}
                            </div>
                            <div className="tfm-actions">
                                <button className="btn btn-ghost" onClick={() => { setPurchaseItem(null); setPurchaseQty(''); }}>Anuluj</button>
                                <button className="btn btn-primary" onClick={handlePurchased} disabled={!purchaseQty || parseFloat(purchaseQty) <= 0}>
                                    ✅ Potwierdź zakup
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <AiChat />
            <VoiceNoteButton />
        </div>
    );
}
