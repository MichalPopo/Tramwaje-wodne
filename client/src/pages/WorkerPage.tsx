import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { tasksApi, attachmentApi, type TaskSummary, type TaskDetail, type AttachmentInfo } from '../api';
import AiChat from '../components/AiChat';
import VoiceNoteButton from '../components/VoiceNoteButton';
import PhotoGallery from '../components/PhotoGallery';
import './WorkerPage.css';

const STATUS_LABELS: Record<string, string> = {
    todo: 'Do zrobienia',
    in_progress: 'W toku',
    blocked: 'Wstrzymane',
    done: 'Ukończone',
};

const STATUS_FLOW: Record<string, string[]> = {
    todo: ['in_progress'],
    in_progress: ['done', 'blocked'],
    blocked: ['in_progress'],
    done: [],
};

const CATEGORY_ICONS: Record<string, string> = {
    spawanie: '🔥', malowanie: '🎨', mechanika_silnikowa: '⚙️',
    elektryka: '⚡', hydraulika: '🔧', stolarka: '🪵',
    inspekcja: '🔍', logistyka: '🚚', rejs_probny: '⛵', inne: '📋',
};

const PRIORITY_ICONS: Record<string, string> = {
    critical: '🔴', high: '🟠', normal: '🔵', low: '⚪',
};

