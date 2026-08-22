/* ==========================================================================
   NOTIGAS - MÓDULO DE NOTICIAS VECINALES (AVISOS, VOTOS, COMENTARIOS EN SUPABASE)
   ========================================================================== */

let activePostCommentsRef = null;

// escapeHtmlStr está centralizada en state.js — eliminada aquí para evitar duplicados.

// Solo renderizar en inicio si el usuario abrió directamente la pestaña de foro
document.addEventListener('DOMContentLoaded', () => {
  const tab2 = document.getElementById('tab2');
  if (tab2 && tab2.classList.contains('active') && window.supabaseClient) {
    renderForumFeed();
  }
});

async function renderForumFeed() {
  try {
    const feed = document.getElementById('forumFeed');
    if (!feed || !window.supabaseClient) return;

    const currentAdmin = (typeof getVerifiedAdminEmail === 'function') ? getVerifiedAdminEmail() : null;
    const isAdmin = !!currentAdmin || (typeof AppState !== 'undefined' && AppState.get('isAdmin') === true);

    const dosDiasAtras = new Date(Date.now() - 48 * 3600 * 1000).toISOString();

    const userData = (typeof AppState !== 'undefined') ? AppState.get('userData') : null;
    const ciudadSelector = document.getElementById('selectCiudadCapital')?.value;
    
    // Si es comprador o repartidor registrado, mostrar estrictamente los avisos de su ciudad registrada
    // Si es administrador o visitante, usar la ciudad seleccionada en la cabecera
    let rawCity = 'cochabamba';
    if (!isAdmin && userData && userData.ciudad) {
      rawCity = userData.ciudad;
    } else {
      rawCity = ciudadSelector || (typeof AppState !== 'undefined' && AppState.get('city')) || (userData && userData.ciudad) || 'cochabamba';
    }
    const ciudadReal = String(rawCity || 'cochabamba').toLowerCase().trim();

    // Consultar avisos activos para la ciudad (insensible a mayúsculas)
    const { data: localPosts, error } = await window.supabaseClient.from('avisos')
      .select('*, comentarios_avisos(count)')
      .ilike('ciudad', ciudadReal)
      .order('created_at', { ascending: false });

    if (error) {
        console.error("Error cargando foro:", error);
        feed.innerHTML = `
          <div style="text-align:center; color:#EF4444; padding:40px 14px; background: #1E293B; border-radius: 14px; border: 1px dashed rgba(239, 68, 68, 0.3);">
            <i class="fa-solid fa-triangle-exclamation" style="font-size:32px; margin-bottom:10px;"></i><br>
            <strong>Error de base de datos</strong><br>
            <span style="font-size: 12px; color: #FCA5A5;">${escapeHtmlStr(error.message || 'Error de conexión.')}</span><br>
            <span style="font-size: 10px; color: #94A3B8;">Código: ${escapeHtmlStr(error.code || 'N/A')}</span>
          </div>
        `;
        return;
    }

    if (!localPosts || localPosts.length === 0) {
      feed.innerHTML = `
        <div style="text-align:center; color:#94A3B8; padding:40px 14px; font-size:13px; background: #1E293B; border-radius: 14px; border: 1px dashed rgba(255,255,255,0.15);">
          <i class="fa-solid fa-comments" style="font-size:32px; color:#FF6D00; margin-bottom:10px;"></i><br>
          <strong>El Tablón de Anuncios Vecinal está limpio en ${escapeHtmlStr(ciudadReal)}.</strong><br>
          <span style="font-size: 11px; color: #64748B;">Sé el primero en publicar un aviso, alerta u oferta para los vecinos de tu OTB.</span><br><br>
          <button class="btn-new-post" style="margin: 0 auto; padding: 10px 16px; font-size: 12px;" data-action="abrirModalNuevoPost">📝 Publicar Nuevo Aviso (48 Horas)</button>
        </div>
      `;
      return;
    }

    let currentUserId = null;
    if (typeof getAuthenticatedUserId === 'function') {
      currentUserId = await getAuthenticatedUserId();
    }
    if (!currentUserId && typeof getCurrentUserId === 'function') {
      currentUserId = getCurrentUserId();
    }
    if (!currentUserId && userData) {
      currentUserId = userData.id || userData.user_id;
    }
    if (!currentUserId && window.supabaseClient) {
      try {
        const { data: s } = await window.supabaseClient.auth.getSession();
        currentUserId = s?.session?.user?.id || null;
      } catch (_) {}
    }

    let html = '';
    const adInsertAfterIndex = Math.max(0, Math.ceil(localPosts.length / 2) - 1);
    localPosts.forEach((post, index) => {
      const commentCount = (post.comentarios_avisos && post.comentarios_avisos[0]) ? post.comentarios_avisos[0].count : 0;

      const safeTitle = encodeURIComponent(post.titulo || '').replace(/'/g, "%27");
      const safeDesc = encodeURIComponent(post.descripcion || '').replace(/'/g, "%27");
      const safeCat = encodeURIComponent(post.categoria || '').replace(/'/g, "%27");
      const authorName = post.autor || 'Vecino de la OTB';
      const isAuthor = Boolean(
        currentUserId && post.user_id &&
        String(post.user_id).trim().toLowerCase() === String(currentUserId).trim().toLowerCase()
      );
      const canManage = isAuthor || isAdmin;

      html += `
        <div class="forum-card">
          <div class="forum-votes">
            <i class="fa-solid fa-circle-chevron-up" title="👍 Me Gusta" data-action="votarPost" data-val="1" data-id="${post.id}"></i>
            <span class="v-count" style="color:#FF6D00;">${typeof post.votos === 'number' ? post.votos : (post.votos ?? 1)}</span>
            <i class="fa-solid fa-circle-chevron-down" title="👎 Me Disgusta" data-action="votarPost" data-val="-1" data-id="${post.id}"></i>
          </div>
          <div class="forum-body">
            <div class="forum-meta-header">
              <span class="forum-cat"><i class="fa-solid fa-comments"></i> ${escapeHtmlStr(post.categoria)}</span>
              <span class="forum-author"><i class="fa-solid fa-user"></i> ${escapeHtmlStr(authorName)} ${isAuthor ? '<span style="font-size:10px; background:#0284C7; color:white; padding:2px 6px; border-radius:4px; margin-left:4px; font-weight:800;">TU AVISO</span>' : ''}</span>
            </div>
            <div class="forum-title">${escapeHtmlStr(post.titulo)}</div>
            <div class="forum-desc">${escapeHtmlStr(post.descripcion)}</div>
            <div class="forum-footer" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
              <button data-action="abrirComentariosPost" data-id="${post.id}" data-title="${safeTitle}" data-desc="${safeDesc}" data-cat="${safeCat}" style="background: rgba(255,109,0,0.15); color: #FF6D00; border: 1px solid rgba(255,109,0,0.3); border-radius: 20px; padding: 6px 14px; font-size: 12px; font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s;">
                <i class="fa-regular fa-comment"></i> <span class="comment-count-num">${commentCount}</span> Comentar
              </button>
              <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                ${canManage ? `
                  <button data-action="abrirModalEditarPost" data-id="${post.id}" data-title="${safeTitle}" data-desc="${safeDesc}" data-cat="${safeCat}" style="background: rgba(14,165,233,0.2); color: #38BDF8; border: 1.5px solid #0284C7; border-radius: 6px; padding: 5px 12px; font-size: 11.5px; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; box-shadow:0 2px 6px rgba(2,132,199,0.2);" title="Editar tu aviso">
                    <i class="fa-solid fa-pen-to-square"></i> EDITAR
                  </button>
                  <button data-action="borrarPostPropio" data-id="${post.id}" style="background: rgba(239,68,68,0.15); color: #EF4444; border: 1px solid rgba(239,68,68,0.3); border-radius: 6px; padding: 5px 8px; font-size: 11.5px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" title="Eliminar este aviso">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                ` : `
                  <button class="btn-report" data-action="abrirModalDenuncia" data-title="${safeTitle}"><i class="fa-solid fa-flag"></i> Denunciar</button>
                `}
              </div>
            </div>
          </div>
        </div>
      `;

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

function abrirModalEditarPost(postId, title, desc, cat) {
  const modal = document.getElementById('modalEditPost');
  if (!modal) return;
  const inputId = document.getElementById('editPostId');
  const inputTitle = document.getElementById('editPostTitulo');
  const inputDesc = document.getElementById('editPostDesc');
  const selectCat = document.getElementById('editPostCategoria');

  if (inputId) inputId.value = postId || '';
  if (inputTitle) inputTitle.value = decodeURIComponent(title || '');
  if (inputDesc) inputDesc.value = decodeURIComponent(desc || '');
  if (selectCat) selectCat.value = decodeURIComponent(cat || 'COMENTARIO');

  modal.style.display = 'flex';
}

function cerrarModalEditarPost() {
  const modal = document.getElementById('modalEditPost');
  if (modal) modal.style.display = 'none';
}

async function guardarEdicionPost() {
  const inputId = document.getElementById('editPostId');
  const inputTitle = document.getElementById('editPostTitulo');
  const inputDesc = document.getElementById('editPostDesc');
  const selectCat = document.getElementById('editPostCategoria');

  const postId = inputId?.value;
  const newTitle = (inputTitle?.value || '').trim();
  const newDesc = (inputDesc?.value || '').trim();
  const newCat = selectCat?.value || 'COMENTARIO';

  if (!postId || !newTitle || !newDesc) {
    if (typeof showToast === 'function') showToast('Campos requeridos', 'Ingresa un título y una descripción.', 'warning', 3000);
    return;
  }

  if (!window.supabaseClient) return;

  try {
    if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Guardando cambios...');

    // 1. Intentar RPC atómico
    const { data: rpcData, error: rpcError } = await window.supabaseClient.rpc('rpc_actualizar_aviso_propio', {
      p_aviso_id: postId,
      p_titulo: newTitle,
      p_descripcion: newDesc,
      p_categoria: newCat
    });

    if (rpcError) {
      // 2. Fallback a UPDATE directo
      const { error: directErr } = await window.supabaseClient
        .from('avisos')
        .update({
          titulo: newTitle,
          descripcion: newDesc,
          categoria: newCat
        })
        .eq('id', postId);

      if (directErr) {
        if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
        console.error('Error editando aviso:', directErr);
        if (typeof showToast === 'function') showToast('Error al editar', directErr.message || 'No se pudo actualizar el aviso.', 'error', 4000);
        return;
      }
    } else if (rpcData && !rpcData.ok) {
      if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
      if (typeof showToast === 'function') showToast('Error al editar', rpcData.error || 'No se pudo actualizar el aviso.', 'error', 4000);
      return;
    }

    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
    if (typeof showToast === 'function') showToast('✅ Publicación Actualizada', 'Los cambios en tu aviso fueron guardados con éxito.', 'success', 3500);
    cerrarModalEditarPost();
    if (typeof renderForumFeed === 'function') renderForumFeed();
    if (typeof renderAdminAvisosFeedList === 'function') renderAdminAvisosFeedList();
  } catch (err) {
    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
    console.error('Excepción al guardar edición:', err);
  }
}

async function borrarPostPropio(postId) {
  if (!postId || !window.supabaseClient) return;
  if (confirm('🗑️ ¿Deseas eliminar permanentemente esta publicación del Tablón Vecinal?')) {
    const { error } = await window.supabaseClient.from('avisos').delete().eq('id', postId);
    if (error) {
      if (typeof showToast === 'function') showToast('Error', 'No se pudo eliminar el aviso: ' + error.message, 'error', 4000);
      return;
    }
    if (typeof showToast === 'function') showToast('🗑️ Aviso Eliminado', 'La publicación ha sido eliminada con éxito.', 'info', 3500);
    if (typeof renderForumFeed === 'function') renderForumFeed();
    if (typeof renderAdminAvisosFeedList === 'function') renderAdminAvisosFeedList();
  }
}

async function borrarPostForumAdmin(postId) {
  return borrarPostPropio(postId);
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
      showToast('🔒 Inicia Sesión', 'Debes iniciar sesión con Google o Correo para votar en las noticias vecinales.', 'info', 4000);
    } else {
      alert('Debes iniciar sesión con Google o Correo para votar.');
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
  if (!modal) return;

  const userData = (typeof AppState !== 'undefined') ? AppState.get('userData') : null;
  const currentAdmin = (typeof getVerifiedAdminEmail === 'function') ? getVerifiedAdminEmail() : null;
  const isAdmin = !!currentAdmin || (typeof AppState !== 'undefined' && AppState.get('isAdmin') === true);
  const ciudadSelector = document.getElementById('selectCiudadCapital')?.value;

  let rawCity = 'cochabamba';
  if (!isAdmin && userData && userData.ciudad) {
    rawCity = userData.ciudad;
  } else {
    rawCity = ciudadSelector || (typeof AppState !== 'undefined' && AppState.get('city')) || (userData && userData.ciudad) || 'cochabamba';
  }

  const cityLabel = document.getElementById('newPostCityLabel');
  if (cityLabel) {
    cityLabel.innerText = String(rawCity).charAt(0).toUpperCase() + String(rawCity).slice(1);
  }

  const inputNom = document.getElementById('inputPostNombre');
  const inputApe = document.getElementById('inputPostApellido');
  if (inputNom && !inputNom.value && userData?.nombre) inputNom.value = userData.nombre;
  if (inputApe && !inputApe.value && userData?.apellido) inputApe.value = userData.apellido;

  modal.style.display = 'flex';
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
    const titleEl = document.getElementById('inputPostTitulo') || document.getElementById('inputPostTitle');
    const descEl = document.getElementById('inputPostDesc');
    const catEl = document.getElementById('selectPostTipo');
    const inputNom = document.getElementById('inputPostNombre');
    const inputApe = document.getElementById('inputPostApellido');

    const title = (titleEl ? titleEl.value : '').trim();
    const desc = (descEl ? descEl.value : '').trim();
    const cat = (catEl ? catEl.value : 'AVISO VECINAL');
    const formNombre = (inputNom ? inputNom.value : '').trim();
    const formApellido = (inputApe ? inputApe.value : '').trim();

    if (!title || !desc) {
      if (typeof showToast === 'function') {
        showToast('Campos requeridos', 'Por favor ingresa un título y una descripción para tu aviso.', 'warning', 4000);
      } else {
        alert('Por favor ingresa un título y una descripción para tu aviso.');
      }
      return;
    }

    const textoCompleto = (title + ' ' + desc).toLowerCase();
    const spamWords = /\b(crypto|casino|bonus|invest|bitcoin|viagra|porn|click here|forex|loan|make money|free money|winner|prize|gambling|adult content|xxx)\b/gi;
    const spamMatches = textoCompleto.match(spamWords);
    const hasSpanishChars = /[à-ÿñÑ¡¿]/i.test(textoCompleto);

    if (spamMatches && spamMatches.length >= 1 && !hasSpanishChars) {
      if (typeof showToast === 'function') {
        showToast('Seguridad', '⛔ Tu publicación contiene términos no permitidos.', 'warning', 4000);
      }
      if (window.supabaseClient) {
        window.supabaseClient.from('reportes_spam').insert([{ texto: textoCompleto, motivo: 'Filtro Anti-Spam' }]);
      }
      closeNewPostModal();
      return;
    }

    if (!window.supabaseClient) {
      if (typeof showToast === 'function') showToast('Error', 'No hay conexión con la base de datos.', 'error', 4000);
      return;
    }

    // 1. Obtener la sesión activa de Supabase
    let userId = null;
    try {
      const { data: sessionData } = await window.supabaseClient.auth.getSession();
      if (sessionData?.session?.user?.id) {
        userId = sessionData.session.user.id;
        window._tempAuthUser = sessionData.session.user;
      }
    } catch(e) {
      console.warn("Error leyendo sesión:", e);
    }

    if (!userId && window._tempAuthUser?.id) {
      userId = window._tempAuthUser.id;
    }

    if (!userId) {
      try {
        const { data: userData } = await window.supabaseClient.auth.getUser();
        if (userData?.user?.id) {
          userId = userData.user.id;
          window._tempAuthUser = userData.user;
        }
      } catch(e){}
    }

    if (!userId) {
      if (typeof showToast === 'function') {
        showToast('🔒 Inicia Sesión', 'Debes iniciar sesión con Google o Correo para publicar un aviso gratis.', 'warning', 4000);
      } else {
        alert('Debes iniciar sesión con Google o Correo para poder publicar un aviso vecinal.');
      }
      closeNewPostModal();
      const modalAuth = document.getElementById('modalWelcomeAuth');
      if (modalAuth) modalAuth.style.display = 'flex';
      return;
    }

    const userData = (typeof AppState !== 'undefined') ? AppState.get('userData') : null;
    const currentAdmin = (typeof getVerifiedAdminEmail === 'function') ? getVerifiedAdminEmail() : null;
    const isAdmin = !!currentAdmin || (typeof AppState !== 'undefined' && AppState.get('isAdmin') === true);
    const ciudadSelector = document.getElementById('selectCiudadCapital')?.value;

    // Si no es admin, validar que ingrese su nombre y apellido
    if (!isAdmin && (!formNombre || !formApellido) && (!userData?.nombre || !userData?.apellido)) {
      if (typeof showToast === 'function') {
        showToast('Datos requeridos', 'Por favor ingresa tu Nombre y Apellido para publicar el aviso.', 'warning', 4000);
      } else {
        alert('Por favor ingresa tu Nombre y Apellido.');
      }
      return;
    }

    // Si es comprador o repartidor, restringir estrictamente a su ciudad registrada
    // Si es administrador, usar la ciudad seleccionada
    let rawCity = 'cochabamba';
    if (!isAdmin && userData && userData.ciudad) {
      rawCity = userData.ciudad;
    } else {
      rawCity = ciudadSelector || (typeof AppState !== 'undefined' && AppState.get('city')) || (userData && userData.ciudad) || 'cochabamba';
    }
    const ciudadReal = String(rawCity || 'cochabamba').toLowerCase().trim();

    // Determinar nombre del autor: Nombre y Apellido
    let authorName = 'Vecino de la OTB';
    if (isAdmin) {
      authorName = 'Administración NOTIGAS';
    } else {
      const nom = formNombre || userData?.nombre || '';
      const ape = formApellido || userData?.apellido || '';
      authorName = [nom, ape].filter(Boolean).join(' ') || nom || 'Vecino de la OTB';

      // Persistir si el usuario los completó en el modal
      if (userData && (formNombre || formApellido)) {
        if (formNombre) userData.nombre = formNombre;
        if (formApellido) userData.apellido = formApellido;
        AppState.set('userData', userData);
        if (window.supabaseClient && userId) {
          window.supabaseClient.from('profiles').update({
            nombre: userData.nombre,
            apellido: userData.apellido
          }).eq('id', userId).then(() => {}).catch(() => {});
        }
      }
    }

    if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Publicando aviso...');

    let pubSuccess = false;
    let pubError = null;

    // Intento 1: Llamar al RPC seguro rpc_crear_aviso_vecinal
    try {
      const { data: rpcData, error: rpcErr } = await window.supabaseClient.rpc('rpc_crear_aviso_vecinal', {
        p_ciudad: ciudadReal,
        p_barrio: 'Global',
        p_autor: authorName,
        p_tipo: 'aviso',
        p_categoria: cat,
        p_titulo: title,
        p_descripcion: desc,
        p_mensaje: desc,
        p_imagen: '',
        p_barrio_otb: 'Global'
      });

      if (!rpcErr && rpcData && (rpcData.ok || rpcData.success)) {
        pubSuccess = true;
      } else {
        pubError = rpcErr || new Error(rpcData?.error || 'Error al guardar aviso');
      }
    } catch(rpcException) {
      pubError = rpcException;
    }

    // Intento 2: Inserción directa en tabla avisos como fallback
    if (!pubSuccess) {
      const { data: insertData, error: insertErr } = await window.supabaseClient.from('avisos').insert([{
        categoria: cat,
        titulo: title,
        descripcion: desc,
        ciudad: ciudadReal,
        barrio_otb: 'Global',
        autor: authorName,
        user_id: userId,
        votos: 1,
        activo: true,
        tipo: 'aviso'
      }]).select();

      if (!insertErr) {
        pubSuccess = true;
      } else {
        pubError = insertErr;
      }
    }

    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();

    if (!pubSuccess) {
      console.error('Error insertando aviso:', pubError);
      if (typeof showToast === 'function') {
        showToast('❌ Error al Publicar', pubError?.message || 'No se pudo guardar la publicación.', 'error', 5000);
      } else {
        alert('Hubo un error publicando el aviso: ' + (pubError?.message || 'Error desconocido'));
      }
      return;
    }

    closeNewPostModal();
    if (titleEl) titleEl.value = '';
    if (descEl) descEl.value = '';

    if (typeof showToast === 'function') {
      showToast('📌 ¡Aviso Publicado!', `Tu aviso ya está disponible en el tablón vecinal de ${ciudadReal.toUpperCase()} (duración: 48 horas).`, 'success', 4000);
    }

    // Refrescar el feed inmediatamente
    await renderForumFeed();
  } catch (err) {
    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
    console.error('Error interno al publicar:', err);
    if (typeof showToast === 'function') showToast('Error', err.message, 'error', 4000);
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
        const v = typeof c.votos === 'number' ? c.votos : (c.votos ?? 1);
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
    const currentAdmin = (typeof getVerifiedAdminEmail === 'function') ? getVerifiedAdminEmail() : null;
    const isAdmin = !!currentAdmin || (typeof AppState !== 'undefined' && AppState.get('isAdmin') === true);
    if (isAdmin) {
      authorName = 'Administración NOTIGAS';
    } else {
      const u = (typeof AppState !== 'undefined') ? AppState.get('userData') : null;
      if (u) {
        if (u.role === 'repartidor') {
          authorName = u.nombre || 'Repartidor de la OTB';
        } else {
          const nom = (u.nombre || '').trim();
          const ape = (u.apellido || '').trim();
          authorName = [nom, ape].filter(Boolean).join(' ') || nom || 'Vecino de la OTB';
        }
      }
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
window.abrirModalEditarPost = abrirModalEditarPost;
window.cerrarModalEditarPost = cerrarModalEditarPost;
window.guardarEdicionPost = guardarEdicionPost;
window.borrarPostPropio = borrarPostPropio;
