import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import './SuperAdmin.css';

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function SuperAdmin() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revealed, setRevealed] = useState(() => new Set());

  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [pwEditId, setPwEditId] = useState(null);
  const [pwValue, setPwValue] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');

  const callAdmin = useCallback(async (body) => {
    const { data, error: invokeError } = await supabase.functions.invoke('admin-users', { body });
    if (invokeError) {
      let msg = invokeError.message || 'Ошибка запроса';
      try {
        const ctx = await invokeError.context?.json?.();
        if (ctx?.error) msg = ctx.error;
      } catch {
        /* noop */
      }
      throw new Error(msg);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await callAdmin({ action: 'list' });
      const list = (data?.users ?? []).slice().sort((a, b) => {
        const ai = a.created_at || '';
        const bi = b.created_at || '';
        return ai < bi ? -1 : ai > bi ? 1 : 0;
      });
      setUsers(list);
    } catch (e) {
      setError(e.message || 'Не удалось загрузить пользователей');
    } finally {
      setLoading(false);
    }
  }, [callAdmin]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreateError('');
    if (!newEmail.trim() || !newPassword) {
      setCreateError('Введите email и пароль');
      return;
    }
    setCreating(true);
    try {
      await callAdmin({ action: 'create', email: newEmail.trim(), password: newPassword });
      setNewEmail('');
      setNewPassword('');
      await loadUsers();
    } catch (err) {
      setCreateError(err.message || 'Не удалось создать пользователя');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await callAdmin({ action: 'delete', id: deleteTarget.id });
      setDeleteTarget(null);
      await loadUsers();
    } catch (err) {
      setError(err.message || 'Не удалось удалить пользователя');
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const toggleReveal = (id) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startPwEdit = (u) => {
    setPwEditId(u.id);
    setPwValue(u.password || '');
    setPwError('');
  };

  const cancelPwEdit = () => {
    setPwEditId(null);
    setPwValue('');
    setPwError('');
  };

  const savePassword = async (u) => {
    setPwError('');
    if (!pwValue || pwValue.length < 6) {
      setPwError('Минимум 6 символов');
      return;
    }
    setPwSaving(true);
    try {
      await callAdmin({ action: 'set_password', id: u.id, password: pwValue });
      setRevealed((prev) => new Set(prev).add(u.id));
      cancelPwEdit();
      await loadUsers();
    } catch (err) {
      setPwError(err.message || 'Не удалось сохранить пароль');
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div className="superadmin">
      <div className="superadmin__inner">
        <header className="superadmin__header">
          <div>
            <h1 className="superadmin__title">Суперадминистратор</h1>
            <p className="superadmin__subtitle">Управление пользователями платформы</p>
          </div>
          <div className="superadmin__header-actions">
            <button type="button" className="superadmin__ghost-btn" onClick={() => navigate('/')}>
              В приложение
            </button>
            <button type="button" className="superadmin__ghost-btn" onClick={() => signOut()}>
              Выйти
            </button>
          </div>
        </header>

        <section className="superadmin__card">
          <h2 className="superadmin__card-title">Добавить пользователя</h2>
          <form className="superadmin__add-form" onSubmit={handleCreate}>
            <input
              type="email"
              className="superadmin__input"
              placeholder="email@mail.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              autoComplete="off"
            />
            <input
              type="text"
              className="superadmin__input"
              placeholder="Пароль"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="off"
            />
            <button type="submit" className="superadmin__primary-btn" disabled={creating}>
              {creating ? '...' : 'Добавить'}
            </button>
          </form>
          {createError && <p className="superadmin__error">{createError}</p>}
        </section>

        <section className="superadmin__card">
          <div className="superadmin__card-head">
            <h2 className="superadmin__card-title">Пользователи ({users.length})</h2>
            <button type="button" className="superadmin__ghost-btn" onClick={loadUsers} disabled={loading}>
              Обновить
            </button>
          </div>

          {error && <p className="superadmin__error">{error}</p>}

          {loading ? (
            <p className="superadmin__muted">Загрузка...</p>
          ) : users.length === 0 ? (
            <p className="superadmin__muted">Нет пользователей</p>
          ) : (
            <div className="superadmin__table-wrap">
              <table className="superadmin__table">
                <thead>
                  <tr>
                    <th>Email (логин)</th>
                    <th>Пароль</th>
                    <th>Роль</th>
                    <th>Создан</th>
                    <th aria-label="Действия" />
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="superadmin__email">{u.email}</td>
                      <td className="superadmin__password">
                        {pwEditId === u.id ? (
                          <span className="superadmin__password-edit">
                            <input
                              type="text"
                              className="superadmin__input superadmin__pw-input"
                              value={pwValue}
                              onChange={(e) => setPwValue(e.target.value)}
                              placeholder="Новый пароль"
                              autoComplete="off"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') savePassword(u);
                                if (e.key === 'Escape') cancelPwEdit();
                              }}
                            />
                            <button
                              type="button"
                              className="superadmin__primary-btn superadmin__pw-save"
                              onClick={() => savePassword(u)}
                              disabled={pwSaving}
                            >
                              {pwSaving ? '...' : 'Сохранить'}
                            </button>
                            <button type="button" className="superadmin__link-btn" onClick={cancelPwEdit}>
                              Отмена
                            </button>
                            {pwError && <span className="superadmin__pw-error">{pwError}</span>}
                          </span>
                        ) : u.password ? (
                          <span className="superadmin__password-row">
                            <code>{revealed.has(u.id) ? u.password : '••••••••'}</code>
                            <button
                              type="button"
                              className="superadmin__link-btn"
                              onClick={() => toggleReveal(u.id)}
                            >
                              {revealed.has(u.id) ? 'Скрыть' : 'Показать'}
                            </button>
                            <button
                              type="button"
                              className="superadmin__link-btn"
                              onClick={() => startPwEdit(u)}
                            >
                              Изменить
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="superadmin__link-btn"
                            onClick={() => startPwEdit(u)}
                          >
                            Задать пароль
                          </button>
                        )}
                      </td>
                      <td>
                        {u.role === 'superadmin' ? (
                          <span className="superadmin__badge">суперадмин</span>
                        ) : (
                          'пользователь'
                        )}
                      </td>
                      <td className="superadmin__muted">{formatDate(u.created_at)}</td>
                      <td className="superadmin__row-actions">
                        <button
                          type="button"
                          className="superadmin__delete-btn"
                          onClick={() => setDeleteTarget(u)}
                          disabled={u.role === 'superadmin'}
                          title={u.role === 'superadmin' ? 'Нельзя удалить суперадмина' : 'Удалить'}
                        >
                          Удалить
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {deleteTarget && (
        <div className="superadmin__overlay" onClick={() => setDeleteTarget(null)}>
          <div className="superadmin__popup" onClick={(e) => e.stopPropagation()}>
            <p className="superadmin__popup-text">
              Удалить пользователя <strong>{deleteTarget.email}</strong>? Все его данные будут удалены безвозвратно.
            </p>
            <div className="superadmin__popup-actions">
              <button type="button" className="superadmin__ghost-btn" onClick={() => setDeleteTarget(null)}>
                Отмена
              </button>
              <button type="button" className="superadmin__delete-btn" onClick={handleDelete} disabled={deleting}>
                {deleting ? '...' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
