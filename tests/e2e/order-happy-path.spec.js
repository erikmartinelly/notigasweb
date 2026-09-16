const { test, expect } = require('@playwright/test');

const requiredEnv = [
  'E2E_BUYER_EMAIL',
  'E2E_BUYER_PASSWORD',
  'E2E_DRIVER_EMAIL',
  'E2E_DRIVER_PASSWORD'
];

for (const name of requiredEnv) {
  if (!process.env[name]) {
    throw new Error(`Falta ${name}. El Happy Path E2E usa dos cuentas de prueba dedicadas y no reutiliza credenciales de producción.`);
  }
}

async function loginWithEmail(page, email, password) {
  await page.getByRole('button', { name: /MENÚ/i }).click();
  await page.locator('#btnMenuIngresar').click();
  await page.locator('#btnAuthMethodEmail').click();
  await page.locator('#authEmail').fill(email);
  await page.locator('#authPassword').fill(password);
  await page.locator('#btnEmailAction').click();
  await expect(page.locator('#modalWelcomeAuth')).toBeHidden({ timeout: 20_000 });
}

test('Happy Path: comprador → pedido → realtime → repartidor → entregado', async ({ browser }) => {
  const contextOptions = {
    permissions: ['geolocation'],
    geolocation: { latitude: -12.0464, longitude: -77.0428 }
  };

  const buyerContext = await browser.newContext(contextOptions);
  const driverContext = await browser.newContext(contextOptions);
  const buyer = await buyerContext.newPage();
  const driver = await driverContext.newPage();

  try {
    // 1. Comprador autenticado y creación del pedido mediante la UI.
    await buyer.goto('/');
    await loginWithEmail(buyer, process.env.E2E_BUYER_EMAIL, process.env.E2E_BUYER_PASSWORD);
    await buyer.locator('#btnMainOrder').click();
    await expect(buyer.locator('#modalPedido')).toBeVisible();
    await buyer.locator('#selectCategoria').selectOption('gas');
    await buyer.locator('#auto-event-48').click();

    // El pedido debe aparecer como pedido activo del comprador.
    await expect(buyer.locator('#notigasTripCard')).toContainText(/PENDIENTE|DEMANDA|ESPERANDO/i, { timeout: 20_000 });

    // 2. Repartidor autenticado; abre la bandeja de pedidos disponibles.
    await driver.goto('/');
    await loginWithEmail(driver, process.env.E2E_DRIVER_EMAIL, process.env.E2E_DRIVER_PASSWORD);
    await driver.locator('#auto-event-10').click();
    await expect(driver.locator('#modalDriverOrders')).toBeVisible();

    // El realtime debe entregar el pedido recién creado sin recargar la página.
    const orderCard = driver.locator('#driverOrdersContainer').locator('text=Elegir').first();
    await expect(orderCard).toBeVisible({ timeout: 30_000 });
    await orderCard.click();

    // Confirmación del modal interno de asignación.
    await expect(driver.locator('#confirmModalOverlay')).toBeVisible();
    await driver.locator('#confirmModalAccept').click();

    // 3. El pedido queda asignado al repartidor y debe ofrecer la acción Entregado.
    await expect(driver.locator('#driverOrdersContainer')).toContainText(/Entregado/i, { timeout: 30_000 });
    await driver.locator('#driverOrdersContainer').getByRole('button', { name: /Entregado/i }).click();
    await expect(driver.locator('#confirmModalOverlay')).toBeVisible();
    await driver.locator('#confirmModalAccept').click();

    // 4. El comprador recibe el cambio por Realtime y deja de mostrar el pedido pendiente.
    await expect(buyer.locator('#notigasTripCard')).toContainText(/ENTREGADO|RECIBIDO/i, { timeout: 30_000 });
  } finally {
    await buyerContext.close();
    await driverContext.close();
  }
});
