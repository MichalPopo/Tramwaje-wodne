import { queryAll, queryOne, execute } from '../db/database.js';
import type { Database } from 'sql.js';
import type {
    CreateTaskInput,
    UpdateTaskInput,
    ChangeStatusInput,
    LogTimeInput,
    TaskQueryInput,
} from './validation.js';
import { wouldCreateCycle } from './scheduling.service.js';

// --- Types ---

interface TaskRow {
    id: number;
    title: string;
    description: string | null;
    ship_id: number | null;
    ship_scope: string | null;
    category: string;
    status: string;
    blocked_reason: string | null;
    priority: string;
    estimated_hours: number | null;
    actual_hours: number;
    estimated_cost: number | null;
    actual_cost: number;
    deadline: string | null;
    planned_start: string | null;
    split_group_id: number | null;
    weather_dependent: number;
    weather_min_temp: number | null;
    weather_max_humidity: number | null;
    weather_max_wind: number | null;
    weather_no_rain: number;
    logistics_notes: string | null;
    created_by: number | null;
    is_report: number;
    report_approved: number | null;
    created_at: string;
    updated_at: string;
}

export interface TaskDetail extends Omit<TaskRow, 'weather_dependent' | 'weather_no_rain' | 'is_report' | 'report_approved'> {
    weather_dependent: boolean;
    weather_no_rain: boolean;
    is_report: boolean;
    report_approved: boolean | null;
    assignees: { id: number; name: string; email: string }[];
    dependencies: { id: number; title: string; status: string }[];
    time_logs: { id: number; hours: number; note: string | null; logged_at: string; user_name: string }[];
    ship_name?: string;
}

/** Convert SQLite INTEGER booleans to JS booleans */
function toTaskDetail(row: TaskRow, db?: Database): TaskDetail {
    const assignees = queryAll<{ id: number; name: string; email: string }>(
        `SELECT u.id, u.name, u.email
         FROM task_assignments ta
         JOIN users u ON u.id = ta.user_id
         WHERE ta.task_id = ?`,
        [row.id],
        db,
    );

    const dependencies = queryAll<{ id: number; title: string; status: string }>(
        `SELECT t.id, t.title, t.status
         FROM task_dependencies td
         JOIN tasks t ON t.id = td.depends_on_id
         WHERE td.task_id = ?`,
        [row.id],
        db,
    );

    const time_logs = queryAll<{ id: number; hours: number; note: string | null; logged_at: string; user_name: string }>(
        `SELECT tl.id, tl.hours, tl.note, tl.logged_at, u.name as user_name
         FROM time_logs tl
         JOIN users u ON u.id = tl.user_id
         WHERE tl.task_id = ?
         ORDER BY tl.logged_at DESC`,
        [row.id],
        db,
    );

    const ship = row.ship_id
        ? queryOne<{ name: string }>('SELECT name FROM ships WHERE id = ?', [row.ship_id], db)
        : null;

    return {
        ...row,
        weather_dependent: Boolean(row.weather_dependent),
        weather_no_rain: Boolean(row.weather_no_rain),
        is_report: Boolean(row.is_report),
        report_approved: row.report_approved === null ? null : Boolean(row.report_approved),
        assignees,
        dependencies,
        time_logs,
        ship_name: ship?.name,
    };
}

