const sql = require('mssql');

const DB_CONFIG = {
    server: 'localhost',
    database: 'tasty',
    user: 'SA',
    password: 'l1nuX0rganisationPillow',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function createAlertLogTable() {
    try {
        console.log('Connecting to database...');
        const pool = await sql.connect(DB_CONFIG);
        console.log('✅ Connection successful!');
        
        console.log('Creating alertLog table...');
        
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='alertLog' AND xtype='U')
            BEGIN
                CREATE TABLE alertLog (
                    id int IDENTITY(1,1) PRIMARY KEY,
                    timestamp datetime NOT NULL,
                    message varchar(500) NOT NULL,
                    url varchar(200) NULL,
                    critical bit NOT NULL DEFAULT 0,
                    success bit NOT NULL DEFAULT 0,
                    reason varchar(100) NULL,
                    sourceIP varchar(50) NULL
                );
                
                CREATE INDEX IX_alertLog_timestamp ON alertLog (timestamp);
                
                PRINT 'alertLog table created successfully';
            END
            ELSE
            BEGIN
                PRINT 'alertLog table already exists';
            END
        `);
        
        console.log('✅ alertLog table ready!');
        
        // Test insert
        console.log('Testing table with sample insert...');
        await pool.request()
            .input('timestamp', sql.DateTime, new Date())
            .input('message', sql.VarChar(500), 'Test alert - table creation successful')
            .input('url', sql.VarChar(200), null)
            .input('critical', sql.Bit, false)
            .input('success', sql.Bit, true)
            .input('reason', sql.VarChar(100), 'test')
            .input('sourceIP', sql.VarChar(50), 'localhost')
            .query(`
                INSERT INTO alertLog (
                    timestamp, message, url, critical, success, reason, sourceIP
                ) VALUES (
                    @timestamp, @message, @url, @critical, @success, @reason, @sourceIP
                )
            `);
        
        console.log('✅ Test insert successful!');
        
        // Check the record
        const result = await pool.request().query('SELECT TOP 1 * FROM alertLog ORDER BY id DESC');
        console.log('Latest record:', result.recordset[0]);
        
        await pool.close();
        console.log('✅ Database setup complete!');
        
    } catch (err) {
        console.error('❌ Error:', err.message);
        console.error('Full error:', err);
    }
}

createAlertLogTable();
