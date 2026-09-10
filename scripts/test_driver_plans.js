'use strict';
const assert = require('assert');

const FREE_ORDERS = 50;
const FEE = 0.20;
const creditForRemittances = (count) => count >= 3 ? 100 : (count >= 1 ? 50 : 20);
const orderLimit = (credit) => Math.round(credit / FEE);

assert.strictEqual(FREE_ORDERS, 50);
assert.strictEqual(orderLimit(creditForRemittances(0)), 100);
assert.strictEqual(creditForRemittances(1), 50);
assert.strictEqual(orderLimit(creditForRemittances(1)), 250);
assert.strictEqual(creditForRemittances(2), 50);
assert.strictEqual(orderLimit(creditForRemittances(2)), 250);
assert.strictEqual(creditForRemittances(3), 100);
assert.strictEqual(orderLimit(creditForRemittances(3)), 500);
assert.strictEqual(creditForRemittances(99), 100);

console.log('✅ Política de repartidor: 50 gratis; S/0.20; crédito S/20 -> S/50 -> S/100');
