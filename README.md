# Alerts Server

Centralized notification server with rate limiting, database logging, environment-based configuration, and automatic restart capabilities.

## Features

- **Centralized Alert Management**: Single endpoint for all system alerts
- **Rate Limiting**: Prevents alert spam (configurable, default: 5 alerts/30s)
- **Database Logging**: SQL Server integration for alert history
- **Working Hours**: Configurable business hours filtering
- **Critical Alert Retry**: Automatic retry for critical alerts
- **Health Monitoring**: Built-in health check endpoints
- **Auto-restart**: SystemD service with automatic restart on failure
- **Environment-based Configuration**: Secure credential management with .env files
- **Security Hardened**: No hardcoded credentials, environment variable validation

## Quick Setup

1. **Clone and Configure**:
   ```bash
   git clone <repository-url>
   cd alerts-workspace
   cp .env.example .env
   # Edit .env with your actual credentials
   ```

2. **Install and Start**:
   ```bash
   ./setup.sh
   ```

3. **Verify Installation**:
   ```bash
   curl http://localhost:3008/health
   ```

## Manual Installation

If you prefer manual setup:

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Install SystemD Service**:
   ```bash
   sudo cp alerts-server.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable alerts-server
   sudo systemctl start alerts-server
   ```

## Environment Variables

Create a `.env` file with the following variables:

```bash
# Server Configuration
PORT=3008
NODE_ENV=production

# Alert System Configuration
ALERTS_ENABLED=true
WORKING_HOURS_START=7
WORKING_HOURS_END=18
ALERT_TOPIC=IT
ALERT_RETRY_DELAY=3000

# Rate Limiting Configuration
RATE_LIMIT_WINDOW=30000
RATE_LIMIT_MAX=5
THROTTLE_MESSAGE="Alert rate limit exceeded - throttling alerts"

# Tasty Trucks API Configuration
TASTY_API_URL=https://mobile.tastytrucks.com.au:60052/SendAlert
TASTY_API_AUTH=your_auth_header_here

# Database Configuration
DB_SERVER=localhost
DB_NAME=your_database_name
DB_USER=your_database_user
DB_PASSWORD=your_database_password
DB_ENCRYPT=false
DB_TRUST_CERT=true
```

**⚠️ Important**: Never commit the `.env` file to git. It contains sensitive credentials.

## API Endpoints

### Send Alert
**POST** `/alert` - Main endpoint for sending notifications

```http
POST http://localhost:3008/alert
Content-Type: application/json

{
  "message": "Your alert message",
  "url": "optional-url", 
  "critical": false
}
```

**Parameters:**
- `message` (required): Alert message text (string, non-empty)
- `url` (optional): URL to include in the alert notification
- `critical` (optional): Boolean - if true, sends alert twice with 3-second delay for reliability

**Example Requests:**

1. **Basic Alert:**
```json
{
  "message": "Database connection restored successfully"
}
```

2. **Alert with URL:**
```json
{
  "message": "High CPU usage detected on production server", 
  "url": "https://dashboard.example.com/cpu-metrics"
}
```

3. **Critical Alert:**
```json
{
  "message": "CRITICAL: Payment system failure - transactions failing",
  "url": "https://monitoring.tastytrucks.com.au/payments",
  "critical": true
}
```

4. **Device Sync Alert:**
```json
{
  "message": "Device sync completed: 91 devices processed, 3 with low battery",
  "url": "https://dashboard.tastytrucks.com.au/devices"
}
```

**Success Response:**
```json
{
  "success": true,
  "message": "Alert sent successfully",
  "reason": null,
  "timestamp": "2025-07-30T14:30:00.000Z",
  "critical": false,
  "workingHours": true,
  "rateLimit": {
    "current": 3,
    "max": 5,
    "remaining": 2
  }
}
```

**Error Response (Rate Limited):**
```json
{
  "success": false,
  "message": "Alert rate limit exceeded - throttling alerts",
  "reason": "rate_limited",
  "timestamp": "2025-07-30T14:30:00.000Z",
  "critical": false,
  "workingHours": true,
  "rateLimit": {
    "current": 5,
    "max": 5,
    "remaining": 0
  }
}
```

### Health Check
**GET** `/health` - Service health and status monitoring

```http
GET http://localhost:3008/health
```

