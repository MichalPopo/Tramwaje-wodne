import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { authApi, type User } from '../api';
import './TeamPage.css';

export default function TeamPage() {
    const { user, token } = useAuth();
    const navigate = useNavigate();

    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Add user modal
    const [showModal, setShowModal] = useState(false);
    const [formName, setFormName] = useState('');
    const [formEmail, setFormEmail] = useState('');
    const [formPassword, setFormPassword] = useState('');
    const [formRole, setFormRole] = useState('worker');
    const [formError, setFormError] = useState('');
    const [saving, setSaving] = useState(false);

    // Password change modal
    const [pwUser, setPwUser] = useState<User | null>(null);
    const [newPw, setNewPw] = useState('');
    const [pwError, setPwError] = useState('');
    const [pwSaving, setPwSaving] = useState(false);

    const loadUsers = useCallback(async () => {
        if (!token) return;
        try {
            const res = await authApi.listUsers(token);
            setUsers(res.users);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Błąd');
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => { loadUsers(); }, [loadUsers]);

    const handleAdd = async () => {
        if (!token) return;
        setFormError('');
        if (!formName.trim() || !formEmail.trim() || !formPassword.trim()) {
            setFormError('Wypełnij wszystkie pola');
            return;
        }
        setSaving(true);
        try {
            await authApi.register(token, {
                name: formName.trim(),
                email: formEmail.trim(),
                password: formPassword,
                role: formRole,
            });
            setShowModal(false);
            setFormName('');
            setFormEmail('');
            setFormPassword('');
            setFormRole('worker');
            loadUsers();
        } catch (err) {
            setFormError(err instanceof Error ? err.message : 'Błąd rejestracji');
        } finally {
            setSaving(false);
        }
    };

    const handleToggle = async (u: User) => {
        if (!token || u.id === user?.id) return;
        try {
            await authApi.toggleActive(token, u.id, !u.is_active);
            loadUsers();
        } catch { /* ignore */ }
    };

    const handlePasswordChange = async () => {
        if (!token || !pwUser) return;
        setPwError('');
        if (newPw.length < 8) {
            setPwError('Hasło musi mieć min. 8 znaków');
            return;
        }
        setPwSaving(true);
        try {
            await authApi.changePassword(token, pwUser.id, newPw);
            setPwUser(null);
            setNewPw('');
        } catch (err) {
            setPwError(err instanceof Error ? err.message : 'Błąd');
        } finally {
            setPwSaving(false);
        }
    };

    if (!user || user.role !== 'admin') return null;

    return (
        <div className="team-page">
            <div className="team-header">
                <div className="team-header-left">
                    <button className="team-back-btn" onClick={() => navigate('/dashboard')}>← Dashboard</button>
                    <h1>👥 Zarządzanie zespołem</h1>
                </div>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                    ➕ Dodaj pracownika
                </button>
            </div>

            {error && <div className="team-error">{error}</div>}

            {loading ? (
                <div className="team-loading">Ładowanie…</div>
            ) : (
                <div className="team-table-wrapper">
                    <table className="team-table">
                        <thead>
                            <tr>
                                <th>Imię i nazwisko</th>
                                <th>Email</th>
                                <th>Rola</th>
                                <th>Status</th>
                                <th>Data utworzenia</th>
                                <th>Akcje</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(u => (
                                <tr key={u.id} className={!u.is_active ? 'team-row-inactive' : ''}>
                                    <td className="team-name">
                                        <span className="team-avatar">{u.name.charAt(0).toUpperCase()}</span>
                                        {u.name}
                                    </td>
                                    <td className="team-email">{u.email}</td>
                                    <td>
                                        <span className={`team-role-badge team-role-${u.role}`}>
                                            {u.role === 'admin' ? '👑 Admin' : '🔧 Pracownik'}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`team-status ${u.is_active ? 'team-active' : 'team-disabled'}`}>
                                            {u.is_active ? '✅ Aktywny' : '🚫 Nieaktywny'}
                                        </span>
                                    </td>
                                    <td className="team-date">
                                        {new Date(u.created_at).toLocaleDateString('pl-PL')}
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                                            <button
                                                className="btn btn-sm btn-ghost"
                                                onClick={() => { setPwUser(u); setNewPw(''); setPwError(''); }}
                                                title="Zmień hasło"
                                            >🔑</button>
                                            {u.id !== user?.id && (
                                                <button
                                                    className={`btn btn-sm ${u.is_active ? 'btn-ghost team-deactivate' : 'btn-primary'}`}
                                                    onClick={() => handleToggle(u)}
                                                >
                                                    {u.is_active ? 'Dezaktywuj' : 'Aktywuj'}
                                                </button>
                                            )}
                                            {u.id === user?.id && (
                                                <span className="team-self-badge">To Ty</span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Add User Modal */}
            {showModal && (
                <div className="team-modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="team-modal" onClick={e => e.stopPropagation()}>
                        <h2>Nowy użytkownik</h2>
                        <div className="team-modal-fields">
                            <div className="team-field">
                                <label>Imię i nazwisko</label>
                                <input
                                    type="text"
                                    value={formName}
                                    onChange={e => setFormName(e.target.value)}
                                    placeholder="Jan Kowalski"
                                    autoFocus
                                />
                            </div>
                            <div className="team-field">
                                <label>Email</label>
                                <input
                                    type="email"
                                    value={formEmail}
                                    onChange={e => setFormEmail(e.target.value)}
                                    placeholder="jan@tramwajewodne.pl"
                                />
                            </div>
                            <div className="team-field">
                                <label>Hasło</label>
                                <input
                                    type="password"
                                    value={formPassword}
                                    onChange={e => setFormPassword(e.target.value)}
                                    placeholder="min. 8 znaków"
                                />
                            </div>
                            <div className="team-field">
                                <label>Rola</label>
                                <select value={formRole} onChange={e => setFormRole(e.target.value)}>
                                    <option value="worker">🔧 Pracownik</option>
                                    <option value="admin">👑 Admin</option>
                                </select>
                            </div>
                        </div>
                        {formError && <div className="team-form-error">{formError}</div>}
                        <div className="team-modal-actions">
                            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Anuluj</button>
                            <button className="btn btn-primary" onClick={handleAdd} disabled={saving}>
                                {saving ? 'Zapisuję…' : '✅ Utwórz konto'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Password change modal */}
            {pwUser && (
                <div className="team-modal-overlay" onClick={() => setPwUser(null)}>
                    <div className="team-modal" onClick={e => e.stopPropagation()}>
                        <h2>🔑 Zmień hasło — {pwUser.name}</h2>
                        <div className="team-modal-fields">
                            <div className="team-field">
                                <label>Nowe hasło</label>
                                <input
                                    type="password"
                                    value={newPw}
                                    onChange={e => setNewPw(e.target.value)}
                                    placeholder="min. 8 znaków"
                                    autoFocus
                                />
                            </div>
                        </div>
                        {pwError && <div className="team-form-error">{pwError}</div>}
                        <div className="team-modal-actions">
                            <button className="btn btn-ghost" onClick={() => setPwUser(null)}>Anuluj</button>
                            <button className="btn btn-primary" onClick={handlePasswordChange} disabled={pwSaving}>
                                {pwSaving ? 'Zapisuję…' : '✅ Zmień hasło'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
