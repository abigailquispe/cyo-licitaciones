/**
 * generar_tex.mjs — Rellena la plantilla LaTeX con las consultas/observaciones
 * y compila a PDF con pdflatex (MiKTeX).
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const PLANTILLA = path.join(import.meta.dirname, 'plantilla_informe.tex');

// Escapa caracteres especiales de LaTeX (char por char: inequívoco y sin
// dobles escapes ni marcadores invisibles).
function esc(s) {
  if (s == null) return '';
  let out = '';
  for (const ch of String(s)) {
    switch (ch) {
      case '\\': out += '\\textbackslash{}'; break;
      case '&': case '%': case '$': case '#': case '_': case '{': case '}':
        out += '\\' + ch; break;
      case '~': out += '\\textasciitilde{}'; break;
      case '^': out += '\\textasciicircum{}'; break;
      case '"': out += "''"; break;
      default: out += ch;
    }
  }
  return out;
}

function filas(items) {
  return items.map((it, i) =>
    `${i + 1} & ${esc(it.capitulo)} & ${esc(it.numeral_literal)} & ${esc(it.pagina)} & ` +
    `${esc(it.texto_motivado)} & ${esc(it.norma)} \\\\\n\\hline`
  ).join('\n');
}

/**
 * generarInforme({items, meta, outDir, nombre}) -> { texPath, pdfPath, ok, log }
 * meta: { nomenclatura, objeto, entidad, participante }
 */
export function generarInforme({ items, meta = {}, outDir, nombre = 'informe' }) {
  const consultas = items.filter(i => i.tipo === 'consulta');
  const observaciones = items.filter(i => i.tipo === 'observacion');

  let tex = fs.readFileSync(PLANTILLA, 'utf8');
  const repl = {
    '%%NOMENCLATURA%%': esc(meta.nomenclatura || '[CONSIGNAR NOMENCLATURA]'),
    '%%OBJETO%%': esc(meta.objeto || '[CONSIGNAR OBJETO]'),
    '%%ENTIDAD%%': esc(meta.entidad || '[CONSIGNAR ENTIDAD]'),
    '%%PARTICIPANTE%%': esc(meta.participante || '[CONSIGNAR LA RAZÓN SOCIAL DEL PARTICIPANTE]'),
    '%%CONSULTAS%%': filas(consultas) || '\\multicolumn{6}{|c|}{\\textit{(sin consultas)}}\\\\\n\\hline',
    '%%OBSERVACIONES%%': filas(observaciones) || '\\multicolumn{6}{|c|}{\\textit{(sin observaciones)}}\\\\\n\\hline',
    '%%N_CONSULTAS%%': String(consultas.length),
    '%%N_OBS%%': String(observaciones.length),
    '%%TOTAL%%': String(items.length),
  };
  for (const [k, v] of Object.entries(repl)) tex = tex.split(k).join(v);

  fs.mkdirSync(outDir, { recursive: true });
  const base = nombre.replace(/[^\w.-]+/g, '_');
  const texPath = path.join(outDir, base + '.tex');
  fs.writeFileSync(texPath, tex, 'utf8');

  // Compilar 2x (longtable / lastpage)
  let log = '';
  for (let i = 0; i < 2; i++) {
    const r = spawnSync('pdflatex',
      ['-interaction=nonstopmode', '-halt-on-error', '-output-directory', outDir, texPath],
      { encoding: 'utf8' });
    log = (r.stdout || '') + (r.stderr || '');
  }
  const pdfPath = path.join(outDir, base + '.pdf');
  return { texPath, pdfPath, ok: fs.existsSync(pdfPath), log: log.slice(-1500) };
}
