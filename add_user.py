#!/usr/bin/env python3
"""
Script to add a user to the budget planner database.
Usage: python add_user.py [username] [password]

Username can be: email, phone number, or any unique identifier
"""

import sqlite3
import bcrypt
import sys
from datetime import datetime

DATABASE = 'budget.db'

def hash_password(password):
    """Hash password using bcrypt."""
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def add_user(username, password):
    """Add a new user to the database."""
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    
    # Check if user already exists
    cursor.execute('SELECT id FROM users WHERE username = ?', (username,))
    existing = cursor.fetchone()
    if existing:
        print(f"User '{username}' already exists!")
        conn.close()
        return False
    
    # Hash the password
    hashed_password = hash_password(password)
    
    # Insert the user
    try:
        cursor.execute(
            'INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)',
            (username, hashed_password, datetime.now().isoformat())
        )
        conn.commit()
        user_id = cursor.lastrowid
        print(f"✓ User '{username}' added successfully with ID {user_id}")
        conn.close()
        return True
    except Exception as e:
        print(f"Error adding user: {e}")
        conn.close()
        return False

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python add_user.py <username> <password>")
        print("Username can be: email, phone number, or any unique identifier")
        sys.exit(1)
    
    username = sys.argv[1]
    password = sys.argv[2]
    
    add_user(username, password)
