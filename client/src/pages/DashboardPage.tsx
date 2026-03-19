import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { tasksApi, configApi, type TaskSummary, type TaskDetail } from '../api';
import AiChat from '../components/AiChat';
import WeatherWidget from '../components/WeatherWidget';
import WaterLevelWidget from '../components/WaterLevelWidget';
import ShipDataCards from '../components/ShipDataCards';
import TaskFormModal from '../components/TaskFormModal';
import VoiceNoteButton from '../components/VoiceNoteButton';
import './DashboardPage.css';

const STATUS_LABELS: Record<string, string> = {
    todo: 'Do zrobienia',
    in_progress: 'W toku',
    blocked: 'Wstrzymane',
    done: 'Ukończone',
};

const PRIORITY_ICONS: Record<string, string> = {
    critical: '🔴',
    high: '🟠',
    normal: '🔵',
    low: '⚪',
};

const CATEGORY_ICONS: Record<string, string> = {
    spawanie: '🔥',
    malowanie: '🎨',
    mechanika_silnikowa: '⚙️',
    elektryka: '⚡',
    hydraulika: '🔧',
    stolarka: '🪵',
    inspekcja: '🔍',
    logistyka: '🚚',
    rejs_probny: '⛵',
    inne: '📋',
};

export default function DashboardPage() {
    const { user, token, logout } = useAuth();
    const [tasks, setTasks] = useState<TaskSummary[]>([]);
    const [todayTasks, setTodayTasks] = useState<TaskSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingTask, setEditingTask] = useState<TaskDetail | null>(null);
    const [viewingTask, setViewingTask] = useState<TaskDetail | null>(null);
    const [showTimeForm, setShowTimeForm] = useState(false);
    const [timeHours, setTimeHours] = useState('');
    const [timeNote, setTimeNote] = useState('');
    const [error, setError] = useState('');

    // Season start (from config)
    const [seasonDate, setSeasonDate] = useState('2026-04-26');
    const [editingSeason, setEditingSeason] = useState(false);

    // Filters
    const [filterStatus, setFilterStatus] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [filterSearch, setFilterSearch] = useState('');

    const loadTasks = useCallback(() => {
        if (!token) return;
        Promise.all([
            tasksApi.list(token),
            tasksApi.today(token),
            configApi.get(token, 'season_start').catch(() => null),
        ]).then(([allData, todayData, configData]) => {
            setTasks(allData.tasks);
            setTodayTasks(todayData.tasks);
            if (configData?.value) setSeasonDate(configData.value);
        }).catch(console.error)
            .finally(() => setIsLoading(false));
    }, [token]);

    useEffect(() => { loadTasks(); }, [loadTasks]);

    // Listen for task updates from TaskFormModal (materials step creates task internally)
    useEffect(() => {
        const handler = () => loadTasks();
        window.addEventListener('tasks-updated', handler);
        return () => window.removeEventListener('tasks-updated', handler);
    }, [loadTasks]);

    // --- CRUD handlers ---
    const handleCreate = async (data: Record<string, unknown>) => {
        if (!token) return;
        try {
            await tasksApi.create(token, data);
            setShowCreateModal(false);
            loadTasks();
        } catch {
            setError('Błąd tworzenia zadania');
        }
    };

    const handleUpdate = async (data: Record<string, unknown>) => {
        if (!token || !editingTask) return;
        try {
            await tasksApi.update(token, editingTask.id, data);
            setEditingTask(null);
            loadTasks();
        } catch {
            setError('Błąd aktualizacji zadania');
        }
    };

    const handleDelete = async (id: number) => {
        if (!token) return;
        if (!confirm('Czy na pewno chcesz usunąć to zadanie?')) return;
        try {
            await tasksApi.remove(token, id);
            setEditingTask(null);
            loadTasks();
        } catch {
            setError('Błąd usuwania zadania');
        }
    };

    const openTaskDetail = async (taskId: number) => {
        if (!token) return;
        try {
            const { task } = await tasksApi.get(token, taskId);
            setViewingTask(task);
        } catch {
            setError('Nie udało się załadować zadania');
        }
    };

    const openEditTask = async (taskId: number) => {
        if (!token) return;
        try {
            const { task } = await tasksApi.get(token, taskId);
            setViewingTask(null);
            setEditingTask(task);
        } catch {
            setError('Nie udało się załadować zadania');
        }
    };

    const handleStatusChange = async (status: string, blocked_reason?: string) => {
        if (!token || !viewingTask) return;
        try {
            const data = await tasksApi.changeStatus(token, viewingTask.id, status, blocked_reason);
            setViewingTask(data.task);
            loadTasks();
        } catch {
            setError('Nie udało się zmienić statusu');
        }
    };

    const handleTimeLog = async () => {
        if (!token || !viewingTask) return;
        const h = parseFloat(timeHours);
        if (isNaN(h) || h <= 0 || h > 24) {
            setError('Wpisz poprawną liczbę godzin (0.25–24)');
            return;
        }
        try {
            await tasksApi.logTime(token, viewingTask.id, h, timeNote || undefined);
            const data = await tasksApi.get(token, viewingTask.id);
            setViewingTask(data.task);
            setShowTimeForm(false);
            setTimeHours('');
            setTimeNote('');
            loadTasks();
        } catch {
            setError('Nie udało się zapisać czasu');
        }
    };

    // --- Computed stats ---
    const stats = useMemo(() => {
        const total = tasks.length;
        const done = tasks.filter(t => t.status === 'done').length;
        const inProgress = tasks.filter(t => t.status === 'in_progress').length;
        const blocked = tasks.filter(t => t.status === 'blocked').length;
        const critical = tasks.filter(t => t.priority === 'critical' && t.status !== 'done').length;

        // Per ship
        const zefirTasks = tasks.filter(t => t.ship_name?.includes('Zefir'));
        const zefirDone = zefirTasks.filter(t => t.status === 'done').length;
        const kutrzebaTasks = tasks.filter(t => t.ship_name?.includes('Kutrzeba'));
        const kutrzebaDone = kutrzebaTasks.filter(t => t.status === 'done').length;

        // Hours
        const totalEstimated = tasks.reduce((sum, t) => sum + (t.estimated_hours || 0), 0);
        const totalActual = tasks.reduce((sum, t) => sum + t.actual_hours, 0);

        return {
            total, done, inProgress, blocked, critical,
            zefirTotal: zefirTasks.length, zefirDone,
            kutrzebaTotal: kutrzebaTasks.length, kutrzebaDone,
            totalEstimated, totalActual,
            progressPercent: total > 0 ? Math.round((done / total) * 100) : 0,
        };
    }, [tasks]);

    // Season countdown (from config)
    const countdown = useMemo(() => {
        const start = new Date(seasonDate + 'T00:00:00');
        const now = new Date();
        const diff = start.getTime() - now.getTime();
        if (diff <= 0) return { days: 0, label: 'Sezon trwa! ⛵' };
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        return { days, label: `do sezonu` };
    }, [seasonDate]);

    const saveSeasonDate = async (newDate: string) => {
        if (!token) return;
        try {
            await configApi.set(token, 'season_start', newDate);
            setSeasonDate(newDate);
        } catch { setError('Błąd zapisu daty sezonu'); }
        setEditingSeason(false);
    };

    // Filtered tasks
    const filteredTasks = useMemo(() => {
        return tasks.filter(t => {
            if (filterStatus && t.status !== filterStatus) return false;
            if (filterCategory && t.category !== filterCategory) return false;
            if (filterSearch && !t.title.toLowerCase().includes(filterSearch.toLowerCase())) return false;
            return true;
        });
    }, [tasks, filterStatus, filterCategory, filterSearch]);

    if (isLoading) {
        return (
            <div className="dashboard">
                <div className="dashboard-loading">
                    <div className="spinner" style={{ width: 40, height: 40 }} />
                    <p>Ładowanie danych...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard">
            {/* --- Top bar --- */}
            <header className="dash-header">
                <div className="dash-header-left">
                    <span className="dash-logo">⚓</span>
                    <div>
                        <h1 className="dash-title">Tramwaje Wodne</h1>
                        <p className="dash-subtitle">Panel zarządzania</p>
                    </div>
                </div>
                <div className="dash-header-right">
                    <Link to="/gantt" className="btn btn-ghost btn-sm">📊 Gantt</Link>
                    <Link to="/certificates" className="btn btn-ghost btn-sm">📜 Certyfikaty</Link>
                    <Link to="/equipment" className="btn btn-ghost btn-sm">🔧 Sprzęt</Link>
                    <Link to="/inventory" className="btn btn-ghost btn-sm">📦 Magazyn</Link>
                    <Link to="/suppliers" className="btn btn-ghost btn-sm">🏪 Dostawcy</Link>
                    <Link to="/budget" className="btn btn-ghost btn-sm">💰 Budżet</Link>
                    <Link to="/engine-hours" className="btn btn-ghost btn-sm">⚙️ Motogodziny</Link>
                    <Link to="/tanks" className="btn btn-ghost btn-sm">⛽ Zbiorniki</Link>
                    <Link to="/team" className="btn btn-ghost btn-sm">👥 Zespół</Link>
                    <a href="https://github.com/MichalPopo/Tramwaje-wodne/releases/latest" target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" title="Pobierz aplikację mobilną">📱 APK</a>
                    <Link to="/settings" className="btn btn-ghost btn-sm">⚙️ Ustawienia</Link>
                    <div className="dash-user">
                        <span className="dash-user-name">{user?.name}</span>
                        <span className="badge badge-todo">{user?.role}</span>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={logout}>
                        Wyloguj
                    </button>
                </div>
            </header>

            <main className="dash-content container">
                {/* Error toast */}
                {error && (
                    <div className="dash-error" onClick={() => setError('')}>
                        ⚠️ {error} <span style={{ opacity: 0.5 }}>×</span>
                    </div>
                )}

                {/* --- Season countdown + stats row --- */}
                <section className="dash-stats-row animate-fade-in">
                    <div className="card stat-card countdown-card" onClick={() => user?.role === 'admin' && setEditingSeason(true)} style={{ cursor: user?.role === 'admin' ? 'pointer' : 'default' }}>
                        {editingSeason ? (
                            <div onClick={e => e.stopPropagation()}>
                                <label style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>Data startu sezonu</label>
                                <input type="date" className="tfm-input" defaultValue={seasonDate}
                                    autoFocus
                                    onBlur={e => saveSeasonDate(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') saveSeasonDate((e.target as HTMLInputElement).value); if (e.key === 'Escape') setEditingSeason(false); }}
                                />
                            </div>
                        ) : (
                            <>
                                <div className="countdown-value">{countdown.days}</div>
                                <div className="countdown-label">{countdown.label}</div>
                                <div className="countdown-date">Start: {new Date(seasonDate).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                                {user?.role === 'admin' && <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '0.25rem' }}>✏️ kliknij aby zmienić</div>}
                            </>
                        )}
                    </div>

                    <div className="card stat-card">
                        <div className="stat">
                            <span className="stat-value">{stats.progressPercent}%</span>
                            <span className="stat-label">Postęp ogólny</span>
                        </div>
                        <div className="progress-bar" style={{ marginTop: '0.75rem' }}>
                            <div className="progress-fill" style={{ width: `${stats.progressPercent}%` }} />
                        </div>
                        <div className="stat-breakdown">
                            <span>✅ {stats.done} ukończone</span>
                            <span>📋 {stats.total} łącznie</span>
                        </div>
                    </div>

                    <div className="card stat-card">
                        <div className="stat">
                            <span className="stat-value">{stats.totalActual}h</span>
                            <span className="stat-label">Przepracowane</span>
                        </div>
                        <div className="hours-bar">
                            <div className="hours-actual" style={{ width: stats.totalEstimated > 0 ? `${Math.min(100, (stats.totalActual / stats.totalEstimated) * 100)}%` : '0%' }} />
                        </div>
                        <div className="stat-breakdown">
                            <span>z {stats.totalEstimated}h szacowanych</span>
                        </div>
                    </div>

                    <div className="card stat-card alerts-card">
                        {stats.critical > 0 && (
                            <div className="alert-item critical">
                                <span>🔴</span> {stats.critical} krytyczne
                            </div>
                        )}
                        {stats.blocked > 0 && (
                            <div className="alert-item blocked">
                                <span>🚫</span> {stats.blocked} wstrzymane
                            </div>
                        )}
                        {stats.inProgress > 0 && (
                            <div className="alert-item progress">
                                <span>🔄</span> {stats.inProgress} w toku
                            </div>
                        )}
                        {stats.critical === 0 && stats.blocked === 0 && (
                            <div className="alert-item ok">
                                <span>✅</span> Wszystko pod kontrolą
                            </div>
                        )}
                    </div>
                </section>

                {/* --- Ships progress --- */}
                <section className="dash-ships animate-fade-in" style={{ animationDelay: '0.1s' }}>
                    <h2 className="section-title">🚢 Postęp per statek</h2>
                    <div className="grid-2">
                        <ShipCard
                            name="m/s Zefir"
                            emoji="⛵"
                            route="S3 Tolkmicko – Krynica Morska"
                            total={stats.zefirTotal}
                            done={stats.zefirDone}
                        />
                        <ShipCard
                            name="m/s Gen. Kutrzeba"
                            emoji="🚤"
                            route="S2 Frombork – Piaski"
                            total={stats.kutrzebaTotal}
                            done={stats.kutrzebaDone}
                        />
                    </div>
                </section>

                {/* --- Weather + Water Level --- */}
                <section className="animate-fade-in" style={{ animationDelay: '0.15s' }}>
                    <div className="grid-2">
                        <WeatherWidget />
                        <WaterLevelWidget />
                    </div>
                </section>

                {/* --- Ship technical data --- */}
                <section className="animate-fade-in" style={{ animationDelay: '0.2s' }}>
                    <ShipDataCards />
                </section>

                {/* --- Today's tasks --- */}
                <section className="dash-today animate-fade-in" style={{ animationDelay: '0.2s' }}>
                    <h2 className="section-title">📅 Zadania na dziś ({todayTasks.length})</h2>
                    {todayTasks.length === 0 ? (
                        <div className="card empty-state">
                            <p>🎉 Brak pilnych zadań na dziś</p>
                        </div>
                    ) : (
                        <div className="task-list">
                            {todayTasks.slice(0, 8).map((task, i) => (
                                <TaskCard key={task.id} task={task} delay={i * 0.05} onClick={() => openTaskDetail(task.id)} />
                            ))}
                        </div>
                    )}
                </section>

                {/* --- All tasks overview --- */}
                <section className="dash-all animate-fade-in" style={{ animationDelay: '0.3s' }}>
                    <div className="section-header">
                        <h2 className="section-title">📋 Wszystkie zadania ({filteredTasks.length}/{tasks.length})</h2>
                        <button className="btn btn-primary btn-sm" onClick={() => setShowCreateModal(true)}>
                            ➕ Nowe zadanie
                        </button>
                    </div>
                    <div className="inv-filters" style={{ marginBottom: '0.75rem' }}>
                        <input className="inv-search" type="text" placeholder="Szukaj..." value={filterSearch}
                            onChange={e => setFilterSearch(e.target.value)} />
                        <select className="inv-filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                            <option value="">Wszystkie statusy</option>
                            <option value="todo">Do zrobienia</option>
                            <option value="in_progress">W toku</option>
                            <option value="blocked">Wstrzymane</option>
                            <option value="done">Ukończone</option>
                        </select>
                        <select className="inv-filter-select" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                            <option value="">Wszystkie kategorie</option>
                            {Object.entries(CATEGORY_ICONS).map(([key, icon]) => (
                                <option key={key} value={key}>{icon} {key}</option>
                            ))}
                        </select>
                    </div>
                    <div className="task-list">
                        {filteredTasks.map((task, i) => (
                            <TaskCard key={task.id} task={task} delay={i * 0.03} onClick={() => openTaskDetail(task.id)} />
                        ))}
                        {filteredTasks.length === 0 && (
                            <div className="card empty-state"><p>Brak zadań pasujących do filtrów</p></div>
                        )}
                    </div>
                </section>
            </main>
            <AiChat />
            <VoiceNoteButton />

            {/* --- Task Detail Modal (status + time) --- */}
            {viewingTask && (
                <div className="modal-backdrop" onClick={() => { setViewingTask(null); setShowTimeForm(false); }}>
                    <div className="modal animate-slide-up" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
                        <div className="modal-header">
                            <div className="modal-title-row">
                                <span>{CATEGORY_ICONS[viewingTask.category] || '📋'}</span>
                                <h2>{viewingTask.title}</h2>
                            </div>
                            <button className="btn btn-icon btn-ghost" onClick={() => { setViewingTask(null); setShowTimeForm(false); }}>✕</button>
                        </div>
                        <div className="modal-body">
                            <div className="modal-status-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <span className={`badge badge-${viewingTask.status}`}>{STATUS_LABELS[viewingTask.status]}</span>
                                <span className="task-priority" style={{ fontSize: '1.2rem' }}>{PRIORITY_ICONS[viewingTask.priority]}</span>
                            </div>
                            {viewingTask.description && <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>{viewingTask.description}</p>}
                            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                                {viewingTask.ship_name && <span>🚢 {viewingTask.ship_name}</span>}
                                {viewingTask.estimated_hours && <span>⏱ {viewingTask.actual_hours}/{viewingTask.estimated_hours}h</span>}
                                {viewingTask.deadline && <span>📅 {viewingTask.deadline}</span>}
                                {viewingTask.assignees?.length > 0 && <span>👷 {viewingTask.assignees.map(a => a.name).join(', ')}</span>}
                            </div>

                            {/* Time logs */}
                            {viewingTask.time_logs.length > 0 && (
                                <div style={{ marginBottom: '1rem' }}>
                                    <h3 style={{ fontSize: 'var(--font-md)', marginBottom: '0.5rem' }}>⏱ Zalogowany czas</h3>
                                    {viewingTask.time_logs.map(log => (
                                        <div key={log.id} style={{ display: 'flex', gap: '0.75rem', padding: '0.4rem 0', borderBottom: '1px solid var(--border)', fontSize: 'var(--font-sm)' }}>
                                            <span style={{ fontWeight: 700, color: 'var(--primary)', minWidth: 40 }}>{log.hours}h</span>
                                            <span style={{ flex: 1, color: 'var(--text-muted)' }}>{log.user_name || '—'}</span>
                                            {log.note && <span style={{ color: 'var(--text-dim)' }}>{log.note}</span>}
                                            <span style={{ color: 'var(--text-dim)' }}>{new Date(log.logged_at).toLocaleDateString('pl-PL')}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Time logging form */}
                            {showTimeForm && (
                                <div style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
                                    <h3 style={{ fontSize: 'var(--font-md)', marginBottom: '0.5rem' }}>⏱ Loguj czas</h3>
                                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                        <input className="input" type="number" min="0.25" max="24" step="0.25" placeholder="Godziny" value={timeHours} onChange={e => setTimeHours(e.target.value)} style={{ flex: 1 }} />
                                        <input className="input" type="text" placeholder="Notatka (opcjonalnie)" value={timeNote} onChange={e => setTimeNote(e.target.value)} style={{ flex: 2 }} />
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        {[0.5, 1, 2, 4, 8].map(h => (
                                            <button key={h} className="btn btn-ghost btn-sm" onClick={() => setTimeHours(String(h))} type="button">{h}h</button>
                                        ))}
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                                        <button className="btn btn-ghost" onClick={() => setShowTimeForm(false)}>Anuluj</button>
                                        <button className="btn btn-primary" onClick={handleTimeLog} disabled={!timeHours || parseFloat(timeHours) <= 0}>💾 Zapisz</button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="modal-actions" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end', padding: '1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
                            {!showTimeForm && <button className="btn btn-ghost" onClick={() => setShowTimeForm(true)}>⏱ Loguj czas</button>}
                            {viewingTask.status === 'todo' && <button className="btn btn-primary" onClick={() => handleStatusChange('in_progress')}>▶️ Rozpocznij</button>}
                            {viewingTask.status === 'in_progress' && <button className="btn btn-success" onClick={() => handleStatusChange('done')}>✅ Ukończ</button>}
                            {viewingTask.status === 'in_progress' && <button className="btn btn-warning" onClick={() => { const reason = prompt('Powód wstrzymania:'); if (reason !== null) handleStatusChange('blocked', reason || undefined); }}>🚫 Wstrzymaj</button>}
                            {viewingTask.status === 'blocked' && <button className="btn btn-primary" onClick={() => handleStatusChange('in_progress')}>▶️ Wznów</button>}
                            {viewingTask.status === 'done' && <button className="btn btn-ghost" onClick={() => handleStatusChange('todo')}>↩ Cofnij</button>}
                            <button className="btn btn-ghost" onClick={() => openEditTask(viewingTask.id)}>✏️ Edytuj</button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- Modals --- */}
            {showCreateModal && (
                <TaskFormModal
                    mode="create"
                    onClose={() => setShowCreateModal(false)}
                    onSave={handleCreate}
                />
            )}
            {editingTask && (
                <TaskFormModal
                    mode="edit"
                    initialData={{
                        id: editingTask.id,
                        title: editingTask.title,
                        description: editingTask.description || '',
                        ship_id: editingTask.ship_id,
                        category: editingTask.category,
                        priority: editingTask.priority,
                        estimated_hours: editingTask.estimated_hours?.toString() || '',
                        deadline: editingTask.deadline || '',
                        weather_dependent: editingTask.weather_dependent,
                        assignee_ids: editingTask.assignees?.map(a => a.id) || [],
                        logistics_notes: editingTask.logistics_notes || '',
                    }}
                    onClose={() => setEditingTask(null)}
                    onSave={handleUpdate}
                    onDelete={handleDelete}
                />
            )}
        </div>
    );
}

// --- Sub-components ---

function ShipCard({ name, emoji, route, total, done }: {
    name: string;
    emoji: string;
    route: string;
    total: number;
    done: number;
}) {
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;

    return (
        <div className="card ship-card">
            <div className="ship-card-header">
                <span className="ship-emoji">{emoji}</span>
                <div>
                    <h3 className="ship-name">{name}</h3>
                    <p className="ship-route">{route}</p>
                </div>
            </div>
            <div className="ship-progress">
                <div className="progress-bar" style={{ height: 10 }}>
                    <div className="progress-fill" style={{ width: `${percent}%` }} />
                </div>
                <div className="ship-stats">
                    <span className="ship-percent">{percent}%</span>
                    <span className="ship-count">{done} / {total}</span>
                </div>
            </div>
        </div>
    );
}

function TaskCard({ task, delay, onClick }: { task: TaskSummary; delay: number; onClick?: () => void }) {
    return (
        <div
            className={`card task-card animate-slide-up ${onClick ? 'clickable' : ''}`}
            style={{ animationDelay: `${delay}s` }}
            onClick={onClick}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
        >
            <div className="task-card-top">
                <div className="task-card-left">
                    <span className="task-category-icon">{CATEGORY_ICONS[task.category] || '📋'}</span>
                    <div>
                        <h3 className="task-title">{task.title}</h3>
                        <div className="task-meta">
                            {task.ship_name && <span className="task-ship">{task.ship_name}</span>}
                            {task.estimated_hours && (
                                <span className="task-hours">
                                    ⏱ {task.actual_hours}/{task.estimated_hours}h
                                </span>
                            )}
                            {task.weather_dependent && <span className="task-weather">🌤️</span>}
                            {task.deadline && (
                                <span className="task-deadline">📅 {task.deadline}</span>
                            )}
                        </div>
                    </div>
                </div>
                <div className="task-card-right">
                    <span className={`badge badge-${task.status}`}>
                        {STATUS_LABELS[task.status]}
                    </span>
                    <span className="task-priority">
                        {PRIORITY_ICONS[task.priority]}
                    </span>
                </div>
            </div>
        </div>
    );
}
