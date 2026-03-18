import { queryAll, queryOne, execute } from '../db/database.js';
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
async function toTaskDetail(row: TaskRow): Promise<TaskDetail> {
    const assignees = await queryAll<{ id: number; name: string; email: string }>(
        `SELECT u.id, u.name, u.email
         FROM task_assignments ta
         JOIN users u ON u.id = ta.user_id
         WHERE ta.task_id = ?`,
        [row.id],
    );

    const dependencies = await queryAll<{ id: number; title: string; status: string }>(
        `SELECT t.id, t.title, t.status
         FROM task_dependencies td
         JOIN tasks t ON t.id = td.depends_on_id
         WHERE td.task_id = ?`,
        [row.id],
    );

    const time_logs = await queryAll<{ id: number; hours: number; note: string | null; logged_at: string; user_name: string }>(
        `SELECT tl.id, tl.hours, tl.note, tl.logged_at, u.name as user_name
         FROM time_logs tl
         JOIN users u ON u.id = tl.user_id
         WHERE tl.task_id = ?
         ORDER BY tl.logged_at DESC`,
        [row.id],
    );

    const ship = row.ship_id
        ? await queryOne<{ name: string }>('SELECT name FROM ships WHERE id = ?', [row.ship_id])
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

export async function listTasks(filters: TaskQueryInput) {
    const conditions: string[] = [];
    const params: (string | number | null)[] = [];

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

    const rows = await queryAll<TaskRow & { ship_name: string | null }>(sql, params);
    return rows.map(row => ({
        ...toTaskSummary(row),
        ship_name: row.ship_name,
    }));
}

export async function getTaskById(id: number): Promise<TaskDetail | undefined> {
    const row = await queryOne<TaskRow>('SELECT * FROM tasks WHERE id = ?', [id]);
    if (!row) return undefined;
    return toTaskDetail(row);
}

export async function createTask(
    input: CreateTaskInput,
    createdBy: number,
): Promise<TaskDetail> {
    const result = await execute(
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
    );

    const taskId = result.lastInsertRowid;

    // Assignees
    if (input.assignee_ids?.length) {
        for (const userId of input.assignee_ids) {
            try {
                await execute(
                    'INSERT INTO task_assignments (task_id, user_id) VALUES (?, ?)',
                    [taskId, userId],
                );
            } catch {
                throw new Error(`INVALID_ASSIGNEE:${userId}`);
            }
        }
    }

    // Dependencies
    if (input.dependency_ids?.length) {
        // Cycle check: get all existing deps and task IDs
        const allDeps = await queryAll<{ task_id: number; depends_on_id: number }>(
            'SELECT task_id, depends_on_id FROM task_dependencies', [],
        );
        const allTaskIds = (await queryAll<{ id: number }>('SELECT id FROM tasks', [])).map(r => r.id);

        for (const depId of input.dependency_ids) {
            // depId → taskId means taskId depends on depId
            if (wouldCreateCycle(depId, taskId, allDeps, allTaskIds)) {
                throw new Error(`CYCLE_WOULD_BE_CREATED:${depId}:${taskId}`);
            }
            try {
                await execute(
                    'INSERT INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)',
                    [taskId, depId],
                );
                // Add to allDeps so subsequent checks within this loop are accurate
                allDeps.push({ task_id: taskId, depends_on_id: depId });
            } catch {
                throw new Error(`INVALID_DEPENDENCY:${depId}`);
            }
        }
    }

    return (await getTaskById(taskId))!;
}

export async function updateTask(
    id: number,
    input: UpdateTaskInput,
): Promise<TaskDetail | undefined> {
    const existing = await queryOne<TaskRow>('SELECT id FROM tasks WHERE id = ?', [id]);
    if (!existing) return undefined;

    const fields: string[] = [];
    const params: (string | number | null)[] = [];

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
            params.push((value ?? null) as string | number | null);
        }
    }

    if (fields.length > 0) {
        params.push(id);
        await execute(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`, params);
    }

    // Update assignees if provided
    if (input.assignee_ids !== undefined) {
        await execute('DELETE FROM task_assignments WHERE task_id = ?', [id]);
        for (const userId of input.assignee_ids ?? []) {
            await execute(
                'INSERT INTO task_assignments (task_id, user_id) VALUES (?, ?)',
                [id, userId],
            );
        }
    }

    // Update dependencies if provided
    if (input.dependency_ids !== undefined) {
        // Cycle check before replacing dependencies
        const newDeps = input.dependency_ids ?? [];
        if (newDeps.length > 0) {
            // Get all existing deps EXCEPT this task's current ones (since we're replacing them)
            const allDeps = await queryAll<{ task_id: number; depends_on_id: number }>(
                'SELECT task_id, depends_on_id FROM task_dependencies WHERE task_id != ?', [id],
            );
            const allTaskIds = (await queryAll<{ id: number }>('SELECT id FROM tasks', [])).map(r => r.id);

            for (const depId of newDeps) {
                if (wouldCreateCycle(depId, id, allDeps, allTaskIds)) {
                    throw new Error(`CYCLE_WOULD_BE_CREATED:${depId}:${id}`);
                }
                // Add to allDeps so subsequent checks within this loop are accurate
                allDeps.push({ task_id: id, depends_on_id: depId });
            }
        }

        await execute('DELETE FROM task_dependencies WHERE task_id = ?', [id]);
        for (const depId of newDeps) {
            await execute(
                'INSERT INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)',
                [id, depId],
            );
        }
    }

    return await getTaskById(id);
}

export async function deleteTask(id: number): Promise<boolean> {
    const existing = await queryOne<TaskRow>('SELECT id FROM tasks WHERE id = ?', [id]);
    if (!existing) return false;
    await execute('DELETE FROM tasks WHERE id = ?', [id]);
    return true;
}

export async function changeTaskStatus(
    id: number,
    input: ChangeStatusInput,
    userId: number,
    userRole: string,
): Promise<TaskDetail | undefined> {
    const task = await queryOne<TaskRow>('SELECT * FROM tasks WHERE id = ?', [id]);
    if (!task) return undefined;

    // Workers can only change status of tasks assigned to them
    if (userRole === 'worker') {
        const assignment = await queryOne<{ id: number }>(
            'SELECT id FROM task_assignments WHERE task_id = ? AND user_id = ?',
            [id, userId],
        );
        if (!assignment) {
            throw new Error('FORBIDDEN');
        }
    }

    const params: (string | number | null)[] = [input.status];
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

    await execute(sql, params);

    return await getTaskById(id);
}

export async function logTime(
    taskId: number,
    userId: number,
    userRole: string,
    input: LogTimeInput,
): Promise<{ id: number; hours: number; note: string | null; logged_at: string }> {
    const task = await queryOne<{ id: number }>('SELECT id FROM tasks WHERE id = ?', [taskId]);
    if (!task) {
        throw new Error('TASK_NOT_FOUND');
    }

    // Workers can only log time on tasks assigned to them
    if (userRole === 'worker') {
        const assignment = await queryOne<{ id: number }>(
            'SELECT id FROM task_assignments WHERE task_id = ? AND user_id = ?',
            [taskId, userId],
        );
        if (!assignment) {
            throw new Error('FORBIDDEN');
        }
    }

    const result = await execute(
        'INSERT INTO time_logs (task_id, user_id, hours, note) VALUES (?, ?, ?, ?)',
        [taskId, userId, input.hours, input.note ?? null],
    );

    // Update actual_hours on the task
    await execute(
        'UPDATE tasks SET actual_hours = (SELECT COALESCE(SUM(hours), 0) FROM time_logs WHERE task_id = ?) WHERE id = ?',
        [taskId, taskId],
    );

    const log = await queryOne<{ id: number; hours: number; note: string | null; logged_at: string }>(
        'SELECT id, hours, note, logged_at FROM time_logs WHERE id = ?',
        [result.lastInsertRowid],
    );

    return log!;
}

export async function getMyTasks(userId: number) {
    const rows = await queryAll<TaskRow & { ship_name: string | null }>(
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
    );

    return rows.map(row => ({
        ...toTaskSummary(row),
        ship_name: row.ship_name,
    }));
}

export async function getTodayTasks() {
    const today = new Date().toISOString().split('T')[0];

    const rows = await queryAll<TaskRow & { ship_name: string | null }>(
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
    );

    return rows.map(row => ({
        ...toTaskSummary(row),
        ship_name: row.ship_name,
    }));
}

// --- Split / Merge ---

export async function splitTask(
    id: number,
    splitAfterHours: number,
): Promise<{ part1: TaskDetail; part2: TaskDetail }> {
    const original = await queryOne<TaskRow>('SELECT * FROM tasks WHERE id = ?', [id]);
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
    const assignees = await queryAll<{ user_id: number }>(
        'SELECT user_id FROM task_assignments WHERE task_id = ?',
        [id],
    );

    // Get original dependencies (tasks this task depends on)
    const deps = await queryAll<{ depends_on_id: number }>(
        'SELECT depends_on_id FROM task_dependencies WHERE task_id = ?',
        [id],
    );

    // Get tasks that depend on this task (successors)
    const successors = await queryAll<{ task_id: number }>(
        'SELECT task_id FROM task_dependencies WHERE depends_on_id = ?',
        [id],
    );

    // Create Part 1
    const part1Result = await execute(
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
    );
    const part1Id = part1Result.lastInsertRowid;

    // Create Part 2
    const remainingHours = totalHours - splitAfterHours;
    const part2Result = await execute(
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
    );
    const part2Id = part2Result.lastInsertRowid;

    // Copy assignees to both parts
    for (const a of assignees) {
        await execute('INSERT INTO task_assignments (task_id, user_id) VALUES (?, ?)', [part1Id, a.user_id]);
        await execute('INSERT INTO task_assignments (task_id, user_id) VALUES (?, ?)', [part2Id, a.user_id]);
    }

    // Part 1 inherits original's dependencies
    for (const d of deps) {
        await execute('INSERT INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)', [part1Id, d.depends_on_id]);
    }

    // Part 2 depends on Part 1
    await execute('INSERT INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)', [part2Id, part1Id]);

    // Successors of original now depend on Part 2
    for (const s of successors) {
        await execute('INSERT INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)', [s.task_id, part2Id]);
    }

    // Migrate relations before deletion to prevent ON DELETE CASCADE from destroying them
    await execute('UPDATE time_logs SET task_id = ? WHERE task_id = ?', [part1Id, id]);
    await execute('UPDATE attachments SET task_id = ? WHERE task_id = ?', [part1Id, id]);
    await execute('UPDATE task_materials SET task_id = ? WHERE task_id = ?', [part1Id, id]);

    // Delete original task (cascades assignments/deps via FK)
    await execute('DELETE FROM tasks WHERE id = ?', [id]);

    return {
        part1: (await getTaskById(part1Id))!,
        part2: (await getTaskById(part2Id))!,
    };
}

export async function mergeTasks(
    splitGroupId: number,
): Promise<TaskDetail> {
    const siblings = await queryAll<TaskRow>(
        'SELECT * FROM tasks WHERE split_group_id = ? ORDER BY id ASC',
        [splitGroupId],
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
        const assigns = await queryAll<{ user_id: number }>(
            'SELECT user_id FROM task_assignments WHERE task_id = ?',
            [s.id],
        );
        assigns.forEach(a => allAssignees.add(a.user_id));
    }

    // Collect external dependencies (not inter-sibling)
    const siblingIds = new Set(siblings.map(s => s.id));
    const externalDeps = new Set<number>();
    for (const s of siblings) {
        const deps = await queryAll<{ depends_on_id: number }>(
            'SELECT depends_on_id FROM task_dependencies WHERE task_id = ?',
            [s.id],
        );
        deps.forEach(d => {
            if (!siblingIds.has(d.depends_on_id)) externalDeps.add(d.depends_on_id);
        });
    }

    // Collect external successors
    const externalSuccessors = new Set<number>();
    for (const s of siblings) {
        const succs = await queryAll<{ task_id: number }>(
            'SELECT task_id FROM task_dependencies WHERE depends_on_id = ?',
            [s.id],
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
    const result = await execute(
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
    );
    const mergedId = result.lastInsertRowid;

    // Restore assignees
    for (const userId of allAssignees) {
        await execute('INSERT INTO task_assignments (task_id, user_id) VALUES (?, ?)', [mergedId, userId]);
    }

    // Restore external dependencies
    for (const depId of externalDeps) {
        await execute('INSERT INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)', [mergedId, depId]);
    }

    // Restore external successors
    for (const succId of externalSuccessors) {
        // Remove old dependency first (on sibling), then add new one (on merged)
        await execute('INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)', [succId, mergedId]);
    }

    // Migrate relations before deletion to prevent ON DELETE CASCADE from destroying them
    for (const s of siblings) {
        await execute('UPDATE time_logs SET task_id = ? WHERE task_id = ?', [mergedId, s.id]);
        await execute('UPDATE attachments SET task_id = ? WHERE task_id = ?', [mergedId, s.id]);
        await execute('UPDATE task_materials SET task_id = ? WHERE task_id = ?', [mergedId, s.id]);
    }

    // Delete all siblings
    for (const s of siblings) {
        await execute('DELETE FROM tasks WHERE id = ?', [s.id]);
    }

    return (await getTaskById(mergedId))!;
}
