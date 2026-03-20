import { queryAll, queryOne, execute } from '../db/database.js';

// --- Types ---

export interface GanttTask {
    id: number;
    title: string;
    status: string;
    priority: string;
    category: string;
    ship_id: number | null;
    ship_name: string | null;
    estimated_hours: number;
    actual_hours: number;
    deadline: string | null;
    planned_start: string | null;
    split_group_id: number | null;
    weather_dependent: boolean;
    weather_min_temp: number | null;
    weather_max_wind: number | null;
    weather_no_rain: boolean;
    assignees: { id: number; name: string }[];
    dependencies: number[];
    // CPM computed fields
    early_start: number;
    early_finish: number;
    late_start: number;
    late_finish: number;
    slack: number;
    is_critical: boolean;
}

export interface GanttFilters {
    ship_id?: number;
    assignee_id?: number;
}

interface TaskRow {
    id: number;
    title: string;
    status: string;
    priority: string;
    category: string;
    ship_id: number | null;
    ship_name: string | null;
    estimated_hours: number | null;
    actual_hours: number;
    deadline: string | null;
    planned_start: string | null;
    split_group_id: number | null;
    weather_dependent: number;
    weather_min_temp: number | null;
    weather_max_wind: number | null;
    weather_no_rain: number;
}

interface DepRow {
    task_id: number;
    depends_on_id: number;
}

interface AssigneeRow {
    task_id: number;
    user_id: number;
    user_name: string;
}

// --- DAG ---

export interface DAG {
    /** adjacency list: node → list of nodes that depend on it (successors) */
    successors: Map<number, number[]>;
    /** adjacency list: node → list of nodes it depends on (predecessors) */
    predecessors: Map<number, number[]>;
    /** set of all node IDs */
    nodes: Set<number>;
}

export async function buildDAG(taskIds: number[], deps: DepRow[]): Promise<DAG> {
    const successors = new Map<number, number[]>();
    const predecessors = new Map<number, number[]>();
    const nodes = new Set<number>(taskIds);

    for (const id of taskIds) {
        successors.set(id, []);
        predecessors.set(id, []);
    }

    for (const dep of deps) {
        // dep.task_id depends_on dep.depends_on_id
        // So depends_on_id → task_id is a successor edge
        if (nodes.has(dep.task_id) && nodes.has(dep.depends_on_id)) {
            successors.get(dep.depends_on_id)!.push(dep.task_id);
            predecessors.get(dep.task_id)!.push(dep.depends_on_id);
        }
    }

    return { successors, predecessors, nodes };
}

// --- Topological Sort (Kahn's Algorithm) ---

export interface TopologicalSortResult {
    sorted: number[];
    brokenEdges: { from: number; to: number }[];
}

/**
 * Topological sort with graceful cycle breaking.
 * If cycles exist, back-edges are removed until the graph is a DAG.
 * Returns the sorted order + any edges that were broken.
 */
