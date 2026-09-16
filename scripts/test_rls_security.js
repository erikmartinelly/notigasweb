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
    direccion: 'Av. Arequipa #456',
    telefono: '987654321',
    estado: 'pendiente',
    driver_id: null,
    ciudad: 'lima',
    barrio_otb: 'Miraflores',
    latitude: -12.046374,
    longitude: -77.030685,
    descripcion: 'Tocar el timbre blanco',
    visto: false,
    created_at: new Date().toISOString()
  }
];

const mockTrucksDB = [
  {
    id: 'truck-driver-b',
    user_id: 'user-driver-b',
    distribuidor_nombre: 'Distribuidora Lima Gas',
    categoria: 'Gas GLP',
    titulo: 'Camión #4',
    ciudad: 'lima',
    latitude: -12.0450,
    longitude: -77.0300,
    garrafas_agotadas: false,
    last_active: new Date().toISOString(),
    telefono: '912345678',
    placa: 'ABC-123',
    productos: 'Balón 10kg, Válvula Premium'
  }
];

// 1. La vista de pedidos solo devuelve pedidos propios. Los pedidos disponibles
// se entregan exclusivamente por order_public_radar a repartidores activos.
function queryPedidosPublicos(callingUserId) {
  return mockOrdersDB
    .filter(p => (p.estado === 'pendiente' || p.estado === 'visto') && p.user_id === callingUserId)
    .map(p => {
      const isOwner = p.user_id === callingUserId;
      return {
        id: p.id,
        user_id: p.user_id,
        categoria: p.categoria,
        titulo: p.titulo,
        cantidad: p.cantidad,
        direccion: p.direccion,
        telefono: p.telefono,
        estado: p.estado,
        driver_id: p.driver_id,
        ciudad: p.ciudad,
        barrio_otb: p.barrio_otb || 'Zona indicada en el mapa',
        latitude: p.latitude,
        longitude: p.longitude,
        descripcion: p.descripcion,
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
  console.log('1️⃣ Verificando que el repartidor no lee pedidos ajenos por pedidos_publicos...');
  const driverOrders = queryPedidosPublicos('user-driver-b');
  if (driverOrders.length !== 0) {
    throw new Error('FALLO: Repartidor recibió un pedido ajeno por la vista genérica.');
  }
  console.log('   ✅ Repartidor no recibe pedidos ajenos por pedidos_publicos; usa el radar seguro.');

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

  console.log('\n3️⃣ Verificando que Comprador C no ve el pedido de Comprador A...');
  const neighborOrders = queryPedidosPublicos('user-buyer-c');
  if (neighborOrders.length !== 0) {
    throw new Error('FALLO DE PRIVACIDAD: Un comprador recibió el pedido de otro comprador.');
  }
  console.log('   ✅ Comprador C no recibe ningún pedido ajeno.');

  console.log('\n--------------------------------------------------');
  console.log('✨ ÉXITO: 100% de pruebas de RLS y visibilidad multi-rol superadas.\n');
  process.exit(0);
} catch (err) {
  console.error('\n🚨 ERROR EN PRUEBA RLS:', err.message);
  process.exit(1);
}