**Response:**
```json
{
  "status": "healthy",
  "service": "alerts-server",
  "uptime": 1234,
  "uptimeFormatted": "0h 20m",
  "alertsEnabled": true,
  "workingHours": true,
  "currentHour": 14,
  "workingHoursRange": "7:00 - 18:00",
  "rateLimit": {
    "current": 2,
    "max": 5,
    "windowSeconds": 30,
    "nextReset": "2025-07-30T14:30:00.000Z"
  },
  "memory": {
    "rss": "45MB",
    "heapUsed": "23MB"
  },
  "stats": {
    "startTime": "2025-07-30T14:10:00.000Z",
    "totalAlerts": 15,
    "successfulAlerts": 12,
    "failedAlerts": 1,
    "criticalAlerts": 2,
    "alertsDisabled": 0,
    "throttledAlerts": 2
  }
}
```

### Configuration Management
**GET** `/config` - View current server configuration

```http
GET http://localhost:3008/config
```

**Response:**
```json
{
  "enabled": true,
  "workingHoursStart": 7,
  "workingHoursEnd": 18,
  "topic": "IT",
  "retryDelay": 3000,
  "rateLimit": {
    "max": 5,
    "windowSeconds": 30,
    "current": 2
  }
}
```

**POST** `/config/enable` - Enable alert system

```http
POST http://localhost:3008/config/enable
```

**Response:**
```json
{
  "success": true,
  "message": "Alerts enabled",
  "enabled": true
}
```

**POST** `/config/disable` - Disable alert system

```http
POST http://localhost:3008/config/disable
```

**Response:**
```json
{
  "success": true,
  "message": "Alerts disabled",
  "enabled": false
}
```

### Statistics and Monitoring
**GET** `/stats` - Detailed performance statistics

```http
GET http://localhost:3008/stats
```

**Response:**
```json
{
  "startTime": "2025-07-30T14:00:00.000Z",
  "totalAlerts": 25,
  "successfulAlerts": 22,
  "failedAlerts": 1,
  "criticalAlerts": 3,
  "alertsDisabled": 0,
  "throttledAlerts": 2,
  "uptime": 1800,
  "successRate": "88.0%",
  "alertsPerHour": "50.0"
}
```

**GET** `/logs` - Recent alert logs from database

```http
GET http://localhost:3008/logs?limit=20
```

**Response:**
```json
{
  "success": true,
  "count": 20,
  "logs": [
    {
      "id": 123,
      "timestamp": "2025-07-30T14:25:00.000Z",
      "message": "Device sync completed successfully",
      "url": "https://dashboard.example.com",
      "critical": false,
      "success": true,
      "reason": null,
      "sourceIP": "192.168.1.100"
    }
  ]
}
```

### Testing and Development
**POST** `/test` - Send test alert for development

```http
POST http://localhost:3008/test
```

**Response:**
```json
{
  "test": true,
  "success": true,
  "message": "Alert sent successfully",
  "timestamp": "2025-07-30T14:30:00.000Z"
}
```

**POST** `/reset-rate-limit` - Reset rate limiting window

```http
POST http://localhost:3008/reset-rate-limit
```

**Response:**
```json
{
  "success": true,
  "message": "Rate limit window reset",
  "rateLimit": {
    "current": 0,
    "max": 5
  }
}
```

## Environment-Based Configuration

**⚠️ IMPORTANT**: This application now uses environment variables for all configuration. No hardcoded credentials exist in the source code.

Create a `.env` file from the template:

```bash
cp .env.example .env
# Edit .env with your actual credentials
```

**Required Environment Variables:**
- `TASTY_API_AUTH`: Authentication header for Tasty API
- `DB_PASSWORD`: Database password for SQL Server connection

**Optional Environment Variables:**
- `PORT`: Server port (default: 3008)
- `ALERTS_ENABLED`: Enable/disable alerts (default: true)
- `WORKING_HOURS_START`: Start hour for working hours (default: 7)
- `WORKING_HOURS_END`: End hour for working hours (default: 18)
- `RATE_LIMIT_MAX`: Maximum alerts per window (default: 5)
- `RATE_LIMIT_WINDOW`: Rate limit window in milliseconds (default: 30000)

**Example .env file:**
```bash
# Server Configuration
PORT=3008
NODE_ENV=production

# Alert System Configuration  
ALERTS_ENABLED=true
WORKING_HOURS_START=7
WORKING_HOURS_END=18
ALERT_TOPIC=IT

# Tasty Trucks API Configuration
TASTY_API_URL=https://mobile.tastytrucks.com.au:60052/SendAlert
TASTY_API_AUTH=Basic dXNlcjE6cGFzczE=

# Database Configuration
DB_SERVER=localhost
DB_NAME=tasty
DB_USER=SA
DB_PASSWORD=your_actual_password
DB_ENCRYPT=false
DB_TRUST_CERT=true
```

## Integration Examples

### From Device Sync Service
```javascript
// Send regular alert
await axios.post('http://localhost:3008/alert', {
    message: `Device sync completed: ${deviceCount} devices processed`
});

// Send critical alert
await axios.post('http://localhost:3008/alert', {
    message: 'Device sync failed - requires immediate attention',
    critical: true
});
```

