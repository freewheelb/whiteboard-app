// api/page/[client]/[pageName].js
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

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
    const { client: clientName, pageName } = req.query;
    
    if (!clientName || !pageName) {
      return res.status(400).json({ error: 'Client and page name required' });
    }

    if (req.method === 'GET') {
      // Get all versions of a page
      const result = await pool.query(`
        SELECT p.*, c.name as client_name 
        FROM pages p 
        JOIN clients c ON p.client_id = c.id 
        WHERE c.name = $1 AND p.name = $2 
        ORDER BY p.created_at DESC
      `, [clientName, pageName]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Page not found' });
      }

      // Don't return password hash, but indicate if password exists
      const pages = result.rows.map(page => ({
        ...page,
        password_hash: undefined,
        hasPassword: !!page.password_hash
      }));

      return res.status(200).json(pages);
    }

    if (req.method === 'POST') {
      // Verify password
      const { password } = req.body;

      const result = await pool.query(`
        SELECT password_hash 
        FROM pages p 
        JOIN clients c ON p.client_id = c.id 
        WHERE c.name = $1 AND p.name = $2 
        LIMIT 1
      `, [clientName, pageName]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Page not found' });
      }

      const page = result.rows[0];
      if (!page.password_hash) {
        return res.status(200).json({ success: true });
      }

      const isValid = await bcrypt.compare(password, page.password_hash);
      return res.status(200).json({ success: isValid });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Page Viewer API Error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
