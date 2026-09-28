/* ============================================================================
   NOTIGAS Bolivia - Suscripciones a recargas
   ----------------------------------------------------------------------------
   Esto NO es un pedido. No crea un punto en el mapa, no lo toma un recolector
   y no mueve dinero: es la lista de vecindad que quiere que le repongan
   detergente y limpieza, guardada en public.suscripciones_recarga.

   Por eso vive en su propio archivo y su propio modal, separados del flujo de
   pedidos, para que nadie los confunda ni se mezclen en el mapa.
   ============================================================================ */
(function () {
  'use strict';

  const PRODUCTOS = {
    detergente: 'detergente',
    lejia: 'lejía',
    suavizante: 'suavizante',
    desinfectante: 'desinfectante',
    otro: 'otro de limpieza'
  };

  const FRECUENCIAS = {
    semanal: 'cada semana',
    quincenal: 'cada dos semanas',
    mensual: 'cada mes'
  };

  const $ = (id) => document.getElementById(id);

  const avisar = (texto, ok) => {
    const caja = $('recargaEstado');
    if (!caja) return;
    caja.textContent = texto || '';
    caja.style.color = ok ? '#86EFAC' : (texto ? '#FCA5A5' : 'transparent');
  };

  /* El cliente y la sesión se resuelven igual que en el resto de la app. */
  const cliente = () => (typeof window.supabaseClient !== 'undefined' ? window.supabaseClient : null);

  const usuarioActual = async () => {
    const sb = cliente();
    if (!sb || !sb.auth) return null;
    try {
      const { data, error } = await sb.auth.getUser();
      if (error || !data || !data.user) return null;
      return data.user;
    } catch (e) {
      return null;
    }
  };

  function abrirModalRecarga() {
    const modal = $('modalRecarga');
    if (!modal) return;
    avisar('', true);
    modal.classList.add('active');
    const zona = $('inputRecargaZona');
    if (zona) zona.focus();
  }

  function cerrarModalRecarga() {
    const modal = $('modalRecarga');
    if (modal) modal.classList.remove('active');
  }

  /* Normaliza el teléfono a dígitos con un + delante, como el resto de la app,
     y descarta lo que no sea un número razonable. */
  const limpiarTelefono = (bruto) => {
    const d = String(bruto || '').replace(/\D/g, '');
    if (!d) return null;
    return d.length >= 6 && d.length <= 15 ? '+' + d : null;
  };

  async function guardarSuscripcion() {
    const sb = cliente();
    if (!sb) {
      avisar('No hay conexión con el servidor. Inténtalo de nuevo.', false);
      return;
    }

    const usuario = await usuarioActual();
    if (!usuario) {
      avisar('Necesitas iniciar sesión para apuntarte.', false);
      if (typeof showToast === 'function') {
        showToast('🔒 Inicia sesión', 'Las recargas se guardan en tu cuenta.', 'warning');
      }
      return;
    }

    const btn = $('btnGuardarRecarga');
    if (btn) btn.disabled = true;
    avisar('Guardando…', true);

    const producto = ($('selectRecargaProducto') || {}).value || 'detergente';
    const frecuencia = ($('selectRecargaFrecuencia') || {}).value || 'quincenal';

    // El backend acota ambos con CHECK; aqui solo evitamos mandar basura.
    if (!Object.prototype.hasOwnProperty.call(PRODUCTOS, producto)) {
      avisar('Ese producto no está entre las recargas disponibles.', false);
      if (btn) btn.disabled = false;
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(FRECUENCIAS, frecuencia)) {
      avisar('Esa frecuencia no está disponible.', false);
      if (btn) btn.disabled = false;
      return;
    }

    const telefonoCrudo = ($('inputRecargaTelefono') || {}).value || '';
    const telefono = limpiarTelefono(telefonoCrudo);
    if (telefonoCrudo.trim() && !telefono) {
      avisar('El teléfono no parece válido. Revísalo.', false);
      if (btn) btn.disabled = false;
      return;
    }

    const zona = (($('inputRecargaZona') || {}).value || '').trim().slice(0, 120) || null;
    const notas = (($('inputRecargaNotas') || {}).value || '').trim().slice(0, 200) || null;

    try {
      // Hay un indice unico (user_id, producto) para las activas, asi que un
      // segundo intento debe actualizar la suscripcion existente y no fallar.
      const { error } = await sb
        .from('suscripciones_recarga')
        .upsert(
          {
            user_id: usuario.id,
            producto: producto,
            zona: zona,
            telefono: telefono,
            frecuencia: frecuencia,
            notas: notas,
            estado: 'activo'
          },
          { onConflict: 'user_id,producto' }
        );

      if (error) {
        avisar('No se pudo guardar. Inténtalo de nuevo.', false);
        if (typeof showToast === 'function') {
          showToast('⚠️ No se guardó', error.message, 'error', 6000);
        }
        return;
      }

      cerrarModalRecarga();
      if (typeof showToast === 'function') {
        showToast(
          '✅ ¡Te apuntaste!',
          'Te avisamos ' + FRECUENCIAS[frecuencia] + ' para el ' + PRODUCTOS[producto] + '.',
          'success', 5000
        );
      }
    } catch (e) {
      avisar('No se pudo guardar. Inténtalo de nuevo.', false);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function conectar() {
    const abrir = $('btnSuscribirseRecarga');
    if (abrir) abrir.addEventListener('click', abrirModalRecarga);

    const cerrar = $('btnCerrarModalRecarga');
    if (cerrar) cerrar.addEventListener('click', cerrarModalRecarga);

    const cancelar = $('btnCancelarRecarga');
    if (cancelar) cancelar.addEventListener('click', cerrarModalRecarga);

    const guardar = $('btnGuardarRecarga');
    if (guardar) guardar.addEventListener('click', guardarSuscripcion);

    // El backdrop cierra, como en el resto de modales de la app.
    const modal = $('modalRecarga');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) cerrarModalRecarga();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', conectar);
  } else {
    conectar();
  }

  window.NOTIGAS_RECARGAS = {
    abrir: abrirModalRecarga,
    cerrar: cerrarModalRecarga,
    guardar: guardarSuscripcion
  };
})();
