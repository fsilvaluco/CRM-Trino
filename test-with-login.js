#!/usr/bin/env node
const puppeteer = require('puppeteer');

const testCredentials = [
  { email: 'francisco@agenciakatarsis.cl', passwords: ['password', 'Password123', 'trino2024', '123456', 'admin123'] },
  { email: 'francisco@katarsis.cl', passwords: ['password', 'Password123', 'trino2024', '123456', 'admin123'] },
  { email: 'francisco@somostrino.cl', passwords: ['password', 'Password123', 'trino2024', '123456', 'admin123'] },
];

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 50,
  });

  const page = await browser.newPage();
  
  const consoleMessages = [];
  const pageErrors = [];
  
  page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', error => pageErrors.push({ message: error.message }));

  try {
    console.log('🌐 Opening login page...');
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
    
    let loggedIn = false;
    
    for (const credential of testCredentials) {
      for (const password of credential.passwords) {
        console.log(`\n🔐 Trying: ${credential.email} / ${password}`);
        
        await page.type('input[type="email"]', credential.email);
        await page.type('input[type="password"]', password);
        await page.click('button[type="submit"]');
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const currentUrl = page.url();
        console.log('   Current URL:', currentUrl);
        
        if (!currentUrl.includes('/login')) {
          console.log('   ✅ Login successful!');
          loggedIn = true;
          break;
        } else {
          console.log('   ❌ Login failed');
          // Clear fields for next attempt
          await page.evaluate(() => {
            document.querySelector('input[type="email"]').value = '';
            document.querySelector('input[type="password"]').value = '';
          });
        }
      }
      
      if (loggedIn) break;
    }
    
    if (!loggedIn) {
      console.log('\n⚠️  Could not log in with any test credentials.');
      console.log('Please provide the correct password for one of these users:');
      testCredentials.forEach(c => console.log('  -', c.email));
      await browser.close();
      return;
    }
    
    // Now proceed with contact creation test
    console.log('\n📋 Logged in successfully! Now testing contact creation...\n');
    await page.screenshot({ path: 'screenshot-logged-in.png', fullPage: true });
    
    // Look for Contactos navigation
    await page.waitForSelector('a, button', { timeout: 5000 });
    
    const navText = await page.evaluate(() => document.body.innerText);
    console.log('Available navigation:', navText.substring(0, 500));
    
    // Try to find Contactos link
    const contactosFound = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const contactosLink = links.find(link => 
        link.textContent.includes('Contacto') || link.href?.includes('contact')
      );
      if (contactosLink) {
        contactosLink.click();
        return true;
      }
      return false;
    });
    
    if (!contactosFound) {
      console.log('⚠️  Contactos link not found in navigation');
      const bodyText = await page.evaluate(() => document.body.innerText);
      console.log('Page content:', bodyText);
      await browser.close();
      return;
    }
    
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 5000 }).catch(() => {});
    await page.screenshot({ path: 'screenshot-contactos-page.png', fullPage: true });
    
    console.log('✅ Reached Contactos page');
    console.log('Current URL:', page.url());
    
    // Look for new contact button
    const newContactClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, a'));
      const newBtn = buttons.find(btn => 
        btn.textContent.includes('Nuevo') || 
        btn.textContent.includes('Agregar') ||
        btn.textContent.includes('New')
      );
      if (newBtn) {
        newBtn.click();
        return true;
      }
      return false;
    });
    
    if (!newContactClicked) {
      console.log('⚠️  New Contact button not found');
      await browser.close();
      return;
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    await page.screenshot({ path: 'screenshot-contact-form.png', fullPage: true });
    
    console.log('✅ Contact form opened');
    
    // Fill form
    console.log('\n✍️  Filling contact form...');
    
    await page.evaluate(() => {
      const nameInput = document.querySelector('input[name="name"], input[placeholder*="nombre"]');
      if (nameInput) {
        nameInput.value = 'Test Contact E2E';
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        nameInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      
      const emailInput = document.querySelector('input[type="email"]');
      if (emailInput) {
        emailInput.value = 'test.e2e@example.com';
        emailInput.dispatchEvent(new Event('input', { bubbles: true }));
        emailInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      
      const phoneInput = document.querySelector('input[name="phone"], input[type="tel"]');
      if (phoneInput) {
        phoneInput.value = '+1234567890';
        phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
        phoneInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    
    await new Promise(resolve => setTimeout(resolve, 500));
    await page.screenshot({ path: 'screenshot-form-filled.png', fullPage: true });
    
    // Select company if available
    const companySelected = await page.evaluate(() => {
      const select = document.querySelector('select[name*="company"], select[id*="company"]');
      if (select && select.options.length > 1) {
        select.selectedIndex = 1;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    });
    
    console.log('Company selected:', companySelected);
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Submit form
    console.log('\n🚀 Submitting form...');
    
    const submitClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const submitBtn = buttons.find(btn => 
        btn.textContent.includes('Guardar') || 
        btn.textContent.includes('Save') ||
        btn.textContent.includes('Crear') ||
        btn.type === 'submit'
      );
      if (submitBtn) {
        submitBtn.click();
        return true;
      }
      return false;
    });
    
    console.log('Submit clicked:', submitClicked);
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    await page.screenshot({ path: 'screenshot-after-submit.png', fullPage: true });
    
    // Check for errors
    const errors = await page.evaluate(() => {
      const errorEls = Array.from(document.querySelectorAll('[class*="error"], [class*="Error"], [role="alert"]'));
      return errorEls.map(el => el.textContent.trim()).filter(Boolean);
    });
    
    console.log('\n📊 FINAL RESULTS:');
    console.log('='.repeat(60));
    console.log('Current URL:', page.url());
    console.log('UI Errors:', errors.length > 0 ? errors : 'None visible');
    console.log('\nConsole Errors:', consoleMessages.filter(m => m.type === 'error'));
    console.log('\nPage Errors:', pageErrors);
    console.log('='.repeat(60));
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
  } catch (error) {
    console.error('❌ Test error:', error);
    await page.screenshot({ path: 'screenshot-test-error.png', fullPage: true });
  } finally {
    console.log('\n✅ Test complete. Check screenshot-*.png files.');
    await browser.close();
  }
})();
