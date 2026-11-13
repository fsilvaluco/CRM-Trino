import { Mp3Encoder } from "@breezystack/lamejs";

// Web Worker: codifica audio PCM a MP3 fuera del hilo principal, para que
// la pantalla no se congele mientras se convierte un WAV de varios minutos.
// Lo usa src/lib/audio/prepare-track.ts.

export interface EncodeRequest {
  /** Uno o dos canales de PCM en float [-1, 1]. */
  channels: Float32Array[];
  sampleRate: number;
  kbps: number;
}

export type EncodeResponse =
  | { type: "progress"; value: number }
  | { type: "done"; buffer: ArrayBuffer }
  | { type: "error"; message: string };

// Multiplo de 1152 (muestras por frame MP3) -- lo que recomienda lamejs.
const CHUNK = 1152 * 40;

function toInt16(input: Float32Array, start: number, end: number): Int16Array {
  const out = new Int16Array(end - start);
  for (let i = start; i < end; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i - start] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<EncodeRequest>) => void) | null;
  postMessage(message: EncodeResponse, transfer?: Transferable[]): void;
};

scope.onmessage = (event) => {
  try {
    const { channels, sampleRate, kbps } = event.data;
    const left = channels[0];
    const right = channels.length > 1 ? channels[1] : null;
    const encoder = new Mp3Encoder(right ? 2 : 1, sampleRate, kbps);
    const parts: Uint8Array[] = [];
    let lastReported = 0;

    for (let i = 0; i < left.length; i += CHUNK) {
      const end = Math.min(i + CHUNK, left.length);
      const encoded = right
        ? encoder.encodeBuffer(toInt16(left, i, end), toInt16(right, i, end))
        : encoder.encodeBuffer(toInt16(left, i, end));
      if (encoded.length > 0) parts.push(new Uint8Array(encoded));

      const progress = end / left.length;
      if (progress - lastReported >= 0.02) {
        lastReported = progress;
        scope.postMessage({ type: "progress", value: progress });
      }
    }
    const tail = encoder.flush();
    if (tail.length > 0) parts.push(new Uint8Array(tail));

    const total = parts.reduce((sum, p) => sum + p.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const p of parts) {
      result.set(p, offset);
      offset += p.length;
    }
    scope.postMessage({ type: "done", buffer: result.buffer }, [result.buffer]);
  } catch (err) {
    scope.postMessage({ type: "error", message: err instanceof Error ? err.message : "Error al convertir" });
  }
};
