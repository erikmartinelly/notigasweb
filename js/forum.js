/* ==========================================================================
   NOTIGAS - MÓDULO DE NOTICIAS VECINALES (AVISOS, VOTOS, COMENTARIOS EN SUPABASE)
   ========================================================================== */

let activePostCommentsRef = null;

// escapeHtmlStr está centralizada en state.js — eliminada aquí para evitar duplicados.

// Escuchar el evento personalizado emitido por supabase-config.js
document.addEventListener('supabase_ready', () => {
  renderForumFeed();
});

// Respaldo en caso de que supabase_ready ya se haya emitido antes de que este script cargue
document.addEventListener('DOMContentLoaded', () => {
  if (window.supabaseClient) {
      renderForumFeed();
  }
});

async function renderForumFeed() {
  try {
    const feed = document.getElementById('forumFeed');
    if (!feed || !window.supabaseClient) return;

  const currentAdmin = (typeof getVerifiedAdminEmail === 'function') ? getVerifiedAdminEmail() : null;
  const isAdmin = !!currentAdmin;

  const tresDiasAtras = new Date(Date.now() - 72 * 3600 * 1000).toISOString();

  const userData = AppState.get('userData');
  const ciudadReal = (userData && userData.ciudad) ? userData.ciudad : AppState.get('city');
  if (!ciudadReal) {
    feed.innerHTML = `
      <div style="text-align:center; color:#94A3B8; padding:30px 14px; background: #1E293B; border-radius: 14px;">
        <i class="fa-solid fa-location-dot" style="font-size:28px; margin-bottom:8px; color:#F59E0B;"></i><br>
        <strong>Selecciona una ciudad en el mapa para ver avisos vecinales.</strong>
      </div>
    `;
    return;
  }

  // FIX: Seleccionar la cuenta de comentarios y filtrar avisos de más de 72h y por ciudad
  const { data: localPosts, error } = await window.supabaseClient.from('avisos')
    .select('*, comentarios_avisos(count)')
    .eq('ciudad', ciudadReal)
    .gte('created_at', tresDiasAtras)
    .order('created_at', { ascending: false });

  if (error) {
      console.error("Error cargando foro:", error);
      feed.innerHTML = `
        <div style="text-align:center; color:#EF4444; padding:40px 14px; background: #1E293B; border-radius: 14px; border: 1px dashed rgba(239, 68, 68, 0.3);">
          <i class="fa-solid fa-triangle-exclamation" style="font-size:32px; margin-bottom:10px;"></i><br>
          <strong>Error de base de datos</strong><br>
          <span style="font-size: 12px; color: #FCA5A5;">${escapeHtmlStr(error.message || 'Error de conexión.')}</span><br>
          <span style="font-size: 10px; color: #94A3B8;">Código: ${escapeHtmlStr(error.code || 'N/A')} (Detalle: ${escapeHtmlStr(error.details || 'Ninguno')})</span>
        </div>
      `;
      return;
  }

  if (!localPosts || localPosts.length === 0) {
    feed.innerHTML = `
      <div style="text-align:center; color:#94A3B8; padding:40px 14px; font-size:13px; background: #1E293B; border-radius: 14px; border: 1px dashed rgba(255,255,255,0.15);">
        <i class="fa-solid fa-comments" style="font-size:32px; color:#FF6D00; margin-bottom:10px;"></i><br>
        <strong>El Tablón de Anuncios Vecinal está limpio.</strong><br>
        <span style="font-size: 11px; color: #64748B;">Sé el primero en publicar un aviso, alerta u oferta para los vecinos de tu OTB.</span><br><br>
        <button class="btn-new-post" style="margin: 0 auto; padding: 10px 16px; font-size: 12px;" data-action="abrirModalNuevoPost">📝 Publicar Nuevo Aviso (72 Horas)</button>
      </div>
    `;
    return;
  }

  let html = '';
  const adInsertAfterIndex = Math.max(0, Math.ceil(localPosts.length / 2) - 1);
  localPosts.forEach((post, index) => {
    // FIX: Obtener contador de la relación Supabase
    const commentCount = (post.comentarios_avisos && post.comentarios_avisos[0]) ? post.comentarios_avisos[0].count : 0;

    // XSS Fix: Properly encode strings for injection into HTML onclick attributes
    const safeTitle = encodeURIComponent(post.titulo || '').replace(/'/g, "%27");
    const safeDesc = encodeURIComponent(post.descripcion || '').replace(/'/g, "%27");
    const safeCat = encodeURIComponent(post.categoria || '').replace(/'/g, "%27");

    html += `
      <div class="forum-card">
        <div class="forum-votes">
          <i class="fa-solid fa-circle-chevron-up" title="👍 Me Gusta" data-action="votarPost" data-val="1" data-id="${post.id}"></i>
          <span class="v-count" style="color:#FF6D00;">${post.votos || 1}</span>
          <i class="fa-solid fa-circle-chevron-down" title="👎 Me Disgusta" data-action="votarPost" data-val="-1" data-id="${post.id}"></i>
        </div>
        <div class="forum-body">
          <span class="forum-cat"><i class="fa-solid fa-comments"></i> ${escapeHtmlStr(post.categoria)}</span>
          <div class="forum-title">${escapeHtmlStr(post.titulo)}</div>
          <div class="forum-desc">${escapeHtmlStr(post.descripcion)}</div>
          <div class="forum-footer" style="display:flex; justify-content:space-between; align-items:center;">
            <button data-action="abrirComentariosPost" data-id="${post.id}" data-title="${safeTitle}" data-desc="${safeDesc}" data-cat="${safeCat}" style="background: rgba(255,109,0,0.15); color: #FF6D00; border: 1px solid rgba(255,109,0,0.3); border-radius: 20px; padding: 6px 14px; font-size: 12px; font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s;">
              <i class="fa-regular fa-comment"></i> <span class="comment-count-num">${commentCount}</span> Comentar
            </button>
            <div style="display:flex; gap:6px; align-items:center;">
              <button class="btn-report" data-action="abrirModalDenuncia" data-title="${safeTitle}"><i class="fa-solid fa-flag"></i> Denunciar</button>
              ${isAdmin ? `<button data-action="borrarPostForumAdmin" data-id="${post.id}" style="background:#D32F2F; color:white; border:none; padding:2px 6px; border-radius:4px; font-size:9px; font-weight:700; cursor:pointer;" title="Borrar como Admin"><i class="fa-solid fa-trash"></i> Borrar (Admin)</button>` : ''}
            </div>
          </div>
        </div>
      </div>
    `;

    // Google AdSense va exactamente en medio de los avisos gratuitos visibles.
    if (index === adInsertAfterIndex && typeof window.getAdSenseFeedMarkup === 'function') {
      html += window.getAdSenseFeedMarkup('forum');
    }
  });

  feed.innerHTML = html;
  if (typeof window.activateAdSenseIn === 'function') window.activateAdSenseIn(feed);
  } catch (err) {
    console.error(err);
  }
}

document.addEventListener('notigas_ads_config_ready', renderForumFeed);

async function borrarPostForumAdmin(postId) {
  if (confirm("🗑️ ¿Deseas eliminar permanentemente esta publicación del Tablón Vecinal?")) {
      const { error } = await window.supabaseClient.from('avisos').delete().eq('id', postId);
      if (error) {
          if (typeof showToast === 'function') { showToast('Notificación', 'Error borrando el post', 'info', 4000); } else { alert('Error borrando el post'); };
          return;
      }
      if (typeof showToast === 'function') {
        showToast('🗑️ Publicación Borrada', 'El aviso o anuncio de la OTB fue eliminado del sistema.', 'info', 4000);
      }
  }
}

async function votarPost(el, delta, postId) {
  if (!window.supabaseClient || !postId) return;

  // 1. Validar que el usuario tenga sesión activa en Supabase
  let user = null;
  try {
    const sessionData = await window.supabaseClient.auth.getSession();
    user = sessionData?.data?.session?.user || null;
  } catch (authErr) {
    console.warn('Error verificando sesión para votar:', authErr);
  }

  if (!user) {
    if (typeof showToast === 'function') {
      showToast('🔒 Inicia Sesión', 'Debes iniciar sesión con Google para votar en las noticias vecinales.', 'info', 4000);
    } else {
      alert('Debes iniciar sesión con Google para votar.');
    }
    return;
  }

  const voteKey = `notigas_voted_p_${postId}`;
  const previousVote = sessionStorage.getItem(voteKey);

  // Evitar votar dos veces consecutivas la misma opción
  if (delta > 0 && previousVote === 'up') {
    if (typeof showToast === 'function') {
      showToast('ℹ️ Voto ya registrado', 'Ya diste "Me Gusta" a esta publicación.', 'info', 2500);
    }
    return;
  }
  if (delta < 0 && previousVote === 'down') {
    if (typeof showToast === 'function') {
      showToast('ℹ️ Voto ya registrado', 'Ya diste "Me Disgusta" a esta publicación.', 'info', 2500);
    }
    return;
  }

  // Buscar todos los spans de contador asociados a este postId (tarjeta en el feed y cabecera del modal si está abierto)
  const matchingSpans = [];
  const feedCards = document.querySelectorAll('.forum-card');
  feedCards.forEach(card => {
    const hasPostBtn = card.querySelector(`[data-id="${postId}"]`);
    if (hasPostBtn) {
      const sp = card.querySelector('.forum-votes .v-count');
      if (sp) matchingSpans.push(sp);
    }
  });

  const modalVotesSpan = document.getElementById('commentsPostVotes');
  const modalVoteUp = document.getElementById('modalPostVoteUpBtn');
  if (modalVotesSpan && modalVoteUp && modalVoteUp.getAttribute('data-id') === String(postId)) {
    if (!matchingSpans.includes(modalVotesSpan)) matchingSpans.push(modalVotesSpan);
  }

  const relativeSpan = el?.parentElement?.querySelector('.v-count');
  if (relativeSpan && !matchingSpans.includes(relativeSpan)) {
    matchingSpans.push(relativeSpan);
  }

  const oldVals = matchingSpans.map(s => parseInt(s.innerText) || 0);
  matchingSpans.forEach(s => {
    const cur = parseInt(s.innerText) || 0;
    s.innerText = Math.max(0, cur + delta);
  });

  try {
    const { error } = await window.supabaseClient.rpc('incrementar_votos_aviso', {
      aviso_id: postId,
      incremento: delta
    });

    if (error) {
      console.warn('Error en RPC incrementar_votos_aviso:', error);
      matchingSpans.forEach((s, idx) => {
        if (oldVals[idx] !== undefined) s.innerText = oldVals[idx];
      });
      const msg = error.message && error.message.includes('Ya has votado')
        ? 'Ya has votado esta publicación.'
        : (error.message || 'No se pudo registrar tu voto.');
      if (typeof showToast === 'function') {
        showToast('⚠️ Votación', msg, 'warning', 3500);
      }
      return;
    }

    sessionStorage.setItem(voteKey, delta > 0 ? 'up' : 'down');
    if (typeof showToast === 'function') {
      showToast('✅ Voto registrado', delta > 0 ? '¡Te gusta este aviso!' : 'Voto registrado.', 'success', 2000);
    }
  } catch (err) {
    console.error('Error al votar publicación:', err);
    matchingSpans.forEach((s, idx) => {
      if (oldVals[idx] !== undefined) s.innerText = oldVals[idx];
    });
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
  try {
    const titleEl = document.getElementById('inputPostTitulo');
    const descEl = document.getElementById('inputPostDesc');
    const catEl = document.getElementById('selectPostTipo');

  const title = (titleEl ? titleEl.value : '').trim();
  const desc = (descEl ? descEl.value : '').trim();
  const cat = (catEl ? catEl.value : 'AVISO VECINAL');

  if (!title || !desc) {
    if (typeof showToast === 'function') { showToast('Notificación', 'Por favor ingresa un título y una descripción para tu publicación vecinal.', 'info', 4000); } else { alert('Por favor ingresa un título y una descripción para tu publicación vecinal.'); };
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

  // Bloquear si hay coincidencias claras de spam independientemente del idioma
  if (spamMatches && spamMatches.length >= 1 && !hasSpanishChars) {
    if (typeof showToast === 'function') { showToast('Notificación', '⛔ ALERTA DE SEGURIDAD: Tu publicación ha sido bloqueada por el filtro Anti-Spam.\n\nNOTIGAS es una plataforma exclusiva para vecinos hispanohablantes.', 'info', 4000); } else { alert('⛔ ALERTA DE SEGURIDAD: Tu publicación ha sido bloqueada por el filtro Anti-Spam.\n\nNOTIGAS es una plataforma exclusiva para vecinos hispanohablantes.'); };
    if (window.supabaseClient) {
      window.supabaseClient.from('reportes_spam').insert([{ texto: textoCompleto, motivo: 'Filtro Anti-Spam mejorado' }]);
    }
    closeNewPostModal();
    return;
  }

  // Obtener user_id de la sesión activa (Supabase v2)
  let userId = null;
  try {
    const sessionData = await window.supabaseClient.auth.getSession();
    if (sessionData && sessionData.data && sessionData.data.session && sessionData.data.session.user) {
        userId = sessionData.data.session.user.id;
    }
  } catch(e) {
    console.warn("No se pudo obtener la sesión de usuario para el aviso:", e);
  }

  // FIX: Bloquear la inserción si el usuario no tiene sesión
  if (!userId) {
     if (typeof showToast === 'function') { showToast('Notificación', 'Debes iniciar sesión con Google o Email para poder publicar un aviso vecinal.', 'info', 4000); } else { alert('Debes iniciar sesión con Google o Email para poder publicar un aviso vecinal.'); };
     closeNewPostModal();
     return;
  }

    const userData = AppState.get('userData');
    const ciudadReal = (userData && userData.ciudad) ? userData.ciudad : AppState.get('city');

    if (!ciudadReal) {
      if (typeof showToast === 'function') {
        showToast('⚠️ Ciudad Requerida', 'No se ha definido la ciudad. Por favor selecciona tu ciudad en el mapa antes de publicar.', 'warning', 4000);
      } else {
        alert('No se ha definido la ciudad.');
      }
      return;
    }

    const { error } = await window.supabaseClient.from('avisos').insert([{
      categoria: cat,
      titulo: title,
      descripcion: desc,
      ciudad: ciudadReal,
      barrio_otb: 'Global',
      user_id: userId,
      votos: 1
    }]);

  if (error) {
      console.error(error);
      if (typeof showToast === 'function') { showToast('Notificación', 'Hubo un error publicando el aviso.', 'info', 4000); } else { alert('Hubo un error publicando el aviso.'); };
      return;
  }

  closeNewPostModal();
  if (document.getElementById('inputPostTitulo')) document.getElementById('inputPostTitulo').value = '';
  if (document.getElementById('inputPostTitle')) document.getElementById('inputPostTitle').value = '';
  if (document.getElementById('inputPostDesc')) document.getElementById('inputPostDesc').value = '';

  if (typeof showToast === 'function') { showToast('Notificación', '📌 ¡Aviso publicado exitosamente! Todos los vecinos podrán verlo en tiempo real.', 'info', 4000); } else { alert('📌 ¡Aviso publicado exitosamente! Todos los vecinos podrán verlo en tiempo real.'); };
  } catch (err) {
    alert("Error interno al publicar: " + err.message);
  }
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
  if (elCat) elCat.innerHTML = `<i class="fa-solid fa-comments"></i> ${window.escapeHtmlStr(cat)}`;

  // Sincronizar votos y botones del post dentro del modal de comentarios
  const feedVotesSpan = el?.closest('.forum-card')?.querySelector('.forum-votes .v-count');
  const votesCount = feedVotesSpan ? parseInt(feedVotesSpan.innerText) || 1 : 1;
  const modalVotesSpan = document.getElementById('commentsPostVotes');
  if (modalVotesSpan) modalVotesSpan.innerText = votesCount;

  const modalVoteUp = document.getElementById('modalPostVoteUpBtn');
  if (modalVoteUp) modalVoteUp.setAttribute('data-id', String(postId));

  const modalVoteDown = document.getElementById('modalPostVoteDownBtn');
  if (modalVoteDown) modalVoteDown.setAttribute('data-id', String(postId));

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
              <i class="fa-solid fa-arrow-up" style="color:#64748B; font-size:13px; cursor:pointer;" data-action="votarComentario" data-id="${cId}" data-val="1"></i>
              <span style="color:#FF6D00; font-size:12px; font-weight:900;" id="c_votos_${cId}">${v}</span>
              <i class="fa-solid fa-arrow-down" style="color:#64748B; font-size:13px; cursor:pointer;" data-action="votarComentario" data-id="${cId}" data-val="-1"></i>
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

window.renderPostComments = async function(ref) {
  if (!ref || !ref.id) return;
  if (!window.supabaseClient) return;
  try {
    const { data, error } = await window.supabaseClient
      .from('comentarios_avisos')
      .select('*')
      .eq('aviso_id', ref.id)
      .order('created_at', { ascending: true });
    if (!error && data) {
      renderCommentsListUI(data);
    }
  } catch (e) {
    console.error('Error al actualizar comentarios en tiempo real:', e);
  }
};

/**
 * FIX W-01+W-05: Voto atómico sobre la tabla 'comentarios_avisos'.
 * Usa la RPC 'incrementar_votos_comentario' (UPDATE directo por id).
 */
async function votarComentario(comentarioId, delta) {
  if (!window.supabaseClient || !comentarioId) return;

  let user = null;
  try {
    const sessionData = await window.supabaseClient.auth.getSession();
    user = sessionData?.data?.session?.user || null;
  } catch (authErr) {
    console.warn('Error verificando sesión para votar comentario:', authErr);
  }

  if (!user) {
    if (typeof showToast === 'function') {
      showToast('🔒 Inicia Sesión', 'Debes iniciar sesión con Google para votar comentarios.', 'info', 4000);
    } else {
      alert('Debes iniciar sesión con Google para votar comentarios.');
    }
    return;
  }

  const voteKey = `notigas_voted_c_${comentarioId}`;
  const previousVote = sessionStorage.getItem(voteKey);

  if (delta > 0 && previousVote === 'up') return;
  if (delta < 0 && previousVote === 'down') return;

  const span = document.getElementById(`c_votos_${comentarioId}`);
  const oldVal = span ? parseInt(span.innerText) || 0 : 0;
  if (span) {
    span.innerText = Math.max(0, oldVal + delta);
  }

  try {
    const { error } = await window.supabaseClient.rpc('incrementar_votos_comentario', {
      comentario_id: comentarioId,
      incremento: delta
    });

    if (error) {
      console.warn('Error en RPC incrementar_votos_comentario:', error);
      if (span) span.innerText = oldVal;
      const msg = error.message && error.message.includes('Ya has votado')
        ? 'Ya has votado este comentario.'
        : (error.message || 'No se pudo registrar tu voto.');
      if (typeof showToast === 'function') {
        showToast('⚠️ Votación', msg, 'warning', 3500);
      }
      return;
    }

    sessionStorage.setItem(voteKey, delta > 0 ? 'up' : 'down');
  } catch (e) {
    console.error('Error votando comentario:', e);
    if (span) span.innerText = oldVal;
  }
}

function closeCommentsModal() {
  const modal = document.getElementById('modalComments') || document.getElementById('modalPostComments');
  if (modal) modal.style.display = 'none';
  activePostCommentsRef = null;
}

/**
 * FIX W-01: Agrega comentario insertando una fila nueva en 'comentarios_avisos'.
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
    const saved = JSON.stringify(AppState.get('userData') || {});
    if (saved) {
      const u = JSON.parse(saved);
      if (u.nombre) authorName = u.nombre;
    }
    const { data: sessionData } = await window.supabaseClient.auth.getSession();
    userId = sessionData?.session?.user?.id || null;
  } catch(e) {}

  if (!window.supabaseClient) {
    if (typeof showToast === 'function') { showToast('Notificación', 'Error: El servidor no está disponible. Intenta de nuevo en un momento.', 'info', 4000); } else { alert('Error: El servidor no está disponible. Intenta de nuevo en un momento.'); };
    return;
  }

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

    const { data: updatedComments } = await window.supabaseClient
      .from('comentarios_avisos')
      .select('*')
      .eq('aviso_id', postId)
      .order('created_at', { ascending: true });

    renderCommentsListUI(updatedComments || []);

    if (activePostCommentsRef.element) {
      const numSpan = activePostCommentsRef.element.querySelector('.comment-count-num');
      if (numSpan && updatedComments) {
        numSpan.innerText = updatedComments.length;
      }
    }
  } else if (error) {
    console.error('Error publicando comentario:', error);
    if (typeof showToast === 'function') { showToast('Notificación', 'Error publicando comentario. Verifica que estés logueado.', 'info', 4000); } else { alert('Error publicando comentario. Verifica que estés logueado.'); };
  }
}

// EXPORTACIONES GLOBALES A WINDOW PARA DISPONIBILIDAD TOTAL
window.renderForumFeed = renderForumFeed;
window.votarPost = votarPost;
window.votarComentario = votarComentario;
window.abrirComentariosPost = abrirComentariosPost;
window.renderCommentsListUI = renderCommentsListUI;
window.closeCommentsModal = closeCommentsModal;
window.abrirModalNuevoPost = abrirModalNuevoPost;
window.closeNewPostModal = closeNewPostModal;
window.closeNuevoPostModal = closeNuevoPostModal;
window.crearNuevoPost = crearNuevoPost;
window.agregarComentarioPost = agregarComentarioPost;
window.borrarPostForumAdmin = borrarPostForumAdmin;
