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
```http
POST http://localhost:3008/alert
Content-Type: application/json

{
  "message": "Device sync completed successfully",
  "url": "https://dashboard.example.com",
  "critical": false
}
```

**Parameters:**
- `message` (required): Alert message text
- `url` (optional): URL to include in the alert
- `critical` (optional): If true, sends alert twice with 3-second delay

### Health Check
```http
GET http://localhost:3008/health
```

Returns service status, uptime, memory usage, and statistics.

### Configuration
```http
# View current configuration
GET http://localhost:3008/config

# Enable alerts
POST http://localhost:3008/config/enable

# Disable alerts
POST http://localhost:3008/config/disable
```

### Statistics
```http
GET http://localhost:3008/stats
```

Returns detailed statistics including success rates and alert counts.

### Test Alert
```http
POST http://localhost:3008/test
```

Sends a test alert for development purposes.

## Configuration

Edit the `ALERT_CONFIG` object in `alert-server.js`:

```javascript
const ALERT_CONFIG = {
    enabled: false,              // Set to true to enable alerts
    workingHoursStart: 7,        // Start hour (24-hour format)
    workingHoursEnd: 18,         // End hour (24-hour format)
    apiUrl: 'https://mobile.tastytrucks.com.au:60052/SendAlert',
    authHeader: 'Basic dXNlcjE6cGFzczE=',
    retryDelay: 3000,            // Delay for critical alert retry (ms)
    topic: 'IT'                  // Alert topic
};
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
const sendAlert = async (message, critical = false) => {
    try {
        const response = await axios.post('http://localhost:3008/alert', {
            message,
            critical
        });
        console.log('Alert sent:', response.data);
    } catch (error) {
        console.error('Failed to send alert:', error.message);
    }
};

// Usage
await sendAlert('Service started successfully');
await sendAlert('Database connection lost!', true);
```

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
