# Comparación: mi transcripción vs. OCR con API de Anthropic

**Objeto:** verificar si TODAS las páginas-imagen del TDR (PDF 24-45 y 63) fueron
realmente extraídas, y contrastar mi transcripción manual con el OCR automático.

| | Mi versión (`concurso_surquillo_TDR_ocr.txt`) | API (`concurso_surquillo_TDR_api.txt`) |
|---|---|---|
| Método | Lectura visual + transcripción **condensada** | OCR automático (Claude Sonnet 4.6) **verbatim** |
| Caracteres | 20 413 | **56 972** |
| Líneas | 316 | 954 |
| Páginas-imagen cubiertas | 24-45, 63 | 24-45, 63 |
| Costo | Incluido en la sesión | API (~centavos) |

## 1. ¿Se extrajeron todas las páginas? — SÍ
Ambas versiones cubren **exactamente las mismas** páginas-imagen (PDF 24-45 y 63).
La API las procesó en 3 lotes (24-33, 34-43, 44-45+63), sin omitir ninguna.

## 2. ¿Mi versión perdió información? — SÍ, detalle (no sustancia)
Tu sospecha era **correcta en cuanto al detalle**: mi transcripción era ~2.8×
más corta porque **resumí**. Lo que la API capturó y yo había condensado:

- **Tablas completas y verbatim:** la tabla de 18 sedes de transmisión de datos
  (direcciones y anchos de banda exactos), la tabla completa de bolsas de minutos
  por sede (líneas, minutos locales y móviles), y las coordenadas de los 12 parques
  Wi-Fi. Yo había puesto solo ejemplos.
- **Todos los bullets** de la herramienta de monitoreo, del firewall, IPS,
  antivirus y Anti-DDoS, palabra por palabra.
- Texto legal íntegro de los numerales 9-13 (plazo, conformidad, pago,
  confidencialidad).

## 3. ¿Afecta esto a las Consultas y Observaciones? — NO
Verifiqué punto por punto: **todos los hallazgos en que se basan las 11 consultas
y 6 observaciones aparecen idénticos en el OCR de la API**, confirmados verbatim:

| Hallazgo usado en el análisis | Confirmado por la API (cita) |
|---|---|
| NOC y SOC propios no tercerizados | Ítem 15 y 8.a: "NOC y SOC propio no rentado a tercero" / "(no tercerizados ni rentados)" |
| 100 Gbps al NAP / internacional | Ítems 11 y 12 |
| Inconsistencia "cinco (08) interfaces" | Ítem 19.b textual |
| Líder PMP + Ing. Colegiado y Habilitado | Ítem 8.b textual |
| Capacitación sin N.° de personas | Núm. 7: "para el personal que designe la Entidad" |
| Numeración 5.11 vs 5.10.x | Confirmada textual |
| Plataforma cloud "del mismo fabricante del firewall" | Núm. 5.3.h |
| Anti-DDoS excluye firewall/NGFW/router | Núm. 5.4 textual |

**Conclusión:** no se perdió ninguna información que cambie el análisis. Las
consultas y observaciones siguen plenamente sustentadas. Lo que aporta la API es
**precisión verbatim** (citas exactas para el escrito) y **completitud de tablas**.

## 4. Decisión
- El archivo **`concurso_surquillo_TDR_api.txt` pasa a ser la fuente canónica**
  del TDR (verbatim), por su exactitud para citar en el escrito.
- Mi versión condensada se conserva como índice/resumen navegable.

## 5. Regla del sistema (lo que pediste)
- **Página legible (tiene capa de texto)** → `extract_pdf.mjs` (gratis, sin API).
- **Página foto/imagen (sin capa de texto)** → `ocr_pdf.mjs` (API de Anthropic).
- El detector `audit_pdf.mjs` decide cuáles son cuáles.