/** Lightweight version without relations — for list views */
function toTaskSummary(row: TaskRow) {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        ship_id: row.ship_id,
        category: row.category,
        status: row.status,
        priority: row.priority,
        estimated_hours: row.estimated_hours,
        actual_hours: row.actual_hours,
        deadline: row.deadline,
        weather_dependent: Boolean(row.weather_dependent),
        is_report: Boolean(row.is_report),
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

// --- Service functions ---

export function listTasks(filters: TaskQueryInput, db?: Database) {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.status) {
        conditions.push('t.status = ?');
        params.push(filters.status);
    }
    if (filters.ship_id) {
        conditions.push('t.ship_id = ?');
        params.push(filters.ship_id);
    }
    if (filters.priority) {
        conditions.push('t.priority = ?');
        params.push(filters.priority);
    }
    if (filters.category) {
        conditions.push('t.category = ?');
        params.push(filters.category);
    }
    if (filters.assignee_id) {
        conditions.push('t.id IN (SELECT task_id FROM task_assignments WHERE user_id = ?)');
        params.push(filters.assignee_id);
    }
    if (filters.is_report !== undefined) {
        conditions.push('t.is_report = ?');
        params.push(filters.is_report);
    }
    if (filters.search) {
        conditions.push("(t.title LIKE ? ESCAPE '\\' OR t.description LIKE ? ESCAPE '\\')");
        // Escape SQL LIKE wildcards in user input
        const escaped = filters.search.replace(/[%_]/g, '\\$&');
        const searchPattern = `%${escaped}%`;
        params.push(searchPattern, searchPattern);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `
        SELECT t.*, s.name as ship_name
        FROM tasks t
        LEFT JOIN ships s ON s.id = t.ship_id
        ${where}
        ORDER BY
            CASE t.priority
                WHEN 'critical' THEN 0
                WHEN 'high' THEN 1
                WHEN 'normal' THEN 2
                WHEN 'low' THEN 3
            END,
            t.created_at DESC
    `;

    const rows = queryAll<TaskRow & { ship_name: string | null }>(sql, params, db);
    return rows.map(row => ({
        ...toTaskSummary(row),
        ship_name: row.ship_name,
    }));
}

export function getTaskById(id: number, db?: Database): TaskDetail | undefined {
    const row = queryOne<TaskRow>('SELECT * FROM tasks WHERE id = ?', [id], db);
    if (!row) return undefined;
    return toTaskDetail(row, db);
}

export function createTask(
    input: CreateTaskInput,
    createdBy: number,
    db?: Database,
): TaskDetail {
    const result = execute(
        `INSERT INTO tasks (
            title, description, ship_id, ship_scope, category, priority,
            estimated_hours, estimated_cost, deadline,
            weather_dependent, weather_min_temp, weather_max_humidity,
            weather_max_wind, weather_no_rain, logistics_notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            input.title,
            input.description ?? null,
            input.ship_id ?? null,
            input.ship_scope ?? null,
            input.category,
            input.priority ?? 'normal',
            input.estimated_hours ?? null,
            input.estimated_cost ?? null,
            input.deadline ?? null,
            input.weather_dependent ? 1 : 0,
            input.weather_min_temp ?? null,
            input.weather_max_humidity ?? null,
            input.weather_max_wind ?? null,
            input.weather_no_rain ? 1 : 0,
            input.logistics_notes ?? null,
            createdBy,
        ],
        db,
    );

    const taskId = result.lastInsertRowid;

    // Assignees
    if (input.assignee_ids?.length) {
        for (const userId of input.assignee_ids) {
            try {
                execute(
                    'INSERT INTO task_assignments (task_id, user_id) VALUES (?, ?)',
                    [taskId, userId],
                    db,
                );
            } catch {
                throw new Error(`INVALID_ASSIGNEE:${userId}`);
            }
        }
    }

    // Dependencies
    if (input.dependency_ids?.length) {
        // Cycle check: get all existing deps and task IDs
        const allDeps = queryAll<{ task_id: number; depends_on_id: number }>(
            'SELECT task_id, depends_on_id FROM task_dependencies', [], db,
        );
        const allTaskIds = queryAll<{ id: number }>('SELECT id FROM tasks', [], db).map(r => r.id);

        for (const depId of input.dependency_ids) {
            // depId → taskId means taskId depends on depId
            if (wouldCreateCycle(depId, taskId, allDeps, allTaskIds)) {
                throw new Error(`CYCLE_WOULD_BE_CREATED:${depId}:${taskId}`);
            }
            try {
                execute(
                    'INSERT INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)',
                    [taskId, depId],
                    db,
                );
                // Add to allDeps so subsequent checks within this loop are accurate
                allDeps.push({ task_id: taskId, depends_on_id: depId });
            } catch {
                throw new Error(`INVALID_DEPENDENCY:${depId}`);
            }
        }
    }

    return getTaskById(taskId, db)!;
}

export function updateTask(
    id: number,
    input: UpdateTaskInput,
    db?: Database,
): TaskDetail | undefined {
    const existing = queryOne<TaskRow>('SELECT id FROM tasks WHERE id = ?', [id], db);
    if (!existing) return undefined;

    const fields: string[] = [];
    const params: unknown[] = [];

    const fieldMap: Record<string, unknown> = {
        title: input.title,
        description: input.description,
        ship_id: input.ship_id,
        ship_scope: input.ship_scope,
        category: input.category,
        status: input.status,
        blocked_reason: input.blocked_reason,
        priority: input.priority,
        estimated_hours: input.estimated_hours,
        estimated_cost: input.estimated_cost,
        deadline: input.deadline,
        planned_start: input.planned_start,
        logistics_notes: input.logistics_notes,
    };

    // Boolean→INTEGER fields
    if (input.weather_dependent !== undefined) {
        fieldMap.weather_dependent = input.weather_dependent ? 1 : 0;
    }
    if (input.weather_no_rain !== undefined) {
        fieldMap.weather_no_rain = input.weather_no_rain ? 1 : 0;
    }
    if (input.weather_min_temp !== undefined) fieldMap.weather_min_temp = input.weather_min_temp;
    if (input.weather_max_humidity !== undefined) fieldMap.weather_max_humidity = input.weather_max_humidity;
    if (input.weather_max_wind !== undefined) fieldMap.weather_max_wind = input.weather_max_wind;

    for (const [key, value] of Object.entries(fieldMap)) {
        if (value !== undefined) {
            fields.push(`${key} = ?`);
            params.push(value ?? null);
        }
    }

    if (fields.length > 0) {
        params.push(id);
        execute(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`, params, db);
    }

    // Update assignees if provided
    if (input.assignee_ids !== undefined) {
        execute('DELETE FROM task_assignments WHERE task_id = ?', [id], db);
        for (const userId of input.assignee_ids ?? []) {
            execute(
                'INSERT INTO task_assignments (task_id, user_id) VALUES (?, ?)',
                [id, userId],
                db,
            );
        }
    }

    // Update dependencies if provided
    if (input.dependency_ids !== undefined) {
        // Cycle check before replacing dependencies
        const newDeps = input.dependency_ids ?? [];
        if (newDeps.length > 0) {
            // Get all existing deps EXCEPT this task's current ones (since we're replacing them)
            const allDeps = queryAll<{ task_id: number; depends_on_id: number }>(
                'SELECT task_id, depends_on_id FROM task_dependencies WHERE task_id != ?', [id], db,
            );
            const allTaskIds = queryAll<{ id: number }>('SELECT id FROM tasks', [], db).map(r => r.id);

            for (const depId of newDeps) {
                if (wouldCreateCycle(depId, id, allDeps, allTaskIds)) {
                    throw new Error(`CYCLE_WOULD_BE_CREATED:${depId}:${id}`);
                }
                // Add to allDeps so subsequent checks within this loop are accurate
                allDeps.push({ task_id: id, depends_on_id: depId });
            }
        }

        execute('DELETE FROM task_dependencies WHERE task_id = ?', [id], db);
        for (const depId of newDeps) {
            execute(
                'INSERT INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)',
                [id, depId],
                db,
            );
        }
    }

    return getTaskById(id, db);
}

