#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const checkOnly = process.argv.includes('--check');
const changed = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function write(rel, content, original) {
  if (content === original) return;
  changed.push(rel);
  if (!checkOnly) fs.writeFileSync(path.join(root, rel), content, 'utf8');
}

function replaceSection(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`No se encontró inicio de ${label}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`No se encontró fin de ${label}`);
  return source.slice(0, start) + replacement + source.slice(end);
}

try {
  // 1) Ficha de registro: una sola modalidad, sin selector PRO/Gratuito.
  const indexPath = 'index.html';
  const indexOriginal = read(indexPath);
  let index = indexOriginal;

  const selectorStart = '      <!-- SELECTOR DE PLAN DE REGISTRO: PRO VS GRATUITO -->';
  const selectorEnd = '\n\n      <div class="form-group">';
  const selectorReplacement = `      <!-- PRUEBA GRATIS PARA REPARTIDORES: MODALIDAD ÚNICA -->
      <div id="driverPlanSelectorContainer" style="margin-top:12px; margin-bottom:16px; background:linear-gradient(135deg, rgba(16,185,129,.12), rgba(15,23,42,.96)); border:1.5px solid rgba(16,185,129,.55); border-radius:12px; padding:14px;">
        <input type="hidden" id="inputDriverPlanTipo" value="credito">
        <div id="driverFreeTrialCard" style="border:1.5px solid #10B981; background:#0F172A; border-radius:12px; padding:14px 12px; box-shadow:0 8px 22px rgba(0,0,0,.18);">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:8px;">
            <strong style="color:#6EE7B7; font-size:15px; letter-spacing:.2px;">🎁 PRUEBA GRATIS</strong>
            <span style="background:rgba(16,185,129,.15); border:1px solid rgba(16,185,129,.45); color:#A7F3D0; border-radius:999px; padding:4px 8px; font-size:10px; font-weight:900; white-space:nowrap;">50 PEDIDOS</span>
          </div>
          <p id="driverFreeTrialCopy" style="margin:0; color:#F8FAFC; font-size:12px; line-height:1.55; font-weight:700;">Los primeros 50 pedidos son gratis. Desde el pedido 51 en adelante se cobra <strong>S/ 0,20 por pedido</strong>.</p>
          <p style="margin:8px 0 0; color:#94A3B8; font-size:10.5px; line-height:1.45;">Sin suscripción ni pago inicial.</p>
        </div>
      </div>`;

  if (index.includes(selectorStart)) {
    index = replaceSection(index, selectorStart, selectorEnd, selectorReplacement, 'selector heredado de planes');
  }

  const premiumStart = '      <!-- SECCIÓN MEMBRESÍA VIP PREMIUM -->';
  const premiumEnd = '\n\n      <div class="form-group">\n\n        <label>Ciudad de Trabajo:</label>';
  if (index.includes(premiumStart)) {
    index = replaceSection(index, premiumStart, premiumEnd, '', 'bloque Premium heredado');
  }

  const forbiddenIndex = [
    'Elige tu Modalidad de Registro',
    'Plan Gratuito',
    'Pedidos con <strong>3 min de espera</strong>',
    'En mapa clientes con <strong>1 min de espera</strong>',
    'Ficha básica sin corona VIP',
    'id="cardPlanDriverPro"',
    'id="cardPlanDriverGratuito"',
    'id="btnCambiarAProDesdeGratuito"',
    'id="driverPremiumGratuitoContent"'
  ];
  for (const token of forbiddenIndex) {
    if (index.includes(token)) throw new Error(`index.html conserva UI heredada: ${token}`);
  }
  if (!index.includes('🎁 PRUEBA GRATIS')) throw new Error('index.html no muestra PRUEBA GRATIS');
  if (!index.includes('Los primeros 50 pedidos son gratis. Desde el pedido 51 en adelante se cobra <strong>S/ 0,20 por pedido</strong>.')) {
    throw new Error('index.html no contiene el mensaje comercial solicitado');
  }
  write(indexPath, index, indexOriginal);

  // 2) Auth: mantener únicamente el tipo operativo "credito"; sin manipular tarjetas inexistentes.
  const authPath = 'js/auth.js';
  const authOriginal = read(authPath);
  let auth = authOriginal;
  const authFnStart = 'function seleccionarPlanRegistroChofer() {';
  const authFnEndMarker = 'window.seleccionarPlanRegistroChofer = seleccionarPlanRegistroChofer;';
  const authStart = auth.indexOf(authFnStart);
  if (authStart < 0) throw new Error('No se encontró seleccionarPlanRegistroChofer en auth.js');
  const authEndStart = auth.indexOf(authFnEndMarker, authStart);
  if (authEndStart < 0) throw new Error('No se encontró export de seleccionarPlanRegistroChofer');
  const authEnd = authEndStart + authFnEndMarker.length;
  const authReplacement = `function seleccionarPlanRegistroChofer() {
  const inputTipo = document.getElementById('inputDriverPlanTipo');
  if (inputTipo) inputTipo.value = 'credito';
  const btnText = document.getElementById('btnDriverSubmitText');
  if (btnText) btnText.textContent = 'Guardar ficha de repartidor';
}
window.seleccionarPlanRegistroChofer = seleccionarPlanRegistroChofer;`;
  auth = auth.slice(0, authStart) + authReplacement + auth.slice(authEnd);
  auth = auth.replace(/seleccionarPlanRegistroChofer\('credito'\);/g, 'seleccionarPlanRegistroChofer();');
  if (/cardPlanDriverPro|cardPlanDriverGratuito|driverPremiumGratuitoContent|btnCambiarAProDesdeGratuito/.test(auth)) {
    throw new Error('auth.js conserva referencias al selector de planes retirado');
  }
  write(authPath, auth, authOriginal);

  // 3) Events: retirar listeners de tarjetas y botón de cambio de plan que ya no existen.
  const eventsPath = 'js/events.js';
  const eventsOriginal = read(eventsPath);
  let events = eventsOriginal;
  const eventsStart = "    const el_cardPlanDriverPro = document.getElementById('cardPlanDriverPro');";
  const eventsEnd = "\n\n    const el_auto_event_30 = document.getElementById('auto-event-30');";
  if (events.includes(eventsStart)) {
    const s = events.indexOf(eventsStart);
    const e = events.indexOf(eventsEnd, s);
    if (e < 0) throw new Error('No se encontró fin del bloque de eventos de planes');
    events = events.slice(0, s) + events.slice(e);
  }
  if (/cardPlanDriverPro|cardPlanDriverGratuito|btnCambiarAProDesdeGratuito/.test(events)) {
    throw new Error('events.js conserva listeners de planes retirados');
  }
  write(eventsPath, events, eventsOriginal);

  // 4) Quitar la normalización temporal runtime: el HTML fuente ya queda corregido.
  const serverPath = 'server.js';
  const serverOriginal = read(serverPath);
  let server = serverOriginal;
  server = server.replace(
    "// no al formulario de alta. La ficha de repartidor se normaliza a una única\n// modalidad con prueba gratis mediante driver_free_trial_registration.js.\n",
    "// no al formulario de alta.\n"
  );
  server = server.replace(
    `  .replace(\n    DRIVER_CREDIT_TERMS_HEADING,\n    \`${'${DRIVER_CREDIT_TERMS_HEADING}${DRIVER_CREDIT_TERMS_COPY}'}\`\n  )\n  .replace(\n    '</body>',\n    '  <script defer src="js/driver_free_trial_registration.js?v=135"></script>\\n</body>'\n  );`,
    `  .replace(\n    DRIVER_CREDIT_TERMS_HEADING,\n    \`${'${DRIVER_CREDIT_TERMS_HEADING}${DRIVER_CREDIT_TERMS_COPY}'}\`\n  );`
  );
  if (server.includes('driver_free_trial_registration.js')) throw new Error('server.js conserva el inyector temporal de prueba gratis');
  write(serverPath, server, serverOriginal);

  const tempRuntime = path.join(root, 'js', 'driver_free_trial_registration.js');
  if (fs.existsSync(tempRuntime)) {
    changed.push('js/driver_free_trial_registration.js');
    if (!checkOnly) fs.unlinkSync(tempRuntime);
  }

  if (checkOnly && changed.length) {
    throw new Error(`La ficha de repartidor no está normalizada. Cambiarían: ${changed.join(', ')}`);
  }

  console.log(checkOnly
    ? '✅ Registro de repartidor normalizado: PRUEBA GRATIS + 50 pedidos + S/ 0,20 desde el 51'
    : `✅ Normalización aplicada: ${changed.join(', ') || 'sin cambios'}`);
} catch (err) {
  console.error('❌ Normalización registro repartidor:', err.message);
  process.exit(1);
}
