/**
 * analizar.mjs — Análisis legal del texto de Cap III/IV con Claude.
 *
 * Dos motores (configurable con ANALYSIS_BACKEND = 'cli' | 'api'):
 *   - 'cli' (por defecto si NO hay ANTHROPIC_API_KEY): usa la CLI `claude -p`
 *     headless → aprovecha tu suscripción de Claude Code, SIN API key.
 *   - 'api': usa @anthropic-ai/sdk (requiere ANTHROPIC_API_KEY).
 * Cada cita se verifica verbatim contra el texto de las bases.
 */
import fs from 'fs';
import path from 'path';
import { spawn, execSync } from 'child_process';

const SYSTEM = fs.readFileSync(path.join(import.meta.dirname, 'prompts', 'system_analisis.md'), 'utf8');
const MODEL = process.env.ANALYSIS_MODEL || 'claude-sonnet-4-6';

const EJEMPLOS = `# Ejemplos del formato y nivel esperado (de un caso anterior)
[
  {"tipo":"consulta","capitulo":"Capítulo III — TDR","numeral_literal":"6.2, lit. q)","pagina":"31","cita_textual":"debiendo ser del mismo fabricante o dueño de la marca","texto_motivado":"El TDR dispone que la herramienta de reportes debe ser «del mismo fabricante o dueño de la marca». Solicitamos a la Entidad confirmar que se admiten soluciones de fabricante distinto que cumplan las funcionalidades requeridas, a fin de no restringir la contratación a un único fabricante.","norma":"Art. 5.1 h) y o) Ley N.° 32069; Art. 44.6 del Reglamento."},
  {"tipo":"observacion","capitulo":"Capítulo III — TDR","numeral_literal":"6.3.1, lit. c) y g)","pagina":"32-33","cita_textual":"Deberá estar basado en tecnología ASIC y ser capaz de brindar una solución de \\"Complete Content Protection\\"","texto_motivado":"El término «Complete Content Protection», asociado a tecnología ASIC, corresponde a terminología propietaria de un fabricante específico, y la referencia al cuadrante de líderes de Gartner cierra la concurrencia. Solicitamos eliminar los términos propietarios y describir las funcionalidades de modo neutral, admitiendo soluciones equivalentes.","norma":"Art. 44.6 del Reglamento (D.S. N.° 009-2025-EF); Art. 5.1 h) y j) Ley N.° 32069."},
  {"tipo":"observacion","capitulo":"Capítulo IV — Factores de Evaluación","numeral_literal":"Factor F (Integridad en la Contratación Pública)","pagina":"60","cita_textual":"INTEGRIDAD EN LA CONTRATACIÓN PÚBLICA ... 10 puntos","texto_motivado":"El factor de Integridad en la Contratación Pública asigna 10 puntos, cuando el Cuadro Resumen de la Base Estándar fija para ese factor un MÁXIMO de 5 puntos. La Entidad debe respetar el puntaje aprobado por directiva (Art. 55 del Reglamento) y no puede ampliarlo. Solicitamos reducir el factor a un máximo de 5 puntos.","norma":"Art. 55 del Reglamento (D.S. N.° 009-2025-EF); Bases Estándar — Cuadro Resumen de Factores de Evaluación."},
  {"tipo":"observacion","capitulo":"Capítulo IV — Factores de Evaluación","numeral_literal":"Cuadro Resumen de Factores","pagina":"50","cita_textual":"SOSTENIBILIDAD AMBIENTAL 20 puntos ... INTEGRIDAD EN LA CONTRATACIÓN PÚBLICA 40 puntos ... SISTEMA DE GESTIÓN DE LA CALIDAD 40 puntos","texto_motivado":"La evaluación técnica asigna la totalidad de los 100 puntos a factores que consisten exclusivamente en la tenencia de certificaciones de gestión, por lo que no mide la idoneidad técnica de la oferta para el objeto convocado. Ello es desproporcionado y restringe la competencia, favoreciendo a las empresas con dichas certificaciones, cuando la Base Estándar prevé otros factores vinculados al objeto (experiencia adicional del postor y del personal clave, mejoras a los TDR, plazo). Solicitamos reponderar los factores incorporando factores vinculados al objeto y respetando los topes de la Base Estándar.","norma":"Art. 5.1 h), j) y k) Ley N.° 32069; Art. 55 y Art. 75 del Reglamento (D.S. N.° 009-2025-EF); Bases Estándar — Cuadro Resumen de Factores."}
]`;

const INSTRUCCION_JSON =
  'Responde ÚNICAMENTE con un arreglo JSON válido (sin texto antes ni después, ' +
  'sin ```), donde cada elemento tiene EXACTAMENTE estas claves: "tipo" ' +
  '("consulta"|"observacion"), "capitulo", "numeral_literal", "pagina", ' +
  '"cita_textual" (verbatim del texto), "texto_motivado", "norma".';

