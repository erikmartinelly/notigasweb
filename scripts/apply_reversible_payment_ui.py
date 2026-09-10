from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def read(path):
    return (ROOT / path).read_text(encoding='utf-8')

def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')

# --- admin_payments.js ---
p = 'js/admin_payments.js'
t = read(p)
repls = {
    "fraude_confirmado: ['#DC2626', 'Fraude confirmado · baneado'],": "fraude_confirmado: ['#DC2626', 'Comprobante observado · cuenta suspendida'],",
    "showLoadingOverlay('Aplicando baneo por fraude...');": "showLoadingOverlay('Suspendiendo cuenta por comprobante observado...');",
    "showToast('Repartidor baneado', data?.mensaje || 'Baneo permanente aplicado por fraude.', 'error', 5500);": "showToast('Cuenta suspendida', data?.mensaje || 'La cuenta quedó suspendida hasta que se verifique el pago total.', 'warning', 5500);",
    "showToast('Error', err.message || 'No se pudo aplicar el baneo.', 'error', 4500);": "showToast('Error', err.message || 'No se pudo suspender la cuenta.', 'error', 4500);",
    "const text = 'Esta acción marcará el pago como fraude y bloqueará la cuenta y los identificadores asociados. Un pago posterior no levantará este baneo.';": "const text = 'Esta acción marca el comprobante como observado y suspende temporalmente la cuenta. Si posteriormente se verifica el pago total adeudado, el repartidor se reactiva.';",
    "showConfirmModal('⛔', 'Banear por comprobante falsificado', text, 'Banear por fraude', ejecutar);": "showConfirmModal('⚠️', 'Suspender por comprobante observado', text, 'Suspender temporalmente', ejecutar);",
    ">⛔ Banear por fraude</button>": ">⚠️ Suspender por comprobante observado</button>",
    ">Fraudes baneados</div>": ">Comprobantes observados</div>",
}
for old, new in repls.items():
    t = t.replace(old, new)
write(p, t)

# --- index.html: términos financieros ---
p = 'index.html'
t = read(p)
t = t.replace(
    '<strong>Suspensión y fraude:</strong> La falta de remesa produce una suspensión por saldo pendiente, no un baneo permanente. El baneo permanente se reserva para fraude, comprobantes falsificados u otros incumplimientos graves verificados.',
    '<strong>Suspensión por saldo pendiente:</strong> La falta de remesa produce una suspensión temporal. Cuando administración verifica el pago total adeudado, la cuenta del repartidor se reactiva automáticamente. No existen baneos financieros definitivos.'
)
t = re.sub(
    r'<strong>Política Antifraude:</strong>.*?</li>',
    '<strong>Comprobantes observados:</strong> Un comprobante rechazado o manipulado puede suspender temporalmente la cuenta mientras exista saldo pendiente. Si posteriormente se verifica la llegada efectiva del pago total, se elimina la suspensión financiera y el repartidor vuelve a estar habilitado.</li>',
    t,
    count=1,
    flags=re.I | re.S,
)
# Cache bust para que el cambio sea visible inmediatamente.
t = t.replace('?v=132', '?v=133')
write(p, t)

# --- sw.js ---
p = 'sw.js'
t = read(p).replace('v132', 'v133')
write(p, t)

# --- check_audit_hardening.js ---
p = 'scripts/check_audit_hardening.js'
t = read(p)
t = t.replace("uniqueHtmlVersions[0] !== '132'", "uniqueHtmlVersions[0] !== '133'")
t = t.replace("notigas-cache-v132", "notigas-cache-v133")
t = t.replace(
    "'20260910225938_driver_50_free_and_progressive_credit_tiers.sql'",
    "'20260910225938_driver_50_free_and_progressive_credit_tiers.sql',\n    '20260910234110_make_payment_suspensions_reversible_on_full_payment.sql'"
)
marker = "  const tier = read('supabase/migrations/20260910225938_driver_50_free_and_progressive_credit_tiers.sql');"
insert = "  assertNo('js/admin_payments.js', /baneo permanente|Un pago posterior no levantará este baneo|Fraudes baneados/i, 'Panel de pagos conserva baneo financiero definitivo');\n  assertHas('js/admin_payments.js', /se verifica el pago total adeudado[\\s\\S]{0,80}se reactiva/i, 'Panel no explica reactivación tras pago total');\n  assertHas('index.html', /No existen baneos financieros definitivos/i, 'Términos no declaran la reversibilidad financiera');\n\n  const reversible = read('supabase/migrations/20260910234110_make_payment_suspensions_reversible_on_full_payment.sql');\n  if (!/estado_servicio = 'suspendido_mora'/.test(reversible)) fail('La mora no usa suspensión reversible');\n  if (!/WHEN v_full_payment THEN 'activo'/.test(reversible)) fail('El pago total no reactiva al repartidor');\n  if (!/permanente, false/.test(reversible)) fail('Comprobante observado aún podría generar baneo permanente');\n  if (!/'auto_aprobado', false/.test(reversible)) fail('El OCR legado aún podría aprobar pagos sin revisión administrativa');\n\n"
if marker in t and insert not in t:
    t = t.replace(marker, insert + marker)
write(p, t)

# --- test_financial_parameters.py ---
p = 'test_financial_parameters.py'
t = read(p)
anchor = '    rules = read("js/driver_order_rules.js")\n'
block = '''    reversible = read("supabase/migrations/20260910234110_make_payment_suspensions_reversible_on_full_payment.sql")\n    assert "estado_servicio = 'suspendido_mora'" in reversible\n    assert "WHEN v_full_payment THEN 'activo'" in reversible\n    assert "'reactivado', (v_full_payment AND NOT v_admin_ban)" in reversible\n    assert "'auto_aprobado', false" in reversible\n    assert "'fraude_comprobante', false" in reversible\n    print("✅ Suspensiones financieras reversibles: pago total verificado reactiva la cuenta.")\n\n'''
if anchor in t and block not in t:
    t = t.replace(anchor, block + anchor)
write(p, t)

print('reversible payment UI policy applied')
