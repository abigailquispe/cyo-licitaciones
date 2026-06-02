/**
 * locate_capitulos.mjs — Extracción híbrida (pdfjs + PaddleOCR) y ubicación de
 * los Capítulos III (Requerimiento/TDR + Requisitos de Calificación) y IV
 * (Factores de Evaluación) de un PDF de bases.
 *
 * Reutiliza la lógica probada de procesar_concurso.mjs (clasificación
 * texto/imagen) y de paddle_ocr.py (OCR local de las páginas-imagen).
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const PY = path.join(ROOT, '.venv', 'Scripts', 'python.exe');
const PADDLE = path.join(ROOT, 'paddle_ocr.py');
const MIN_REAL_CHARS = 60; // igual que procesar_concurso.mjs

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// rango [3,4,5,9] -> "3-5,9"
function toRange(pages) {
  const r = [];
  for (const p of pages) {
    const last = r[r.length - 1];
    if (last && p === last[1] + 1) last[1] = p; else r.push([p, p]);
  }
  return r.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(',');
}

// --- 1) Extraer texto por página con pdfjs ---
async function extraerTexto(pdfPath) {
  const raw = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await getDocument({ data: raw, useSystemFonts: true }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    let lastY = null, txt = '';
    for (const it of tc.items) {
      if (lastY !== null && it.transform && lastY !== it.transform[5]) txt += '\n';
      txt += it.str;
      if (it.transform) lastY = it.transform[5];
    }
    pages.push(txt.trim());
  }
  return { numPages: doc.numPages, pages };
}

// --- 2) boilerplate repetido + clasificación texto/imagen ---
function detectarImagenes(pages, numPages) {
  const freq = new Map();
  for (const t of pages) {
    const seen = new Set();
    for (let line of t.split('\n')) {
      line = line.trim();
      if (line.length < 4 || seen.has(line)) continue;
      seen.add(line);
      freq.set(line, (freq.get(line) || 0) + 1);
    }
  }
  const boiler = new Set([...freq].filter(([, c]) => c >= numPages * 0.3).map(([l]) => l));
  const realChars = (t) => t.split('\n').map(l => l.trim())
    .filter(l => !boiler.has(l)).join(' ').replace(/[0-9\s]/g, '').length;
  const imagePages = [];
  for (let i = 0; i < pages.length; i++) {
    if (realChars(pages[i]) < MIN_REAL_CHARS) imagePages.push(i + 1);
  }
  return imagePages;
}

// --- 3) OCR de páginas-imagen con PaddleOCR (child process) ---
function ocrPaddle(pdfPath, rangeStr, onProgress) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(PY)) return reject(new Error(`No existe el venv de Python en ${PY}`));
    const tmp = path.join(os.tmpdir(), `ocr_${Date.now()}.txt`);
    const env = { ...process.env, OCR_ORIENT: '1', OCR_DPI: process.env.OCR_DPI || '200' };
    const child = spawn(PY, [PADDLE, pdfPath, tmp, rangeStr], { env });
    let err = '';
    child.stderr.on('data', d => { err += d; });
    child.stdout.on('data', d => {
      const m = String(d).match(/pagina\s+(\d+)\/(\d+)/i);
      if (m && onProgress) onProgress(`OCR página ${m[1]}/${m[2]}`);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`PaddleOCR salió con código ${code}: ${err.slice(-400)}`));
      const out = fs.existsSync(tmp) ? fs.readFileSync(tmp, 'utf8') : '';
      try { fs.unlinkSync(tmp); } catch {}
      // parsear "----- PAGINA PDF N -----"
      const map = {};
      const parts = out.split(/----- PAGINA PDF (\d+) -----/);
      for (let i = 1; i < parts.length; i += 2) map[+parts[i]] = (parts[i + 1] || '').trim();
      resolve(map);
    });
  });
}

// --- 3b) OCR PROGRESIVO con corte temprano (PDF 100% escaneado) ---
// OCR página por página (un solo proceso, el modelo se carga una vez) y se
// detiene en cuanto onPage() devuelve true (al llegar al Capítulo V), evitando
// OCR del resto del documento (proforma + anexos).
function ocrProgresivo(pdfPath, startPage, numPages, onProgress, onPage) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(PY)) return reject(new Error(`No existe el venv de Python en ${PY}`));
    const tmp = path.join(os.tmpdir(), `ocrp_${Date.now()}.txt`);
    // PYTHONUNBUFFERED/-u por si acaso; pero el corte se basa en LEER el archivo
    // de salida (PaddleOCR hace flush por página), no en el stdout con buffer.
    const env = { ...process.env, OCR_ORIENT: '1', OCR_DPI: process.env.OCR_DPI || '200', PYTHONUNBUFFERED: '1' };
    const child = spawn(PY, ['-u', PADDLE, pdfPath, tmp, `${startPage}-${numPages}`], { env });
    let err = '', stopped = false;
    const parseFile = () => {
      const out = fs.existsSync(tmp) ? fs.readFileSync(tmp, 'utf8') : '';
      const map = {};
      const parts = out.split(/----- PAGINA PDF (\d+) -----/);
      for (let i = 1; i < parts.length; i += 2) map[+parts[i]] = (parts[i + 1] || '').trim();
      return map;
    };
    let visto = 0; // mayor página ya entregada a onPage
    const timer = setInterval(() => {
      if (stopped) return;
      const map = parseFile();
      const nums = Object.keys(map).map(Number).sort((a, b) => a - b);
      for (const n of nums) {
        if (n <= visto) continue;
        visto = n;
        if (onProgress) onProgress(`OCR página ${n} (buscando Cap. III–IV)`);
        if (onPage && onPage(n, map[n])) {
          stopped = true;
          try { child.kill(); } catch {}
          break;
        }
      }
    }, 1500);
    child.stderr.on('data', d => { err += d; });
    child.on('error', (e) => { clearInterval(timer); reject(e); });
    child.on('close', () => {
      clearInterval(timer);
      const map = parseFile();
      try { fs.unlinkSync(tmp); } catch {}
      if (!Object.keys(map).length && err) return reject(new Error(`PaddleOCR: ${err.slice(-300)}`));
      resolve(map);
    });
  });
}

// --- 4) localizar Cap III y IV sobre el texto por página ---
// Las bases tienen DOS secciones (General y Específica), cada una con sus
// capítulos, más referencias cruzadas en el texto corrido. Por eso no basta la
// primera mención: anclamos al ENCABEZADO real = una línea corta "CAPÍTULO X"
// seguida (en las líneas siguientes) por su TÍTULO característico.
function tieneEncabezado(pageText, romanRe, titleRe, soloTitulo = null) {
  const lines = pageText.split('\n').map(l => norm(l).trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    if (soloTitulo && soloTitulo.test(lines[i])) return true;
    if (romanRe.test(lines[i]) && lines[i].length <= 16) {
      for (let k = i + 1; k < Math.min(i + 4, lines.length); k++) {
        if (titleRe.test(lines[k])) return true;
      }
    }
  }
  return false;
}

export function ubicarCapitulos(pageTexts) {
  const esIII = (t) => tieneEncabezado(t, /^capitulo\s+iii\b/,
    /terminos de referencia|requerimiento/, /^terminos de referencia\s+n/);
  const esIV = (t) => tieneEncabezado(t, /^capitulo\s+iv\b/, /evaluacion de ofertas/);
  const esV = (t) => tieneEncabezado(t, /^capitulo\s+v\b/, /proforma del contrato/);

  let startIII = -1, startIV = -1, startV = -1;
  for (let i = 0; i < pageTexts.length; i++) {
    if (startIII < 0 && esIII(pageTexts[i])) startIII = i;
    if (startIV < 0 && i !== startIII && esIV(pageTexts[i])) startIV = i;
  }
  if (startIV >= 0) {
    for (let i = startIV + 1; i < pageTexts.length; i++) {
      if (esV(pageTexts[i])) { startV = i; break; }
    }
  }
  return { startIII, startIV, startV };
}

/**
 * Procesa el PDF y devuelve el texto de Cap III+IV listo para análisis.
 * onProgress({step, message})
 */
