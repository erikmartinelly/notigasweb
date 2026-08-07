const SUPABASE_URL = 'https://yxzzfqyehllogzzhdtmc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_wWVQ59Rejod5Oc1X4s_eeQ_ONbXzyi2';

const headers = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

function getRandomOffset() {
  return (Math.random() - 0.5) * 0.04;
}

async function startSimulation() {
  console.log("Iniciando simulación...");

  const baseLat = -17.3895;
  const baseLng = -66.1568;

  // 1. Crear 20 pedidos falsos
  const pedidos = [];
  for (let i = 1; i <= 20; i++) {
    pedidos.push({
      cliente_nombre: `Cliente Sim ${i}`,
      whatsapp: `700000${i.toString().padStart(2, '0')}`,
      producto: 'Garrafa GLP 10kg',
      lat: baseLat + getRandomOffset(),
      lng: baseLng + getRandomOffset(),
      estado: 'buscando',
      ciudad: 'cochabamba'
    });
  }

  let pedidosResult;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/pedidos_activos`, {
      method: 'POST',
      headers,
      body: JSON.stringify(pedidos)
    });
    pedidosResult = await res.json();
    console.log(`Creados ${pedidosResult.length} pedidos simulados.`);
  } catch(e) {
    console.error("Error creando pedidos", e);
  }

  // 2. Crear 5 repartidores
  const choferes = [];
  for (let i = 1; i <= 5; i++) {
    choferes.push({
      nombre_completo: `Repartidor Sim ${i}`,
      telefono_whatsapp: `6000000${i}`,
      placa: `SIM-${i}00`,
      lat: baseLat + getRandomOffset(),
      lng: baseLng + getRandomOffset(),
      is_active: true,
      ciudad: 'cochabamba'
    });
  }

  let choferesResult;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/choferes_habilitados`, {
      method: 'POST',
      headers,
      body: JSON.stringify(choferes)
    });
    choferesResult = await res.json();
    console.log(`Creados ${choferesResult.length} choferes simulados.`);
  } catch(e) {
    console.error("Error creando choferes", e);
  }

  // 3. Simular movimiento por 5 minutos (12 iteraciones de 25 segundos)
  console.log("Simulando movimiento...");
  for (let step = 0; step < 12; step++) {
    await new Promise(r => setTimeout(r, 25000));
    console.log(`Movimiento paso ${step + 1}/12...`);
    
    for (const chofer of choferesResult) {
      chofer.lat += (Math.random() - 0.5) * 0.002;
      chofer.lng += (Math.random() - 0.5) * 0.002;
      
      await fetch(`${SUPABASE_URL}/rest/v1/choferes_habilitados?id=eq.${chofer.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ lat: chofer.lat, lng: chofer.lng })
      });
    }
  }

  // 4. Borrar todo
  console.log("Limpiando simulación...");
  for (const pedido of pedidosResult) {
    await fetch(`${SUPABASE_URL}/rest/v1/pedidos_activos?id=eq.${pedido.id}`, { method: 'DELETE', headers });
  }
  for (const chofer of choferesResult) {
    await fetch(`${SUPABASE_URL}/rest/v1/choferes_habilitados?id=eq.${chofer.id}`, { method: 'DELETE', headers });
  }
  
  console.log("Simulación finalizada.");
}

startSimulation();
