import fs from 'fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const file = "input/76143429basesestandarconcursopublicoabreviadodeservicios+2_20260528_191110_777.pdf";
const data = new Uint8Array(fs.readFileSync(file));
const doc = await getDocument({ data, useSystemFonts: true }).promise;

// boilerplate repetido en cabecera/pie/lateral
const boiler = [
  "CONCURSO PÚBLICO ABREVIADO DE SERVICIOS",
  "MUNICIPALIDAD DISTRITAL DE SURQUILLO",
  "CONCURSO PÚBLICO ABREVIADO DE SERVICIOS N° 02-2026-MDS",
  "TÉRMINOS DE",
  "REFERENCIA",
  "Servicio de Internet Dedicado, Transmisión de datos,",
  "Telefonía IP, Correo Electrónico y Almacenamiento en",
  "la Nube",
  "MUNICIPALIDAD",
  "DE SURQUILLO",
];

const imgPages = [];
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const tc = await page.getTextContent();
  let txt = tc.items.map(it => it.str).join(' ');
  for (const b of boiler) txt = txt.split(b).join(' ');
  txt = txt.replace(/[0-9]/g,'').replace(/\s+/g,' ').trim();
  if (txt.length < 40) imgPages.push(i);
}
const ranges = [];
for (const p of imgPages) {
  const last = ranges[ranges.length-1];
  if (last && p === last[1]+1) last[1] = p; else ranges.push([p,p]);
}
const rstr = ranges.map(([a,b]) => a===b ? `${a}` : `${a}-${b}`).join(", ");
console.log(`CONCURSO: ${doc.numPages} págs | cuerpo SOLO IMAGEN (sin texto real): ${imgPages.length}`);
console.log(`Páginas PDF solo-imagen: ${rstr}`);
console.log(`(pág. oficial de bases = pág. PDF − 2)`);