export function deleteTask(id: number, db?: Database): boolean {
    const existing = queryOne<TaskRow>('SELECT id FROM tasks WHERE id = ?', [id], db);
    if (!existing) return false;
    execute('DELETE FROM tasks WHERE id = ?', [id], db);
    return true;
}

export function changeTaskStatus(
    id: number,
    input: ChangeStatusInput,
    userId: number,
    userRole: string,
    db?: Database,
): TaskDetail | undefined {
    const task = queryOne<TaskRow>('SELECT * FROM tasks WHERE id = ?', [id], db);
    if (!task) return undefined;

    // Workers can only change status of tasks assigned to them
    if (userRole === 'worker') {
        const assignment = queryOne<{ id: number }>(
            'SELECT id FROM task_assignments WHERE task_id = ? AND user_id = ?',
            [id, userId],
            db,
        );
        if (!assignment) {
            throw new Error('FORBIDDEN');
        }
    }

    const params: unknown[] = [input.status];
    let sql = 'UPDATE tasks SET status = ?';

    if (input.status === 'blocked' && input.blocked_reason) {
        sql += ', blocked_reason = ?';
        params.push(input.blocked_reason);
    } else {
        // Clear blocked_reason when not blocked, or when blocked without new reason
        sql += ', blocked_reason = NULL';
    }

    sql += ' WHERE id = ?';
    params.push(id);

    execute(sql, params, db);

    return getTaskById(id, db);
}

