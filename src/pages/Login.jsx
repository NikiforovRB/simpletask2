import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './Login.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showConfirmMessage, setShowConfirmMessage] = useState(false);
  const { signIn, signUp } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setLoading(true);
    setShowConfirmMessage(false);
    try {
      const fn = isSignUp ? signUp : signIn;
      const { error } = await fn(email, password);
      if (error) {
        setMessage(error.message || 'Ошибка входа');
      } else if (isSignUp) {
        setShowConfirmMessage(true);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      {showConfirmMessage && (
        <div className="login-overlay" onClick={() => setShowConfirmMessage(false)}>
          <div className="login-popup" onClick={(e) => e.stopPropagation()}>
            <p className="login-popup__text">
              На указанный email отправлено письмо для подтверждения регистрации. Если его нет во входящих, проверь папку Спам.
            </p>
            <button type="button" className="login-popup__btn" onClick={() => setShowConfirmMessage(false)}>
              OK
            </button>
          </div>
        </div>
      )}
      <div className="login-card">
        <h1 className="login-title">Задачи</h1>
        <form onSubmit={handleSubmit} className="login-form">
          <label className="login-label">
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@mail.com"
              className="login-input"
              required
            />
          </label>
          <label className="login-label">
            Пароль
            <input
              type="password"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="login-input"
              required
            />
          </label>
          {message && <p className="login-message">{message}</p>}
          <button type="submit" className="login-submit" disabled={loading}>
            {loading ? '...' : isSignUp ? 'Регистрация' : 'Войти'}
          </button>
        </form>
        <button
          type="button"
          className="login-toggle"
          onClick={() => { setIsSignUp((v) => !v); setMessage(''); }}
        >
          {isSignUp ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}
        </button>
      </div>
    </div>
  );
}
