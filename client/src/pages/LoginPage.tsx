import { useState, type FormEvent } from 'react';
import { useAuth } from '../AuthContext';
import { ApiError } from '../api';
import './LoginPage.css';

export default function LoginPage() {
    const { login } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            await login(email, password);
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.status === 401
                    ? 'Nieprawidłowy email lub hasło'
                    : err.message
                );
            } else {
                setError('Brak połączenia z serwerem');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-bg-effect" />
            <div className="login-container animate-slide-up">
                <div className="login-header">
                    <div className="login-logo">⚓</div>
                    <h1 className="login-title">Tramwaje Wodne</h1>
                    <p className="login-subtitle">Zalewu Wiślanego</p>
                </div>

                <form className="login-form" onSubmit={handleSubmit}>
                    {error && (
                        <div className="login-error animate-fade-in">
                            <span>⚠️</span> {error}
                        </div>
                    )}

                    <div className="input-group">
                        <label className="input-label" htmlFor="login-email">Email</label>
                        <input
                            id="login-email"
                            className="input"
                            type="email"
                            placeholder="kapitan@tramwajewodne.pl"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            autoFocus
                            autoComplete="email"
                        />
                    </div>

                    <div className="input-group">
                        <label className="input-label" htmlFor="login-password">Hasło</label>
                        <input
                            id="login-password"
                            className="input"
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            autoComplete="current-password"
                        />
                    </div>

                    <button
                        type="submit"
                        className={`btn btn-primary login-btn ${isLoading ? 'loading' : ''}`}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <span className="spinner" />
                        ) : (
                            <>🚢 Zaloguj się</>
                        )}
                    </button>
                </form>

                <p className="login-footer">
                    System zarządzania flotą
                </p>
            </div>
        </div>
    );
}