export async function topologicalSort(dag: DAG): Promise<TopologicalSortResult> {
    // Work on copies so we don't mutate the original DAG
    const inDegree = new Map<number, number>();
    const succCopy = new Map<number, number[]>();
    const predCopy = new Map<number, number[]>();

    for (const id of dag.nodes) {
        inDegree.set(id, dag.predecessors.get(id)?.length ?? 0);
        succCopy.set(id, [...(dag.successors.get(id) ?? [])]);
        predCopy.set(id, [...(dag.predecessors.get(id) ?? [])]);
    }

    const brokenEdges: { from: number; to: number }[] = [];

    function runKahn(): number[] {
        const queue: number[] = [];
        for (const [id, degree] of inDegree) {
            if (degree === 0) queue.push(id);
        }
        queue.sort((a, b) => a - b);

        const sorted: number[] = [];

        while (queue.length > 0) {
            const node = queue.shift()!;
            sorted.push(node);

            const succs = succCopy.get(node) ?? [];
            const sortedSuccs = [...succs].sort((a, b) => a - b);
            for (const succ of sortedSuccs) {
                const newDeg = inDegree.get(succ)! - 1;
                inDegree.set(succ, newDeg);
                if (newDeg === 0) {
                    queue.push(succ);
                    queue.sort((a, b) => a - b);
                }
            }
        }

        return sorted;
    }

    let sorted = runKahn();

    // If all nodes are sorted, no cycles — fast path
    while (sorted.length !== dag.nodes.size) {
        // Find nodes in cycle(s) — those not yet sorted
        const sortedSet = new Set(sorted);
        const cycleNodes = [...dag.nodes].filter(id => !sortedSet.has(id));

        // Break one back-edge: pick the first cycle node and remove one of its incoming edges
        // This is the minimum intervention to break at least one cycle
        const victim = cycleNodes.sort((a, b) => a - b)[0];
        const preds = predCopy.get(victim) ?? [];
        if (preds.length === 0) break; // safety: shouldn't happen

        const removedPred = preds[0];
        brokenEdges.push({ from: removedPred, to: victim });

        // Remove the edge from our working copies
        predCopy.set(victim, preds.filter(p => p !== removedPred));
        succCopy.set(removedPred, (succCopy.get(removedPred) ?? []).filter(s => s !== victim));

        // Also mutate the original DAG so CPM scheduling works correctly
        dag.predecessors.set(victim, (dag.predecessors.get(victim) ?? []).filter(p => p !== removedPred));
        dag.successors.set(removedPred, (dag.successors.get(removedPred) ?? []).filter(s => s !== victim));

        // Recalculate in-degrees from scratch
        for (const id of dag.nodes) {
            inDegree.set(id, predCopy.get(id)?.length ?? 0);
        }

        // Re-run Kahn's
        sorted = runKahn();
    }

    return { sorted, brokenEdges };
}

// --- Cycle Detection (for prevention) ---

/**
 * Check if adding edge `fromId → toId` (toId depends on fromId) would create a cycle.
 * Returns true if a cycle WOULD be created.
 * Uses DFS: if toId can already reach fromId via existing edges, adding fromId→toId creates a cycle.
 */
export function wouldCreateCycle(
    fromId: number,
    toId: number,
    existingDeps: { task_id: number; depends_on_id: number }[],
    taskIds: number[],
): boolean {
    // Build adjacency: depends_on_id → task_id (successor direction)
    const successors = new Map<number, number[]>();
    for (const id of taskIds) {
        successors.set(id, []);
    }
    for (const dep of existingDeps) {
        if (successors.has(dep.depends_on_id)) {
            successors.get(dep.depends_on_id)!.push(dep.task_id);
        }
    }

    // DFS from toId — can we reach fromId?
    // If yes, then adding fromId→toId would close the cycle
    const visited = new Set<number>();
    const stack = [toId];

    while (stack.length > 0) {
        const current = stack.pop()!;
        if (current === fromId) return true;
        if (visited.has(current)) continue;
        visited.add(current);

        for (const succ of successors.get(current) ?? []) {
            stack.push(succ);
        }
    }

    return false;
}

// --- Resource-Constrained Scheduling ---

interface CPMNode {
    id: number;
    duration: number; // in hours
    early_start: number;
    early_finish: number;
    late_start: number;
    late_finish: number;
    slack: number;
    is_critical: boolean;
}

const HOURS_PER_DAY = 8;

// Priority score for scheduling order (lower = scheduled first)
const PRIORITY_WEIGHT: Record<string, number> = {
    critical: 0,
    high: 1,
    normal: 2,
    low: 3,
};

/**
 * Resource-constrained scheduling (Serial SGS - Schedule Generation Scheme).
 *
 * Each task occupies 1 worker for its entire calendar duration
 * (duration_days = ceil(estimated_hours / 8)). The algorithm enforces:
 *   1. Global capacity: max `totalWorkers` tasks run simultaneously
 *   2. Per-person constraint: if a task is assigned to a person,
 *      that person must be free for the task's entire duration
 *
 * Tasks are scheduled in priority order (critical first, then dependencies).
 */
