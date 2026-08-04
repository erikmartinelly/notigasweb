/* ==========================================================================
   NOTIGAS - MÓDULO DE NOTICIAS VECINALES (AVISOS, VOTOS, COMENTARIOS Y EXPIRACIÓN AUTOMÁTICA DE 72 HORAS)
   ========================================================================== */

const FORUM_POST_EXPIRATION_MS = 72 * 60 * 60 * 1000; // 72 Horas (3 Días) en milisegundos

let postCounterIndex = 1;
let activePostCommentsRef = null;

const defaultForumPosts = [];
let postCommentsStore = {};

function escapeHtmlStr(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

document.addEventListener('DOMContentLoaded', () => {
  cargarComentariosGuardados();
  renderForumFeed();
});

function cargarComentariosGuardados() {
  try {
    const raw = localStorage.getItem('notigas_forum_comments_store');
    if (raw) postCommentsStore = JSON.parse(raw);
  } catch(e){}
}

function guardarComentariosStore() {
  try {
    localStorage.setItem('notigas_forum_comments_store', JSON.stringify(postCommentsStore));
  } catch(e){}
}

function depurarPostsExpirados(posts) {
  const now = Date.now();
  return posts.filter(p => (now - p.timestamp) < FORUM_POST_EXPIRATION_MS);
}

function renderForumFeed() {
  const feed = document.getElementById('forumFeed');
  if (!feed) return;

  const currentAdmin = sessionStorage.getItem('notigas_admin_session');
  const isAdmin = currentAdmin && (currentAdmin.includes('erikmartinelly') || currentAdmin.includes('leonmartinelly'));

  let localPosts = [];
  try {
    const raw = localStorage.getItem('notigas_forum_posts');
    if (raw) localPosts = JSON.parse(raw);
  } catch(e){}

  localPosts = depurarPostsExpirados(localPosts);
  localStorage.setItem('notigas_forum_posts', JSON.stringify(localPosts));

  if (localPosts.length === 0) {
    feed.innerHTML = `
      <div style="text-align:center; color:#94A3B8; padding:40px 14px; font-size:13px; background: #1E293B; border-radius: 14px; border: 1px dashed rgba(255,255,255,0.15);">
        <i class="fa-solid fa-comments" style="font-size:32px; color:#FF6D00; margin-bottom:10px;"></i><br>
        <strong>El Tablón de Anuncios Vecinal está limpio.</strong><br>
        <span style="font-size: 11px; color: #64748B;">Sé el primero en publicar un aviso, alerta u oferta para los vecinos de tu OTB.</span><br><br>
        <button class="btn-new-post" style="margin: 0 auto; padding: 10px 16px; font-size: 12px;" onclick="abrirModalNuevoPost()">📌 Publicar Nuevo Aviso (72 Horas)</button>
      </div>
    `;
    return;
  }

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
            <div style="display:flex; gap:6px; align-items:center;">
              <button class="btn-report" onclick="abrirModalDenuncia('Aviso Noticias Vecinales', '${escapedTitle}')"><i class="fa-solid fa-flag"></i> Denunciar</button>
              ${isAdmin ? `<button onclick="borrarPostForumAdmin(${post.id})" style="background:#D32F2F; color:white; border:none; padding:2px 6px; border-radius:4px; font-size:9px; font-weight:700; cursor:pointer;" title="Borrar como Admin"><i class="fa-solid fa-trash"></i> Borrar (Admin)</button>` : ''}
            </div>
          </div>
        </div>
      </div>
    `;

    // PROPAGANDA FACEBOOK FEED AL MEDIO DEL TABLÓN DE NOTICIAS VECINALES
    if (index === 0) {
      html += `
        <div class="ad-facebook-feed-card" onclick="abrirAnuncioWhatsApp()" style="cursor:pointer;">
          <div class="ad-fb-header">
            <div class="ad-fb-profile">
              <div class="ad-fb-icon"><i class="fa-solid fa-bullhorn"></i></div>
              <div class="ad-fb-info">
                <div class="ad-fb-name" id="adForumTitle">🏢 Servicios Técnicos, Comercio Local & Anuncios OTB</div>
                <div class="ad-fb-sub"><i class="fa-solid fa-earth-americas"></i> PUBLICIDAD PATROCINADA EN EL FEED DE NOTICIAS VECINALES</div>
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

function borrarPostForumAdmin(postId) {
  if (confirm("🗑️ ¿Deseas eliminar permanentemente esta publicación del Tablón Vecinal?")) {
    let localPosts = [];
    try {
      const raw = localStorage.getItem('notigas_forum_posts');
      if (raw) localPosts = JSON.parse(raw);
    } catch(e){}
    localPosts = localPosts.filter(p => p.id !== postId);
    localStorage.setItem('notigas_forum_posts', JSON.stringify(localPosts));
    renderForumFeed();
    alert("🗑️ Publicación eliminada con éxito.");
  }
}

function votarPost(el, delta, postId) {
  const span = el.parentElement.querySelector('.v-count');
  if (span) {
    let val = parseInt(span.innerText) || 0;
    val += delta;
    span.innerText = val;

    try {
      let localPosts = JSON.parse(localStorage.getItem('notigas_forum_posts') || '[]');
      const p = localPosts.find(item => item.id === postId);
      if (p) {
        p.votes = val;
        localStorage.setItem('notigas_forum_posts', JSON.stringify(localPosts));
      }
    } catch(e){}
  }
}

function abrirModalNuevoPost() {
  const modal = document.getElementById('modalNuevoPost') || document.getElementById('modalNewPost');
  if (modal) modal.style.display = 'flex';
}

function closeNewPostModal() {
  const modal = document.getElementById('modalNuevoPost') || document.getElementById('modalNewPost');
  if (modal) modal.style.display = 'none';
}

function closeNuevoPostModal() {
  closeNewPostModal();
}

function crearNuevoPost() {
  const title = (document.getElementById('inputPostTitulo')?.value || document.getElementById('inputPostTitle')?.value || '').trim();
  const desc = (document.getElementById('inputPostDesc')?.value || '').trim();
  const cat = document.getElementById('selectPostTipo')?.value || document.getElementById('selectPostCat')?.value || 'AVISO VECINAL';

  if (!title || !desc) {
    alert('Por favor ingresa un título y una descripción para tu publicación vecinal.');
    return;
  }

  let localPosts = [];
  try {
    const raw = localStorage.getItem('notigas_forum_posts');
    if (raw) localPosts = JSON.parse(raw);
  } catch(e){}

  const newObj = {
    id: Date.now(),
    cat: cat,
    title: title,
    desc: desc,
    votes: 1,
    timestamp: Date.now()
  };

  localPosts.unshift(newObj);
  localStorage.setItem('notigas_forum_posts', JSON.stringify(localPosts));

  closeNewPostModal();
  if (document.getElementById('inputPostTitulo')) document.getElementById('inputPostTitulo').value = '';
  if (document.getElementById('inputPostTitle')) document.getElementById('inputPostTitle').value = '';
  if (document.getElementById('inputPostDesc')) document.getElementById('inputPostDesc').value = '';

  renderForumFeed();
  alert('📌 ¡Aviso publicado exitosamente! Tu publicación estará activa durante 72 horas (3 Días).');
}

function abrirComentariosPost(postId, title, desc, cat, el) {
  activePostCommentsRef = { id: postId, element: el };
  const modal = document.getElementById('modalComments') || document.getElementById('modalPostComments');
  if (!modal) return;

  const elTitle = document.getElementById('commentsPostTitle') || document.getElementById('modalCommentsTitle');
  const elDesc = document.getElementById('commentsPostDesc') || document.getElementById('modalCommentsDesc');
  const elCat = document.getElementById('commentsPostCat') || document.getElementById('modalCommentsCat');

  if (elTitle) elTitle.innerText = title;
  if (elDesc) elDesc.innerText = desc;
  if (elCat) elCat.innerHTML = `<i class="fa-solid fa-comments"></i> ${cat}`;

  renderCommentsList(postId);
  modal.style.display = 'flex';
}

function closeCommentsModal() {
  const modal = document.getElementById('modalComments') || document.getElementById('modalPostComments');
  if (modal) modal.style.display = 'none';
  activePostCommentsRef = null;
}

function renderCommentsList(postId) {
  const box = document.getElementById('commentsList') || document.getElementById('commentsContainer');
  if (!box) return;

  const comments = postCommentsStore[postId] || [];
  if (comments.length === 0) {
    box.innerHTML = '<div style="color:#64748B; font-size:11px; text-align:center; padding:10px;">Sé el primero en comentar este aviso vecinal.</div>';
    return;
  }

  let html = '';
  comments.forEach(c => {
    html += `
      <div style="background:#0F172A; padding:8px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.05); margin-bottom:6px;">
        <div style="display:flex; justify-content:space-between; font-size:10px; font-weight:700; color:#FF6D00;">
          <span>${escapeHtmlStr(c.author)}</span>
          <span style="color:#64748B; font-weight:400;">${escapeHtmlStr(c.time)}</span>
        </div>
        <div style="font-size:12px; color:white; margin-top:2px;">${escapeHtmlStr(c.text)}</div>
      </div>
    `;
  });
  box.innerHTML = html;
}

function agregarComentarioPost() {
  if (!activePostCommentsRef) return;
  const input = document.getElementById('inputNewComment') || document.getElementById('inputNuevoComentario');
  const text = (input?.value || '').trim();

  if (!text) return;

  const postId = activePostCommentsRef.id;
  if (!postCommentsStore[postId]) postCommentsStore[postId] = [];

  let authorName = "Vecino de la OTB";
  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) {
      const u = JSON.parse(saved);
      if (u.nombre) authorName = u.nombre;
    }
  } catch(e){}

  postCommentsStore[postId].push({
    author: authorName,
    text: text,
    time: "Ahora mismo"
  });

  guardarComentariosStore();

  input.value = '';
  renderCommentsList(postId);

  if (activePostCommentsRef.element) {
    const numSpan = activePostCommentsRef.element.querySelector('.comment-count-num');
    if (numSpan) {
      numSpan.innerText = postCommentsStore[postId].length;
    }
  }
}
