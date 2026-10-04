export type QueueState<T> = {
  total: number;
  done: number;
  duplicates: number;
  failed: { file: T; error: string }[];
  active: number;
};

type Options<T extends object> = { concurrency: number; upload: (file: T) => Promise<{ duplicate: boolean }> };

/** File d'envoi : concurrence bornée, un échec n'arrête jamais le lot (copie générique de web/upload-queue.ts). */
export function createUploadQueue<T extends object>({ concurrency, upload }: Options<T>) {
  let s: QueueState<T> = { total: 0, done: 0, duplicates: 0, failed: [], active: 0 };
  const listeners = new Set<(s: QueueState<T>) => void>();
  const pending: T[] = [];
  const seen = new WeakSet<T>();
  let running: Promise<void> | null = null;

  const set = (patch: Partial<QueueState<T>>) => {
    s = { ...s, ...patch };
    listeners.forEach((l) => l(s));
  };

  async function worker() {
    for (let f = pending.shift(); f; f = pending.shift()) {
      set({ active: s.active + 1 });
      try {
        const { duplicate } = await upload(f);
        set({ active: s.active - 1, done: s.done + 1, duplicates: s.duplicates + (duplicate ? 1 : 0) });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        set({ active: s.active - 1, failed: [...s.failed, { file: f, error }] });
      }
    }
  }

  function drain() {
    running ??= Promise.all(Array.from({ length: concurrency }, worker)).then(() => {
      running = null;
    });
    return running;
  }

  return {
    state: () => s,
    subscribe(cb: (s: QueueState<T>) => void) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    add(files: T[]) {
      const fresh = files.filter((f) => !seen.has(f));
      fresh.forEach((f) => seen.add(f));
      pending.push(...fresh);
      if (fresh.length) set({ total: s.total + fresh.length });
      return drain();
    },
    retryFailed() {
      pending.push(...s.failed.map((f) => f.file));
      set({ failed: [] });
      return drain();
    },
    reset() {
      if (!running) set({ total: 0, done: 0, duplicates: 0, failed: [], active: 0 });
    },
  };
}


