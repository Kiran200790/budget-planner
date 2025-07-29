#!/usr/bin/env python3
"""
Keep-alive service to prevent Render app from going to sleep.
This script pings your app every 10 minutes to keep it warm.

Usage:
1. Replace YOUR_RENDER_URL with your actual Render app URL
2. Run this script on any always-on device/server
3. Or use it as a reference for setting up external monitoring
"""

import requests
import time
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO, 
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# Your Render app URL - REPLACE WITH YOUR ACTUAL URL
APP_URL = "https://your-app-name.onrender.com/health"

def ping_app():
    """Ping the app health endpoint to keep it alive"""
    try:
        response = requests.get(APP_URL, timeout=30)
        if response.status_code == 200:
            data = response.json()
            logging.info(f"✅ App healthy - Status: {data.get('status', 'unknown')}")
        else:
            logging.warning(f"⚠️ App responded with status: {response.status_code}")
    except requests.exceptions.Timeout:
        logging.error("❌ Request timed out - app might be sleeping")
    except requests.exceptions.RequestException as e:
        logging.error(f"❌ Failed to ping app: {e}")

def main():
    """Main keep-alive loop"""
    logging.info("🚀 Starting Budget App Keep-Alive Service")
    logging.info(f"📡 Monitoring: {APP_URL}")
    logging.info("⏰ Pinging every 10 minutes to prevent cold starts")
    logging.info("💡 Tip: Run this on a VPS, Raspberry Pi, or use GitHub Actions")
    logging.info("-" * 60)
    
    while True:
        ping_app()
        # Sleep for 10 minutes (600 seconds)
        # This is safely under Render's 15-minute sleep threshold
        time.sleep(600)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logging.info("\n👋 Keep-alive service stopped by user")
    except Exception as e:
        logging.error(f"💥 Unexpected error: {e}")
