import { Router } from 'express';
import {
    listTasks,
    getTaskById,
    createTask,
    updateTask,
    deleteTask,
    changeTaskStatus,
    logTime,
    getMyTasks,
    getTodayTasks,
    splitTask,
    mergeTasks,
} from '../services/task.service.js';
import { getGanttData } from '../services/scheduling.service.js';
import {
    createTaskSchema,
    updateTaskSchema,
    changeStatusSchema,
    logTimeSchema,
    taskQuerySchema,
    splitTaskSchema,
} from '../services/validation.js';
import { authMiddleware, roleGuard } from '../middleware/auth.js';
import { ZodError } from 'zod';

const router = Router();

// All task routes require authentication
router.use(authMiddleware);

/**
 * GET /api/tasks/gantt
 * Gantt chart data with CPM-computed scheduling
 */
router.get('/gantt', (req, res) => {
    try {
        const ship_id = req.query.ship_id ? parseInt(req.query.ship_id as string, 10) : undefined;
        const assignee_id = req.query.assignee_id ? parseInt(req.query.assignee_id as string, 10) : undefined;

        const data = getGanttData({ ship_id, assignee_id });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Wewnętrzny błąd serwera' });
    }
});

/**
 * GET /api/tasks/my
 * My assigned tasks (must be before :id route)
 */
router.get('/my', (req, res) => {
    const tasks = getMyTasks(req.user!.id);
    res.json({ tasks });
});

/**
 * GET /api/tasks/today
 * Tasks due today or overdue
 */
router.get('/today', (_req, res) => {
    const tasks = getTodayTasks();
    res.json({ tasks });
});

/**
 * GET /api/tasks
 * List all tasks with optional filters
 */
router.get('/', (req, res) => {
    try {
        const filters = taskQuerySchema.parse(req.query);
        const tasks = listTasks(filters);
        res.json({ tasks });
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({
                error: 'Błąd walidacji filtrów',
                details: error.errors.map(e => ({
                    field: e.path.join('.'),
                    message: e.message,
                })),
            });
            return;
        }
        res.status(500).json({ error: 'Wewnętrzny błąd serwera' });
    }
});

/**
 * GET /api/tasks/:id
 * Task details with assignees, dependencies, time logs
 */
router.get('/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
        res.status(400).json({ error: 'Nieprawidłowe ID zadania' });
        return;
    }

    const task = getTaskById(id);
    if (!task) {
        res.status(404).json({ error: 'Zadanie nie znalezione' });
        return;
    }

    res.json({ task });
});

/**
 * POST /api/tasks
 * 🔒 Admin only — create new task
 */
router.post('/', roleGuard('admin'), async (req, res) => {
    try {
        const input = createTaskSchema.parse(req.body);
        const task = createTask(input, req.user!.id);
        res.status(201).json({ task });
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({
                error: 'Błąd walidacji',
                details: error.errors.map(e => ({
                    field: e.path.join('.'),
                    message: e.message,
                })),
            });
            return;
        }
        if (error instanceof Error && error.message.startsWith('INVALID_ASSIGNEE:')) {
            res.status(400).json({ error: `Nieprawidłowy użytkownik: ID ${error.message.split(':')[1]}` });
            return;
        }
        if (error instanceof Error && error.message.startsWith('INVALID_DEPENDENCY:')) {
            res.status(400).json({ error: `Nieprawidłowe zadanie-zależność: ID ${error.message.split(':')[1]}` });
            return;
        }
        if (error instanceof Error && error.message.startsWith('CYCLE_WOULD_BE_CREATED:')) {
            const parts = error.message.split(':');
            res.status(400).json({ error: `Dodanie tej zależności utworzyłoby cykl (${parts[1]} → ${parts[2]})` });
            return;
        }
        res.status(500).json({ error: 'Wewnętrzny błąd serwera' });
    }
});

/**
 * PUT /api/tasks/:id
 * 🔒 Admin only — update task
 */
router.put('/:id', roleGuard('admin'), async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id) || id <= 0) {
            res.status(400).json({ error: 'Nieprawidłowe ID zadania' });
            return;
        }

        const input = updateTaskSchema.parse(req.body);
        const task = updateTask(id, input);
        if (!task) {
            res.status(404).json({ error: 'Zadanie nie znalezione' });
            return;
        }

        res.json({ task });
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({
                error: 'Błąd walidacji',
                details: error.errors.map(e => ({
                    field: e.path.join('.'),
                    message: e.message,
                })),
            });
            return;
        }
        if (error instanceof Error && error.message.startsWith('INVALID_ASSIGNEE:')) {
            res.status(400).json({ error: `Nieprawidłowy użytkownik: ID ${error.message.split(':')[1]}` });
            return;
        }
        if (error instanceof Error && error.message.startsWith('INVALID_DEPENDENCY:')) {
            res.status(400).json({ error: `Nieprawidłowe zadanie-zależność: ID ${error.message.split(':')[1]}` });
            return;
        }
        if (error instanceof Error && error.message.startsWith('CYCLE_WOULD_BE_CREATED:')) {
            const parts = error.message.split(':');
            res.status(400).json({ error: `Dodanie tej zależności utworzyłoby cykl (${parts[1]} → ${parts[2]})` });
            return;
        }
        res.status(500).json({ error: 'Wewnętrzny błąd serwera' });
    }
});

