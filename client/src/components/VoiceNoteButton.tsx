import { useState, useRef, useCallback } from 'react';
import { useAuth } from '../AuthContext';
import { aiApi, tasksApi, inventoryApi } from '../api';
import './VoiceNoteButton.css';

// Web Speech API types
interface SpeechRecognitionEvent {
    results: SpeechRecognitionResultList;
    resultIndex: number;
}

interface SpeechRecognitionErrorEvent {
    error: string;
}

type SpeechRecognitionInstance = {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start: () => void;
    stop: () => void;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
    onend: (() => void) | null;
};

// Get speech recognition constructor (Chrome/Edge)
function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
    const w = window as any;
    return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

type VoiceState = 'idle' | 'listening' | 'processing' | 'confirming';

interface TaskProposal {
    action: 'task';
    title: string;
    category: string;
    priority: string;
    description: string;
}

interface InventoryProposal {
    action: 'inventory';
    item_name: string;
    quantity: number;
    unit: string;
    operation: 'add' | 'remove';
}

type VoiceProposal = TaskProposal | InventoryProposal;

export default function VoiceNoteButton() {
    const { token } = useAuth();
    const [state, setState] = useState<VoiceState>('idle');
    const [transcript, setTranscript] = useState('');
    const [interimText, setInterimText] = useState('');
    const [proposal, setProposal] = useState<VoiceProposal | null>(null);
    const [error, setError] = useState('');
    const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

    const isSupported = !!getSpeechRecognition();

    const startListening = useCallback(() => {
        const SpeechRecognition = getSpeechRecognition();
        if (!SpeechRecognition) {
            setError('Przeglądarka nie obsługuje rozpoznawania mowy. Użyj Chrome lub Edge.');
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'pl-PL';

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            let final = '';
            let interim = '';
            for (let i = 0; i < event.results.length; i++) {
                const result = event.results[i];
                if (result.isFinal) {
                    final += result[0].transcript;
                } else {
                    interim += result[0].transcript;
                }
            }
            setTranscript(final);
            setInterimText(interim);
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            if (event.error !== 'no-speech') {
                setError(`Błąd: ${event.error}`);
            }
            setState('idle');
        };

        recognition.onend = () => {
            if (state === 'listening') {
                // Auto-stopped
            }
        };

        recognitionRef.current = recognition;
        setTranscript('');
        setInterimText('');
        setError('');
        setState('listening');
        recognition.start();
    }, [state]);

    const stopListening = useCallback(async () => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            recognitionRef.current = null;
        }

        const fullTranscript = transcript.trim();
        if (!fullTranscript || !token) {
            setState('idle');
            return;
        }

        setState('processing');

        try {
            // Send to AI with intent classification prompt
            const result = await aiApi.chat(
                token,
                `Na podstawie następującej notatki głosowej zdecyduj, czy użytkownik chce:\n` +
                `A) Dodać/zmienić stan MAGAZYNU (np. "dodaj do magazynu", "przyjmij", "uzupełnij zapas", "mamy X sztuk", "dołóż X")\n` +
                `B) Utworzyć ZADANIE remontowe (np. "trzeba naprawić", "do zrobienia", "zaplanuj")\n\n` +
                `Notatka: "${fullTranscript}"\n\n` +
                `Jeśli MAGAZYN, odpowiedz TYLKO JSON:\n` +
                `{"action": "inventory", "item_name": "nazwa przedmiotu", "quantity": 10, "unit": "L/szt/kg/m", "operation": "add"}\n\n` +
                `Jeśli ZADANIE, odpowiedz TYLKO JSON:\n` +
                `{"action": "task", "title": "krótki tytuł", "category": "jedna z: spawanie|malowanie|mechanika_silnikowa|elektryka|hydraulika|stolarka|inspekcja|logistyka|inne", "priority": "jedna z: critical|high|normal|low", "description": "szczegółowy opis"}\n\n` +
                `Nie dodawaj żadnego innego tekstu, TYLKO JSON.`,
            );

            // Parse AI response
            const content = result.message.content;
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]) as VoiceProposal;
                setProposal(parsed);
                setState('confirming');
            } else {
                setError('AI nie zwrócił poprawnej propozycji. Spróbuj ponownie.');
                setState('idle');
            }
        } catch {
            setError('Błąd przetwarzania. Spróbuj ponownie.');
            setState('idle');
        }
    }, [transcript, token]);

    const confirmProposal = useCallback(async () => {
        if (!token || !proposal) return;
        setState('processing');

        try {
            if (proposal.action === 'inventory') {
                // Try to find existing item first
                const { items } = await inventoryApi.list(token, { search: proposal.item_name });
                const existing = items.find(
                    i => i.name.toLowerCase().includes(proposal.item_name.toLowerCase())
                        || proposal.item_name.toLowerCase().includes(i.name.toLowerCase())
                );

                if (existing) {
                    // Adjust quantity on existing item
                    const delta = proposal.operation === 'add' ? proposal.quantity : -proposal.quantity;
                    await inventoryApi.adjustQuantity(token, existing.id, delta);
                    setError(`✅ ${proposal.operation === 'add' ? 'Dodano' : 'Usunięto'} ${proposal.quantity} ${proposal.unit || 'szt'} — ${existing.name}`);
                } else {
                    // Create new inventory item
                    await inventoryApi.create(token, {
                        name: proposal.item_name,
                        category: 'material',
                        quantity: proposal.quantity,
                        unit: proposal.unit || 'szt',
                    });
                    setError(`✅ Dodano do magazynu: ${proposal.item_name} (${proposal.quantity} ${proposal.unit || 'szt'})`);
                }
            } else {
                // Create task
                await tasksApi.create(token, {
                    title: proposal.title,
                    category: proposal.category,
                    priority: proposal.priority,
                    description: proposal.description,
                });
                setError('✅ Zadanie utworzone!');
            }

            setProposal(null);
            setTranscript('');
            setState('idle');
            setTimeout(() => setError(''), 4000);
        } catch {
            setError('Błąd wykonania operacji');
            setState('idle');
        }
    }, [token, proposal]);

    const cancel = () => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            recognitionRef.current = null;
        }
        setState('idle');
        setTranscript('');
        setInterimText('');
        setProposal(null);
        setError('');
    };

    if (!isSupported) return null;

    return (
        <>
            {/* FAB button */}
            <button
                className={`voice-fab ${state === 'listening' ? 'recording' : ''} ${state === 'processing' ? 'processing' : ''}`}
                onClick={() => {
                    if (state === 'idle') startListening();
                    else if (state === 'listening') stopListening();
                }}
                title="Notatka głosowa"
                disabled={state === 'processing'}
            >
                {state === 'listening' ? '⏹️' : state === 'processing' ? '⏳' : '🎤'}
            </button>

            {/* Overlay — listening or confirming */}
            {(state === 'listening' || state === 'confirming' || state === 'processing') && (
                <div className="voice-overlay">
                    <div className="voice-panel card">
                        {state === 'listening' && (
                            <>
                                <div className="voice-status">
                                    <span className="voice-pulse" />
                                    Nagrywanie...
                                </div>
                                <div className="voice-transcript">
                                    {transcript}
                                    <span className="voice-interim">{interimText}</span>
                                    {!transcript && !interimText && (
                                        <span className="voice-placeholder">Mów teraz...</span>
                                    )}
                                </div>
                                <div className="voice-actions">
                                    <button className="btn btn-ghost" onClick={cancel}>Anuluj</button>
                                    <button className="btn btn-primary" onClick={stopListening}>
                                        ✅ Zakończ i przetwórz
                                    </button>
                                </div>
                            </>
                        )}

                        {state === 'processing' && (
                            <div className="voice-processing">
                                <div className="spinner" style={{ width: 32, height: 32 }} />
                                <p>AI przetwarza transkrypcję...</p>
                            </div>
                        )}

                        {state === 'confirming' && proposal && (
                            <>
                                {proposal.action === 'inventory' ? (
                                    <>
                                        <h3 className="voice-confirm-title">📦 Operacja magazynowa</h3>
                                        <div className="voice-proposal">
                                            <div className="voice-field">
                                                <label>Przedmiot</label>
                                                <strong>{proposal.item_name}</strong>
                                            </div>
                                            <div className="voice-field">
                                                <label>Ilość</label>
                                                <span>{proposal.operation === 'add' ? '+' : '−'}{proposal.quantity} {proposal.unit}</span>
                                            </div>
                                            <div className="voice-field">
                                                <label>Operacja</label>
                                                <span>{proposal.operation === 'add' ? 'Dodaj do stanu' : 'Usuń ze stanu'}</span>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <h3 className="voice-confirm-title">📋 Propozycja zadania</h3>
                                        <div className="voice-proposal">
                                            <div className="voice-field">
                                                <label>Tytuł</label>
                                                <strong>{proposal.title}</strong>
                                            </div>
                                            <div className="voice-field">
                                                <label>Kategoria</label>
                                                <span>{proposal.category}</span>
                                            </div>
                                            <div className="voice-field">
                                                <label>Priorytet</label>
                                                <span>{proposal.priority}</span>
                                            </div>
                                            <div className="voice-field">
                                                <label>Opis</label>
                                                <p>{proposal.description}</p>
                                            </div>
                                        </div>
                                    </>
                                )}
                                <p className="voice-transcript-small">
                                    <em>Oryginalna transkrypcja: "{transcript}"</em>
                                </p>
                                <div className="voice-actions">
                                    <button className="btn btn-ghost" onClick={cancel}>Odrzuć</button>
                                    <button className="btn btn-primary" onClick={confirmProposal}>
                                        {proposal.action === 'inventory' ? '✅ Potwierdź' : '✅ Utwórz zadanie'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Error toast */}
            {error && state === 'idle' && (
                <div className="voice-toast" onClick={() => setError('')}>{error}</div>
            )}
        </>
    );
}
