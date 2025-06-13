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
        const { id } = req.query;
        
        if (!id) {
            return res.status(400).json({ error: 'Page ID is required' });
        }

        if (req.method === 'DELETE') {
            // First delete related comments and drawings
            await pool.query('DELETE FROM comments WHERE page_id = $1', [id]);
            await pool.query('DELETE FROM drawings WHERE page_id = $1', [id]);
            
            // Then delete the page
            const result = await pool.query('DELETE FROM pages WHERE id = $1 RETURNING *', [id]);
            
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Page not found' });
            }

            return res.status(200).json({ 
                success: true, 
                message: 'Page deleted successfully',
                deletedPage: result.rows[0]
            });
        }

        if (req.method === 'GET') {
            // Get specific page details
            const result = await pool.query(`
                SELECT p.*, c.name as client_name 
                FROM pages p 
                JOIN clients c ON p.client_id = c.id 
                WHERE p.id = $1
            `, [id]);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Page not found' });
            }

            return res.status(200).json(result.rows[0]);
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error('Page API Error:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
};
