const API_BASE = import.meta.env.VITE_API_URL || '/api';

interface FetchOptions extends RequestInit {
    token?: string;
}

class ApiError extends Error {
    status: number;
    data: unknown;

    constructor(status: number, message: string, data?: unknown) {
        super(message);
        this.status = status;
        this.data = data;
    }
}

async function request<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
    const { token, ...fetchOptions } = options;

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(fetchOptions.headers as Record<string, string> || {}),
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
        ...fetchOptions,
        headers,
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
        throw new ApiError(
            res.status,
            data?.error || `HTTP ${res.status}`,
            data,
        );
    }

    return data as T;
}

// --- Auth API ---
export const authApi = {
    login: (email: string, password: string) =>
        request<{ token: string; user: User }>('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        }),

    me: (token: string) =>
        request<{ user: User }>('/auth/me', { token }),

    listUsers: (token: string) =>
        request<{ users: User[] }>('/auth/users', { token }),

    register: (token: string, data: { email: string; password: string; name: string; role: string }) =>
        request<{ user: User }>('/auth/register', {
            token,
            method: 'POST',
            body: JSON.stringify(data),
        }),

    toggleActive: (token: string, userId: number, isActive: boolean) =>
        request<{ user: User }>(`/auth/users/${userId}/active`, {
            token,
            method: 'PATCH',
            body: JSON.stringify({ is_active: isActive }),
        }),

    changePassword: (token: string, userId: number, newPassword: string) =>
        request<{ ok: boolean }>(`/auth/users/${userId}/password`, {
            token,
            method: 'PATCH',
            body: JSON.stringify({ new_password: newPassword }),
        }),

    deleteUser: (token: string, userId: number) =>
        request<{ deleted: boolean }>(`/auth/users/${userId}`, {
            token,
            method: 'DELETE',
        }),
};

// --- Tasks API ---
export const tasksApi = {
    list: (token: string, filters?: Record<string, string>) => {
        const params = filters ? '?' + new URLSearchParams(filters).toString() : '';
        return request<{ tasks: TaskSummary[] }>(`/tasks${params}`, { token });
    },

    get: (token: string, id: number) =>
        request<{ task: TaskDetail }>(`/tasks/${id}`, { token }),

    today: (token: string) =>
        request<{ tasks: TaskSummary[] }>('/tasks/today', { token }),

    my: (token: string) =>
        request<{ tasks: TaskSummary[] }>('/tasks/my', { token }),

    create: (token: string, data: Record<string, unknown>) =>
        request<{ task: TaskDetail }>('/tasks', {
            token,
            method: 'POST',
            body: JSON.stringify(data),
        }),

    update: (token: string, id: number, data: Record<string, unknown>) =>
        request<{ task: TaskDetail }>(`/tasks/${id}`, {
            token,
            method: 'PUT',
            body: JSON.stringify(data),
        }),

    remove: (token: string, id: number) =>
        request<void>(`/tasks/${id}`, {
            token,
            method: 'DELETE',
        }),

    changeStatus: (token: string, id: number, status: string, blocked_reason?: string) =>
        request<{ task: TaskDetail }>(`/tasks/${id}/status`, {
            token,
            method: 'PATCH',
            body: JSON.stringify({ status, blocked_reason }),
        }),

    logTime: (token: string, id: number, hours: number, note?: string) =>
        request<{ time_log: TimeLog }>(`/tasks/${id}/time`, {
            token,
            method: 'POST',
            body: JSON.stringify({ hours, note }),
        }),

    gantt: (token: string, filters?: Record<string, string>) => {
        const params = filters ? '?' + new URLSearchParams(filters).toString() : '';
        return request<{ tasks: GanttTask[]; total_duration_hours: number; total_workers: number; daily_capacity_hours: number; broken_edges: { from: number; to: number }[] }>(`/tasks/gantt${params}`, { token });
    },

    split: (token: string, id: number, splitAfterHours: number) =>
        request<{ part1: TaskDetail; part2: TaskDetail }>(`/tasks/${id}/split`, {
            token,
            method: 'POST',
            body: JSON.stringify({ split_after_hours: splitAfterHours }),
        }),

    merge: (token: string, splitGroupId: number) =>
        request<{ task: TaskDetail }>(`/tasks/merge/${splitGroupId}`, {
            token,
            method: 'POST',
        }),
};

// --- Inventory API ---
export const inventoryApi = {
    list: (token: string, filters?: Record<string, string>) => {
        const params = filters ? '?' + new URLSearchParams(filters).toString() : '';
        return request<{ items: InventoryItem[] }>(`/inventory${params}`, { token });
    },

    get: (token: string, id: number) =>
        request<{ item: InventoryItem }>(`/inventory/${id}`, { token }),

    lowStock: (token: string) =>
        request<{ items: InventoryItem[] }>('/inventory/low-stock', { token }),

    shoppingList: (token: string) =>
        request<{ items: ShoppingListItem[] }>('/inventory/shopping-list', { token }),

    create: (token: string, data: Record<string, unknown>) =>
        request<{ item: InventoryItem }>('/inventory', {
            token, method: 'POST', body: JSON.stringify(data),
        }),

    update: (token: string, id: number, data: Record<string, unknown>) =>
        request<{ item: InventoryItem }>(`/inventory/${id}`, {
            token, method: 'PUT', body: JSON.stringify(data),
        }),

    remove: (token: string, id: number) =>
        request<void>(`/inventory/${id}`, { token, method: 'DELETE' }),

    adjustQuantity: (token: string, id: number, delta: number) =>
        request<{ item: InventoryItem }>(`/inventory/${id}/quantity`, {
            token, method: 'PATCH', body: JSON.stringify({ delta }),
        }),

    taskMaterials: (token: string, taskId: number) =>
        request<{ materials: TaskMaterial[] }>(`/inventory/tasks/${taskId}/materials`, { token }),

    addTaskMaterial: (token: string, taskId: number, data: Record<string, unknown>) =>
        request<{ material: TaskMaterial }>(`/inventory/tasks/${taskId}/materials`, {
            token, method: 'POST', body: JSON.stringify(data),
        }),

    removeMaterial: (token: string, id: number) =>
        request<void>(`/inventory/materials/${id}`, { token, method: 'DELETE' }),
};

// --- Attachments API ---
export interface AttachmentInfo {
    id: number;
    task_id: number;
    type: string;
    original_name: string | null;
    mime_type: string | null;
    note: string | null;
    tag: string | null;
    uploader_name: string | null;
    created_at: string;
}

export const attachmentApi = {
    list: (token: string, taskId: number) =>
        request<{ attachments: AttachmentInfo[] }>(`/attachments/tasks/${taskId}/attachments`, { token }),

    get: (token: string, id: number) =>
        request<{ attachment: AttachmentInfo & { data_base64: string } }>(`/attachments/${id}`, { token }),

    upload: (token: string, taskId: number, data: { type: string; data_base64: string; original_name?: string; mime_type?: string; note?: string; tag?: string }) =>
        request<{ attachment: AttachmentInfo }>(`/attachments/tasks/${taskId}/attachments`, {
            token, method: 'POST', body: JSON.stringify(data),
        }),

    remove: (token: string, id: number) =>
        request<void>(`/attachments/${id}`, { token, method: 'DELETE' }),

    updateTag: (token: string, id: number, tag: string | null) =>
        request<{ success: boolean }>(`/attachments/${id}/tag`, { token, method: 'PATCH', body: JSON.stringify({ tag }) }),

    timeline: (token: string, shipId: number) =>
        request<{ timeline: (AttachmentInfo & { task_title: string; task_status: string })[] }>(`/attachments/timeline/${shipId}`, { token }),

    beforeAfter: (token: string, taskId: number) =>
        request<{ before: AttachmentInfo[]; after: AttachmentInfo[]; progress: AttachmentInfo[]; untagged: AttachmentInfo[] }>(`/attachments/tasks/${taskId}/before-after`, { token }),
};

// --- Config API ---
export const configApi = {
    get: (token: string, key: string) =>
        request<{ key: string; value: string }>(`/config/${key}`, { token }),

    set: (token: string, key: string, value: string) =>
        request<{ key: string; value: string }>(`/config/${key}`, {
            token, method: 'PUT', body: JSON.stringify({ value }),
        }),
};

// --- Health ---
export const healthApi = {
    check: () => request<{ status: string }>('/health'),
};

// --- Types ---
export interface User {
    id: number;
    email: string;
    name: string;
    role: 'admin' | 'worker';
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface TaskSummary {
    id: number;
    title: string;
    description: string | null;
    ship_id: number | null;
    ship_name: string | null;
    category: string;
    status: string;
    priority: string;
    estimated_hours: number | null;
    actual_hours: number;
    deadline: string | null;
    weather_dependent: boolean;
    is_report: boolean;
    created_at: string;
    updated_at: string;
}

export interface TaskDetail extends TaskSummary {
    ship_scope: string | null;
    blocked_reason: string | null;
    estimated_cost: number | null;
    actual_cost: number;
    weather_min_temp: number | null;
    weather_max_humidity: number | null;
    weather_max_wind: number | null;
    weather_no_rain: boolean;
    logistics_notes: string | null;
    created_by: number | null;
    report_approved: boolean | null;
    assignees: { id: number; name: string; email: string }[];
    dependencies: { id: number; title: string; status: string }[];
    time_logs: TimeLog[];
}

export interface TimeLog {
    id: number;
    hours: number;
    note: string | null;
    logged_at: string;
    user_name?: string;
}

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
    early_start: number;
    early_finish: number;
    late_start: number;
    late_finish: number;
    slack: number;
    is_critical: boolean;
}


// --- Ships API ---
export interface Ship {
    id: number;
    name: string;
    short_name: string;
    specs: Record<string, string | number>;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

export const shipsApi = {
    list: (token: string) =>
        request<{ ships: Ship[] }>('/ships', { token }),

    detail: (token: string, id: number) =>
        request<{ ship: Ship & { task_stats: { total: number; done: number; in_progress: number } } }>(
            `/ships/${id}`, { token },
        ),

    create: (token: string, data: { name: string; short_name: string; specs: Record<string, string | number>; notes?: string }) =>
        request<{ ship: Ship }>('/ships', { token, method: 'POST', body: JSON.stringify(data) }),

    update: (token: string, id: number, data: Partial<{ name: string; short_name: string; specs: Record<string, string | number>; notes: string | null }>) =>
        request<{ ship: Ship }>(`/ships/${id}`, { token, method: 'PUT', body: JSON.stringify(data) }),

    delete: (token: string, id: number) =>
        request<{ deleted: boolean }>(`/ships/${id}`, { token, method: 'DELETE' }),
};

// --- Inventory Types ---
export interface InventoryItem {
    id: number;
    name: string;
    category: string;
    unit: string | null;
    quantity: number;
    min_quantity: number | null;
    location: string | null;
    ship_id: number | null;
    ship_name: string | null;
    notes: string | null;
    is_low_stock: boolean;
    created_at: string;
    updated_at: string;
}

export interface TaskMaterial {
    id: number;
    task_id: number;
    inventory_id: number | null;
    name: string;
    quantity_needed: number;
    unit: string | null;
    purchased: boolean;
    notes: string | null;
    current_stock: number | null;
}

export interface ShoppingListItem {
    name: string;
    unit: string | null;
    total_needed: number;
    in_stock: number;
    to_buy: number;
    tasks: string[];
}

// --- Weather API ---
export interface DailyForecast {
    date: string;
    temp_max: number;
    temp_min: number;
    weather_code: number;
    weather_label: string;
    weather_icon: string;
    wind_speed_max: number;
    wind_gusts_max: number;
    precipitation_sum: number;
    precipitation_probability_max: number;
    is_painting_window: boolean;
    is_welding_window: boolean;
}

export interface WeatherForecast {
    location: string;
    daily: DailyForecast[];
    painting_windows: number;
    welding_windows: number;
    fetched_at: string;
}

export const weatherApi = {
    forecast: (token: string) =>
        request<WeatherForecast>('/weather/forecast', { token }),
};

// --- AI API ---
export interface AiConversation {
    id: number;
    user_id: number;
    title: string | null;
    created_at: string;
}

export interface AiMessage {
    id: number;
    conversation_id: number;
    role: 'user' | 'assistant';
    content: string;
    created_at: string;
}

export const aiApi = {
    chat: (token: string, message: string, conversation_id?: number) =>
        request<{ conversation_id: number; message: AiMessage }>('/ai/chat', {
            token,
            method: 'POST',
            body: JSON.stringify({ message, conversation_id }),
        }),

    conversations: (token: string) =>
        request<{ conversations: AiConversation[] }>('/ai/conversations', { token }),

    messages: (token: string, conversationId: number) =>
        request<{ messages: AiMessage[] }>(`/ai/conversations/${conversationId}`, { token }),

    deleteConversation: (token: string, conversationId: number) =>
        request<void>(`/ai/conversations/${conversationId}`, {
            token,
            method: 'DELETE',
        }),

    searchSupplier: (token: string, query: string) =>
        request<{ text: string }>('/ai/search-supplier', {
            token,
            method: 'POST',
            body: JSON.stringify({ query }),
        }),

    generateMaterials: (token: string, data: { title: string; category: string; ship_id?: number | null; description?: string }) =>
        request<{ materials: Array<{ name: string; quantity: number; unit: string; inventory_id: number | null; in_stock: number; to_buy: number }> }>('/ai/generate-materials', {
            token,
            method: 'POST',
            body: JSON.stringify(data),
        }),
};

// --- Certificates ---
export interface Certificate {
    id: number;
    ship_id: number | null;
    name: string;
    issuer: string | null;
    number: string | null;
    issue_date: string | null;
    expiry_date: string;
    notes: string | null;
    status: 'active' | 'expired' | 'renewed';
    ship_name: string | null;
    days_remaining?: number;
    created_at: string;
    updated_at: string;
}

export interface InspectionTemplate {
    id: number;
    name: string;
    ship_id: number | null;
    items: { label: string; required?: boolean }[];
    created_at: string;
}

export interface Inspection {
    id: number;
    template_id: number;
    ship_id: number | null;
    inspector_id: number;
    results: { label: string; ok: boolean; note?: string }[];
    date: string;
    notes: string | null;
    template_name: string;
    ship_name: string | null;
    inspector_name: string;
    created_at: string;
}

export const certificatesApi = {
    list: (token: string, filters?: { ship_id?: number; status?: string }) => {
        const params = new URLSearchParams();
        if (filters?.ship_id) params.set('ship_id', String(filters.ship_id));
        if (filters?.status) params.set('status', filters.status);
        const qs = params.toString();
        return request<{ certificates: Certificate[] }>(`/certificates${qs ? `?${qs}` : ''}`, { token });
    },

    expiring: (token: string, days?: number) =>
        request<{ certificates: Certificate[] }>(`/certificates/expiring${days ? `?days=${days}` : ''}`, { token }),

    get: (token: string, id: number) =>
        request<{ certificate: Certificate }>(`/certificates/${id}`, { token }),

    create: (token: string, data: Partial<Certificate>) =>
        request<{ certificate: Certificate }>('/certificates', { token, method: 'POST', body: JSON.stringify(data) }),

    update: (token: string, id: number, data: Partial<Certificate>) =>
        request<{ certificate: Certificate }>(`/certificates/${id}`, { token, method: 'PUT', body: JSON.stringify(data) }),

    delete: (token: string, id: number) =>
        request<{ deleted: boolean }>(`/certificates/${id}`, { token, method: 'DELETE' }),

    scan: (token: string, images: { base64: string; mimeType: string }[]) =>
        request<{ extracted: { name?: string; issuer?: string; number?: string; issue_date?: string; expiry_date?: string; notes?: string } | null; error?: string }>(
            '/certificates/scan', { token, method: 'POST', body: JSON.stringify({ images }) },
        ),
};

export const inspectionsApi = {
    templates: (token: string, shipId?: number) => {
        const qs = shipId ? `?ship_id=${shipId}` : '';
        return request<{ templates: InspectionTemplate[] }>(`/certificates/inspections/templates${qs}`, { token });
    },

    createTemplate: (token: string, data: { name: string; ship_id?: number | null; items: { label: string; required?: boolean }[] }) =>
        request<{ template: InspectionTemplate }>('/certificates/inspections/templates', { token, method: 'POST', body: JSON.stringify(data) }),

    deleteTemplate: (token: string, id: number) =>
        request<{ deleted: boolean }>(`/certificates/inspections/templates/${id}`, { token, method: 'DELETE' }),

    list: (token: string, filters?: { ship_id?: number; template_id?: number }) => {
        const params = new URLSearchParams();
        if (filters?.ship_id) params.set('ship_id', String(filters.ship_id));
        if (filters?.template_id) params.set('template_id', String(filters.template_id));
        const qs = params.toString();
        return request<{ inspections: Inspection[] }>(`/certificates/inspections${qs ? `?${qs}` : ''}`, { token });
    },

    create: (token: string, data: { template_id: number; ship_id?: number; results: { label: string; ok: boolean; note?: string }[]; notes?: string }) =>
        request<{ inspection: Inspection }>('/certificates/inspections', { token, method: 'POST', body: JSON.stringify(data) }),
};

// --- Equipment ---
export interface Equipment {
    id: number;
    name: string;
    type: string;
    ship_id: number | null;
    model: string | null;
    serial_number: string | null;
    location: string | null;
    notes: string | null;
    ship_name: string | null;
    created_at: string;
    updated_at: string;
}

export interface InstructionStep {
    id: number;
    instruction_id: number;
    step_number: number;
    text: string;
    image_base64: string | null;
    created_at: string;
}

export interface Instruction {
    id: number;
    title: string;
    equipment_id: number | null;
    description: string | null;
    equipment_name: string | null;
    author_name: string | null;
    step_count: number;
    steps?: InstructionStep[];
    created_at: string;
    updated_at: string;
}

export const equipmentApi = {
    list: (token: string, filters?: { ship_id?: number; type?: string }) => {
        const params = new URLSearchParams();
        if (filters?.ship_id) params.set('ship_id', String(filters.ship_id));
        if (filters?.type) params.set('type', filters.type);
        const qs = params.toString();
        return request<{ equipment: Equipment[] }>(`/equipment${qs ? `?${qs}` : ''}`, { token });
    },

    get: (token: string, id: number) =>
        request<{ equipment: Equipment; instructions: Instruction[] }>(`/equipment/${id}`, { token }),

    create: (token: string, data: Partial<Equipment>) =>
        request<{ equipment: Equipment }>('/equipment', { token, method: 'POST', body: JSON.stringify(data) }),

    update: (token: string, id: number, data: Partial<Equipment>) =>
        request<{ equipment: Equipment }>(`/equipment/${id}`, { token, method: 'PUT', body: JSON.stringify(data) }),

    delete: (token: string, id: number) =>
        request<{ deleted: boolean }>(`/equipment/${id}`, { token, method: 'DELETE' }),

    qr: (token: string, id: number) =>
        request<{ qr_svg: string; qr_data_url: string; url: string; equipment_name: string }>(`/equipment/qr/${id}`, { token }),
};

export const instructionsApi = {
    list: (token: string, equipmentId?: number) => {
        const qs = equipmentId ? `?equipment_id=${equipmentId}` : '';
        return request<{ instructions: Instruction[] }>(`/equipment/instructions/list${qs}`, { token });
    },

    get: (token: string, id: number) =>
        request<{ instruction: Instruction & { steps: InstructionStep[] } }>(`/equipment/instructions/${id}`, { token }),

    create: (token: string, data: { title: string; equipment_id?: number | null; description?: string; steps: { text: string; image_base64?: string }[] }) =>
        request<{ instruction: Instruction }>('/equipment/instructions', { token, method: 'POST', body: JSON.stringify(data) }),

    aiFormat: (token: string, text: string, equipmentName?: string) =>
        request<{ formatted: { title: string; description: string; steps: { text: string }[] } | null; error?: string }>(
            '/equipment/instructions/ai-format', { token, method: 'POST', body: JSON.stringify({ text, equipment_name: equipmentName }) }),

    delete: (token: string, id: number) =>
        request<{ deleted: boolean }>(`/equipment/instructions/${id}`, { token, method: 'DELETE' }),
};

// --- Suppliers ---
export interface Supplier {
    id: number;
    name: string;
    contact_person: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    categories: string[];
    notes: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface SupplierDetail extends Supplier {
    inventory_links: SupplierInventoryLink[];
}

export interface SupplierInventoryLink {
    id: number;
    supplier_id: number;
    inventory_id: number;
    inventory_name: string;
    inventory_category: string;
    unit_price: number | null;
    currency: string;
    notes: string | null;
}

export interface SupplierShoppingGroup {
    supplier_id: number;
    supplier_name: string;
    city: string | null;
    address: string | null;
    phone: string | null;
    items: {
        name: string;
        unit: string | null;
        to_buy: number;
        unit_price: number | null;
        estimated_cost: number | null;
        tasks: string[];
    }[];
    total_estimated_cost: number;
}

export const suppliersApi = {
    list: (token: string, filters?: Record<string, string>) => {
        const params = filters ? '?' + new URLSearchParams(filters).toString() : '';
        return request<{ suppliers: Supplier[] }>(`/suppliers${params}`, { token });
    },

    get: (token: string, id: number) =>
        request<{ supplier: SupplierDetail }>(`/suppliers/${id}`, { token }),

    create: (token: string, data: Record<string, unknown>) =>
        request<{ supplier: Supplier }>('/suppliers', {
            token, method: 'POST', body: JSON.stringify(data),
        }),

    update: (token: string, id: number, data: Record<string, unknown>) =>
        request<{ supplier: Supplier }>(`/suppliers/${id}`, {
            token, method: 'PUT', body: JSON.stringify(data),
        }),

    remove: (token: string, id: number) =>
        request<void>(`/suppliers/${id}`, { token, method: 'DELETE' }),

    linkInventory: (token: string, supplierId: number, data: { inventory_id: number; unit_price?: number; notes?: string }) =>
        request<{ link: SupplierInventoryLink }>(`/suppliers/${supplierId}/inventory`, {
            token, method: 'POST', body: JSON.stringify(data),
        }),

    unlinkInventory: (token: string, linkId: number) =>
        request<void>(`/suppliers/inventory/${linkId}`, { token, method: 'DELETE' }),

    shoppingList: (token: string) =>
        request<{ groups: SupplierShoppingGroup[] }>('/suppliers/shopping-list', { token }),
};

// --- Budget API ---
export interface SeasonSummary {
    budget: number;
    hourly_rate: number;
    total_estimated: number;
    total_actual_cost: number;
    total_material_cost: number;
    total_labor_cost: number;
    total_expenses: number;
    total_spent: number;
    remaining: number;
    percent_used: number;
    task_count: number;
    done_count: number;
}

export interface ShipCost {
    ship_id: number | null;
    ship_name: string;
    task_count: number;
    estimated_cost: number;
    actual_cost: number;
    material_cost: number;
    labor_cost: number;
    total_actual: number;
}

export interface CategoryCost {
    category: string;
    task_count: number;
    estimated_cost: number;
    actual_cost: number;
    material_cost: number;
    labor_cost: number;
    total_actual: number;
}

export interface MonthlyEntry {
    month: string;
    material_cost: number;
    labor_cost: number;
    total: number;
}

export const budgetApi = {
    summary: (token: string) =>
        request<SeasonSummary>('/budget/summary', { token }),

    byShip: (token: string) =>
        request<{ costs: ShipCost[] }>('/budget/by-ship', { token }),

    byCategory: (token: string) =>
        request<{ costs: CategoryCost[] }>('/budget/by-category', { token }),

    monthly: (token: string) =>
        request<{ trend: MonthlyEntry[] }>('/budget/monthly', { token }),

    taskCosts: (token: string, taskId: number) =>
        request<{ id: number; title: string; estimated_cost: number; material_cost: number; labor_cost: number; total_actual: number }>(`/budget/tasks/${taskId}`, { token }),

    updateConfig: (token: string, data: { season_budget?: number; hourly_rate?: number }) =>
        request<SeasonSummary>('/budget/config', {
            token,
            method: 'PUT',
            body: JSON.stringify(data),
        }),

    listExpenses: (token: string) =>
        request<{ expenses: Expense[] }>('/budget/expenses', { token }),

    createExpense: (token: string, data: { description: string; amount: number; category?: string; ship_id?: number | null; date?: string; notes?: string }) =>
        request<{ expense: Expense }>('/budget/expenses', {
            token,
            method: 'POST',
            body: JSON.stringify(data),
        }),

    deleteExpense: (token: string, id: number) =>
        request<{ deleted: boolean }>(`/budget/expenses/${id}`, { token, method: 'DELETE' }),
};

export interface Expense {
    id: number;
    description: string;
    amount: number;
    category: string;
    ship_id: number | null;
    ship_name: string | null;
    date: string;
    notes: string | null;
    created_by: number | null;
    created_by_name: string | null;
    created_at: string;
}

// ===== WATER LEVEL =====

export interface WaterLevelData {
    station_id: string;
    station_name: string;
    river: string;
    water_level: number | null;
    water_level_date: string | null;
    water_temp: number | null;
    water_temp_date: string | null;
    ice_phenomenon: number;
    fetched_at: string;
}

export interface WaterLevelAlert {
    level: 'ok' | 'warning' | 'danger';
    message: string;
    ship_name?: string;
}

export interface WaterLevelResponse {
    data: WaterLevelData;
    alerts: WaterLevelAlert[];
}

export const waterLevelApi = {
    get: (token: string) =>
        request<WaterLevelResponse>('/water-level', { token }),
};

// ===== ENGINE HOURS =====

export interface EngineHoursEntry {
    id: number;
    equipment_id: number;
    equipment_name: string;
    equipment_type: string;
    ship_name: string | null;
    current_hours: number;
    last_updated: string;
}

export interface ServiceInterval {
    id: number;
    equipment_id: number;
    equipment_name: string;
    name: string;
    interval_hours: number;
    last_service_hours: number;
    last_service_date: string | null;
    notes: string | null;
    hours_since_service: number;
    hours_until_due: number;
    is_overdue: boolean;
    is_due_soon: boolean;
}

export interface ServiceAlert {
    level: 'overdue' | 'due_soon';
    equipment_name: string;
    service_name: string;
    hours_since: number;
    interval_hours: number;
    message: string;
}

export interface ServiceLog {
    id: number;
    interval_id: number;
    interval_name: string;
    equipment_id: number;
    equipment_name: string;
    hours_at_service: number;
    performed_by: number | null;
    performer_name: string | null;
    notes: string | null;
    created_at: string;
}

export const engineHoursApi = {
    list: (token: string) =>
        request<{ engine_hours: EngineHoursEntry[] }>('/engine-hours', { token }),
    create: (token: string, data: { equipment_id: number; initial_hours?: number }) =>
        request<EngineHoursEntry>('/engine-hours', { token, method: 'POST', body: JSON.stringify(data) }),
    update: (token: string, equipmentId: number, hours: number) =>
        request<EngineHoursEntry>(`/engine-hours/${equipmentId}`, { token, method: 'PUT', body: JSON.stringify({ hours }) }),
    addHours: (token: string, equipmentId: number, hours: number) =>
        request<EngineHoursEntry>(`/engine-hours/${equipmentId}/add`, { token, method: 'POST', body: JSON.stringify({ hours }) }),
    intervals: (token: string, equipmentId?: number) =>
        request<{ intervals: ServiceInterval[] }>(`/engine-hours/service-intervals${equipmentId ? `?equipment_id=${equipmentId}` : ''}`, { token }),
    createInterval: (token: string, data: { equipment_id: number; name: string; interval_hours: number; notes?: string }) =>
        request<ServiceInterval>('/engine-hours/service-intervals', { token, method: 'POST', body: JSON.stringify(data) }),
    alerts: (token: string) =>
        request<{ alerts: ServiceAlert[] }>('/engine-hours/service-alerts', { token }),
    logs: (token: string, equipmentId?: number) =>
        request<{ logs: ServiceLog[] }>(`/engine-hours/service-logs${equipmentId ? `?equipment_id=${equipmentId}` : ''}`, { token }),
    logService: (token: string, data: { interval_id: number; notes?: string }) =>
        request<ServiceLog>('/engine-hours/service-logs', { token, method: 'POST', body: JSON.stringify(data) }),
};

// ===== TANKS =====

export interface Tank {
    id: number;
    ship_id: number;
    ship_name: string;
    type: 'fuel' | 'fresh_water' | 'waste_water';
    name: string;
    capacity: number;
    current_level: number;
    alert_threshold: number;
    unit: string;
    percent: number;
    is_low: boolean;
    is_high: boolean;
    updated_at: string;
}

export interface TankLog {
    id: number;
    tank_id: number;
    tank_name: string;
    change_amount: number;
    level_after: number;
    log_type: 'refill' | 'consumption' | 'drain' | 'manual';
    route_info: string | null;
    notes: string | null;
    logged_by: number | null;
    logger_name: string | null;
    created_at: string;
}

export interface TankAlert {
    level: 'warning' | 'danger';
    tank_name: string;
    ship_name: string;
    tank_type: string;
    message: string;
}

export const tanksApi = {
    list: (token: string, shipId?: number, type?: string) => {
        const params = new URLSearchParams();
        if (shipId) params.set('ship_id', String(shipId));
        if (type) params.set('type', type);
        const qs = params.toString();
        return request<{ tanks: Tank[] }>(`/tanks${qs ? '?' + qs : ''}`, { token });
    },
    get: (token: string, id: number) =>
        request<Tank>(`/tanks/${id}`, { token }),
    create: (token: string, data: { ship_id: number; type: string; name: string; capacity: number; current_level?: number }) =>
        request<Tank>('/tanks', { token, method: 'POST', body: JSON.stringify(data) }),
    update: (token: string, id: number, data: Partial<{ name: string; capacity: number; current_level: number; alert_threshold: number }>) =>
        request<Tank>(`/tanks/${id}`, { token, method: 'PUT', body: JSON.stringify(data) }),
    logChange: (token: string, tankId: number, data: { change_amount: number; log_type: string; route_info?: string; notes?: string }) =>
        request<TankLog>(`/tanks/${tankId}/log`, { token, method: 'POST', body: JSON.stringify(data) }),
    getLogs: (token: string, tankId: number) =>
        request<{ logs: TankLog[] }>(`/tanks/${tankId}/logs`, { token }),
    alerts: (token: string) =>
        request<{ alerts: TankAlert[] }>('/tanks/alerts', { token }),
    stats: (token: string, tankId: number) =>
        request<{ total_consumed: number; avg_per_trip: number; trips_count: number }>(`/tanks/${tankId}/stats`, { token }),
};

// --- API Keys Management ---

export interface ApiKeyStatus {
    id: number;
    masked_key: string;
    label: string;
    is_active: boolean;
    total_requests: number;
    total_errors: number;
    cooldown_until: string | null;
    last_used: string | null;
    created_at: string;
    is_available: boolean;
}

export const apiKeysApi = {
    list: (token: string) =>
        request<{ keys: ApiKeyStatus[] }>('/api-keys', { token }),
    add: (token: string, api_key: string, label: string) =>
        request<{ key: ApiKeyStatus }>('/api-keys', { token, method: 'POST', body: JSON.stringify({ api_key, label }) }),
    remove: (token: string, id: number) =>
        request<void>(`/api-keys/${id}`, { token, method: 'DELETE' }),
    toggle: (token: string, id: number, active: boolean) =>
        request<{ success: boolean }>(`/api-keys/${id}/toggle`, { token, method: 'PATCH', body: JSON.stringify({ active }) }),
    clearCooldown: (token: string, id: number) =>
        request<{ success: boolean }>(`/api-keys/${id}/clear-cooldown`, { token, method: 'POST' }),
};

export { ApiError };
