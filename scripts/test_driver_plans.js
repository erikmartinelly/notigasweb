'use strict';
const assert = require('assert');

const FREE_ORDERS = 100;
const FEE = 0.20;
const creditForRemittances = () => 50;
const orderLimit = (credit) => Math.round(credit / FEE);

assert.strictEqual(FREE_ORDERS, 100);
assert.strictEqual(orderLimit(creditForRemittances(0)), 250);
assert.strictEqual(creditForRemittances(1), 50);
assert.strictEqual(orderLimit(creditForRemittances(1)), 250);
assert.strictEqual(creditForRemittances(2), 50);
assert.strictEqual(orderLimit(creditForRemittances(2)), 250);
assert.strictEqual(creditForRemittances(3), 50);
assert.strictEqual(orderLimit(creditForRemittances(3)), 250);
assert.strictEqual(creditForRemittances(99), 50);

console.log('✅ Política de repartidor: 100 gratis; S/0.20 por balón; ciclo fijo S/50');