/**
 * DELETE /api/tasks/:id
 * 🔒 Admin only — delete task
 */
router.delete('/:id', roleGuard('admin'), (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
        res.status(400).json({ error: 'Nieprawidłowe ID zadania' });
        return;
    }

    const deleted = deleteTask(id);
    if (!deleted) {
        res.status(404).json({ error: 'Zadanie nie znalezione' });
        return;
    }

    res.status(204).send();
});

/**
 * POST /api/tasks/:id/split
 * 🔒 Admin only — split task into two parts
 */
router.post('/:id/split', roleGuard('admin'), (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id) || id <= 0) {
            res.status(400).json({ error: 'Nieprawidłowe ID zadania' });
            return;
        }
        const input = splitTaskSchema.parse(req.body);
        const result = splitTask(id, input.split_after_hours);
        res.json(result);
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({ error: 'Błąd walidacji', details: (error as ZodError).errors });
            return;
        }
        if (error instanceof Error && error.message === 'TASK_NOT_FOUND') {
            res.status(404).json({ error: 'Zadanie nie znalezione' });
            return;
        }
        if (error instanceof Error && error.message === 'INVALID_SPLIT_POINT') {
            res.status(400).json({ error: 'Punkt podziału musi być > 0 i < łączne godziny' });
            return;
        }
        res.status(500).json({ error: 'Wewnętrzny błąd serwera' });
    }
});

/**
 * POST /api/tasks/merge/:splitGroupId
 * 🔒 Admin only — merge split tasks back together
 */
router.post('/merge/:splitGroupId', roleGuard('admin'), (req, res) => {
    try {
        const splitGroupId = parseInt(req.params.splitGroupId, 10);
        if (isNaN(splitGroupId) || splitGroupId <= 0) {
            res.status(400).json({ error: 'Nieprawidłowe ID grupy' });
            return;
        }
        const task = mergeTasks(splitGroupId);
        res.json({ task });
    } catch (error) {
        if (error instanceof Error && error.message === 'NOTHING_TO_MERGE') {
            res.status(400).json({ error: 'Brak zadań do połączenia w tej grupie' });
            return;
        }
        res.status(500).json({ error: 'Wewnętrzny błąd serwera' });
    }
});

/**
 * PATCH /api/tasks/:id/status
 * Change task status (worker: only own tasks)
 */
router.patch('/:id/status', (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id) || id <= 0) {
            res.status(400).json({ error: 'Nieprawidłowe ID zadania' });
            return;
        }

        const input = changeStatusSchema.parse(req.body);
        const task = changeTaskStatus(id, input, req.user!.id, req.user!.role);
        if (!task) {
            res.status(404).json({ error: 'Zadanie nie znalezione' });
            return;
        }

        res.json({ task });
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({
                error: 'Błąd walidacji',
                details: error.errors.map(e => ({
                    field: e.path.join('.'),
                    message: e.message,
                })),
            });
            return;
        }
        if (error instanceof Error && error.message === 'FORBIDDEN') {
            res.status(403).json({ error: 'Brak uprawnień do zmiany statusu tego zadania' });
            return;
        }
        res.status(500).json({ error: 'Wewnętrzny błąd serwera' });
    }
});

/**
 * POST /api/tasks/:id/time
 * Log time on a task
 */
router.post('/:id/time', (req, res) => {
    try {
        const taskId = parseInt(req.params.id, 10);
        if (isNaN(taskId) || taskId <= 0) {
            res.status(400).json({ error: 'Nieprawidłowe ID zadania' });
            return;
        }

        const input = logTimeSchema.parse(req.body);
        const log = logTime(taskId, req.user!.id, req.user!.role, input);
        res.status(201).json({ time_log: log });
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({
                error: 'Błąd walidacji',
                details: error.errors.map(e => ({
                    field: e.path.join('.'),
                    message: e.message,
                })),
            });
            return;
        }
        if (error instanceof Error && error.message === 'TASK_NOT_FOUND') {
            res.status(404).json({ error: 'Zadanie nie znalezione' });
            return;
        }
        if (error instanceof Error && error.message === 'FORBIDDEN') {
            res.status(403).json({ error: 'Brak uprawnień do logowania czasu na tym zadaniu' });
            return;
        }
        res.status(500).json({ error: 'Wewnętrzny błąd serwera' });
    }
});

export default router;
