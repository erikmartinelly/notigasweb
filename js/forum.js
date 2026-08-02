/* ==========================================================================
   NOTIGAS - MÓDULO DE FORO VECINAL TIPO REDDIT, COMENTARIOS Y DENUNCIAS
   ========================================================================== */

let postCounterIndex = 3;
let activePostCommentsRef = null;

const postCommentsStore = {
  0: [
    { author: "Vecino Calle 2", text: "Ya reportamos a la central de alumbrado público, dijeron que vienen en la tarde.", time: "Hace 30 min" },
    { author: "Doña Martha", text: "Gracias por avisar, por si acaso encendí el foco de mi puerta.", time: "Hace 15 min" }
  ],
  1: [
    { author: "Carlos M.", text: "¡Lo vi corriendo cerca de la cancha sintética hace 20 minutos!", time: "Hace 1 hora" },
    { author: "Familia Rojas", text: "Ya lo tenemos resguardado en la casa #45, pueden pasar a recogerlo.", time: "Hace 10 min" }
  ],
  2: [
    { author: "Don Pedro", text: "Llegó justo a tiempo el agua, ¡gracias por el aviso vecina!", time: "Hace 5 min" }
  ]
};

function votarPost(el, delta) {
  const span = el.parentElement.querySelector('.v-count');
  if (span) {
    let val = parseInt(span.innerText) || 0;
    val += delta;
    span.innerText = val;
  }
}

function abrirModalNuevoPost() { 
  const modal = document.getElementById('modalNuevoPost');
  if (modal) modal.style.display = 'flex'; 
}

function closeNuevoPostModal() { 
  const modal = document.getElementById('modalNuevoPost');
  if (modal) modal.style.display = 'none'; 
}

