#!/usr/bin/env node
'use strict';
const fs = require('fs');
const read = (p) => fs.readFileSync(p, 'utf8');
const fail = (m) => { throw new Error(m); };
const has = (p, re, m) => { if (!re.test(read(p))) fail(m); };
const no = (p, re, m) => { if (re.test(read(p))) fail(m); };

try {
  has('js/driver_payments.js', /Yape[\s\S]{0,100}Remesas[\s\S]{0,100}Bolivia/i, 'Falta flujo exclusivo Yape Remesas Bolivia');
  has('js/driver_payments.js', /Método de entrega:/, 'Falta método de entrega visible en las instrucciones');
  has('supabase/migrations/20260916005332_set_yape_mobile_wallet_delivery_method.sql', /metodo_entrega\s*=\s*'Billetera Móvil Yape'/i, 'La configuración no fija Billetera Móvil Yape');
  has('js/driver_payments.js', /p_destinatario_documento/, 'Falta documento del beneficiario en RPC OCR');
  has('js/driver_payments.js', /p_pais_destino/, 'Falta país de destino en RPC OCR');
  has('js/driver_payments.js', /p_canal_pago/, 'Falta canal Yape Remesas en RPC OCR');
  has('js/voucher_ocr.js', /expectedAmount/, 'OCR no usa monto esperado dinámico');
  no('js/voucher_ocr.js', /const esperado = 20/, 'OCR conserva monto fijo S\/20');
  has('js/admin_payment_config.js', /account\.length >= 6[\s\S]{0,80}account\.length <= 20/, 'Admin sigue exigiendo Yape peruano de 9 dígitos');
  const paymentQueue = 'supabase/migrations/20260915041809_preprod_reconcile_payment_contract_rls.sql';
  has(paymentQueue, /destinatario_documento_coincide/, 'Cola admin no expone documento del beneficiario');
  has(paymentQueue, /pais_destino_coincide/, 'Cola admin no expone país de destino');
  has(paymentQueue, /canal_pago_coincide/, 'Cola admin no expone canal de pago');
  has(paymentQueue, /auto_revertido_at/, 'Cola admin no expone reversión automática');
  console.log('✅ Yape Remesas contract OK');
} catch (err) {
  console.error('❌ Yape Remesas contract:', err.message);
  process.exit(1);
}
