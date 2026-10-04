import { existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import type { InferenceSession } from "onnxruntime-node";

/**
 * Nombre de personnes sur une photo : détecteur de visages UltraFace RFB-320 (ONNX, ~1 Mo, licence MIT),
 * exécuté sur la tour. Aucun visage n'est reconnu ni stocké : seul le nombre est gardé.
 */
const MODEL = join(import.meta.dirname, "models", "ultraface-320.onnx");
const W = 320;
const H = 240;
const THRESHOLD = 0.7;
const IOU = 0.3;

let session: Promise<InferenceSession | null> | null = null;
function load() {
  session ??= existsSync(MODEL)
    ? import("onnxruntime-node").then((ort) => ort.InferenceSession.create(MODEL, { logSeverityLevel: 3 })).catch(() => null)
    : Promise.resolve(null);
  return session;
}

type Box = { x1: number; y1: number; x2: number; y2: number; score: number };
const area = (b: Box) => Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
function iou(a: Box, b: Box) {
  const inter = area({ x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), x2: Math.min(a.x2, b.x2), y2: Math.min(a.y2, b.y2), score: 0 });
  return inter / (area(a) + area(b) - inter || 1);
}

/** Renvoie le nombre de visages, ou null si l'image ou le modèle ne sont pas disponibles. */
export async function countFaces(buf: Buffer): Promise<number | null> {
  const s = await load();
  if (!s) return null;
  let pixels: Buffer;
  try {
    pixels = await sharp(buf).rotate().resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer();
  } catch {
    return null;
  }
  const ort = await import("onnxruntime-node");
  // NCHW, normalisation (x - 127) / 128 comme à l'entraînement.
  const input = new Float32Array(3 * W * H);
  for (let i = 0; i < W * H; i++) for (let c = 0; c < 3; c++) input[c * W * H + i] = (pixels[i * 3 + c] - 127) / 128;
  const out = await s.run({ input: new ort.Tensor("float32", input, [1, 3, H, W]) });
  const scores = out.scores.data as Float32Array;
  const boxes = out.boxes.data as Float32Array;
  const candidates: Box[] = [];
  for (let i = 0; i < scores.length / 2; i++) {
    const score = scores[i * 2 + 1];
    if (score > THRESHOLD) candidates.push({ x1: boxes[i * 4], y1: boxes[i * 4 + 1], x2: boxes[i * 4 + 2], y2: boxes[i * 4 + 3], score });
  }
  candidates.sort((a, b) => b.score - a.score);
  const kept: Box[] = [];
  for (const c of candidates) if (kept.every((k) => iou(k, c) < IOU)) kept.push(c);
  return kept.length;
}
