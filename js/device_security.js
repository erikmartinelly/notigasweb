/**
 * NOTIGAS - Módulo de Seguridad y Huella de Hardware Móvil (Device Security)
 * Garantiza persistencia multi-capa del Device ID y genera una huella de hardware
 * (Canvas 2D + WebGL + Screen + Concurrency) para impedir la evasión de sanciones
 * por falta de pago de comisiones o intento de registro con DNI ajeno.
 */

(function(window) {
  'use strict';

  const STORAGE_KEY_DEV = 'notigas_device_id';
  const STORAGE_KEY_LOCK = 'notigas_device_lockout';
  const COOKIE_NAME = 'notigas_did';
  const IDB_NAME = 'notigas_sec_db';
  const IDB_STORE = 'sec_store';

  let cachedDeviceId = null;
  let cachedFingerprint = null;
  let isLockoutActive = false;

  // 1. Funciones auxiliares de cookies con expiración a 10 años
  function setLongLivedCookie(name, value) {
    try {
      const maxAge = 10 * 365 * 24 * 60 * 60; // 10 años
      document.cookie = ${name}=; Max-Age=; path=/; SameSite=Lax;
    } catch (_) {}
  }

  function getCookie(name) {
    try {
      const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
      return match ? decodeURIComponent(match[2]) : null;
    } catch (_) {
      return null;
    }
  }

  // 2. Persistencia en IndexedDB (Resiste borrado simple de localStorage en muchos navegadores)
  function getFromIndexedDB() {
    return new Promise((resolve) => {
      try {
        if (!window.indexedDB) return resolve(null);
        const req = window.indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.createObjectStore(IDB_STORE);
          }
        };
        req.onsuccess = (e) => {
          const db = e.target.result;
          const tx = db.transaction(IDB_STORE, 'readonly');
          const store = tx.objectStore(IDB_STORE);
          const getReq = store.get('device_id');
          getReq.onsuccess = () => resolve(getReq.result || null);
          getReq.onerror = () => resolve(null);
        };
        req.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  }

  function saveToIndexedDB(id) {
    try {
      if (!window.indexedDB || !id) return;
      const req = window.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        store.put(id, 'device_id');
      };
    } catch (_) {}
  }

  // 3. Generación de Hash determinístico FNV-1a (32/64 bit string)
  function fnv1aHash(str) {
    let h1 = 0xdeadbeef ^ 0;
    let h2 = 0x41c6ce57 ^ 0;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  }

  // 4. Huella de Hardware Digital (Canvas 2D + GPU WebGL + Pantalla + Hardware)
  function generateHardwareFingerprint() {
    if (cachedFingerprint) return cachedFingerprint;

    const components = [];

    // Componente Pantalla y Dispositivo
    try {
      components.push(scr:xx);
      components.push(dpr:);
      components.push(cpu:);
      components.push(mem:);
      components.push(plat:);
      components.push(	ouch:);
      components.push(	z:);
    } catch (_) {}

    // Componente Canvas 2D
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 40;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial, sans-serif';
        ctx.fillStyle = '#FF6D00';
        ctx.fillRect(10, 5, 80, 25);
        ctx.fillStyle = '#0F172A';
        ctx.fillText('NOTIGAS_SEC_PERU_GLP', 12, 10);
        ctx.strokeStyle = '#10B981';
        ctx.strokeRect(5, 2, 180, 32);
        components.push(cvs:);
      }
    } catch (_) {}

    // Componente GPU WebGL
    try {
      const glCanvas = document.createElement('canvas');
      const gl = glCanvas.getContext('webgl') || glCanvas.getContext('experimental-webgl');
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
          const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
          components.push(gpu:~);
        }
      }
    } catch (_) {}

    const rawSignature = components.join('||');
    const hash = 'FP-' + fnv1aHash(rawSignature).toUpperCase();
    cachedFingerprint = hash;
    return hash;
  }

  // 5. Obtención y Sincronización del Device ID multi-capa
  async function resolveDeviceId() {
    if (cachedDeviceId) return cachedDeviceId;

    // Capa A: LocalStorage
    let devId = null;
    try {
      devId = localStorage.getItem(STORAGE_KEY_DEV);
    } catch (_) {}

    // Capa B: Cookie
    if (!devId) {
      devId = getCookie(COOKIE_NAME);
    }

    // Capa C: IndexedDB
    if (!devId) {
      devId = await getFromIndexedDB();
    }

    // Si aún no existe, generar nuevo Device ID acoplado
    if (!devId) {
      const randHex = Math.random().toString(36).substring(2, 10).toUpperCase();
      const timeHex = Date.now().toString(36).toUpperCase();
      devId = DEV--;
    }

    cachedDeviceId = devId;

    // Sincronizar en todas las capas para máxima persistencia
    try { localStorage.setItem(STORAGE_KEY_DEV, devId); } catch (_) {}
    setLongLivedCookie(COOKIE_NAME, devId);
    saveToIndexedDB(devId);

    return devId;
  }

  function getDeviceIdSync() {
    if (cachedDeviceId) return cachedDeviceId;
    let devId = null;
    try { devId = localStorage.getItem(STORAGE_KEY_DEV); } catch (_) {}
    if (!devId) devId = getCookie(COOKIE_NAME);
    if (!devId) {
      const randHex = Math.random().toString(36).substring(2, 10).toUpperCase();
      devId = DEV--;
    }
    cachedDeviceId = devId;
    try { localStorage.setItem(STORAGE_KEY_DEV, devId); } catch (_) {}
    setLongLivedCookie(COOKIE_NAME, devId);
    return devId;
  }

  // 6. Consultar al backend de Supabase si este equipo, DNI o placa está bloqueado
  async function checkBlockedStatus(dni = '', placa = '') {
    const devId = await resolveDeviceId();
    const fp = generateHardwareFingerprint();

    // Comprobación local previa de bandera de bloqueo persistente
    try {
      const localLock = localStorage.getItem(STORAGE_KEY_LOCK);
      if (localLock) {
        const parsed = JSON.parse(localLock);
        if (parsed && parsed.bloqueado) {
          triggerLockout(parsed.motivo || 'Dispositivo suspendido por comisiones pendientes.');
          return { bloqueado: true, motivo: parsed.motivo };
        }
      }
    } catch (_) {}

    if (!window.supabaseClient) {
      return { bloqueado: false };
    }

    try {
      const { data, error } = await window.supabaseClient.rpc('rpc_verificar_bloqueo_dispositivo', {
        p_device_id: devId,
        p_device_fingerprint: fp,
        p_dni: dni ? String(dni).trim() : null,
        p_placa: placa ? String(placa).trim() : null
      });

      if (error) {
        console.warn('Aviso comprobando bloqueo de dispositivo:', error.message);
        return { bloqueado: false };
      }

      if (data && data.bloqueado === true) {
        const motivo = data.motivo || 'Dispositivo suspendido por falta de pago de comisiones (S/ 1 por balón).';
        try {
          localStorage.setItem(STORAGE_KEY_LOCK, JSON.stringify({ bloqueado: true, motivo, timestamp: Date.now() }));
        } catch (_) {}
        triggerLockout(motivo);
        return { bloqueado: true, motivo };
      }

      return { bloqueado: false };
    } catch (err) {
      console.warn('Error en checkBlockedStatus:', err);
      return { bloqueado: false };
    }
  }

  // 7. Pantalla Ineludible de Bloqueo: Le Cierra la Puerta en la Cara
  function triggerLockout(motivo = 'Dispositivo suspendido por falta de pago de comisión de S/ 1 por balón de gas el fin de semana.') {
    isLockoutActive = true;

    // Desactivar inmediatamente modo repartidor y limpiar credenciales activas
    if (typeof window.setAppMode === 'function') {
      try { window.setAppMode('buyer'); } catch (_) {}
    }

    // Ocultar modal de registro de chofer si estuviera abierto
    const modalDriver = document.getElementById('modalDriver');
    if (modalDriver) modalDriver.style.display = 'none';

    // Desplegar modal de bloqueo permanente
    const lockoutModal = document.getElementById('modalDeviceLockout');
    const lockoutReasonEl = document.getElementById('deviceLockoutReasonText');
    const lockoutDeviceIdEl = document.getElementById('deviceLockoutIdText');

    if (lockoutReasonEl) lockoutReasonEl.textContent = motivo;
    if (lockoutDeviceIdEl) lockoutDeviceIdEl.textContent = cachedDeviceId || getDeviceIdSync();

    if (lockoutModal) {
      lockoutModal.style.display = 'flex';
    } else {
      alert(🚪 ACCESO DENEGADO - DISPOSITIVO BLOQUEADO



No se permite registrar ni utilizar cuentas de repartidor en este teléfono celular.);
    }

    // Bloquear intentos de abrir el modal de chofer en el futuro
    window.abrirModalDriver = function() {
      triggerLockout(motivo);
    };
  }

  // 8. Inicialización automática al cargar el DOM
  async function init() {
    resolveDeviceId();
    generateHardwareFingerprint();

    // Si ya existe bandera local de bloqueo, disparar pantalla de inmediato
    try {
      const localLock = localStorage.getItem(STORAGE_KEY_LOCK);
      if (localLock) {
        const parsed = JSON.parse(localLock);
        if (parsed && parsed.bloqueado) {
          triggerLockout(parsed.motivo);
          return;
        }
      }
    } catch (_) {}

    // Verificación rápida en segundo plano
    setTimeout(async () => {
      try {
        const u = (typeof AppState !== 'undefined' ? AppState.get('userData') : null) || {};
        const dni = u.dni || '';
        const placa = u.placa || '';
        await checkBlockedStatus(dni, placa);
      } catch (_) {}
    }, 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Exportar API global
  window.DeviceSecurity = {
    getDeviceId: resolveDeviceId,
    getDeviceIdSync: getDeviceIdSync,
    getHardwareFingerprint: generateHardwareFingerprint,
    getSecurityPayload: async function() {
      return {
        device_id: await resolveDeviceId(),
        device_fingerprint: generateHardwareFingerprint()
      };
    },
    checkBlockedStatus: checkBlockedStatus,
    triggerLockout: triggerLockout,
    isLockoutActive: function() { return isLockoutActive; }
  };

})(window);
