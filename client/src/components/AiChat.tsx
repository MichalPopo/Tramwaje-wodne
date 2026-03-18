import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../AuthContext';
import { aiApi, tasksApi, inventoryApi, suppliersApi, type AiConversation, type AiMessage } from '../api';
import './AiChat.css';

// --- Action parsing ---

interface TaskAction {
    type: 'task';
    title: string;
    category: string;
    priority: string;
    description: string;
    ship_id?: number | null;
    estimated_hours?: number | null;
}

interface InventoryAction {
    type: 'inventory';
    item_name: string;
    quantity: number;
    unit: string;
    operation: 'add' | 'remove';
}

interface SupplierAction {
    type: 'supplier';
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    categories?: string[];
    notes?: string;
}

type AiAction = TaskAction | InventoryAction | SupplierAction;

function parseActions(content: string): { text: string; actions: AiAction[] } {
    const actions: AiAction[] = [];
    let text = content;

    // Parse [TASK_JSON]...[/TASK_JSON]
    const taskMatch = text.match(/\[TASK_JSON\]([\s\S]*?)\[\/TASK_JSON\]/);
    if (taskMatch) {
        try {
            const data = JSON.parse(taskMatch[1]);
            actions.push({ type: 'task', ...data });
        } catch { /* ignore parse errors */ }
        text = text.replace(/\[TASK_JSON\][\s\S]*?\[\/TASK_JSON\]/, '').trim();
    }

    // Parse [INVENTORY_JSON]...[/INVENTORY_JSON]
    const invMatch = text.match(/\[INVENTORY_JSON\]([\s\S]*?)\[\/INVENTORY_JSON\]/);
    if (invMatch) {
        try {
            const data = JSON.parse(invMatch[1]);
            actions.push({ type: 'inventory', ...data });
        } catch { /* ignore parse errors */ }
        text = text.replace(/\[INVENTORY_JSON\][\s\S]*?\[\/INVENTORY_JSON\]/, '').trim();
    }

    // Parse ALL [SUPPLIER_JSON]...[/SUPPLIER_JSON] (may be multiple)
    const supRegex = /\[SUPPLIER_JSON\]([\s\S]*?)\[\/SUPPLIER_JSON\]/g;
    let supMatch;
    while ((supMatch = supRegex.exec(text)) !== null) {
        try {
            const data = JSON.parse(supMatch[1]);
            actions.push({ type: 'supplier', ...data });
        } catch { /* ignore parse errors */ }
    }
    text = text.replace(/\[SUPPLIER_JSON\][\s\S]*?\[\/SUPPLIER_JSON\]/g, '').trim();

    return { text, actions };
}

