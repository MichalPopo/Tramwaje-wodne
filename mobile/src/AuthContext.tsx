import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi, getToken, setToken, clearToken, type User } from './api';

interface AuthState {
    user: User | null;
    token: string | null;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
    user: null,
    token: null,
    isLoading: true,
    login: async () => {},
    logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setTokenState] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Restore saved session on startup
    useEffect(() => {
        (async () => {
            try {
                const saved = await getToken();
                if (saved) {
                    const data = await authApi.me(saved);
                    setTokenState(saved);
                    setUser(data.user);
                }
            } catch {
                await clearToken();
            } finally {
                setIsLoading(false);
            }
        })();
    }, []);

    const login = useCallback(async (email: string, password: string) => {
        const data = await authApi.login(email, password);
        await setToken(data.token);
        setTokenState(data.token);
        setUser(data.user);
    }, []);

    const logout = useCallback(async () => {
        await clearToken();
        setTokenState(null);
        setUser(null);
    }, []);

    return (
        <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
