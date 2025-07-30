const sql = require('mssql');

const DB_CONFIG = {
    server: '192.168.1.100',
    database: 'tasty',
    user: 'administrator',
    password: 'N3wM4n4g3r!',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function testConnection() {
    try {
        console.log('Testing connection to database "tasty"...');
        console.log('Server:', DB_CONFIG.server);
        console.log('Database:', DB_CONFIG.database);
        console.log('User:', DB_CONFIG.user);
        
        const pool = await sql.connect(DB_CONFIG);
        console.log('✅ Connection successful!');
        
        // Test query
        const result = await pool.request().query('SELECT DB_NAME() as CurrentDatabase');
        console.log('Current database:', result.recordset[0].CurrentDatabase);
        
        // Check if alertLog table exists
        const tableCheck = await pool.request().query(`
            SELECT name FROM sysobjects WHERE name='alertLog' AND xtype='U'
        `);
        
        if (tableCheck.recordset.length > 0) {
            console.log('✅ alertLog table exists');
        } else {
            console.log('❌ alertLog table does not exist');
        }
        
        await pool.close();
        
    } catch (err) {
        console.error('❌ Connection failed:', err.message);
        console.error('Error details:', err);
    }
}

testConnection();
