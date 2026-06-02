/**
 * ollama_ocr.mjs — OCR LOCAL y GRATIS de páginas que vienen como IMAGEN en un PDF
 * (páginas escaneadas/sin capa de texto, p. ej. el TDR de las bases).
 *
 * Reemplaza a ocr_pdf.mjs (que usaba la API de pago de Anthropic). Aquí:
 *   1) Renderiza cada página del PDF a PNG con pdfjs-dist + @napi-rs/canvas.
 *   2) Manda la imagen a un modelo de visión local servido por Ollama
 *      (por defecto Qwen2.5-VL). Costo: $0, todo en tu GPU/CPU.
 *
 * REQUISITOS:
 *   - Ollama corriendo (http://127.0.0.1:11434).
 *   - El modelo descargado:  ollama pull qwen2.5vl:3b
 *   - npm install @napi-rs/canvas pdfjs-dist   (ya instalado en este repo)
 *
 * USO (misma interfaz que ocr_pdf.mjs):
 *   node ollama_ocr.mjs "input/concurso.pdf" "processed/concurso_TDR_ocr.txt" "25-45,63"
 *   # Si omites el rango, procesa TODO el PDF.
 *
 * VARIABLES OPCIONALES:
 *   OCR_MODEL    modelo Ollama (def. "qwen2.5vl:3b"; sube a "qwen2.5vl:7b" si tu VRAM aguanta)
 *   OCR_DPI      resolución de render (def. 170; sube a 220 si el texto es pequeño)
 *   OLLAMA_HOST  endpoint (def. "http://127.0.0.1:11434")
 */
import fs from 'fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas, DOMMatrix, Path2D, ImageData } from '@napi-rs/canvas';
import { Agent, setGlobalDispatcher } from 'undici';

// Sin esto, fetch aborta a los 5 min esperando los headers de Ollama.
// En CPU (o arranque en frío) una página puede tardar más: desactivamos
// el headers/body timeout y dejamos solo un techo por página (abajo).
setGlobalDispatcher(new Agent({ headersTimeout: 0, bodyTimeout: 0 }));

// pdfjs en Node necesita estos globales y un canvas factory propio
// (su factory interno busca el paquete "canvas", que no usamos).
globalThis.DOMMatrix = DOMMatrix;
globalThis.Path2D = Path2D;
globalThis.ImageData = ImageData;

class NapiCanvasFactory {
  create(width, height) {
    const canvas = createCanvas(Math.ceil(width), Math.ceil(height));
    return { canvas, context: canvas.getContext('2d') };
  }
  reset(cc, width, height) {
    cc.canvas.width = Math.ceil(width);
    cc.canvas.height = Math.ceil(height);
  }
  destroy(cc) {
    cc.canvas.width = 0;
    cc.canvas.height = 0;
    cc.canvas = null;
    cc.context = null;
  }
}

const [,, inFile, outFile, rangeArg] = process.argv;
if (!inFile || !outFile) {
  console.error('Uso: node ollama_ocr.mjs <entrada.pdf> <salida.txt> [rango ej "25-45,63"]');
  process.exit(1);
}

const MODEL = process.env.OCR_MODEL || 'qwen2.5vl:3b';
const DPI = Number(process.env.OCR_DPI || 170);
const HOST = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/$/, '');
const SCALE = DPI / 72; // PDF "user units" son 72 DPI
// num_batch controla el tamaño del "compute graph" que Ollama reserva en VRAM.
// Bajarlo (512 -> 128) achica esa reserva y permite que el modelo entre entero
// en GPU de poca VRAM (6 GB). num_gpu fuerza cuántas capas subir a la GPU.
const NUM_BATCH = Number(process.env.OCR_NUM_BATCH || 128);
const NUM_GPU = process.env.OCR_NUM_GPU ? Number(process.env.OCR_NUM_GPU) : undefined;
const NUM_CTX = Number(process.env.OCR_NUM_CTX || 4096);

