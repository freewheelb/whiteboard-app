// api/pages.js - Updated to store passwords as plain text
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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
    const { method } = req;

    if (method === 'GET') {
      // Get all pages with client info
      const result = await pool.query(`
        SELECT p.*, c.name as client_name 
        FROM pages p 
        JOIN clients c ON p.client_id = c.id 
        ORDER BY p.created_at DESC
      `);
      return res.status(200).json(result.rows);
    }

    if (method === 'POST') {
      const { clientName, pageName, version, pageUrl, password, imageData } = req.body;
      
      if (!clientName || !pageName || !version || !imageData) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Get or create client
      let clientResult = await pool.query('SELECT id FROM clients WHERE name = $1', [clientName]);
      let clientId;

      if (clientResult.rows.length === 0) {
        clientResult = await pool.query(
          'INSERT INTO clients (name) VALUES ($1) RETURNING id',
          [clientName]
        );
      }
      clientId = clientResult.rows[0].id;

      // Store password as plain text (not hashed) since it's for sharing Squarespace passwords
      const passwordToStore = password || null;

      try {
        const result = await pool.query(
          'INSERT INTO pages (client_id, name, version, page_url, password_hash, image_data) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
          [clientId, pageName, version, pageUrl || null, passwordToStore, imageData]
        );
        return res.status(201).json(result.rows[0]);
      } catch (error) {
        if (error.code === '23505') {
          return res.status(409).json({ error: 'Page version already exists' });
        }
        throw error;
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Pages API Error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
