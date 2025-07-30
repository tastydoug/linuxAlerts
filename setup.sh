#!/bin/bash

# Alert Server Setup Script
# This script installs and configures the alerts-server as a SystemD service

set -e

echo "🚀 Setting up Alerts Server..."

# Check if running as root or with sudo
if [ "$EUID" -eq 0 ]; then
    echo "⚠️  Please run this script as a regular user with sudo privileges"
    echo "Usage: ./setup.sh"
    exit 1
fi

# Current directory
CURRENT_DIR=$(pwd)
SERVICE_NAME="alerts-server"
SERVICE_FILE="$SERVICE_NAME.service"

echo "📂 Working directory: $CURRENT_DIR"

# Check if required files exist
if [ ! -f "alert-server.js" ]; then
    echo "❌ alert-server.js not found in current directory"
    exit 1
fi

if [ ! -f ".env" ]; then
    echo "❌ .env file not found. Please create one from .env.example"
    echo "   cp .env.example .env"
    echo "   # Then edit .env with your actual credentials"
    exit 1
fi

if [ ! -f "$SERVICE_FILE" ]; then
    echo "❌ $SERVICE_FILE not found in current directory"
    exit 1
fi

# Install dependencies
echo "📦 Installing Node.js dependencies..."
npm install

# Stop service if it's already running
if systemctl is-active --quiet $SERVICE_NAME; then
    echo "🛑 Stopping existing $SERVICE_NAME service..."
    sudo systemctl stop $SERVICE_NAME
fi

# Copy service file to systemd directory
echo "📝 Installing SystemD service..."
sudo cp $SERVICE_FILE /etc/systemd/system/

# Update service file permissions
sudo chmod 644 /etc/systemd/system/$SERVICE_FILE

# Reload systemd
echo "🔄 Reloading SystemD daemon..."
sudo systemctl daemon-reload

# Enable service (start on boot)
echo "🔧 Enabling service to start on boot..."
sudo systemctl enable $SERVICE_NAME

# Start service
echo "▶️  Starting $SERVICE_NAME service..."
sudo systemctl start $SERVICE_NAME

# Wait a moment for service to start
sleep 2

# Check service status
echo "📊 Service status:"
sudo systemctl status $SERVICE_NAME --no-pager

# Show service logs
echo ""
echo "📋 Recent logs:"
sudo journalctl -u $SERVICE_NAME --no-pager -n 10

# Show useful commands
echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 Useful commands:"
echo "   Status:    sudo systemctl status $SERVICE_NAME"
echo "   Start:     sudo systemctl start $SERVICE_NAME"
echo "   Stop:      sudo systemctl stop $SERVICE_NAME"
echo "   Restart:   sudo systemctl restart $SERVICE_NAME"
echo "   Logs:      sudo journalctl -u $SERVICE_NAME -f"
echo "   Disable:   sudo systemctl disable $SERVICE_NAME"
echo ""
echo "🌐 Service should be running on port 3008"
echo "   Health check: curl http://localhost:3008/health"
echo ""
echo "⚠️  Remember to:"
echo "   1. Keep your .env file secure and never commit it to git"
echo "   2. Monitor the service logs regularly"
echo "   3. Update environment variables in .env as needed"