export async function resourceConstrainedSchedule(
    dag: DAG,
    topoOrder: number[],
    durations: Map<number, number>,
    priorities: Map<number, string>,
    totalWorkers: number,
    taskAssignees?: Map<number, number[]>,
    plannedStartOffsets?: Map<number, number>,
): Promise<Map<number, CPMNode>> {
    const nodes = new Map<number, CPMNode>();

    // Initialize all nodes
    for (const id of dag.nodes) {
        nodes.set(id, {
            id,
            duration: durations.get(id) ?? HOURS_PER_DAY,
            early_start: 0,
            early_finish: 0,
            late_start: 0,
            late_finish: 0,
            slack: 0,
            is_critical: false,
        });
    }

    // Sort tasks by: dependencies first (topo), then priority
    // (must be topo-first so predecessors have early_finish computed)
    const schedulingOrder = [...topoOrder].sort((a, b) => {
        const topoA = topoOrder.indexOf(a);
        const topoB = topoOrder.indexOf(b);
        const prioA = PRIORITY_WEIGHT[priorities.get(a) || 'normal'] ?? 2;
        const prioB = PRIORITY_WEIGHT[priorities.get(b) || 'normal'] ?? 2;
        if (topoA !== topoB) return topoA - topoB;
        return prioA - prioB;
    });

    // Track how many worker-hours are used each day (global cap = totalWorkers * HOURS_PER_DAY)
    const busyWorkerHours = new Map<number, number>(); // day → total hours used across all workers

    // Track per-person hours used each day: personId → (day → hours used)
    const personHoursPerDay = new Map<number, Map<number, number>>();

    function getPersonHoursOnDay(personId: number, day: number): number {
        return personHoursPerDay.get(personId)?.get(day) ?? 0;
    }

    function getGlobalHoursOnDay(day: number): number {
        return busyWorkerHours.get(day) ?? 0;
    }

    /**
     * Try to pack a task into consecutive days starting from startDay.
     * A task of N hours will take ceil(N/8) days, but on each day it uses
     * min(remaining, 8 - alreadyUsed) hours.
     * Returns true if the person has enough free hours in those days.
     */
    function canPersonFitTask(personId: number, startDay: number, taskHours: number): boolean {
        let remaining = taskHours;
        let day = startDay;
        const maxDays = Math.ceil(taskHours / HOURS_PER_DAY) + 10; // safety margin
        let usedDays = 0;
        while (remaining > 0 && usedDays < maxDays) {
            const freeHours = HOURS_PER_DAY - getPersonHoursOnDay(personId, day);
            if (freeHours <= 0) {
                // This day is fully booked for this person
                day++;
                usedDays++;
                continue;
            }
            const use = Math.min(remaining, freeHours);
            remaining -= use;
            day++;
            usedDays++;
        }
        return remaining <= 0;
    }

    /**
     * Calculate how many calendar days a task actually needs considering existing bookings.
     */
    function getActualDaysNeeded(personIds: number[], startDay: number, taskHours: number): number {
        if (personIds.length === 0) {
            // Un-assigned task: just check global capacity
            let remaining = taskHours;
            let day = startDay;
            let lastDay = startDay;
            const maxSpan = Math.ceil(taskHours / HOURS_PER_DAY) + 10;
            while (remaining > 0 && (day - startDay) < maxSpan) {
                const freeHours = HOURS_PER_DAY * totalWorkers - getGlobalHoursOnDay(day);
                if (freeHours > 0) {
                    remaining -= Math.min(remaining, HOURS_PER_DAY); // 1 worker's worth
                    lastDay = day;
                }
                day++;
            }
            return lastDay - startDay + 1;
        }
        // For assigned tasks: figure out how many days from startDay until all hours are placed
        let remaining = taskHours;
        let day = startDay;
        let lastDay = startDay;
        const maxSpan = Math.ceil(taskHours / HOURS_PER_DAY) + 10;
        while (remaining > 0 && (day - startDay) < maxSpan) {
            // Find the min free hours across all assigned persons on this day
            let minFree = HOURS_PER_DAY;
            for (const pid of personIds) {
                const free = HOURS_PER_DAY - getPersonHoursOnDay(pid, day);
                if (free < minFree) minFree = free;
            }
            if (minFree > 0) {
                const use = Math.min(remaining, minFree);
                remaining -= use;
                lastDay = day;
            }
            day++;
        }
        return lastDay - startDay + 1;
    }

    function occupySlot(startDay: number, taskHours: number, assigneeIds: number[]): void {
        let remaining = taskHours;
        let day = startDay;
        const maxSpan = Math.ceil(taskHours / HOURS_PER_DAY) + 10;

        while (remaining > 0 && (day - startDay) < maxSpan) {
            if (assigneeIds.length > 0) {
                // Find min free hours across all assigned persons
                let minFree = HOURS_PER_DAY;
                for (const pid of assigneeIds) {
                    const free = HOURS_PER_DAY - getPersonHoursOnDay(pid, day);
                    if (free < minFree) minFree = free;
                }
                if (minFree <= 0) { day++; continue; }

                const use = Math.min(remaining, minFree);
                // Mark hours for each person
                for (const pid of assigneeIds) {
                    if (!personHoursPerDay.has(pid)) personHoursPerDay.set(pid, new Map());
                    const dayMap = personHoursPerDay.get(pid)!;
                    dayMap.set(day, (dayMap.get(day) ?? 0) + use);
                }
                // Update global tracker
                busyWorkerHours.set(day, (busyWorkerHours.get(day) ?? 0) + use);
                remaining -= use;
            } else {
                // Unassigned: just use 1 worker's worth of capacity
                const globalFree = HOURS_PER_DAY * totalWorkers - getGlobalHoursOnDay(day);
                if (globalFree <= 0) { day++; continue; }
                const use = Math.min(remaining, HOURS_PER_DAY);
                busyWorkerHours.set(day, (busyWorkerHours.get(day) ?? 0) + use);
                remaining -= use;
            }
            day++;
        }
    }

    /**
     * Find the earliest start day where the task can fit:
     *   1. All assigned persons have enough free hours
     *   2. Global capacity not exceeded
     */
    function findEarliestSlot(earliestDay: number, taskHours: number, assigneeIds: number[]): number {
        // Zero-duration tasks (e.g. completed) don't need a slot
        if (taskHours <= 0) return earliestDay * HOURS_PER_DAY;

        let candidateDay = earliestDay;
        const maxDay = earliestDay + 365;

        while (candidateDay < maxDay) {
            let canFit = true;

            if (assigneeIds.length > 0) {
                // Check if all assigned people can fit this task starting from candidateDay
                for (const pid of assigneeIds) {
                    if (!canPersonFitTask(pid, candidateDay, taskHours)) {
                        canFit = false;
                        break;
                    }
                }
                // Also check: is there any free time on candidateDay for ALL assignees?
                if (canFit) {
                    let minFree = HOURS_PER_DAY;
                    for (const pid of assigneeIds) {
                        const free = HOURS_PER_DAY - getPersonHoursOnDay(pid, candidateDay);
                        if (free < minFree) minFree = free;
                    }
                    if (minFree <= 0) canFit = false;
                }
            } else {
                // Unassigned: check global capacity
                const globalFree = HOURS_PER_DAY * totalWorkers - getGlobalHoursOnDay(candidateDay);
                if (globalFree <= 0) canFit = false;
            }

            if (canFit) {
                occupySlot(candidateDay, taskHours, assigneeIds);
                return candidateDay * HOURS_PER_DAY;
            }
            candidateDay++;
        }

        // Fallback
        occupySlot(earliestDay, taskHours, assigneeIds);
        return earliestDay * HOURS_PER_DAY;
    }

    // Forward pass — resource-constrained with per-person tracking
    for (const id of schedulingOrder) {
        const node = nodes.get(id)!;
        const preds = dag.predecessors.get(id) ?? [];

        // Earliest start is after all predecessors finish (in hours)
        let earliestHours = 0;
        for (const predId of preds) {
            const pred = nodes.get(predId)!;
            if (pred.early_finish > earliestHours) {
                earliestHours = pred.early_finish;
            }
        }

        // Apply planned_start constraint
        const psOffset = plannedStartOffsets?.get(id);

        if (psOffset !== undefined) {
            const pinnedHours = Math.max(psOffset, earliestHours);
            const pinnedDay = Math.ceil(pinnedHours / HOURS_PER_DAY);
            const assigneeIds = taskAssignees?.get(id) ?? [];
            node.early_start = findEarliestSlot(pinnedDay, node.duration, assigneeIds);
        } else {
            const earliestDay = Math.ceil(earliestHours / HOURS_PER_DAY);
            const assigneeIds = taskAssignees?.get(id) ?? [];
            node.early_start = findEarliestSlot(earliestDay, node.duration, assigneeIds);
        }
        node.early_finish = node.early_start + node.duration;
    }

    // Find project duration
    let projectDuration = 0;
    for (const node of nodes.values()) {
        if (node.early_finish > projectDuration) {
            projectDuration = node.early_finish;
        }
    }

    // Backward pass — compute late_start, late_finish (unchanged)
    const reverseOrder = [...topoOrder].reverse();
    for (const id of reverseOrder) {
        const node = nodes.get(id)!;
        const succs = dag.successors.get(id) ?? [];

        if (succs.length === 0) {
            node.late_finish = projectDuration;
        } else {
            node.late_finish = Math.min(...succs.map(s => nodes.get(s)!.late_start));
        }
        node.late_start = node.late_finish - node.duration;
    }

    // Compute slack and critical path
    for (const node of nodes.values()) {
        node.slack = node.late_start - node.early_start;
        node.is_critical = Math.abs(node.slack) < 0.001;
    }

    return nodes;
}

