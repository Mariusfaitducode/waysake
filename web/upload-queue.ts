export type QueueState = {
  total: number;
  done: number;
  duplicates: number;
  failed: { file: File; error: string }[];
  active: number;
};

type Options = { concurrency: number; upload: (file: File) => Promise<{ duplicate: boolean }> };

/** File d'envoi côté navigateur : concurrence bornée, un échec n'arrête jamais le lot. */
export function createUploadQueue({ concurrency, upload }: Options) {
  let s: QueueState = { total: 0, done: 0, duplicates: 0, failed: [], active: 0 };
  const listeners = new Set<(s: QueueState) => void>();
  const pending: File[] = [];
  const seen = new WeakSet<File>();
  let running: Promise<void> | null = null;

  const set = (patch: Partial<QueueState>) => {
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
    subscribe(cb: (s: QueueState) => void) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    add(files: File[]) {
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

export type UploadQueue = ReturnType<typeof createUploadQueue>;
