/* ==========================================================================
   NOTIGAS - MÓDULO DE MINI REDDIT VECINAL (AVISOS, VOTOS, COMENTARIOS Y EXPIRACIÓN DE 7 DÍAS)
   ========================================================================== */

const FORUM_POST_EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 Días en milisegundos

let postCounterIndex = 3;
let activePostCommentsRef = null;

const defaultForumPosts = [
  {
    id: 0,
    cat: "QUEJA VECINAL",
    title: "⚠️ Foco parpadeando en la esquina de la Calle 3 por la OTB",
    desc: "Lleva 2 horas parpadeando el foco de la esquina. ¿Alguien ya llamó a la alcaldía o a alumbrado público?",
    votes: 24,
    timestamp: Date.now() - (1000 * 60 * 45) // hace 45 min
  },
  {
    id: 1,
    cat: "APOYO VECINAL",
    title: "🐶 Perrito caniche blanco extraviado cerca de la plaza",
    desc: "Lleva collar rojo sin placa. Si lo ven por favor reténganlo y me avisan por aquí.",
    votes: 41,
    timestamp: Date.now() - (1000 * 60 * 120) // hace 2 horas
  },
  {
    id: 2,
    cat: "AVISO DE CAMIÓN",
    title: "🚛 Camión de agua purificada 20L pasando por la Av. Principal",
    desc: "El camión azul de agua acaba de doblar por el parque. Apúrense los que necesiten botellón.",
    votes: 18,
    timestamp: Date.now() - (1000 * 60 * 10) // hace 10 min
  }
];

const postCommentsStore = {
  0: [
    { author: "Vecino Calle 2", text: "Ya reportamos a alumbrado público, dijeron que pasan en la tarde.", time: "Hace 30 min" },
    { author: "Doña Martha", text: "Gracias por avisar, dejé encendido el foco de mi puerta.", time: "Hace 15 min" }
  ],
  1: [
    { author: "Carlos M.", text: "¡Lo vi corriendo por la cancha sintética hace 20 min!", time: "Hace 1 hora" },
    { author: "Familia Rojas", text: "Ya lo tenemos resguardado en la casa #45, pueden venir.", time: "Hace 10 min" }
  ],
  2: [
    { author: "Don Pedro", text: "¡Llegó a tiempo el agua! Gracias vecina.", time: "Hace 5 min" }
  ]
};

document.addEventListener('DOMContentLoaded', () => {
  renderForumFeed();
});

function depurarPostsExpirados(posts) {
  const now = Date.now();
  return posts.filter(p => (now - p.timestamp) < FORUM_POST_EXPIRATION_MS);
}

