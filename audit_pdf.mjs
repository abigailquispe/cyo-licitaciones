import fs from 'fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const files = [
  ["CONCURSO (input)", "input/76143429basesestandarconcursopublicoabreviadodeservicios+2_20260528_191110_777.pdf"],
  ["Ley 32069", "raw/Ley-32069-LPDerecho (1).pdf"],
  ["Ley 27444", "raw/LEY-N-27444-d.pdf"],
  ["Reglamento 009-2025", "raw/Reglamento-de-la-Ley-32069-Ley-General-de-Contrataciones-Publicas-LP-DERECHO (1).pdf"],
];
const THRESH = 80; // < 80 chars de texto útil => página tipo imagen/escaneada

for (const [name, file] of files) {
  const data = new Uint8Array(fs.readFileSync(file));
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  let imgPages = [];
  let totalChars = 0;
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const txt = tc.items.map(it => it.str).join('').trim();
    totalChars += txt.length;
    if (txt.length < THRESH) imgPages.push(i);
  }
  // comprimir rangos
  const ranges = [];
  for (const p of imgPages) {
    const last = ranges[ranges.length-1];
    if (last && p === last[1]+1) last[1] = p; else ranges.push([p,p]);
  }
  const rstr = ranges.map(([a,b]) => a===b ? `${a}` : `${a}-${b}`).join(", ");
  console.log(`\n### ${name}`);
  console.log(`Páginas totales: ${doc.numPages} | con texto: ${doc.numPages-imgPages.length} | SOLO IMAGEN: ${imgPages.length} | chars texto: ${totalChars}`);
  console.log(`Páginas solo-imagen (PDF): ${rstr || "ninguna"}`);
}
