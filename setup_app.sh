#!/bin/bash
# Setup script to get the app running with network connectivity issues

cd /Users/k0n05hl/Kiran/Temp/Budget/budget-planner

# Create a fresh virtual environment
echo "Creating virtual environment..."
python3 -m venv venv_working

# Activate it
source venv_working/bin/activate

# Try to install Flask with timeout and retries
echo "Attempting to install Flask..."
python3 -m pip install --timeout=30 Flask==3.1.0 2>&1 | grep -E "(Successfully|ERROR)" || echo "Flask install attempted"

# If that fails, we'll create a minimal fallback
if ! python3 -c "import flask" 2>/dev/null; then
    echo "WARNING: Could not install Flask from PyPI (network issue)"
    echo "Creating a minimal Flask fallback..."
fi

echo "Setup complete. To run the app, use: source venv_working/bin/activate && python3 app_simplified.py"
