const $ = (s) => document.querySelector(s);
let archivo = null, jobId = null, poll = null;

// ---------- Subida ----------
const dz = $('#dropzone');
$('#btn-file').onclick = () => $('#file').click();
$('#file').onchange = (e) => setArchivo(e.target.files[0]);
dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
dz.addEventListener('drop', (e) => {
  e.preventDefault(); dz.classList.remove('drag');
  if (e.dataTransfer.files[0]) setArchivo(e.dataTransfer.files[0]);
});
function setArchivo(f) {
  if (!f || f.type !== 'application/pdf') return alert('Selecciona un PDF.');
  archivo = f;
  $('#filename').textContent = f.name + ' (' + (f.size / 1048576).toFixed(1) + ' MB)';
  $('#btn-analizar').disabled = false;
}

// ---------- Analizar ----------
const PASOS = { inicio: 8, extraer: 20, detectar: 30, ocr: 55, ubicar: 78, analizar: 88, listo: 100, error: 100 };
$('#btn-analizar').onclick = async () => {
  if (!archivo) return;
  $('#paso-subir').classList.add('hidden');
  $('#paso-progreso').classList.remove('hidden');
  const fd = new FormData();
  fd.append('pdf', archivo);
  const hint = $('#start-hint').value;
  if (hint) fd.append('startHint', hint);
  const r = await fetch('/api/analyze', { method: 'POST', body: fd }).then(x => x.json());
  if (r.error) return fallo(r.error);
  jobId = r.jobId;
  poll = setInterval(estado, 1500);
};

async function estado() {
  const j = await fetch('/api/status/' + jobId).then(x => x.json());
  $('#bar-fill').style.width = (PASOS[j.step] || 40) + '%';
  $('#progreso-msg').textContent = j.message || j.step || '…';
  if (!j.done) return;
  clearInterval(poll);
  if (j.error) return fallo(j.error);
  mostrarRevision(j);
}
function fallo(msg) {
  $('#progreso-msg').innerHTML = '<span style="color:#b33">Error: ' + msg + '</span>';
}

// ---------- Revisión ----------
function mostrarRevision(j) {
  $('#paso-progreso').classList.add('hidden');
  $('#paso-revision').classList.remove('hidden');
  $('#m-nom').value = j.meta.nomenclatura || '';
  $('#m-obj').value = j.meta.objeto || '';
  $('#m-ent').value = j.meta.entidad || '';

  const av = $('#aviso');
  if (!j.modelo) {
    av.className = 'aviso bad';
    av.textContent = 'Sin clave de API: modo manual. Agrega filas y escribe tus consultas/observaciones.';
  } else {
    const ver = j.items.filter(i => i.verificada).length;
    av.className = 'aviso good';
    av.textContent = `Borrador con ${j.items.length} items (${ver} con cita verificada en el texto). Revisa y edita antes de generar el PDF.`;
  }
  const cap = j.encontrado || {};
  if (cap.capIII === false || cap.capIV === false) {
    av.className = 'aviso bad';
    av.textContent += '  ⚠ No se ubicó con certeza ' +
      [!cap.capIII && 'Cap. III', !cap.capIV && 'Cap. IV'].filter(Boolean).join(' y ') +
      '; revisa el numeral/página de cada fila.';
  }

  $('#filas').innerHTML = '';
  (j.items || []).forEach(agregarFila);
  if (!j.items || !j.items.length) agregarFila({ tipo: 'consulta' });
}

function agregarFila(it = {}) {
  const tr = document.createElement('tr');
  tr.className = it.tipo || 'consulta';
  const sel = `<select data-k="tipo">
      <option value="consulta"${it.tipo !== 'observacion' ? ' selected' : ''}>Consulta</option>
      <option value="observacion"${it.tipo === 'observacion' ? ' selected' : ''}>Observación</option>
    </select>`;
  const badge = it.cita_textual
    ? (it.verificada ? '<span class="badge ok">verificada</span>' : '<span class="badge warn">sin verificar</span>')
    : '';
  tr.innerHTML = `
    <td>${sel}</td>
    <td><textarea data-k="capitulo">${esc(it.capitulo)}</textarea></td>
    <td><textarea data-k="numeral_literal">${esc(it.numeral_literal)}</textarea></td>
    <td><input data-k="pagina" value="${esc(it.pagina)}"></td>
    <td><textarea data-k="texto_motivado">${esc(it.texto_motivado)}</textarea></td>
    <td><textarea data-k="norma">${esc(it.norma)}</textarea></td>
    <td><textarea data-k="cita_textual" title="cita verbatim de las bases">${esc(it.cita_textual)}</textarea>${badge}</td>
    <td><button class="del" title="Eliminar">✕</button></td>`;
  tr.querySelector('select').onchange = (e) => { tr.className = e.target.value; };
  tr.querySelector('.del').onclick = () => tr.remove();
  $('#filas').appendChild(tr);
}
const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

$('#btn-add').onclick = () => agregarFila({ tipo: 'consulta' });

// ---------- Generar PDF ----------
$('#btn-pdf').onclick = async () => {
  const items = [...$('#filas').querySelectorAll('tr')].map(tr => {
    const o = {};
    tr.querySelectorAll('[data-k]').forEach(el => o[el.dataset.k] = el.value.trim());
    return o;
  }).filter(o => o.texto_motivado);
  if (!items.length) return alert('No hay filas con texto para generar.');
  const meta = {
    nomenclatura: $('#m-nom').value, objeto: $('#m-obj').value,
    entidad: $('#m-ent').value, participante: $('#m-part').value,
  };
  $('#btn-pdf').disabled = true; $('#btn-pdf').textContent = 'Generando…';
  const r = await fetch('/api/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId, items, meta }),
  }).then(x => x.json());
  $('#btn-pdf').disabled = false; $('#btn-pdf').textContent = 'Generar PDF';
  if (r.error) return alert('Error al generar: ' + r.error + (r.log ? '\n\n' + r.log : ''));
  const a = $('#link-descarga');
  a.href = r.downloadUrl; a.classList.remove('hidden');
  a.click();
};
