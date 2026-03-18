#!/bin/bash

# Exit on error
set -o errexit

# Install dependencies
pip install -r requirements.txt

# Run database initialization
python -c 'from app import init_db; init_db()'

# Optional one-time backfill for existing single-user data.
# Enable only when upgrading an existing production database.
if [ "${RUN_LEGACY_USER_BACKFILL:-0}" = "1" ]; then
	python migrate_add_users_and_userid.py
fi
