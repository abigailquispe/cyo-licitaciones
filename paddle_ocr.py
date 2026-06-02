r"""
paddle_ocr.py - OCR LOCAL y GRATIS de paginas que vienen como IMAGEN en un PDF
(paginas escaneadas/sin capa de texto, p. ej. el TDR de las bases), usando
PaddleOCR. Corre en CPU sin depender de la VRAM de la GPU.

Render del PDF -> imagen con PyMuPDF (sin binarios externos) y luego OCR con
PaddleOCR (modelos PP-OCR, idioma espanol).

REQUISITOS (ya instalados en el venv .venv):
  paddleocr  paddlepaddle  pymupdf

USO (misma interfaz que ocr_pdf.mjs / ollama_ocr.mjs):
  .\.venv\Scripts\python.exe paddle_ocr.py "input\concurso.pdf" "processed\salida.txt" "25-45,63"
  # Si omites el rango, procesa TODO el PDF.

VARIABLES OPCIONALES:
  OCR_DPI   resolucion de render (def. 200; sube a 250 si el texto es pequeno)
  OCR_LANG  idioma PaddleOCR (def. "es")
"""
import os
import sys
import io

import numpy as np
import fitz  # PyMuPDF
from PIL import Image

DPI = int(os.environ.get("OCR_DPI", "200"))
LANG = os.environ.get("OCR_LANG", "es")


def parse_range(s, total):
    """'25-45,63' -> [25,...,45,63] (1-based). Vacio -> todas."""
    if not s:
        return list(range(1, total + 1))
    out = []
    for part in s.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            a, b = part.split("-", 1)
            out.extend(range(int(a), int(b) + 1))
        else:
            out.append(int(part))
    return out


def page_to_image(doc, page_index):
    """Renderiza una pagina (0-based) a un np.array RGB."""
    page = doc[page_index]
    mat = fitz.Matrix(DPI / 72, DPI / 72)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
    return np.array(img)


def extract_lines(result):
    """Normaliza la salida de PaddleOCR (3.x o 2.x) a [(y, x, texto), ...]."""
    lines = []
    if not result:
        return lines
    # PaddleOCR 3.x: predict() -> lista de OCRResult (dict-like) con
    # 'rec_texts' y 'rec_polys'/'dt_polys'.
    first = result[0]
    if isinstance(first, dict) or hasattr(first, "get"):
        for res in result:
            texts = res.get("rec_texts") or []
            polys = res.get("rec_polys")
            if polys is None:
                polys = res.get("dt_polys") or []
            for i, txt in enumerate(texts):
                if i < len(polys):
                    pts = np.array(polys[i]).reshape(-1, 2)
                    y = float(pts[:, 1].min())
                    x = float(pts[:, 0].min())
                else:
                    y, x = float(i), 0.0
                lines.append((y, x, txt))
        return lines
    # PaddleOCR 2.x: ocr() -> [[ [box, (texto, score)], ... ]]
    page = result[0] if result and isinstance(result[0], list) else result
    for item in page:
        box, (txt, _score) = item[0], item[1]
        pts = np.array(box).reshape(-1, 2)
        lines.append((float(pts[:, 1].min()), float(pts[:, 0].min()), txt))
    return lines


def lines_to_text(lines, y_thresh=10.0):
    """Ordena por lectura (arriba->abajo, izq->der) y agrupa en renglones."""
    if not lines:
        return ""
    lines = sorted(lines, key=lambda t: (round(t[0] / y_thresh), t[1]))
    rows = []
    cur_y = None
    cur = []
    for y, x, txt in lines:
        if cur_y is None or abs(y - cur_y) <= y_thresh:
            cur.append((x, txt))
            cur_y = y if cur_y is None else cur_y
        else:
            rows.append(" ".join(t for _, t in sorted(cur)))
            cur = [(x, txt)]
            cur_y = y
    if cur:
        rows.append(" ".join(t for _, t in sorted(cur)))
    return "\n".join(rows)


