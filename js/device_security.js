/**
 * NOTIGAS - Device security signal module.
 *
 * Browser identifiers are secondary anti-abuse signals, not immutable hardware IDs.
 * The backend remains the authority for suspensions and reactivation.
 */
(function (window) {
  'use strict';

  const STORAGE_KEY_DEV = 'notigas_device_id';
  const STORAGE_KEY_LOCK = 'notigas_device_lockout';
  const COOKIE_NAME = 'notigas_did';
  const IDB_NAME = 'notigas_sec_db';
  const IDB_STORE = 'sec_store';
  const COOKIE_MAX_AGE = 10 * 365 * 24 * 60 * 60;

  let cachedDeviceId = null;
  let cachedFingerprint = null;
  let isLockoutActive = false;

  function setLongLivedCookie(name, value) {
    try {
      document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax; Secure`;
    } catch (_) {}
  }

  function getCookie(name) {
    try {
      const encodedName = encodeURIComponent(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${encodedName}=([^;]+)`));
      return match ? decodeURIComponent(match[1]) : null;
    } catch (_) {
      return null;
    }
  }

  function readLocalLock() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_LOCK);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && parsed.bloqueado === true ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function writeLocalLock(motivo) {
    try {
      localStorage.setItem(STORAGE_KEY_LOCK, JSON.stringify({
        bloqueado: true,
        motivo: String(motivo || 'Cuenta de repartidor suspendida.'),
        checked_at: new Date().toISOString()
      }));
    } catch (_) {}
  }

  function clearLocalLock() {
    try { localStorage.removeItem(STORAGE_KEY_LOCK); } catch (_) {}
    isLockoutActive = false;
    const modal = document.getElementById('modalDeviceLockout');
    if (modal) modal.style.display = 'none';
  }

  function getFromIndexedDB() {
    return new Promise((resolve) => {
      try {
        if (!window.indexedDB) return resolve(null);
        const req = window.indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
        };
        req.onsuccess = (event) => {
          const db = event.target.result;
          const tx = db.transaction(IDB_STORE, 'readonly');
          const getReq = tx.objectStore(IDB_STORE).get('device_id');
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
      req.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = (event) => {
        const db = event.target.result;
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(id, 'device_id');
      };
    } catch (_) {}
  }

  function fnv1aHash(value) {
    const str = String(value || '');
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i += 1) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  }

  function generateBrowserFingerprint() {
    if (cachedFingerprint) return cachedFingerprint;
    const components = [];

    try {
      components.push(`scr:${screen.width}x${screen.height}`);
      components.push(`dpr:${window.devicePixelRatio || 1}`);
      components.push(`cpu:${navigator.hardwareConcurrency || 0}`);
      components.push(`mem:${navigator.deviceMemory || 0}`);
      components.push(`plat:${navigator.platform || ''}`);
      components.push(`touch:${navigator.maxTouchPoints || 0}`);
      components.push(`tz:${Intl.DateTimeFormat().resolvedOptions().timeZone || ''}`);
    } catch (_) {}

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
        components.push(`cvs:${canvas.toDataURL().slice(-96)}`);
      }
    } catch (_) {}

    try {
      const glCanvas = document.createElement('canvas');
      const gl = glCanvas.getContext('webgl') || glCanvas.getContext('experimental-webgl');
      if (gl) {
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        if (info) {
          components.push(`gpu:${gl.getParameter(info.UNMASKED_VENDOR_WEBGL)}~${gl.getParameter(info.UNMASKED_RENDERER_WEBGL)}`);
        }
      }
    } catch (_) {}

    cachedFingerprint = `FP-${fnv1aHash(components.join('||')).toUpperCase()}`;
    return cachedFingerprint;
  }

  function newDeviceId() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return `DEV-${window.crypto.randomUUID().toUpperCase()}`;
      }
    } catch (_) {}
    const randomPart = Math.random().toString(36).slice(2, 12).toUpperCase();
    return `DEV-${Date.now().toString(36).toUpperCase()}-${randomPart}`;
  }

  async function resolveDeviceId() {
    if (cachedDeviceId) return cachedDeviceId;

    let deviceId = null;
    try { deviceId = localStorage.getItem(STORAGE_KEY_DEV); } catch (_) {}
    if (!deviceId) deviceId = getCookie(COOKIE_NAME);
    if (!deviceId) deviceId = await getFromIndexedDB();
    if (!deviceId) deviceId = newDeviceId();

    cachedDeviceId = deviceId;
    try { localStorage.setItem(STORAGE_KEY_DEV, deviceId); } catch (_) {}
    setLongLivedCookie(COOKIE_NAME, deviceId);
    saveToIndexedDB(deviceId);
    return deviceId;
  }

  function getDeviceIdSync() {
    if (cachedDeviceId) return cachedDeviceId;
    let deviceId = null;
    try { deviceId = localStorage.getItem(STORAGE_KEY_DEV); } catch (_) {}
    if (!deviceId) deviceId = getCookie(COOKIE_NAME);
    if (!deviceId) deviceId = newDeviceId();
    cachedDeviceId = deviceId;
    try { localStorage.setItem(STORAGE_KEY_DEV, deviceId); } catch (_) {}
    setLongLivedCookie(COOKIE_NAME, deviceId);
    saveToIndexedDB(deviceId);
    return deviceId;
  }

  function triggerLockout(motivo) {
    const reason = String(motivo || 'Cuenta de repartidor suspendida hasta regularizar su situación.');
    isLockoutActive = true;

    if (typeof window.setAppMode === 'function') {
      try { window.setAppMode('buyer'); } catch (_) {}
    }

    const driverModal = document.getElementById('modalDriver');
    if (driverModal) driverModal.style.display = 'none';

    const lockoutModal = document.getElementById('modalDeviceLockout');
    const reasonEl = document.getElementById('deviceLockoutReasonText');
    const idEl = document.getElementById('deviceLockoutIdText');
    if (reasonEl) reasonEl.textContent = reason;
    if (idEl) idEl.textContent = cachedDeviceId || getDeviceIdSync();

    if (lockoutModal) {
      lockoutModal.style.display = 'flex';
    } else if (typeof window.alert === 'function') {
      window.alert(`ACCESO SUSPENDIDO\n\n${reason}`);
    }
  }

  async function checkBlockedStatus(dni = '', placa = '', telefono = '') {
    const deviceId = await resolveDeviceId();
    const fingerprint = generateBrowserFingerprint();
    const cachedLock = readLocalLock();

    if (!window.supabaseClient) {
      if (cachedLock) triggerLockout(cachedLock.motivo);
      return cachedLock || { bloqueado: false, verificacion_pendiente: true };
    }

    try {
      const { data, error } = await window.supabaseClient.rpc('rpc_verificar_bloqueo_dispositivo', {
        p_device_id: deviceId,
        p_device_fingerprint: fingerprint,
        p_dni: dni ? String(dni).trim() : null,
        p_placa: placa ? String(placa).trim() : null,
        p_telefono: telefono ? String(telefono).trim() : null
      });

      if (error) {
        console.warn('No se pudo verificar el bloqueo de dispositivo:', error.message);
        if (cachedLock) triggerLockout(cachedLock.motivo);
        return cachedLock || { bloqueado: false, verificacion_pendiente: true };
      }

      if (data && data.bloqueado === true) {
        const motivo = data.motivo || 'Cuenta de repartidor suspendida. Regulariza la remesa pendiente para continuar.';
        writeLocalLock(motivo);
        triggerLockout(motivo);
        return data;
      }

      clearLocalLock();
      return data || { bloqueado: false };
    } catch (err) {
      console.warn('Error verificando bloqueo de dispositivo:', err);
      if (cachedLock) triggerLockout(cachedLock.motivo);
      return cachedLock || { bloqueado: false, verificacion_pendiente: true };
    }
  }

  async function init() {
    await resolveDeviceId();
    generateBrowserFingerprint();

    window.setTimeout(async () => {
      try {
        const user = (typeof AppState !== 'undefined' ? AppState.get('userData') : null) || {};
        await checkBlockedStatus(user.dni || '', user.placa || '', user.telefono_whatsapp || user.telefono || '');
      } catch (_) {}
    }, 800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.DeviceSecurity = {
    getDeviceId: resolveDeviceId,
    getDeviceIdSync,
    getHardwareFingerprint: generateBrowserFingerprint,
    getBrowserFingerprint: generateBrowserFingerprint,
    getSecurityPayload: async function () {
      return {
        device_id: await resolveDeviceId(),
        device_fingerprint: generateBrowserFingerprint()
      };
    },
    checkBlockedStatus,
    triggerLockout,
    clearLocalLockout: clearLocalLock,
    isLockoutActive: function () { return isLockoutActive; }
  };
})(window);
