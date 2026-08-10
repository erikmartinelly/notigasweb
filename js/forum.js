/* ==========================================================================
   NOTIGAS - MÓDULO DE NOTICIAS VECINALES (AVISOS, VOTOS, COMENTARIOS EN SUPABASE)
   ========================================================================== */

let activePostCommentsRef = null;

// escapeHtmlStr está centralizada en state.js — eliminada aquí para evitar duplicados.
// Si state.js no cargó aún, usamos una versión de respaldo local.
const escapeHtmlStr = window.escapeHtmlStr || function(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
};

document.addEventListener('DOMContentLoaded', () => {
  if (window.supabaseClient) {
      renderForumFeed();
  }
});

async function renderForumFeed() {
  const feed = document.getElementById('forumFeed');
  if (!feed || !window.supabaseClient) return;

  const currentAdmin = getVerifiedAdminEmail();
  const isAdmin = currentAdmin && (currentAdmin.includes('erikmartinelly') || currentAdmin.includes('leonmartinelly'));

  const { data: localPosts, error } = await window.supabaseClient.from('avisos')
    .select('*')
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
          <div class="forum-footer" style="display:flex; justify-content:space-between; align-items:center;">
            <button onclick="abrirComentariosPost('${post.id}', '${escapedTitle}', '${escapedDesc}', '${post.categoria}', this)" style="background: rgba(255,109,0,0.15); color: #FF6D00; border: 1px solid rgba(255,109,0,0.3); border-radius: 20px; padding: 6px 14px; font-size: 12px; font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s;">
              <i class="fa-regular fa-comment"></i> <span class="comment-count-num">${commentCount}</span> Comentar
            </button>
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
      const { error } = await window.supabaseClient.from('avisos').delete().eq('id', postId);
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
    
    // FIX #9: Actualización atómica de votos — elimina la race condition.
    // Usa una expresión SQL directa en lugar de leer+escribir en dos pasos.
    await window.supabaseClient.rpc('incrementar_votos_aviso', { aviso_id: postId, incremento: delta });
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

  // FIX W-03: Filtro Anti-Spam mejorado — menos falsos positivos.
  // Se eliminan palabras genéricas (the, and, for, with) que pueden aparecer en nombres/siglas.
  // Ahora requiere 3+ palabras spam Y el texto no debe contener caracteres típicamente españoles.
  const textoCompleto = (title + ' ' + desc).toLowerCase();

  // Solo bloquea si el texto contiene términos claramente spam/phishing
  const spamWords = /\b(crypto|casino|bonus|invest|bitcoin|viagra|porn|click here|forex|loan|make money|free money|winner|prize|gambling|adult content|xxx)\b/gi;
  const spamMatches = textoCompleto.match(spamWords);

  // Detectar si hay contenido en español (tildes, ñ, signos de interrogación/exclamación)
  const hasSpanishChars = /[à-ÿñÑ¡¿]/i.test(textoCompleto);

  // Bloquear solo si hay 2+ palabras spam Y NO hay caracteres en español (probable bot/spam en inglés)
  if (spamMatches && spamMatches.length >= 2 && !hasSpanishChars) {
    alert('⛔ ALERTA DE SEGURIDAD: Tu publicación ha sido bloqueada por el filtro Anti-Spam.\n\nNOTIGAS es una plataforma exclusiva para vecinos hispanohablantes.');
    if (window.supabaseClient) {
      window.supabaseClient.from('reportes_spam').insert([{ texto: textoCompleto, motivo: 'Filtro Anti-Spam mejorado' }]).then();
    }
    closeNewPostModal();
    return;
  }

  // Obtener user_id de la sesión activa (Supabase v2)
  let userId = null;
  try {
    const { data: sessionData } = await window.supabaseClient.auth.getSession();
    userId = sessionData?.session?.user?.id || null;
  } catch(e) {}

  const { error } = await window.supabaseClient.from('avisos').insert([{
    categoria: cat,
    titulo: title,
    descripcion: desc,
    ciudad: 'Cochabamba',
    barrio_otb: 'Global',
    user_id: userId,
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

/**
 * FIX W-01: Carga comentarios de la tabla 'comentarios_avisos' (ya no del JSONB en avisos).
 * Elimina la race condition de leer + modificar array + escribir todo el campo.
 */
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

  // FIX W-01: Consultar tabla propia 'comentarios_avisos' en lugar del JSONB embebido
  const { data, error } = await window.supabaseClient
    .from('comentarios_avisos')
    .select('*')
    .eq('aviso_id', postId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error cargando comentarios:', error);
    if (box) box.innerHTML = '<div style="color:#EF4444; font-size:11px; text-align:center;">Error al cargar comentarios.</div>';
    return;
  }

  renderCommentsListUI(data || []);
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
        // FIX W-01: Los comentarios de la nueva tabla tienen campo 'id' de BD (bigint), siempre único.
        const cId = c.id;
        const v = c.votos || 1;
        const autor = c.autor || c.author || 'Vecino de la OTB';
        const texto = c.texto || c.text || '';
        const tiempo = c.created_at ? new Date(c.created_at).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }) : 'Ahora mismo';
        html += `
        <div style="background:#0F172A; padding:8px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.05); margin-bottom:6px; display:flex; gap:10px;">
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:start; min-width:24px; gap:6px; padding-top:2px;">
              <i class="fa-solid fa-arrow-up" style="color:#64748B; font-size:13px; cursor:pointer;" onclick="votarComentario('${cId}', 1)"></i>
              <span style="color:#FF6D00; font-size:12px; font-weight:900;" id="c_votos_${cId}">${v}</span>
              <i class="fa-solid fa-arrow-down" style="color:#64748B; font-size:13px; cursor:pointer;" onclick="votarComentario('${cId}', -1)"></i>
            </div>
            <div style="flex:1;">
              <div style="display:flex; justify-content:space-between; font-size:10.5px; font-weight:800; color:#38BDF8;">
                <span>${escapeHtmlStr(autor)}</span>
                <span style="color:#64748B; font-weight:500;">${escapeHtmlStr(tiempo)}</span>
              </div>
              <div style="font-size:12px; color:white; margin-top:4px; line-height:1.4;">${escapeHtmlStr(texto)}</div>
            </div>
        </div>
        `;
    });
    box.innerHTML = html;
}