function crearNuevoPost() {
  const selectTipo = document.getElementById('selectPostTipo');
  const inputTitulo = document.getElementById('inputPostTitulo');
  const inputDesc = document.getElementById('inputPostDesc');

  if (!selectTipo || !inputTitulo || !inputDesc) return;

  const tipo = selectTipo.value;
  const titulo = inputTitulo.value.trim();
  const desc = inputDesc.value.trim();

  if (!titulo || !desc) {
    alert('Por favor escribe un título y la descripción de tu aviso.');
    return;
  }

  const newIndex = postCounterIndex++;
  postCommentsStore[newIndex] = [];

  const feed = document.getElementById('forumFeed');
  if (!feed) return;

  const card = document.createElement('div');
  card.className = 'forum-card';
  const escapedTitle = titulo.replace(/'/g, "\\'");
  const escapedDesc = desc.replace(/'/g, "\\'");

  card.innerHTML = `
    <div class="forum-votes">
      <i class="fa-solid fa-circle-chevron-up" onclick="votarPost(this, 1)"></i>
      <span class="v-count" style="color:#FF6D00;">1</span>
      <i class="fa-solid fa-circle-chevron-down" onclick="votarPost(this, -1)"></i>
    </div>
    <div class="forum-body">
      <span class="forum-cat"><i class="fa-solid fa-comments"></i> ${tipo}</span>
      <div class="forum-title">${titulo}</div>
      <div class="forum-desc">${desc}</div>
      <div class="forum-footer">
        <span style="cursor:pointer; color:#FF6D00; font-weight:700;" onclick="abrirComentariosPost(${newIndex}, '${escapedTitle}', '${escapedDesc}', '${tipo}', this)">
          💬 <span class="comment-count-num">0</span> comentarios
        </span>
        <button class="btn-report" onclick="abrirModalDenuncia('Aviso OTB', '${escapedTitle}')"><i class="fa-solid fa-flag"></i> Denunciar</button>
      </div>
    </div>
  `;

  feed.prepend(card);
  closeNuevoPostModal();
  inputTitulo.value = '';
  inputDesc.value = '';
  alert('¡Tu aviso ha sido publicado en la OTB!');
}

function abrirComentariosPost(postIndex, title, desc, cat, btnElem) {
  activePostCommentsRef = { index: postIndex, btnElem: btnElem };
  const modalCat = document.getElementById('commentsPostCat');
  const modalTitle = document.getElementById('commentsPostTitle');
  const modalDesc = document.getElementById('commentsPostDesc');
  const modalComments = document.getElementById('modalComments');

  if (modalCat) modalCat.innerText = cat;
  if (modalTitle) modalTitle.innerText = title;
  if (modalDesc) modalDesc.innerText = desc;

  renderComments(postIndex);
  if (modalComments) modalComments.style.display = 'flex';
}

function closeCommentsModal() {
  const modalComments = document.getElementById('modalComments');
  if (modalComments) modalComments.style.display = 'none';
}

function renderComments(postIndex) {
  const container = document.getElementById('commentsList');
  if (!container) return;

  const comments = postCommentsStore[postIndex] || [];
  if (comments.length === 0) {
    container.innerHTML = '<div style="font-size: 11px; color: #64748B; text-align: center; padding: 12px;">Sé el primero en comentar este aviso...</div>';
    return;
  }

  container.innerHTML = comments.map(c => `
    <div style="background: #0F172A; padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); margin-bottom: 6px;">
      <div style="display: flex; justify-content: space-between; font-size: 10px; color: #FF6D00; font-weight: 700;">
        <span>👤 ${c.author}</span>
        <button class="btn-report" onclick="abrirModalDenuncia('Comentario OTB', 'Comentario de ${c.author}')"><i class="fa-solid fa-flag"></i></button>
      </div>
      <div style="font-size: 12px; color: #E2E8F0; margin-top: 3px;">${c.text}</div>
    </div>
  `).join('');
}

function agregarComentarioPost() {
  const input = document.getElementById('inputNewComment');
  if (!input) return;

  const text = input.value.trim();
  if (!text || !activePostCommentsRef) return;
  
  const idx = activePostCommentsRef.index;
  if (!postCommentsStore[idx]) postCommentsStore[idx] = [];

  let userAlias = "Tú (Vecino OTB)";
  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) {
      const u = JSON.parse(saved);
      if (u.nombre) userAlias = `${u.nombre} ${u.apellido ? u.apellido[0] + '.' : ''}`;
    }
  } catch(e){}

  postCommentsStore[idx].push({
    author: userAlias,
    text: text,
    time: "Hace un momento"
  });
  
  input.value = '';
  renderComments(idx);
  
  if (activePostCommentsRef.btnElem) {
    const countSpan = activePostCommentsRef.btnElem.querySelector('.comment-count-num');
    if (countSpan) {
      countSpan.innerText = postCommentsStore[idx].length;
    }
  }
}

/* SISTEMA DE DENUNCIAS DE ACOSO, BULLYING O CONTENIDO INAPROPIADO */
function abrirModalDenuncia(contexto, objetoReportado) {
  const modalReport = document.getElementById('modalReport');
  const targetLabel = document.getElementById('reportTargetLabel');
  const hiddenContext = document.getElementById('reportContext');

  if (targetLabel) targetLabel.innerText = `${contexto}: "${objetoReportado}"`;
  if (hiddenContext) hiddenContext.value = `${contexto} | ${objetoReportado}`;
  if (modalReport) modalReport.style.display = 'flex';
}

function closeReportModal() {
  const modalReport = document.getElementById('modalReport');
  if (modalReport) modalReport.style.display = 'none';
}

function enviarDenuncia() {
  const motivoSelect = document.getElementById('selectReportMotivo');
  const detalleInput = document.getElementById('inputReportDetalle');
  const contextVal = document.getElementById('reportContext')?.value || 'General';

  if (!motivoSelect) return;

  const motivo = motivoSelect.value;
  const detalle = detalleInput ? detalleInput.value.trim() : '';

  closeReportModal();

  alert(`🚨 DENUNCIA REGISTRADA EN EL SISTEMA\n\nMotivo: ${motivo}\nContexto: ${contextVal}\n\nGracias por reportar. Nuestro equipo de moderación administrará esta publicación para mantener una comunidad segura en la OTB.`);
}
