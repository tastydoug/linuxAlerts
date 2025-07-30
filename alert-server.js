const express = require('express');
const axios = require('axios');
const cors = require('cors');
const querystring = require('querystring');

// Load environment variables from .env file
require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = ['TASTY_API_AUTH', 'DB_PASSWORD'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
    console.error('Please create a .env file with the required variables or set them in your environment.');
    process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3008;

// Middleware
app.use(express.json());
app.use(cors());

// Logging utility
function log(level, message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
}

// Configuration
const ALERT_CONFIG = {
    enabled: process.env.ALERTS_ENABLED === 'true' || true, // Alerts enabled by default
    workingHoursStart: parseInt(process.env.WORKING_HOURS_START) || 7,
    workingHoursEnd: parseInt(process.env.WORKING_HOURS_END) || 18,
    apiUrl: process.env.TASTY_API_URL || 'https://mobile.tastytrucks.com.au:60052/SendAlert',
    authHeader: process.env.TASTY_API_AUTH,
    retryDelay: parseInt(process.env.ALERT_RETRY_DELAY) || 3000, // 3 seconds delay for critical alerts
    topic: process.env.ALERT_TOPIC || 'IT',
    // Rate limiting configuration
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW) || 30000, // 30 seconds
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX) || 5, // Maximum 5 alerts per window
    throttleMessage: process.env.THROTTLE_MESSAGE || 'Alert rate limit exceeded - throttling alerts',
    // Default alert body when no type is specified
    defaultAlertBody: process.env.DEFAULT_ALERT_BODY || 'System Alert'
};

// Statistics tracking
let stats = {
    startTime: new Date(),
    totalAlerts: 0,
    successfulAlerts: 0,
    failedAlerts: 0,
    criticalAlerts: 0,
    alertsDisabled: 0,
    throttledAlerts: 0
};

// Rate limiting tracking
let rateLimitWindow = [];

// SQL database connection (optional - will fall back to file logging if not available)
let sql = null;
try {
    sql = require('mssql');
} catch (err) {
    log('warn', '📊 SQL Server module not found - using file logging only');
}

// Database configuration
const DB_CONFIG = {
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'tasty',
    user: process.env.DB_USER || 'SA',
    password: process.env.DB_PASSWORD || 'l1nuX0rganisationPillow',
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true' || false,
        trustServerCertificate: process.env.DB_TRUST_CERT !== 'false'
    }
};

// Log alert to database
async function logAlertToDatabase(alertData) {
    if (!sql) return false;
    
    try {
        const pool = await sql.connect(DB_CONFIG);
        
        await pool.request()
            .input('timestamp', sql.DateTime, new Date())
            .input('message', sql.VarChar(500), alertData.message)
            .input('url', sql.VarChar(200), alertData.url || null)
            .input('critical', sql.Bit, alertData.critical)
            .input('success', sql.Bit, alertData.success)
            .input('reason', sql.VarChar(100), alertData.reason || null)
            .input('sourceIP', sql.VarChar(50), alertData.sourceIP || null)
            .query(`
                INSERT INTO alertLog (
                    timestamp, message, url, critical, success, reason, sourceIP
                ) VALUES (
                    @timestamp, @message, @url, @critical, @success, @reason, @sourceIP
                )
            `);
        
        await pool.close();
        return true;
    } catch (err) {
        log('warn', `📊 Database logging failed: ${err.message}`);
        return false;
    }
}