function renderForumFeed() {
  const feed = document.getElementById('forumFeed');
  if (!feed) return;

  let localPosts = [];
  try {
    const raw = localStorage.getItem('notigas_forum_posts');
    if (raw) localPosts = JSON.parse(raw);
  } catch(e){}

  if (localPosts.length === 0) {
    localPosts = [...defaultForumPosts];
  }

  localPosts = depurarPostsExpirados(localPosts);
  localStorage.setItem('notigas_forum_posts', JSON.stringify(localPosts));

  let html = '';
  localPosts.forEach((post, index) => {
    const commentCount = (postCommentsStore[post.id] || []).length;
    const escapedTitle = (post.title || '').replace(/'/g, "\\'");
    const escapedDesc = (post.desc || '').replace(/'/g, "\\'");

    html += `
      <div class="forum-card">
        <div class="forum-votes">
          <i class="fa-solid fa-circle-chevron-up" title="▲ Me Gusta" onclick="votarPost(this, 1, ${post.id})"></i>
          <span class="v-count" style="color:#FF6D00;">${post.votes}</span>
          <i class="fa-solid fa-circle-chevron-down" title="▼ Me Disgusta" onclick="votarPost(this, -1, ${post.id})"></i>
        </div>
        <div class="forum-body">
          <span class="forum-cat"><i class="fa-solid fa-comments"></i> ${post.cat}</span>
          <div class="forum-title">${post.title}</div>
          <div class="forum-desc">${post.desc}</div>
          <div class="forum-footer">
            <span style="cursor:pointer; color:#FF6D00; font-weight:700;" onclick="abrirComentariosPost(${post.id}, '${escapedTitle}', '${escapedDesc}', '${post.cat}', this)">
              💬 <span class="comment-count-num">${commentCount}</span> comentarios
            </span>
            <button class="btn-report" onclick="abrirModalDenuncia('Aviso Reddit', '${escapedTitle}')"><i class="fa-solid fa-flag"></i> Denunciar Publicación</button>
          </div>
        </div>
      </div>
    `;

    // PROPAGANDA FACEBOOK FEED AL MEDIO DEL TABLÓN DE ANUNCIOS REDDIT
    if (index === 1) {
      html += `
        <div class="ad-facebook-feed-card" onclick="abrirAnuncioWhatsApp()" style="cursor:pointer;">
          <div class="ad-fb-header">
            <div class="ad-fb-profile">
              <div class="ad-fb-icon"><i class="fa-solid fa-bullhorn"></i></div>
              <div class="ad-fb-info">
                <div class="ad-fb-name" id="adForumTitle">🏢 Servicios Técnicos, Comercio Local & Anuncios OTB</div>
                <div class="ad-fb-sub"><i class="fa-solid fa-earth-americas"></i> PUBLICIDAD PATROCINADA EN EL FEED REDDIT</div>
              </div>
            </div>
            <span class="ad-badge">SPONSOR</span>
          </div>
          <div class="ad-fb-body" id="adForumDesc">
            ¿Tienes un negocio en el barrio o deseas anunciar tu servicio profesional? Publica gratis tu anuncio o contrata espacio destacado.
          </div>
          <div class="ad-fb-media">
            <div>
              <div class="ad-fb-media-title">Destaca tu Anuncio Comercial</div>
              <div class="ad-fb-media-desc">Llega a toda la comunidad de tu OTB</div>
            </div>
            <button class="btn-ad-contact" onclick="event.stopPropagation(); abrirAnuncioWhatsApp()"><i class="fa-solid fa-arrow-up-right-from-square"></i> Anunciar</button>
          </div>
        </div>
      `;
    }
  });

  feed.innerHTML = html;
}

function votarPost(el, delta, postId) {
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
    alert('Por favor escribe un título y la descripción de tu aviso para la OTB.');
    return;
  }

  let localPosts = [];
  try {
    const raw = localStorage.getItem('notigas_forum_posts');
    if (raw) localPosts = JSON.parse(raw);
  } catch(e){}

  const newPost = {
    id: Date.now(),
    cat: tipo,
    title: titulo,
    desc: desc,
    votes: 1,
    timestamp: Date.now()
  };

  localPosts.unshift(newPost);
  localStorage.setItem('notigas_forum_posts', JSON.stringify(localPosts));

  postCommentsStore[newPost.id] = [];

  renderForumFeed();
  closeNuevoPostModal();

  inputTitulo.value = '';
  inputDesc.value = '';
  alert('📢 ¡Tu aviso gratis ha sido publicado en el Mini Reddit Vecinal! Permanecerá visible durante 1 semana.');
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
    container.innerHTML = '<div style="font-size: 11px; color: #64748B; text-align: center; padding: 12px;">Sé el primero en comentar este aviso vecinal...</div>';
    return;
  }

  container.innerHTML = comments.map(c => `
    <div style="background: #0F172A; padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); margin-bottom: 6px;">
      <div style="display: flex; justify-content: space-between; font-size: 10px; color: #FF6D00; font-weight: 700;">
        <span>👤 ${c.author}</span>
        <button class="btn-report" onclick="abrirModalDenuncia('Comentario Reddit', 'Comentario de ${c.author}')"><i class="fa-solid fa-flag"></i></button>
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

  let userAlias = "Cliente (Vecino OTB)";
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
