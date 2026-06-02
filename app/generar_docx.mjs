/**
 * generar_docx.mjs — Genera el informe en Word (.docx) replicando el formato de
 * la plantilla SUSALUD: título, bloque de datos (Nomenclatura/Objeto/Participante)
 * y UNA tabla combinada (consultas y observaciones, numeración única) con las
 * columnas: N° de orden | Acápite de las Bases (Sección · Numeral y Literal ·
 * Pág.) | Consulta y/u Observación | Artículo y norma que se vulnera.
 */
import fs from 'fs';
import path from 'path';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, PageOrientation, ShadingType, VerticalAlign,
} from 'docx';

const FONT = 'Arial';
const AZUL = '1F497D';
const GRIS = 'EEF2F8';

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: '999999' };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER, insideHorizontal: BORDER, insideVertical: BORDER };

function par(text, { bold = false, color = '000000', align = AlignmentType.LEFT, size = 18 } = {}) {
  return new Paragraph({
    alignment: align,
    children: [new TextRun({ text: String(text ?? ''), bold, color, font: FONT, size })],
  });
}

function th(text, { columnSpan, rowSpan, width } = {}) {
  return new TableCell({
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: AZUL },
    verticalAlign: VerticalAlign.CENTER,
    columnSpan, rowSpan,
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    children: [par(text, { bold: true, color: 'FFFFFF', align: AlignmentType.CENTER })],
  });
}

function td(text, { width, align = AlignmentType.LEFT, bold = false } = {}) {
  return new TableCell({
    verticalAlign: VerticalAlign.TOP,
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    children: [par(text, { align, bold })],
  });
}

// Bloque de datos (Nomenclatura / Objeto / Participante)
function bloqueDatos(meta) {
  const fila = (k, v) => new TableRow({
    children: [
      new TableCell({ width: { size: 28, type: WidthType.PERCENTAGE }, shading: { type: ShadingType.CLEAR, color: 'auto', fill: GRIS }, children: [par(k, { bold: true })] }),
      new TableCell({ width: { size: 72, type: WidthType.PERCENTAGE }, children: [par(v)] }),
    ],
  });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: BORDERS,
    rows: [
      new TableRow({ children: [new TableCell({ columnSpan: 2, shading: { type: ShadingType.CLEAR, color: 'auto', fill: GRIS }, children: [par('Formato para Formular Consultas y Observaciones', { bold: true })] })] }),
      fila('Nomenclatura del procedimiento de selección', meta.nomenclatura || '[CONSIGNAR NOMENCLATURA]'),
      fila('Objeto de la contratación', meta.objeto || '[CONSIGNAR OBJETO]'),
      fila('Participante', meta.participante || '[CONSIGNAR LA RAZÓN SOCIAL DEL PARTICIPANTE]'),
    ],
  });
}

// Tabla combinada de consultas y observaciones
function tablaItems(items) {
  const W = { n: 5, sec: 9, num: 11, pag: 5, txt: 52, norma: 18 };
  const head1 = new TableRow({
    tableHeader: true,
    children: [
      th('N° de orden', { rowSpan: 2, width: W.n }),
      th('Acápite de las Bases', { columnSpan: 3 }),
      th('Consulta y/u Observación (debidamente motivada)', { rowSpan: 2, width: W.txt }),
      th('Artículo y norma que se vulnera (en el caso de observaciones)', { rowSpan: 2, width: W.norma }),
    ],
  });
  const head2 = new TableRow({
    tableHeader: true,
    children: [th('Sección', { width: W.sec }), th('Numeral y Literal', { width: W.num }), th('Pág.', { width: W.pag })],
  });
  const filas = items.map((it, i) => new TableRow({
    children: [
      td(String(i + 1), { width: W.n, align: AlignmentType.CENTER }),
      td(it.capitulo, { width: W.sec }),
      td(it.numeral_literal, { width: W.num }),
      td(it.pagina, { width: W.pag, align: AlignmentType.CENTER }),
      td(it.texto_motivado, { width: W.txt }),
      td(it.norma, { width: W.norma }),
    ],
  }));
  const total = new TableRow({
    children: [new TableCell({ columnSpan: 6, children: [par(`Total de consultas y/u observaciones: ${items.length}`, { bold: true, align: AlignmentType.RIGHT })] })],
  });
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: BORDERS, rows: [head1, head2, ...filas, total] });
}

export async function generarInformeDocx({ items, meta = {}, outDir, nombre = 'informe' }) {
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.LANDSCAPE, width: 15840, height: 12240 },
          margin: { top: 720, bottom: 720, left: 720, right: 720 },
        },
      },
      children: [
        par('CONSULTAS Y OBSERVACIONES A LOS TÉRMINOS DE REFERENCIA', { bold: true, align: AlignmentType.CENTER, size: 26 }),
        par(''),
        bloqueDatos(meta),
        par(''),
        tablaItems(items),
      ],
    }],
  });

  fs.mkdirSync(outDir, { recursive: true });
  const base = nombre.replace(/[^\w.-]+/g, '_');
  const docxPath = path.join(outDir, base + '.docx');
  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(docxPath, buf);
  return { docxPath, ok: fs.existsSync(docxPath) };
}
