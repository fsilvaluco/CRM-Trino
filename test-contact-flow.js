#!/usr/bin/env node
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 100,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  // Capture console messages and errors
  const consoleMessages = [];
  const pageErrors = [];
  
  page.on('console', msg => {
    consoleMessages.push({
      type: msg.type(),
      text: msg.text(),
      location: msg.location()
    });
  });
  
  page.on('pageerror', error => {
    pageErrors.push({
      message: error.message,
      stack: error.stack
    });
  });

  page.on('requestfailed', request => {
    console.log('❌ Request failed:', request.url(), request.failure().errorText);
  });

  try {
    console.log('🌐 Opening http://localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 10000 });
    
    // Take screenshot of initial page
    await page.screenshot({ path: 'screenshot-01-initial.png', fullPage: true });
    
    const url = page.url();
    const title = await page.title();
    console.log('📄 Current URL:', url);
    console.log('📄 Page title:', title);
    
    // Check if login is required
    const loginForm = await page.$('input[type="password"]');
    if (loginForm) {
      console.log('🔒 Login page detected - app requires authentication');
      const bodyText = await page.evaluate(() => document.body.innerText);
      console.log('Login page content:', bodyText.substring(0, 500));
      await page.screenshot({ path: 'screenshot-login.png', fullPage: true });
      await browser.close();
      return;
    }
    
    // Look for Contactos link
    console.log('\n📋 Looking for Contactos navigation...');
    const contactosLink = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a, button'));
      const contactosLink = links.find(el => 
        el.textContent.includes('Contacto') || 
        el.textContent.includes('Contacts') ||
        el.href?.includes('contacts')
      );
      return contactosLink ? { text: contactosLink.textContent, href: contactosLink.href } : null;
    });
    
    console.log('Contactos link:', contactosLink);
    
    if (!contactosLink) {
      console.log('⚠️  Could not find Contactos navigation link');
      const bodyText = await page.evaluate(() => document.body.innerText);
      console.log('Page content:', bodyText.substring(0, 1000));
      await page.screenshot({ path: 'screenshot-02-no-contactos.png', fullPage: true });
      await browser.close();
      return;
    }
    
    // Navigate to Contactos
    console.log('\n🔗 Navigating to Contactos page...');
    await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a, button'));
      const contactosLink = links.find(el => 
        el.textContent.includes('Contacto') || 
        el.textContent.includes('Contacts')
      );
      if (contactosLink) contactosLink.click();
    });
    
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 5000 }).catch(() => {});
    await page.screenshot({ path: 'screenshot-03-contactos.png', fullPage: true });
    
    // Look for "New Contact" or "Nuevo Contacto" button
    console.log('\n➕ Looking for New Contact button...');
    const newContactButton = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, a'));
      const newButton = buttons.find(el => 
        el.textContent.includes('Nuevo') || 
        el.textContent.includes('New') ||
        el.textContent.includes('Agregar')
      );
      return newButton ? newButton.textContent.trim() : null;
    });
    
    console.log('New contact button:', newContactButton);
    
    if (!newContactButton) {
      console.log('⚠️  Could not find New Contact button');
      const bodyText = await page.evaluate(() => document.body.innerText);
      console.log('Contactos page content:', bodyText.substring(0, 1000));
      await browser.close();
      return;
    }
    
    // Click New Contact button
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, a'));
      const newButton = buttons.find(el => 
        el.textContent.includes('Nuevo') || 
        el.textContent.includes('New')
      );
      if (newButton) newButton.click();
    });
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    await page.screenshot({ path: 'screenshot-04-new-contact-form.png', fullPage: true });
    
    // Check for form fields
    console.log('\n📝 Analyzing contact form...');
    const formFields = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
      return inputs.map(input => ({
        tag: input.tagName,
        type: input.type,
        name: input.name,
        id: input.id,
        placeholder: input.placeholder,
        visible: input.offsetParent !== null
      }));
    });
    
    console.log('Form fields found:', JSON.stringify(formFields, null, 2));
    
    // Try to fill form - Flow 1: Select existing company
    console.log('\n✍️  TEST 1: Creating contact with existing company...');
    
    // Fill name field
    await page.evaluate(() => {
      const nameInput = document.querySelector('input[name="name"], input[placeholder*="nombre"], input[placeholder*="Nombre"]');
      if (nameInput) {
        nameInput.value = 'Test Contact';
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        nameInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    
    // Fill email  
    await page.evaluate(() => {
      const emailInput = document.querySelector('input[type="email"], input[name="email"]');
      if (emailInput) {
        emailInput.value = 'test@example.com';
        emailInput.dispatchEvent(new Event('input', { bubbles: true }));
        emailInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    
    await new Promise(resolve => setTimeout(resolve, 500));
    await page.screenshot({ path: 'screenshot-05-filled-form.png', fullPage: true });
    
    // Look for company select
    console.log('\n🏢 Looking for company selector...');
    const companySelect = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'));
      const companySelect = selects.find(s => 
        s.name?.includes('company') || 
        s.id?.includes('company') ||
        Array.from(s.options).some(opt => opt.textContent.includes('empresa') || opt.textContent.includes('Nueva empresa'))
      );
      
      if (companySelect) {
        const options = Array.from(companySelect.options).map(opt => ({
          value: opt.value,
          text: opt.textContent.trim()
        }));
        return { found: true, options };
      }
      return { found: false };
    });
    
    console.log('Company select:', JSON.stringify(companySelect, null, 2));
    
    if (companySelect.found && companySelect.options.length > 1) {
      // Select first real company (not "Nueva empresa")
      console.log('Selecting existing company...');
      await page.evaluate(() => {
        const selects = Array.from(document.querySelectorAll('select'));
        const companySelect = selects.find(s => 
          s.name?.includes('company') || 
          s.id?.includes('company')
        );
        if (companySelect && companySelect.options.length > 1) {
          companySelect.selectedIndex = 1;
          companySelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      
      await new Promise(resolve => setTimeout(resolve, 500));
      await page.screenshot({ path: 'screenshot-06-company-selected.png', fullPage: true });
    }
    
    // Try to submit
    console.log('\n🚀 Attempting to submit form...');
    const submitResult = await page.evaluate(() => {
      const submitButtons = Array.from(document.querySelectorAll('button[type="submit"], button'));
      const submitBtn = submitButtons.find(btn => 
        btn.textContent.includes('Guardar') || 
        btn.textContent.includes('Save') ||
        btn.textContent.includes('Crear')
      );
      
      if (submitBtn) {
        submitBtn.click();
        return { clicked: true, buttonText: submitBtn.textContent.trim() };
      }
      return { clicked: false };
    });
    
    console.log('Submit result:', submitResult);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    await page.screenshot({ path: 'screenshot-07-after-submit.png', fullPage: true });
    
    // Check for errors in UI
    const uiErrors = await page.evaluate(() => {
      const errorElements = Array.from(document.querySelectorAll('[class*="error"], [class*="Error"], [role="alert"]'));
      return errorElements.map(el => el.textContent.trim()).filter(Boolean);
    });
    
    console.log('\n📊 RESULTS:');
    console.log('='.repeat(60));
    console.log('UI Errors:', uiErrors.length > 0 ? uiErrors : 'None visible');
    console.log('\nConsole Errors:', consoleMessages.filter(m => m.type === 'error').slice(0, 10));
    console.log('\nPage Errors:', pageErrors);
    console.log('='.repeat(60));
    
    // Wait a bit to see final state
    await new Promise(resolve => setTimeout(resolve, 2000));
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
    await page.screenshot({ path: 'screenshot-error.png', fullPage: true });
  } finally {
    console.log('\n✅ Test complete. Screenshots saved. Check screenshot-*.png files.');
    console.log('\nConsole messages summary:');
    consoleMessages.forEach((msg, i) => {
      if (i < 20) {
        console.log(`  [${msg.type}]`, msg.text.substring(0, 200));
      }
    });
    
    await browser.close();
  }
})();
