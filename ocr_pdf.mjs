/**
 * ocr_pdf.mjs — Extrae el TEXTO de páginas que vienen como IMAGEN en un PDF
 * (páginas escaneadas/sin capa de texto, p. ej. el TDR de las bases), usando la
 * API de Anthropic (Claude lee PDF directamente, sin renderizar imágenes).
 *
 * REQUISITOS:
 *   - Variable de entorno ANTHROPIC_API_KEY con tu clave.
 *   - npm install @anthropic-ai/sdk pdf-lib   (ya instalado en este repo)
 *
 * USO:
 *   # 1) Detectar qué páginas son imagen:
 *   node audit_pdf.mjs
 *   # 2) OCR solo de esas páginas (rango 1-based del PDF):
 *   node ocr_pdf.mjs "input/concurso.pdf" "processed/concurso_TDR_ocr.txt" "25-45,63"
 *   # Si omites el rango, procesa TODO el PDF.
 *
 * COSTO: se paga por tokens a Anthropic. OCR de ~20 páginas ≈ unos pocos
 * centavos de dólar con Sonnet. Ajusta el modelo abajo si quieres.
 */
import fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import Anthropic from '@anthropic-ai/sdk';

const [,, inFile, outFile, rangeArg] = process.argv;
if (!inFile || !outFile) {
  console.error('Uso: node ocr_pdf.mjs <entrada.pdf> <salida.txt> [rango ej "25-45,63"]');
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ERROR: falta la variable de entorno ANTHROPIC_API_KEY.');
  console.error('  PowerShell:  $env:ANTHROPIC_API_KEY = "sk-ant-..."');
  process.exit(1);
}

const MODEL = process.env.OCR_MODEL || 'claude-sonnet-4-6'; // OCR fiable y económico
const BATCH = 10; // páginas por llamada (evita respuestas demasiado largas)

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

const client = new Anthropic();

async function ocrSubset(srcDoc, pages1) {
  // Construir un PDF temporal solo con esas páginas
  const sub = await PDFDocument.create();
  const copied = await sub.copyPages(srcDoc, pages1.map(p => p - 1));
  copied.forEach(pg => sub.addPage(pg));
  const bytes = await sub.save();
  const b64 = Buffer.from(bytes).toString('base64');

  // Reintentos con backoff ante errores transitorios del API (429/500/overloaded).
  let lastErr;
  for (let intento = 1; intento <= 4; intento++) {
    try {
      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: 8000,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
            { type: 'text', text:
              'Transcribe FIELMENTE todo el texto de estas páginas, en español, ' +
              'respetando numerales, viñetas y el contenido de las tablas (usa ' +
              'tabulaciones o guiones para las columnas). No resumas, no interpretes, ' +
              'no agregues comentarios: solo el texto tal como aparece. Si una página ' +
              'es una carátula con poco texto, indícalo entre corchetes.' },
          ],
        }],
      });
      return msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    } catch (e) {
      lastErr = e;
      const espera = intento * 8000; // 8s, 16s, 24s
      process.stdout.write(`(error: ${e.status || e.message}; reintento ${intento}/4 en ${espera/1000}s) `);
      await new Promise(r => setTimeout(r, espera));
    }
  }
  throw lastErr;
}

const data = fs.readFileSync(inFile);
const srcDoc = await PDFDocument.load(data);
const total = srcDoc.getPageCount();
const pages = parseRange(rangeArg, total).filter(p => p >= 1 && p <= total);
console.log(`PDF: ${total} págs | OCR de ${pages.length} págs: ${rangeArg || 'todas'} | modelo: ${MODEL}`);

let result = `===== OCR de ${inFile} (páginas ${rangeArg || 'todas'}) — modelo ${MODEL} =====\n`;
let fallidas = [];
for (let i = 0; i < pages.length; i += BATCH) {
  const chunk = pages.slice(i, i + BATCH);
  process.stdout.write(`  procesando páginas ${chunk[0]}-${chunk[chunk.length-1]}... `);
  let txt;
  try {
    txt = await ocrSubset(srcDoc, chunk);
    console.log('ok');
  } catch (e) {
    txt = `[OCR FALLIDO en páginas ${chunk[0]}-${chunk[chunk.length-1]}: ${e.status || e.message}]`;
    fallidas.push(`${chunk[0]}-${chunk[chunk.length-1]}`);
    console.log('FALLÓ (se continúa)');
  }
  result += `\n\n----- PÁGINAS PDF ${chunk[0]}-${chunk[chunk.length-1]} -----\n` + txt;
  fs.writeFileSync(outFile, result, 'utf8'); // escritura INCREMENTAL: no se pierde avance
}
console.log(`\nListo -> ${outFile} (${result.length} caracteres)` +
  (fallidas.length ? ` | LOTES FALLIDOS: ${fallidas.join(', ')} (reintentar ese rango)` : ''));
