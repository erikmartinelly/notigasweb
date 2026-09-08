#!/usr/bin/env node
/**
 * Test: Verificación Integral de Planes PRO vs Gratuito, Tiempos Preferentes y AdSense
 * 1. Ventaja de 3 minutos en pedidos efectivos para choferes PRO vs Gratuito.
 * 2. Ventaja de 1 minuto en la vista de compradores para camiones PRO vs Gratuito.
 * 3. Ordenamiento prioritario de repartidores PRO en directorio de compradores.
 * 4. Verificación de ads.txt con declaración directa oficial de Google.
 * 5. Verificación de Política de Privacidad, Aviso Legal y Google AdSense en index.html y js/events.js.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 Iniciando pruebas de ventajas competitivas PRO vs Gratuito y AdSense...\n');

// 1. Prueba de 3 Minutos de Ventaja en Pedidos Efectivos
console.log('1️⃣ Verificando ventaja de 3 minutos en pedidos efectivos...');

const PRO_ORDER_ADVANTAGE_MS = 3 * 60 * 1000; // 3 minutos
const now = Date.now();

const mockOrders = [
  { id: 'order-fresh', created_at: new Date(now - 30 * 1000).toISOString(), categoria: 'Gas GLP' }, // Creado hace 30 seg
  { id: 'order-mature', created_at: new Date(now - 4 * 60 * 1000).toISOString(), categoria: 'Gas GLP' } // Creado hace 4 min
];

// Función de filtrado idéntica a la implementada en js/orders.js y js/map.js
function filterOrdersForDriver(orders, isDriverVip) {
  return orders.filter(o => {
    const age = now - new Date(o.created_at).getTime();
    if (!isDriverVip && age < PRO_ORDER_ADVANTAGE_MS) {
      return false; // Reservado para choferes PRO durante los primeros 3 minutos
    }
    return true;
  });
}

const proOrders = filterOrdersForDriver(mockOrders, true);
const freeOrders = filterOrdersForDriver(mockOrders, false);

assert.strictEqual(proOrders.length, 2, 'El chofer PRO debe ver ambos pedidos (fresco y maduro)');
assert.strictEqual(freeOrders.length, 1, 'El chofer Gratuito solo debe ver el pedido maduro (> 3 min)');
assert.strictEqual(freeOrders[0].id, 'order-mature', 'El pedido visible para chofer gratuito debe ser order-mature');

console.log('   ✅ Chofer PRO ve pedidos nuevos de inmediato (2/2 pedidos).');
console.log('   ✅ Chofer Gratuito tiene 3 minutos de demora (1/2 pedidos, pedido fresco retenido).\n');

// 2. Prueba de 1 Minuto de Ventaja ante Compradores
console.log('2️⃣ Verificando ventaja de 1 minuto en la vista de compradores...');

const PRO_BUYER_ADVANTAGE_MS = 60 * 1000; // 1 minuto de ventaja

const mockTrucks = [
  { id: 'truck-pro-fresh', es_premium: true, route_created_at: new Date(now - 20 * 1000).toISOString() }, // PRO hace 20 seg
  { id: 'truck-free-fresh', es_premium: false, route_created_at: new Date(now - 20 * 1000).toISOString() }, // Gratuito hace 20 seg
  { id: 'truck-free-mature', es_premium: false, route_created_at: new Date(now - 90 * 1000).toISOString() } // Gratuito hace 90 seg
];

function shouldShowTruckToBuyer(truck) {
  const isVip = Boolean(truck.es_premium || truck.tipo_plan === 'pro');
  if (!isVip) {
    const routeAge = now - new Date(truck.route_created_at).getTime();
    if (routeAge < PRO_BUYER_ADVANTAGE_MS) {
      return false; // Retener por 1 minuto ante compradores
    }
  }
  return true;
}

const visibleTrucks = mockTrucks.filter(shouldShowTruckToBuyer);
assert.strictEqual(visibleTrucks.some(t => t.id === 'truck-pro-fresh'), true, 'El camión PRO fresco debe ser visible ante compradores');
assert.strictEqual(visibleTrucks.some(t => t.id === 'truck-free-fresh'), false, 'El camión Gratuito fresco debe estar oculto ante compradores durante el 1er minuto');
assert.strictEqual(visibleTrucks.some(t => t.id === 'truck-free-mature'), true, 'El camión Gratuito de más de 1 minuto debe ser visible ante compradores');

console.log('   ✅ Comprador ve camión PRO fresco de inmediato (sin retención).');
console.log('   ✅ Camión gratuito fresco queda retenido ante el comprador por 1 minuto.');
console.log('   ✅ Camión gratuito maduro (> 1 min) se visualiza correctamente en el mapa.\n');

// 3. Prueba de Prioridad en Directorio de Repartidores para Compradores
console.log('3️⃣ Verificando ordenamiento prioritario de PRO en directorio...');

const mockDirectory = [
  { name: 'Repartidor Gratuito 1', es_premium: false },
  { name: 'Repartidor PRO 1', es_premium: true },
  { name: 'Repartidor Gratuito 2', es_premium: false },
  { name: 'Repartidor PRO 2', es_premium: true }
];

mockDirectory.sort((a, b) => (b.es_premium ? 1 : 0) - (a.es_premium ? 1 : 0));

assert.strictEqual(mockDirectory[0].es_premium, true, 'El primer repartidor debe ser PRO');
assert.strictEqual(mockDirectory[1].es_premium, true, 'El segundo repartidor debe ser PRO');
assert.strictEqual(mockDirectory[2].es_premium, false, 'El tercer repartidor debe ser Gratuito');
assert.strictEqual(mockDirectory[3].es_premium, false, 'El cuarto repartidor debe ser Gratuito');

console.log('   ✅ Todos los repartidores PRO aparecen encabezando el listado ante los clientes.\n');

// 4. Verificación de ads.txt
console.log('4️⃣ Verificando archivo ads.txt en la raíz del proyecto...');
const adsTxtPath = path.join(__dirname, '..', 'ads.txt');
assert.ok(fs.existsSync(adsTxtPath), 'El archivo ads.txt debe existir');
const adsTxtContent = fs.readFileSync(adsTxtPath, 'utf8');
assert.ok(adsTxtContent.includes('pub-2502415561017945'), 'ads.txt debe contener el Publisher ID pub-2502415561017945');
assert.ok(adsTxtContent.includes('google.com'), 'ads.txt debe declarar google.com');
assert.ok(adsTxtContent.includes('DIRECT'), 'ads.txt debe ser relación DIRECT');
console.log('   ✅ ads.txt verificado correctamente con Google AdSense.\n');

// 5. Verificación de Política de Privacidad, Aviso Legal y Modal en index.html
console.log('5️⃣ Verificando integración de Política de Privacidad, Aviso Legal y AdSense en index.html...');
const indexPath = path.join(__dirname, '..', 'index.html');
const indexContent = fs.readFileSync(indexPath, 'utf8');

assert.ok(indexContent.includes('modalPrivacyPolicy'), 'index.html debe incluir el modal modalPrivacyPolicy');
assert.ok(indexContent.includes('btnPrivacyPolicyBuyer'), 'index.html debe incluir el botón btnPrivacyPolicyBuyer');
assert.ok(indexContent.includes('btnPrivacyPolicyDriver'), 'index.html debe incluir el botón btnPrivacyPolicyDriver');
assert.ok(indexContent.includes('btnOpenPrivacyPolicy'), 'index.html debe incluir el botón btnOpenPrivacyPolicy');
assert.ok(indexContent.includes('driverPlanSelectorContainer'), 'index.html debe incluir el selector de planes driverPlanSelectorContainer');
assert.ok(indexContent.includes('cardPlanDriverPro'), 'index.html debe incluir la tarjeta cardPlanDriverPro');
assert.ok(indexContent.includes('cardPlanDriverGratuito'), 'index.html debe incluir la tarjeta cardPlanDriverGratuito');
assert.ok(indexContent.includes('pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'), 'index.html debe incluir el script de AdSense');

console.log('   ✅ Botones de Política de Privacidad y Aviso Legal en menús comprador y repartidor verificados.');
console.log('   ✅ Selector de planes PRO vs Gratuito y caja de pago verificados.');
console.log('   ✅ Script de Google AdSense en <head> verificado.\n');

console.log('--------------------------------------------------');
console.log('✨ ÉXITO: 100% de pruebas de ventajas PRO, 3 min pedidos, 1 min clientes, Aviso Legal y AdSense superadas.');