const esCapV = (t) => tieneEncabezado(t, /^capitulo\s+v\b/, /proforma del contrato/);

export async function procesarBases(pdfPath, { onProgress = () => {}, ocrEnabled = true, startHint = 0 } = {}) {
  onProgress({ step: 'extraer', message: 'Extrayendo texto del PDF…' });
  const { numPages, pages } = await extraerTexto(pdfPath);
  const pageTexts = pages.slice();

  const imagePages = detectarImagenes(pages, numPages);
  onProgress({ step: 'detectar', message: `${numPages} páginas | ${imagePages.length} son imagen` });

  let modoOCR = 'ninguno';
  if (ocrEnabled && imagePages.length) {
    // Camino 1: si los encabezados ya se leen con pdfjs (PDF mixto), OCR solo
    // las páginas-imagen DENTRO del rango Cap III–(V|fin).
    let loc = ubicarCapitulos(pageTexts);
    if (loc.startIII >= 0 && loc.startIV >= 0) {
      const hasta = loc.startV >= 0 ? loc.startV : numPages;
      const objetivo = imagePages.filter(n => n - 1 >= loc.startIII && n - 1 < hasta);
      modoOCR = `rango Cap III–IV (${objetivo.length} págs-imagen)`;
      if (objetivo.length) {
        onProgress({ step: 'ocr', message: `OCR de ${objetivo.length} páginas-imagen del rango Cap III–IV…` });
        const map = await ocrPaddle(pdfPath, toRange(objetivo), (m) => onProgress({ step: 'ocr', message: m }));
        for (const [n, t] of Object.entries(map)) pageTexts[+n - 1] = t;
      }
    } else {
      // Camino 2: PDF 100% escaneado -> OCR progresivo con corte al llegar al Cap V.
      const start = startHint > 0 ? Math.min(startHint, numPages) : 1;
      modoOCR = `progresivo desde pág ${start}, corte en Cap. V`;
      onProgress({ step: 'ocr', message: `OCR progresivo desde la página ${start} (se detiene al llegar al Cap. V)…` });
      const map = await ocrProgresivo(pdfPath, start, numPages,
        (m) => onProgress({ step: 'ocr', message: m }),
        (n, txt) => { pageTexts[n - 1] = txt; return esCapV(txt); });
      for (const [n, t] of Object.entries(map)) if (!pageTexts[+n - 1]) pageTexts[+n - 1] = t;
    }
  }

  // Ubicar capítulos sobre el texto final (pdfjs + OCR)
  onProgress({ step: 'ubicar', message: 'Ubicando Capítulos III y IV…' });
  const { startIII, startIV, startV } = ubicarCapitulos(pageTexts);

  const desde = startIII >= 0 ? startIII : (startHint > 0 ? startHint - 1 : 0);
  const hasta = startV >= 0 ? startV : pageTexts.length; // exclusivo
  const slice = [];
  for (let i = desde; i < hasta; i++) slice.push(`\n\n===== PÁGINA PDF ${i + 1} =====\n${pageTexts[i] || ''}`);
  const capText = slice.join('');
  const fullText = pageTexts.map((t, i) => `\n\n===== PÁGINA PDF ${i + 1} =====\n${t || ''}`).join('');

  return {
    numPages, imagePages, modoOCR,
    encontrado: { capIII: startIII >= 0, capIV: startIV >= 0 },
    indices: { startIII: startIII + 1, startIV: startIV + 1, startV: startV >= 0 ? startV + 1 : null },
    capText, fullText,
  };
}
