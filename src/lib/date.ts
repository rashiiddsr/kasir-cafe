export const JAKARTA_TIMEZONE = 'Asia/Jakarta';

export const formatJakartaDate = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: JAKARTA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

export const formatJakartaDateTime = (date: Date) =>
  new Intl.DateTimeFormat('id-ID', {
    timeZone: JAKARTA_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
