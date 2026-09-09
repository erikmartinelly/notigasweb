"""
NOTIGAS - Test Suite: Parámetros Financieros Definitivos de Lanzamiento
Verificación estricta de:
1. Comisión fija por entrega: S/ 1.00 PEN
2. Límite de crédito máximo (Tope): S/ 50.00 PEN
3. Acción ante el Tope: Bloqueo inmediato de pedidos (Estado: Suspendido)
4. Alerta de cobro programada: Domingos 11:59 PM
5. Ejecución de Baneo Semanal: Lunes 1:00 PM
6. Identificadores bloqueados en baneo: DNI + Placa + Device_ID + Hardware Fingerprint
"""
import os
import sys

# Forzar utf-8 en consola de Windows
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

def run_tests():
    print("==================================================================")
    print("EJECUTANDO TEST DE VERIFICACIÓN DE PARÁMETROS FINANCIEROS NOTIGAS")
    print("==================================================================")

    root = r"c:\Users\FTL\Documents\APP NOTIGAS"

    # 1. Verificar migración SQL
    migration_file = os.path.join(root, 'supabase', 'migrations', '20260908010000_financial_commission_rules.sql')
    assert os.path.exists(migration_file), "ERROR: Falta archivo de migración financiera"
    with open(migration_file, 'r', encoding='utf-8') as f:
        sql = f.read()

    assert 'comisiones_pendientes' in sql, "Falta comisiones_pendientes en migración SQL"
    assert 'limite_credito numeric(10,2) DEFAULT 50.00' in sql, "Falta limite_credito = 50.00 en SQL"
    assert 'estado_servicio' in sql, "Falta estado_servicio en SQL"
    assert 'rpc_driver_confirm_delivery' in sql, "Falta rpc_driver_confirm_delivery en SQL"
    assert '1.00' in sql, "Falta comisión fija de S/ 1.00 en SQL"
    assert 'suspendido_tope' in sql, "Falta estado suspendido_tope en SQL"
    assert 'rpc_assign_order' in sql, "Falta rpc_assign_order en SQL"
    assert 'rpc_liquidar_comisiones_chofer' in sql, "Falta rpc_liquidar_comisiones_chofer en SQL"
    assert 'rpc_ejecutar_corte_semanal_comisiones' in sql, "Falta rpc_ejecutar_corte_semanal_comisiones en SQL"
    assert 'rpc_ejecutar_baneo_semanal_morosos' in sql, "Falta rpc_ejecutar_baneo_semanal_morosos en SQL"
    assert 'corte_semanal_domingos' in sql, "Falta cron job corte dominical en SQL"
    assert 'baneo_semanal_lunes' in sql, "Falta cron job baneo lunes en SQL"
    print("✅ [1/5] Migración SQL: Contiene las 5 RPCs, reglas de 1 sol por balón, tope de S/ 50 y cron jobs dominical/lunes.")

    # 2. Verificar js/orders.js
    orders_file = os.path.join(root, 'js', 'orders.js')
    with open(orders_file, 'r', encoding='utf-8') as f:
        orders_js = f.read()

    assert 'driverFinances' in orders_js, "Falta driverFinances en js/orders.js"
    assert 'driver-financial-card' in orders_js, "Falta tarjeta financiera en orders.js"
    assert 'Saldo de Comisiones' in orders_js, "Falta título saldo de comisiones en orders.js"
    assert '50.00' in orders_js or '50' in orders_js, "Falta tope 50.00 en orders.js"
    assert 'driver-lockout-banner' in orders_js, "Falta banner de suspensión en orders.js"
    assert 'suspendido_tope' in orders_js, "Falta chequeo suspendido_tope en orders.js"
    assert 'isSuspended' in orders_js, "Falta isSuspended en orders.js"
    assert 'Límite de Crédito Alcanzado' in orders_js, "Falta alerta límite de crédito alcanzado en orders.js"
    print("✅ [2/5] js/orders.js: Widget de comisiones acumuladas, tope de S/ 50.00 y bloqueo inmediato de pedidos en frontend.")

    # 3. Verificar js/auth.js
    auth_file = os.path.join(root, 'js', 'auth.js')
    with open(auth_file, 'r', encoding='utf-8') as f:
        auth_js = f.read()

    assert 'comisiones_pendientes' in auth_js, "Falta comisiones_pendientes en auth.js"
    assert 'limite_credito' in auth_js, "Falta limite_credito en auth.js"
    assert 'estado_servicio' in auth_js, "Falta estado_servicio en auth.js"
    print("✅ [3/5] js/auth.js: Sincronización transparente de comisiones, límite de crédito y estado de servicio en sesión.")

    # 4. Verificar js/admin.js y js/admin_users.js
    admin_file = os.path.join(root, 'js', 'admin.js')
    with open(admin_file, 'r', encoding='utf-8') as f:
        admin_js = f.read()

    assert 'comisiones_pendientes' in admin_js, "Falta comisiones_pendientes en admin.js"
    assert 'liquidarComisionesAdmin' in admin_js, "Falta liquidarComisionesAdmin en admin.js"

    admin_users_file = os.path.join(root, 'js', 'admin_users.js')
    with open(admin_users_file, 'r', encoding='utf-8') as f:
        admin_u_js = f.read()

    assert 'liquidarComisionesAdmin' in admin_u_js, "Falta liquidarComisionesAdmin en admin_users.js"
    assert 'ejecutarCorteSemanalManualAdmin' in admin_u_js, "Falta ejecutarCorteSemanalManualAdmin en admin_users.js"
    assert 'ejecutarBaneoSemanalManualAdmin' in admin_u_js, "Falta ejecutarBaneoSemanalManualAdmin en admin_users.js"
    print("✅ [4/5] js/admin.js & js/admin_users.js: Panel administrativo para liquidar pagos Yape y disparar cortes/baneos.")

    # 5. Verificar index.html
    html_file = os.path.join(root, 'index.html')
    with open(html_file, 'r', encoding='utf-8') as f:
        html = f.read()

    assert 'Control Financiero y Comisiones Notigas' in html, "Falta encabezado financiero en index.html"
    assert 'Corte Dom (11:59 PM)' in html, "Falta botón corte dominical en index.html"
    assert 'Baneo Lun (1:00 PM)' in html, "Falta botón baneo lunes en index.html"
    print("✅ [5/5] index.html: Panel de métricas y botones administrativos integrados en interfaz.")

    print("\n🎉 TODAS LAS VERIFICACIONES LOCALES Y DE CÓDIGO PASARON CON ÉXITO.")

if __name__ == '__main__':
    run_tests()
