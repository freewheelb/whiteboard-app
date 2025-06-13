// api/index.js - Main API file for Vercel deployment
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

// Main handler function
module.exports = async (req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  // Add CORS headers to all responses
  Object.keys(corsHeaders).forEach(key => {
    res.setHeader(key, corsHeaders[key]);
  });

  const { method, url } = req;
  const urlParts = url.split('/').filter(part => part && part !== 'api');
  const endpoint = urlParts[0];

  try {
    switch (endpoint) {
      case 'clients':
        return await handleClients(req, res, urlParts);
      case 'pages':
        return await handlePages(req, res, urlParts);
      case 'comments':
        return await handleComments(req, res, urlParts);
      case 'drawings':
        return await handleDrawings(req, res, urlParts);
      case 'page':
        return await handlePageViewer(req, res, urlParts);
      case 'test':
        return await handleTest(req, res);
      default:
        return res.status(404).json({ error: 'Endpoint not found' });
    }
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

// Test database connection
async function handleTest(req, res) {
  try {
    const result = await pool.query('SELECT NOW()');
    return res.status(200).json({ 
      success: true, 
      message: 'Database connected successfully',
      timestamp: result.rows[0].now 
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

// Handle clients
async function handleClients(req, res, urlParts) {
  const { method } = req;

  if (method === 'GET') {
    const result = await pool.query('SELECT * FROM clients ORDER BY created_at DESC');
    return res.status(200).json(result.rows);
  }

  if (method === 'POST') {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Client name is required' });
    }

    try {
      const result = await pool.query(
        'INSERT INTO clients (name) VALUES ($1) RETURNING *',
        [name]
      );
      return res.status(201).json(result.rows[0]);
    } catch (error) {
      if (error.code === '23505') { // Unique violation
        return res.status(409).json({ error: 'Client already exists' });
      }
      throw error;
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// Handle pages
async function handlePages(req, res, urlParts) {
  const { method } = req;

  if (method === 'GET') {
    if (urlParts.length === 1) {
      // Get all pages
      const result = await pool.query(`
        SELECT p.*, c.name as client_name 
        FROM pages p 
        JOIN clients c ON p.client_id = c.id 
        ORDER BY p.created_at DESC
      `);
      return res.status(200).json(result.rows);
    } else if (urlParts.length === 2) {
      // Get pages for specific client
      const clientName = urlParts[1];
      const result = await pool.query(`
        SELECT p.*, c.name as client_name 
        FROM pages p 
        JOIN clients c ON p.client_id = c.id 
        WHERE c.name = $1 
        ORDER BY p.created_at DESC
      `, [clientName]);
      return res.status(200).json(result.rows);
    }
  }

  if (method === 'POST') {
    const { clientName, pageName, version, password, imageData } = req.body;
    
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

    // Hash password if provided
    let passwordHash = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    try {
      const result = await pool.query(
        'INSERT INTO pages (client_id, name, version, password_hash, image_data) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [clientId, pageName, version, passwordHash, imageData]
      );
      return res.status(201).json(result.rows[0]);
    } catch (error) {
      if (error.code === '23505') { // Unique violation
        return res.status(409).json({ error: 'Page version already exists' });
      }
      throw error;
    }
  }

  if (method === 'DELETE' && urlParts.length === 2) {
    const pageId = urlParts[1];
    await pool.query('DELETE FROM pages WHERE id = $1', [pageId]);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// Handle page viewer (public access)
async function handlePageViewer(req, res, urlParts) {
  const { method } = req;

  if (method === 'GET' && urlParts.length === 3) {
    // GET /page/{client}/{pageName}
    const [, clientName, pageName] = urlParts;
    
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

    // Don't return password hash in response
    const pages = result.rows.map(page => ({
      ...page,
      password_hash: undefined,
      hasPassword: !!page.password_hash
    }));

    return res.status(200).json(pages);
  }

  if (method === 'POST' && urlParts.length === 3) {
    // POST /page/{client}/{pageName} - Verify password
    const [, clientName, pageName] = urlParts;
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
}

// Handle comments
async function handleComments(req, res, urlParts) {
  const { method } = req;

  if (method === 'GET' && urlParts.length === 2) {
    // Get comments for a page
    const pageId = urlParts[1];
    const result = await pool.query(
      'SELECT * FROM comments WHERE page_id = $1 ORDER BY created_at DESC',
      [pageId]
    );
    return res.status(200).json(result.rows);
  }

  if (method === 'POST') {
    const { pageId, xPosition, yPosition, commenterName, commentText } = req.body;
    
    if (!pageId || !commenterName || !commentText || xPosition === undefined || yPosition === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await pool.query(
      'INSERT INTO comments (page_id, x_position, y_position, commenter_name, comment_text) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [pageId, xPosition, yPosition, commenterName, commentText]
    );
    return res.status(201).json(result.rows[0]);
  }

  if (method === 'PUT' && urlParts.length === 2) {
    // Update comment
    const commentId = urlParts[1];
    const { commenterName, commentText } = req.body;

    const result = await pool.query(
      'UPDATE comments SET commenter_name = $1, comment_text = $2 WHERE id = $3 RETURNING *',
      [commenterName, commentText, commentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    return res.status(200).json(result.rows[0]);
  }

  if (method === 'DELETE' && urlParts.length === 2) {
    // Delete comment
    const commentId = urlParts[1];
    await pool.query('DELETE FROM comments WHERE id = $1', [commentId]);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// Handle drawings
async function handleDrawings(req, res, urlParts) {
  const { method } = req;

  if (method === 'GET' && urlParts.length === 2) {
    // Get drawing for a page
    const pageId = urlParts[1];
    const result = await pool.query(
      'SELECT * FROM drawings WHERE page_id = $1 ORDER BY created_at DESC LIMIT 1',
      [pageId]
    );
    return res.status(200).json(result.rows[0] || null);
  }

  if (method === 'POST') {
    const { pageId, drawingData } = req.body;
    
    if (!pageId || !drawingData) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Delete existing drawing for this page
    await pool.query('DELETE FROM drawings WHERE page_id = $1', [pageId]);

    // Insert new drawing
    const result = await pool.query(
      'INSERT INTO drawings (page_id, drawing_data) VALUES ($1, $2) RETURNING *',
      [pageId, drawingData]
    );
    return res.status(201).json(result.rows[0]);
  }

  if (method === 'DELETE' && urlParts.length === 2) {
    // Delete drawing
    const pageId = urlParts[1];
    await pool.query('DELETE FROM drawings WHERE page_id = $1', [pageId]);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
