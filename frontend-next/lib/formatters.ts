import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

export const money = (value?: number | null): string =>
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const dateBR = (value?: string | null): string =>
  value ? dayjs.utc(value).format('DD/MM/YYYY') : '-';

export const dateTimeBR = (value?: string | null): string =>
  value ? dayjs.utc(value).format('DD/MM/YYYY HH:mm') : '-';

export const ageFromDate = (value?: string | null): number =>
  value ? dayjs().diff(dayjs(value), 'year') : 0;

export const formatDate = (date: Date | string | null): string | null => {
  if (!date) return null;
  const d = dayjs(date);
  const y = d.year();
  const m = String(d.month() + 1).padStart(2, '0');
  const day = String(d.date()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const cpfMask = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

export const phoneMask = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
  }
  return digits.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
};