### From Other Services
```javascript
const sendAlert = async (message, critical = false, url = null) => {
    try {
        const response = await axios.post('http://localhost:3008/alert', {
            message,
            critical,
            url
        });
        console.log('Alert sent:', response.data);
        return response.data;
    } catch (error) {
        console.error('Failed to send alert:', error.message);
        return { success: false, error: error.message };
    }
};

// Usage examples
await sendAlert('Service started successfully');
await sendAlert('Database connection lost!', true);
await sendAlert('CPU usage high', false, 'https://dashboard.example.com/cpu');
```

## Postman Collection Examples

### Complete Postman API Collection

**1. Health Check**
```http
GET http://localhost:3008/health
```

**2. Send Basic Alert** 
```http
POST http://localhost:3008/alert
Content-Type: application/json

{
  "message": "Database connection restored successfully"
}
```

**3. Send Alert with URL**
```http
POST http://localhost:3008/alert
Content-Type: application/json

{
  "message": "High CPU usage detected on production server",
  "url": "https://dashboard.example.com/cpu-metrics"
}
```

**4. Send Critical Alert**
```http
POST http://localhost:3008/alert
Content-Type: application/json

{
  "message": "CRITICAL: Database server is down - immediate attention required",
  "critical": true
}
```

**5. Send Critical Alert with URL**
```http
POST http://localhost:3008/alert
Content-Type: application/json

{
  "message": "CRITICAL: Payment system failure - transactions failing",
  "url": "https://monitoring.tastytrucks.com.au/payments", 
  "critical": true
}
```

**6. Device Sync Alert Example**
```http
POST http://localhost:3008/alert
Content-Type: application/json

{
  "message": "Device sync completed: 91 devices processed, 3 with low battery",
  "url": "https://dashboard.tastytrucks.com.au/devices"
}
```

**7. Test Alert**
```http
POST http://localhost:3008/test
```

**8. Get Configuration**
```http
GET http://localhost:3008/config
```

**9. Enable Alerts**
```http
POST http://localhost:3008/config/enable
```

**10. Disable Alerts**
```http
POST http://localhost:3008/config/disable
```

**11. Get Statistics**
```http
GET http://localhost:3008/stats
```

**12. Get Recent Logs**
```http
GET http://localhost:3008/logs?limit=20
```

**13. Reset Rate Limit**
```http
POST http://localhost:3008/reset-rate-limit
```

### Expected Response Codes

- **200**: Success - Alert sent or data retrieved
- **400**: Bad Request - Missing or invalid parameters
- **500**: Server Error - Internal server or database error
- **503**: Service Unavailable - Database not available (for /logs endpoint)

## Production Deployment

### SystemD Service

Create `/etc/systemd/system/alerts-server.service`:

```ini
[Unit]
Description=Centralized Alerts Server
After=network.target

[Service]
Type=simple
User=administrator
WorkingDirectory=/home/administrator/alerts-workspace
Environment=NODE_ENV=production
Environment=TZ=Australia/Sydney
ExecStart=/usr/bin/node alert-server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=alerts-server

# Resource limits
MemoryLimit=256M
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

**Enable and start:**
```bash
sudo systemctl enable alerts-server.service
sudo systemctl start alerts-server.service
sudo systemctl status alerts-server.service
```

### Environment Variables

- `PORT`: Server port (default: 3008)
- `NODE_ENV`: Environment (production/development)
- `TZ`: Timezone for working hours calculation

## Monitoring

### Check Service Status
```bash
curl http://localhost:3008/health
```

### View Logs
```bash
sudo journalctl -u alerts-server.service -f
```

### Performance Statistics
```bash
curl http://localhost:3008/stats
```

## Security Notes

- **Alerts Disabled by Default**: Change `enabled: false` to `enabled: true` in production
- **Network Access**: Ensure port 3008 is accessible from your other services
- **Authentication**: The service uses basic auth for the Tasty API endpoint
- **Rate Limiting**: Consider implementing rate limiting for production use

## Troubleshooting

### Common Issues

1. **Alerts not sending**: Check if alerts are enabled via `/config` endpoint
2. **Outside working hours**: Verify current hour and working hours configuration
3. **Network errors**: Check connectivity to the Tasty API endpoint
4. **Service not starting**: Check logs with `journalctl -u alerts-server.service`

### Debug Mode

Enable debug logging by checking the console output when running with `npm run dev`.

## Development

```bash
# Install dependencies
npm install

# Start in development mode
npm run dev

# Run tests
npm test

# Send test alert
curl -X POST http://localhost:3008/test
```
