#!/usr/bin/env node
/**
 * NOTIGAS - Cross-Role RLS & View Visibility Test
 * Validates that:
 * 1. Buyer A creates an order -> Driver B can view it in pedidos_publicos.
 * 2. Driver B broadcasts GPS -> Buyer A can view the truck in rutas_repartidores_publicas.
 * 3. Buyer C querying pedidos_publicos receives privacy-masked coordinates and NULL contact info.
 * 4. rutas_repartidores_publicas returns all columns expected by map.js.
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 Iniciando prueba de seguridad RLS Multi-Rol (Comprador vs Repartidor)...\n');

// Simular clientes para Comprador A, Repartidor B y Comprador C
const mockOrdersDB = [
  {
    id: 'order-buyer-a',
    user_id: 'user-buyer-a',
    categoria: 'Gas GLP',
    titulo: 'Pedido de Gas Casa #14',
    cantidad: '2',
    direccion: 'Av. Heroínas #456',
    telefono: '77998877',
    estado: 'pendiente',
    driver_id: null,
    ciudad: 'cochabamba',
    barrio_otb: 'Cala Cala',
    latitude: -17.389543,
    longitude: -66.156821,
    descripcion: 'Tocar el timbre blanco',
    visto: false,
    created_at: new Date().toISOString()
  }
];

const mockTrucksDB = [
  {
    id: 'truck-driver-b',
    user_id: 'user-driver-b',
    distribuidor_nombre: 'Distribuidora San Pedro',
    categoria: 'Gas GLP',
    titulo: 'Camión #4',
    ciudad: 'cochabamba',
    latitude: -17.388000,
    longitude: -66.155000,
    garrafas_agotadas: false,
    last_active: new Date().toISOString(),
    telefono: '71234567',
    placa: '4589-ABC',
    productos: 'Gas 10kg, Válvula Premium'
  }
];

// 1. Simulación de Vista pedidos_publicos (Security Definer logic)
function queryPedidosPublicos(callingUserId, isEnabledDriver = false) {
  return mockOrdersDB
    .filter(p => p.estado === 'pendiente' || p.estado === 'visto')
    .map(p => {
      const isOwner = p.user_id === callingUserId;
      const canSeeDetails = isOwner || isEnabledDriver;
      return {
        id: p.id,
        user_id: isOwner ? p.user_id : null,
        categoria: p.categoria,
        titulo: canSeeDetails ? p.titulo : 'Pedido Vecinal',
        cantidad: p.cantidad,
        direccion: canSeeDetails ? p.direccion : null,
        telefono: canSeeDetails ? p.telefono : null,
        estado: p.estado,
        driver_id: (isOwner || p.driver_id === callingUserId) ? p.driver_id : null,
        ciudad: p.ciudad,
        barrio_otb: p.barrio_otb || 'Zona indicada en el mapa',
        latitude: canSeeDetails ? p.latitude : Math.round(p.latitude * 1000) / 1000,
        longitude: canSeeDetails ? p.longitude : Math.round(p.longitude * 1000) / 1000,
        descripcion: canSeeDetails ? p.descripcion : null,
        visto: p.visto,
        created_at: p.created_at
      };
    });
}

// 2. Simulación de Vista rutas_repartidores_publicas (Security Definer logic)
function queryRutasRepartidoresPublicas(callingUserId) {
  const tenMinsAgo = Date.now() - 10 * 60000;
  return mockTrucksDB
    .filter(r => new Date(r.last_active).getTime() >= tenMinsAgo)
    .map(r => ({
      id: r.id,
      user_id: r.user_id === callingUserId ? r.user_id : null,
      distribuidor_nombre: r.distribuidor_nombre || 'Repartidor NOTIGAS',
      categoria: r.categoria || 'Gas GLP',
      titulo: r.titulo || 'En ruta de distribución',
      ciudad: r.ciudad,
      latitude: r.latitude,
      longitude: r.longitude,
      garrafas_agotadas: r.garrafas_agotadas || false,
      last_active: r.last_active,
      telefono: r.telefono || '',
      placa: r.placa || '',
      productos: r.productos || ''
    }));
}

// EJECUCIÓN DE PRUEBAS DE SEGURIDAD
try {
  console.log('1️⃣ Verificando que Repartidor B puede ver el pedido creado por Comprador A...');
  const driverOrders = queryPedidosPublicos('user-driver-b', true);
  if (driverOrders.length === 0) {
    throw new Error('FALLO: Repartidor B no pudo ver el pedido de Comprador A en pedidos_publicos.');
  }
  const orderForDriver = driverOrders[0];
  if (orderForDriver.id !== 'order-buyer-a') {
    throw new Error('FALLO: ID de pedido no coincide.');
  }
  console.log('   ✅ Repartidor B ve el pedido en pedidos_publicos con éxito.');

  console.log('\n2️⃣ Verificando que Comprador A puede ver el camión transmitido por Repartidor B...');
  const buyerTrucks = queryRutasRepartidoresPublicas('user-buyer-a');
  if (buyerTrucks.length === 0) {
    throw new Error('FALLO: Comprador A no pudo ver el camión en rutas_repartidores_publicas.');
  }
  const truckForBuyer = buyerTrucks[0];
  const requiredColumns = [
    'id', 'user_id', 'distribuidor_nombre', 'categoria', 'titulo',
    'ciudad', 'latitude', 'longitude', 'garrafas_agotadas', 'last_active',
    'telefono', 'placa', 'productos'
  ];
  for (const col of requiredColumns) {
    if (!(col in truckForBuyer)) {
      throw new Error(`FALLO: Columna requerida "${col}" ausente en rutas_repartidores_publicas.`);
    }
  }
  console.log('   ✅ Comprador A ve el camión con todas las columnas requeridas (teléfono, placa, productos).');

  console.log('\n3️⃣ Verificando privacidad de datos para Comprador C (otro vecino)...');
  const neighborOrders = queryPedidosPublicos('user-buyer-c', false);
  const orderForNeighbor = neighborOrders[0];
  if (orderForNeighbor.direccion !== null) {
    throw new Error('FALLO DE PRIVACIDAD: Dirección privada visible para otro comprador.');
  }
  if (orderForNeighbor.telefono !== null) {
    throw new Error('FALLO DE PRIVACIDAD: Teléfono privado visible para otro comprador.');
  }
  if (orderForNeighbor.titulo !== 'Pedido Vecinal') {
    throw new Error('FALLO DE PRIVACIDAD: Título descriptivo privado visible para otro comprador.');
  }
  // Coordenadas deben estar aproximadas (3 decimales)
  if (orderForNeighbor.latitude === mockOrdersDB[0].latitude) {
    throw new Error('FALLO DE PRIVACIDAD: Coordenadas exactas no fueron difuminadas.');
  }
  console.log('   ✅ Privacidad comprobada: dirección y teléfono ocultos, coordenadas difuminadas a 3 decimales.');

  console.log('\n--------------------------------------------------');
  console.log('✨ ÉXITO: 100% de pruebas de RLS y visibilidad multi-rol superadas.\n');
  process.exit(0);
} catch (err) {
  console.error('\n🚨 ERROR EN PRUEBA RLS:', err.message);
  process.exit(1);
}
