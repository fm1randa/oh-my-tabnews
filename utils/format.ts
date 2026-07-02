const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 1000 * 60 * 60 * 24 * 365],
  ['month', 1000 * 60 * 60 * 24 * 30],
  ['day', 1000 * 60 * 60 * 24],
  ['hour', 1000 * 60 * 60],
  ['minute', 1000 * 60],
];

const formatter = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'always' });

export function relativeTime(iso: string, now = Date.now()): string {
  const elapsed = new Date(iso).getTime() - now;
  for (const [unit, ms] of UNITS) {
    if (Math.abs(elapsed) >= ms) {
      return formatter.format(Math.round(elapsed / ms), unit);
    }
  }
  return 'agora mesmo';
}
