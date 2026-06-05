/**
 * server.mjs — App local: sube un PDF de bases y obtén el informe de Consultas
 * y Observaciones (Cap. III y IV) en PDF.
 *
 *   npm run app   ->   http://localhost:3000
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import express from 'express';
import multer from 'multer';
import { procesarBases } from './locate_capitulos.mjs';
import { analizar, backendDisponible } from './analizar.mjs';
import { generarInforme } from './generar_tex.mjs';
import { generarInformeDocx } from './generar_docx.mjs';

const DIR = import.meta.dirname;
const UPLOADS = path.join(DIR, 'uploads');
const OUT = path.join(DIR, 'salidas');
fs.mkdirSync(UPLOADS, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const upload = multer({ dest: UPLOADS, limits: { fileSize: 80 * 1024 * 1024 } });
const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(DIR, 'public')));

const jobs = new Map(); // jobId -> { step, message, done, error, items, meta, capText, pdf }

function setJob(id, patch) {
  jobs.set(id, { ...(jobs.get(id) || {}), ...patch });
}

// Inferir datos del encabezado a partir del texto.
function inferirMeta(fullText) {
  const m = {};
  const nom = fullText.match(/CONCURSO\s+P[UÚ]BLICO[^\n]{0,70}?N[.°º]\s*[\d\-A-Z\/]+/i);
  if (nom) m.nomenclatura = nom[0].replace(/\s+/g, ' ').trim();
  const obj = fullText.match(/(?:OBJETO DE LA CONTRATACI[OÓ]N|Contrataci[oó]n del [Ss]ervicio)[:\s]*([^\n]{5,120})/i);
  if (obj) m.objeto = obj[1].replace(/\s+/g, ' ').trim();
  const ent = fullText.match(/(?:Nombre|Entidad)\s*:?\s*(Despacho Presidencial|Municipalidad[^\n]{0,60}|[A-ZÁÉÍÓÚÑ][^\n]{3,60})/);
  if (ent) m.entidad = ent[1].replace(/\s+/g, ' ').trim();
  return m;
}

// --- Procesar PDF (extracción + OCR + análisis) en segundo plano ---
async function procesar(id, pdfPath, startHint = 0, analizarTodo = false) {
  try {
    const onProgress = (p) => setJob(id, { step: p.step, message: p.message });
    const r = await procesarBases(pdfPath, { onProgress, startHint, analizarTodo });
    const meta = inferirMeta(r.fullText);
    setJob(id, { capText: r.capText, meta, encontrado: r.encontrado, imagePages: r.imagePages });

    let items = [];
    if (backendDisponible()) {
      const a = await analizar(r.capText, { onProgress });
      items = a.items;
      setJob(id, { modelo: a.modelo });
    } else {
      setJob(id, { message: 'Sin motor de análisis: modo manual (tabla vacía editable).' });
    }
    setJob(id, { step: 'listo', message: 'Borrador listo para revisar.', done: true, items });
  } catch (e) {
    setJob(id, { step: 'error', error: String(e.message || e), done: true });
  }
}

app.post('/api/analyze', upload.single('pdf'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo PDF.' });
  const id = crypto.randomBytes(6).toString('hex');
  const nombre = (req.file.originalname || 'bases.pdf').replace(/\.pdf$/i, '');
  const startHint = parseInt(req.body.startHint, 10) || 0;
  const analizarTodo = req.body.analizarTodo === 'true' || req.body.analizarTodo === 'on';
  setJob(id, { step: 'inicio', message: 'En cola…', done: false, pdfPath: req.file.path, nombre });
  procesar(id, req.file.path, startHint, analizarTodo); // async, no await
  res.json({ jobId: id });
});

app.get('/api/status/:id', (req, res) => {
  const j = jobs.get(req.params.id);
  if (!j) return res.status(404).json({ error: 'job no encontrado' });
  res.json({
    step: j.step, message: j.message, done: !!j.done, error: j.error,
    items: j.items || [], meta: j.meta || {}, encontrado: j.encontrado,
    imagePages: j.imagePages, modelo: j.modelo, hasPdf: !!j.pdf,
  });
});

app.post('/api/generate', (req, res) => {
  const { jobId, items, meta } = req.body || {};
  const j = jobs.get(jobId);
  if (!j) return res.status(404).json({ error: 'job no encontrado' });
  try {
    const r = generarInforme({
      items: items || [], meta: meta || {}, outDir: OUT,
      nombre: 'consultas_observaciones_' + (j.nombre || jobId),
    });
    if (!r.ok) return res.status(500).json({ error: 'pdflatex falló', log: r.log });
    setJob(jobId, { pdf: r.pdfPath, tex: r.texPath, items });
    res.json({ ok: true, downloadUrl: `/api/download/${jobId}` });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/download/:id', (req, res) => {
  const j = jobs.get(req.params.id);
  if (!j || !j.pdf || !fs.existsSync(j.pdf)) return res.status(404).send('PDF no disponible');
  res.download(j.pdf, path.basename(j.pdf));
});

// Genera el informe en Word (.docx) con la plantilla SUSALUD.
app.post('/api/generate-docx', async (req, res) => {
  const { jobId, items, meta } = req.body || {};
  const j = jobs.get(jobId);
  if (!j) return res.status(404).json({ error: 'job no encontrado' });
  try {
    const r = await generarInformeDocx({
      items: items || [], meta: meta || {}, outDir: OUT,
      nombre: 'consultas_observaciones_' + (j.nombre || jobId),
    });
    if (!r.ok) return res.status(500).json({ error: 'no se pudo generar el .docx' });
    setJob(jobId, { docx: r.docxPath, items });
    res.json({ ok: true, downloadUrl: `/api/download-docx/${jobId}` });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/download-docx/:id', (req, res) => {
  const j = jobs.get(req.params.id);
  if (!j || !j.docx || !fs.existsSync(j.docx)) return res.status(404).send('Word no disponible');
  res.download(j.docx, path.basename(j.docx));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  const b = backendDisponible();
  const modo = b === 'cli' ? 'Claude Code (suscripción)' : b === 'api' ? 'API de Claude' : 'modo manual (sin motor)';
  console.log(`\n  App lista -> http://localhost:${PORT}   [análisis: ${modo}]\n`);
});
