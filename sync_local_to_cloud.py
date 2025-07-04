import os
import sqlite3
import libsql_client
from app import DbWrapper
import getpass

# Get Turso credentials from environment variables
TURSO_DATABASE_URL = os.environ.get("TURSO_DATABASE_URL")
# TURSO_AUTH_TOKEN = os.environ.get("TURSO_AUTH_TOKEN") # No longer reading from env

# --- Configuration ---
LOCAL_DB_PATH = 'budget.db'

# --- Do not edit below this line ---

def sync_data():
    """Reads data from local SQLite DB and writes it to the cloud DB."""
    
    # Prompt for the auth token securely
    TURSO_AUTH_TOKEN = getpass.getpass("Please paste your Turso Auth Token: ")

    if not TURSO_DATABASE_URL or not TURSO_AUTH_TOKEN:
        print("Error: TURSO_DATABASE_URL environment variable must be set, and a token must be provided.")
        return

    print(f"Connecting to local database: {LOCAL_DB_PATH}")
    local_conn = sqlite3.connect(LOCAL_DB_PATH)
    local_conn.row_factory = sqlite3.Row
    local_cursor = local_conn.cursor()

    print("Connecting to cloud database...")
    # Force HTTPS for the connection
    https_url = TURSO_DATABASE_URL.replace("libsql://", "https://")
    
    # Create the cloud connection and wrapper
    cloud_conn = libsql_client.create_client_sync(url=https_url, auth_token=TURSO_AUTH_TOKEN)
    cloud_db = DbWrapper(cloud_conn, is_libsql=True)

    # Tables to sync - corrected 'budget' to 'budgets'
    tables = ['income', 'expenses', 'emis', 'budgets']

    for table_name in tables:
        print(f"\n--- Syncing table: {table_name} ---")
        
        # Fetch all data from the local table
        local_cursor.execute(f"SELECT * FROM {table_name}")
        records = local_cursor.fetchall()
        
        if not records:
            print(f"No records found in local table '{table_name}'. Skipping.")
            continue

        print(f"Found {len(records)} records in local table '{table_name}'.")

        # Clear the cloud table before inserting new data to avoid duplicates
        # This is a destructive action, but necessary for a clean sync.
        print(f"Clearing existing records from cloud table '{table_name}'...")
        try:
            cloud_db.execute(f"DELETE FROM {table_name}")
            print("Cloud table cleared.")
        except Exception as e:
            # It's possible the table doesn't exist yet in a clean deploy, which is fine.
            print(f"Warning: Could not clear table '{table_name}': {e}")
            print("This might be okay if the table is new.")

        # Prepare for batch insert
        print(f"Preparing {len(records)} records for insertion into cloud table '{table_name}'...")
        
        insert_statements = []
        for record in records:
            record_dict = dict(record)
            
            # Exclude the 'id' column to allow the cloud DB to auto-generate it
            if 'id' in record_dict:
                del record_dict['id']
            
            columns = ', '.join(record_dict.keys())
            placeholders = ', '.join(['?' for _ in record_dict])
            sql = f"INSERT INTO {table_name} ({columns}) VALUES ({placeholders})"
            params = tuple(record_dict.values())
            insert_statements.append((sql, params))

        # Execute as a batch for efficiency
        if not insert_statements:
            print("No statements to execute.")
            continue
            
        print(f"Executing batch insert of {len(insert_statements)} records...")
        try:
            cloud_db.execute_batch(insert_statements)
            print(f"Successfully inserted {len(insert_statements)} records into '{table_name}'.")
        except Exception as e:
            print(f"ERROR: Batch insert failed for table '{table_name}': {e}")
            print("The sync for this table failed. Please check the error message.")

    print("\nData sync completed!")
    local_conn.close()
    cloud_db.close()

if __name__ == '__main__':
    sync_data()