const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Extrae el arreglo JSON de una salida que puede traer envoltura o ruido.
function extraerJSON(text) {
  let t = (text || '').trim();
  // si es la envoltura {result, ...} de --output-format json
  try {
    const o = JSON.parse(t);
    if (Array.isArray(o)) return o;
    if (o && typeof o.result === 'string') t = o.result.trim();
    else if (o && Array.isArray(o.items)) return o.items;
  } catch {}
  t = t.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const a = t.indexOf('['), b = t.lastIndexOf(']');
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error('No se pudo extraer JSON de la respuesta del análisis.');
}

// ¿Está disponible la CLI de Claude? (multiplataforma)
function claudeDisponible() {
  if (process.env.CLAUDE_EXE) return fs.existsSync(process.env.CLAUDE_EXE);
  try {
    execSync(process.platform === 'win32' ? 'where claude' : 'command -v claude', { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

// --- Motor CLI (suscripción, sin API key) ---
function analizarCLI(capText, onProgress) {
  return new Promise((resolve, reject) => {
    if (!claudeDisponible()) return reject(new Error('No se encontró la CLI de Claude. Instala/loguéate en Claude Code, define CLAUDE_EXE, o usa ANTHROPIC_API_KEY.'));
    onProgress({ step: 'analizar', message: 'Analizando con Claude Code (suscripción)…' });
    const prompt = `${SYSTEM}\n\n${EJEMPLOS}\n\n${INSTRUCCION_JSON}\n\n` +
      `===== TEXTO DE LAS BASES (CAP. III y IV) =====\n${capText}`;
    // Si hay CLAUDE_EXE se ejecuta directo; si no, se invoca "claude" vía shell
    // (resuelve el .cmd/.ps1 en Windows y el script en Mac/Linux).
    const exe = process.env.CLAUDE_EXE;
    const args = ['-p', '--output-format', 'json'];
    const child = exe
      ? spawn(exe, args, { stdio: ['pipe', 'pipe', 'pipe'] })
      : spawn('claude', args, { stdio: ['pipe', 'pipe', 'pipe'], shell: true });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`claude CLI salió con código ${code}: ${err.slice(-300)}`));
      try { resolve(extraerJSON(out)); } catch (e) { reject(e); }
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

// --- Motor API (requiere ANTHROPIC_API_KEY) ---
async function analizarAPI(capText, onProgress) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();
  onProgress({ step: 'analizar', message: `Analizando con API (${MODEL})…` });
  const TOOL = {
    name: 'registrar_items',
    description: 'Registra la lista de consultas y observaciones.',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              tipo: { type: 'string', enum: ['consulta', 'observacion'] },
              capitulo: { type: 'string' }, numeral_literal: { type: 'string' },
              pagina: { type: 'string' }, cita_textual: { type: 'string' },
              texto_motivado: { type: 'string' }, norma: { type: 'string' },
            },
            required: ['tipo', 'capitulo', 'numeral_literal', 'pagina', 'cita_textual', 'texto_motivado', 'norma'],
          },
        },
      },
      required: ['items'],
    },
  };
  const msg = await client.messages.create({
    model: MODEL, max_tokens: 8000,
    system: SYSTEM + '\n\n' + EJEMPLOS,
    tools: [TOOL], tool_choice: { type: 'tool', name: 'registrar_items' },
    messages: [{ role: 'user', content:
      'Texto de los Capítulos III y IV de las bases (con marcadores de página). ' +
      'Formula las consultas y observaciones siguiendo TODAS las reglas. Copia las ' +
      'citas VERBATIM.\n\n===== TEXTO =====\n' + capText }],
  });
  const tu = msg.content.find(b => b.type === 'tool_use');
  return (tu && tu.input && Array.isArray(tu.input.items)) ? tu.input.items : [];
}

export function backendDisponible() {
  if (process.env.ANALYSIS_BACKEND === 'api') return process.env.ANTHROPIC_API_KEY ? 'api' : null;
  if (process.env.ANALYSIS_BACKEND === 'cli') return claudeDisponible() ? 'cli' : null;
  if (process.env.ANTHROPIC_API_KEY) return 'api';
  if (claudeDisponible()) return 'cli';
  return null;
}

export async function analizar(capText, { onProgress = () => {} } = {}) {
  const backend = backendDisponible();
  if (!backend) throw new Error('No hay motor de análisis (ni CLI de Claude ni ANTHROPIC_API_KEY).');
  let items = backend === 'cli'
    ? await analizarCLI(capText, onProgress)
    : await analizarAPI(capText, onProgress);

  // Verificar cada cita verbatim contra el texto.
  const haystack = norm(capText);
  items = items.map(it => ({ ...it, verificada: it.cita_textual ? haystack.includes(norm(it.cita_textual)) : false }));
  const nVerif = items.filter(i => i.verificada).length;
  onProgress({ step: 'analizar', message: `${items.length} items (${nVerif} con cita verificada) — motor ${backend}` });
  return { items, modelo: backend === 'cli' ? 'Claude Code (suscripción)' : MODEL, backend };
}
