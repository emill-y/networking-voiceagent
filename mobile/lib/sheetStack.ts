// How many bottom sheets are open, so the app behind them can step back
// (zoom out slightly) while one is up.
let open = 0;
const listeners = new Set<() => void>();

export function sheetOpened(): () => void {
  open += 1;
  listeners.forEach((l) => l());
  return () => {
    open = Math.max(0, open - 1);
    listeners.forEach((l) => l());
  };
}

export function subscribeSheets(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function openSheets(): number {
  return open;
}
