# Informe de Completitud — ¿Todo el texto fue procesado a .txt?

**Fecha:** 2026-06-01

## 1. Estado: TODOS los documentos fuente están convertidos a .txt

| # | Archivo fuente | Tipo | → Archivo .txt en `processed/` (o `plantilla/`) | Caracteres |
|---|---|---|---|---:|
| 1 | `input/76143429...abreviado...777.pdf` (CONCURSO) | PDF | `concurso_surquillo_texto.txt` | 175 599 |
| 2 | `raw/Ley-32069-LPDerecho (1).pdf` | PDF | `ley_32069_texto.txt` | 220 166 |
| 3 | `raw/LEY-N-27444-d.pdf` | PDF | `ley_27444_texto.txt` | 229 923 |
| 4 | `raw/Reglamento-...009-2025...pdf` | PDF | `reglamento_009_2025_texto.txt` | 1 010 276 |
| 5 | `raw/7614342-9-...abreviado-de-servicios.docx` | DOCX | `bases_estandar_abreviado_texto.txt` | 219 019 |
| 6 | `raw/7614342-8-...concurso-publico-de-servicios.docx` | DOCX | `bases_estandar_publico_texto.txt` | 220 412 |
| 7 | `input/CONSULTAS Y OBSERVACIONES SUSALUD.docx` | DOCX | `plantilla/modelo_susalud_texto.txt` | 5 873 |

**7 de 7 archivos procesados.**

## 2. Verificación de completitud del texto, archivo por archivo

| Archivo | Capa de texto | ¿Texto completo? | Detalle |
|---|---|---|---|
| Ley 32069 | Sí (36/36 págs) | ✅ **100%** | Sin páginas-imagen. |
| Ley 27444 | Sí (105/105 págs) | ✅ **100%** | Sin páginas-imagen. |
| Reglamento 009-2025 | Sí (195/196 págs) | ✅ **~100%** | 1 página-imagen = carátula/índice (sin texto sustantivo). |
| Bases Estándar abreviado (.docx) | Sí | ✅ **Completo** | Incluye cuerpo **+ 117 notas al pie** + notas al final. |
| Bases Estándar público (.docx) | Sí | ✅ **Completo** | Incluye cuerpo **+ 115 notas al pie** + notas al final. |
| Modelo SUSALUD (.docx) | Sí | ✅ **Completo** | Tabla de consultas/observaciones. |
| **CONCURSO (.pdf)** | Parcial | ⚠️ **Falta el TDR** | 74 págs con texto OK; **21 págs del TDR (PDF 25–45) son IMAGEN y NO tienen capa de texto**, por lo que **no están en el .txt**. |

## 3. La única brecha real de texto: el TDR del concurso

- Las páginas **PDF 25–45** (Términos de Referencia: EETT, monitoreo,
  capacitación, averías, SLA, penalidades) **no tienen capa de texto** porque
  están **escaneadas/incrustadas como imagen**.
- Ese contenido **sí fue leído** (con visión/OCR durante el análisis) y se usó
  para redactar las consultas y observaciones, **pero no quedó guardado como
  texto** en `concurso_surquillo_texto.txt` (esas páginas aparecen casi vacías,
  solo con el encabezado).
- **Consecuencia:** si se abre una sesión nueva, el texto del TDR no está en
  disco y habría que volver a leer las imágenes.

### Solución pendiente (recomendada)
Volcar a un .txt el texto del TDR leído por OCR, p. ej.
`processed/concurso_surquillo_TDR_ocr.txt`, para que quede persistido y
reutilizable sin reprocesar imágenes.

## 4. Notas técnicas sobre los .docx
- Se extrae `word/document.xml` (cuerpo) **+ `footnotes.xml` + `endnotes.xml`**
  (notas, que en las bases estándar contienen instrucciones sustantivas).
- **No** se extraen `header*.xml`/`footer*.xml` porque solo contienen el título
  corrido repetido (no es contenido sustantivo).

## 5. Reproducir
```powershell
node extract_pdf.mjs  "<archivo.pdf>"  "processed\<salida>.txt"
powershell -File extract_docx.ps1  "<archivo.docx>"  "processed\<salida>.txt"
node audit_pdf.mjs       # auditoría de cobertura de PDFs
```
