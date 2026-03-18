// ============================================================
// Shared Types — Tramwaje Wodne
// Used by both client and server
//
// ⚠️ WAŻNE: SQLite przechowuje boolean jako INTEGER (0/1).
// Warstwa mapowania w route handlerach MUSI konwertować:
//   row.is_active → Boolean(row.is_active)
//   row.weather_dependent → Boolean(row.weather_dependent)
//   row.weather_no_rain → Boolean(row.weather_no_rain)
//   row.is_report → Boolean(row.is_report)
//   row.report_approved → row.report_approved === null ? null : Boolean(row.report_approved)
//   row.purchased → Boolean(row.purchased)
// ============================================================

// --- Roles ---
export type UserRole = 'admin' | 'worker';

// --- Users ---
export interface User {
    id: number;
    email: string;
    name: string;
    role: UserRole;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface LoginRequest {
    email: string;
    password: string;
}

export interface LoginResponse {
    token: string;
    user: User;
}

export interface RegisterRequest {
    email: string;
    password: string;
    name: string;
    role: UserRole;
}

// --- Ships ---
export interface ShipSpecs {
    length_m: number;
    width_m: number;
    height_m?: number;
    draft_m?: number;
    engine: string;
    generator?: string;
    fuel_capacity_l?: number;
    construction: string;
    wintering: string;
    route: string;
    capacity_indoor?: number;
    capacity_outdoor?: number;
}

export interface Ship {
    id: number;
    name: string;
    short_name: string;
    specs: ShipSpecs;
    created_at: string;
    updated_at: string;
}

// --- Tasks ---
export type TaskCategory =
    | 'spawanie'
    | 'malowanie'
    | 'mechanika_silnikowa'
    | 'elektryka'
    | 'hydraulika'
    | 'stolarka'
    | 'inspekcja'
    | 'logistyka'
    | 'rejs_probny'
    | 'inne';

export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done';
export type TaskPriority = 'critical' | 'high' | 'normal' | 'low';
export type ShipScope = 'single' | 'both' | 'infrastructure';

export interface Task {
    id: number;
    title: string;
    description: string | null;
    ship_id: number | null;
    ship_scope: ShipScope | null;
    category: TaskCategory;
    status: TaskStatus;
    blocked_reason: string | null;
    priority: TaskPriority;
    estimated_hours: number | null;
    actual_hours: number;
    estimated_cost: number | null;
    actual_cost: number;
    deadline: string | null;
    weather_dependent: boolean;
    weather_min_temp: number | null;
    weather_max_humidity: number | null;
    weather_max_wind: number | null;
    weather_no_rain: boolean;
    logistics_notes: string | null;
    created_by: number | null;
    is_report: boolean;
    report_approved: boolean | null;
    created_at: string;
    updated_at: string;
    // Joined fields (optional)
    assignments?: User[];
    dependencies?: number[];
    materials?: TaskMaterial[];
    attachments?: Attachment[];
}

export interface CreateTaskRequest {
    title: string;
    description?: string;
    ship_id?: number;
    ship_scope?: ShipScope;
    category: TaskCategory;
    priority?: TaskPriority;
    estimated_hours?: number;
    estimated_cost?: number;
    deadline?: string;
    weather_dependent?: boolean;
    weather_min_temp?: number;
    weather_max_humidity?: number;
    weather_max_wind?: number;
    weather_no_rain?: boolean;
    logistics_notes?: string;
    assignee_ids?: number[];
    dependency_ids?: number[];
}

// --- Task Materials ---
export interface TaskMaterial {
    id: number;
    task_id: number;
    inventory_id: number | null;
    name: string;
    quantity_needed: number;
    unit: string | null;
    purchased: boolean;
    notes: string | null;
}

// --- Time Logs ---
export interface TimeLog {
    id: number;
    task_id: number;
    user_id: number;
    hours: number;
    note: string | null;
    logged_at: string;
}

// --- Attachments ---
export type AttachmentType = 'photo' | 'voice_note' | 'document';

export interface Attachment {
    id: number;
    task_id: number;
    type: AttachmentType;
    filename: string;
    original_name: string | null;
    mime_type: string | null;
    note: string | null;
    uploaded_by: number | null;
    created_at: string;
}

// --- Inventory ---
export type InventoryCategory = 'tool' | 'material' | 'part';

export interface InventoryItem {
    id: number;
    name: string;
    category: InventoryCategory;
    unit: string | null;
    quantity: number;
    min_quantity: number | null;
    location: string | null;
    ship_id: number | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

// --- Shopping List ---
export interface ShoppingListItem {
    name: string;
    total_needed: number;
    in_stock: number;
    to_buy: number;
    unit: string | null;
    tasks: string[]; // task titles that need this item
}

// --- Weather ---
export interface WeatherDay {
    date: string;
    temp_min: number;
    temp_max: number;
    humidity: number;
    wind_speed: number;
    rain: boolean;
    description: string;
    icon: string;
    // Computed work windows
    good_for_painting: boolean;
    good_for_welding: boolean;
}

export interface WeatherForecast {
    location: string;
    days: WeatherDay[];
    fetched_at: string;
}

// --- AI ---
export interface AIChatMessage {
    id: number;
    conversation_id: number;
    role: 'user' | 'assistant';
    content: string;
    metadata: string | null;
    created_at: string;
}

export interface AIConversation {
    id: number;
    user_id: number;
    title: string | null;
    created_at: string;
}

export interface AIChatRequest {
    message: string;
    conversation_id?: number;
    image_base64?: string; // for document/nameplate scanning
}

export interface AIAction {
    type: 'create_tasks' | 'update_task' | 'text';
    tasks?: CreateTaskRequest[];
    text?: string;
}

// --- Dashboard ---
export interface DashboardStats {
    days_until_season: number;
    season_start_date: string;
    tasks_by_ship: {
        ship_name: string;
        total: number;
        done: number;
        percent: number;
    }[];
    today_tasks: Task[];
    alerts: DashboardAlert[];
}

export interface DashboardAlert {
    type: 'overdue' | 'deadline_approaching' | 'weather_window' | 'pending_report' | 'low_stock';
    message: string;
    task_id?: number;
    severity: 'info' | 'warning' | 'critical';
}

// --- Reports (worker submissions) ---
export interface CreateReportRequest {
    title: string;
    description: string;
    ship_id: number;
    category?: TaskCategory;
    priority?: TaskPriority;
}

// --- Config ---
export interface AppConfig {
    season_start_date: string;
    company_name: string;
}

// --- Gantt / Scheduling ---
export interface GanttTask {
    id: number;
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
    category: TaskCategory;
    ship_id: number | null;
    ship_name: string | null;
    estimated_hours: number;
    actual_hours: number;
    deadline: string | null;
    assignees: { id: number; name: string }[];
    dependencies: number[];
    // CPM computed fields
    early_start: number;   // hours from project start
    early_finish: number;
    late_start: number;
    late_finish: number;
    slack: number;
    is_critical: boolean;
}

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

