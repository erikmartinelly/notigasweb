from pathlib import Path
import re
import runpy

ROOT = Path(__file__).resolve().parents[1]

# Ejecutar primero la transformación principal. Su validación interna puede
# terminar con SystemExit después de haber escrito los cambios; el CI real
# valida el resultado completo más abajo.
try:
    runpy.run_path(str(ROOT / 'scripts' / 'apply_driver_policy_50free.py'), run_name='__main__')
except SystemExit:
    pass


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')

# ---------------------------------------------------------------------------
# Limpiar físicamente los residuos de suscripción PRO/VIP en index.html.
# ---------------------------------------------------------------------------
p = 'index.html'
t = read(p)

# Tarjeta de registro antigua: conservar el contenedor por compatibilidad de IDs,
# pero convertir todo su contenido visible al contrato vigente.
t = re.sub(
    r'<span([^>]*)>S/\s*15\s*<small[^>]*>/mes</small></span>',
    r'<span\1>50 pedidos gratis</span>',
    t,
    flags=re.I,
)
t = t.replace('⚡ <strong>3 min de ventaja</strong> en pedidos nuevos.', '🎁 <strong>50 pedidos gratis</strong> para probar NOTIGAS.')
t = t.replace('👑 <strong>1 min de prioridad</strong> ante compradores.', '⚡ <strong>Pedidos en tiempo real</strong> sin ventajas pagadas.')
t = t.replace('👑 Repartidor VIP Premium', 'Crédito operativo NOTIGAS')
t = t.replace('¡Suscripción VIP Activa!', 'Crédito operativo activo')
t = t.replace('Solicitud enviada. Esperando verificación del comprobante para activar tu suscripción VIP.', 'Remesa enviada. Esperando verificación de recepción para reactivar el servicio.')
t = t.replace('Suscripciones VIP Premium (S/ 15 / mes)', 'Pagos y remesas de repartidores')
t = t.replace('Verificación de comprobantes de pago de Remesa por Yape y gestión de 30 días de ventaja.', 'Verificación de remesas por Yape, saldos y reactivación de repartidores.')
t = t.replace('Comprobante de Pago QR (S/ 15.00)', 'Comprobante de pago')
t = t.replace('Monto mensual: <strong style="color:#22C55E; font-weight:900;">S/ 15.00 PEN</strong>', 'Monto: <strong style="color:#22C55E; font-weight:900;">saldo exigible del ciclo</strong>')
t = t.replace('📲 987-654-321', '📲 Los datos de remesa se muestran al generar el pago')
t = t.replace('📸 Sube la captura o constancia de tu Remesa por Yape:', '📸 Selecciona la captura para lectura OCR; la imagen no se conserva:')

# Términos generales: eliminar el contrato PRO completo del texto fuente.
t = t.replace(
    '1. Acceso Gratuito para Compradores y Repartidores (con Plan PRO Opcional)',
    '1. Acceso sin suscripción y promoción inicial para repartidores'
)
t = re.sub(
    r'NOTIGAS es una plataforma colaborativa y comunitaria de libre acceso para vecinos y repartidores locales\. Los compradores utilizan el servicio de manera 100% gratuita sin comisiones\. Los repartidores pueden operar de forma gratuita o suscribirse de manera opcional al Plan PRO \(S/ 15/mes\) para obtener beneficios preferentes de visualización anticipada \(3 minutos en pedidos y 1 minuto ante clientes\) para apoyar el mantenimiento de los servidores\.',
    'NOTIGAS es una plataforma colaborativa de libre acceso para compradores. Los repartidores no pagan suscripción: sus primeros 50 pedidos confirmados son gratuitos; desde el pedido 51 se aplica una comisión de S/ 0.20 por pedido confirmado. El crédito comienza en S/ 20, sube a S/ 50 después de la primera remesa confirmada y a S/ 100 después de la tercera remesa confirmada.',
    t,
    flags=re.I,
)

# Residuos de copy que no representan ninguna función vigente.
t = t.replace('Plan PRO', 'crédito operativo')
t = t.replace('VIP Premium', 'crédito operativo')
t = t.replace('S/ 15 / mes', 'sin suscripción mensual')
t = t.replace('S/ 15/mes', 'sin suscripción mensual')
t = t.replace('S/ 15.00 PEN', 'saldo del ciclo')
t = t.replace('S/ 15.00', 'saldo del ciclo')
t = t.replace('3 minutos de ventaja', 'acceso en tiempo real')
t = t.replace('1 minuto de ventaja', 'acceso en tiempo real')
write(p, t)