export function logTime(
    taskId: number,
    userId: number,
    userRole: string,
    input: LogTimeInput,
    db?: Database,
): { id: number; hours: number; note: string | null; logged_at: string } {
    const task = queryOne<{ id: number }>('SELECT id FROM tasks WHERE id = ?', [taskId], db);
    if (!task) {
        throw new Error('TASK_NOT_FOUND');
    }

    // Workers can only log time on tasks assigned to them
    if (userRole === 'worker') {
        const assignment = queryOne<{ id: number }>(
            'SELECT id FROM task_assignments WHERE task_id = ? AND user_id = ?',
            [taskId, userId],
            db,
        );
        if (!assignment) {
            throw new Error('FORBIDDEN');
        }
    }

    const result = execute(
        'INSERT INTO time_logs (task_id, user_id, hours, note) VALUES (?, ?, ?, ?)',
        [taskId, userId, input.hours, input.note ?? null],
        db,
    );

    // Update actual_hours on the task
    execute(
        'UPDATE tasks SET actual_hours = (SELECT COALESCE(SUM(hours), 0) FROM time_logs WHERE task_id = ?) WHERE id = ?',
        [taskId, taskId],
        db,
    );

    const log = queryOne<{ id: number; hours: number; note: string | null; logged_at: string }>(
        'SELECT id, hours, note, logged_at FROM time_logs WHERE id = ?',
        [result.lastInsertRowid],
        db,
    );

    return log!;
}

export function getMyTasks(userId: number, db?: Database) {
    const rows = queryAll<TaskRow & { ship_name: string | null }>(
        `SELECT t.*, s.name as ship_name
         FROM tasks t
         JOIN task_assignments ta ON ta.task_id = t.id
         LEFT JOIN ships s ON s.id = t.ship_id
         WHERE ta.user_id = ?
         ORDER BY
            CASE t.priority
                WHEN 'critical' THEN 0
                WHEN 'high' THEN 1
                WHEN 'normal' THEN 2
                WHEN 'low' THEN 3
            END,
            t.created_at DESC`,
        [userId],
        db,
    );

    return rows.map(row => ({
        ...toTaskSummary(row),
        ship_name: row.ship_name,
    }));
}

export function getTodayTasks(db?: Database) {
    const today = new Date().toISOString().split('T')[0];

    const rows = queryAll<TaskRow & { ship_name: string | null }>(
        `SELECT t.*, s.name as ship_name
         FROM tasks t
         LEFT JOIN ships s ON s.id = t.ship_id
         WHERE t.status IN ('todo', 'in_progress')
           AND (t.deadline IS NULL OR t.deadline <= ?)
         ORDER BY
            CASE t.priority
                WHEN 'critical' THEN 0
                WHEN 'high' THEN 1
                WHEN 'normal' THEN 2
                WHEN 'low' THEN 3
            END,
            t.created_at DESC`,
        [today],
        db,
    );

    return rows.map(row => ({
        ...toTaskSummary(row),
        ship_name: row.ship_name,
    }));
}

// --- Split / Merge ---