const PROMPT =
  'Transcribe FIELMENTE todo el texto de esta página, en español, ' +
  'respetando numerales, viñetas y el contenido de las tablas (usa ' +
  'tabulaciones o guiones para las columnas). No resumas, no interpretes, ' +
  'no agregues comentarios: solo el texto tal como aparece. Si la página ' +
  'es una carátula con poco texto, indícalo entre corchetes.';

// --- parsear rango "25-45,63" -> [25,...,45,63] (1-based) ---
function parseRange(str, total) {
  if (!str) return Array.from({ length: total }, (_, i) => i + 1);
  const out = [];
  for (const part of str.split(',')) {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!m) continue;
    const a = +m[1], b = m[2] ? +m[2] : a;
    for (let p = a; p <= b; p++) out.push(p);
  }
  return out;
}

// --- renderizar una página del PDF a PNG base64 ---
async function pageToPngB64(doc, pageNum) {
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale: SCALE });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext('2d');
  // fondo blanco (los PDF escaneados a veces son transparentes)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  page.cleanup();
  return canvas.toBuffer('image/png').toString('base64');
}

// --- OCR de una imagen vía Ollama (en streaming) ---
// Usamos stream:true para que los headers lleguen de inmediato; así
// evitamos el "Headers Timeout" de fetch en páginas/arranques lentos.
async function ocrImage(b64) {
  const res = await fetch(`${HOST}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(600000), // techo duro de 10 min por página
    body: JSON.stringify({
      model: MODEL,
      prompt: PROMPT,
      images: [b64],
      stream: true,
      keep_alive: '5m',       // mantiene el modelo cargado entre páginas
      options: {
        temperature: 0,
        num_batch: NUM_BATCH,
        num_ctx: NUM_CTX,
        ...(NUM_GPU !== undefined ? { num_gpu: NUM_GPU } : {}),
      },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Ollama HTTP ${res.status}: ${t.slice(0, 300)}`);
  }
  // Ollama devuelve NDJSON: una línea JSON por token con {response, done}.
  let out = '';
  let buf = '';
  const decoder = new TextDecoder();
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const obj = JSON.parse(line);
      if (obj.error) throw new Error(`Ollama: ${obj.error}`);
      if (obj.response) out += obj.response;
    }
  }
  return out.trim();
}

// --- comprobar que Ollama responde y el modelo existe ---
async function preflight() {
  let tags;
  try {
    tags = await (await fetch(`${HOST}/api/tags`)).json();
  } catch {
    console.error(`ERROR: no puedo conectar con Ollama en ${HOST}.`);
    console.error('  Abre Ollama (debe quedar corriendo en la bandeja) y reintenta.');
    process.exit(1);
  }
  const names = (tags.models || []).map(m => m.name);
  if (!names.includes(MODEL)) {
    console.error(`ERROR: el modelo "${MODEL}" no está descargado.`);
    console.error(`  Ejecuta:  ollama pull ${MODEL}`);
    console.error(`  Modelos disponibles: ${names.join(', ') || '(ninguno)'}`);
    process.exit(1);
  }
}

await preflight();

const data = new Uint8Array(fs.readFileSync(inFile));
const doc = await getDocument({ data, useSystemFonts: true, canvasFactory: new NapiCanvasFactory() }).promise;
const total = doc.numPages;
const pages = parseRange(rangeArg, total).filter(p => p >= 1 && p <= total);
console.log(`PDF: ${total} págs | OCR de ${pages.length} págs: ${rangeArg || 'todas'} | modelo: ${MODEL} | ${DPI} DPI`);

let result = `===== OCR LOCAL de ${inFile} (páginas ${rangeArg || 'todas'}) — modelo ${MODEL} =====\n`;
for (const p of pages) {
  process.stdout.write(`  página ${p}/${total}... `);
  const t0 = Date.now();
  const b64 = await pageToPngB64(doc, p);
  const txt = await ocrImage(b64);
  result += `\n\n----- PÁGINA PDF ${p} -----\n` + txt;
  console.log(`ok (${((Date.now() - t0) / 1000).toFixed(1)}s, ${txt.length} chars)`);
}
fs.writeFileSync(outFile, result, 'utf8');
console.log(`\nListo -> ${outFile} (${result.length} caracteres)`);
