/* ==========================================================================
   NOTIGAS - MÓDULO DE NOTICIAS VECINALES (AVISOS, VOTOS, COMENTARIOS EN SUPABASE)
   ========================================================================== */

let activePostCommentsRef = null;

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
  if (window.supabaseClient) {
      renderForumFeed();
      
      // Suscripción Realtime a Avisos de Barrio
      window.supabaseClient.channel('forum_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'publicaciones', filter: 'tipo=eq.avisoBarrio' }, payload => {
            renderForumFeed(); // Recargar el foro completo cuando haya cambios (podría optimizarse)
        })
        .subscribe();
  }
});

async function renderForumFeed() {
  const feed = document.getElementById('forumFeed');
  if (!feed || !window.supabaseClient) return;

  const currentAdmin = sessionStorage.getItem('notigas_admin_session');
  const isAdmin = currentAdmin && (currentAdmin.includes('erikmartinelly') || currentAdmin.includes('leonmartinelly'));

  const { data: localPosts, error } = await window.supabaseClient.from('publicaciones')
    .select('*')
    .eq('tipo', 'avisoBarrio')
    .order('created_at', { ascending: false });

  if (error) {
      console.error("Error cargando foro:", error);
      return;
  }

  if (!localPosts || localPosts.length === 0) {
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
    // Evitar errores si comentarios no existe aún en la BD
    const commentsList = post.comentarios || [];
    const commentCount = commentsList.length;
    const escapedTitle = (post.titulo || '').replace(/'/g, "\\'");
    const escapedDesc = (post.descripcion || '').replace(/'/g, "\\'");

    html += `
      <div class="forum-card">
        <div class="forum-votes">
          <i class="fa-solid fa-circle-chevron-up" title="▲ Me Gusta" onclick="votarPost(this, 1, '${post.id}')"></i>
          <span class="v-count" style="color:#FF6D00;">${post.votos || 1}</span>
          <i class="fa-solid fa-circle-chevron-down" title="▼ Me Disgusta" onclick="votarPost(this, -1, '${post.id}')"></i>
        </div>
        <div class="forum-body">
          <span class="forum-cat"><i class="fa-solid fa-comments"></i> ${post.categoria}</span>
          <div class="forum-title">${escapeHtmlStr(post.titulo)}</div>
          <div class="forum-desc">${escapeHtmlStr(post.descripcion)}</div>
          <div class="forum-footer">
            <span style="cursor:pointer; color:#FF6D00; font-weight:700;" onclick="abrirComentariosPost('${post.id}', '${escapedTitle}', '${escapedDesc}', '${post.categoria}', this)">
              💬 <span class="comment-count-num">${commentCount}</span> comentarios
            </span>
            <div style="display:flex; gap:6px; align-items:center;">
              <button class="btn-report" onclick="abrirModalDenuncia('Aviso Noticias Vecinales', '${escapedTitle}')"><i class="fa-solid fa-flag"></i> Denunciar</button>
              ${isAdmin ? `<button onclick="borrarPostForumAdmin('${post.id}')" style="background:#D32F2F; color:white; border:none; padding:2px 6px; border-radius:4px; font-size:9px; font-weight:700; cursor:pointer;" title="Borrar como Admin"><i class="fa-solid fa-trash"></i> Borrar (Admin)</button>` : ''}
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

async function borrarPostForumAdmin(postId) {
  if (confirm("🗑️ ¿Deseas eliminar permanentemente esta publicación del Tablón Vecinal?")) {
      const { error } = await window.supabaseClient.from('publicaciones').delete().eq('id', postId);
      if (error) {
          alert('Error borrando el post');
          return;
      }
      if (typeof showToast === 'function') {
        showToast('🗑️ Publicación Borrada', 'El aviso o anuncio de la OTB fue eliminado del sistema.', 'info', 4000);
      }
  }
}

async function votarPost(el, delta, postId) {
  const voteKey = `notigas_voted_${postId}`;
  if (sessionStorage.getItem(voteKey)) return;
  sessionStorage.setItem(voteKey, '1');

  const span = el.parentElement.querySelector('.v-count');
  if (span) {
    let val = parseInt(span.innerText) || 1;
    val += delta;
    span.innerText = val;
    
    // Obtenemos los votos actuales y lo actualizamos (Race condition posible, pero aceptable para un MVP)
    const { data } = await window.supabaseClient.from('publicaciones').select('votos').eq('id', postId).single();
    const currentVotes = data ? (data.votos || 1) : 1;
    await window.supabaseClient.from('publicaciones').update({ votos: currentVotes + delta }).eq('id', postId);
  }
}

function abrirModalNuevoPost() {
  const modal = document.getElementById('modalNuevoPost');
  if (modal) modal.style.display = 'flex';
}

function closeNewPostModal() {
  const modal = document.getElementById('modalNuevoPost');
  if (modal) modal.style.display = 'none';
}

function closeNuevoPostModal() {
  closeNewPostModal();
}

async function crearNuevoPost() {
  const title = (document.getElementById('inputPostTitulo')?.value || '').trim();
  const desc = (document.getElementById('inputPostDesc')?.value || '').trim();
  const cat = document.getElementById('selectPostTipo')?.value || 'AVISO VECINAL';

  if (!title || !desc) {
    alert('Por favor ingresa un título y una descripción para tu publicación vecinal.');
    return;
  }

  const { error } = await window.supabaseClient.from('publicaciones').insert([{
    tipo: 'avisoBarrio',
    categoria: cat,
    titulo: title,
    descripcion: desc,
    ciudad: 'Cochabamba',
    barrio_otb: 'Global',
    user_email: 'vecino@notigas.com', // mock email for now
    user_role: 'comprador',
    latitude: typeof currentGpsLat !== 'undefined' ? currentGpsLat : -17.3895,
    longitude: typeof currentGpsLng !== 'undefined' ? currentGpsLng : -66.1568,
    comentarios: [],
    votos: 1
  }]);

  if (error) {
      console.error(error);
      alert('Hubo un error publicando el aviso.');
      return;
  }

  closeNewPostModal();
  if (document.getElementById('inputPostTitulo')) document.getElementById('inputPostTitulo').value = '';
  if (document.getElementById('inputPostTitle')) document.getElementById('inputPostTitle').value = '';
  if (document.getElementById('inputPostDesc')) document.getElementById('inputPostDesc').value = '';

  alert('📌 ¡Aviso publicado exitosamente! Todos los vecinos podrán verlo en tiempo real.');
}

async function abrirComentariosPost(postId, title, desc, cat, el) {
  activePostCommentsRef = { id: postId, element: el };
  const modal = document.getElementById('modalComments') || document.getElementById('modalPostComments');
  if (!modal) return;

  const elTitle = document.getElementById('commentsPostTitle') || document.getElementById('modalCommentsTitle');
  const elDesc = document.getElementById('commentsPostDesc') || document.getElementById('modalCommentsDesc');
  const elCat = document.getElementById('commentsPostCat') || document.getElementById('modalCommentsCat');

  if (elTitle) elTitle.innerText = title;
  if (elDesc) elDesc.innerText = desc;
  if (elCat) elCat.innerHTML = `<i class="fa-solid fa-comments"></i> ${cat}`;

  const box = document.getElementById('commentsList') || document.getElementById('commentsContainer');
  if (box) box.innerHTML = '<div style="color:#94A3B8; font-size:11px; text-align:center;">Cargando comentarios...</div>';
  
  modal.style.display = 'flex';
  
  const { data } = await window.supabaseClient.from('publicaciones').select('comentarios').eq('id', postId).single();
  const comments = data ? (data.comentarios || []) : [];
  renderCommentsListUI(comments);
}

function renderCommentsListUI(comments) {
    const box = document.getElementById('commentsList') || document.getElementById('commentsContainer');
    if (!box) return;

    if (!comments || comments.length === 0) {
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

function closeCommentsModal() {
  const modal = document.getElementById('modalComments') || document.getElementById('modalPostComments');
  if (modal) modal.style.display = 'none';
  activePostCommentsRef = null;
}

async function agregarComentarioPost() {
  if (!activePostCommentsRef) return;
  const input = document.getElementById('inputNewComment') || document.getElementById('inputNuevoComentario');
  const text = (input?.value || '').trim();

  if (!text) return;

  const postId = activePostCommentsRef.id;

  let authorName = "Vecino de la OTB";
  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) {
      const u = JSON.parse(saved);
      if (u.nombre) authorName = u.nombre;
    }
  } catch(e){}

  const newComment = {
    author: authorName,
    text: text,
    time: "Ahora mismo"
  };

  // Obtener los comentarios actuales
  const { data } = await window.supabaseClient.from('publicaciones').select('comentarios').eq('id', postId).single();
  const comments = data ? (data.comentarios || []) : [];
  comments.push(newComment);

  // Actualizar en Supabase
  const { error } = await window.supabaseClient.from('publicaciones').update({ comentarios: comments }).eq('id', postId);
  
  if (!error) {
      input.value = '';
      renderCommentsListUI(comments);

      if (activePostCommentsRef.element) {
        const numSpan = activePostCommentsRef.element.querySelector('.comment-count-num');
        if (numSpan) {
          numSpan.innerText = comments.length;
        }
      }
  } else {
      alert("Error publicando comentario");
  }
}
