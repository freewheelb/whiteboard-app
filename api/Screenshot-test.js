// api/screenshot-test.js - Simple test version to debug issues
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

  try {
    console.log('Screenshot test API called');
    console.log('Request method:', req.method);
    console.log('Request body:', req.body);
    
    const { url, password, fullPage = true, viewport } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    // Just test the URL cleaning logic first
    let cleanUrl = url.trim();
    
    // Add https:// if no protocol specified
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }
    
    // Handle Squarespace URLs
    const squarespaceMatch = cleanUrl.match(/(https?:\/\/[^\/]+\.squarespace\.com)/);
    if (squarespaceMatch) {
      cleanUrl = squarespaceMatch[1];
      console.log('Cleaned Squarespace URL:', cleanUrl);
    }

    // Validate URL
    try {
      new URL(cleanUrl);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid URL format: ' + cleanUrl });
    }

    console.log('Original URL:', url);
    console.log('Cleaned URL:', cleanUrl);

    // For now, just return success without taking screenshot
    return res.status(200).json({ 
      success: true,
      message: 'URL processing test successful',
      originalUrl: url,
      cleanedUrl: cleanUrl,
      timestamp: new Date().toISOString(),
      note: 'This is a test version - no actual screenshot taken'
    });

  } catch (error) {
    console.error('Test API error:', error);
    return res.status(500).json({ 
      error: 'Test API failed', 
      details: error.message,
      stack: error.stack
    });
  }
};