export function splitTask(
    id: number,
    splitAfterHours: number,
    db?: Database,
): { part1: TaskDetail; part2: TaskDetail } {
    const original = queryOne<TaskRow>('SELECT * FROM tasks WHERE id = ?', [id], db);
    if (!original) throw new Error('TASK_NOT_FOUND');

    const totalHours = original.estimated_hours ?? 8;
    if (splitAfterHours <= 0 || splitAfterHours >= totalHours) {
        throw new Error('INVALID_SPLIT_POINT');
    }

    // Determine split_group_id — use existing or original task's ID
    const splitGroupId = original.split_group_id ?? id;

    // Clean title (remove existing suffix like " (1/2)")
    const baseTitle = original.title.replace(/\s*\(\d+\/\d+\)\s*$/, '');

    // Get original assignees
    const assignees = queryAll<{ user_id: number }>(
        'SELECT user_id FROM task_assignments WHERE task_id = ?',
        [id],
        db,
    );

    // Get original dependencies (tasks this task depends on)
    const deps = queryAll<{ depends_on_id: number }>(
        'SELECT depends_on_id FROM task_dependencies WHERE task_id = ?',
        [id],
        db,
    );

    // Get tasks that depend on this task (successors)
    const successors = queryAll<{ task_id: number }>(
        'SELECT task_id FROM task_dependencies WHERE depends_on_id = ?',
        [id],
        db,
    );

    // Create Part 1
    const part1Result = execute(
        `INSERT INTO tasks (title, description, ship_id, ship_scope, category, priority,
            estimated_hours, estimated_cost, deadline, planned_start, split_group_id,
            weather_dependent, weather_min_temp, weather_max_humidity, weather_max_wind,
            weather_no_rain, logistics_notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            `${baseTitle} (1/2)`,
            original.description,
            original.ship_id,
            original.ship_scope ?? null,
            original.category,
            original.priority,
            splitAfterHours,
            original.estimated_cost ? (original.estimated_cost * splitAfterHours / totalHours) : null,
            original.deadline,
            original.planned_start ?? null,
            splitGroupId,
            original.weather_dependent ?? 0,
            original.weather_min_temp ?? null,
            original.weather_max_humidity ?? null,
            original.weather_max_wind ?? null,
            original.weather_no_rain ?? 0,
            original.logistics_notes ?? null,
            original.created_by,
        ],
        db,
    );
    const part1Id = part1Result.lastInsertRowid;

    // Create Part 2
    const remainingHours = totalHours - splitAfterHours;
    const part2Result = execute(
        `INSERT INTO tasks (title, description, ship_id, ship_scope, category, priority,
            estimated_hours, estimated_cost, deadline, planned_start, split_group_id,
            weather_dependent, weather_min_temp, weather_max_humidity, weather_max_wind,
            weather_no_rain, logistics_notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            `${baseTitle} (2/2)`,
            original.description,
            original.ship_id,
            original.ship_scope ?? null,
            original.category,
            original.priority,
            remainingHours,
            original.estimated_cost ? (original.estimated_cost * remainingHours / totalHours) : null,
            original.deadline,
            null, // planned_start for part 2 — user will drag it
            splitGroupId,
            original.weather_dependent ?? 0,
            original.weather_min_temp ?? null,
            original.weather_max_humidity ?? null,
            original.weather_max_wind ?? null,
            original.weather_no_rain ?? 0,
            original.logistics_notes ?? null,
            original.created_by,
        ],
        db,
    );
    const part2Id = part2Result.lastInsertRowid;

    // Copy assignees to both parts
    for (const a of assignees) {
        execute('INSERT INTO task_assignments (task_id, user_id) VALUES (?, ?)', [part1Id, a.user_id], db);
        execute('INSERT INTO task_assignments (task_id, user_id) VALUES (?, ?)', [part2Id, a.user_id], db);
    }

    // Part 1 inherits original's dependencies
    for (const d of deps) {
        execute('INSERT INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)', [part1Id, d.depends_on_id], db);
    }

    // Part 2 depends on Part 1
    execute('INSERT INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)', [part2Id, part1Id], db);

    // Successors of original now depend on Part 2
    for (const s of successors) {
        execute('INSERT INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)', [s.task_id, part2Id], db);
    }

    // Migrate relations before deletion to prevent ON DELETE CASCADE from destroying them
    execute('UPDATE time_logs SET task_id = ? WHERE task_id = ?', [part1Id, id], db);
    execute('UPDATE attachments SET task_id = ? WHERE task_id = ?', [part1Id, id], db);
    execute('UPDATE task_materials SET task_id = ? WHERE task_id = ?', [part1Id, id], db);

    // Delete original task (cascades assignments/deps via FK)
    execute('DELETE FROM tasks WHERE id = ?', [id], db);

    return {
        part1: getTaskById(part1Id, db)!,
        part2: getTaskById(part2Id, db)!,
    };
}

