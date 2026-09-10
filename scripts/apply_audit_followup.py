#!/usr/bin/env python3
from pathlib import Path
root = Path(__file__).resolve().parents[1]

# promo.js is Peru-only runtime code; no Bolivian country-code compatibility is required.
p = root / 'js' / 'promo.js'
t = p.read_text(encoding='utf-8')
t = t.replace('59170000000', '51900000000')
t = t.replace('+591', '+51')
t = t.replace("startsWith('591')", "startsWith('51')")
t = t.replace("('591' + digitsOnly)", "('51' + digitsOnly)")
t = t.replace('591', '51')
p.write_text(t, encoding='utf-8')

# voucher_ocr.js is parsing-only. Remove documentation that could imply it owns DB writes.
p = root / 'js' / 'voucher_ocr.js'
t = p.read_text(encoding='utf-8')
t = t.replace('ocurre en PostgreSQL mediante rpc_registrar_ocr_pago.', 'ocurre en PostgreSQL mediante el flujo vigente de pagos del repartidor.')
p.write_text(t, encoding='utf-8')

# Current README describes the Peru deployment; Bolivia remains only in historical migrations/git history.
p = root / 'README.md'
t = p.read_text(encoding='utf-8')
start = t.find('### The Origin: Bolivia and the Challenge of State Monopoly')
end = t.find('\n---\n\n## 🛠️ Technology Stack', start)
if start >= 0 and end >= 0:
    current = '''### Current Operating Model: Peru\nNOTIGAS operates in **Peru** as a neighborhood logistics platform for LPG cylinders and other essential deliveries. Buyers publish geolocated requests and independent delivery partners compete on availability, price, coverage, and service.\n\nThe current business model has **no PRO/VIP monthly subscription and no artificial visibility delay**. Driver onboarding is free. The first 20 confirmed orders are commission-free; afterward the platform records a S/ 0.20 commission per confirmed order and allows a credit cycle of up to 100 delivered units before requiring the configured remittance workflow.\n\nThe production architecture uses server-authoritative PostgreSQL RPCs and RLS for assignment, delivery confirmation, accounting, payments, suspensions, and administrative actions.\n'''
    t = t[:start] + current + t[end:]
p.write_text(t, encoding='utf-8')

print('Residual legacy markers cleaned')
