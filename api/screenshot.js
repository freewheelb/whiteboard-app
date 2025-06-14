// api/screenshot.js - Screenshot API endpoint for Vercel
const playwright = require('playwright-aws-lambda');

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

    // Launch browser
    browser = await playwright.launchChromium({ 
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920x1080',
        '--disable-features=VizDisplayCompositor'
      ]
    });

    const context = await browser.newContext({
      viewport: viewport || { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();

    // Navigate to the page first
    console.log('Navigating to URL...');
    await page.goto(cleanUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });

    // Check for Squarespace password protection
    const hasPasswordForm = await page.$('.password-page, input[name="password"], #passwordField');
    
    if (hasPasswordForm && password) {
      console.log('Found password form, attempting to authenticate...');
      
      try {
        // Try different Squarespace password field selectors
        const passwordSelectors = [
          'input[name="password"]',
          '#passwordField',
          'input[type="password"]',
          '.password-input'
        ];
        
        let passwordField = null;
        for (const selector of passwordSelectors) {
          passwordField = await page.$(selector);
          if (passwordField) break;
        }
        
        if (passwordField) {
          await passwordField.fill(password);
          
          // Look for submit button
          const submitSelectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            '.password-submit',
            'button:has-text("Enter")',
            'button:has-text("Submit")'
          ];
          
          let submitButton = null;
          for (const selector of submitSelectors) {
            submitButton = await page.$(selector);
            if (submitButton) break;
          }
          
          if (submitButton) {
            await submitButton.click();
            // Wait for navigation after password submission
            await page.waitForLoadState('networkidle', { timeout: 10000 });
          } else {
            // Try pressing Enter on password field
            await passwordField.press('Enter');
            await page.waitForLoadState('networkidle', { timeout: 10000 });
          }
        }
      } catch (authError) {
        console.warn('Password authentication failed:', authError.message);
        // Continue anyway - might still get some content
      }
    } else if (hasPasswordForm && !password) {
      return res.status(401).json({ 
        error: 'Password required', 
        message: 'This site is password protected. Please provide the password.' 
      });
    }

    // Wait for page to load and remove blocking elements
    await page.waitForTimeout(3000);

    // Remove common blocking elements and improve screenshot quality
    await page.addStyleTag({
      content: `
        /* Hide common cookie banners and popups */
        [class*="cookie" i]:not([class*="cookie-policy" i]), 
        [id*="cookie" i]:not([id*="cookie-policy" i]), 
        [class*="gdpr" i], [id*="gdpr" i],
        [class*="popup" i], [id*="popup" i],
        [class*="modal" i]:not(.whiteboard-modal), 
        [id*="modal" i]:not(#whiteboard-modal),
        [class*="overlay" i]:not(.whiteboard-overlay), 
        [id*="overlay" i]:not(#whiteboard-overlay),
        .sqs-modal-lightbox,
        .password-page,
        #siteWrapper.password-protected-page,
        .sqs-announcement-bar {
          display: none !important;
        }
        
        /* Hide ads */
        [class*="ad" i]:not([class*="head" i]):not([class*="read" i]), 
        [id*="ad" i]:not([id*="head" i]):not([id*="read" i]),
        [class*="advertisement" i],
        iframe[src*="doubleclick"],
        iframe[src*="googlesyndication"],
        .google-ad,
        .adsense {
          display: none !important;
        }
        
        /* Improve text rendering */
        * {
          -webkit-font-smoothing: antialiased !important;
          -moz-osx-font-smoothing: grayscale !important;
        }
        
        /* Ensure page is fully visible */
        body, html {
          overflow-x: visible !important;
        }
      `
    });

    // Additional wait for dynamic content
    await page.waitForTimeout(2000);

    // Take screenshot
    console.log('Capturing screenshot...');
    const screenshot = await page.screenshot({ 
      type: 'png',
      fullPage: fullPage,
      quality: 90,
      animations: 'disabled'
    });

    // Convert to base64 for database storage
    const base64Screenshot = `data:image/png;base64,${screenshot.toString('base64')}`;

    console.log('Screenshot captured successfully, size:', (base64Screenshot.length / 1024 / 1024).toFixed(2), 'MB');

    res.status(200).json({ 
      success: true,
      imageData: base64Screenshot,
      originalUrl: url,
      cleanedUrl: cleanUrl,
      timestamp: new Date().toISOString(),
      size: Math.round(base64Screenshot.length / 1024) + ' KB'
    });

  } catch (error) {
    console.error('Screenshot error:', error);
    res.status(500).json({ 
      error: 'Failed to capture screenshot', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
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