export function mergeTasks(
    splitGroupId: number,
    db?: Database,
): TaskDetail {
    const siblings = queryAll<TaskRow>(
        'SELECT * FROM tasks WHERE split_group_id = ? ORDER BY id ASC',
        [splitGroupId],
        db,
    );

    if (siblings.length < 2) throw new Error('NOTHING_TO_MERGE');

    const first = siblings[0];
    const totalHours = siblings.reduce((sum, s) => sum + (s.estimated_hours ?? 0), 0);
    const totalCost = siblings.reduce((sum, s) => sum + (s.estimated_cost ?? 0), 0);

    // Clean title
    const baseTitle = first.title.replace(/\s*\(\d+\/\d+\)\s*$/, '');

    // Collect all unique assignees from all siblings
    const allAssignees = new Set<number>();
    for (const s of siblings) {
        const assigns = queryAll<{ user_id: number }>(
            'SELECT user_id FROM task_assignments WHERE task_id = ?',
            [s.id],
            db,
        );
        assigns.forEach(a => allAssignees.add(a.user_id));
    }

    // Collect external dependencies (not inter-sibling)
    const siblingIds = new Set(siblings.map(s => s.id));
    const externalDeps = new Set<number>();
    for (const s of siblings) {
        const deps = queryAll<{ depends_on_id: number }>(
            'SELECT depends_on_id FROM task_dependencies WHERE task_id = ?',
            [s.id],
            db,
        );
        deps.forEach(d => {
            if (!siblingIds.has(d.depends_on_id)) externalDeps.add(d.depends_on_id);
        });
    }

    // Collect external successors
    const externalSuccessors = new Set<number>();
    for (const s of siblings) {
        const succs = queryAll<{ task_id: number }>(
            'SELECT task_id FROM task_dependencies WHERE depends_on_id = ?',
            [s.id],
            db,
        );
        succs.forEach(sc => {
            if (!siblingIds.has(sc.task_id)) externalSuccessors.add(sc.task_id);
        });
    }

    // earliest planned_start
    const plannedStarts = siblings
        .map(s => s.planned_start)
        .filter(Boolean) as string[];
    const earliestPlanned = plannedStarts.length > 0
        ? plannedStarts.sort()[0]
        : null;

    // Create merged task
    const result = execute(
        `INSERT INTO tasks (title, description, ship_id, ship_scope, category, priority,
            estimated_hours, estimated_cost, deadline, planned_start, split_group_id,
            weather_dependent, weather_min_temp, weather_max_humidity, weather_max_wind,
            weather_no_rain, logistics_notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            baseTitle,
            first.description,
            first.ship_id,
            first.ship_scope ?? null,
            first.category,
            first.priority,
            totalHours,
            totalCost > 0 ? totalCost : null,
            first.deadline,
            earliestPlanned,
            null, // no longer part of a split
            first.weather_dependent ?? 0,
            first.weather_min_temp ?? null,
            first.weather_max_humidity ?? null,
            first.weather_max_wind ?? null,
            first.weather_no_rain ?? 0,
            first.logistics_notes ?? null,
            first.created_by,
        ],
        db,
    );
    const mergedId = result.lastInsertRowid;

    // Restore assignees
    for (const userId of allAssignees) {
        execute('INSERT INTO task_assignments (task_id, user_id) VALUES (?, ?)', [mergedId, userId], db);
    }

    // Restore external dependencies
    for (const depId of externalDeps) {
        execute('INSERT INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)', [mergedId, depId], db);
    }

    // Restore external successors
    for (const succId of externalSuccessors) {
        // Remove old dependency first (on sibling), then add new one (on merged)
        execute('INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)', [succId, mergedId], db);
    }

    // Migrate relations before deletion to prevent ON DELETE CASCADE from destroying them
    for (const s of siblings) {
        execute('UPDATE time_logs SET task_id = ? WHERE task_id = ?', [mergedId, s.id], db);
        execute('UPDATE attachments SET task_id = ? WHERE task_id = ?', [mergedId, s.id], db);
        execute('UPDATE task_materials SET task_id = ? WHERE task_id = ?', [mergedId, s.id], db);
    }

    // Delete all siblings
    for (const s of siblings) {
        execute('DELETE FROM tasks WHERE id = ?', [s.id], db);
    }

    return getTaskById(mergedId, db)!;
}
