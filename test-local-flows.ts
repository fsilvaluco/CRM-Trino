import { chromium, Browser, Page } from 'playwright';

interface TestResult {
  step: string;
  success: boolean;
  error?: string;
  screenshot?: string;
  consoleErrors: string[];
  networkErrors: string[];
}

async function testLocalApp() {
  let browser: Browser | null = null;
  let page: Page | null = null;
  const results: TestResult[] = [];
  const consoleErrors: string[] = [];
  const networkErrors: string[] = [];

  try {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();

    // Capture console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(`[Console Error] ${msg.text()}`);
      }
    });

    // Capture network failures
    page.on('response', response => {
      if (response.status() >= 400) {
        networkErrors.push(`[${response.status()}] ${response.url()}`);
      }
    });

    // Capture uncaught exceptions
    page.on('pageerror', error => {
      consoleErrors.push(`[Uncaught Exception] ${error.message}`);
    });

    console.log('🚀 Step 1: Opening http://localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000); // Allow React to hydrate
    
    const currentUrl = page.url();
    await page.screenshot({ path: 'screenshot-initial.png', fullPage: true });
    
    console.log(`   Current URL: ${currentUrl}`);

    // Step 2: Check if on login page
    if (currentUrl.includes('/login') || currentUrl.endsWith('/login')) {
      console.log('❌ Still on /login page - browser automation context does not share manual session');
      results.push({
        step: 'Session Check',
        success: false,
        error: 'Browser on /login - no shared session with manual login',
        screenshot: 'screenshot-initial.png',
        consoleErrors: [...consoleErrors],
        networkErrors: [...networkErrors]
      });
      return results;
    }

    results.push({
      step: 'Session Check',
      success: true,
      screenshot: 'screenshot-initial.png',
      consoleErrors: [...consoleErrors],
      networkErrors: [...networkErrors]
    });

    console.log('✅ Session active - inside app');

    // Step 3: Navigate to Contactos
    console.log('\n🚀 Step 3: Navigating to Contactos...');
    const contactsLink = page.locator('text=/contactos/i').first();
    
    if (await contactsLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await contactsLink.click();
      await page.waitForURL('**/contactos**', { timeout: 10000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: 'screenshot-contactos.png', fullPage: true });
      console.log('✅ Navigated to Contactos');
    } else {
      // Try alternative selector
      await page.goto('http://localhost:3000/contactos', { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: 'screenshot-contactos.png', fullPage: true });
      console.log('✅ Navigated to Contactos via URL');
    }

    results.push({
      step: 'Navigate to Contactos',
      success: true,
      screenshot: 'screenshot-contactos.png',
      consoleErrors: [...consoleErrors],
      networkErrors: [...networkErrors]
    });

    // Step 4: Open 'Nuevo Contacto'
    console.log('\n🚀 Step 4: Opening Nuevo Contacto...');
    const newContactButton = page.locator('button:has-text("Nuevo Contacto"), button:has-text("Nuevo contacto"), a:has-text("Nuevo Contacto")').first();
    
    if (await newContactButton.isVisible({ timeout: 5000 })) {
      await newContactButton.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'screenshot-new-contact-form.png', fullPage: true });
      console.log('✅ Opened Nuevo Contacto form');
    } else {
      throw new Error('Could not find Nuevo Contacto button');
    }

    results.push({
      step: 'Open Nuevo Contacto',
      success: true,
      screenshot: 'screenshot-new-contact-form.png',
      consoleErrors: [...consoleErrors],
      networkErrors: [...networkErrors]
    });

    // Step 5a: Test existing company flow
    console.log('\n🚀 Step 5a: Testing existing company flow...');
    const consoleErrorsBefore5a = [...consoleErrors];
    const networkErrorsBefore5a = [...networkErrors];

    const nameInput = page.locator('input[name="name"], input[placeholder*="nombre" i]').first();
    const emailInput = page.locator('input[name="email"], input[type="email"]').first();
    const companySelect = page.locator('select[name="company_id"], select[name="company"]').first();

    await nameInput.fill('Test Contact Existing Company');
    await emailInput.fill(`test-existing-${Date.now()}@example.com`);
    
    const companyOptions = await companySelect.locator('option').allTextContents();
    console.log(`   Found ${companyOptions.length} company options`);
    
    if (companyOptions.length > 1) {
      await companySelect.selectOption({ index: 1 }); // Select first real company (skip empty/default)
      await page.waitForTimeout(500);
      
      await page.screenshot({ path: 'screenshot-filled-existing-company.png', fullPage: true });
      
      const submitButton = page.locator('button[type="submit"], button:has-text("Guardar"), button:has-text("Crear")').first();
      await submitButton.click();
      await page.waitForTimeout(3000);
      
      await page.screenshot({ path: 'screenshot-after-submit-existing.png', fullPage: true });
      
      const newConsoleErrors = consoleErrors.filter(e => !consoleErrorsBefore5a.includes(e));
      const newNetworkErrors = networkErrors.filter(e => !networkErrorsBefore5a.includes(e));
      
      results.push({
        step: 'Submit with Existing Company',
        success: newConsoleErrors.length === 0 && newNetworkErrors.length === 0,
        error: newConsoleErrors.length > 0 || newNetworkErrors.length > 0 ? 'Errors detected' : undefined,
        screenshot: 'screenshot-after-submit-existing.png',
        consoleErrors: newConsoleErrors,
        networkErrors: newNetworkErrors
      });
      
      console.log(newConsoleErrors.length === 0 && newNetworkErrors.length === 0 ? '✅ Existing company flow completed' : '❌ Errors detected in existing company flow');
    } else {
      results.push({
        step: 'Submit with Existing Company',
        success: false,
        error: 'No existing companies available to select',
        screenshot: 'screenshot-filled-existing-company.png',
        consoleErrors: [],
        networkErrors: []
      });
    }

    // Step 5b: Test new company flow
    console.log('\n🚀 Step 5b: Testing new company flow...');
    
    // Re-open form if closed
    const formVisible = await nameInput.isVisible({ timeout: 2000 }).catch(() => false);
    if (!formVisible) {
      const reopenButton = page.locator('button:has-text("Nuevo Contacto"), button:has-text("Nuevo contacto")').first();
      if (await reopenButton.isVisible({ timeout: 5000 })) {
        await reopenButton.click();
        await page.waitForTimeout(2000);
      }
    }

    const consoleErrorsBefore5b = [...consoleErrors];
    const networkErrorsBefore5b = [...networkErrors];

    await nameInput.fill('Test Contact New Company');
    await emailInput.fill(`test-new-${Date.now()}@example.com`);
    
    const newCompanyOption = page.locator('select[name="company_id"] option:has-text("+ Nueva empresa"), select[name="company"] option:has-text("+ Nueva")').first();
    
    if (await newCompanyOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await companySelect.selectOption({ label: /Nueva empresa/i });
      await page.waitForTimeout(1000);
      
      const companyNameInput = page.locator('input[name="company_name"], input[placeholder*="empresa" i]').first();
      
      if (await companyNameInput.isVisible({ timeout: 2000 })) {
        await companyNameInput.fill(`New Test Company ${Date.now()}`);
        await page.waitForTimeout(500);
        
        await page.screenshot({ path: 'screenshot-filled-new-company.png', fullPage: true });
        
        const submitButton = page.locator('button[type="submit"], button:has-text("Guardar"), button:has-text("Crear")').first();
        await submitButton.click();
        await page.waitForTimeout(3000);
        
        await page.screenshot({ path: 'screenshot-after-submit-new.png', fullPage: true });
        
        const newConsoleErrors = consoleErrors.filter(e => !consoleErrorsBefore5b.includes(e));
        const newNetworkErrors = networkErrors.filter(e => !networkErrorsBefore5b.includes(e));
        
        results.push({
          step: 'Submit with New Company',
          success: newConsoleErrors.length === 0 && newNetworkErrors.length === 0,
          error: newConsoleErrors.length > 0 || newNetworkErrors.length > 0 ? 'Errors detected' : undefined,
          screenshot: 'screenshot-after-submit-new.png',
          consoleErrors: newConsoleErrors,
          networkErrors: newNetworkErrors
        });
        
        console.log(newConsoleErrors.length === 0 && newNetworkErrors.length === 0 ? '✅ New company flow completed' : '❌ Errors detected in new company flow');
      } else {
        results.push({
          step: 'Submit with New Company',
          success: false,
          error: 'Company name input did not appear after selecting "+ Nueva empresa"',
          screenshot: 'screenshot-filled-new-company.png',
          consoleErrors: [],
          networkErrors: []
        });
      }
    } else {
      results.push({
        step: 'Submit with New Company',
        success: false,
        error: 'Could not find "+ Nueva empresa" option in company select',
        screenshot: 'screenshot-filled-new-company.png',
        consoleErrors: [],
        networkErrors: []
      });
    }

  } catch (error: any) {
    console.error('❌ Test failed with error:', error.message);
    if (page) {
      await page.screenshot({ path: 'screenshot-error.png', fullPage: true });
    }
    results.push({
      step: 'Test Execution',
      success: false,
      error: error.message,
      screenshot: 'screenshot-error.png',
      consoleErrors: [...consoleErrors],
      networkErrors: [...networkErrors]
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  return results;
}

// Run test and print report
testLocalApp().then(results => {
  console.log('\n' + '='.repeat(80));
  console.log('📊 TEST REPORT');
  console.log('='.repeat(80));
  
  results.forEach((result, index) => {
    console.log(`\n${index + 1}. ${result.step}: ${result.success ? '✅ PASS' : '❌ FAIL'}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    if (result.screenshot) {
      console.log(`   Screenshot: ${result.screenshot}`);
    }
    if (result.consoleErrors.length > 0) {
      console.log(`   Console Errors (${result.consoleErrors.length}):`);
      result.consoleErrors.forEach(err => console.log(`     - ${err}`));
    }
    if (result.networkErrors.length > 0) {
      console.log(`   Network Errors (${result.networkErrors.length}):`);
      result.networkErrors.forEach(err => console.log(`     - ${err}`));
    }
  });
  
  const passCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  
  console.log('\n' + '='.repeat(80));
  console.log(`Total: ${results.length} steps | ✅ ${passCount} passed | ❌ ${failCount} failed`);
  console.log('='.repeat(80));
  
  process.exit(failCount > 0 ? 1 : 0);
});
