#!/usr/bin/env python3
from pathlib import Path
p = Path(__file__).resolve().parents[1] / 'js' / 'promo.js'
t = p.read_text(encoding='utf-8')
# promo.js is Peru-only runtime code; no Bolivian country-code compatibility is required.
t = t.replace('59170000000', '51900000000')
t = t.replace('+591', '+51')
t = t.replace("startsWith('591')", "startsWith('51')")
t = t.replace("('591' + digitsOnly)", "('51' + digitsOnly)")
t = t.replace('591', '51')
p.write_text(t, encoding='utf-8')
print('Residual Bolivia phone markers removed from promo.js')
