import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { tasksApi, shipsApi, authApi, weatherApi, type GanttTask, type Ship, type User, type DailyForecast } from '../api';
import './GanttPage.css';

const CATEGORY_EMOJI: Record<string, string> = {
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
    pending: 'Oczekuje',
    in_progress: 'W trakcie',
    done: 'Ukończone',
    blocked: 'Zablokowane',
};

const PRIORITY_LABELS: Record<string, string> = {
    critical: 'Krytyczny',
    high: 'Wysoki',
    normal: 'Normalny',
    low: 'Niski',
};

const HOURS_PER_DAY = 8;
const DAY_WIDTH = 48; // px per calendar day
const ROW_HEIGHT = 48;

// Helper: generate array of dates from start to end
function getDateRange(startDate: Date, numDays: number): Date[] {
    const dates: Date[] = [];
    for (let i = 0; i < numDays; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        dates.push(d);
    }
    return dates;
}

function formatDateShort(d: Date): string {
    return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
}

function formatDateISO(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export default function GanttPage() {
    const { user, token } = useAuth();
    const navigate = useNavigate();

    const [tasks, setTasks] = useState<GanttTask[]>([]);
    const [totalHours, setTotalHours] = useState(0);
    const [totalWorkers, setTotalWorkers] = useState(0);
    const [dailyCapacity, setDailyCapacity] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [brokenEdges, setBrokenEdges] = useState<{ from: number; to: number }[]>([]);

    // Filters
    const [shipFilter, setShipFilter] = useState('');
    const [assigneeFilter, setAssigneeFilter] = useState('');

    // Reference data
    const [ships, setShips] = useState<Ship[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [weatherDays, setWeatherDays] = useState<DailyForecast[]>([]);

    // Tooltip
    const [tooltip, setTooltip] = useState<{ task: GanttTask; x: number; y: number } | null>(null);

    // Edit sidebar
    const [editTask, setEditTask] = useState<GanttTask | null>(null);
    const [editDeadline, setEditDeadline] = useState('');
    const [editHours, setEditHours] = useState('');
    const [editAssignees, setEditAssignees] = useState<number[]>([]);
    const [editDeps, setEditDeps] = useState<number[]>([]);
    const [editSaving, setEditSaving] = useState(false);
    const [editError, setEditError] = useState('');

    // Link dependency mode
    const [linkMode, setLinkMode] = useState(false);
    const [linkSource, setLinkSource] = useState<number | null>(null);

    // Drag state
    const [dragTaskId, setDragTaskId] = useState<number | null>(null);
    const [dragCurrentLeft, setDragCurrentLeft] = useState(0);

    // Refs
    const barsRef = useRef<HTMLDivElement>(null);

    // Load reference data
    useEffect(() => {
        if (!token) return;
        shipsApi.list(token).then(d => setShips(d.ships)).catch(() => { });
        authApi.listUsers(token).then(d => setUsers(d.users)).catch(() => { });
        weatherApi.forecast(token).then(d => setWeatherDays(d.daily)).catch(() => { });
    }, [token]);

    // Load Gantt data
    const loadGantt = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        setError('');
        try {
            const filters: Record<string, string> = {};
            if (shipFilter) filters.ship_id = shipFilter;
            if (assigneeFilter) filters.assignee_id = assigneeFilter;

            const data = await tasksApi.gantt(token, Object.keys(filters).length > 0 ? filters : undefined);
            setTasks(data.tasks);
            setTotalHours(data.total_duration_hours);
            setTotalWorkers(data.total_workers);
            setDailyCapacity(data.daily_capacity_hours);
            setBrokenEdges(data.broken_edges ?? []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Błąd ładowania danych');
        } finally {
            setLoading(false);
        }
    }, [token, shipFilter, assigneeFilter]);

    useEffect(() => { loadGantt(); }, [loadGantt]);

    // --- Calendar timeline ---
    const today = useMemo(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }, []);

    // Compute timeline range: from today, min 30 days or until all tasks fit
    const totalDays = useMemo(() => {
        const cpmDays = Math.ceil(totalHours / HOURS_PER_DAY);
        let maxDays = 0;
        for (const t of tasks) {
            // Check deadline
            if (t.deadline) {
                const diff = Math.ceil((new Date(t.deadline).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                if (diff > maxDays) maxDays = diff;
            }
            // Check planned_start + duration
            if (t.planned_start) {
                const diff = Math.ceil((new Date(t.planned_start).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                const end = diff + t.estimated_hours / HOURS_PER_DAY;
                if (end > maxDays) maxDays = end;
            }
        }
        return Math.max(30, cpmDays + 5, maxDays + 5);
    }, [totalHours, tasks, today]);

    const calendarDates = useMemo(() => getDateRange(today, totalDays), [today, totalDays]);
    const timelineWidth = totalDays * DAY_WIDTH;

    const criticalCount = useMemo(() => tasks.filter(t => t.is_critical).length, [tasks]);
    const doneCount = useMemo(() => tasks.filter(t => t.status === 'done').length, [tasks]);

    // Build task index map
    const taskIndexMap = useMemo(() => {
        const map = new Map<number, number>();
        tasks.forEach((t, i) => map.set(t.id, i));
        return map;
    }, [tasks]);

    // Compute bar positions — use planned_start if set, otherwise CPM early_start
    const barPositions = useMemo(() => {
        return tasks.map(task => {
            const durationDays = task.estimated_hours / HOURS_PER_DAY;

            // Always use server-computed early_start — it already accounts for:
            // planned_start, dependencies, AND worker capacity (no overlap)
            const startDay = task.early_start / HOURS_PER_DAY;

            const left = startDay * DAY_WIDTH;
            const width = Math.max(durationDays * DAY_WIDTH, 20);
            return { left, width, startDay };
        });
    }, [tasks, today]);

    // SVG arrows for dependencies
    const arrows = useMemo(() => {
        const result: { x1: number; y1: number; x2: number; y2: number; isCritical: boolean }[] = [];

        tasks.forEach((task, toIndex) => {
            for (const depId of task.dependencies) {
                const fromIndex = taskIndexMap.get(depId);
                if (fromIndex === undefined) continue;

                const fromBar = barPositions[fromIndex];
                const toBar = barPositions[toIndex];

                const x1 = fromBar.left + fromBar.width;
                const y1 = fromIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
                const x2 = toBar.left;
                const y2 = toIndex * ROW_HEIGHT + ROW_HEIGHT / 2;

                const isCritical = task.is_critical && tasks[fromIndex].is_critical;
                result.push({ x1, y1, x2, y2, isCritical });
            }
        });

        return result;
    }, [tasks, taskIndexMap, barPositions]);

    // Tooltip handlers
    const handleBarMouseEnter = (e: React.MouseEvent, task: GanttTask) => {
        if (linkMode) return;
        setTooltip({ task, x: e.clientX + 12, y: e.clientY - 10 });
    };

    const handleBarMouseMove = (e: React.MouseEvent) => {
        if (tooltip) {
            setTooltip(prev => prev ? { ...prev, x: e.clientX + 12, y: e.clientY - 10 } : null);
        }
    };

    const handleBarMouseLeave = () => {
        setTooltip(null);
    };

    // --- Drag to move ---
    const dragRef = useRef<{ taskId: number; startMouseX: number; origLeft: number; currentLeft: number } | null>(null);
    const didDragRef = useRef(false);

    const handleDragStart = (e: React.MouseEvent, task: GanttTask, origLeft: number) => {
        if (linkMode || editTask) return;
        e.preventDefault();
        e.stopPropagation();
        setTooltip(null);

        dragRef.current = { taskId: task.id, startMouseX: e.clientX, origLeft, currentLeft: origLeft };
        didDragRef.current = false;
        setDragTaskId(task.id);
        setDragCurrentLeft(origLeft);

        const onMove = (ev: MouseEvent) => {
            if (!dragRef.current) return;
            const deltaX = ev.clientX - dragRef.current.startMouseX;
            const newLeft = Math.max(0, dragRef.current.origLeft + deltaX);
            const snapped = Math.round(newLeft / DAY_WIDTH) * DAY_WIDTH;
            if (Math.abs(ev.clientX - dragRef.current.startMouseX) > 5) {
                didDragRef.current = true;
            }
            dragRef.current.currentLeft = snapped;
            setDragCurrentLeft(snapped);
        };

        const onUp = async () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            if (!dragRef.current) return;

            const finalLeft = dragRef.current.currentLeft;
            const dayOffset = Math.max(0, Math.round(finalLeft / DAY_WIDTH));
            const newDate = new Date(today);
            newDate.setDate(newDate.getDate() + dayOffset);
            const planned = formatDateISO(newDate);

            dragRef.current = null;
            setDragTaskId(null);

            if (token) {
                try {
                    await tasksApi.update(token, task.id, { planned_start: planned });
                    await loadGantt();
                } catch { /* ignore */ }
            }
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };

    // --- Edit sidebar ---
    const openEditPanel = (task: GanttTask) => {
        if (linkMode) return; // handled by link mode
        setEditTask(task);
        setEditDeadline(task.deadline || '');
        setEditHours(String(task.estimated_hours));
        setEditAssignees(task.assignees.map(a => a.id));
        setEditDeps([...task.dependencies]);
        setEditError('');
    };

    const closeEditPanel = () => {
        setEditTask(null);
        setEditError('');
    };

    const handleEditSave = async () => {
        if (!token || !editTask) return;
        setEditSaving(true);
        setEditError('');
        try {
            const data: Record<string, unknown> = {
                estimated_hours: parseFloat(editHours) || editTask.estimated_hours,
                assignee_ids: editAssignees,
                dependency_ids: editDeps,
            };
            if (editDeadline) data.deadline = editDeadline;
            else data.deadline = null;

            await tasksApi.update(token, editTask.id, data);
            closeEditPanel();
            await loadGantt();
        } catch {
            setEditError('Błąd zapisu');
        } finally {
            setEditSaving(false);
        }
    };

    // --- Link dependency mode ---
    const handleBarClick = (task: GanttTask) => {
        if (!linkMode) {
            openEditPanel(task);
            return;
        }

        if (linkSource === null) {
            // First click — select source
            setLinkSource(task.id);
        } else if (linkSource !== task.id) {
            // Second click — create dependency (target depends on source)
            createDependency(linkSource, task.id);
            setLinkSource(null);
        }
    };

    const createDependency = async (sourceId: number, targetId: number) => {
        if (!token) return;
        // target now depends on source
        const targetTask = tasks.find(t => t.id === targetId);
        if (!targetTask) return;

        const newDeps = [...targetTask.dependencies, sourceId];
        try {
            await tasksApi.update(token, targetId, { dependency_ids: newDeps });
            await loadGantt();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Błąd dodawania zależności';
            setError(msg);
            // Auto-clear error after 5s
            setTimeout(() => setError(''), 5000);
        }
    };

    const toggleLinkMode = () => {
        setLinkMode(prev => !prev);
        setLinkSource(null);
        setTooltip(null);
    };

    // Toggle assignee
    const toggleAssignee = (userId: number) => {
        setEditAssignees(prev =>
            prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
        );
    };

    // Toggle dependency
    const toggleDep = (depId: number) => {
        setEditDeps(prev =>
            prev.includes(depId) ? prev.filter(id => id !== depId) : [...prev, depId]
        );
    };

    // Split task
    const handleSplit = async (splitHours: number) => {
        if (!editTask || !token) return;
        try {
            setEditSaving(true);
            await tasksApi.split(token, editTask.id, splitHours);
            setEditTask(null);
            loadGantt();
        } catch (err) {
            setEditError(err instanceof Error ? err.message : 'Błąd przy dzieleniu');
        } finally {
            setEditSaving(false);
        }
    };

    // Merge tasks
    const handleMerge = async () => {
        if (!editTask?.split_group_id || !token) return;
        try {
            setEditSaving(true);
            await tasksApi.merge(token, editTask.split_group_id);
            setEditTask(null);
            loadGantt();
        } catch (err) {
            setEditError(err instanceof Error ? err.message : 'Błąd przy łączeniu');
        } finally {
            setEditSaving(false);
        }
    };

    // Check if task overlaps bad weather using the task's own weather thresholds
    const getWeatherConflicts = (task: GanttTask) => {
        if (!task.weather_dependent) return [];
        const idx = taskIndexMap.get(task.id);
        if (idx === undefined) return [];
        const pos = barPositions[idx];
        const conflicts: { date: string; label: string }[] = [];
        for (let i = 0; i < calendarDates.length; i++) {
            const dayLeft = i * DAY_WIDTH;
            const dayRight = dayLeft + DAY_WIDTH;
            // Check if bar overlaps this day
            if (pos.left < dayRight && pos.left + pos.width > dayLeft) {
                const dateStr = formatDateISO(calendarDates[i]);
                const wx = weatherDays.find(w => w.date === dateStr);
                if (!wx) continue;

                // Check per-task weather thresholds
                const reasons: string[] = [];
                if (task.weather_no_rain && wx.precipitation_sum > 1) {
                    reasons.push(`deszcz ${wx.precipitation_sum}mm`);
                }
                if (task.weather_max_wind != null && wx.wind_speed_max > task.weather_max_wind) {
                    reasons.push(`wiatr ${wx.wind_speed_max} km/h (max ${task.weather_max_wind})`);
                }
                if (task.weather_min_temp != null && wx.temp_min < task.weather_min_temp) {
                    reasons.push(`temp ${wx.temp_min}°C (min ${task.weather_min_temp}°C)`);
                }

                if (reasons.length > 0) {
                    conflicts.push({ date: dateStr, label: reasons.join(', ') });
                }
            }
        }
        return conflicts;
    };

    if (!user || user.role !== 'admin') {
        return null;
    }

    return (
        <div className="gantt-page">
            {/* Header */}
            <div className="gantt-header">
                <div className="gantt-header-left">
                    <button className="gantt-back-btn" onClick={() => navigate('/dashboard')}>
                        ← Dashboard
                    </button>
                    <h1>📊 Widok Gantt</h1>
                </div>

                <div className="gantt-filters">
                    <button
                        className={`gantt-link-btn ${linkMode ? 'active' : ''}`}
                        onClick={toggleLinkMode}
                        title="Tryb łączenia zależności"
                        type="button"
                    >
                        🔗 {linkMode ? (linkSource ? 'Kliknij cel →' : 'Kliknij źródło →') : 'Dodaj zależność'}
                    </button>

                    <select
                        className="gantt-filter-select"
                        value={shipFilter}
                        onChange={e => setShipFilter(e.target.value)}
                    >
                        <option value="">Wszystkie statki</option>
                        {ships.map(s => (
                            <option key={s.id} value={String(s.id)}>{s.name}</option>
                        ))}
                    </select>

                    <select
                        className="gantt-filter-select"
                        value={assigneeFilter}
                        onChange={e => setAssigneeFilter(e.target.value)}
                    >
                        <option value="">Wszyscy pracownicy</option>
                        {users.filter(u => u.is_active).map(u => (
                            <option key={u.id} value={String(u.id)}>{u.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Legend */}
            <div className="gantt-legend">
                <div className="gantt-legend-item">
                    <div className="gantt-legend-swatch critical-path" />
                    <span>Ścieżka krytyczna</span>
                </div>
                <div className="gantt-legend-item">
                    <div className="gantt-legend-swatch todo" />
                    <span>Do zrobienia</span>
                </div>
                <div className="gantt-legend-item">
                    <div className="gantt-legend-swatch in-progress" />
                    <span>W trakcie</span>
                </div>
                <div className="gantt-legend-item">
                    <div className="gantt-legend-swatch done" />
                    <span>Ukończone</span>
                </div>
                <div className="gantt-legend-item">
                    <div className="gantt-legend-swatch blocked" />
                    <span>Zablokowane</span>
                </div>
                <div className="gantt-legend-sep" />
                <div className="gantt-legend-item">
                    <div className="gantt-legend-swatch ship-zefir" />
                    <span>Zefir</span>
                </div>
                <div className="gantt-legend-item">
                    <div className="gantt-legend-swatch ship-kutrzeba" />
                    <span>Kutrzeba</span>
                </div>
                <div className="gantt-legend-item">
                    <div className="gantt-legend-swatch ship-none" />
                    <span>Bez statku</span>
                </div>
                {linkMode && (
                    <div className="gantt-legend-item" style={{ color: 'var(--accent-amber)', fontWeight: 700 }}>
                        🔗 TRYB ŁĄCZENIA {linkSource ? `(źródło: #${linkSource})` : '— kliknij źródło'}
                    </div>
                )}
            </div>

            {/* Stats */}
            {!loading && tasks.length > 0 && (
                <div className="gantt-stats">
                    <div className="gantt-stat">
                        <span className="gantt-stat-value">{tasks.length}</span>
                        <span className="gantt-stat-label">Zadań</span>
                    </div>
                    <div className="gantt-stat">
                        <span className="gantt-stat-value">{Math.ceil(totalHours / HOURS_PER_DAY)}</span>
                        <span className="gantt-stat-label">Dni roboczych</span>
                    </div>
                    <div className="gantt-stat">
                        <span className="gantt-stat-value">{Math.round(totalHours)}h</span>
                        <span className="gantt-stat-label">Łącznie godzin</span>
                    </div>
                    <div className="gantt-stat">
                        <span className="gantt-stat-value">{totalWorkers}</span>
                        <span className="gantt-stat-label">👷 Załoga</span>
                    </div>
                    <div className="gantt-stat">
                        <span className="gantt-stat-value">{dailyCapacity}h/dzień</span>
                        <span className="gantt-stat-label">Pojemność</span>
                    </div>
                    <div className="gantt-stat">
                        <span className="gantt-stat-value" style={{ color: criticalCount > 0 ? '#ef4444' : undefined }}>
                            {criticalCount}
                        </span>
                        <span className="gantt-stat-label">Na ścieżce krytycznej</span>
                    </div>
                    <div className="gantt-stat">
                        <span className="gantt-stat-value">{doneCount}/{tasks.length}</span>
                        <span className="gantt-stat-label">Ukończone</span>
                    </div>
                </div>
            )}

            {/* Broken edges warning */}
            {!loading && brokenEdges.length > 0 && (
                <div className="gantt-cycle-warning" style={{
                    background: 'rgba(245, 158, 11, 0.15)',
                    border: '1px solid rgba(245, 158, 11, 0.4)',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    margin: '0 16px 8px',
                    color: '#f59e0b',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                }}>
                    <span style={{ fontSize: '18px' }}>⚠️</span>
                    <span>
                        <strong>Wykryto cykliczne zależności!</strong>{' '}
                        Automatycznie usunięto {brokenEdges.length} zależności, żeby wyświetlić harmonogram.
                        Edytuj zadania, aby naprawić zależności.
                    </span>
                </div>
            )}

            {/* Chart */}
            {loading ? (
                <div className="gantt-loading">
                    <div className="spinner" />
                    <span style={{ color: 'var(--text-secondary)' }}>Obliczanie harmonogramu…</span>
                </div>
            ) : error ? (
                <div className="gantt-empty">
                    <div className="gantt-empty-icon">⚠️</div>
                    <div className="gantt-empty-text">{error}</div>
                    {error.includes('cykl') && (
                        <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '8px' }}>
                            Edytuj zależności zadań, aby usunąć cykl.
                        </div>
                    )}
                </div>
            ) : tasks.length === 0 ? (
                <div className="gantt-empty">
                    <div className="gantt-empty-icon">📋</div>
                    <div className="gantt-empty-text">Brak zadań do wyświetlenia</div>
                </div>
            ) : (
                <div className="gantt-chart-wrapper">
                    <div className="gantt-chart" style={{ gridTemplateColumns: `280px ${timelineWidth}px` }}>
                        {/* Task list — left side */}
                        <div className="gantt-task-list">
                            <div className="gantt-task-list-header">Zadanie</div>
                            {tasks.map(task => (
                                <div
                                    key={task.id}
                                    className={`gantt-task-row ${task.is_critical ? 'is-critical' : ''} ${editTask?.id === task.id ? 'is-editing' : ''} ${linkMode && linkSource === task.id ? 'is-link-source' : ''}`}
                                    onClick={() => handleBarClick(task)}
                                >
                                    <span className="gantt-task-emoji">
                                        {CATEGORY_EMOJI[task.category] || '📋'}
                                    </span>
                                    <span className="gantt-task-title" title={task.title}>
                                        {task.title}
                                    </span>
                                    {task.ship_name && (
                                        <span className="gantt-task-ship">{task.ship_name.split(' ').pop()}</span>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Timeline — right side */}
                        <div className="gantt-timeline">
                            {/* Calendar day headers */}
                            <div className="gantt-timeline-header" style={{ width: timelineWidth }}>
                                {calendarDates.map((date, i) => {
                                    const dateStr = formatDateISO(date);
                                    const isToday = dateStr === formatDateISO(today);
                                    const wx = weatherDays.find(w => w.date === dateStr);
                                    const isBadWeather = wx && (wx.precipitation_sum > 1 || wx.wind_speed_max > 25);
                                    return (
                                        <div
                                            key={i}
                                            className={`gantt-day-header ${isToday ? 'is-today' : ''} ${isBadWeather ? 'is-bad-weather' : ''}`}
                                            style={{ width: DAY_WIDTH }}
                                            title={wx ? `${wx.weather_label}\n${wx.temp_min}°–${wx.temp_max}°C\nWiatr: ${wx.wind_speed_max} km/h\nOpad: ${wx.precipitation_sum} mm` : undefined}
                                        >
                                            <span>{formatDateShort(date)}</span>
                                            {wx && <span className="gantt-weather-icon">{wx.weather_icon}</span>}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Bars + arrows */}
                            <div className="gantt-bars" ref={barsRef} style={{ width: timelineWidth, height: tasks.length * ROW_HEIGHT }}>
                                {/* Bad weather columns */}
                                {calendarDates.map((date, i) => {
                                    const dateStr = formatDateISO(date);
                                    const wx = weatherDays.find(w => w.date === dateStr);
                                    const isBad = wx && (wx.precipitation_sum > 1 || wx.wind_speed_max > 25);
                                    return isBad ? (
                                        <div
                                            key={`wx-${i}`}
                                            className="gantt-bad-weather-col"
                                            style={{ left: i * DAY_WIDTH, width: DAY_WIDTH, height: tasks.length * ROW_HEIGHT }}
                                            title={`⚠️ ${wx.weather_label}`}
                                        />
                                    ) : null;
                                })}

                                {/* Today marker */}
                                <div
                                    className="gantt-today-marker"
                                    style={{ left: 0, height: tasks.length * ROW_HEIGHT }}
                                />

                                {/* SVG arrows */}
                                <svg
                                    className="gantt-arrows-svg"
                                    width={timelineWidth}
                                    height={tasks.length * ROW_HEIGHT}
                                >
                                    <defs>
                                        <marker
                                            id="arrowhead"
                                            markerWidth="8"
                                            markerHeight="6"
                                            refX="8"
                                            refY="3"
                                            orient="auto"
                                        >
                                            <path d="M0,0 L8,3 L0,6 Z" fill="var(--text-muted)" opacity="0.4" />
                                        </marker>
                                        <marker
                                            id="arrowhead-critical"
                                            className="marker-critical"
                                            markerWidth="8"
                                            markerHeight="6"
                                            refX="8"
                                            refY="3"
                                            orient="auto"
                                        >
                                            <path d="M0,0 L8,3 L0,6 Z" fill="var(--accent-red)" opacity="0.7" />
                                        </marker>
                                    </defs>
                                    {arrows.map((arrow, i) => (
                                        <line
                                            key={i}
                                            x1={arrow.x1}
                                            y1={arrow.y1}
                                            x2={arrow.x2}
                                            y2={arrow.y2}
                                            className={arrow.isCritical ? 'arrow-critical' : ''}
                                            markerEnd={arrow.isCritical ? 'url(#arrowhead-critical)' : 'url(#arrowhead)'}
                                        />
                                    ))}
                                </svg>

                                {/* Bars */}
                                {tasks.map((task, index) => {
                                    const pos = barPositions[index];
                                    const isDragging = dragTaskId === task.id;
                                    const barLeft = isDragging ? dragCurrentLeft : pos.left;
                                    return (
                                        <div key={task.id} className="gantt-bar-row">
                                            <div
                                                className={`gantt-bar ship-${task.ship_id || 'none'} status-${task.status} ${task.is_critical ? 'is-critical' : ''} ${linkMode ? 'link-mode' : ''} ${linkSource === task.id ? 'is-link-source' : ''} ${isDragging ? 'is-dragging' : ''}`}
                                                style={{
                                                    left: barLeft,
                                                    width: pos.width,
                                                    cursor: linkMode ? 'crosshair' : 'grab',
                                                    opacity: isDragging ? 0.85 : undefined,
                                                    zIndex: isDragging ? 10 : undefined,
                                                }}
                                                onClick={() => {
                                                    if (didDragRef.current) return;
                                                    handleBarClick(task);
                                                }}
                                                onMouseDown={e => handleDragStart(e, task, pos.left)}
                                                onMouseEnter={e => handleBarMouseEnter(e, task)}
                                                onMouseMove={handleBarMouseMove}
                                                onMouseLeave={handleBarMouseLeave}
                                            >
                                                {pos.width > 50 ? `${task.estimated_hours}h` : ''}
                                            </div>

                                            {/* Deadline marker */}
                                            {task.deadline && (() => {
                                                const dl = new Date(task.deadline);
                                                const dayDiff = Math.round((dl.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                                                if (dayDiff >= 0 && dayDiff < totalDays) {
                                                    return (
                                                        <div
                                                            className="gantt-deadline-marker"
                                                            style={{ left: dayDiff * DAY_WIDTH + DAY_WIDTH / 2 }}
                                                            title={`Deadline: ${task.deadline}`}
                                                        >
                                                            🔻
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            })()}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Tooltip */}
            {tooltip && !editTask && (
                <div
                    className="gantt-tooltip"
                    style={{ left: tooltip.x, top: tooltip.y }}
                >
                    <div className="gantt-tooltip-title">
                        {CATEGORY_EMOJI[tooltip.task.category] || '📋'} {tooltip.task.title}
                    </div>
                    <div className="gantt-tooltip-row">
                        Status: <strong>{STATUS_LABELS[tooltip.task.status] || tooltip.task.status}</strong>
                    </div>
                    <div className="gantt-tooltip-row">
                        Priorytet: <strong>{PRIORITY_LABELS[tooltip.task.priority] || tooltip.task.priority}</strong>
                    </div>
                    <div className="gantt-tooltip-row">
                        Szacunek: <strong>{tooltip.task.estimated_hours}h</strong>
                        {tooltip.task.actual_hours > 0 && ` (wykonano: ${tooltip.task.actual_hours}h)`}
                    </div>
                    {tooltip.task.deadline && (
                        <div className="gantt-tooltip-row">
                            Deadline: <strong>{tooltip.task.deadline}</strong>
                        </div>
                    )}
                    {tooltip.task.assignees.length > 0 && (
                        <div className="gantt-tooltip-row">
                            Przypisane: <strong>{tooltip.task.assignees.map(a => a.name).join(', ')}</strong>
                        </div>
                    )}
                    {tooltip.task.ship_name && (
                        <div className="gantt-tooltip-row">
                            Statek: <strong>{tooltip.task.ship_name}</strong>
                        </div>
                    )}
                    {tooltip.task.is_critical && (
                        <div className="gantt-tooltip-row" style={{ color: 'var(--accent-red)' }}>
                            🔴 Ścieżka krytyczna — slack: {tooltip.task.slack}h
                        </div>
                    )}
                    {!tooltip.task.is_critical && tooltip.task.slack > 0 && (
                        <div className="gantt-tooltip-row">
                            Zapas: <strong>{tooltip.task.slack}h</strong>
                        </div>
                    )}
                    {tooltip.task.dependencies.length > 0 && (
                        <div className="gantt-tooltip-row">
                            Zależy od: <strong>{tooltip.task.dependencies.length} zadań</strong>
                        </div>
                    )}
                    <div className="gantt-tooltip-hint">Kliknij aby edytować</div>
                </div>
            )}

            {/* Edit Sidebar */}
            {editTask && (
                <div className="gantt-sidebar-overlay" onClick={closeEditPanel}>
                    <div className="gantt-sidebar" onClick={e => e.stopPropagation()}>
                        <div className="gantt-sidebar-header">
                            <h3>{CATEGORY_EMOJI[editTask.category] || '📋'} {editTask.title}</h3>
                            <button className="gantt-sidebar-close" onClick={closeEditPanel} type="button">✕</button>
                        </div>

                        <div className="gantt-sidebar-body">
                            {/* Deadline */}
                            <div className="gantt-sidebar-field">
                                <label>📅 Deadline</label>
                                <input
                                    type="date"
                                    value={editDeadline}
                                    onChange={e => setEditDeadline(e.target.value)}
                                    className="gantt-sidebar-input"
                                />
                                {editDeadline && (
                                    <button className="gantt-sidebar-clear" onClick={() => setEditDeadline('')} type="button">
                                        ✕ Usuń deadline
                                    </button>
                                )}
                            </div>

                            {/* Estimated hours */}
                            <div className="gantt-sidebar-field">
                                <label>⏱️ Szacowane godziny</label>
                                <input
                                    type="number"
                                    min="0.5"
                                    step="0.5"
                                    value={editHours}
                                    onChange={e => setEditHours(e.target.value)}
                                    className="gantt-sidebar-input"
                                />
                            </div>

                            {/* Assignees */}
                            <div className="gantt-sidebar-field">
                                <label>👥 Przypisani pracownicy</label>
                                <div className="gantt-sidebar-checkboxes">
                                    {users.filter(u => u.is_active).map(u => (
                                        <label key={u.id} className="gantt-sidebar-checkbox">
                                            <input
                                                type="checkbox"
                                                checked={editAssignees.includes(u.id)}
                                                onChange={() => toggleAssignee(u.id)}
                                            />
                                            <span>{u.name}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Dependencies */}
                            <div className="gantt-sidebar-field">
                                <label>🔗 Zależy od (musi być zrobione wcześniej)</label>
                                <div className="gantt-sidebar-deps">
                                    {tasks.filter(t => t.id !== editTask.id).map(t => (
                                        <label key={t.id} className={`gantt-sidebar-dep ${editDeps.includes(t.id) ? 'active' : ''}`}>
                                            <input
                                                type="checkbox"
                                                checked={editDeps.includes(t.id)}
                                                onChange={() => toggleDep(t.id)}
                                            />
                                            <span>{CATEGORY_EMOJI[t.category] || '📋'} {t.title}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Info */}
                            <div className="gantt-sidebar-info">
                                <div>Status: <strong>{STATUS_LABELS[editTask.status]}</strong></div>
                                <div>Priorytet: <strong>{PRIORITY_LABELS[editTask.priority]}</strong></div>
                                {editTask.ship_name && <div>Statek: <strong>{editTask.ship_name}</strong></div>}
                                {editTask.actual_hours > 0 && <div>Wykonano: <strong>{editTask.actual_hours}h</strong></div>}
                            {editTask.is_critical && <div style={{ color: 'var(--accent-red)' }}>🔴 Ścieżka krytyczna</div>}
                            </div>

                            {/* Weather warning + Split */}
                            {(() => {
                                const conflicts = getWeatherConflicts(editTask);
                                const canSplit = (editTask.estimated_hours ?? 0) > 8;
                                return (
                                    <>
                                        {conflicts.length > 0 && (
                                            <div className="gantt-sidebar-warning">
                                                <div className="gantt-sidebar-warning-title">⚠️ Złe warunki pogodowe</div>
                                                {conflicts.map(c => (
                                                    <div key={c.date} className="gantt-sidebar-warning-item">
                                                        📅 {c.date} — {c.label}
                                                    </div>
                                                ))}
                                                {canSplit && (
                                                    <button
                                                        className="btn btn-warning gantt-sidebar-split-btn"
                                                        onClick={() => {
                                                            // Split at the point before first bad weather day
                                                            const idx = taskIndexMap.get(editTask.id);
                                                            const pos = idx !== undefined ? barPositions[idx] : undefined;
                                                            if (!pos) return;
                                                            const firstBadIdx = calendarDates.findIndex(d => {
                                                                const dStr = formatDateISO(d);
                                                                return conflicts.some(c => c.date === dStr);
                                                            });
                                                            if (firstBadIdx < 0) return;
                                                            const badDayLeft = firstBadIdx * DAY_WIDTH;
                                                            const hoursBeforeBad = Math.max(HOURS_PER_DAY, Math.round((badDayLeft - pos.left) / DAY_WIDTH * HOURS_PER_DAY));
                                                            handleSplit(Math.min(hoursBeforeBad, editTask.estimated_hours - HOURS_PER_DAY));
                                                        }}
                                                        disabled={editSaving}
                                                        type="button"
                                                    >
                                                        ✂️ Rozdziel wokół pogody
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        {canSplit && conflicts.length === 0 && (
                                            <div className="gantt-sidebar-field">
                                                <label>✂️ Rozdziel zadanie</label>
                                                <div className="gantt-sidebar-split-row">
                                                    <button
                                                        className="btn btn-ghost"
                                                        onClick={() => handleSplit(Math.floor(editTask.estimated_hours / 2))}
                                                        disabled={editSaving}
                                                        type="button"
                                                    >
                                                        Na pół ({Math.floor(editTask.estimated_hours / 2)}h + {editTask.estimated_hours - Math.floor(editTask.estimated_hours / 2)}h)
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {editTask.split_group_id && (
                                            <div className="gantt-sidebar-field">
                                                <button
                                                    className="btn btn-ghost gantt-sidebar-merge-btn"
                                                    onClick={handleMerge}
                                                    disabled={editSaving}
                                                    type="button"
                                                >
                                                    🔗 Połącz z powrotem w jedno zadanie
                                                </button>
                                            </div>
                                        )}
                                    </>
                                );
                            })()}

                            {editError && <div className="gantt-sidebar-error">{editError}</div>}
                        </div>

                        <div className="gantt-sidebar-footer">
                            <button className="btn btn-ghost" onClick={closeEditPanel} type="button">Anuluj</button>
                            <button
                                className="btn btn-primary"
                                onClick={handleEditSave}
                                disabled={editSaving}
                                type="button"
                            >
                                {editSaving ? 'Zapisuję…' : '💾 Zapisz zmiany'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