// Create alerts table if it doesn't exist
async function initializeDatabase() {
    if (!sql) return false;
    
    try {
        const pool = await sql.connect(DB_CONFIG);
        
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='alertLog' AND xtype='U')
            CREATE TABLE alertLog (
                id int IDENTITY(1,1) PRIMARY KEY,
                timestamp datetime NOT NULL,
                message varchar(500) NOT NULL,
                url varchar(200) NULL,
                critical bit NOT NULL DEFAULT 0,
                success bit NOT NULL DEFAULT 0,
                reason varchar(100) NULL,
                sourceIP varchar(50) NULL,
                INDEX IX_alertLog_timestamp (timestamp)
            )
        `);
        
        await pool.close();
        log('info', '📊 Database table initialized successfully');
        return true;
    } catch (err) {
        log('warn', `📊 Database initialization failed: ${err.message}`);
        return false;
    }
}

// Check rate limiting
function checkRateLimit() {
    const now = Date.now();
    const windowStart = now - ALERT_CONFIG.rateLimitWindow;
    
    // Remove old entries outside the window
    rateLimitWindow = rateLimitWindow.filter(timestamp => timestamp > windowStart);
    
    // Check if we're at the limit
    if (rateLimitWindow.length >= ALERT_CONFIG.rateLimitMax) {
        return false; // Rate limited
    }
    
    // Add current timestamp
    rateLimitWindow.push(now);
    return true; // Allow
}

// Check if we're in working hours
function isWorkingHours() {
    const hour = new Date().getHours();
    return hour >= ALERT_CONFIG.workingHoursStart && hour <= ALERT_CONFIG.workingHoursEnd;
}

// Function to determine alert body type based on message content or return a smart default
function getAlertBody(message, isCritical, customType = null) {
    // If a custom type is provided, use it directly (capitalized)
    if (customType) {
        return customType.charAt(0).toUpperCase() + customType.slice(1).toLowerCase() + ' Alert';
    }
    
    const lowerMessage = message.toLowerCase();
    
    // Critical alerts always use critical body
    if (isCritical) {
        return 'Critical Alert';
    }
    
    // Check for specific keywords to auto-categorize the alert with smart naming
    if (lowerMessage.includes('device') || lowerMessage.includes('battery') || lowerMessage.includes('round')) {
        return 'Device Alert';
    }
    
    if (lowerMessage.includes('sync') || lowerMessage.includes('synchroniz')) {
        return 'Sync Alert';
    }
    
    if (lowerMessage.includes('health') || lowerMessage.includes('check') || lowerMessage.includes('monitor')) {
        return 'Health Check';
    }
    
    if (lowerMessage.includes('security') || lowerMessage.includes('breach') || lowerMessage.includes('unauthorized')) {
        return 'Security Alert';
    }
    
    if (lowerMessage.includes('warning') || lowerMessage.includes('warn')) {
        return 'Warning';
    }
    
    if (lowerMessage.includes('info') || lowerMessage.includes('information') || lowerMessage.includes('completed') || lowerMessage.includes('successful')) {
        return 'Information';
    }
    
    if (lowerMessage.includes('error') || lowerMessage.includes('fail') || lowerMessage.includes('problem')) {
        return 'Error Alert';
    }
    
    if (lowerMessage.includes('backup') || lowerMessage.includes('restore')) {
        return 'Backup Alert';
    }
    
    if (lowerMessage.includes('network') || lowerMessage.includes('connection')) {
        return 'Network Alert';
    }
    
    if (lowerMessage.includes('database') || lowerMessage.includes('sql')) {
        return 'Database Alert';
    }
    
    // Default to system alert
    return ALERT_CONFIG.defaultAlertBody;
}

// Core alert function based on your snippet
async function sendAlert(message, url = null, isCritical = false, sourceIP = null, alertType = null) {
    stats.totalAlerts++;
    
    if (isCritical) {
        stats.criticalAlerts++;
    }

    // Check rate limiting first
    if (!checkRateLimit()) {
        stats.throttledAlerts++;
        log('warn', `🚫 RATE LIMITED: ${message} (${rateLimitWindow.length}/${ALERT_CONFIG.rateLimitMax} in ${ALERT_CONFIG.rateLimitWindow/1000}s)`);
        
        // Log throttled alert to database
        await logAlertToDatabase({
            message: `[THROTTLED] ${message}`,
            url,
            critical: isCritical,
            success: false,
            reason: 'rate_limited',
            sourceIP
        });
        
        return { success: false, reason: 'rate_limited', message: ALERT_CONFIG.throttleMessage };
    }

    // Check if alerts are enabled
    if (!ALERT_CONFIG.enabled) {
        stats.alertsDisabled++;
        log('warn', `🔕 ALERT (DISABLED): ${message}`);
        
        await logAlertToDatabase({
            message,
            url,
            critical: isCritical,
            success: false,
            reason: 'alerts_disabled',
            sourceIP
        });
        
        return { success: false, reason: 'alerts_disabled', message: 'Alerts are currently disabled' };
    }

    // Check working hours
    if (!isWorkingHours()) {
        log('info', `🕐 ALERT (OUTSIDE HOURS): ${message}`);
        
        await logAlertToDatabase({
            message,
            url,
            critical: isCritical,
            success: false,
            reason: 'outside_hours',
            sourceIP
        });
        
        return { success: false, reason: 'outside_hours', message: 'Outside working hours' };
    }

    // Determine appropriate alert body based on message content or explicit type
    const alertBody = alertType ? getAlertBody(message, isCritical, alertType) : getAlertBody(message, isCritical);

    const params = {
        topic: ALERT_CONFIG.topic,
        body: alertBody,
        content: message,
        keep: 1
    };

    if (url) {
        params.url = url;
    }

    const fullUrl = `${ALERT_CONFIG.apiUrl}?${querystring.stringify(params)}`;

    try {
        // Send first alert
        await axios.post(fullUrl, null, {
            headers: {
                'Authorization': ALERT_CONFIG.authHeader
            },
            timeout: 10000
        });

        log('info', `✅ Alert sent successfully: ${message}`);

        // Log successful alert to database
        await logAlertToDatabase({
            message,
            url,
            critical: isCritical,
            success: true,
            reason: null,
            sourceIP
        });

        // For critical alerts, send a second one after delay to ensure delivery
        if (isCritical) {
            log('info', `⏳ Sending critical alert retry in ${ALERT_CONFIG.retryDelay}ms...`);
            
            setTimeout(async () => {
                try {
                    await axios.post(fullUrl, null, {
                        headers: {
                            'Authorization': ALERT_CONFIG.authHeader
                        },
                        timeout: 10000
                    });
                    log('info', `🔄 Critical alert retry sent successfully: ${message}`);
                    
                    // Log retry success
                    await logAlertToDatabase({
                        message: `[RETRY] ${message}`,
                        url,
                        critical: isCritical,
                        success: true,
                        reason: 'retry',
                        sourceIP
                    });
                    
                } catch (retryErr) {
                    log('error', `❌ Critical alert retry failed: ${retryErr.message}`);
                    
                    // Log retry failure
                    await logAlertToDatabase({
                        message: `[RETRY FAILED] ${message}`,
                        url,
                        critical: isCritical,
                        success: false,
                        reason: 'retry_failed',
                        sourceIP
                    });
                }
            }, ALERT_CONFIG.retryDelay);
        }

        stats.successfulAlerts++;
        return { success: true, message: 'Alert sent successfully' };

    } catch (err) {
        stats.failedAlerts++;
        log('error', `❌ Failed to send alert: ${err.message}`);
        
        // Log failed alert to database
        await logAlertToDatabase({
            message,
            url,
            critical: isCritical,
            success: false,
            reason: 'send_failed',
            sourceIP
        });
        
        return { success: false, reason: 'send_failed', message: err.message };
    }
}

// API Routes

// Health check endpoint
app.get('/health', (req, res) => {
    const uptime = process.uptime();
    
    res.json({
        status: 'healthy',
        service: 'alerts-server',
        uptime: Math.floor(uptime),
        uptimeFormatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
        alertsEnabled: ALERT_CONFIG.enabled,
        workingHours: isWorkingHours(),
        currentHour: new Date().getHours(),
        workingHoursRange: `${ALERT_CONFIG.workingHoursStart}:00 - ${ALERT_CONFIG.workingHoursEnd}:00`,
        rateLimit: {
            current: rateLimitWindow.length,
            max: ALERT_CONFIG.rateLimitMax,
            windowSeconds: ALERT_CONFIG.rateLimitWindow / 1000,
            nextReset: rateLimitWindow.length > 0 ? 
                new Date(Math.min(...rateLimitWindow) + ALERT_CONFIG.rateLimitWindow).toISOString() : null
        },
        memory: {
            rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
            heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
        },
        stats: stats
    });
});

// Send alert endpoint
app.post('/alert', async (req, res) => {
    const { message, url, critical, alertType } = req.body;
    const sourceIP = req.ip || req.connection.remoteAddress || 'unknown';

    // Validation
    if (!message) {
        return res.status(400).json({
            error: 'Missing required parameter: message'
        });
    }

    if (typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({
            error: 'Message must be a non-empty string'
        });
    }

    // Validate alertType format if provided (allow any string)
    if (alertType && (typeof alertType !== 'string' || alertType.trim().length === 0)) {
        return res.status(400).json({
            error: 'alertType must be a non-empty string if provided'
        });
    }

    const isCritical = critical === true || critical === 'true';

    log('info', `📥 Received alert request from ${sourceIP}: ${message} ${isCritical ? '(CRITICAL)' : ''} ${alertType ? `[${alertType}]` : ''}`);

    try {
        const result = await sendAlert(message.trim(), url, isCritical, sourceIP, alertType);
        
        res.json({
            success: result.success,
            message: result.message,
            reason: result.reason || null,
            timestamp: new Date().toISOString(),
            critical: isCritical,
            alertType: alertType || 'auto-detected',
            workingHours: isWorkingHours(),
            rateLimit: {
                current: rateLimitWindow.length,
                max: ALERT_CONFIG.rateLimitMax,
                remaining: ALERT_CONFIG.rateLimitMax - rateLimitWindow.length
            }
        });

    } catch (error) {
        log('error', `💥 Error processing alert: ${error.message}`);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

// Configuration endpoints
app.get('/config', (req, res) => {
    res.json({
        enabled: ALERT_CONFIG.enabled,
        workingHoursStart: ALERT_CONFIG.workingHoursStart,
        workingHoursEnd: ALERT_CONFIG.workingHoursEnd,
        topic: ALERT_CONFIG.topic,
        retryDelay: ALERT_CONFIG.retryDelay,
        rateLimit: {
            max: ALERT_CONFIG.rateLimitMax,
            windowSeconds: ALERT_CONFIG.rateLimitWindow / 1000,
            current: rateLimitWindow.length
        },
        defaultAlertBody: ALERT_CONFIG.defaultAlertBody,
        alertTypeInfo: {
            dynamic: true,
            description: "Any custom alert type can be specified. If not provided, auto-detection based on message content will be used.",
            examples: ["custom", "maintenance", "deployment", "performance", "integration"]
        }
    });
});

app.post('/config/enable', (req, res) => {
    ALERT_CONFIG.enabled = true;
    log('info', '🔔 Alerts ENABLED');
    res.json({ success: true, message: 'Alerts enabled', enabled: true });
});

app.post('/config/disable', (req, res) => {
    ALERT_CONFIG.enabled = false;
    log('info', '🔕 Alerts DISABLED');
    res.json({ success: true, message: 'Alerts disabled', enabled: false });
});

// Alert types endpoint - now supports dynamic types
app.get('/alert-types', (req, res) => {
    res.json({
        dynamic: true,
        description: "Alert types are now completely dynamic. You can specify any custom alert type or let the system auto-detect based on message content.",
        defaultAlertBody: ALERT_CONFIG.defaultAlertBody,
        autoDetectedTypes: [
            "Device Alert (keywords: device, battery, round)",
            "Sync Alert (keywords: sync, synchroniz)",
            "Health Check (keywords: health, check, monitor)",
            "Security Alert (keywords: security, breach, unauthorized)",
            "Warning (keywords: warning, warn)",
            "Information (keywords: info, information, completed, successful)",
            "Error Alert (keywords: error, fail, problem)",
            "Backup Alert (keywords: backup, restore)",
            "Network Alert (keywords: network, connection)",
            "Database Alert (keywords: database, sql)",
            "Critical Alert (when critical: true)"
        ],
        customTypeExamples: [
            "maintenance",
            "deployment", 
            "performance",
            "integration",
            "user-notification",
            "api-alert",
            "scheduled-task",
            "custom-category"
        ],
        usage: {
            autoDetection: "Send without alertType to auto-detect based on message content",
            customType: "Send with alertType parameter to specify any custom alert body type",
            formatting: "Custom types are automatically formatted as 'TypeName Alert' (e.g., 'maintenance' becomes 'Maintenance Alert')"
        }
    });
});

// Statistics endpoint
app.get('/stats', (req, res) => {
    const uptime = process.uptime();
    const successRate = stats.totalAlerts > 0 ? 
        (stats.successfulAlerts / stats.totalAlerts * 100).toFixed(1) : 0;

    res.json({
        ...stats,
        uptime: Math.floor(uptime),
        successRate: `${successRate}%`,
        alertsPerHour: stats.totalAlerts > 0 ? 
            (stats.totalAlerts / (uptime / 3600)).toFixed(1) : 0
    });
});

// Test endpoint for development
app.post('/test', async (req, res) => {
    const testMessage = `Test alert from alerts-server at ${new Date().toLocaleString()}`;
    const sourceIP = req.ip || req.connection.remoteAddress || 'unknown';
    
    log('info', '🧪 Test alert triggered');
    
    const result = await sendAlert(testMessage, null, false, sourceIP);
    
    res.json({
        test: true,
        ...result,
        timestamp: new Date().toISOString()
    });
});

// Rate limit reset endpoint
app.post('/reset-rate-limit', (req, res) => {
    rateLimitWindow = [];
    log('info', '🔄 Rate limit window reset');
    res.json({ 
        success: true, 
        message: 'Rate limit window reset',
        rateLimit: {
            current: 0,
            max: ALERT_CONFIG.rateLimitMax
        }
    });
});

// Database logs endpoint
app.get('/logs', async (req, res) => {
    if (!sql) {
        return res.status(503).json({
            error: 'Database not available',
            message: 'SQL Server module not loaded'
        });
    }

    try {
        const pool = await sql.connect(DB_CONFIG);
        const limit = parseInt(req.query.limit) || 50;
        
        const result = await pool.request()
            .input('limit', sql.Int, limit)
            .query(`
                SELECT TOP (@limit) 
                    id, timestamp, message, url, critical, success, reason, sourceIP
                FROM alertLog 
                ORDER BY timestamp DESC
            `);
        
        await pool.close();
        
        res.json({
            success: true,
            count: result.recordset.length,
            logs: result.recordset
        });
        
    } catch (err) {
        log('error', `📊 Failed to fetch logs: ${err.message}`);
        res.status(500).json({
            error: 'Database error',
            message: err.message
        });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    log('error', `💥 Unhandled error: ${error.message}`);
    res.status(500).json({
        error: 'Internal server error',
        message: error.message
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        availableEndpoints: [
            'GET /health - Service health check',
            'POST /alert - Send alert (body: {message, url?, critical?, alertType?}) - alertType can be any custom string',
            'GET /config - View configuration',
            'POST /config/enable - Enable alerts',
            'POST /config/disable - Disable alerts',
            'GET /alert-types - View dynamic alert type information',
            'GET /stats - View statistics',
            'POST /test - Send test alert',
            'POST /reset-rate-limit - Reset rate limiting window',
            'GET /logs?limit=50 - View recent alert logs'
        ]
    });
});

// Start server
app.listen(PORT, async () => {
    log('info', '🚀 Alerts Server started');
    log('info', `🌐 Server running on port ${PORT}`);
    log('info', `🔔 Alerts enabled: ${ALERT_CONFIG.enabled}`);
    log('info', `🕐 Working hours: ${ALERT_CONFIG.workingHoursStart}:00 - ${ALERT_CONFIG.workingHoursEnd}:00`);
    log('info', `🚫 Rate limit: ${ALERT_CONFIG.rateLimitMax} alerts per ${ALERT_CONFIG.rateLimitWindow/1000} seconds`);
    log('info', `📋 Available endpoints:`);
    log('info', `   Health: http://localhost:${PORT}/health`);
    log('info', `   Send Alert: POST http://localhost:${PORT}/alert`);
    log('info', `   Configuration: http://localhost:${PORT}/config`);
    log('info', `   Statistics: http://localhost:${PORT}/stats`);
    log('info', `   Logs: http://localhost:${PORT}/logs`);
    
    // Initialize database
    const dbInitialized = await initializeDatabase();
    if (dbInitialized) {
        log('info', '📊 Database connection established and table ready');
    } else {
        log('warn', '📊 Database not available - using in-memory logging only');
    }
    
    if (!ALERT_CONFIG.enabled) {
        log('warn', '⚠️  Alerts are currently DISABLED - enable via POST /config/enable');
    }
});

// Graceful shutdown
process.on('SIGINT', () => {
    log('info', '🛑 Received SIGINT, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    log('info', '🛑 Received SIGTERM, shutting down gracefully...');
    process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    log('error', `💥 Uncaught exception: ${error.message}`);
    log('error', error.stack);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    log('error', `💥 Unhandled rejection at ${promise}: ${reason}`);
});