export default function AiChat() {
    const { token } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [conversations, setConversations] = useState<AiConversation[]>([]);
    const [activeConvId, setActiveConvId] = useState<number | null>(null);
    const [messages, setMessages] = useState<AiMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [showHistory, setShowHistory] = useState(false);
    const [actionStatus, setActionStatus] = useState<Record<string, string>>({});
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => { scrollToBottom(); }, [messages]);

    const loadConversations = useCallback(async () => {
        if (!token) return;
        try {
            const data = await aiApi.conversations(token);
            setConversations(data.conversations);
        } catch { /* silent */ }
    }, [token]);

    useEffect(() => {
        if (isOpen) loadConversations();
    }, [isOpen, loadConversations]);

    const openConversation = async (convId: number) => {
        if (!token) return;
        try {
            const data = await aiApi.messages(token, convId);
            setMessages(data.messages);
            setActiveConvId(convId);
            setShowHistory(false);
            setError('');
        } catch {
            setError('Nie udało się załadować konwersacji');
        }
    };

    const startNew = () => {
        setActiveConvId(null);
        setMessages([]);
        setShowHistory(false);
        setError('');
        setActionStatus({});
        setTimeout(() => inputRef.current?.focus(), 100);
    };

    const handleSend = async () => {
        if (!token || !input.trim() || isLoading) return;

        const userMessage = input.trim();
        setInput('');
        setError('');

        const tempMsg: AiMessage = {
            id: -Date.now(),
            conversation_id: activeConvId || 0,
            role: 'user',
            content: userMessage,
            created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, tempMsg]);
        setIsLoading(true);

        // Detect supplier search queries → use Google Search grounding
        const isSupplierSearch = /znajd(ź|z)\s*dostaw|szukaj\s*dostaw|gdzie\s*kupi(ć|c)|wyszukaj.*dostaw|dostawc.*szukaj/i.test(userMessage);

        try {
            if (isSupplierSearch) {
                // Use dedicated search endpoint with Google Search grounding
                const result = await aiApi.searchSupplier(token, userMessage);

                const aiMsg: AiMessage = {
                    id: Date.now(),
                    conversation_id: 0,
                    role: 'assistant',
                    content: result.text,
                    created_at: new Date().toISOString(),
                };

                setMessages(prev => {
                    const filtered = prev.filter(m => m.id !== tempMsg.id);
                    return [...filtered, { ...tempMsg, id: aiMsg.id - 1 }, aiMsg];
                });
            } else {
                // Regular chat
                const data = await aiApi.chat(token, userMessage, activeConvId ?? undefined);

                if (!activeConvId) {
                    setActiveConvId(data.conversation_id);
                }

                setMessages(prev => {
                    const filtered = prev.filter(m => m.id !== tempMsg.id);
                    return [
                        ...filtered,
                        { ...tempMsg, id: data.message.id - 1, conversation_id: data.conversation_id },
                        data.message,
                    ];
                });

                loadConversations();
            }
        } catch (err) {
            setMessages(prev => prev.filter(m => m.id !== tempMsg.id));
            setError(err instanceof Error ? 'Błąd AI — spróbuj ponownie' : 'Błąd połączenia');
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const deleteConv = async (convId: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!token) return;
        try {
            await aiApi.deleteConversation(token, convId);
            setConversations(prev => prev.filter(c => c.id !== convId));
            if (activeConvId === convId) startNew();
        } catch { /* silent */ }
    };

    // Execute action from AI response
    const executeAction = async (msgId: number, action: AiAction, actionIdx: number) => {
        if (!token) return;
        const key = `${msgId}-${actionIdx}`;
        setActionStatus(prev => ({ ...prev, [key]: 'loading' }));

        try {
            if (action.type === 'task') {
                await tasksApi.create(token, {
                    title: action.title,
                    category: action.category,
                    priority: action.priority,
                    description: action.description,
                    ship_id: action.ship_id || undefined,
                    estimated_hours: action.estimated_hours || undefined,
                });
                setActionStatus(prev => ({ ...prev, [key]: '✅ Zadanie utworzone!' }));
            } else if (action.type === 'inventory') {
                const { items } = await inventoryApi.list(token, { search: action.item_name });
                const existing = items.find(
                    i => i.name.toLowerCase().includes(action.item_name.toLowerCase())
                        || action.item_name.toLowerCase().includes(i.name.toLowerCase())
                );

                if (existing) {
                    const delta = action.operation === 'add' ? action.quantity : -action.quantity;
                    await inventoryApi.adjustQuantity(token, existing.id, delta);
                    setActionStatus(prev => ({ ...prev, [key]: `✅ Zaktualizowano: ${existing.name}` }));
                } else {
                    await inventoryApi.create(token, {
                        name: action.item_name,
                        category: 'material',
                        quantity: action.quantity,
                        unit: action.unit || 'szt',
                    });
                    setActionStatus(prev => ({ ...prev, [key]: `✅ Dodano: ${action.item_name}` }));
                }
            } else if (action.type === 'supplier') {
                const data: Record<string, unknown> = {
                    name: action.name,
                    categories: action.categories && action.categories.length > 0 ? action.categories : ['material'],
                };
                if (action.phone && action.phone !== 'null') data.phone = action.phone;
                if (action.email && action.email !== 'null') data.email = action.email;
                if (action.address) data.address = action.address;
                if (action.city) data.city = action.city;
                if (action.notes) data.notes = action.notes;
                await suppliersApi.create(token, data);
                setActionStatus(prev => ({ ...prev, [key]: `✅ Dodano: ${action.name}` }));
            }
        } catch {
            setActionStatus(prev => ({ ...prev, [key]: '❌ Błąd wykonania' }));
        }
    };

    return (
        <>
            <button
                className={`ai-fab ${isOpen ? 'open' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
                type="button"
                title="AI Asystent"
            >
                {isOpen ? '✕' : '💬'}
            </button>

            {isOpen && (
                <div className="ai-panel animate-slide-up">
                    <div className="ai-header">
                        <div className="ai-header-left">
                            <button
                                className="btn btn-icon btn-ghost btn-sm"
                                onClick={() => setShowHistory(!showHistory)}
                                title="Historia konwersacji"
                                type="button"
                            >
                                📋
                            </button>
                            <h3>AI Asystent</h3>
                        </div>
                        <div className="ai-header-right">
                            <button className="btn btn-ghost btn-sm" onClick={startNew} type="button">
                                + Nowy
                            </button>
                        </div>
                    </div>

                    {showHistory && (
                        <div className="ai-history">
                            {conversations.length === 0 ? (
                                <div className="ai-empty">Brak konwersacji</div>
                            ) : (
                                conversations.map(c => (
                                    <button
                                        key={c.id}
                                        className={`ai-conv-item ${c.id === activeConvId ? 'active' : ''}`}
                                        onClick={() => openConversation(c.id)}
                                        type="button"
                                    >
                                        <span className="ai-conv-title">{c.title || 'Bez tytułu'}</span>
                                        <span className="ai-conv-date">
                                            {new Date(c.created_at).toLocaleDateString('pl-PL')}
                                        </span>
                                        <button
                                            className="ai-conv-delete"
                                            onClick={(e) => deleteConv(c.id, e)}
                                            title="Usuń"
                                            type="button"
                                        >
                                            🗑
                                        </button>
                                    </button>
                                ))
                            )}
                        </div>
                    )}

                    <div className="ai-messages">
                        {messages.length === 0 && !isLoading && (
                            <div className="ai-welcome">
                                <div className="ai-welcome-icon">⚓</div>
                                <h4>Ahoj!</h4>
                                <p>Jestem asystentem Tramwajów Wodnych. Pomogę z naprawami, planowaniem i pytaniami technicznymi.</p>
                                <div className="ai-suggestions">
                                    <button type="button" onClick={() => setInput('Jak spawać aluminium AlMg4,5?')}>
                                        🔥 Spawanie aluminium
                                    </button>
                                    <button type="button" onClick={() => setInput('Stwórz zadanie: malowanie nadbudówki Zefira')}>
                                        ➕ Stwórz zadanie
                                    </button>
                                    <button type="button" onClick={() => setInput('Dodaj do magazynu 10L farby białej')}>
                                        📦 Dodaj do magazynu
                                    </button>
                                    <button type="button" onClick={() => setInput('Znajdź dostawcę filtrów oleju Volvo Penta koło Elbląga')}>
                                        🔍 Znajdź dostawcę
                                    </button>
                                </div>
                            </div>
                        )}

                        {messages.map(msg => {
                            const { text, actions } = msg.role === 'assistant'
                                ? parseActions(msg.content)
                                : { text: msg.content, actions: [] };

                            return (
                                <div key={msg.id} className={`ai-msg ${msg.role}`}>
                                    <div className="ai-msg-avatar">
                                        {msg.role === 'user' ? '👤' : '⚓'}
                                    </div>
                                    <div className="ai-msg-content">
                                        <MessageContent content={text} />
                                        {actions.length > 0 && (
                                            <div className="ai-actions">
                                                {actions.map((action, i) => {
                                                    const key = `${msg.id}-${i}`;
                                                    const status = actionStatus[key];
                                                    const label = action.type === 'task' ? '📋 Utwórz zadanie'
                                                        : action.type === 'supplier' ? `🏪 Dodaj: ${(action as SupplierAction).name}`
                                                        : '📦 Dodaj do magazynu';
                                                    return (
                                                        <div key={i}>
                                                            {!status ? (
                                                                <button
                                                                    className="btn btn-primary btn-sm ai-action-btn"
                                                                    onClick={() => executeAction(msg.id, action, i)}
                                                                    type="button"
                                                                >
                                                                    {label}
                                                                </button>
                                                            ) : status === 'loading' ? (
                                                                <span className="ai-action-status">⏳ Tworzę...</span>
                                                            ) : (
                                                                <span className="ai-action-status">{status}</span>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}

                        {isLoading && (
                            <div className="ai-msg assistant">
                                <div className="ai-msg-avatar">⚓</div>
                                <div className="ai-msg-content">
                                    <div className="ai-typing">
                                        <span></span><span></span><span></span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {error && <div className="ai-error">{error}</div>}
                        <div ref={messagesEndRef} />
                    </div>

                    <div className="ai-input-row">
                        <input
                            ref={inputRef}
                            className="input ai-input"
                            type="text"
                            placeholder="Napisz wiadomość..."
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            maxLength={2000}
                            disabled={isLoading}
                        />
                        <button
                            className="btn btn-primary ai-send"
                            onClick={handleSend}
                            disabled={!input.trim() || isLoading}
                            type="button"
                        >
                            ➤
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}

/* Simple markdown-like rendering */
function MessageContent({ content }: { content: string }) {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let listItems: string[] = [];
    let listKey = 0;

    const flushList = () => {
        if (listItems.length > 0) {
            elements.push(
                <ul key={`list-${listKey++}`}>
                    {listItems.map((item, i) => (
                        <li key={i}>{formatInline(item)}</li>
                    ))}
                </ul>
            );
            listItems = [];
        }
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.startsWith('### ')) {
            flushList();
            elements.push(<h5 key={i}>{line.slice(4)}</h5>);
        } else if (line.startsWith('## ')) {
            flushList();
            elements.push(<h4 key={i}>{line.slice(3)}</h4>);
        } else if (line.startsWith('# ')) {
            flushList();
            elements.push(<h3 key={i}>{line.slice(2)}</h3>);
        } else if (/^[\-\*•]\s/.test(line)) {
            listItems.push(line.replace(/^[\-\*•]\s+/, ''));
        } else if (/^\d+\.\s/.test(line)) {
            listItems.push(line.replace(/^\d+\.\s+/, ''));
        } else if (line.trim() === '') {
            flushList();
        } else {
            flushList();
            elements.push(<p key={i}>{formatInline(line)}</p>);
        }
    }

    flushList();
    return <>{elements}</>;
}

function formatInline(text: string): React.ReactNode {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        return part;
    });
}
