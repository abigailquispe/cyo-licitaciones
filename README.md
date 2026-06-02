# cyo-licitaciones — Consultas y Observaciones a bases (OCR + IA)

App local que convierte el **PDF de unas bases de concurso** en un **informe de
Consultas y Observaciones** (Capítulos III y IV) en PDF, analizando el texto con
IA. El OCR corre **en tu propia máquina** con PaddleOCR (gratis) y el análisis
legal usa **Claude** (tu suscripción de Claude Code, o una API key).

```
Subes el PDF  →  OCR local (PaddleOCR)  →  ubica Cap. III/IV
              →  análisis legal (Claude)  →  informe LaTeX → PDF  →  descargas
```

---

## 1. Requisitos previos

Instala estos programas antes de empezar:

| Requisito | Para qué | Notas |
|---|---|---|
| **Node.js 18+** | Servidor y extracción de PDF | `node --version` |
| **Python 3.12** | OCR (PaddleOCR) | `python --version` |
| **MiKTeX** (o TeX Live) | Generar el PDF del informe (`pdflatex`) | debe quedar en el PATH |
| **Claude Code** *(recomendado)* | Análisis legal con tu suscripción | logueado: `claude` en el PATH |
| GPU NVIDIA *(opcional)* | Acelerar el OCR ~40× | driver reciente |

> El análisis también funciona con una **API key** de Anthropic en vez de Claude
> Code (ver §4).

---

## 2. Instalación

```bash
git clone https://github.com/abigailquispe/cyo-licitaciones.git
cd cyo-licitaciones

# 1) Dependencias de Node
npm install

# 2) Entorno de Python + PaddleOCR
python -m venv .venv
# Windows:
.\.venv\Scripts\python -m pip install -r requirements.txt
# Mac/Linux:
# ./.venv/bin/python -m pip install -r requirements.txt
```

> `node_modules/` y `.venv/` **no** están en el repo (son pesados y se
> regeneran). Por eso estos pasos son necesarios tras clonar.

---

## 3. Uso

```bash
npm run app
```

Abre **http://localhost:3000** y:

1. Arrastra el **PDF** de las bases.
2. (Opcional) indica **"OCR desde la página"** si el PDF está 100% escaneado
   (acelera saltando las páginas iniciales; pon la página donde empieza el TDR).
3. Espera el OCR + análisis (con GPU, ~3–4 min; en CPU, más).
4. **Revisa y edita** el borrador en la tabla (textos, páginas, normas).
5. **Genera PDF** y descárgalo.

---

## 4. Motor de análisis (Claude)

La app elige automáticamente:

- **`cli`** (por defecto si tienes Claude Code): usa la CLI `claude` headless con
  tu **suscripción**, sin API key.
- **`api`**: si defines `ANTHROPIC_API_KEY`, usa la API de Anthropic.

Variables de entorno (opcionales; puedes ponerlas en un archivo `.env`):

```
ANTHROPIC_API_KEY=sk-ant-...      # solo si usas el motor 'api'
ANALYSIS_BACKEND=cli|api          # forzar un motor (por defecto: auto)
ANALYSIS_MODEL=claude-sonnet-4-6  # modelo para el motor 'api'
CLAUDE_EXE=C:\ruta\a\claude.exe   # si la CLI no se autodetecta
OCR_DEVICE=auto|gpu|cpu           # dispositivo de OCR (por defecto: auto)
OCR_DPI=200                       # resolución de render del OCR
```

> Nota: desde el 15-jun-2026, el uso headless de Claude Code en planes de
> suscripción consume un crédito mensual aparte del uso interactivo.

---

## 5. GPU (opcional, recomendado si tienes NVIDIA)

```bash
.\.venv\Scripts\python -m pip uninstall paddlepaddle -y
.\.venv\Scripts\python -m pip install paddlepaddle-gpu==3.3.1 -i https://www.paddlepaddle.org.cn/packages/stable/cu126/
```

La app detecta la GPU sola (`OCR_DEVICE=auto`). Verifica con:

```bash
.\.venv\Scripts\python -c "import paddle; print(paddle.device.cuda.device_count())"
```

---

## 6. Scripts de línea de comandos (sin la app)

```bash
# OCR de un PDF (o un rango de páginas) a texto:
.\.venv\Scripts\python paddle_ocr.py "input\bases.pdf" "salida.txt" "25-66"

# Extracción de texto vectorial (páginas legibles):
node extract_pdf.mjs "input\bases.pdf" "salida.txt"
```

(También existen `procesar_concurso.mjs`, `audit_pdf.mjs`, `ocr_pdf.mjs` —flujo
previo basado en la API— y `extract_docx.ps1` para `.docx` con notas al pie.)

---

## 7. Notas

- El código está probado en **Windows**. En **Mac/Linux** funciona, pero asegúrate
  de tener `claude`, `python` y `pdflatex` en el PATH (las rutas se autodetectan).
- La IA genera un **borrador**: revísalo siempre antes de presentar (las citas se
  marcan como verificadas / sin verificar).
- **No subas** tu `.env` ni claves al repositorio.

---

## 8. Criterio legal (resumen)

- **Consultas** = pedidos de aclaración ante dudas/ambigüedades (monitoreo,
  capacitación, plazos, alcances técnicos).
- **Observaciones** = cuestionamientos por apartarse de las Bases Estándar o
  vulnerar principios (libertad de concurrencia, competencia, igualdad de trato,
  proporcionalidad, vigencia tecnológica): direccionamiento a marca, exigencias
  desproporcionadas, factores de evaluación restrictivos, etc.
- Marco: **Ley N.° 32069** y su Reglamento **D.S. N.° 009-2025-EF**. Metodología
  en `knowledge/checklist_legal.md`.

## 9. Estructura

```
app/            # servidor local + UI + pipeline (OCR → análisis → PDF)
paddle_ocr.py   # OCR local con PaddleOCR (CPU/GPU)
knowledge/      # checklist legal (metodología del análisis)
slides/         # presentación/tutorial (Beamer)
input/ raw/ processed/ output/   # datos y resultados de ejemplo
```