/**
 * FIX W-01+W-05: Voto atómico sobre la tabla 'comentarios_avisos'.
 * Usa la RPC 'incrementar_votos_comentario' (UPDATE directo por id).
 * Elimina completamente la race condition anterior que uó Math.random().
 */
async function votarComentario(comentarioId, delta) {
  const voteKey = `notigas_voted_c_${comentarioId}`;
  if (sessionStorage.getItem(voteKey)) return;
  sessionStorage.setItem(voteKey, '1');

  // Actualizar UI optimistamente
  const span = document.getElementById(`c_votos_${comentarioId}`);
  if (span) {
    let val = parseInt(span.innerText) || 0;
    span.innerText = val + delta;
  }

  // FIX W-05: UPDATE directo por id en tabla propia — sin leer+modificar+escribir el JSON array
  try {
    await window.supabaseClient.rpc('incrementar_votos_comentario', {
      comentario_id: parseInt(comentarioId, 10),
      incremento: delta
    });
  } catch (e) {
    console.error('Error votando comentario:', e);
  }
}

function closeCommentsModal() {
  const modal = document.getElementById('modalComments') || document.getElementById('modalPostComments');
  if (modal) modal.style.display = 'none';
  activePostCommentsRef = null;
}

/**
 * FIX W-01: Agrega comentario insertando una fila nueva en 'comentarios_avisos'.
 * Elimina la secuencia de leer+modificar array+escribir que causaba race conditions.
 */
async function agregarComentarioPost() {
  if (!activePostCommentsRef) return;
  const input = document.getElementById('inputNewComment') || document.getElementById('inputNuevoComentario');
  const text = (input?.value || '').trim();

  if (!text) return;

  const postId = activePostCommentsRef.id;

  let authorName = 'Vecino de la OTB';
  let userId = null;
  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) {
      const u = JSON.parse(saved);
      if (u.nombre) authorName = u.nombre;
    }
    const { data: sessionData } = await window.supabaseClient.auth.getSession();
    userId = sessionData?.session?.user?.id || null;
  } catch(e) {}

  if (!window.supabaseClient) {
    alert('Error: El servidor no está disponible. Intenta de nuevo en un momento.');
    return;
  }

  // FIX W-01: INSERT directo en tabla propia — sin race condition de leer+escribir
  const { data: newComment, error } = await window.supabaseClient
    .from('comentarios_avisos')
    .insert([{
      aviso_id: postId,
      user_id: userId,
      autor: authorName,
      texto: text,
      votos: 1
    }])
    .select()
    .single();

  if (!error && newComment) {
    input.value = '';

    // Recargar lista de comentarios desde BD para mostrar el estado actualizado
    const { data: updatedComments } = await window.supabaseClient
      .from('comentarios_avisos')
      .select('*')
      .eq('aviso_id', postId)
      .order('created_at', { ascending: true });

    renderCommentsListUI(updatedComments || []);

    // Actualizar el contador de comentarios en la tarjeta del foro
    if (activePostCommentsRef.element) {
      const numSpan = activePostCommentsRef.element.querySelector('.comment-count-num');
      if (numSpan && updatedComments) {
        numSpan.innerText = updatedComments.length;
      }
    }
  } else if (error) {
    console.error('Error publicando comentario:', error);
    alert('Error publicando comentario. Verifica que estés logueado.');
  }
}