def make_ocr():
    from paddleocr import PaddleOCR
    # Correccion de orientacion (configurable por variables de entorno):
    #   OCR_ORIENT=1 (def.) -> endereza paginas giradas 90/180/270 y renglones
    #                          girados. Arregla TABLAS APAISADAS / texto de lado.
    #   OCR_UNWARP=1        -> corrige paginas inclinadas/combadas (escaneo torcido).
    #                          Mas lento; activar solo si hace falta.
    orient = os.environ.get("OCR_ORIENT", "1") == "1"
    unwarp = os.environ.get("OCR_UNWARP", "0") == "1"
    # OCR_DEVICE: "gpu" | "cpu" | "auto" (def. auto -> gpu si hay CUDA).
    device = os.environ.get("OCR_DEVICE", "auto")
    if device == "auto":
        try:
            import paddle
            device = "gpu" if paddle.device.cuda.device_count() > 0 else "cpu"
        except Exception:
            device = "cpu"
    print(f"  dispositivo OCR: {device}")
    kwargs_3x = dict(
        lang=LANG,
        device=device,
        use_doc_orientation_classify=orient,
        use_doc_unwarping=unwarp,
        use_textline_orientation=orient,
        # modelos "mobile": rapidos y de buena calidad en texto impreso.
        text_detection_model_name="PP-OCRv5_mobile_det",
        text_recognition_model_name="latin_PP-OCRv5_mobile_rec",
    )
    if device == "cpu":
        kwargs_3x["enable_mkldnn"] = False  # evita el bug de oneDNN en CPU
    try:
        return PaddleOCR(**kwargs_3x)
    except TypeError:
        # PaddleOCR 2.x
        return PaddleOCR(lang=LANG, use_angle_cls=True)


def run_ocr(ocr, img):
    if hasattr(ocr, "predict"):
        return ocr.predict(img)
    return ocr.ocr(img)


def main():
    if len(sys.argv) < 3:
        print('Uso: python paddle_ocr.py <entrada.pdf> <salida.txt> [rango ej "25-45,63"]')
        sys.exit(1)
    in_file, out_file = sys.argv[1], sys.argv[2]
    range_arg = sys.argv[3] if len(sys.argv) > 3 else ""

    doc = fitz.open(in_file)
    total = doc.page_count
    pages = [p for p in parse_range(range_arg, total) if 1 <= p <= total]
    print(f"PDF: {total} pags | OCR de {len(pages)} pags: {range_arg or 'todas'} | "
          f"PaddleOCR lang={LANG} | {DPI} DPI")

    # RESUME: si el archivo ya existe, saltamos las paginas ya procesadas.
    # Asi, si el proceso se corta, basta con volver a correr el MISMO comando
    # y continua donde quedo (escribe pagina por pagina).
    done = set()
    if os.path.exists(out_file):
        import re
        with open(out_file, "r", encoding="utf-8") as f:
            done = {int(m) for m in re.findall(r"----- PAGINA PDF (\d+) -----", f.read())}
        if done:
            print(f"  reanudando: {len(done)} paginas ya estaban hechas, se saltan.")

    print("  cargando modelos PaddleOCR (la primera vez descarga ~100 MB)...")
    ocr = make_ocr()

    import time
    new_file = not os.path.exists(out_file)
    # 'a' = append; escribimos y hacemos flush en cada pagina para no perder avance.
    with open(out_file, "a", encoding="utf-8") as f:
        if new_file:
            f.write(f"===== OCR LOCAL de {in_file} (paginas {range_arg or 'todas'}) - PaddleOCR ({LANG}) =====\n")
            f.flush()
        for p in pages:
            if p in done:
                continue
            t0 = time.time()
            img = page_to_image(doc, p - 1)
            result = run_ocr(ocr, img)
            text = lines_to_text(extract_lines(result))
            f.write(f"\n\n----- PAGINA PDF {p} -----\n" + text)
            f.flush()
            print(f"  pagina {p}/{total}... ok ({time.time()-t0:.1f}s, {len(text)} chars)")
    print(f"\nListo -> {out_file}")


if __name__ == "__main__":
    main()