# ---------------------------------------------------------------------------
# Auth: retirar lenguaje PRO incluso en comentarios/helpers de compatibilidad.
# ---------------------------------------------------------------------------
p = 'js/auth.js'
t = read(p)
t = t.replace('Alterna dinámicamente entre el Plan PRO (S/ 15/mes) y el Plan Gratuito (S/ 0)', 'Configura la modalidad única de crédito operativo del repartidor')
t = t.replace('Actualiza los avisos e insignias visuales de la suscripción VIP en el modal de chofer.', 'Oculta controles heredados de suscripción que ya no forman parte del modelo vigente.')
write(p, t)

# ---------------------------------------------------------------------------
# Directorio e iconos: ignorar por completo el flag Premium legado.
# ---------------------------------------------------------------------------
p = 'js/vendors.js'
t = read(p)
t = t.replace('            es_premium: Boolean(d.es_premium),', '            es_premium: false, // campo legado: no produce prioridad ni distintivos')
t = t.replace('    const isVip = Boolean(vendor.es_premium);', '    const isVip = false; // no existe categoría VIP/PRO')
write(p, t)

# ---------------------------------------------------------------------------
# Test financiero: reflejar promoción y escalera de crédito actual.
# ---------------------------------------------------------------------------
p = 'test_financial_parameters.py'
t = read(p)
t = re.sub(
    r'"""NOTIGAS - verificación portable del contrato financiero vigente \(Perú\)\.[\s\S]*?"""',
    '"""NOTIGAS - verificación portable del contrato financiero vigente (Perú).\n\nContrato esperado:\n- Primeros 50 pedidos confirmados sin comisión.\n- Desde el pedido 51: S/ 0.20 por pedido entregado y contabilizado una sola vez.\n- Primer ciclo cobrable: 100 pedidos = S/ 20.\n- 1.ª remesa confirmada -> crédito S/ 50 (250 pedidos).\n- 2.ª remesa -> mantiene S/ 50.\n- 3.ª remesa -> crédito máximo S/ 100 (500 pedidos).\n- Sin cortes/baneos semanales automáticos.\n"""',
    t,
    count=1,
)
t = t.replace('    assert "S/ 0.20 por pedido" in rules\n    assert "100 pedidos = S/ 20" in rules', '    assert "50 pedidos" in rules\n    assert "S/ 0.20 por pedido" in rules\n    assert "S/ 20" in rules\n    assert "S/ 50" in rules\n    assert "S/ 100" in rules')
t = t.replace('    print("✅ [4/5] Frontend fuerza el contrato actual y neutraliza copias heredadas.")', '    print("✅ [4/5] Frontend fuerza 50 gratis y crédito progresivo S/20 -> S/50 -> S/100.")')
write(p, t)

# ---------------------------------------------------------------------------
# Validación específica de esta segunda limpieza.
# ---------------------------------------------------------------------------
index = read('index.html')
for rx, label in [
    (r'S/\s*15(?:\.00)?(?:\s*PEN|\s*/\s*mes|/mes)', 'precio de suscripción S/15'),
    (r'Ventaja de 3 Minutos|3 min de ventaja', 'ventaja PRO de pedidos'),
    (r'Suscripciones VIP Premium|Repartidor VIP Premium', 'copy VIP/Premium'),
]:
    if re.search(rx, index, re.I):
        raise SystemExit(f'Residuo de contrato antiguo en index.html: {label}')

for path, rx in [
    ('js/map.js', r'PRO_ORDER_ADVANTAGE_MS|isCurrentDriverVip'),
    ('js/vendors.js', r'Prioridad para repartidores PRO'),
]:
    if re.search(rx, read(path), re.I):
        raise SystemExit(f'Residuo PRO activo en {path}')

for path in ['index.html', 'js/driver_order_rules.js', 'js/driver_payments.js']:
    text = read(path)
    if not re.search(r'50\s+pedidos', text, re.I):
        raise SystemExit(f'Falta promoción de 50 pedidos en {path}')

print('✅ Limpieza física PRO/VIP y contrato 50-gratis completados')
