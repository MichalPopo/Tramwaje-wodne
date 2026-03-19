/**
 * API client for Tramwaje Wodne server.
 * Connects to the Express backend on Render (cloud) by default.
 * Server URL can be overridden in Settings screen.
 */
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'tw_auth_token';
const SERVER_KEY = 'tw_server_url';

// Default: production Render server (cloud)
let serverUrl = 'https://tramwaje-wodne-api.onrender.com';

export async function getServerUrl(): Promise<string> {
    const stored = await SecureStore.getItemAsync(SERVER_KEY);
    if (stored) serverUrl = stored;
    return serverUrl;
}

export async function setServerUrl(url: string): Promise<void> {
    serverUrl = url;
    await SecureStore.setItemAsync(SERVER_KEY, url);
}

export async function getToken(): Promise<string | null> {
    return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
}

// ------ HTTP helpers ------

async function request<T>(path: string, options: {
    method?: string;
    body?: unknown;
    token?: string | null;
} = {}): Promise<T> {
    const base = await getServerUrl();
    const url = `${base}/api${path}`;
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    if (options.token) {
        headers['Authorization'] = `Bearer ${options.token}`;
    }

    const res = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!res.ok) {
        const text = await res.text();
        let msg = `HTTP ${res.status}`;
        try { msg = JSON.parse(text).error || msg; } catch { /* */ }
        throw new Error(msg);
    }

    return res.json();
}

// ------ Auth ------

export interface User {
    id: number;
    name: string;
    email: string;
    role: 'admin' | 'worker';
}

export const authApi = {
    login: (email: string, password: string) =>
        request<{ token: string; user: User }>('/auth/login', {
            method: 'POST',
            body: { email, password },
        }),

    me: (token: string) =>
        request<{ user: User }>('/auth/me', { token }),
};

// ------ Tasks ------

export interface TaskSummary {
    id: number;
    title: string;
    status: string;
    priority: string;
    category: string;
    ship_id: number | null;
    ship_name: string | null;
    estimated_hours: number | null;
    logged_hours: number;
    deadline: string | null;
}

export interface GanttTask {
    id: number;
    title: string;
    early_start: number;
    early_finish: number;
    duration: number;
    estimated_hours: number | null;
    status: string;
    priority: string;
    ship_name: string | null;
}

export const tasksApi = {
    my: (token: string) =>
        request<{ tasks: TaskSummary[] }>('/tasks/my', { token }),

    get: (token: string, id: number) =>
        request<{ task: any }>(`/tasks/${id}`, { token }),

    changeStatus: (token: string, id: number, status: string, blocked_reason?: string) =>
        request<{ task: any }>(`/tasks/${id}/status`, {
            method: 'PATCH',
            token,
            body: { status, blocked_reason },
        }),

    logTime: (token: string, id: number, hours: number, note?: string) =>
        request<{ id: number }>(`/tasks/${id}/time`, {
            method: 'POST',
            token,
            body: { hours, note },
        }),

    gantt: (token: string, filters?: Record<string, string>) => {
        const params = filters ? '?' + new URLSearchParams(filters).toString() : '';
        return request<{ tasks: GanttTask[]; total_duration_hours: number; total_workers: number; daily_capacity_hours: number }>(`/tasks/gantt${params}`, { token });
    },
};

// ------ Inventory ------

export interface InventoryItem {
    id: number;
    name: string;
    category: string;
    quantity: number;
    unit: string;
    min_quantity: number;
    location: string | null;
    notes: string | null;
}

export const inventoryApi = {
    list: (token: string) =>
        request<{ items: InventoryItem[] }>('/inventory', { token }),

    create: (token: string, data: { name: string; category: string; unit?: string; quantity?: number; min_quantity?: number; location?: string; notes?: string }) =>
        request<{ item: InventoryItem }>('/inventory', {
            method: 'POST',
            token,
            body: data,
        }),

    adjustQuantity: (token: string, id: number, quantity_change: number, reason?: string) =>
        request<{ item: InventoryItem }>(`/inventory/${id}/adjust`, {
            method: 'PATCH',
            token,
            body: { quantity_change, reason },
        }),
};

// ------ Server health check ------

export async function checkServerConnection(): Promise<boolean> {
    try {
        const base = await getServerUrl();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`${base}/api/health`, { signal: controller.signal });
        clearTimeout(timeout);
        return res.ok;
    } catch {
        return false;
    }
}
