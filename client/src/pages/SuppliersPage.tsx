import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import {
    suppliersApi, inventoryApi, type Supplier, type SupplierDetail, type SupplierInventoryLink,
    type SupplierShoppingGroup, type InventoryItem,
} from '../api';
import AiChat from '../components/AiChat';
import VoiceNoteButton from '../components/VoiceNoteButton';
import './SuppliersPage.css';

const CATEGORY_LABELS: Record<string, string> = {
    tool: '🔧 Narzędzie',
    material: '🧱 Materiał',
    part: '⚙️ Część',
};

type Tab = 'suppliers' | 'shopping';

export default function SuppliersPage() {
    const { user, token, logout } = useAuth();
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [shoppingGroups, setShoppingGroups] = useState<SupplierShoppingGroup[]>([]);
    const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    // Filters
    const [filterSearch, setFilterSearch] = useState('');
    const [filterCity, setFilterCity] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [activeTab, setActiveTab] = useState<Tab>('suppliers');

    // Modal — CRUD
    const [showModal, setShowModal] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
    const [form, setForm] = useState({
        name: '', contact_person: '', phone: '', email: '',
        address: '', city: '', notes: '',
        cat_tool: false, cat_material: false, cat_part: false,
    });

    // Modal — Links
    const [showLinkModal, setShowLinkModal] = useState(false);
    const [linkingSupplier, setLinkingSupplier] = useState<SupplierDetail | null>(null);
    const [linkForm, setLinkForm] = useState({ inventory_id: '', unit_price: '', notes: '' });

    const loadData = useCallback(() => {
        if (!token) return;
        Promise.all([
            suppliersApi.list(token),
            suppliersApi.shoppingList(token).catch(() => ({ groups: [] as SupplierShoppingGroup[] })),
            inventoryApi.list(token),
        ]).then(([sup, shopping, inv]) => {
            setSuppliers(sup.suppliers);
            setShoppingGroups(shopping.groups);
            setInventoryItems(inv.items);
        }).catch(console.error)
            .finally(() => setIsLoading(false));
    }, [token]);

    useEffect(() => { loadData(); }, [loadData]);

    // Derived
    const cities = [...new Set(suppliers.map(s => s.city).filter(Boolean))].sort();

    const filteredSuppliers = suppliers.filter(s => {
        if (filterSearch && !s.name.toLowerCase().includes(filterSearch.toLowerCase())
            && !(s.contact_person || '').toLowerCase().includes(filterSearch.toLowerCase())
            && !(s.city || '').toLowerCase().includes(filterSearch.toLowerCase())) return false;
        if (filterCity && s.city !== filterCity) return false;
        if (filterCategory && !s.categories.includes(filterCategory)) return false;
        return true;
    });

    // --- CRUD handlers ---

    const openCreate = () => {
        setEditingSupplier(null);
        setForm({ name: '', contact_person: '', phone: '', email: '', address: '', city: '', notes: '', cat_tool: false, cat_material: false, cat_part: false });
        setShowModal(true);
    };

    const openEdit = (supplier: Supplier) => {
        setEditingSupplier(supplier);
        setForm({
            name: supplier.name,
            contact_person: supplier.contact_person || '',
            phone: supplier.phone || '',
            email: supplier.email || '',
            address: supplier.address || '',
            city: supplier.city || '',
            notes: supplier.notes || '',
            cat_tool: supplier.categories.includes('tool'),
            cat_material: supplier.categories.includes('material'),
            cat_part: supplier.categories.includes('part'),
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!token || !form.name.trim()) return;
        setError('');
        try {
            const categories: string[] = [];
            if (form.cat_tool) categories.push('tool');
            if (form.cat_material) categories.push('material');
            if (form.cat_part) categories.push('part');

            const data: Record<string, unknown> = {
                name: form.name.trim(),
                categories,
            };
            if (form.contact_person) data.contact_person = form.contact_person;
            if (form.phone) data.phone = form.phone;
            if (form.email) data.email = form.email;
            if (form.address) data.address = form.address;
            if (form.city) data.city = form.city;
            if (form.notes) data.notes = form.notes;

            if (editingSupplier) {
                await suppliersApi.update(token, editingSupplier.id, data);
            } else {
                await suppliersApi.create(token, data);
            }
            setShowModal(false);
            loadData();
        } catch { setError('Błąd zapisu dostawcy'); }
    };

    const handleDelete = async (id: number) => {
        if (!token || !confirm('Usunąć tego dostawcę?')) return;
        try {
            await suppliersApi.remove(token, id);
            loadData();
        } catch { setError('Błąd usuwania'); }
    };

    const handleToggleActive = async (supplier: Supplier) => {
        if (!token) return;
        try {
            await suppliersApi.update(token, supplier.id, { is_active: !supplier.is_active });
            loadData();
        } catch { setError('Błąd zmiany statusu'); }
    };

    // --- Link handlers ---

    const openLinks = async (supplierId: number) => {
        if (!token) return;
        try {
            const { supplier } = await suppliersApi.get(token, supplierId);
            setLinkingSupplier(supplier);
            setLinkForm({ inventory_id: '', unit_price: '', notes: '' });
            setShowLinkModal(true);
        } catch { setError('Błąd ładowania powiązań'); }
    };

    const handleAddLink = async () => {
        if (!token || !linkingSupplier || !linkForm.inventory_id) return;
        try {
            await suppliersApi.linkInventory(token, linkingSupplier.id, {
                inventory_id: parseInt(linkForm.inventory_id),
                unit_price: linkForm.unit_price ? parseFloat(linkForm.unit_price) : undefined,
                notes: linkForm.notes || undefined,
            });
            // Reload supplier detail
            const { supplier } = await suppliersApi.get(token, linkingSupplier.id);
            setLinkingSupplier(supplier);
            setLinkForm({ inventory_id: '', unit_price: '', notes: '' });
            loadData();
        } catch { setError('Błąd dodawania powiązania'); }
    };

    const handleRemoveLink = async (linkId: number) => {
        if (!token || !linkingSupplier) return;
        try {
            await suppliersApi.unlinkInventory(token, linkId);
            const { supplier } = await suppliersApi.get(token, linkingSupplier.id);
            setLinkingSupplier(supplier);
            loadData();
        } catch { setError('Błąd usuwania powiązania'); }
    };

    if (isLoading) {
        return (
            <div className="suppliers-page">
                <div className="dashboard-loading">
                    <div className="spinner" style={{ width: 40, height: 40 }} />
                    <p>Ładowanie dostawców...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="suppliers-page">
            {/* Header */}
            <header className="dash-header">
                <div className="dash-header-left">
                    <Link to="/" className="dash-logo">⚓</Link>
                    <div>
                        <h1 className="dash-title">Dostawcy</h1>
                        <p className="dash-subtitle">Baza dostawców i optymalizacja zakupów</p>
                    </div>
                </div>
                <div className="dash-header-right">
                    <Link to="/" className="btn btn-ghost btn-sm">← Dashboard</Link>
                    <div className="dash-user">
                        <span className="dash-user-name">{user?.name}</span>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={logout}>Wyloguj</button>
                </div>
            </header>

            <main className="sup-content container">
                {error && <div className="dash-error" onClick={() => setError('')}>⚠️ {error} <span style={{ opacity: 0.5 }}>×</span></div>}

                {/* Tabs */}
                <div className="inv-tabs">
                    <button className={`inv-tab ${activeTab === 'suppliers' ? 'active' : ''}`} onClick={() => setActiveTab('suppliers')}>
                        🏪 Dostawcy ({suppliers.length})
                    </button>
                    <button className={`inv-tab ${activeTab === 'shopping' ? 'active' : ''}`} onClick={() => setActiveTab('shopping')}>
                        🛒 Zakupy wg dostawców ({shoppingGroups.length})
                    </button>
                </div>

                {/* === TAB: Suppliers === */}
                {activeTab === 'suppliers' && (
                    <>
                        {/* Filters */}
                        <div className="inv-filters">
                            <input
                                className="inv-search"
                                type="text"
                                placeholder="Szukaj dostawcy..."
                                value={filterSearch}
                                onChange={e => setFilterSearch(e.target.value)}
                            />
                            <select className="inv-filter-select" value={filterCity} onChange={e => setFilterCity(e.target.value)}>
                                <option value="">Wszystkie miasta</option>
                                {cities.map(c => <option key={c} value={c!}>{c}</option>)}
                            </select>
                            <select className="inv-filter-select" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                                <option value="">Wszystkie kategorie</option>
                                <option value="tool">🔧 Narzędzia</option>
                                <option value="material">🧱 Materiały</option>
                                <option value="part">⚙️ Części</option>
                            </select>
                            {user?.role === 'admin' && (
                                <button className="btn btn-primary btn-sm" onClick={openCreate}>➕ Dodaj dostawcę</button>
                            )}
                        </div>

                        {/* Table */}
                        <div className="inv-table-wrap card">
                            <table className="inv-table">
                                <thead>
                                    <tr>
                                        <th>Nazwa</th>
                                        <th>Miasto</th>
                                        <th>Kontakt</th>
                                        <th>Kategorie</th>
                                        <th>Status</th>
                                        <th>Akcje</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredSuppliers.map(supplier => (
                                        <tr key={supplier.id} className={!supplier.is_active ? 'sup-inactive-row' : ''}>
                                            <td className="inv-name">
                                                {supplier.name}
                                                {supplier.notes && <span className="inv-note-icon" title={supplier.notes}>📝</span>}
                                            </td>
                                            <td>
                                                {supplier.city || '—'}
                                                {supplier.address && <span className="sup-address" title={supplier.address}>📍</span>}
                                            </td>
                                            <td className="sup-contact">
                                                {supplier.contact_person && <div>{supplier.contact_person}</div>}
                                                {supplier.phone && <div className="sup-phone">📞 {supplier.phone}</div>}
                                                {supplier.email && <div className="sup-email">✉️ {supplier.email}</div>}
                                            </td>
                                            <td>
                                                <div className="sup-categories">
                                                    {supplier.categories.map(c => (
                                                        <span key={c} className="sup-cat-badge">{CATEGORY_LABELS[c] || c}</span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td>
                                                <span className={`sup-status-badge ${supplier.is_active ? 'active' : 'inactive'}`}>
                                                    {supplier.is_active ? '✅ Aktywny' : '⏸️ Nieaktywny'}
                                                </span>
                                            </td>
                                            <td className="inv-actions">
                                                {user?.role === 'admin' && (
                                                    <>
                                                        <button className="btn btn-ghost btn-sm" onClick={() => openLinks(supplier.id)} title="Powiązania z magazynem">🔗</button>
                                                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(supplier)}>✏️</button>
                                                        <button className="btn btn-ghost btn-sm" onClick={() => handleToggleActive(supplier)}>
                                                            {supplier.is_active ? '⏸️' : '▶️'}
                                                        </button>
                                                        <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(supplier.id)}>🗑️</button>
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredSuppliers.length === 0 && (
                                        <tr><td colSpan={6} className="inv-empty">Brak dostawców</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Map */}
                        {suppliers.filter(s => s.is_active && s.city).length > 0 && (
                            <div className="card sup-map-card animate-fade-in">
                                <h3 className="sup-map-title">📍 Mapa dostawców</h3>
                                <div className="sup-map-container">
                                    <iframe
                                        title="Mapa dostawców"
                                        className="sup-map-iframe"
                                        loading="lazy"
                                        referrerPolicy="no-referrer-when-downgrade"
                                        src={`https://maps.google.com/maps?q=${encodeURIComponent(
                                            suppliers
                                                .filter(s => s.is_active && s.city)
                                                .map(s => `${s.name} ${s.address || ''} ${s.city}`)
                                                .join(' | ') || 'Zalew Wiślany Tolkmicko'
                                        )}&z=9&output=embed&hl=pl`}
                                    />
                                </div>
                                <div className="sup-map-legend">
                                    {suppliers.filter(s => s.is_active && s.city).map(s => (
                                        <span key={s.id} className="sup-map-pin">📍 {s.name} — {s.city}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* === TAB: Shopping by Supplier === */}
                {activeTab === 'shopping' && (
                    <div className="sup-shopping">
                        {shoppingGroups.length === 0 ? (
                            <div className="card sup-shopping-empty">
                                <p className="inv-empty">Brak materiałów do kupienia lub brak powiązanych dostawców 🎉</p>
                                <p className="sup-shopping-hint">Powiąż dostawców z pozycjami magazynowymi, aby zobaczyć pogrupowaną listę zakupów.</p>
                            </div>
                        ) : (
                            shoppingGroups.map(group => (
                                <div key={group.supplier_id} className="card sup-shopping-group animate-fade-in">
                                    <div className="sup-shopping-header">
                                        <div>
                                            <h3>🏪 {group.supplier_name}</h3>
                                            <p className="sup-shopping-location">
                                                {group.city && <span>📍 {group.city}</span>}
                                                {group.address && <span> — {group.address}</span>}
                                                {group.phone && <span> | 📞 {group.phone}</span>}
                                            </p>
                                        </div>
                                        {group.total_estimated_cost > 0 && (
                                            <div className="sup-shopping-total">
                                                ~{group.total_estimated_cost.toFixed(2)} PLN
                                            </div>
                                        )}
                                    </div>
                                    <table className="inv-table">
                                        <thead>
                                            <tr>
                                                <th>Materiał</th>
                                                <th>Do kupienia</th>
                                                <th>Cena jdn.</th>
                                                <th>Szac. koszt</th>
                                                <th>Zadania</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {group.items.map((item, i) => (
                                                <tr key={i}>
                                                    <td className="inv-name">{item.name}</td>
                                                    <td>{item.to_buy}{item.unit ? ` ${item.unit}` : ''}</td>
                                                    <td>{item.unit_price ? `${item.unit_price.toFixed(2)} PLN` : '—'}</td>
                                                    <td className={`inv-qty-value ${item.estimated_cost ? 'low' : ''}`}>
                                                        {item.estimated_cost ? `${item.estimated_cost.toFixed(2)} PLN` : '—'}
                                                    </td>
                                                    <td className="inv-tasks-cell">{item.tasks.join(', ')}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </main>

            {/* === MODAL: Create/Edit Supplier === */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content sup-modal" onClick={e => e.stopPropagation()}>
                        <div className="tfm-header">
                            <h2>{editingSupplier ? '✏️ Edycja dostawcy' : '➕ Nowy dostawca'}</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
                        </div>
                        <div className="tfm-form">
                            <input className="tfm-input tfm-title" placeholder="Nazwa dostawcy..." value={form.name}
                                onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
                            <div className="tfm-quick-row">
                                <input className="tfm-input" placeholder="Osoba kontaktowa" value={form.contact_person}
                                    onChange={e => setForm({ ...form, contact_person: e.target.value })} />
                                <input className="tfm-input" placeholder="Telefon" value={form.phone}
                                    onChange={e => setForm({ ...form, phone: e.target.value })} />
                            </div>
                            <div className="tfm-quick-row">
                                <input className="tfm-input" placeholder="Email" value={form.email}
                                    onChange={e => setForm({ ...form, email: e.target.value })} />
                                <input className="tfm-input" placeholder="Miasto" value={form.city}
                                    onChange={e => setForm({ ...form, city: e.target.value })} />
                            </div>
                            <input className="tfm-input" placeholder="Adres (ul. Przemysłowa 8)" value={form.address}
                                onChange={e => setForm({ ...form, address: e.target.value })} />
                            <div className="sup-cat-checkboxes">
                                <span>Kategorie:</span>
                                <label><input type="checkbox" checked={form.cat_tool} onChange={e => setForm({ ...form, cat_tool: e.target.checked })} /> 🔧 Narzędzia</label>
                                <label><input type="checkbox" checked={form.cat_material} onChange={e => setForm({ ...form, cat_material: e.target.checked })} /> 🧱 Materiały</label>
                                <label><input type="checkbox" checked={form.cat_part} onChange={e => setForm({ ...form, cat_part: e.target.checked })} /> ⚙️ Części</label>
                            </div>
                            <textarea className="tfm-input tfm-textarea" placeholder="Notatki (opcjonalnie)" value={form.notes}
                                onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />
                            <div className="tfm-actions">
                                <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Anuluj</button>
                                <button className="btn btn-primary" onClick={handleSave}>
                                    {editingSupplier ? '💾 Zapisz' : '➕ Dodaj'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* === MODAL: Inventory Links === */}
            {showLinkModal && linkingSupplier && (
                <div className="modal-overlay" onClick={() => setShowLinkModal(false)}>
                    <div className="modal-content sup-link-modal" onClick={e => e.stopPropagation()}>
                        <div className="tfm-header">
                            <h2>🔗 Powiązania — {linkingSupplier.name}</h2>
                            <button className="modal-close" onClick={() => setShowLinkModal(false)}>✕</button>
                        </div>
                        <div className="sup-links-content">
                            {/* Existing links */}
                            {linkingSupplier.inventory_links.length > 0 ? (
                                <table className="inv-table">
                                    <thead>
                                        <tr>
                                            <th>Pozycja magazynowa</th>
                                            <th>Kategoria</th>
                                            <th>Cena jedn.</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {linkingSupplier.inventory_links.map((link: SupplierInventoryLink) => (
                                            <tr key={link.id}>
                                                <td className="inv-name">{link.inventory_name}</td>
                                                <td>{CATEGORY_LABELS[link.inventory_category] || link.inventory_category}</td>
                                                <td>{link.unit_price ? `${link.unit_price.toFixed(2)} ${link.currency}` : '—'}</td>
                                                <td>
                                                    <button className="btn btn-ghost btn-sm" onClick={() => handleRemoveLink(link.id)}>🗑️</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <p className="inv-empty">Brak powiązań</p>
                            )}

                            {/* Add link form */}
                            <div className="sup-add-link">
                                <h4>➕ Dodaj powiązanie</h4>
                                <div className="tfm-quick-row">
                                    <select className="tfm-select" value={linkForm.inventory_id}
                                        onChange={e => setLinkForm({ ...linkForm, inventory_id: e.target.value })}>
                                        <option value="">Wybierz pozycję magazynową...</option>
                                        {inventoryItems
                                            .filter(item => !linkingSupplier.inventory_links.some(l => l.inventory_id === item.id))
                                            .map(item => (
                                                <option key={item.id} value={item.id}>
                                                    {item.name} ({CATEGORY_LABELS[item.category]})
                                                </option>
                                            ))}
                                    </select>
                                    <input className="tfm-input" type="number" step="0.01" min="0" placeholder="Cena jedn. (PLN)"
                                        value={linkForm.unit_price}
                                        onChange={e => setLinkForm({ ...linkForm, unit_price: e.target.value })} />
                                </div>
                                <button className="btn btn-primary btn-sm" onClick={handleAddLink}
                                    disabled={!linkForm.inventory_id}>
                                    🔗 Powiąż
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
