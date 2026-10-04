import { describe, it, expect } from "vitest";
import { createUploadQueue, type QueueState } from "./queue";

const file = (name: string) => ({ name });
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("createUploadQueue", () => {
  it("n'envoie jamais plus de 3 fichiers à la fois", async () => {
    let active = 0;
    let peak = 0;
    const q = createUploadQueue<{ name: string }>({
      concurrency: 3,
      upload: async () => {
        peak = Math.max(peak, ++active);
        await tick();
        active--;
        return { duplicate: false };
      },
    });
    await q.add(Array.from({ length: 10 }, (_, i) => file(`${i}.jpg`)));
    expect(peak).toBe(3);
    expect(q.state()).toMatchObject({ total: 10, done: 10, duplicates: 0, failed: [], active: 0 });
  });

  it("compte les doublons et continue après un échec", async () => {
    const q = createUploadQueue<{ name: string }>({
      concurrency: 2,
      upload: async (f) => {
        if (f.name === "bad.jpg") throw new Error("Image illisible");
        return { duplicate: f.name.startsWith("dup") };
      },
    });
    await q.add([file("a.jpg"), file("bad.jpg"), file("dup.jpg"), file("b.jpg")]);
    const s = q.state();
    expect(s.done).toBe(3);
    expect(s.duplicates).toBe(1);
    expect(s.failed.map((f) => [f.file.name, f.error])).toEqual([["bad.jpg", "Image illisible"]]);
  });

  it("ne réessaie que les échecs", async () => {
    const calls: string[] = [];
    let fail = true;
    const q = createUploadQueue<{ name: string }>({
      concurrency: 3,
      upload: async (f) => {
        calls.push(f.name);
        if (f.name === "flaky.jpg" && fail) throw new Error("Réseau");
        return { duplicate: false };
      },
    });
    await q.add([file("ok.jpg"), file("flaky.jpg")]);
    fail = false;
    await q.retryFailed();
    expect(calls).toEqual(["ok.jpg", "flaky.jpg", "flaky.jpg"]);
    expect(q.state()).toMatchObject({ total: 2, done: 2, failed: [] });
  });

  it("notifie les abonnés à chaque changement", async () => {
    const q = createUploadQueue<{ name: string }>({ concurrency: 1, upload: async () => ({ duplicate: false }) });
    const seen: QueueState<{ name: string }>[] = [];
    q.subscribe((s) => seen.push(s));
    await q.add([file("a.jpg")]);
    expect(seen.at(-1)).toMatchObject({ total: 1, done: 1 });
    expect(seen.some((s) => s.active === 1)).toBe(true);
  });

  it("ignore un fichier déjà confié à la file (double appel, ex. StrictMode)", async () => {
    const calls: string[] = [];
    const q = createUploadQueue<{ name: string }>({
      concurrency: 3,
      upload: async (f) => {
        calls.push(f.name);
        await tick();
        return { duplicate: false };
      },
    });
    const files = [file("a.jpg"), file("b.jpg")];
    await Promise.all([q.add(files), q.add(files)]);
    expect(calls.sort()).toEqual(["a.jpg", "b.jpg"]);
    expect(q.state()).toMatchObject({ total: 2, done: 2 });
  });

  it("accepte des fichiers ajoutés pendant un envoi en cours", async () => {
    const q = createUploadQueue<{ name: string }>({ concurrency: 1, upload: async () => (await tick(), { duplicate: false }) });
    const first = q.add([file("1.jpg"), file("2.jpg")]);
    const second = q.add([file("3.jpg")]);
    await Promise.all([first, second]);
    expect(q.state()).toMatchObject({ total: 3, done: 3 });
  });
});
