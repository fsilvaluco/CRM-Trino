import type { EncodeRequest, EncodeResponse } from "./mp3-encoder.worker";

// ─── Preparar un audio para subirlo a una Preescucha ──────────────────────
// Regla del modulo: en el bucket solo se guardan MP3. Si la persona elige
// un WAV (o AIFF/FLAC), se convierte AQUI, en su navegador, a MP3 320 kbps
// y solo se sube el resultado -- el original nunca sale de su computador.
// Un disco en WAV pesa ~600 MB; en MP3 320, ~100 MB, y para escucha de
// prensa suena igual.

const MP3_KBPS = 320;
// MP3 solo admite estas frecuencias a 320 kbps (MPEG-1). Todo se decodifica
// a 44.1 kHz, que es la de un master de distribucion estandar.
const TARGET_SAMPLE_RATE = 44100;
/** Tope del archivo ORIGINAL: decodificarlo completo en memoria tiene un limite practico. */
export const MAX_SOURCE_BYTES = 400 * 1024 * 1024;

export interface PreparedTrack {
  blob: Blob;
  durationSeconds: number | null;
  /** true si hubo que convertir (el original no era MP3). */
  converted: boolean;
}

function isMp3(file: File): boolean {
  return file.type === "audio/mpeg" || file.type === "audio/mp3" || /\.mp3$/i.test(file.name);
}

/** Titulo sugerido a partir del nombre de archivo: sin extension ni numero de pista inicial. */
export function titleFromFileName(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/^\s*\d{1,2}\s*[-._)]\s*/, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readDuration(blob: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    const finish = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => finish(Number.isFinite(audio.duration) ? Math.round(audio.duration) : null);
    audio.onerror = () => finish(null);
    audio.src = url;
  });
}

function encodeInWorker(request: EncodeRequest, onProgress: (value: number) => void): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./mp3-encoder.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<EncodeResponse>) => {
      const msg = event.data;
      if (msg.type === "progress") {
        onProgress(msg.value);
      } else {
        worker.terminate();
        if (msg.type === "done") resolve(msg.buffer);
        else reject(new Error(msg.message));
      }
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "Error al convertir"));
    };
    // Los canales se transfieren (no se copian) al worker.
    worker.postMessage(request, request.channels.map((c) => c.buffer));
  });
}

/**
 * Deja un archivo de audio listo para subir: un MP3 pasa tal cual; cualquier
 * otro formato que el navegador sepa leer (WAV siempre; AIFF/FLAC segun el
 * navegador) se convierte a MP3 320 kbps. `onProgress` va de 0 a 1.
 */
export async function prepareTrack(file: File, onProgress: (value: number) => void): Promise<PreparedTrack> {
  if (isMp3(file)) {
    const durationSeconds = await readDuration(file);
    onProgress(1);
    return { blob: file, durationSeconds, converted: false };
  }

  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("El archivo es demasiado grande para convertirlo aquí (máximo 400 MB). Súbelo en MP3.");
  }

  let decoded: AudioBuffer;
  try {
    // OfflineAudioContext decodifica y de paso remuestrea a 44.1 kHz; no
    // necesita un gesto del usuario como AudioContext.
    const ctx = new OfflineAudioContext(2, 1, TARGET_SAMPLE_RATE);
    decoded = await ctx.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error("No se pudo leer este archivo de audio. Usa WAV o MP3.");
  }

  const channels: Float32Array[] = [];
  for (let c = 0; c < Math.min(2, decoded.numberOfChannels); c++) {
    // Copia propia: el buffer se transfiere al worker.
    channels.push(new Float32Array(decoded.getChannelData(c)));
  }

  const buffer = await encodeInWorker({ channels, sampleRate: decoded.sampleRate, kbps: MP3_KBPS }, onProgress);
  return {
    blob: new Blob([buffer], { type: "audio/mpeg" }),
    durationSeconds: Math.round(decoded.duration),
    converted: true,
  };
}
