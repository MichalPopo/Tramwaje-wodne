import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../AuthContext';
import { equipmentApi, instructionsApi, shipsApi, type Equipment, type Instruction, type InstructionStep, type Ship } from '../api';
import './EquipmentPage.css';

type Tab = 'equipment' | 'instructions';

const TYPE_LABELS: Record<string, string> = {
    engine: '🔧 Silnik', pump: '💧 Pompa', generator: '⚡ Generator',
    steering: '🧭 Sterowanie', electrical: '🔌 Elektryka', other: '📦 Inne',
};

export default function EquipmentPage() {
    const { token, user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const [tab, setTab] = useState<Tab>('equipment');
    const [equipment, setEquipment] = useState<Equipment[]>([]);
    const [instructions, setInstructions] = useState<Instruction[]>([]);
    const [ships, setShips] = useState<Ship[]>([]);
    const [loading, setLoading] = useState(true);
    const [shipFilter, setShipFilter] = useState('');
    const [error, setError] = useState('');

    // Detail / QR modal
    const [selectedEq, setSelectedEq] = useState<Equipment | null>(null);
    const [eqInstructions, setEqInstructions] = useState<Instruction[]>([]);
    const [qrData, setQrData] = useState<{ svg: string; url: string } | null>(null);
    const [showQR, setShowQR] = useState(false);

    // Instruction viewer
    const [viewInstr, setViewInstr] = useState<(Instruction & { steps: InstructionStep[] }) | null>(null);

    // Equipment form
    const [editEq, setEditEq] = useState<number | 'new' | null>(null);
    const [eqForm, setEqForm] = useState({ name: '', type: 'other', ship_id: '', model: '', serial_number: '', location: '', notes: '' });
    const [saving, setSaving] = useState(false);

    // Instruction form
    const [newInstr, setNewInstr] = useState(false);
    const [instrForm, setInstrForm] = useState({ title: '', equipment_id: '', description: '', steps: [{ text: '' }] as { text: string }[] });
    const [aiText, setAiText] = useState('');
    const [aiLoading, setAiLoading] = useState(false);

    // Voice input
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef<any>(null);

    const toggleVoice = useCallback(() => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) { setError('Przeglądarka nie wspiera rozpoznawania mowy'); return; }

        if (isListening && recognitionRef.current) {
            recognitionRef.current.stop();
            setIsListening(false);
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'pl-PL';
        recognition.continuous = true;
        recognition.interimResults = false;

        recognition.onresult = (event: any) => {
            let transcript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    transcript += event.results[i][0].transcript;
                }
            }
            if (transcript) {
                setAiText(prev => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + transcript);
            }
        };

        recognition.onerror = () => { setIsListening(false); };
        recognition.onend = () => { setIsListening(false); recognitionRef.current = null; };

        recognitionRef.current = recognition;
        recognition.start();
        setIsListening(true);
    }, [isListening]);

    const load = async () => {
        if (!token) return;
        try {
            const [e, i, s] = await Promise.all([
                equipmentApi.list(token, shipFilter ? { ship_id: parseInt(shipFilter) } : undefined),
                instructionsApi.list(token),
                shipsApi.list(token),
            ]);
            setEquipment(e.equipment);
            setInstructions(i.instructions);
            setShips(s.ships);
        } catch { setError('Błąd ładowania'); }
        finally { setLoading(false); }
    };

    useEffect(() => { load(); }, [token, shipFilter]);

    // Open equipment detail
    const openDetail = async (eq: Equipment) => {
        if (!token) return;
        setSelectedEq(eq);
        setQrData(null);
        try {
            const detail = await equipmentApi.get(token, eq.id);
            setEqInstructions(detail.instructions);
        } catch { setEqInstructions([]); }
    };

    // Generate QR
    const generateQR = async (eqId: number) => {
        if (!token) return;
        try {
            const data = await equipmentApi.qr(token, eqId);
            setQrData({ svg: data.qr_svg, url: data.url });
            setShowQR(true);
        } catch { setError('Błąd generowania QR'); }
    };

    // View instruction
    const openInstruction = async (id: number) => {
        if (!token) return;
        try {
            const data = await instructionsApi.get(token, id);
            setViewInstr(data.instruction);
        } catch { setError('Błąd wczytywania instrukcji'); }
    };

    // Equipment CRUD
    const openEqForm = (eq?: Equipment) => {
        if (eq) {
            setEditEq(eq.id);
            setEqForm({ name: eq.name, type: eq.type, ship_id: eq.ship_id ? String(eq.ship_id) : '', model: eq.model || '', serial_number: eq.serial_number || '', location: eq.location || '', notes: eq.notes || '' });
        } else {
            setEditEq('new');
            setEqForm({ name: '', type: 'other', ship_id: '', model: '', serial_number: '', location: '', notes: '' });
        }
    };

    const saveEq = async () => {
        if (!token || !eqForm.name) { setError('Nazwa wymagana'); return; }
        setSaving(true);
        try {
            const data = { ...eqForm, ship_id: eqForm.ship_id ? parseInt(eqForm.ship_id) : null };
            if (editEq === 'new') await equipmentApi.create(token, data);
            else if (typeof editEq === 'number') await equipmentApi.update(token, editEq, data);
            setEditEq(null); load();
        } catch { setError('Błąd zapisu'); }
        finally { setSaving(false); }
    };

    const deleteEq = async (id: number) => {
        if (!token || !confirm('Usunąć urządzenie?')) return;
        try { await equipmentApi.delete(token, id); load(); setSelectedEq(null); } catch { setError('Błąd usuwania'); }
    };

    // Instruction form
    const openInstrForm = (eqId?: number) => {
        setNewInstr(true);
        setInstrForm({ title: '', equipment_id: eqId ? String(eqId) : '', description: '', steps: [{ text: '' }] });
        setAiText('');
    };

    const addStep = () => setInstrForm(p => ({ ...p, steps: [...p.steps, { text: '' }] }));
    const removeStep = (i: number) => setInstrForm(p => ({ ...p, steps: p.steps.filter((_, j) => j !== i) }));
    const updateStep = (i: number, text: string) => setInstrForm(p => ({ ...p, steps: p.steps.map((s, j) => j === i ? { text } : s) }));

    const aiFormat = async () => {
        if (!token || !aiText.trim()) return;
        setAiLoading(true);
        try {
            const eq = instrForm.equipment_id ? equipment.find(e => e.id === parseInt(instrForm.equipment_id)) : undefined;
            const result = await instructionsApi.aiFormat(token, aiText, eq?.name);
            if (result.formatted) {
                setInstrForm(p => ({
                    ...p,
                    title: result.formatted!.title || p.title,
                    description: result.formatted!.description || p.description,
                    steps: result.formatted!.steps.length > 0 ? result.formatted!.steps : p.steps,
                }));
                setAiText('');
            } else { setError(result.error || 'AI nie sformatowało instrukcji'); }
        } catch (err: any) { setError(err?.message || err?.data?.error || 'Błąd AI — sprawdź konfigurację API'); }
        finally { setAiLoading(false); }
    };

    const saveInstr = async () => {
        if (!token || !instrForm.title || instrForm.steps.length === 0 || !instrForm.steps[0].text) {
            setError('Tytuł i co najmniej 1 krok wymagane'); return;
        }
        setSaving(true);
        try {
            await instructionsApi.create(token, {
                title: instrForm.title,
                equipment_id: instrForm.equipment_id ? parseInt(instrForm.equipment_id) : null,
                description: instrForm.description || undefined,
                steps: instrForm.steps.filter(s => s.text.trim()),
            });
            setNewInstr(false); load();
        } catch { setError('Błąd zapisu'); }
        finally { setSaving(false); }
    };

    const deleteInstr = async (id: number) => {
        if (!token || !confirm('Usunąć instrukcję?')) return;
        try { await instructionsApi.delete(token, id); load(); setViewInstr(null); } catch { setError('Błąd usuwania'); }
    };

    if (loading) return <div className="page-container"><h1 className="page-title">🔧 Sprzęt i instrukcje</h1><div className="card skeleton" style={{ height: 300 }} /></div>;

    return (
        <div className="page-container eq-page">
            <a href="/dashboard" className="btn btn-ghost btn-sm" style={{ marginBottom: '0.5rem', alignSelf: 'flex-start' }}>← Dashboard</a>
            <div className="eq-top-row">
                <h1 className="page-title">🔧 Sprzęt i instrukcje</h1>
                <select className="input eq-ship-filter" value={shipFilter} onChange={e => setShipFilter(e.target.value)}>
                    <option value="">Wszystkie statki</option>
                    {ships.map(s => <option key={s.id} value={s.id}>{s.short_name}</option>)}
                </select>
            </div>

            <div className="eq-tabs">
                <button className={`eq-tab ${tab === 'equipment' ? 'active' : ''}`} onClick={() => setTab('equipment')}>🔧 Urządzenia ({equipment.length})</button>
                <button className={`eq-tab ${tab === 'instructions' ? 'active' : ''}`} onClick={() => setTab('instructions')}>📖 Instrukcje ({instructions.length})</button>
            </div>

            {error && <div className="eq-error">{error} <button onClick={() => setError('')}>✕</button></div>}

            {/* === EQUIPMENT TAB === */}
            {tab === 'equipment' && (
                <div className="eq-content">
                    {isAdmin && <button className="btn btn-primary btn-sm" onClick={() => openEqForm()} style={{ marginBottom: '0.75rem' }}>➕ Dodaj urządzenie</button>}
                    <div className="eq-grid">
                        {equipment.map(eq => (
                            <div key={eq.id} className="card eq-card" onClick={() => openDetail(eq)}>
                                <div className="eq-card-header">
                                    <span className="eq-type-badge">{TYPE_LABELS[eq.type] || eq.type}</span>
                                    {eq.ship_name && <span className="eq-ship-tag">{eq.ship_name}</span>}
                                </div>
                                <h4 className="eq-card-name">{eq.name}</h4>
                                {eq.model && <div className="eq-card-detail">Model: <strong>{eq.model}</strong></div>}
                                {eq.serial_number && <div className="eq-card-detail">SN: <code>{eq.serial_number}</code></div>}
                                {eq.location && <div className="eq-card-detail">📍 {eq.location}</div>}
                                <div className="eq-card-actions">
                                    <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); generateQR(eq.id); }}>📱 QR</button>
                                    {isAdmin && <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); openEqForm(eq); }}>✏️</button>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* === INSTRUCTIONS TAB === */}
            {tab === 'instructions' && (
                <div className="eq-content">
                    {isAdmin && <button className="btn btn-primary btn-sm" onClick={() => openInstrForm()} style={{ marginBottom: '0.75rem' }}>➕ Nowa instrukcja</button>}
                    {instructions.length === 0 ? <div className="eq-empty">Brak instrukcji</div> : (
                        <div className="instr-list">
                            {instructions.map(instr => (
                                <div key={instr.id} className="card instr-card" onClick={() => openInstruction(instr.id)}>
                                    <div className="instr-card-top">
                                        <h4>{instr.title}</h4>
                                        <span className="instr-step-count">{instr.step_count} kroków</span>
                                    </div>
                                    {instr.description && <p className="instr-desc">{instr.description}</p>}
                                    <div className="instr-card-meta">
                                        {instr.equipment_name && <span>🔧 {instr.equipment_name}</span>}
                                        {instr.author_name && <span>👤 {instr.author_name}</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* === EQUIPMENT DETAIL MODAL === */}
            {selectedEq && (
                <div className="eq-overlay" onClick={() => setSelectedEq(null)}>
                    <div className="eq-modal card" onClick={e => e.stopPropagation()}>
                        <div className="eq-detail-header">
                            <div>
                                <span className="eq-type-badge">{TYPE_LABELS[selectedEq.type] || selectedEq.type}</span>
                                {selectedEq.ship_name && <span className="eq-ship-tag">{selectedEq.ship_name}</span>}
                            </div>
                            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedEq(null)}>✕</button>
                        </div>
                        <h3>{selectedEq.name}</h3>
                        <div className="eq-detail-specs">
                            {selectedEq.model && <div><label>Model</label><span>{selectedEq.model}</span></div>}
                            {selectedEq.serial_number && <div><label>Nr seryjny</label><code>{selectedEq.serial_number}</code></div>}
                            {selectedEq.location && <div><label>Lokalizacja</label><span>📍 {selectedEq.location}</span></div>}
                            {selectedEq.notes && <div className="eq-detail-notes"><label>Notatki</label><span>{selectedEq.notes}</span></div>}
                        </div>
                        <div className="eq-detail-actions">
                            <button className="btn btn-primary btn-sm" onClick={() => generateQR(selectedEq.id)}>📱 Generuj QR</button>
                            {isAdmin && <>
                                <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedEq(null); openEqForm(selectedEq); }}>✏️ Edytuj</button>
                                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent-red)' }} onClick={() => deleteEq(selectedEq.id)}>🗑 Usuń</button>
                            </>}
                        </div>
                        {eqInstructions.length > 0 && (
                            <div className="eq-detail-instructions">
                                <h4>📖 Instrukcje obsługi</h4>
                                {eqInstructions.map(instr => (
                                    <button key={instr.id} className="btn btn-ghost eq-instr-link" onClick={() => { setSelectedEq(null); openInstruction(instr.id); }}>
                                        📋 {instr.title} ({instr.step_count} kroków)
                                    </button>
                                ))}
                            </div>
                        )}
                        {isAdmin && <button className="btn btn-ghost btn-sm" style={{ marginTop: '0.5rem' }} onClick={() => { setSelectedEq(null); openInstrForm(selectedEq.id); }}>➕ Dodaj instrukcję</button>}
                    </div>
                </div>
            )}

            {/* === QR MODAL === */}
            {showQR && qrData && (
                <div className="eq-overlay" onClick={() => setShowQR(false)}>
                    <div className="eq-modal card eq-qr-modal" onClick={e => e.stopPropagation()}>
                        <h3>📱 Kod QR</h3>
                        <div className="eq-qr-preview" dangerouslySetInnerHTML={{ __html: qrData.svg }} />
                        <div className="eq-qr-url">{qrData.url}</div>
                        <div className="eq-qr-actions">
                            <button className="btn btn-primary btn-sm" onClick={() => {
                                const w = window.open('', '_blank');
                                if (w) { w.document.write(`<html><body style="display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0">${qrData.svg}<br><p style="text-align:center;font-family:sans-serif">${qrData.url}</p></body></html>`); w.document.close(); w.print(); }
                            }}>🖨️ Drukuj</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setShowQR(false)}>Zamknij</button>
                        </div>
                    </div>
                </div>
            )}

            {/* === INSTRUCTION VIEWER === */}
            {viewInstr && (
                <div className="eq-overlay" onClick={() => setViewInstr(null)}>
                    <div className="eq-modal card eq-instr-modal" onClick={e => e.stopPropagation()}>
                        <div className="eq-detail-header">
                            <h3>📖 {viewInstr.title}</h3>
                            <button className="btn btn-ghost btn-sm" onClick={() => setViewInstr(null)}>✕</button>
                        </div>
                        {viewInstr.description && <p className="instr-desc">{viewInstr.description}</p>}
                        {viewInstr.equipment_name && <div className="instr-eq-link">🔧 {viewInstr.equipment_name}</div>}
                        <div className="instr-steps">
                            {viewInstr.steps.map((step, i) => (
                                <div key={step.id} className="instr-step">
                                    <div className="instr-step-num">{i + 1}</div>
                                    <div className="instr-step-text">{step.text}</div>
                                </div>
                            ))}
                        </div>
                        {isAdmin && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent-red)', marginTop: '0.75rem' }} onClick={() => deleteInstr(viewInstr.id)}>🗑 Usuń instrukcję</button>}
                    </div>
                </div>
            )}

            {/* === EQUIPMENT EDIT MODAL === */}
            {editEq !== null && (
                <div className="eq-overlay">
                    <div className="eq-modal card">
                        <h3>{editEq === 'new' ? '➕ Nowe urządzenie' : '✏️ Edytuj urządzenie'}</h3>
                        <div className="eq-form-grid">
                            <div className="eq-form-field eq-span-2"><label>Nazwa *</label><input className="input" value={eqForm.name} onChange={e => setEqForm(p => ({ ...p, name: e.target.value }))} placeholder="np. Pompa zęzowa" /></div>
                            <div className="eq-form-field"><label>Typ</label>
                                <select className="input" value={eqForm.type} onChange={e => setEqForm(p => ({ ...p, type: e.target.value }))}>
                                    {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                            </div>
                            <div className="eq-form-field"><label>Statek</label>
                                <select className="input" value={eqForm.ship_id} onChange={e => setEqForm(p => ({ ...p, ship_id: e.target.value }))}>
                                    <option value="">— brak —</option>
                                    {ships.map(s => <option key={s.id} value={s.id}>{s.short_name}</option>)}
                                </select>
                            </div>
                            <div className="eq-form-field"><label>Model</label><input className="input" value={eqForm.model} onChange={e => setEqForm(p => ({ ...p, model: e.target.value }))} /></div>
                            <div className="eq-form-field"><label>Nr seryjny</label><input className="input" value={eqForm.serial_number} onChange={e => setEqForm(p => ({ ...p, serial_number: e.target.value }))} /></div>
                            <div className="eq-form-field eq-span-2"><label>Lokalizacja</label><input className="input" value={eqForm.location} onChange={e => setEqForm(p => ({ ...p, location: e.target.value }))} placeholder="np. Maszynownia — prawa burta" /></div>
                            <div className="eq-form-field eq-span-2"><label>Notatki</label><textarea className="input" value={eqForm.notes} onChange={e => setEqForm(p => ({ ...p, notes: e.target.value }))} rows={2} /></div>
                        </div>
                        <div className="eq-form-actions">
                            <button className="btn btn-ghost" onClick={() => setEditEq(null)} disabled={saving}>Anuluj</button>
                            <button className="btn btn-primary" onClick={saveEq} disabled={saving}>{saving ? '⏳' : '💾'} Zapisz</button>
                        </div>
                    </div>
                </div>
            )}

            {/* === INSTRUCTION CREATE MODAL === */}
            {newInstr && (
                <div className="eq-overlay">
                    <div className="eq-modal card eq-instr-modal">
                        <h3>➕ Nowa instrukcja</h3>

                        {/* AI format section */}
                        <div className="instr-ai-section">
                            <label>🤖 Opisz procedurę — AI sformatuje w kroki</label>
                            <div className="instr-voice-row">
                                <textarea className="input" value={aiText} onChange={e => setAiText(e.target.value)} rows={3} placeholder="np. Żeby wymienić olej w D41P, trzeba najpierw wyłączyć silnik i odczekać pół godziny..." />
                                <button
                                    className={`btn btn-ghost instr-mic-btn ${isListening ? 'listening' : ''}`}
                                    onClick={toggleVoice}
                                    type="button"
                                    title={isListening ? 'Zatrzymaj nagrywanie' : 'Dyktuj głosowo'}
                                >
                                    {isListening ? '⏹️' : '🎤'}
                                </button>
                            </div>
                            {isListening && <div className="instr-listening-indicator">🔴 Słucham... mów teraz</div>}
                            <button className="btn btn-primary btn-sm" onClick={aiFormat} disabled={aiLoading || !aiText.trim()}>
                                {aiLoading ? '🔍 Formatuję...' : '🤖 Sformatuj przez AI'}
                            </button>
                        </div>

                        <div className="eq-form-grid">
                            <div className="eq-form-field eq-span-2"><label>Tytuł *</label><input className="input" value={instrForm.title} onChange={e => setInstrForm(p => ({ ...p, title: e.target.value }))} placeholder="np. Wymiana oleju w D41P" /></div>
                            <div className="eq-form-field eq-span-2"><label>Urządzenie</label>
                                <select className="input" value={instrForm.equipment_id} onChange={e => setInstrForm(p => ({ ...p, equipment_id: e.target.value }))}>
                                    <option value="">— brak —</option>
                                    {equipment.map(eq => <option key={eq.id} value={eq.id}>{eq.name}</option>)}
                                </select>
                            </div>
                            <div className="eq-form-field eq-span-2"><label>Opis</label><textarea className="input" value={instrForm.description} onChange={e => setInstrForm(p => ({ ...p, description: e.target.value }))} rows={2} /></div>
                        </div>

                        <h4 style={{ margin: '0.75rem 0 0.5rem' }}>Kroki:</h4>
                        <div className="instr-steps-editor">
                            {instrForm.steps.map((step, i) => (
                                <div key={i} className="instr-step-edit">
                                    <span className="instr-step-num">{i + 1}</span>
                                    <input className="input" value={step.text} onChange={e => updateStep(i, e.target.value)} placeholder={`Krok ${i + 1}...`} />
                                    {instrForm.steps.length > 1 && <button className="btn btn-ghost btn-sm" onClick={() => removeStep(i)}>✕</button>}
                                </div>
                            ))}
                            <button className="btn btn-ghost btn-sm" onClick={addStep}>➕ Dodaj krok</button>
                        </div>

                        <div className="eq-form-actions">
                            <button className="btn btn-ghost" onClick={() => setNewInstr(false)} disabled={saving}>Anuluj</button>
                            <button className="btn btn-primary" onClick={saveInstr} disabled={saving}>{saving ? '⏳' : '💾'} Zapisz instrukcję</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
