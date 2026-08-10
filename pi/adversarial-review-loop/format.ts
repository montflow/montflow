/**
 * Formats a millisecond duration as a human-readable string for console and
 * transcript messages, e.g. `45 seconds`, `10 minutes`, `1 hour 30 minutes`.
 * Sub-second durations keep the raw `ms` form so tiny timeouts stay precise.
 * @param {number} ms Duration in milliseconds
 * @returns The formatted duration
 */
export const formatDuration = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 1) return `${Math.max(0, ms)}ms`;
  if (totalSeconds < 60) {
    return `${totalSeconds} second${totalSeconds === 1 ? '' : 's'}`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  const hoursPart = `${hours} hour${hours === 1 ? '' : 's'}`;
  return restMinutes === 0 ? hoursPart : `${hoursPart} ${restMinutes} minute${restMinutes === 1 ? '' : 's'}`;
};

/**
 * Formats a dollar cost for the widget, e.g. `$0.42`, `$12.50`, `$0.0042`.
 * Sub-cent costs keep four decimals so tiny per-turn charges don't round to
 * a misleading `$0.00`; zero renders as `$0.00`.
 * @param {number} cost Cost in USD
 * @returns The formatted cost
 */
export const formatCost = (cost: number): string => {
  const value = Math.max(0, cost);
  if (value === 0) return '$0.00';
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
};
