import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { tasksApi, type TaskSummary, type TaskDetail } from '../api';
import './CompletedTasksPage.css';

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

export default function CompletedTasksPage() {
    const { user, token } = useAuth();
    const navigate = useNavigate();

    const [tasks, setTasks] = useState<TaskSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterSearch, setFilterSearch] = useState('');
    const [filterCategory, setFilterCategory] = useState('');

    // Task detail modal
    const [viewingTask, setViewingTask] = useState<TaskDetail | null>(null);

    const loadTasks = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        try {
            const data = await tasksApi.list(token, { status: 'done' });
            setTasks(data.tasks);
        } catch (err) {
            console.error('Failed to load completed tasks', err);
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => { loadTasks(); }, [loadTasks]);

    const filteredTasks = useMemo(() => {
        return tasks.filter(t => {
            if (filterCategory && t.category !== filterCategory) return false;
            if (filterSearch && !t.title.toLowerCase().includes(filterSearch.toLowerCase())) return false;
            return true;
        });
    }, [tasks, filterCategory, filterSearch]);

    // Stats
    const totalHours = useMemo(() =>
        tasks.reduce((sum, t) => sum + t.actual_hours, 0),
        [tasks],
    );
    const totalEstimated = useMemo(() =>
        tasks.reduce((sum, t) => sum + (t.estimated_hours || 0), 0),
        [tasks],
    );

    const openTaskDetail = async (taskId: number) => {
        if (!token) return;
        try {
            const { task } = await tasksApi.get(token, taskId);
            setViewingTask(task);
        } catch {
            console.error('Failed to load task detail');
        }
    };

    const handleReopen = async () => {
        if (!token || !viewingTask) return;
        try {
            await tasksApi.changeStatus(token, viewingTask.id, 'todo');
            setViewingTask(null);
            loadTasks();
        } catch {
            console.error('Failed to reopen task');
        }
    };

    if (!user || user.role !== 'admin') return null;

    return (
        <div className="completed-page">
            {/* Header */}
            <div className="completed-header">
                <div className="completed-header-left">
                    <button className="completed-back-btn" onClick={() => navigate('/dashboard')}>
                        ← Dashboard
                    </button>
                    <h1>✅ Zakończone zadania</h1>
                </div>
            </div>

            <div className="completed-content">
                {/* Stats */}
                <div className="completed-stats">
                    <div className="completed-stat">
                        <span className="completed-stat-value">{tasks.length}</span>
                        <span className="completed-stat-label">Ukończonych</span>
                    </div>
                    <div className="completed-stat">
                        <span className="completed-stat-value">{totalHours}h</span>
                        <span className="completed-stat-label">Przepracowanych</span>
                    </div>
                    <div className="completed-stat">
                        <span className="completed-stat-value">{totalEstimated}h</span>
                        <span className="completed-stat-label">Szacowanych</span>
                    </div>
                </div>

                {/* Filters */}
                <div className="completed-filters">
                    <input
                        className="inv-search"
                        type="text"
                        placeholder="Szukaj zakończone zadania..."
                        value={filterSearch}
                        onChange={e => setFilterSearch(e.target.value)}
                    />
                    <select
                        className="inv-filter-select"
                        value={filterCategory}
                        onChange={e => setFilterCategory(e.target.value)}
                    >
                        <option value="">Wszystkie kategorie</option>
                        {Object.entries(CATEGORY_ICONS).map(([key, icon]) => (
                            <option key={key} value={key}>{icon} {key}</option>
                        ))}
                    </select>
                </div>

                {/* Task list */}
                {loading ? (
                    <div className="completed-empty">
                        <div className="spinner" style={{ width: 40, height: 40, margin: '0 auto' }} />
                        <p style={{ marginTop: '1rem' }}>Ładowanie...</p>
                    </div>
                ) : filteredTasks.length === 0 ? (
                    <div className="completed-empty">
                        <div className="completed-empty-icon">📋</div>
                        <div className="completed-empty-text">
                            {tasks.length === 0 ? 'Brak zakończonych zadań' : 'Brak zadań pasujących do filtrów'}
                        </div>
                    </div>
                ) : (
                    <div className="completed-list">
                        {filteredTasks.map(task => (
                            <div
                                key={task.id}
                                className="completed-card"
                                onClick={() => openTaskDetail(task.id)}
                            >
                                <div className="completed-card-left">
                                    <span className="completed-card-emoji">
                                        {CATEGORY_ICONS[task.category] || '📋'}
                                    </span>
                                    <div className="completed-card-info">
                                        <div className="completed-card-title">{task.title}</div>
                                        <div className="completed-card-meta">
                                            {task.ship_name && <span>🚢 {task.ship_name}</span>}
                                            <span>⏱ {task.actual_hours}/{task.estimated_hours || 0}h</span>
                                            {task.deadline && <span>📅 {task.deadline}</span>}
                                        </div>
                                    </div>
                                </div>
                                <div className="completed-card-right">
                                    <span className="completed-card-date">
                                        {new Date(task.updated_at).toLocaleDateString('pl-PL', {
                                            day: 'numeric', month: 'short', year: 'numeric',
                                        })}
                                    </span>
                                    <span className="completed-card-badge">Ukończone</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Task Detail Modal */}
            {viewingTask && (
                <div className="modal-backdrop" onClick={() => setViewingTask(null)}>
                    <div className="modal animate-slide-up" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
                        <div className="modal-header">
                            <div className="modal-title-row">
                                <span>{CATEGORY_ICONS[viewingTask.category] || '📋'}</span>
                                <h2>{viewingTask.title}</h2>
                            </div>
                            <button className="btn btn-icon btn-ghost" onClick={() => setViewingTask(null)}>✕</button>
                        </div>
                        <div className="modal-body">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <span className="badge badge-done">{STATUS_LABELS[viewingTask.status]}</span>
                                <span style={{ fontSize: '1.2rem' }}>{PRIORITY_ICONS[viewingTask.priority]}</span>
                            </div>
                            {viewingTask.description && (
                                <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>{viewingTask.description}</p>
                            )}
                            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                                {viewingTask.ship_name && <span>🚢 {viewingTask.ship_name}</span>}
                                {viewingTask.estimated_hours && (
                                    <span>⏱ {viewingTask.actual_hours}/{viewingTask.estimated_hours}h</span>
                                )}
                                {viewingTask.deadline && <span>📅 {viewingTask.deadline}</span>}
                                {viewingTask.assignees?.length > 0 && (
                                    <span>👷 {viewingTask.assignees.map(a => a.name).join(', ')}</span>
                                )}
                            </div>

                            {/* Time logs */}
                            {viewingTask.time_logs?.length > 0 && (
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
                        </div>

                        <div className="modal-actions" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', padding: '1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
                            <button className="btn btn-ghost" onClick={handleReopen}>↩ Cofnij do aktywnych</button>
                            <button className="btn btn-ghost" onClick={() => setViewingTask(null)}>Zamknij</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
