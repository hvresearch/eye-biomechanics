export interface Throttled<A extends unknown[]> {
  (...args: A): void;
  cancel: () => void;
}

/**
 * Call `fn` at once, then at most once per `ms` while calls keep coming, always finishing
 * with a trailing call carrying the latest arguments. Unlike a debounce, a continuous drag
 * keeps producing updates instead of freezing until the pointer stops.
 */
export function throttle<A extends unknown[]>(fn: (...args: A) => void, ms: number): Throttled<A> {
  let last = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: A | null = null;
  const fire = () => {
    timer = null;
    if (!pending) return;
    const args = pending;
    pending = null;
    last = Date.now();
    fn(...args);
  };
  const t = ((...args: A) => {
    pending = args;
    const wait = last + ms - Date.now();
    if (wait <= 0 && timer === null) fire();
    else timer ??= setTimeout(fire, Math.max(0, wait));
  }) as Throttled<A>;
  t.cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pending = null;
  };
  return t;
}
