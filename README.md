# cyo-licitaciones — Sistema de Consultas y Observaciones a Bases

Sistema asistido para analizar las bases de un concurso (Concurso Público o
Concurso Público Abreviado de Servicios) y generar el documento de
**Consultas y Observaciones**, comparando contra las Bases Estándar y la
Ley N.° 32069 y su Reglamento (D.S. N.° 009-2025-EF).

## Estructura de carpetas

| Carpeta | Contenido |
|---|---|
| `raw/` | Normativa fija: leyes, reglamento y Bases Estándar (.docx). |
| `input/` | El PDF del concurso a analizar (+ plantilla modelo SUSALUD). |
| `processed/` | Texto extraído de los PDFs (generado automáticamente). |
| `knowledge/` | Extractos destilados (Cap. IV base estándar, checklist legal). |
| `plantilla/` | Modelo de salida (estructura tomada del documento SUSALUD). |
| `output/` | Documento final de Consultas y Observaciones (.tex + .pdf). |

## Flujo por cada concurso nuevo (reproducible, con código)

**Opción rápida (un solo comando, recomendada):** procesa el PDF completo,
usando pdfjs en las páginas legibles y la API SOLO en las páginas-foto:
```powershell
$env:ANTHROPIC_API_KEY = "sk-ant-..."   # solo si hay páginas-imagen
node procesar_concurso.mjs "input/<archivo>.pdf" "processed/<nombre>_COMPLETO.txt"
```
Genera un único .txt con las 97 páginas; cada página marca su método
(`[pdfjs]` o `[OCR-API]`). Luego saltar al paso 6.

**Opción por pasos (control fino):**
1. Copiar el PDF del concurso a `input/`.
2. Extraer la capa de texto (gratis): `node extract_pdf.mjs "input/X.pdf" "processed/X.txt"`.
3. Auditar páginas-imagen: `node audit_pdf.mjs`.
4. OCR de esas páginas (de pago): `node ocr_pdf.mjs "input/X.pdf" "processed/X_ocr.txt" "25-45,63"`.
   - *Alternativa GRATIS (offline):* Tesseract OCR + poppler (`pdftoppm`).
5. Bases estándar a texto: `powershell -File extract_docx.ps1 "raw/X.docx" "processed/X.txt"`.
6. **Analizar** Cap. III (TDR), 3.5 Requisitos de Calificación y Cap. IV
   (Factores), aplicando `knowledge/checklist_legal.md`.
7. **Redactar** en `output/` siguiendo `plantilla/` y compilar:
   ```powershell
   pdflatex output/consultas_observaciones_<id>.tex   # dos pasadas
   ```

## Scripts del repo
| Script | Qué hace |
|---|---|
| `procesar_concurso.mjs` | **Todo-en-uno**: pdfjs en páginas legibles + API en páginas-foto → un .txt completo. |
| `extract_pdf.mjs` | PDF con capa de texto → .txt (pdfjs). Gratis. |
| `extract_docx.ps1` | .docx → .txt incluyendo **notas al pie** (footnotes). |
| `audit_pdf.mjs` | Detecta páginas **solo-imagen** por documento. |
| `ocr_pdf.mjs` | OCR de un rango de páginas vía API de Anthropic (de pago). |

> Dependencias fijadas en `package.json` (`pdfjs-dist`, `pdf-lib`,
> `@anthropic-ai/sdk`). Si se borran, reinstalar con `npm install`.

## Reproducibilidad del OCR — opciones
- **Opción A (recomendada): API de Anthropic** (`ocr_pdf.mjs`). Misma calidad que
  la lectura manual, maneja tablas y español. Costo: por tokens (~centavos).
  Necesita `ANTHROPIC_API_KEY`.
- **Opción B: Tesseract (gratis, local).** Instalar Tesseract + poppler; convertir
  con `pdftoppm -png archivo.pdf pagina` y correr `tesseract pagina.png salida -l spa`.
  Funciona sin internet pero rinde peor en tablas y diagramas.
- **Opción C: nube (Google Vision / Azure).** De pago; buena calidad. No incluido.

## Notas técnicas del entorno
- **No hay Python**; sí hay **Node** (PDF con `pdfjs-dist`; OCR con
  `@anthropic-ai/sdk` + `pdf-lib`) y **MiKTeX** (`pdflatex`) para LaTeX.
- Los `.docx` de Bases Estándar se leen descomprimiéndolos (son ZIP); incluir
  `footnotes.xml`/`endnotes.xml` (contienen instrucciones sustantivas).

## Criterio legal
- **Consultas** = pedidos de aclaración ante dudas/ambigüedades (monitoreo,
  capacitación de personal, plazos, alcances técnicos).
- **Observaciones** = cuestionamientos por apartarse de las Bases Estándar o
  vulnerar principios (libertad de concurrencia, competencia, igualdad de
  trato, proporcionalidad, vigencia tecnológica) — p. ej. direccionamiento a
  marca, exigencias desproporcionadas, factores de evaluación restrictivos.
