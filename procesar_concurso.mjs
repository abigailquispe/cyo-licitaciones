/**
 * procesar_concurso.mjs — Pipeline HÍBRIDO automático para un PDF de bases:
 *   - Páginas con capa de texto (legibles)  -> extracción gratis con pdfjs.
 *   - Páginas que son FOTO/imagen (sin texto) -> OCR con la API de Anthropic.
 * Produce UN solo .txt completo, página por página, indicando el método usado.
 *
 * Esto es justo lo pedido: "usar la API solo cuando es foto; cuando es legible,
 * no (python/pdfjs)".
 *
 * USO:
 *   $env:ANTHROPIC_API_KEY = "sk-ant-..."        # solo si hay páginas-imagen
 *   node procesar_concurso.mjs "input/concurso.pdf" "processed/concurso_COMPLETO.txt"
 *
 * Si no hay ANTHROPIC_API_KEY, igual procesa las páginas legibles y deja
 * marcadas las páginas-imagen como [PENDIENTE OCR].
 */
import fs from 'fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument } from 'pdf-lib';

const [,, inFile, outFile] = process.argv;
if (!inFile || !outFile) {
  console.error('Uso: node procesar_concurso.mjs <entrada.pdf> <salida.txt>');
  process.exit(1);
}
const MODEL = process.env.OCR_MODEL || 'claude-sonnet-4-6';
const BATCH = 10;
const MIN_REAL_CHARS = 60; // texto real (sin encabezados) por debajo => imagen

// ---------- 1) Extraer texto por página con pdfjs ----------
const raw = new Uint8Array(fs.readFileSync(inFile));
const doc = await getDocument({ data: raw, useSystemFonts: true }).promise;
const pagesText = [];
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const tc = await page.getTextContent();
  let last = null, txt = '';
  for (const it of tc.items) {
    if (last !== null && it.transform && last !== it.transform[5]) txt += '\n';
    txt += it.str;
    if (it.transform) last = it.transform[5];
  }
  pagesText.push(txt.trim());
}

// ---------- 2) Detectar encabezados/pies repetidos (boilerplate genérico) ----------
const freq = new Map();
for (const t of pagesText) {
  const seen = new Set();
  for (let line of t.split('\n')) {
    line = line.trim();
    if (line.length < 4) continue;
    if (seen.has(line)) continue; seen.add(line);
    freq.set(line, (freq.get(line) || 0) + 1);
  }
}
const boiler = new Set([...freq].filter(([,c]) => c >= doc.numPages * 0.3).map(([l]) => l));

// ---------- 3) Clasificar cada página: texto vs imagen ----------
function realChars(t) {
  return t.split('\n')
    .map(l => l.trim()).filter(l => !boiler.has(l))
    .join(' ').replace(/[0-9\s]/g, '').length;
}
const imagePages = [];
for (let i = 0; i < pagesText.length; i++) {
  if (realChars(pagesText[i]) < MIN_REAL_CHARS) imagePages.push(i + 1);
}
console.log(`PDF: ${doc.numPages} págs | legibles: ${doc.numPages - imagePages.length} | imagen (OCR): ${imagePages.length}`);
console.log(`Páginas-imagen: ${imagePages.join(', ') || 'ninguna'}`);

// ---------- 4) OCR de las páginas-imagen (solo si hay API key) ----------
const ocrText = {}; // { pageNum: texto }
if (imagePages.length && process.env.ANTHROPIC_API_KEY) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();
  // Releer el archivo: pdfjs transfiere/consume el buffer original.
  const srcDoc = await PDFDocument.load(fs.readFileSync(inFile));
  for (let i = 0; i < imagePages.length; i += BATCH) {
    const chunk = imagePages.slice(i, i + BATCH);
    process.stdout.write(`  OCR páginas ${chunk[0]}-${chunk[chunk.length-1]}... `);
    const sub = await PDFDocument.create();
    const cp = await sub.copyPages(srcDoc, chunk.map(p => p - 1));
    cp.forEach(pg => sub.addPage(pg));
    const b64 = Buffer.from(await sub.save()).toString('base64');
    const msg = await client.messages.create({
      model: MODEL, max_tokens: 8000,
      messages: [{ role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
        { type: 'text', text: 'Transcribe FIELMENTE todo el texto de estas páginas en español, ' +
          'respetando numerales, viñetas y tablas. Antepón a cada página un marcador ' +
          '"@@@PAGINA_OCR@@@". No resumas ni comentes.' },
      ]}],
    });
    const out = msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    const parts = out.split('@@@PAGINA_OCR@@@').map(s => s.trim()).filter(Boolean);
    chunk.forEach((p, k) => { ocrText[p] = parts[k] || out; });
    console.log('ok');
  }
} else if (imagePages.length) {
  console.log('  (sin ANTHROPIC_API_KEY: las páginas-imagen quedan como [PENDIENTE OCR])');
}

// ---------- 5) Merge en un solo .txt ----------
let result = `===== ${inFile} — texto COMPLETO (híbrido pdfjs + OCR API) =====\n`;
let nText = 0, nOcr = 0;
for (let i = 1; i <= doc.numPages; i++) {
  const isImg = imagePages.includes(i);
  let body, method;
  if (isImg) {
    if (ocrText[i]) { body = ocrText[i]; method = 'OCR-API'; nOcr++; }
    else { body = '[PENDIENTE OCR — página imagen]'; method = 'IMAGEN-SIN-OCR'; }
  } else { body = pagesText[i - 1]; method = 'pdfjs'; nText++; }
  result += `\n\n===== PÁGINA ${i} [${method}] =====\n${body}`;
}
fs.writeFileSync(outFile, result, 'utf8');
console.log(`\nListo -> ${outFile} | pdfjs: ${nText} págs, OCR: ${nOcr} págs (${result.length} chars)`);