export default function WorkerPage() {
    const { user, token, logout } = useAuth();
    const [tasks, setTasks] = useState<TaskSummary[]>([]);
    const [scheduledDays, setScheduledDays] = useState<Map<number, number>>(new Map()); // task_id → day offset from today
    const [selectedTask, setSelectedTask] = useState<TaskDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [showTimeModal, setShowTimeModal] = useState(false);
    const [error, setError] = useState('');

    const loadTasks = useCallback(async () => {
        if (!token || !user) return;
        try {
            // Load assigned tasks
            const data = await tasksApi.my(token);
            setTasks(data.tasks);

            // Load schedule data to know WHEN each task is planned
            try {
                const gantt = await tasksApi.gantt(token, { assignee_id: String(user.id) });
                const dayMap = new Map<number, number>();
                for (const gt of gantt.tasks) {
                    // early_start is in hours from today; convert to day offset
                    const dayOffset = Math.floor(gt.early_start / 8);
                    dayMap.set(gt.id, dayOffset);
                }
                setScheduledDays(dayMap);
            } catch {
                // If gantt fails, we still show tasks — just without day grouping
            }
        } catch (err) {
            console.error('Failed to load tasks:', err);
        } finally {
            setIsLoading(false);
        }
    }, [token, user]);

    useEffect(() => { loadTasks(); }, [loadTasks]);

    const openTask = async (id: number) => {
        if (!token) return;
        try {
            const data = await tasksApi.get(token, id);
            setSelectedTask(data.task);
            setError('');
        } catch {
            setError('Nie udało się załadować zadania');
        }
    };

    const handleStatusChange = async (status: string, blocked_reason?: string) => {
        if (!token || !selectedTask) return;
        try {
            const data = await tasksApi.changeStatus(token, selectedTask.id, status, blocked_reason);
            setSelectedTask(data.task);
            setError('');
            loadTasks();
        } catch {
            setError('Nie udało się zmienić statusu');
        }
    };

    const handleTimeSubmit = async (hours: number, note: string) => {
        if (!token || !selectedTask) return;
        try {
            await tasksApi.logTime(token, selectedTask.id, hours, note || undefined);
            const data = await tasksApi.get(token, selectedTask.id);
            setSelectedTask(data.task);
            setShowTimeModal(false);
            setError('');
            loadTasks();
        } catch {
            setError('Nie udało się zapisać czasu');
        }
    };

    // Group tasks by scheduled day
    const grouped = useMemo(() => {
        const active = tasks.filter(t => t.status === 'in_progress');
        const blocked = tasks.filter(t => t.status === 'blocked');
        const done = tasks.filter(t => t.status === 'done');
        const pending = tasks.filter(t => t.status === 'todo');

        // Sort pending tasks by scheduled day
        const today: TaskSummary[] = [];
        const tomorrow: TaskSummary[] = [];
        const dayAfter: TaskSummary[] = [];
        const later: TaskSummary[] = [];

        for (const t of pending) {
            const dayOffset = scheduledDays.get(t.id);
            if (dayOffset === undefined || dayOffset <= 0) {
                today.push(t);
            } else if (dayOffset === 1) {
                tomorrow.push(t);
            } else if (dayOffset === 2) {
                dayAfter.push(t);
            } else {
                later.push(t);
            }
        }

        return { active, today, tomorrow, dayAfter, later, blocked, done };
    }, [tasks, scheduledDays]);

    if (isLoading) {
        return (
            <div className="worker-page">
                <div className="dashboard-loading">
                    <div className="spinner" style={{ width: 40, height: 40 }} />
                    <p>Ładowanie zadań...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="worker-page">
            {/* Header */}
            <header className="worker-header">
                <div className="dash-header-left">
                    <span className="dash-logo">⚓</span>
                    <div>
                        <h1 className="dash-title">Moje zadania</h1>
                        <p className="dash-subtitle">{user?.name}</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <Link to="/inventory" className="btn btn-ghost btn-sm">📦 Magazyn</Link>
                    <Link to="/equipment" className="btn btn-ghost btn-sm">🔧 Sprzęt</Link>
                    <button className="btn btn-ghost btn-sm" onClick={logout}>Wyloguj</button>
                </div>
            </header>

            <main className="worker-content container">
                {/* Error toast */}
                {error && (
                    <div className="card animate-fade-in" style={{ borderColor: 'var(--accent-red)', padding: '0.75rem 1rem', textAlign: 'center', color: 'var(--accent-red)' }}>
                        ⚠️ {error}
                    </div>
                )}

                {/* Quick stats */}
                <div className="worker-stats animate-fade-in">
                    <div className="worker-stat active">
                        <span className="worker-stat-val">{grouped.active.length}</span>
                        <span className="worker-stat-lbl">W toku</span>
                    </div>
                    <div className="worker-stat todo">
                        <span className="worker-stat-val">{grouped.today.length}</span>
                        <span className="worker-stat-lbl">Dziś</span>
                    </div>
                    <div className="worker-stat blocked">
                        <span className="worker-stat-val">{grouped.blocked.length}</span>
                        <span className="worker-stat-lbl">Wstrzymane</span>
                    </div>
                    <div className="worker-stat done">
                        <span className="worker-stat-val">{grouped.done.length}</span>
                        <span className="worker-stat-lbl">Ukończone</span>
                    </div>
                </div>

                {/* Active tasks first */}
                {grouped.active.length > 0 && (
                    <section className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
                        <h2 className="section-title">🔄 W toku</h2>
                        <div className="task-list">
                            {grouped.active.map(t => (
                                <WorkerTaskCard key={t.id} task={t} onClick={() => openTask(t.id)} />
                            ))}
                        </div>
                    </section>
                )}

                {/* Today */}
                {grouped.today.length > 0 && (
                    <section className="animate-fade-in" style={{ animationDelay: '0.12s' }}>
                        <h2 className="section-title">📌 Dziś</h2>
                        <div className="task-list">
                            {grouped.today.map(t => (
                                <WorkerTaskCard key={t.id} task={t} onClick={() => openTask(t.id)} />
                            ))}
                        </div>
                    </section>
                )}

                {/* Tomorrow */}
                {grouped.tomorrow.length > 0 && (
                    <section className="animate-fade-in" style={{ animationDelay: '0.14s' }}>
                        <h2 className="section-title">📅 Jutro</h2>
                        <div className="task-list">
                            {grouped.tomorrow.map(t => (
                                <WorkerTaskCard key={t.id} task={t} onClick={() => openTask(t.id)} />
                            ))}
                        </div>
                    </section>
                )}

                {/* Day after tomorrow */}
                {grouped.dayAfter.length > 0 && (
                    <section className="animate-fade-in" style={{ animationDelay: '0.16s' }}>
                        <h2 className="section-title">📅 Pojutrze</h2>
                        <div className="task-list">
                            {grouped.dayAfter.map(t => (
                                <WorkerTaskCard key={t.id} task={t} onClick={() => openTask(t.id)} />
                            ))}
                        </div>
                    </section>
                )}

                {/* Later */}
                {grouped.later.length > 0 && (
                    <section className="animate-fade-in" style={{ animationDelay: '0.18s' }}>
                        <h2 className="section-title">🗓️ Później ({grouped.later.length})</h2>
                        <div className="task-list">
                            {grouped.later.map(t => (
                                <WorkerTaskCard key={t.id} task={t} onClick={() => openTask(t.id)} dimmed />
                            ))}
                        </div>
                    </section>
                )}

                {/* Blocked */}
                {grouped.blocked.length > 0 && (
                    <section className="animate-fade-in" style={{ animationDelay: '0.2s' }}>
                        <h2 className="section-title">🚫 Wstrzymane</h2>
                        <div className="task-list">
                            {grouped.blocked.map(t => (
                                <WorkerTaskCard key={t.id} task={t} onClick={() => openTask(t.id)} />
                            ))}
                        </div>
                    </section>
                )}

                {/* Done (collapsed) */}
                {grouped.done.length > 0 && (
                    <section className="animate-fade-in" style={{ animationDelay: '0.25s' }}>
                        <h2 className="section-title">✅ Ukończone ({grouped.done.length})</h2>
                        <div className="task-list done-list">
                            {grouped.done.slice(0, 3).map(t => (
                                <WorkerTaskCard key={t.id} task={t} onClick={() => openTask(t.id)} dimmed />
                            ))}
                        </div>
                    </section>
                )}

                {tasks.length === 0 && (
                    <div className="card empty-state animate-fade-in">
                        <p>📭 Brak przypisanych zadań</p>
                        <p style={{ fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>
                            Poczekaj aż admin przypisze Ci zadania
                        </p>
                    </div>
                )}
            </main>

            {/* Task detail modal */}
            {selectedTask && (
                <TaskModal
                    task={selectedTask}
                    onClose={() => setSelectedTask(null)}
                    onStatusChange={handleStatusChange}
                    onLogTime={() => setShowTimeModal(true)}
                />
            )}

            {/* Time logging modal */}
            {showTimeModal && selectedTask && (
                <TimeLogModal
                    taskTitle={selectedTask.title}
                    onSubmit={handleTimeSubmit}
                    onClose={() => setShowTimeModal(false)}
                />
            )}
            <AiChat />
            <VoiceNoteButton />
        </div>
    );
}

// --- Sub-components ---

function WorkerTaskCard({ task, onClick, dimmed }: {
    task: TaskSummary;
    onClick: () => void;
    dimmed?: boolean;
}) {
    return (
        <button
            className={`card worker-task-card ${dimmed ? 'dimmed' : ''}`}
            onClick={onClick}
            type="button"
        >
            <div className="wtc-left">
                <span className="wtc-icon">{CATEGORY_ICONS[task.category] || '📋'}</span>
                <div className="wtc-info">
                    <h3 className="wtc-title">{task.title}</h3>
                    <div className="task-meta">
                        {task.ship_name && <span className="task-ship">{task.ship_name}</span>}
                        {task.estimated_hours && (
                            <span>⏱ {task.actual_hours}/{task.estimated_hours}h</span>
                        )}
                        {task.weather_dependent && <span>🌤️</span>}
                    </div>
                </div>
            </div>
            <div className="wtc-right">
                <span className="task-priority">{PRIORITY_ICONS[task.priority]}</span>
                <span className="wtc-arrow">›</span>
            </div>
        </button>
    );
}

function TaskModal({ task, onClose, onStatusChange, onLogTime }: {
    task: TaskDetail;
    onClose: () => void;
    onStatusChange: (status: string, blocked_reason?: string) => void;
    onLogTime: () => void;
}) {
    const { token } = useAuth();
    const [showBlockInput, setShowBlockInput] = useState(false);
    const [blockReason, setBlockReason] = useState('');
    const [attachments, setAttachments] = useState<AttachmentInfo[]>([]);
    const [uploading, setUploading] = useState(false);
    const nextStatuses = STATUS_FLOW[task.status] || [];

    // Load attachments
    useEffect(() => {
        if (!token) return;
        attachmentApi.list(token, task.id).then(d => setAttachments(d.attachments)).catch(() => { });
    }, [token, task.id]);

    const handlePhotoUpload = async (tag?: string) => {
        if (!token) return;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'environment';
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;
            setUploading(true);
            try {
                const reader = new FileReader();
                reader.onload = async () => {
                    const base64 = (reader.result as string).split(',')[1];
                    const att = await attachmentApi.upload(token, task.id, {
                        type: 'photo',
                        data_base64: base64,
                        original_name: file.name,
                        mime_type: file.type,
                        tag: tag as 'before' | 'after' | 'progress' | undefined,
                    });
                    setAttachments(prev => [att.attachment, ...prev]);
                    setUploading(false);
                };
                reader.readAsDataURL(file);
            } catch { setUploading(false); }
        };
        input.click();
    };

    const handleDeleteAttachment = async (id: number) => {
        if (!token) return;
        await attachmentApi.remove(token, id);
        setAttachments(prev => prev.filter(a => a.id !== id));
    };

    const handleTagChange = async (id: number, tag: string | null) => {
        if (!token) return;
        await attachmentApi.updateTag(token, id, tag);
        setAttachments(prev => prev.map(a => a.id === id ? { ...a, tag } : a));
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal animate-slide-up" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div className="modal-title-row">
                        <span>{CATEGORY_ICONS[task.category] || '📋'}</span>
                        <h2>{task.title}</h2>
                    </div>
                    <button className="btn btn-icon btn-ghost" onClick={onClose}>✕</button>
                </div>

                <div className="modal-body">
                    {/* Status */}
                    <div className="modal-status-row">
                        <span className={`badge badge-${task.status}`}>
                            {STATUS_LABELS[task.status]}
                        </span>
                        <span className="task-priority" style={{ fontSize: '1.2rem' }}>
                            {PRIORITY_ICONS[task.priority]}
                        </span>
                    </div>

                    {/* Description */}
                    {task.description && (
                        <div className="modal-section">
                            <h3>Opis</h3>
                            <p className="modal-desc">{task.description}</p>
                        </div>
                    )}

                    {/* Details */}
                    <div className="modal-details">
                        {task.ship_name && (
                            <div className="modal-detail">
                                <span className="md-label">Statek</span>
                                <span className="md-value">{task.ship_name}</span>
                            </div>
                        )}
                        {task.estimated_hours && (
                            <div className="modal-detail">
                                <span className="md-label">Godziny</span>
                                <span className="md-value">{task.actual_hours} / {task.estimated_hours}h</span>
                            </div>
                        )}
                        {task.deadline && (
                            <div className="modal-detail">
                                <span className="md-label">Termin</span>
                                <span className="md-value">📅 {task.deadline}</span>
                            </div>
                        )}
                        {task.blocked_reason && (
                            <div className="modal-detail blocked-reason">
                                <span className="md-label">Powód blokady</span>
                                <span className="md-value">{task.blocked_reason}</span>
                            </div>
                        )}
                        {task.logistics_notes && (
                            <div className="modal-detail">
                                <span className="md-label">Logistyka</span>
                                <span className="md-value">{task.logistics_notes}</span>
                            </div>
                        )}
                    </div>

                    {/* Weather */}
                    {task.weather_dependent && (
                        <div className="modal-section weather-info">
                            <h3>🌤️ Wymogi pogodowe</h3>
                            <div className="weather-chips">
                                {task.weather_min_temp != null && (
                                    <span className="weather-chip">🌡️ Min. {task.weather_min_temp}°C</span>
                                )}
                                {task.weather_max_humidity != null && (
                                    <span className="weather-chip">💧 Max. {task.weather_max_humidity}%</span>
                                )}
                                {task.weather_max_wind != null && (
                                    <span className="weather-chip">💨 Max. {task.weather_max_wind} m/s</span>
                                )}
                                {task.weather_no_rain && (
                                    <span className="weather-chip">☂️ Bez deszczu</span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Dependencies */}
                    {task.dependencies.length > 0 && (
                        <div className="modal-section">
                            <h3>🔗 Zależności</h3>
                            <div className="dep-list">
                                {task.dependencies.map(dep => (
                                    <div key={dep.id} className="dep-item">
                                        <span className={`badge badge-${dep.status} badge-sm`}>
                                            {STATUS_LABELS[dep.status]}
                                        </span>
                                        <span>{dep.title}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Time logs */}
                    {task.time_logs.length > 0 && (
                        <div className="modal-section">
                            <h3>⏱ Zalogowany czas</h3>
                            <div className="time-log-list">
                                {task.time_logs.map(log => (
                                    <div key={log.id} className="time-log-item">
                                        <span className="tl-hours">{log.hours}h</span>
                                        <span className="tl-user">{log.user_name}</span>
                                        {log.note && <span className="tl-note">{log.note}</span>}
                                        <span className="tl-date">
                                            {new Date(log.logged_at).toLocaleDateString('pl-PL')}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {/* Photos / Attachments */}
                    <div className="modal-section">
                        <h3>📷 Dokumentacja fotograficzna ({attachments.length})</h3>
                        <PhotoGallery
                            taskId={task.id}
                            attachments={attachments}
                            uploading={uploading}
                            onUpload={(tag) => handlePhotoUpload(tag)}
                            onDelete={handleDeleteAttachment}
                            onTagChange={handleTagChange}
                        />
                    </div>
                </div>

                {/* Actions */}
                <div className="modal-actions">
                    <button className="btn btn-ghost" onClick={onLogTime}>
                        ⏱ Loguj czas
                    </button>
                    {showBlockInput ? (
                        <div style={{ display: 'flex', gap: '0.5rem', flex: 1 }}>
                            <input
                                className="input"
                                type="text"
                                placeholder="Powód wstrzymania..."
                                value={blockReason}
                                onChange={e => setBlockReason(e.target.value)}
                                autoFocus
                            />
                            <button
                                className="btn btn-warning"
                                onClick={() => {
                                    onStatusChange('blocked', blockReason || undefined);
                                    setShowBlockInput(false);
                                    setBlockReason('');
                                }}
                            >
                                🚫 Potwierdź
                            </button>
                        </div>
                    ) : (
                        nextStatuses.map(status => (
                            <button
                                key={status}
                                className={`btn ${status === 'done' ? 'btn-success' : status === 'blocked' ? 'btn-warning' : 'btn-primary'}`}
                                onClick={() => {
                                    if (status === 'blocked') {
                                        setShowBlockInput(true);
                                    } else {
                                        onStatusChange(status);
                                    }
                                }}
                            >
                                {status === 'in_progress' && '▶️ Rozpocznij'}
                                {status === 'done' && '✅ Ukończone'}
                                {status === 'blocked' && '🚫 Wstrzymaj'}
                            </button>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

function TimeLogModal({ taskTitle, onSubmit, onClose }: {
    taskTitle: string;
    onSubmit: (hours: number, note: string) => void;
    onClose: () => void;
}) {
    const [hours, setHours] = useState('');
    const [note, setNote] = useState('');
    const [timerRunning, setTimerRunning] = useState(false);
    const [timerSeconds, setTimerSeconds] = useState(0);

    // Timer
    useEffect(() => {
        if (!timerRunning) return;
        const interval = setInterval(() => {
            setTimerSeconds(s => s + 1);
        }, 1000);
        return () => clearInterval(interval);
    }, [timerRunning]);

    const toggleTimer = () => {
        if (timerRunning) {
            setTimerRunning(false);
            const timerHours = Math.round((timerSeconds / 3600) * 100) / 100;
            setHours(String(Math.max(0.25, timerHours)));
        } else {
            setTimerSeconds(0);
            setTimerRunning(true);
        }
    };

    const formatTimer = (s: number) => {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    };

    const handleSubmit = () => {
        const h = parseFloat(hours);
        if (isNaN(h) || h <= 0 || h > 24) return;
        onSubmit(h, note);
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal time-modal animate-slide-up" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>⏱ Loguj czas</h2>
                    <button className="btn btn-icon btn-ghost" onClick={onClose}>✕</button>
                </div>

                <div className="modal-body">
                    <p className="time-task-title">{taskTitle}</p>

                    {/* Timer */}
                    <div className="timer-section">
                        <div className={`timer-display ${timerRunning ? 'running' : ''}`}>
                            {formatTimer(timerSeconds)}
                        </div>
                        <button
                            className={`btn ${timerRunning ? 'btn-danger' : 'btn-primary'} btn-timer`}
                            onClick={toggleTimer}
                            type="button"
                        >
                            {timerRunning ? '⏹ Stop' : '▶️ Start timer'}
                        </button>
                    </div>

                    <div className="time-divider">
                        <span>lub wpisz ręcznie</span>
                    </div>

                    {/* Manual entry */}
                    <div className="input-group">
                        <label className="input-label" htmlFor="time-hours">Godziny</label>
                        <input
                            id="time-hours"
                            className="input"
                            type="number"
                            min="0.25"
                            max="24"
                            step="0.25"
                            placeholder="np. 2.5"
                            value={hours}
                            onChange={e => setHours(e.target.value)}
                        />
                    </div>

                    <div className="input-group">
                        <label className="input-label" htmlFor="time-note">Notatka (opcjonalnie)</label>
                        <input
                            id="time-note"
                            className="input"
                            type="text"
                            placeholder="Co robiłeś?"
                            value={note}
                            onChange={e => setNote(e.target.value)}
                        />
                    </div>

                    {/* Quick presets */}
                    <div className="time-presets">
                        {[0.5, 1, 2, 4, 8].map(h => (
                            <button
                                key={h}
                                className="btn btn-ghost btn-sm time-preset"
                                onClick={() => setHours(String(h))}
                                type="button"
                            >
                                {h}h
                            </button>
                        ))}
                    </div>
                </div>

                <div className="modal-actions">
                    <button className="btn btn-ghost" onClick={onClose}>Anuluj</button>
                    <button
                        className="btn btn-primary"
                        onClick={handleSubmit}
                        disabled={!hours || parseFloat(hours) <= 0}
                    >
                        💾 Zapisz czas
                    </button>
                </div>
            </div>
        </div>
    );
}
