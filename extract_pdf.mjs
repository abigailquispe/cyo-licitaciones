import fs from 'fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const file = process.argv[2];
const out = process.argv[3];
const data = new Uint8Array(fs.readFileSync(file));
const doc = await getDocument({ data, useSystemFonts: true }).promise;
let full = '';
let nonEmpty = 0;
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const tc = await page.getTextContent();
  let last = null;
  let txt = '';
  for (const it of tc.items) {
    if (last !== null && it.transform && last !== it.transform[5]) txt += '\n';
    txt += it.str;
    if (it.transform) last = it.transform[5];
  }
  txt = txt.trim();
  if (txt.length > 20) nonEmpty++;
  full += `\n\n===== PÁGINA ${i} (footer ~${i-2}) =====\n` + txt;
}
fs.writeFileSync(out, full, 'utf8');
console.log(`Páginas: ${doc.numPages} | con texto útil: ${nonEmpty} | chars: ${full.length}`);