// --- Main entry point ---

export async function getGanttData(filters: GanttFilters = {}): Promise<{
    tasks: GanttTask[];
    total_duration_hours: number;
    total_workers: number;
    daily_capacity_hours: number;
    broken_edges: { from: number; to: number }[];
}> {
    // 1. Fetch all non-done tasks
    let taskSql = `
        SELECT t.id, t.title, t.status, t.priority, t.category,
               t.ship_id, s.name as ship_name,
               t.estimated_hours, t.actual_hours, t.deadline, t.planned_start,
               t.split_group_id, t.weather_dependent,
               t.weather_min_temp, t.weather_max_wind, t.weather_no_rain
        FROM tasks t
        LEFT JOIN ships s ON s.id = t.ship_id
        WHERE t.status != 'done'
    `;
    const taskParams: (string | number | null)[] = [];

    if (filters.ship_id) {
        taskSql += ' AND t.ship_id = ?';
        taskParams.push(filters.ship_id);
    }
    if (filters.assignee_id) {
        taskSql += ' AND t.id IN (SELECT task_id FROM task_assignments WHERE user_id = ?)';
        taskParams.push(filters.assignee_id);
    }

    taskSql += ' ORDER BY t.id';

    const taskRows = await queryAll<TaskRow>(taskSql, taskParams);

    if (taskRows.length === 0) {
        return { tasks: [], total_duration_hours: 0, total_workers: 0, daily_capacity_hours: 0, broken_edges: [] };
    }

    // Count active workers for resource capacity
    const workerCount = await queryOne<{ cnt: number }>(
        "SELECT COUNT(*) as cnt FROM users WHERE is_active = 1 AND role = 'worker'",
        [],
    );
    const adminCount = await queryOne<{ cnt: number }>(
        "SELECT COUNT(*) as cnt FROM users WHERE is_active = 1 AND role = 'admin'",
        [],
    );
    // Total workforce = workers + admins (admin also works)
    const totalWorkers = Math.max(1, (workerCount?.cnt ?? 0) + (adminCount?.cnt ?? 0));

    const taskIds = taskRows.map(r => r.id);
    const taskMap = new Map<number, TaskRow>(taskRows.map(r => [r.id, r]));

    // 2. Fetch all dependencies
    const allDeps = await queryAll<DepRow>(
        'SELECT task_id, depends_on_id FROM task_dependencies',
        [],
    );

    const relevantDeps = allDeps.filter(
        d => taskMap.has(d.task_id) && taskMap.has(d.depends_on_id),
    );

    // 3. Fetch assignees
    const placeholders = taskIds.map(() => '?').join(',');
    const assigneeRows = await queryAll<AssigneeRow>(
        `SELECT ta.task_id, ta.user_id, u.name as user_name
         FROM task_assignments ta
         JOIN users u ON u.id = ta.user_id
         WHERE ta.task_id IN (${placeholders})`,
        taskIds,
    );

    const assigneeMap = new Map<number, { id: number; name: string }[]>();
    for (const row of assigneeRows) {
        if (!assigneeMap.has(row.task_id)) {
            assigneeMap.set(row.task_id, []);
        }
        assigneeMap.get(row.task_id)!.push({ id: row.user_id, name: row.user_name });
    }

    // 4. Build DAG and schedule with resource constraints
    const dag = await buildDAG(taskIds, relevantDeps);
    const { sorted: topoOrder, brokenEdges } = await topologicalSort(dag);

    const durations = new Map<number, number>();
    const priorities = new Map<number, string>();
    const plannedStarts = new Map<number, number>();
    // Use local date parsing to avoid UTC midnight timezone shift
    const now = new Date();
    const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayMs = todayLocal.getTime();

    for (const row of taskRows) {
        durations.set(row.id, row.estimated_hours ?? HOURS_PER_DAY);
        priorities.set(row.id, row.priority);
        if (row.planned_start) {
            // Parse as LOCAL date (not UTC) to match todayMs
            const parts = row.planned_start.split('-');
            const psLocal = new Date(+parts[0], +parts[1] - 1, +parts[2]);
            const dayOffset = Math.round((psLocal.getTime() - todayMs) / (1000 * 60 * 60 * 24));
            plannedStarts.set(row.id, Math.max(0, dayOffset) * HOURS_PER_DAY);
        }
    }

    // Build assignee ID map for per-person scheduling
    const taskAssigneeIds = new Map<number, number[]>();
    for (const [taskId, assignees] of assigneeMap) {
        taskAssigneeIds.set(taskId, assignees.map(a => a.id));
    }

    const cpmNodes = await resourceConstrainedSchedule(
        dag, topoOrder, durations, priorities, totalWorkers, taskAssigneeIds, plannedStarts,
    );

    // 5. Auto-pin planned_start for tasks that don't have one yet
    //    This prevents tasks from drifting each day (offset-based → absolute date)
    for (const id of topoOrder) {
        const row = taskMap.get(id)!;
        if (row.planned_start) continue; // already pinned
        const cpm = cpmNodes.get(id)!;
        const startDay = Math.floor(cpm.early_start / HOURS_PER_DAY);
        const pinnedDate = new Date(todayLocal);
        pinnedDate.setDate(pinnedDate.getDate() + startDay);
        const y = pinnedDate.getFullYear();
        const m = String(pinnedDate.getMonth() + 1).padStart(2, '0');
        const d = String(pinnedDate.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;
        await execute('UPDATE tasks SET planned_start = ? WHERE id = ?', [dateStr, id]);
        // Update local row so the response reflects the pinned date
        row.planned_start = dateStr;
    }

    // 6. Assemble result
    let totalDuration = 0;
    for (const node of cpmNodes.values()) {
        if (node.early_finish > totalDuration) {
            totalDuration = node.early_finish;
        }
    }

    const depMap = new Map<number, number[]>();
    for (const dep of relevantDeps) {
        if (!depMap.has(dep.task_id)) {
            depMap.set(dep.task_id, []);
        }
        depMap.get(dep.task_id)!.push(dep.depends_on_id);
    }

    const ganttTasks: GanttTask[] = topoOrder.map(id => {
        const row = taskMap.get(id)!;
        const cpm = cpmNodes.get(id)!;

        return {
            id: row.id,
            title: row.title,
            status: row.status,
            priority: row.priority,
            category: row.category,
            ship_id: row.ship_id,
            ship_name: row.ship_name,
            estimated_hours: row.estimated_hours ?? HOURS_PER_DAY,
            actual_hours: row.actual_hours,
            deadline: row.deadline,
            planned_start: row.planned_start,
            split_group_id: row.split_group_id,
            weather_dependent: !!row.weather_dependent,
            weather_min_temp: row.weather_min_temp,
            weather_max_wind: row.weather_max_wind,
            weather_no_rain: !!row.weather_no_rain,
            assignees: assigneeMap.get(id) ?? [],
            dependencies: depMap.get(id) ?? [],
            early_start: cpm.early_start,
            early_finish: cpm.early_finish,
            late_start: cpm.late_start,
            late_finish: cpm.late_finish,
            slack: cpm.slack,
            is_critical: cpm.is_critical,
        };
    });

    return {
        tasks: ganttTasks,
        total_duration_hours: totalDuration,
        total_workers: totalWorkers,
        daily_capacity_hours: totalWorkers * HOURS_PER_DAY,
        broken_edges: brokenEdges,
    };
}

