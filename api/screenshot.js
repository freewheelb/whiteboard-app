// api/screenshot.js - Minimal version for debugging
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
    console.log('Screenshot API called - minimal version');
    
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    // For now, just return an error explaining the issue
    return res.status(501).json({ 
      error: 'Screenshot service temporarily unavailable',
      message: 'The screenshot feature is being configured. Please use image upload for now.',
      url: url,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Screenshot API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message 
    });
  }
};
