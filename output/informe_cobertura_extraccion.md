# Informe de Cobertura de Extracción y Lectura

**Fecha:** 2026-06-01
**Objeto:** Verificar qué datos se extrajeron/leyeron de cada documento y qué quedó pendiente.

---

## 1. Resumen ejecutivo

- **No se perdió contenido sustantivo del concurso.** Las páginas cuyo cuerpo
  es **imagen** (no tienen capa de texto) son las del **TDR (PDF 25–45)**, y
  **todas fueron leídas visualmente**. Las demás páginas-imagen son solo
  carátulas divisorias ("CAPÍTULO III", "ANEXOS"), sin contenido.
- **Sí existen zonas del concurso que aún NO se leyeron a profundidad** (no por
  problema de imagen, sino de alcance): Cap. I–II de la Sección Específica y la
  Proforma del Contrato (Cap. V). Pueden contener material observable.
- La **comparación cláusula por cláusula contra las Bases Estándar (.docx)** no
  se hizo de forma exhaustiva; se compararon los puntos clave.

---

## 2. Detección técnica de páginas "solo imagen"

Método: extracción de capa de texto con `pdfjs-dist` y medición de texto real
por página (descontando encabezados/pies repetidos).

| Documento | Págs. | Texto OK | Solo imagen (cuerpo) | Páginas-imagen (PDF) |
|---|---:|---:|---:|---|
| **CONCURSO (input)** | 97 | 74 | **23** | 24–45 y 63 |
| Ley N.° 32069 | 36 | 36 | 0 | — |
| Ley N.° 27444 | 105 | 105 | 0 | — |
| Reglamento D.S. 009-2025-EF | 196 | 195 | 1 | pág. 2 (índice/carátula) |

### Desglose de las 23 páginas-imagen del concurso
| Páginas PDF | Qué son | ¿Leídas? |
|---|---|---|
| **25–45** | **TDR completo** (Especificaciones Técnicas, monitoreo, capacitación, averías, SLA, penalidades) | ✅ **Sí, leídas con visión/OCR** |
| 24 | Carátula divisoria "CAPÍTULO III – REQUERIMIENTO" | n/a (sin contenido) |
| 63 | Carátula divisoria "ANEXOS" | n/a (sin contenido) |

> Conclusión: la única información en imagen relevante era el TDR, y se capturó
> al 100 %.

---

## 3. Cobertura de lectura por documento (alcance, no solo extracción)

| Documento | Extraído | Leído a fondo | Observación |
|---|---|---|---|
| **Concurso – Sección General** (PDF 4–16) | ✅ | Parcial (PDF 4–9) | No observable: la Sección General **no puede modificarse** (bajo sanción de nulidad), por lo que no genera observaciones. |
| **Concurso – Secc. Específica Cap. I–II** (PDF 17–23) | ✅ | ❌ **Pendiente** | Generalidades y procedimiento (cronograma, forma de pago, presentación). **Puede haber consultas** (el modelo SUSALUD tenía una consulta en Cap. II 2.5). |
| **Concurso – Cap. III TDR** (PDF 24–45) | Imagen | ✅ Completo | Base de casi todas las consultas y observaciones. |
| **Concurso – Requisitos de Calificación 3.5** (PDF 46–49) | ✅ | ✅ Completo | Origen de las observaciones de personal clave y NOC/SOC. |
| **Concurso – Cap. IV Factores** (PDF 50–53) | ✅ | ✅ Completo | Observaciones de puntaje técnico mínimo e ISO. |
| **Concurso – Cap. V Proforma del Contrato** (PDF 54–62) | ✅ | Parcial (PDF 62) | Cláusulas contractuales (pago, penalidades, garantías). **Puede haber consultas/observaciones**; pendiente de revisión completa. |
| **Concurso – Anexos** (PDF 63–97) | ✅ | Parcial (Anexo 1) | Formatos estándar (DD.JJ., promesa de consorcio, experiencia). Baja probabilidad de observaciones. |
| **Bases Estándar (.docx, abreviado)** | ✅ (texto) | Parcial | Se compararon puntos clave (p. ej. la *Advertencia* de formación académica). **Falta diff cláusula por cláusula.** |
| **Bases Estándar (.docx, no abreviado)** | ❌ | ❌ | No usado (el concurso es de tipo **abreviado**). |
| **Ley N.° 32069** | ✅ | Dirigido | Se leyeron y citaron los principios (Art. 5) y artículos pertinentes. |
| **Reglamento D.S. 009-2025-EF** | ✅ | Dirigido | Se consultaron Arts. 44.6, 72, 119–120, 131. |
| **Ley N.° 27444** | ✅ | ❌ No consultado | Norma supletoria; no fue necesaria para las observaciones formuladas. |

---

## 4. Brechas pendientes (recomendado revisar)

1. **Secc. Específica Cap. I–II del concurso (PDF 17–23):** revisar cronograma,
   forma/plazo de pago y reglas de presentación → posibles consultas.
2. **Proforma del Contrato, Cap. V (PDF 54–62):** revisar cláusulas de pago,
   penalidades, garantías, conformidad → posibles consultas/observaciones.
3. **Diff completo contra Bases Estándar (.docx):** comparar numeral por numeral
   para detectar todo apartamiento de la plantilla oficial.

---

## 5. Cómo se reproduce esta auditoría

```powershell
node audit_pdf.mjs        # cobertura general por documento
node audit_concurso.mjs   # detecta páginas-imagen descontando encabezados
```
