import { z } from 'zod';

// --- Auth schemas ---

export const loginSchema = z.object({
    email: z.string().email('Nieprawidłowy adres email'),
    password: z.string().min(1, 'Hasło jest wymagane'),
});

export const registerSchema = z.object({
    email: z.string().email('Nieprawidłowy adres email'),
    password: z
        .string()
        .min(8, 'Hasło musi mieć min. 8 znaków')
        .max(128, 'Hasło może mieć max. 128 znaków'),
    name: z
        .string()
        .min(2, 'Imię musi mieć min. 2 znaki')
        .max(100, 'Imię może mieć max. 100 znaków'),
    role: z.enum(['admin', 'worker'], {
        errorMap: () => ({ message: "Rola musi być 'admin' lub 'worker'" }),
    }),
});

// --- Task schemas ---

const taskCategories = z.enum([
    'spawanie', 'malowanie', 'mechanika_silnikowa',
    'elektryka', 'hydraulika', 'stolarka',
    'inspekcja', 'logistyka', 'rejs_probny', 'inne',
]);

const taskStatuses = z.enum(['todo', 'in_progress', 'blocked', 'done']);
const taskPriorities = z.enum(['critical', 'high', 'normal', 'low']);
const taskShipScopes = z.enum(['single', 'both', 'infrastructure']);

export const createTaskSchema = z.object({
    title: z.string().min(3, 'Tytuł musi mieć min. 3 znaki').max(200, 'Tytuł max. 200 znaków'),
    description: z.string().max(5000, 'Opis max. 5000 znaków').optional(),
    ship_id: z.number().int().positive().optional().nullable(),
    ship_scope: taskShipScopes.optional().nullable(),
    category: taskCategories,
    priority: taskPriorities.default('normal'),
    estimated_hours: z.number().positive('Godziny muszą być > 0').optional().nullable(),
    estimated_cost: z.number().min(0).optional().nullable(),
    deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Format daty: YYYY-MM-DD').optional().nullable(),
    weather_dependent: z.boolean().default(false),
    weather_min_temp: z.number().optional().nullable(),
    weather_max_humidity: z.number().min(0).max(100).optional().nullable(),
    weather_max_wind: z.number().min(0).optional().nullable(),
    weather_no_rain: z.boolean().default(false),
    logistics_notes: z.string().max(2000).optional().nullable(),
    assignee_ids: z.array(z.number().int().positive()).optional(),
    dependency_ids: z.array(z.number().int().positive()).optional(),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
    status: taskStatuses.optional(),
    blocked_reason: z.string().max(500).optional().nullable(),
    planned_start: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Format daty: YYYY-MM-DD').optional().nullable(),
});

export const changeStatusSchema = z.object({
    status: taskStatuses,
    blocked_reason: z.string().max(500).optional().nullable(),
});

export const splitTaskSchema = z.object({
    split_after_hours: z.number().positive('Godziny muszą być > 0'),
});

export const logTimeSchema = z.object({
    hours: z.number().positive('Godziny muszą być > 0').max(24, 'Max. 24h na wpis'),
    note: z.string().max(500).optional(),
});

export const taskQuerySchema = z.object({
    status: taskStatuses.optional(),
    ship_id: z.coerce.number().int().positive().optional(),
    priority: taskPriorities.optional(),
    category: taskCategories.optional(),
    assignee_id: z.coerce.number().int().positive().optional(),
    is_report: z.coerce.number().int().min(0).max(1).optional(),
    search: z.string().max(200).optional(),
});

// --- AI schemas ---

export const aiChatSchema = z.object({
    message: z.string().min(1, 'Wiadomość jest wymagana').max(2000, 'Wiadomość max. 2000 znaków'),
    conversation_id: z.number().int().positive().optional().nullable(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;
export type LogTimeInput = z.infer<typeof logTimeSchema>;
export type TaskQueryInput = z.infer<typeof taskQuerySchema>;
export type AiChatInput = z.infer<typeof aiChatSchema>;
