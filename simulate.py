import requests
import json
import random
import time

SUPABASE_URL = 'https://yxzzfqyehllogzzhdtmc.supabase.co'
SUPABASE_ANON_KEY = 'sb_publishable_wWVQ59Rejod5Oc1X4s_eeQ_ONbXzyi2'

headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': f'Bearer {SUPABASE_ANON_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
}

def get_random_offset():
    return (random.random() - 0.5) * 0.04

def start_simulation():
    print("Iniciando simulación...")

    base_lat = -17.3895
    base_lng = -66.1568

    # 1. Crear 20 pedidos falsos
    pedidos = []
    for i in range(1, 21):
        pedidos.append({
            'cliente_nombre': f'Cliente Sim {i}',
            'whatsapp': f'700000{i:02d}',
            'producto': 'Garrafa GLP 10kg',
            'lat': base_lat + get_random_offset(),
            'lng': base_lng + get_random_offset(),
            'estado': 'buscando',
            'ciudad': 'cochabamba'
        })

    pedidos_result = []
    try:
        res = requests.post(f"{SUPABASE_URL}/rest/v1/pedidos_activos", headers=headers, json=pedidos)
        if res.status_code in (200, 201):
            pedidos_result = res.json()
            print(f"Creados {len(pedidos_result)} pedidos simulados.")
        else:
            print(f"Error creando pedidos: {res.text}")
    except Exception as e:
        print(f"Excepcion creando pedidos: {e}")

    # 2. Crear 5 repartidores
    choferes = []
    for i in range(1, 6):
        choferes.append({
            'nombre_completo': f'Repartidor Sim {i}',
            'telefono_whatsapp': f'6000000{i}',
            'placa': f'SIM-{i}00',
            'lat': base_lat + get_random_offset(),
            'lng': base_lng + get_random_offset(),
            'is_active': True,
            'ciudad': 'cochabamba'
        })

    choferes_result = []
    try:
        res = requests.post(f"{SUPABASE_URL}/rest/v1/choferes_habilitados", headers=headers, json=choferes)
        if res.status_code in (200, 201):
            choferes_result = res.json()
            print(f"Creados {len(choferes_result)} choferes simulados.")
        else:
            print(f"Error creando choferes: {res.text}")
    except Exception as e:
        print(f"Excepcion creando choferes: {e}")

    # 3. Simular movimiento por 5 minutos (12 iteraciones de 25 segundos)
    print("Simulando movimiento...")
    for step in range(12):
        time.sleep(25)
        print(f"Movimiento paso {step + 1}/12...")
        
        for chofer in choferes_result:
            chofer['lat'] += (random.random() - 0.5) * 0.002
            chofer['lng'] += (random.random() - 0.5) * 0.002
            
            try:
                requests.patch(f"{SUPABASE_URL}/rest/v1/choferes_habilitados?id=eq.{chofer['id']}", 
                               headers=headers, 
                               json={'lat': chofer['lat'], 'lng': chofer['lng']})
            except Exception as e:
                pass

    # 4. Borrar todo
    print("Limpiando simulación...")
    for pedido in pedidos_result:
        requests.delete(f"{SUPABASE_URL}/rest/v1/pedidos_activos?id=eq.{pedido['id']}", headers=headers)
    for chofer in choferes_result:
        requests.delete(f"{SUPABASE_URL}/rest/v1/choferes_habilitados?id=eq.{chofer['id']}", headers=headers)
    
    print("Simulación finalizada.")

if __name__ == '__main__':
    start_simulation()
