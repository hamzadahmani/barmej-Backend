import {createWorker} from 'tesseract.js';
import {parseMenuText} from './menuLogic';

let running = 0;
export async function extractMenuPhoto(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com') throw Object.assign(new Error('Photo de menu non autorisée'), {statusCode: 400});
  if (running >= 2) throw Object.assign(new Error('Lecture des menus occupée. Réessayez dans un instant.'), {statusCode: 429});
  running++;
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await fetch(url, {redirect: 'error', signal: AbortSignal.timeout(15_000)});
    if (!response.ok || !response.body) throw new Error('Photo inaccessible');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > 8 * 1024 * 1024) { await reader.cancel(); throw new Error('Photo trop lourde'); }
      chunks.push(next.value);
    }
    worker = await createWorker('fra+ara');
    const activeWorker = worker;
    const result = await Promise.race([
      activeWorker.recognize(Buffer.concat(chunks)),
      new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error('Lecture trop longue. Utilisez une photo plus nette ou saisissez les lignes.')), 45_000); }),
    ]);
    return {text: result.data.text.slice(0, 50_000), confidence: result.data.confidence, items: parseMenuText(result.data.text)};
  } finally {
    if (timeout) clearTimeout(timeout);
    if (worker) await worker.terminate().catch(() => undefined);
    running--;
  }
}
