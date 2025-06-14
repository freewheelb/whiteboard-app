// api/screenshot.js - Using Puppeteer + Chromium for Vercel
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

module.exports = async (req, res) => {
  // Add CORS headers
  Object.keys(corsHeaders).forEach(key => {
    res.setHeader(key, corsHeaders[key]);
  });

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let browser = null;
  
  try {
    const { url, password, fullPage = true, viewport } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    // Clean and validate URL - special handling for Squarespace
    let cleanUrl = url.trim();
    
    // Add https:// if no protocol specified
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }
    
    // Handle Squarespace URLs - remove everything after .squarespace.com
    const squarespaceMatch = cleanUrl.match(/(https?:\/\/[^\/]+\.squarespace\.com)/);
    if (squarespaceMatch) {
      cleanUrl = squarespaceMatch[1];
      console.log('Cleaned Squarespace URL:', cleanUrl);
    }

    // Validate URL
    try {
      new URL(cleanUrl);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    console.log('Taking screenshot of:', cleanUrl);

    // Configure Chromium for serverless
    const chromeArgs = [
      ...chromium.args,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ];

    // Launch browser
    browser = await puppeteer.launch({
      args: chromeArgs,
      defaultViewport: viewport || { width: 1920, height: 1080 },
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true
    });

    const page = await browser.newPage();

    // Set user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

    // Navigate to the page
    console.log('Navigating to URL...');
    try {
      await page.goto(cleanUrl, { 
        waitUntil: 'networkidle0',
        timeout: 30000 
      });
    } catch (navError) {
      console.warn('Navigation warning:', navError.message);
      // Try with domcontentloaded instead
      await page.goto(cleanUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
    }

    // Check for password protection
    await page.waitForTimeout(2000);
    
    const hasPasswordForm = await page.evaluate(() => {
      const selectors = [
        '.password-page',
        'input[name="password"]',
        '#passwordField',
        'input[type="password"]'
      ];
      return selectors.some(selector => document.querySelector(selector));
    });
    
    if (hasPasswordForm && password) {
      console.log('Found password form, attempting to authenticate...');
      
      try {
        // Find and fill password field
        const passwordField = await page.$('input[name="password"], #passwordField, input[type="password"]');
        if (passwordField) {
          await passwordField.type(password);
          
          // Try to submit
          const submitButton = await page.$('button[type="submit"], input[type="submit"], .password-submit');
          if (submitButton) {
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {}),
              submitButton.click()
            ]);
          } else {
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {}),
              passwordField.press('Enter')
            ]);
          }
          await page.waitForTimeout(3000);
        }
      } catch (authError) {
        console.warn('Password authentication failed:', authError.message);
      }
    } else if (hasPasswordForm && !password) {
      return res.status(401).json({ 
        error: 'Password required', 
        message: 'This site is password protected. Please provide the password.' 
      });
    }

    // Remove blocking elements
    await page.addStyleTag({
      content: `
        /* Hide common blocking elements */
        [class*="cookie" i]:not([class*="policy" i]), 
        [id*="cookie" i]:not([id*="policy" i]),
        [class*="gdpr" i], [id*="gdpr" i],
        [class*="popup" i], [id*="popup" i],
        [class*="modal" i]:not(.whiteboard-modal),
        [class*="overlay" i]:not(.whiteboard-overlay),
        .sqs-modal-lightbox,
        .password-page,
        .sqs-announcement-bar,
        [class*="ad" i]:not([class*="head" i]):not([class*="read" i]),
        iframe[src*="doubleclick"],
        iframe[src*="googlesyndication"] {
          display: none !important;
        }
        
        /* Improve rendering */
        *, *::before, *::after {
          -webkit-font-smoothing: antialiased !important;
          -moz-osx-font-smoothing: grayscale !important;
        }
        
        body, html {
          overflow-x: visible !important;
        }
      `
    });

    // Wait for content to stabilize
    await page.waitForTimeout(3000);

    // Take screenshot
    console.log('Capturing screenshot...');
    const screenshot = await page.screenshot({ 
      type: 'png',
      fullPage: fullPage,
      quality: 90
    });

    // Convert to base64
    const base64Screenshot = `data:image/png;base64,${screenshot.toString('base64')}`;
    const sizeKB = Math.round(base64Screenshot.length / 1024);
    
    console.log('Screenshot captured successfully, size:', sizeKB, 'KB');

    res.status(200).json({ 
      success: true,
      imageData: base64Screenshot,
      originalUrl: url,
      cleanedUrl: cleanUrl,
      timestamp: new Date().toISOString(),
      size: sizeKB + ' KB'
    });

  } catch (error) {
    console.error('Screenshot error:', error);
    res.status(500).json({ 
      error: 'Failed to capture screenshot', 
      details: error.message
    });
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error('Error closing browser:', closeError);
      }
    }
  }
};
