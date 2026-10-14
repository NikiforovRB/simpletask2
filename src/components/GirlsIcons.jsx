import telegramIcon from '../assets/telegram.png';
import { avatarColor } from '../lib/girls';

export function Icon({ children, className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const PhoneIcon = () => (
  <Icon>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
  </Icon>
);

export const MessageIcon = () => (
  <Icon>
    <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.4 9.4 0 0 1-3.9-.8L3 20.5l1.4-4.3A8 8 0 0 1 3 11.5 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z" />
  </Icon>
);

export const HeartIcon = () => (
  <Icon>
    <path d="M19.5 12.6 12 20l-7.5-7.4A5 5 0 0 1 12 6a5 5 0 0 1 7.5 6.6z" />
  </Icon>
);

export const TelegramIcon = () => <img className="girl-tg-icon" src={telegramIcon} alt="" draggable={false} />;

export const SearchIcon = () => (
  <Icon className="girls__search-icon">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Icon>
);

export const PlusIcon = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const CloseIcon = () => (
  <Icon>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>
);

export const CheckIcon = () => (
  <Icon>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
);

export const CalendarIcon = () => (
  <Icon className="girl-input__icon">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M16 3v4M8 3v4M3 10h18" />
  </Icon>
);

export const CameraIcon = () => (
  <Icon>
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
    <circle cx="12" cy="13" r="3.5" />
  </Icon>
);

/** The icon of a task kind: «Написать», «Позвонить», «Свидание». */
export function TaskKindIcon({ kind }) {
  if (kind === 'call') return <PhoneIcon />;
  if (kind === 'date') return <HeartIcon />;
  return <MessageIcon />;
}

export function Avatar({ name, url, className = '' }) {
  if (url) return <img className={`girl-avatar girl-avatar--photo ${className}`} src={url} alt="" draggable={false} />;
  return (
    <span className={`girl-avatar ${className}`} style={{ background: avatarColor(name) }} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}
