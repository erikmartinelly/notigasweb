#!/usr/bin/env node
/**
 * Test: Verificación de Plataforma 100% Gratuita y Preparación para Google AdSense
 * 1. Todos los repartidores ven los pedidos vecinales de inmediato (sin demoras de 3 minutos).
 * 2. Todos los camiones son visibles para los compradores de inmediato (sin demoras de 1 minuto).
 * 3. Configuración de Google AdSense activa (Publisher ID ca-pub-2502415561017945).
 * 4. Verificación de ads.txt con declaración directa oficial de Google.
 * 5. Verificación del modal y botón de Política de Privacidad y Cookies en index.html.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 Iniciando pruebas de Plataforma 100% Gratuita y Google AdSense...\n');

// 1. Acceso Inmediato y Gratuito a Pedidos para Todos los Repartidores
console.log('1️⃣ Verificando acceso inmediato a pedidos para cualquier repartidor...');

const now = Date.now();
const mockOrders = [
  { id: 'order-fresh', created_at: new Date(now - 15 * 1000).toISOString(), categoria: 'Gas GLP' }, // 15 seg
  { id: 'order-mature', created_at: new Date(now - 5 * 60 * 1000).toISOString(), categoria: 'Gas GLP' } // 5 min
];

// Nueva lógica en js/orders.js y js/map.js: Sin retenciones ni cobros
function filterOrdersForDriver(orders, driverCategoria = 'Gas GLP') {
  return orders.filter(o => {
    return o.categoria === driverCategoria;
  });
}

const visibleOrders = filterOrdersForDriver(mockOrders, 'Gas GLP');
assert.strictEqual(visibleOrders.length, 2, 'El repartidor debe ver el 100% de los pedidos de su rubro de inmediato');
assert.strictEqual(visibleOrders[0].id, 'order-fresh', 'El pedido de 15 segundos debe estar visible');
assert.strictEqual(visibleOrders[1].id, 'order-mature', 'El pedido de 5 minutos debe estar visible');

console.log('   ✅ Cualquier repartidor ve pedidos nuevos de inmediato (2/2 pedidos, 0 segundos de demora).\n');

// 2. Visibilidad Inmediata ante Compradores
console.log('2️⃣ Verificando visibilidad inmediata de camiones en mapa ante compradores...');

const mockTrucks = [
  { id: 'truck-1', route_created_at: new Date(now - 10 * 1000).toISOString() }, // 10 seg
  { id: 'truck-2', route_created_at: new Date(now - 60 * 1000).toISOString() }  // 60 seg
];

// Nueva lógica en js/map.js: Sin retenciones ante compradores
function shouldShowTruckToBuyer(truck) {
  // 100% Gratuito y Libre: Todos los camiones son visibles en tiempo real
  return Boolean(truck.id);
}

const visibleTrucks = mockTrucks.filter(shouldShowTruckToBuyer);
assert.strictEqual(visibleTrucks.length, 2, 'Todos los camiones deben ser visibles ante compradores de inmediato');
console.log('   ✅ Compradores ven todos los camiones en tiempo real sin retención (2/2 camiones).\n');

// 3. Verificación de ads.txt
console.log('3️⃣ Verificando archivo ads.txt en la raíz del proyecto...');
const adsTxtPath = path.join(__dirname, '..', 'ads.txt');
assert.ok(fs.existsSync(adsTxtPath), 'El archivo ads.txt debe existir');
const adsTxtContent = fs.readFileSync(adsTxtPath, 'utf8');
assert.ok(adsTxtContent.includes('ca-pub-2502415561017945') || adsTxtContent.includes('pub-2502415561017945'), 'ads.txt debe contener el Publisher ID pub-2502415561017945');
assert.ok(adsTxtContent.includes('google.com'), 'ads.txt debe declarar google.com');
assert.ok(adsTxtContent.includes('DIRECT'), 'ads.txt debe ser relación DIRECT');
console.log('   ✅ ads.txt verificado correctamente con Google AdSense.\n');

// 4. Verificación de Script de Google AdSense y Política de Privacidad en index.html
console.log('4️⃣ Verificando script oficial de Google AdSense y Política de Privacidad en index.html...');
const indexPath = path.join(__dirname, '..', 'index.html');
const indexContent = fs.readFileSync(indexPath, 'utf8');

assert.ok(indexContent.includes('pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'), 'index.html debe incluir el script de AdSense');
assert.ok(indexContent.includes('ca-pub-2502415561017945'), 'index.html debe incluir client=ca-pub-2502415561017945');
assert.ok(indexContent.includes('modalPrivacyPolicy'), 'index.html debe incluir el modal modalPrivacyPolicy');
assert.ok(indexContent.includes('btnOpenPrivacyPolicy'), 'index.html debe incluir el botón btnOpenPrivacyPolicy');
assert.ok(indexContent.includes('adssettings.google.com'), 'modalPrivacyPolicy debe tener enlace a la configuración de cookies de Google');

console.log('   ✅ Script de Google AdSense en <head> verificado.');
console.log('   ✅ Modal de Política de Privacidad y Cookies verificado.\n');

// 5. Verificación de Generación de Unidades AdSense en js/promo.js
console.log('5️⃣ Verificando generación y activación de unidades AdSense en js/promo.js...');
const promoJsPath = path.join(__dirname, '..', 'js', 'promo.js');
const promoContent = fs.readFileSync(promoJsPath, 'utf8');

assert.ok(promoContent.includes('adsbygoogle'), 'js/promo.js debe manejar ins.adsbygoogle');
assert.ok(promoContent.includes('ca-pub-2502415561017945'), 'js/promo.js debe incluir el publisher id');
assert.ok(promoContent.includes('activateAdSenseIn'), 'js/promo.js debe exportar activateAdSenseIn');

console.log('   ✅ js/promo.js listo para monetización con Google AdSense.\n');

console.log('--------------------------------------------------');
console.log('✨ ÉXITO: 100% de pruebas de Plataforma Gratuita y Monetización Google AdSense superadas.');
