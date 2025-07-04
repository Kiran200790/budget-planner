#!/bin/bash

# Exit on error
set -o errexit

# Install dependencies
pip install -r requirements.txt

# Run database initialization
python -c 'from app import init_db; init_db()'
