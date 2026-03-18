import argparse
import os
import sqlite3
from datetime import datetime

import bcrypt
import libsql_client


DEFAULT_DATABASE = os.environ.get('BUDGET_DB_PATH', 'budget.db')


class DbWrapper:
    def __init__(self, conn, is_libsql):
        self._conn = conn
        self._is_libsql = is_libsql

    def execute(self, sql, params=()):
        if self._is_libsql:
            return self._conn.execute(sql, params)
        cursor = self._conn.cursor()
        cursor.execute(sql, params)
        return cursor

    def fetchall(self, result_set_or_cursor):
        if self._is_libsql:
            columns = result_set_or_cursor.columns
            return [dict(zip(columns, row)) for row in result_set_or_cursor.rows]
        rows = result_set_or_cursor.fetchall()
        return [dict(row) for row in rows]

    def fetchone(self, result_set_or_cursor):
        if self._is_libsql:
            if result_set_or_cursor and result_set_or_cursor.rows:
                columns = result_set_or_cursor.columns
                return dict(zip(columns, result_set_or_cursor.rows[0]))
            return None
        row = result_set_or_cursor.fetchone()
        return dict(row) if row else None

    def commit(self):
        if not self._is_libsql:
            self._conn.commit()

    def close(self):
        self._conn.close()


def get_db(db_path):
    db_url = os.environ.get('TURSO_DATABASE_URL')
    auth_token = os.environ.get('TURSO_AUTH_TOKEN')

    if db_url and auth_token:
        https_url = db_url.replace('libsql://', 'https://')
        conn = libsql_client.create_client_sync(url=https_url, auth_token=auth_token)
        return DbWrapper(conn, is_libsql=True)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return DbWrapper(conn, is_libsql=False)


def get_table_columns(db, table_name):
    result = db.execute(f'SELECT * FROM {table_name} LIMIT 0')
    if hasattr(result, 'columns'):
        return list(result.columns)
    return [column[0] for column in (result.description or [])]


def column_exists(db, table_name, column_name):
    try:
        return column_name in get_table_columns(db, table_name)
    except Exception:
        return False


def ensure_users_table(db):
    db.execute(
        '''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        '''
    )
    db.commit()


def ensure_user_id_columns(db):
    for table_name in ['income', 'expenses', 'emis', 'budgets']:
        if not column_exists(db, table_name, 'user_id'):
            print(f'Adding user_id column to {table_name}...')
            db.execute(f'ALTER TABLE {table_name} ADD COLUMN user_id INTEGER')
    db.commit()


def get_or_create_legacy_user(db, username, password):
    existing_user_rs = db.execute('SELECT * FROM users WHERE email = ?', (username,))
    existing_user = db.fetchone(existing_user_rs)
    if existing_user:
        print(f'Reusing existing legacy user: {username} (id={existing_user["id"]})')
        return existing_user['id']

    if not password:
        raise ValueError(
            'LEGACY_PASSWORD (or --legacy-password) is required when the legacy user does not already exist.'
        )

    password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
    created_at = datetime.now().isoformat()
    db.execute(
        'INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)',
        (username, password_hash, created_at),
    )
    db.commit()

    user_rs = db.execute('SELECT * FROM users WHERE email = ?', (username,))
    user = db.fetchone(user_rs)
    print(f'Created legacy user: {username} (id={user["id"]})')
    return user['id']


def count_null_user_rows(db, table_name):
    count_rs = db.execute(f'SELECT COUNT(*) AS count FROM {table_name} WHERE user_id IS NULL')
    result = db.fetchone(count_rs)
    return result['count'] if result else 0


def backfill_table_user_id(db, table_name, user_id):
    orphaned_rows = count_null_user_rows(db, table_name)
    if orphaned_rows == 0:
        print(f'No orphaned rows found in {table_name}.')
        return 0

    db.execute(f'UPDATE {table_name} SET user_id = ? WHERE user_id IS NULL', (user_id,))
    print(f'Backfilled {orphaned_rows} rows in {table_name} to user_id={user_id}.')
    return orphaned_rows


def deduplicate_budgets(db):
    duplicate_groups_rs = db.execute(
        '''
        SELECT user_id, month, category, MAX(id) AS keep_id, COUNT(*) AS duplicate_count
        FROM budgets
        WHERE user_id IS NOT NULL
        GROUP BY user_id, month, category
        HAVING COUNT(*) > 1
        '''
    )
    duplicate_groups = db.fetchall(duplicate_groups_rs)

    removed_rows = 0
    for group in duplicate_groups:
        delete_rs = db.execute(
            '''
            SELECT id FROM budgets
            WHERE user_id = ? AND month = ? AND category = ? AND id != ?
            ''',
            (group['user_id'], group['month'], group['category'], group['keep_id']),
        )
        duplicate_rows = db.fetchall(delete_rs)
        for row in duplicate_rows:
            db.execute('DELETE FROM budgets WHERE id = ?', (row['id'],))
            removed_rows += 1

    if removed_rows:
        print(f'Removed {removed_rows} duplicate budget rows before creating unique index.')
    else:
        print('No duplicate budget rows found.')

    db.commit()


def ensure_budget_unique_index(db):
    db.execute(
        '''
        CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_user_month_category
        ON budgets (user_id, month, category)
        '''
    )
    db.commit()
    print('Ensured unique index on budgets(user_id, month, category).')


def run_migration(db_path, username, password):
    db = get_db(db_path)
    try:
        ensure_users_table(db)
        ensure_user_id_columns(db)
        legacy_user_id = get_or_create_legacy_user(db, username, password)

        backfill_counts = {}
        for table_name in ['income', 'expenses', 'emis', 'budgets']:
            backfill_counts[table_name] = backfill_table_user_id(db, table_name, legacy_user_id)

        deduplicate_budgets(db)
        ensure_budget_unique_index(db)
        db.commit()

        print('\nMigration complete.')
        print(f'Legacy user id: {legacy_user_id}')
        for table_name, count in backfill_counts.items():
            print(f'- {table_name}: {count} rows backfilled')
    finally:
        db.close()


def parse_args():
    parser = argparse.ArgumentParser(
        description='Backfill existing single-user data into a chosen legacy user account.'
    )
    parser.add_argument(
        '--legacy-username',
        default=os.environ.get('LEGACY_USERNAME'),
        help='Username/email stored in the users table for the legacy account.',
    )
    parser.add_argument(
        '--legacy-password',
        default=os.environ.get('LEGACY_PASSWORD'),
        help='Password to use only if the legacy account needs to be created.',
    )
    parser.add_argument(
        '--db-path',
        default=DEFAULT_DATABASE,
        help='SQLite database path for local runs. Ignored when TURSO_DATABASE_URL is set.',
    )
    return parser.parse_args()


if __name__ == '__main__':
    args = parse_args()
    if not args.legacy_username:
        raise SystemExit('LEGACY_USERNAME (or --legacy-username) is required.')

    run_migration(args.db_path, args.legacy_username, args.legacy_password)
