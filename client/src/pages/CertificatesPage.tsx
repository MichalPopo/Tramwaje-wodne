import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../AuthContext';
import {
    certificatesApi,
    inspectionsApi,
    shipsApi,
    type Certificate,
    type InspectionTemplate,
    type Inspection,
    type Ship,
} from '../api';
import './CertificatesPage.css';

type Tab = 'certificates' | 'inspections';

interface CertForm {
    name: string;
    issuer: string;
    number: string;
    issue_date: string;
    expiry_date: string;
    ship_id: string;
    notes: string;
}

function emptyCertForm(): CertForm {
    return { name: '', issuer: '', number: '', issue_date: '', expiry_date: '', ship_id: '', notes: '' };
}

export default function CertificatesPage() {
    const { token, user } = useAuth();
    const isAdmin = user?.role === 'admin';

    // State
    const [tab, setTab] = useState<Tab>('certificates');
    const [certs, setCerts] = useState<Certificate[]>([]);
    const [templates, setTemplates] = useState<InspectionTemplate[]>([]);
    const [inspections, setInspections] = useState<Inspection[]>([]);
    const [ships, setShips] = useState<Ship[]>([]);
    const [loading, setLoading] = useState(true);
    const [shipFilter, setShipFilter] = useState('');
    const [error, setError] = useState('');

    // Cert form
    const [editingCert, setEditingCert] = useState<number | 'new' | null>(null);
    const [certForm, setCertForm] = useState<CertForm>(emptyCertForm());
    const [saving, setSaving] = useState(false);

    // Photo scan
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [scanPhotos, setScanPhotos] = useState<{ base64: string; mimeType: string; preview: string }[]>([]);
    const [scanning, setScanning] = useState(false);

    // Inspection form
    const [runningInsp, setRunningInsp] = useState<InspectionTemplate | null>(null);
    const [inspResults, setInspResults] = useState<{ label: string; ok: boolean; note: string }[]>([]);
    const [inspShip, setInspShip] = useState('');
    const [inspNotes, setInspNotes] = useState('');

    const load = async () => {
        if (!token) return;
        try {
            const [c, t, i, s] = await Promise.all([
                certificatesApi.list(token, shipFilter ? { ship_id: parseInt(shipFilter) } : undefined),
                inspectionsApi.templates(token),
                inspectionsApi.list(token, shipFilter ? { ship_id: parseInt(shipFilter) } : undefined),
                shipsApi.list(token),
            ]);
            setCerts(c.certificates);
            setTemplates(t.templates);
            setInspections(i.inspections);
            setShips(s.ships);
        } catch { setError('Błąd ładowania'); }
        finally { setLoading(false); }
    };

    useEffect(() => { load(); }, [token, shipFilter]);

    // --- Cert CRUD ---
    const openCertEditor = (cert?: Certificate) => {
        if (cert) {
            setEditingCert(cert.id);
            setCertForm({
                name: cert.name,
                issuer: cert.issuer || '',
                number: cert.number || '',
                issue_date: cert.issue_date || '',
                expiry_date: cert.expiry_date,
                ship_id: cert.ship_id ? String(cert.ship_id) : '',
                notes: cert.notes || '',
            });
        } else {
            setEditingCert('new');
            setCertForm(emptyCertForm());
        }
        setScanPhotos([]);
        setError('');
    };

    // --- Photo scan ---
    const handlePhotoFiles = (files: FileList) => {
        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = () => {
                const dataUrl = reader.result as string;
                const base64 = dataUrl.split(',')[1];
                setScanPhotos(prev => [...prev, {
                    base64,
                    mimeType: file.type || 'image/jpeg',
                    preview: dataUrl,
                }]);
            };
            reader.readAsDataURL(file);
        });
    };

    const removePhoto = (index: number) => {
        setScanPhotos(prev => prev.filter((_, i) => i !== index));
    };

    const runScan = async () => {
        if (!token || scanPhotos.length === 0) return;
        setScanning(true);
        setError('');
        try {
            const result = await certificatesApi.scan(
                token,
                scanPhotos.map(p => ({ base64: p.base64, mimeType: p.mimeType })),
            );
            if (result.extracted) {
                setCertForm(prev => ({
                    ...prev,
                    name: result.extracted!.name || prev.name,
                    issuer: result.extracted!.issuer || prev.issuer,
                    number: result.extracted!.number || prev.number,
                    issue_date: result.extracted!.issue_date || prev.issue_date,
                    expiry_date: result.extracted!.expiry_date || prev.expiry_date,
                    notes: result.extracted!.notes || prev.notes,
                }));
            } else {
                setError(result.error || 'AI nie rozpoznało certyfikatu');
            }
        } catch (err: any) { setError(err?.data?.error || err?.message || 'Błąd skanowania AI'); }
        finally { setScanning(false); }
    };

    const saveCert = async () => {
        if (!token || !certForm.name || !certForm.expiry_date) {
            setError('Nazwa i data ważności wymagane');
            return;
        }
        setSaving(true);
        setError('');
        try {
            const data = {
                name: certForm.name,
                issuer: certForm.issuer || undefined,
                number: certForm.number || undefined,
                issue_date: certForm.issue_date || undefined,
                expiry_date: certForm.expiry_date,
                ship_id: certForm.ship_id ? parseInt(certForm.ship_id) : null,
                notes: certForm.notes || undefined,
            };
            if (editingCert === 'new') {
                await certificatesApi.create(token, data);
            } else if (typeof editingCert === 'number') {
                await certificatesApi.update(token, editingCert, data);
            }
            setEditingCert(null);
            load();
        } catch (err: any) {
            console.error('Save error:', err);
            setError(err?.data?.error || err?.message || 'Błąd zapisu');
        }
        finally { setSaving(false); }
    };

    const deleteCert = async (id: number) => {
        if (!token || !confirm('Usunąć certyfikat?')) return;
        try {
            await certificatesApi.delete(token, id);
            load();
        } catch { setError('Błąd usuwania'); }
    };

    // --- Status helpers ---
    const getDaysLeft = (expiryDate: string) => {
        const diff = new Date(expiryDate).getTime() - Date.now();
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    };

    const getStatusBadge = (cert: Certificate) => {
        if (cert.status === 'renewed') return <span className="cert-badge renewed">🔄 Odnowiony</span>;
        if (cert.status === 'expired') return <span className="cert-badge expired">🔴 Wygasł</span>;
        const days = getDaysLeft(cert.expiry_date);
        if (days < 0) return <span className="cert-badge expired">🔴 Wygasł</span>;
        if (days <= 30) return <span className="cert-badge warning">🟡 {days} dni</span>;
        if (days <= 90) return <span className="cert-badge caution">🟠 {days} dni</span>;
        return <span className="cert-badge active">🟢 {days} dni</span>;
    };

    // --- Inspection ---
    const startInspection = (template: InspectionTemplate) => {
        setRunningInsp(template);
        setInspResults(template.items.map(item => ({ label: item.label, ok: false, note: '' })));
        setInspShip('');
        setInspNotes('');
    };

    const submitInspection = async () => {
        if (!token || !runningInsp) return;
        setSaving(true);
        try {
            await inspectionsApi.create(token, {
                template_id: runningInsp.id,
                ship_id: inspShip ? parseInt(inspShip) : undefined,
                results: inspResults,
                notes: inspNotes || undefined,
            });
            setRunningInsp(null);
            load();
        } catch { setError('Błąd zapisu inspekcji'); }
        finally { setSaving(false); }
    };

    if (loading) {
        return (
            <div className="page-container">
                <h1 className="page-title">📜 Certyfikaty i inspekcje</h1>
                <div className="card skeleton" style={{ height: 300 }} />
            </div>
        );
    }

    const expiringCount = certs.filter(c => c.status === 'active' && getDaysLeft(c.expiry_date) <= 30).length;

    return (
        <div className="page-container cert-page">
            <a href="/dashboard" className="btn btn-ghost btn-sm" style={{ marginBottom: '0.5rem', alignSelf: 'flex-start' }}>← Dashboard</a>
            <div className="cert-top-row">
                <h1 className="page-title">📜 Certyfikaty i inspekcje</h1>
                <select className="input cert-ship-filter" value={shipFilter} onChange={e => setShipFilter(e.target.value)}>
                    <option value="">Wszystkie statki</option>
                    {ships.map(s => <option key={s.id} value={s.id}>{s.short_name}</option>)}
                </select>
            </div>

            {/* Expiry alert */}
            {expiringCount > 0 && (
                <div className="cert-alert">
                    ⚠️ <strong>{expiringCount}</strong> certyfikat{expiringCount > 1 ? 'y wygasaj' : ' wygasa'}ą w ciągu 30 dni!
                </div>
            )}

            {/* Tabs */}
            <div className="cert-tabs">
                <button className={`cert-tab ${tab === 'certificates' ? 'active' : ''}`} onClick={() => setTab('certificates')}>
                    📜 Certyfikaty ({certs.length})
                </button>
                <button className={`cert-tab ${tab === 'inspections' ? 'active' : ''}`} onClick={() => setTab('inspections')}>
                    ✅ Inspekcje ({inspections.length})
                </button>
            </div>

            {/* === CERTIFICATES TAB === */}
            {tab === 'certificates' && (
                <div className="cert-content">
                    {isAdmin && (
                        <button className="btn btn-primary btn-sm" onClick={() => openCertEditor()} style={{ marginBottom: '0.75rem' }}>
                            ➕ Dodaj certyfikat
                        </button>
                    )}

                    {certs.length === 0 ? (
                        <div className="cert-empty">Brak certyfikatów</div>
                    ) : (
                        <div className="cert-table-wrap">
                            <table className="cert-table">
                                <thead>
                                    <tr>
                                        <th>Nazwa</th>
                                        <th>Statek</th>
                                        <th>Wydawca</th>
                                        <th>Numer</th>
                                        <th>Ważny do</th>
                                        <th>Status</th>
                                        {isAdmin && <th></th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {certs.map(cert => (
                                        <tr key={cert.id} className={getDaysLeft(cert.expiry_date) <= 30 ? 'cert-row-warn' : ''}>
                                            <td className="cert-name-cell">
                                                <strong>{cert.name}</strong>
                                                {cert.notes && <div className="cert-note">{cert.notes}</div>}
                                            </td>
                                            <td>{cert.ship_name || '—'}</td>
                                            <td>{cert.issuer || '—'}</td>
                                            <td><code>{cert.number || '—'}</code></td>
                                            <td>{cert.expiry_date}</td>
                                            <td>{getStatusBadge(cert)}</td>
                                            {isAdmin && (
                                                <td className="cert-actions-cell">
                                                    <button className="btn btn-ghost btn-sm" onClick={() => openCertEditor(cert)}>✏️</button>
                                                    <button className="btn btn-ghost btn-sm" onClick={() => deleteCert(cert.id)} style={{ color: 'var(--accent-red)' }}>🗑</button>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* === INSPECTIONS TAB === */}
            {tab === 'inspections' && (
                <div className="cert-content">
                    {/* Templates */}
                    <h3 className="cert-section-title">📋 Szablony inspekcji</h3>
                    <div className="insp-templates-grid">
                        {templates.map(t => (
                            <div key={t.id} className="card insp-template-card">
                                <div className="insp-template-header">
                                    <h4>{t.name}</h4>
                                    <span className="insp-item-count">{t.items.length} punktów</span>
                                </div>
                                <ul className="insp-preview">
                                    {t.items.slice(0, 3).map((item, i) => (
                                        <li key={i}>{item.required ? '⬜' : '◻️'} {item.label}</li>
                                    ))}
                                    {t.items.length > 3 && <li className="insp-more">+{t.items.length - 3} więcej...</li>}
                                </ul>
                                <button className="btn btn-primary btn-sm" onClick={() => startInspection(t)}>
                                    ▶️ Wykonaj inspekcję
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Recent inspections */}
                    <h3 className="cert-section-title" style={{ marginTop: '1.5rem' }}>📊 Historia inspekcji</h3>
                    {inspections.length === 0 ? (
                        <div className="cert-empty">Brak wykonanych inspekcji</div>
                    ) : (
                        <div className="insp-history">
                            {inspections.map(insp => {
                                const passed = insp.results.filter(r => r.ok).length;
                                const total = insp.results.length;
                                const pct = Math.round((passed / total) * 100);
                                return (
                                    <div key={insp.id} className="card insp-history-card">
                                        <div className="insp-hist-header">
                                            <div>
                                                <strong>{insp.template_name}</strong>
                                                {insp.ship_name && <span className="insp-hist-ship"> — {insp.ship_name}</span>}
                                            </div>
                                            <span className="insp-hist-date">{insp.date}</span>
                                        </div>
                                        <div className="insp-hist-bar">
                                            <div className="insp-hist-fill" style={{ width: `${pct}%`, background: pct === 100 ? 'var(--accent-green)' : pct >= 70 ? 'var(--accent-amber)' : 'var(--accent-red)' }} />
                                        </div>
                                        <div className="insp-hist-stats">
                                            <span>{passed}/{total} OK ({pct}%)</span>
                                            <span className="insp-hist-inspector">👤 {insp.inspector_name}</span>
                                        </div>
                                        {insp.notes && <div className="insp-hist-note">📝 {insp.notes}</div>}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* === CERT EDIT MODAL === */}
            {editingCert !== null && (
                <div className="cert-overlay">
                    <div className="cert-modal card">
                        <h3>{editingCert === 'new' ? '➕ Nowy certyfikat' : '✏️ Edytuj certyfikat'}</h3>

                        {/* Photo scan section */}
                        {isAdmin && (
                            <div className="cert-scan-section">
                                <div className="cert-scan-header">
                                    <span>📸 Skanuj dokument</span>
                                    <div className="cert-scan-btns">
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => {
                                                if (fileInputRef.current) {
                                                    fileInputRef.current.setAttribute('capture', 'environment');
                                                    fileInputRef.current.click();
                                                }
                                            }}
                                            type="button"
                                        >
                                            📷 Aparat
                                        </button>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => {
                                                if (fileInputRef.current) {
                                                    fileInputRef.current.removeAttribute('capture');
                                                    fileInputRef.current.setAttribute('accept', 'image/*');
                                                    fileInputRef.current.click();
                                                }
                                            }}
                                            type="button"
                                        >
                                            🖼️ Galeria
                                        </button>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => {
                                                if (fileInputRef.current) {
                                                    fileInputRef.current.removeAttribute('capture');
                                                    fileInputRef.current.setAttribute('accept', 'application/pdf');
                                                    fileInputRef.current.click();
                                                }
                                            }}
                                            type="button"
                                        >
                                            📄 PDF
                                        </button>
                                    </div>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*,application/pdf"
                                        multiple
                                        style={{ display: 'none' }}
                                        onChange={e => { if (e.target.files) handlePhotoFiles(e.target.files); e.target.value = ''; }}
                                    />
                                </div>

                                {scanPhotos.length > 0 && (
                                    <>
                                        <div className="cert-photo-strip">
                                            {scanPhotos.map((p, i) => (
                                                <div key={i} className="cert-photo-thumb">
                                                    {p.mimeType === 'application/pdf' ? (
                                                        <div className="cert-pdf-icon">📄 PDF</div>
                                                    ) : (
                                                        <img src={p.preview} alt={`Zdjęcie ${i + 1}`} />
                                                    )}
                                                    <button className="cert-photo-del" onClick={() => removePhoto(i)} type="button">✕</button>
                                                </div>
                                            ))}
                                        </div>
                                        <button
                                            className="btn btn-primary btn-sm cert-scan-go"
                                            onClick={runScan}
                                            disabled={scanning}
                                            type="button"
                                        >
                                            {scanning ? '🔍 Analizuję...' : `🤖 Wyciągnij dane z ${scanPhotos.length} ${scanPhotos.some(p => p.mimeType === 'application/pdf') ? 'plików' : 'zdjęć'}`}
                                        </button>
                                    </>
                                )}
                            </div>
                        )}

                        <div className="cert-form-grid">
                            <div className="cert-form-field cert-span-2">
                                <label>Nazwa *</label>
                                <input className="input" value={certForm.name} onChange={e => setCertForm(p => ({ ...p, name: e.target.value }))} placeholder="np. Świadectwo klasy PRS" />
                            </div>
                            <div className="cert-form-field">
                                <label>Wydawca</label>
                                <input className="input" value={certForm.issuer} onChange={e => setCertForm(p => ({ ...p, issuer: e.target.value }))} placeholder="np. PRS" />
                            </div>
                            <div className="cert-form-field">
                                <label>Numer</label>
                                <input className="input" value={certForm.number} onChange={e => setCertForm(p => ({ ...p, number: e.target.value }))} placeholder="np. KL-2024/001" />
                            </div>
                            <div className="cert-form-field">
                                <label>Data wydania</label>
                                <input className="input" type="date" value={certForm.issue_date} onChange={e => setCertForm(p => ({ ...p, issue_date: e.target.value }))} />
                            </div>
                            <div className="cert-form-field">
                                <label>Data ważności *</label>
                                <input className="input" type="date" value={certForm.expiry_date} onChange={e => setCertForm(p => ({ ...p, expiry_date: e.target.value }))} />
                            </div>
                            <div className="cert-form-field">
                                <label>Statek</label>
                                <select className="input" value={certForm.ship_id} onChange={e => setCertForm(p => ({ ...p, ship_id: e.target.value }))}>
                                    <option value="">— brak —</option>
                                    {ships.map(s => <option key={s.id} value={String(s.id)}>{s.short_name}</option>)}
                                </select>
                            </div>
                            <div className="cert-form-field cert-span-2">
                                <label>Notatki</label>
                                <textarea className="input" value={certForm.notes} onChange={e => setCertForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
                            </div>
                        </div>
                        {error && <div className="cert-form-error">{error}</div>}
                        <div className="cert-form-actions">
                            <button className="btn btn-ghost" onClick={() => setEditingCert(null)} disabled={saving}>Anuluj</button>
                            <button className="btn btn-primary" onClick={saveCert} disabled={saving}>
                                {saving ? '⏳ Zapisuję...' : '💾 Zapisz'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* === INSPECTION RUN MODAL === */}
            {runningInsp && (
                <div className="cert-overlay">
                    <div className="cert-modal card insp-run-modal">
                        <h3>✅ {runningInsp.name}</h3>
                        <div className="cert-form-field">
                            <label>Statek</label>
                            <select className="input" value={inspShip} onChange={e => setInspShip(e.target.value)}>
                                <option value="">— wybierz —</option>
                                {ships.map(s => <option key={s.id} value={String(s.id)}>{s.short_name}</option>)}
                            </select>
                        </div>

                        <div className="insp-checklist">
                            {inspResults.map((r, i) => (
                                <div key={i} className={`insp-check-item ${r.ok ? 'ok' : ''}`}>
                                    <button
                                        className={`insp-check-box ${r.ok ? 'checked' : ''}`}
                                        onClick={() => setInspResults(prev => prev.map((x, j) => j === i ? { ...x, ok: !x.ok } : x))}
                                        type="button"
                                    >
                                        {r.ok ? '✅' : '⬜'}
                                    </button>
                                    <div className="insp-check-label">
                                        <span>{r.label}</span>
                                        <input
                                            className="input insp-check-note"
                                            placeholder="Uwagi..."
                                            value={r.note}
                                            onChange={e => setInspResults(prev => prev.map((x, j) => j === i ? { ...x, note: e.target.value } : x))}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="cert-form-field">
                            <label>Ogólne uwagi</label>
                            <textarea className="input" value={inspNotes} onChange={e => setInspNotes(e.target.value)} rows={2} />
                        </div>

                        {error && <div className="cert-form-error">{error}</div>}
                        <div className="cert-form-actions">
                            <span className="insp-run-stats">
                                {inspResults.filter(r => r.ok).length}/{inspResults.length} OK
                            </span>
                            <div style={{ flex: 1 }} />
                            <button className="btn btn-ghost" onClick={() => setRunningInsp(null)} disabled={saving}>Anuluj</button>
                            <button className="btn btn-primary" onClick={submitInspection} disabled={saving}>
                                {saving ? '⏳ Zapisuję...' : '📋 Zapisz inspekcję'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
