import os
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
import bcrypt
import sqlite3
import logging
import libsql_client

from flask import Flask, render_template, request, redirect, url_for, session, g, send_file, flash, jsonify
from datetime import datetime, date
from dateutil.relativedelta import relativedelta # Added for month iteration
import io
import csv
import re

app = Flask(__name__)
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# User model for Flask-Login
class User(UserMixin):
    def __init__(self, id, username, password_hash):
        self.id = id
        self.username = username
        self.password_hash = password_hash


def get_user_identifier_column(db):
    user_columns_rs = db.execute('PRAGMA table_info(users)')
    user_columns = {row['name'] for row in db.fetchall(user_columns_rs)}
    if 'username' in user_columns:
        return 'username'
    return 'email'

# User loader for Flask-Login
@login_manager.user_loader
def load_user(user_id):
    db = get_db()
    identifier_column = get_user_identifier_column(db)
    user_rs = db.execute(
        f'SELECT id, {identifier_column} as username, password_hash FROM users WHERE id = ?',
        (user_id,)
    )
    user = db.fetchone(user_rs)
    if user:
        return User(user['id'], user['username'], user['password_hash'])
    return None
# Use an environment variable for the secret key in production, with a fallback for local dev
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'a_default_fallback_key_for_development')

# session configuration – by default Flask uses a session cookie with no
# expiration date.  The browser is responsible for destroying it when the
# window is closed.  Some browsers (especially if you "restore tabs") will
# keep the cookie around, so users may appear still logged in after a restart.
# If you want stricter behaviour you can adjust these values or clear
# cookies on the client side.
app.config['SESSION_COOKIE_EXPIRES'] = False          # don't send an Expires header
app.config['SESSION_PERMANENT'] = False               # sessions are not permanent
from datetime import timedelta
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(minutes=30)
app.config['REMEMBER_COOKIE_DURATION'] = timedelta(days=30)

# --- DEVELOPMENT SETTINGS TO PREVENT CACHING ---
# These settings ensure that changes to templates and static files are
# reflected immediately without needing a manual server restart or hard refresh.
# Do not use these settings in a production environment.
if app.config['DEBUG']:
    app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
    app.config['TEMPLATES_AUTO_RELOAD'] = True


# Configure logging to see output in the terminal
logging.basicConfig(level=logging.INFO)

STATIC_ASSET_VERSION = os.environ.get('STATIC_ASSET_VERSION') or datetime.utcnow().strftime('%Y%m%d%H%M%S')


@app.context_processor
def inject_asset_version():
    return {'asset_version': STATIC_ASSET_VERSION}

DEFAULT_CATEGORY_OPTIONS = [
    'Groceries', 'Utilities', 'Transport', 'Entertainment', 'Healthcare',
    'Shopping', 'Dining', 'Subscriptions', 'Education', 'Travel', 'Rent', 'Other'
]


def get_user_category_options(user_id, active_month=None):
    db = get_db()
    if active_month:
        category_rs = db.execute(
            'SELECT DISTINCT category FROM budgets WHERE user_id = ? AND month = ? ORDER BY category',
            (user_id, active_month)
        )
    else:
        category_rs = db.execute(
            'SELECT DISTINCT category FROM budgets WHERE user_id = ? ORDER BY category',
            (user_id,)
        )

    db_categories = {
        (row['category'] or '').strip()
        for row in db.fetchall(category_rs)
        if (row['category'] or '').strip()
    }
    return sorted(db_categories)

def validate_password(password):
    """Validate password strength. Returns (is_valid, message)"""
    if len(password) < 8:
        return False, 'Password must be at least 8 characters long.'
    if not any(c.isupper() for c in password):
        return False, 'Password must contain at least one uppercase letter.'
    if not any(c.islower() for c in password):
        return False, 'Password must contain at least one lowercase letter.'
    if not any(c.isdigit() for c in password):
        return False, 'Password must contain at least one digit.'
    return True, 'Password is strong.'


def hash_password(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(password, stored_hash):
    if stored_hash is None:
        return False
    hash_bytes = stored_hash.encode('utf-8') if isinstance(stored_hash, str) else stored_hash
    return bcrypt.checkpw(password.encode('utf-8'), hash_bytes)

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form['password']
        confirm_password = request.form.get('confirmPassword', '')

        # Validate username
        if not username or len(username) < 3:
            flash('Username must be at least 3 characters.', 'error')
            return redirect(url_for('register'))

        # Validate passwords match
        if password != confirm_password:
            flash('Passwords do not match.', 'error')
            return redirect(url_for('register'))

        # Validate password strength
        is_valid, message = validate_password(password)
        if not is_valid:
            flash(message, 'error')
            return redirect(url_for('register'))

        db = get_db()
        identifier_column = get_user_identifier_column(db)
        user_rs = db.execute(f'SELECT * FROM users WHERE {identifier_column} = ?', (username,))
        if db.fetchone(user_rs):
            flash('That username is already taken.', 'error')
            return redirect(url_for('register'))
        password_hash = hash_password(password)
        db.execute(f'INSERT INTO users ({identifier_column}, password_hash, created_at) VALUES (?, ?, ?)',
                   (username, password_hash, datetime.now().isoformat()))
        db.commit()
        flash('Account created! Please log in.', 'success')
        return redirect(url_for('login'))
    return render_template('register.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('index'))

    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form['password']
        remember_me = request.form.get('remember') == 'on'
        db = get_db()
        identifier_column = get_user_identifier_column(db)
        user_rs = db.execute(
            f'SELECT id, {identifier_column} as username, password_hash FROM users WHERE {identifier_column} = ?',
            (username,)
        )
        user = db.fetchone(user_rs)
        if user and verify_password(password, user['password_hash']):
            user_obj = User(user['id'], user['username'], user['password_hash'])
            login_user(user_obj, remember=remember_me)
            session.permanent = remember_me
            flash('Logged in successfully.', 'success')
            return redirect(url_for('index'))
        else:
            flash('Invalid username or password.', 'error')
            return redirect(url_for('login'))
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    flash('Logged out successfully.', 'success')
    return redirect(url_for('login'))

# --- ADD /api/edit_income/<int:income_id> API ENDPOINT ---
@app.route('/api/edit_income/<int:income_id>', methods=['POST'])
@login_required
def api_edit_income(income_id):
    """API endpoint to update an existing income record."""
    description = request.form.get('description')
    amount = request.form.get('amount')
    month = request.form.get('month') or request.form.get('month_select')

    if not all([description, amount, month]):
        return jsonify({'status': 'error', 'message': 'All fields are required!'}), 400

    try:
        db = get_db()
        db.execute(
            'UPDATE income SET description = ?, amount = ?, month = ? WHERE id = ? AND user_id = ?',
            (description, float(amount), month, income_id, current_user.id)
        )
        db.commit()
        message = 'Income updated successfully!'

        return jsonify({'status': 'success', 'message': message})
    except ValueError:
        return jsonify({'status': 'error', 'message': 'Invalid amount. Please use numbers only.'}), 400
    except Exception as e:
        app.logger.error(f"Error updating income {income_id} via API: {e}")
        return jsonify({'status': 'error', 'message': 'An error occurred while updating the income.'}), 500

# --- Database Abstraction ---
# This wrapper provides a unified interface for both SQLite and Turso (libSQL).
class DbWrapper:
    def __init__(self, conn, is_libsql):
        self._conn = conn
        self._is_libsql = is_libsql

    def _quote_libsql_value(self, value):
        if value is None:
            return 'NULL'
        if isinstance(value, bool):
            return '1' if value else '0'
        if isinstance(value, (int, float)):
            return str(value)
        text = str(value).replace("'", "''")
        return f"'{text}'"

    def _inline_libsql_params(self, sql, params):
        if not params:
            return sql
        rendered_sql = sql
        for value in params:
            replacement = self._quote_libsql_value(value)
            rendered_sql = rendered_sql.replace('?', replacement, 1)
        return rendered_sql

    def _normalize_libsql_sql(self, sql):
        return re.sub(r'\buser_id\b', '"user_id"', sql)

    def execute(self, sql, params=()):
        """Executes a query. For non-SELECT queries, it returns None.
           For SELECT queries, it returns an object that can be passed to fetch methods."""
        if self._is_libsql:
            normalized_sql = self._normalize_libsql_sql(sql)
            if not params:
                return self._conn.execute(normalized_sql)
            try:
                return self._conn.execute(normalized_sql, params)
            except Exception as error:
                app.logger.warning(f"libSQL parameter binding failed, using inlined SQL. Error: {error}")
                rendered_sql = self._inline_libsql_params(normalized_sql, params)
                return self._conn.execute(rendered_sql)
        else:
            cursor = self._conn.cursor()
            cursor.execute(sql, params)
            return cursor

    def execute_batch(self, sqls):
        """Executes multiple SQL statements in a batch."""
        if self._is_libsql:
            for i, sql in enumerate(sqls):
                try:
                    if isinstance(sql, tuple):
                        self.execute(sql[0], sql[1])
                    else:
                        self.execute(sql)
                except Exception as e:
                    app.logger.error(f"Batch execution failed at index {i}: {e}", exc_info=True)
                    raise
        else:
            # For sqlite3, execute them one by one
            cursor = self._conn.cursor()
            for sql in sqls:
                if isinstance(sql, tuple): # query with params
                    cursor.execute(sql[0], sql[1])
                else:
                    cursor.execute(sql)
            self._conn.commit()

    def fetchall(self, result_set_or_cursor):
        """Fetches all rows from a result set or cursor and returns them as a list of dicts."""
        if self._is_libsql:
            # result_set_or_cursor is a ResultSet object from Turso
            columns = result_set_or_cursor.columns
            return [dict(zip(columns, row)) for row in result_set_or_cursor.rows]
        else:
            # result_set_or_cursor is a standard sqlite3.Cursor
            rows = result_set_or_cursor.fetchall()
            return [dict(row) for row in rows]

    def fetchone(self, result_set_or_cursor):
        """Fetches one row and returns it as a dict."""
        if self._is_libsql:
            # result_set_or_cursor is a ResultSet object from Turso
            if result_set_or_cursor and result_set_or_cursor.rows:
                columns = result_set_or_cursor.columns
                return dict(zip(columns, result_set_or_cursor.rows[0]))
            return None
        else:
            # result_set_or_cursor is a standard sqlite3.Cursor
            row = result_set_or_cursor.fetchone()
            return dict(row) if row else None

    def commit(self):
        """Commits a transaction. No-op for Turso as it auto-commits."""
        if not self._is_libsql:
            self._conn.commit()

    def close(self):
        """Closes the connection."""
        self._conn.close()

# --- End Database Abstraction ---


# Local database fallback
DATABASE = 'budget.db'


def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        db_url = os.environ.get("TURSO_DATABASE_URL")
        auth_token = os.environ.get("TURSO_AUTH_TOKEN")

        if db_url and auth_token:
            # Production: Connect to Turso (libSQL cloud DB)
            https_url = db_url.replace("libsql://", "https://")
            conn = libsql_client.create_client_sync(url=https_url, auth_token=auth_token)
            db = g._database = DbWrapper(conn, is_libsql=True)
            app.logger.info("Database backend: Turso (libSQL)")
        else:
            # Local development: Connect to local SQLite file
            app.logger.warning("TURSO_DATABASE_URL not set — falling back to local SQLite (budget.db). Do not use this in production.")
            conn = sqlite3.connect(DATABASE)
            conn.row_factory = sqlite3.Row
            db = g._database = DbWrapper(conn, is_libsql=False)
            app.logger.info("Database backend: Local SQLite (budget.db)")
    return db

@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()

def get_smart_default_month():
    """
    Smart default month logic:
    1. Calculate next month (current month + 1)
    2. Check if next month has any expense records for current user
    3. If yes, return next month as default
    4. If no, return current month as default
    """
    try:
        if not current_user.is_authenticated:
            return datetime.now().strftime('%Y-%m')
        
        # Get current date and calculate next month
        current_date = datetime.now()
        
        # Calculate next month
        if current_date.month == 12:
            next_month_date = current_date.replace(year=current_date.year + 1, month=1)
        else:
            next_month_date = current_date.replace(month=current_date.month + 1)
        
        next_month = next_month_date.strftime('%Y-%m')
        current_month = current_date.strftime('%Y-%m')
        
        # Check if next month has any expense records for current user
        db = get_db()
        expense_count_rs = db.execute('''
            SELECT COUNT(*) as count 
            FROM expenses 
            WHERE month = ? AND user_id = ?
        ''', (next_month, current_user.id))
        expense_count = db.fetchone(expense_count_rs)
        
        if expense_count and expense_count['count'] > 0:
            app.logger.info(f"Smart default: Next month {next_month} has {expense_count['count']} expenses, using as default")
            return next_month
        else:
            app.logger.info(f"Smart default: Next month {next_month} has no expenses, using current month {current_month}")
            return current_month
            
    except Exception as e:
        # Fallback to current month if any error occurs
        current_month = datetime.now().strftime('%Y-%m')
        app.logger.error(f"Smart default: Error {str(e)}, falling back to current month {current_month}")
        return current_month


# Note: Using next-month expense logic for smart defaults

def ensure_column_exists(db, table_name, column_name, column_definition):
    try:
        table_info_rs = db.execute(f'PRAGMA table_info({table_name})')
        existing_columns = {row['name'] for row in db.fetchall(table_info_rs)}
        if column_name not in existing_columns:
            db.execute(f'ALTER TABLE {table_name} ADD COLUMN {column_name} {column_definition}')
            db.commit()
            app.logger.info(f"Schema migration: Added column {table_name}.{column_name}")
    except Exception as error:
        app.logger.error(f"Schema migration failed for {table_name}.{column_name}: {error}", exc_info=True)
        raise


def apply_schema_compat_migrations(db):
    ensure_column_exists(db, 'users', 'created_at', 'TEXT')
    ensure_column_exists(db, 'income', 'user_id', 'INTEGER')
    ensure_column_exists(db, 'income', 'month', 'TEXT')
    ensure_column_exists(db, 'income', 'description', 'TEXT')
    ensure_column_exists(db, 'income', 'amount', 'REAL')
    ensure_column_exists(db, 'expenses', 'user_id', 'INTEGER')
    ensure_column_exists(db, 'expenses', 'month', 'TEXT')
    ensure_column_exists(db, 'expenses', 'payment_type', 'TEXT')
    ensure_column_exists(db, 'emis', 'user_id', 'INTEGER')
    ensure_column_exists(db, 'emis', 'month', 'TEXT')
    ensure_column_exists(db, 'budgets', 'user_id', 'INTEGER')
    ensure_column_exists(db, 'budgets', 'month', 'TEXT')

def init_db():
    with app.app_context():
        db = get_db()
        # Use a list of SQL statements for batch execution
        schema_queries = [
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS income (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                month TEXT NOT NULL,
                description TEXT NOT NULL,
                amount REAL NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS expenses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                month TEXT NOT NULL,
                date TEXT NOT NULL,
                category TEXT NOT NULL,
                description TEXT NOT NULL,
                amount REAL NOT NULL,
                payment_type TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS emis (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                month TEXT NOT NULL,
                loan_name TEXT NOT NULL,
                emi_amount REAL NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS budgets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                month TEXT NOT NULL,
                category TEXT NOT NULL,
                amount REAL NOT NULL,
                UNIQUE(user_id, month, category),
                FOREIGN KEY(user_id) REFERENCES users(id)
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS weekly_budgets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                month TEXT NOT NULL,
                week_index INTEGER NOT NULL,
                base_budget REAL NOT NULL DEFAULT 0,
                carry_in REAL NOT NULL DEFAULT 0,
                effective_budget REAL NOT NULL DEFAULT 0,
                spent REAL NOT NULL DEFAULT 0,
                variance REAL NOT NULL DEFAULT 0,
                status TEXT DEFAULT 'normal',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(user_id, month, week_index),
                FOREIGN KEY(user_id) REFERENCES users(id)
            );
            """
        ]
        db.execute_batch(schema_queries)
        apply_schema_compat_migrations(db)
        # db.commit() is not needed here for Turso, and execute_batch handles it for SQLite

# Call this function once to initialize/update the database schema
# init_db() # Commented out for production, will be run via build.sh

# ========== WEEKLY BUDGET HELPERS ==========

def get_week_boundaries(month_str, db=None, user_id=None):
    """
    Returns list of (week_index, start_date, end_date) for a given month.
    Week 1 starts from the user's first expense date that falls within the budget cycle.
    The budget cycle spans from potentially the previous month to this month (e.g., March 18 to April 17).
    If no expense exists, week 1 starts at the first day of the month.
    month_str: 'YYYY-MM'
    """
    from datetime import datetime, timedelta
    year, month = map(int, month_str.split('-'))
    first_day = datetime(year, month, 1)
    
    # Find last day of month
    if month == 12:
        last_day = datetime(year + 1, 1, 1) - timedelta(days=1)
    else:
        last_day = datetime(year, month + 1, 1) - timedelta(days=1)
    
    start_date = first_day
    if db is not None and user_id is not None:
        # Look for the earliest expense that could be part of this month's budget cycle.
        # Budget cycles can span two calendar months (e.g., March 18 to April 17),
        # so we search from the previous month to the end of the current month.
        search_start = first_day.replace(day=1) - timedelta(days=1)
        search_start = search_start.replace(day=1)  # First day of previous month
        search_end = last_day
        
        first_expense_rs = db.execute(
            '''SELECT MIN(date) as first_expense_date
               FROM expenses
               WHERE user_id = ? AND date BETWEEN ? AND ?''',
            (user_id, search_start.strftime('%Y-%m-%d'), search_end.strftime('%Y-%m-%d'))
        )
        first_expense_row = db.fetchone(first_expense_rs)
        first_expense_date = first_expense_row.get('first_expense_date') if first_expense_row else None
        if first_expense_date:
            try:
                parsed_date = datetime.strptime(first_expense_date, '%Y-%m-%d')
                # Only use the expense date if it's before or on the current month's first day
                # This ensures we're capturing the true start of the budget cycle
                if parsed_date <= last_day:
                    start_date = parsed_date
            except ValueError:
                app.logger.warning(f"Invalid expense date format for weekly boundary calculation: {first_expense_date}")

    month_days = (last_day - first_day).days + 1
    cycle_end = start_date + timedelta(days=month_days - 1)

    weeks = []
    current_date = start_date
    week_index = 1
    
    while current_date <= cycle_end:
        week_start = current_date
        week_end = min(week_start + timedelta(days=6), cycle_end)
        
        weeks.append((week_index, week_start.strftime('%Y-%m-%d'), week_end.strftime('%Y-%m-%d')))
        current_date = week_end + timedelta(days=1)
        week_index += 1
    
    return weeks

def get_weekly_spent(db, user_id, month_str, week_start, week_end):
    """Sum of all expenses in a given week for a user."""
    rs = db.execute(
        '''SELECT COALESCE(SUM(amount), 0) as total FROM expenses 
           WHERE user_id = ? AND date BETWEEN ? AND ?''',
        (user_id, week_start, week_end)
    )
    row = db.fetchone(rs)
    return row['total'] if row else 0.0

def initialize_weekly_budgets(db, user_id, month_str):
    """Initialize weekly budgets for a month if not already present."""
    from datetime import datetime
    now = datetime.utcnow().isoformat()
    weeks = get_week_boundaries(month_str, db, user_id)

    valid_week_indices = [week_index for week_index, _, _ in weeks]
    if valid_week_indices:
        placeholders = ','.join('?' for _ in valid_week_indices)
        db.execute(
            f'''DELETE FROM weekly_budgets
                WHERE user_id = ? AND month = ? AND week_index NOT IN ({placeholders})''',
            (user_id, month_str, *valid_week_indices)
        )
    else:
        db.execute(
            'DELETE FROM weekly_budgets WHERE user_id = ? AND month = ?',
            (user_id, month_str)
        )
    
    for week_index, _, _ in weeks:
        # Check if already exists
        rs = db.execute(
            'SELECT id FROM weekly_budgets WHERE user_id = ? AND month = ? AND week_index = ?',
            (user_id, month_str, week_index)
        )
        if not db.fetchone(rs):
            db.execute(
                '''INSERT INTO weekly_budgets 
                   (user_id, month, week_index, base_budget, carry_in, effective_budget, spent, variance, status, created_at, updated_at)
                   VALUES (?, ?, ?, 0, 0, 0, 0, 0, 'normal', ?, ?)''',
                (user_id, month_str, week_index, now, now)
            )
    db.commit()

def recalculate_weekly_budgets(db, user_id, month_str):
    """
        Recalculate all weekly budgets for a month:
        - Compute spent for each week
        - Compute variance (effective_budget - spent)
        - Redistribute only overspend across remaining weeks equally
            (week excess reduces future week budgets)
    """
    from datetime import datetime, date
    weeks = get_week_boundaries(month_str, db, user_id)
    now = datetime.utcnow().isoformat()
    today_str = date.today().isoformat()
    
    # Fetch all weekly budgets for this month
    wb_rs = db.execute(
        '''SELECT * FROM weekly_budgets 
           WHERE user_id = ? AND month = ? 
           ORDER BY week_index''',
        (user_id, month_str)
    )
    weekly_data = {row['week_index']: row for row in db.fetchall(wb_rs)}
    
    # Calculate spent for each week
    for week_index, week_start, week_end in weeks:
        spent = get_weekly_spent(db, user_id, month_str, week_start, week_end)
        if week_index in weekly_data:
            weekly_data[week_index]['spent'] = spent
    
    # Compute effective budgets with progressive redistribution of variance.
    # Example: if week 1 overspends by 3000 and 3 weeks remain, each next week gets -1000.
    ordered_week_indexes = [week_index for week_index, _, _ in weeks if week_index in weekly_data]
    week_end_by_index = {week_index: week_end for week_index, _, week_end in weeks}
    future_adjustments = {week_index: 0.0 for week_index in ordered_week_indexes}

    for position, week_index in enumerate(ordered_week_indexes):
        wd = weekly_data[week_index]

        carry_in = future_adjustments.get(week_index, 0.0)
        effective_budget = float(wd['base_budget']) + carry_in
        variance = effective_budget - float(wd['spent'])

        wd['carry_in'] = carry_in
        wd['effective_budget'] = effective_budget
        wd['variance'] = variance
        wd['status'] = 'safe' if wd['spent'] <= wd['effective_budget'] else 'over'

        remaining_weeks = len(ordered_week_indexes) - position - 1
        week_end = week_end_by_index.get(week_index)
        is_completed_week = bool(week_end and week_end <= today_str)

        if remaining_weeks > 0 and is_completed_week and variance < 0:
            per_week_adjustment = variance / remaining_weeks
            for future_week_index in ordered_week_indexes[position + 1:]:
                future_adjustments[future_week_index] = (
                    future_adjustments.get(future_week_index, 0.0) + per_week_adjustment
                )
    
    # Write back to DB
    for week_index, wd in weekly_data.items():
        db.execute(
            '''UPDATE weekly_budgets 
               SET carry_in = ?, effective_budget = ?, spent = ?, variance = ?, status = ?, updated_at = ?
               WHERE user_id = ? AND month = ? AND week_index = ?''',
            (wd['carry_in'], wd['effective_budget'], wd['spent'], wd['variance'], wd['status'], now, user_id, month_str, week_index)
        )
    db.commit()

# ========== END WEEKLY BUDGET HELPERS ==========

def get_budget_data(active_month):
    """Fetches and calculates all necessary data for a given month for the current user."""
    app.logger.info(f"--- Fetching data for active_month: {active_month} ---")
    if not current_user.is_authenticated:
        return {}
    db = get_db()

    # Fetch all data for the active month for current user
    expenses_rs = db.execute('SELECT * FROM expenses WHERE month = ? AND user_id = ? ORDER BY date DESC', (active_month, current_user.id))
    expenses = db.fetchall(expenses_rs)
    app.logger.info(f"Found {len(expenses)} expenses.")

    income_rs = db.execute('SELECT * FROM income WHERE month = ? AND user_id = ? ORDER BY id DESC', (active_month, current_user.id))
    income = db.fetchall(income_rs)
    app.logger.info(f"Found {len(income)} income records.")

    emis_rs = db.execute('SELECT * FROM emis WHERE month = ? AND user_id = ? ORDER BY id DESC', (active_month, current_user.id))
    emis = db.fetchall(emis_rs)
    app.logger.info(f"Found {len(emis)} EMI records.")

    budget_cursor = db.execute('SELECT id, category, amount FROM budgets WHERE month = ? AND user_id = ?', (active_month, current_user.id))
    budget_list = db.fetchall(budget_cursor)
    budget = {row['category']: row['amount'] for row in budget_list}
    app.logger.info(f"Found budget categories: {list(budget.keys())}")


    # --- SERVER-SIDE CALCULATIONS ---
    total_income = sum(i['amount'] for i in income)
    total_expenses = sum(e['amount'] for e in expenses)
    total_emi = sum(e['emi_amount'] for e in emis)
    total_budget = sum(budget.values())
    remaining_budget = total_budget - total_expenses
    net_savings = total_income - (total_expenses + total_emi)
    
    app.logger.info(f"Calculated Totals: Income={total_income}, Expenses={total_expenses}, EMI={total_emi}, Budget={total_budget}")


    # Prepare data for bar chart (budget vs. spent)
    category_totals = {}
    for expense in expenses:
        category = expense['category']
        amount = expense['amount']
        category_totals[category] = category_totals.get(category, 0) + amount

    chart_labels = sorted(set(list(category_totals.keys()) + list(budget.keys())))
    budget_values = [budget.get(cat, 0) for cat in chart_labels]
    spent_values = [category_totals.get(cat, 0) for cat in chart_labels]

    # Fetch recent transactions for mobile view
    # Ensure date for income is a full date string for proper sorting
    recent_trans_rs = db.execute("""
        SELECT date, category, description, amount, 'expense' as type
        FROM expenses
        WHERE month = ? AND user_id = ?
        UNION ALL
        SELECT month || '-01' as date, 'Income' as category, description, amount, 'income' as type
        FROM income
        WHERE month = ? AND user_id = ?
        ORDER BY date DESC
        LIMIT 5
    """, (active_month, current_user.id, active_month, current_user.id))
    recent_transactions = db.fetchall(recent_trans_rs)
    app.logger.info(f"Found {len(recent_transactions)} recent transactions for mobile view.")

    # This dictionary is the single source of truth for the frontend.
    result_data = {
        'active_month': active_month,
        'expenses': expenses,
        'income': income,
        'emis': emis,
        'budget': budget,
        'budgets_list': budget_list,
        'doughnut_chart_labels': chart_labels,
        'budget_values': budget_values,
        'spent_values': spent_values,
        'total_income': total_income,
        'total_expenses': total_expenses,
        'total_emi': total_emi,
        'total_budget': total_budget,
        'remaining_budget': remaining_budget,
        'net_savings': net_savings,
        'recent_transactions': recent_transactions
    }
    app.logger.info(f"--- Finished fetching data for {active_month}. Returning {len(result_data)} keys. ---")
    return result_data


def upsert_budget_amount(db, user_id, month_value, category_name, amount_value):
    category = (category_name or '').strip()
    if not category:
        raise ValueError('Budget category is required.')

    existing_rs = db.execute(
        'SELECT id FROM budgets WHERE user_id = ? AND month = ? AND category = ? LIMIT 1',
        (user_id, month_value, category)
    )
    existing = db.fetchone(existing_rs)

    if existing:
        db.execute(
            'UPDATE budgets SET amount = ? WHERE user_id = ? AND month = ? AND category = ?',
            (amount_value, user_id, month_value, category)
        )
    else:
        db.execute(
            'INSERT INTO budgets (user_id, month, category, amount) VALUES (?, ?, ?, ?)',
            (user_id, month_value, category, amount_value)
        )

@app.route('/api/report_data', methods=['GET'])
@login_required
def api_report_data():
    """API endpoint to fetch all dashboard data for a given month."""
    active_month = request.args.get('month_select')
    if not active_month:
        return jsonify({'status': 'error', 'message': 'Month parameter is required.'}), 400

    try:
        data = get_budget_data(active_month)
        return jsonify(data)
    except Exception as e:
        app.logger.error(f"Error fetching report data for month {active_month}: {e}")
        return jsonify({'status': 'error', 'message': 'An internal error occurred.'}), 500

# ========== WEEKLY BUDGET ENDPOINTS ==========

@app.route('/api/weekly_budget', methods=['GET'])
@login_required
def api_get_weekly_budget():
    """Fetch all weekly budgets for a given month."""
    month = request.args.get('month')
    if not month:
        return jsonify({'status': 'error', 'message': 'Month parameter required'}), 400
    
    try:
        db = get_db()
        initialize_weekly_budgets(db, current_user.id, month)
        recalculate_weekly_budgets(db, current_user.id, month)
        
        weeks = get_week_boundaries(month, db, current_user.id)
        wb_rs = db.execute(
            'SELECT * FROM weekly_budgets WHERE user_id = ? AND month = ? ORDER BY week_index',
            (current_user.id, month)
        )
        weekly_budgets = db.fetchall(wb_rs)
        
        result = []
        for i, (week_index, start, end) in enumerate(weeks):
            wb = weekly_budgets[i] if i < len(weekly_budgets) else {}
            result.append({
                'week_index': week_index,
                'week_start': start,
                'week_end': end,
                'base_budget': wb.get('base_budget', 0),
                'carry_in': wb.get('carry_in', 0),
                'effective_budget': wb.get('effective_budget', 0),
                'spent': wb.get('spent', 0),
                'variance': wb.get('variance', 0),
                'status': wb.get('status', 'normal')
            })
        
        return jsonify({'status': 'success', 'weekly_budgets': result})
    except Exception as e:
        app.logger.error(f"Error fetching weekly budget: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/weekly_budget/set', methods=['POST'])
@login_required
def api_set_weekly_budget():
    """Set base budget for a specific week."""
    data = request.get_json() or {}
    month = data.get('month')
    week_index = data.get('week_index')
    base_budget = float(data.get('base_budget', 0))
    
    if not month or week_index is None:
        return jsonify({'status': 'error', 'message': 'Month and week_index required'}), 400
    
    try:
        db = get_db()
        from datetime import datetime
        now = datetime.utcnow().isoformat()
        
        db.execute(
            '''UPDATE weekly_budgets 
               SET base_budget = ?, updated_at = ?
               WHERE user_id = ? AND month = ? AND week_index = ?''',
            (base_budget, now, current_user.id, month, week_index)
        )
        db.commit()
        
        # Recalculate all weeks after change
        recalculate_weekly_budgets(db, current_user.id, month)
        
        return jsonify({'status': 'success', 'message': 'Weekly budget updated'})
    except Exception as e:
        app.logger.error(f"Error setting weekly budget: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/weekly_budget/set_all', methods=['POST'])
@login_required
def api_set_all_weekly_budget():
    """Set one monthly budget value and distribute it across weeks by day count."""
    data = request.get_json() or {}
    month = data.get('month')

    if not month:
        return jsonify({'status': 'error', 'message': 'Month is required'}), 400

    try:
        monthly_budget = float(data.get('monthly_budget', data.get('base_budget', 0)))
    except (TypeError, ValueError):
        return jsonify({'status': 'error', 'message': 'Invalid monthly budget value'}), 400

    try:
        db = get_db()
        initialize_weekly_budgets(db, current_user.id, month)

        from datetime import datetime
        from datetime import datetime as dt
        now = datetime.utcnow().isoformat()
        weeks = get_week_boundaries(month, db, current_user.id)
        if not weeks:
            return jsonify({'status': 'error', 'message': 'No weeks available for this month'}), 400

        total_days = 0
        week_day_counts = {}
        for week_index, week_start, week_end in weeks:
            start_dt = dt.strptime(week_start, '%Y-%m-%d')
            end_dt = dt.strptime(week_end, '%Y-%m-%d')
            day_count = (end_dt - start_dt).days + 1
            week_day_counts[week_index] = day_count
            total_days += day_count

        if total_days <= 0:
            return jsonify({'status': 'error', 'message': 'Invalid week day distribution'}), 400

        remaining_budget = round(monthly_budget, 2)
        allocations = []

        for index, (week_index, _, _) in enumerate(weeks):
            if index == len(weeks) - 1:
                allocated_budget = remaining_budget
            else:
                allocated_budget = round((monthly_budget * week_day_counts[week_index]) / total_days, 2)
                remaining_budget = round(remaining_budget - allocated_budget, 2)

            allocations.append((week_index, allocated_budget))

        for week_index, allocated_budget in allocations:
            db.execute(
                '''UPDATE weekly_budgets
                   SET base_budget = ?, updated_at = ?
                   WHERE user_id = ? AND month = ? AND week_index = ?''',
                (allocated_budget, now, current_user.id, month, week_index)
            )

        db.commit()
        recalculate_weekly_budgets(db, current_user.id, month)

        return jsonify({'status': 'success', 'message': 'Monthly budget distributed across weeks'})
    except Exception as e:
        app.logger.error(f"Error setting all weekly budgets: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

# ========== END WEEKLY BUDGET ENDPOINTS ==========

# Health check endpoint to prevent cold starts
@app.route('/health', methods=['GET'])
def health_check():
    """Lightweight health check endpoint to keep the app alive and prevent cold starts"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'message': 'Budget app is running'
    }), 200

@app.route('/', methods=['GET'])
@login_required
def index():
    # Use smart default month detection, but allow manual override via URL parameter
    smart_default = get_smart_default_month()
    active_month = request.args.get('month_select', default=smart_default)
    
    app.logger.info(f"Index route: Smart default month = {smart_default}, URL param = {request.args.get('month_select')}, Final active_month = {active_month}")
    
    # Check for a success message passed in the URL, used for redirects from edit pages
    flash_success = request.args.get('flash_success')
    if flash_success:
        flash(flash_success, 'success')

    js_data = get_budget_data(active_month)

    db = get_db()
    available_months_rs = db.execute('''
        SELECT DISTINCT strftime("%Y-%m", date) as month FROM expenses WHERE user_id = ?
        UNION
        SELECT DISTINCT month FROM income WHERE user_id = ?
        UNION
        SELECT DISTINCT month FROM emis WHERE user_id = ?
        ORDER BY month DESC
    ''', (current_user.id, current_user.id, current_user.id))
    available_months = [row['month'] for row in db.fetchall(available_months_rs)]
    category_options = get_user_category_options(current_user.id, active_month)

    return render_template('index.html', 
                         js_data=js_data, 
                         active_month=active_month, 
                         available_months=available_months, 
                         category_options=category_options,
                         current_date=datetime.now().strftime('%Y-%m-%d'),
                         # Pass individual data points that the template still needs directly
                         budget=js_data.get('budget', {}),
                         income=js_data.get('income', []),
                         expenses=js_data.get('expenses', []),
                         emis=js_data.get('emis', []))


@app.route('/add_expense', methods=['POST'])
@login_required
def add_expense():
    active_month = request.form.get('month_select')
    date = request.form.get('date')
    category = request.form.get('category')
    description = request.form.get('description')
    amount = request.form.get('amount')
    payment_type = request.form.get('payment_type')

    if not all([active_month, date, category, description, amount, payment_type]):
        flash('All fields are required!', 'error')
        return redirect(url_for('index', month_select=active_month))

    try:
        # The month for the expense record matches the selected month view
        month_for_db = active_month

        db = get_db()
        db.execute(
            '''INSERT INTO expenses (user_id, month, date, category, description, amount, payment_type)
               VALUES (?, ?, ?, ?, ?, ?, ?)''',
            (current_user.id, month_for_db, date, category, description, float(amount), payment_type)
        )
        db.commit()
        flash('Expense added successfully!', 'success')
    except ValueError:
        flash('Invalid amount entered. Please use numbers only.', 'error')
    except Exception as e:
        app.logger.error(f"Error adding expense: {e}")
        flash('An error occurred while adding the expense.', 'error')

    return redirect(url_for('index', month_select=active_month))


@app.route('/api/add_expense', methods=['POST'])
@login_required
def api_add_expense():
    active_month = request.form.get('month_select')
    date = request.form.get('date')
    category = request.form.get('category')
    description = request.form.get('description')
    amount = request.form.get('amount')
    payment_type = request.form.get('payment_type')

    if not all([active_month, date, category, description, amount, payment_type]):
        return jsonify({'status': 'error', 'message': 'All fields are required!'}), 400

    try:
        month_for_db = active_month
        db = get_db()
        db.execute(
            '''INSERT INTO expenses (user_id, month, date, category, description, amount, payment_type)
               VALUES (?, ?, ?, ?, ?, ?, ?)''',
            (current_user.id, month_for_db, date, category, description, float(amount), payment_type)
        )
        db.commit()
        
        return jsonify({'status': 'success', 'message': 'Expense added successfully!'})
    except ValueError:
        return jsonify({'status': 'error', 'message': 'Invalid amount. Please use numbers only.'}), 400
    except Exception as e:
        app.logger.error(f"Error adding expense via API: {e}")
        return jsonify({'status': 'error', 'message': 'An error occurred while adding the expense.'}), 500


@app.route('/api/add_income', methods=['POST'])
@login_required
def api_add_income():
    description = request.form.get('description')
    amount = request.form.get('amount')
    month = request.form.get('month_select')

    if not all([description, amount, month]):
        return jsonify({'status': 'error', 'message': 'All fields are required!'}), 400

    try:
        db = get_db()
        num_months = 3  # Default to adding income for the next 3 months
        start_month = datetime.strptime(month, '%Y-%m')
        
        queries = []
        for i in range(num_months):
            current_month_dt = start_month + relativedelta(months=i)
            current_month_str = current_month_dt.strftime('%Y-%m')
            queries.append(
                ('INSERT INTO income (user_id, description, amount, month) VALUES (?, ?, ?, ?)',
                (current_user.id, description, float(amount), current_month_str))
            )
        
        db.execute_batch(queries)
        message = f'Income added for {num_months} months successfully!'
        return jsonify({'status': 'success', 'message': message})
    except ValueError:
        return jsonify({'status': 'error', 'message': 'Invalid amount. Please use numbers only.'}), 400
    except Exception as e:
        app.logger.error(f"Error adding income via API: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': 'An error occurred while adding the income.'}), 500

@app.route('/api/add_emi', methods=['POST'])
@login_required
def api_add_emi():
    loan_name = request.form.get('loan_name')
    emi_amount = request.form.get('emi_amount')
    month = request.form.get('month_select')

    if not all([loan_name, emi_amount, month]):
        return jsonify({'status': 'error', 'message': 'All fields are required!'}), 400
    
    try:
        db = get_db()
        num_months = 3  # Default to adding EMI for the next 3 months
        start_month = datetime.strptime(month, '%Y-%m')

        queries = []
        for i in range(num_months):
            current_month_dt = start_month + relativedelta(months=i)
            current_month_str = current_month_dt.strftime('%Y-%m')
            queries.append(
                ('INSERT INTO emis (user_id, loan_name, emi_amount, month) VALUES (?, ?, ?, ?)',
                (current_user.id, loan_name, float(emi_amount), current_month_str))
            )

        db.execute_batch(queries)
        message = f'EMI added for {num_months} months successfully!'
        return jsonify({'status': 'success', 'message': message})
    except ValueError:
        return jsonify({'status': 'error', 'message': 'Invalid amount. Please use numbers only.'}), 400
    except Exception as e:
        app.logger.error(f"Error adding EMI via API: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': 'An error occurred while adding the EMI.'}), 500


@app.route('/set_budget', methods=['POST'])
@login_required
def set_budget():
    active_month = request.form.get('month_select')
    categories = request.form.getlist('budget_category[]')
    amounts = request.form.getlist('budget_amount[]')
    budget_map = {}

    if categories and amounts:
        for category_raw, amount_raw in zip(categories, amounts):
            category_name = (category_raw or '').strip()
            amount_text = (amount_raw or '').strip()
            if not category_name or not amount_text:
                continue
            try:
                budget_map[category_name] = float(amount_text)
            except ValueError:
                flash(f'Invalid amount entered for {category_name}. Please use numbers only.', 'error')
                return redirect(url_for('index', month_select=active_month))
    else:
        single_category = (request.form.get('category') or '').strip()
        single_amount = (request.form.get('amount') or '').strip()

        if single_category or single_amount:
            if not single_category or not single_amount:
                flash('Category and amount are required.', 'error')
                return redirect(url_for('index', month_select=active_month))
            try:
                budget_map[single_category] = float(single_amount)
            except ValueError:
                flash('Invalid amount entered. Please use numbers only.', 'error')
                return redirect(url_for('index', month_select=active_month))
        else:
            for category_name in DEFAULT_CATEGORY_OPTIONS:
                amount_text = (request.form.get(category_name) or '').strip()
                if not amount_text:
                    continue
                try:
                    budget_map[category_name] = float(amount_text)
                except ValueError:
                    flash(f'Invalid amount entered for {category_name}. Please use numbers only.', 'error')
                    return redirect(url_for('index', month_select=active_month))

    if not budget_map:
        flash('Please add at least one budget category with amount.', 'error')
        return redirect(url_for('index', month_select=active_month))

    try:
        db = get_db()
        for category_name, amount in budget_map.items():
            upsert_budget_amount(db, current_user.id, active_month, category_name, amount)
        db.commit()
    except Exception as e:
        app.logger.error(f"Error setting budget: {e}")
        flash('An error occurred while setting budget categories.', 'error')
        return redirect(url_for('index', month_select=active_month))
    
    flash('Budget updated successfully!', 'success')
    return redirect(url_for('index', month_select=active_month))


@app.route('/api/set_budget', methods=['POST'])
@login_required
def api_set_budget():
    active_month = request.form.get('month_select')
    category = request.form.get('category')
    amount = request.form.get('amount')

    if not all([active_month, category, amount]):
        return jsonify({'status': 'error', 'message': 'All fields are required!'}), 400

    try:
        db = get_db()
        upsert_budget_amount(db, current_user.id, active_month, category, float(amount))
        db.commit()
        return jsonify({'status': 'success', 'message': 'Budget set successfully!'})
    except ValueError:
        return jsonify({'status': 'error', 'message': 'Invalid amount. Please use numbers only.'}), 400
    except Exception as e:
        app.logger.error(f"Error setting budget via API: {e}")
        return jsonify({'status': 'error', 'message': 'An error occurred while setting the budget.'}), 500


@app.route('/api/set_budgets', methods=['POST'])
@login_required
def api_set_budgets():
    active_month = request.form.get('month_select')

    if not active_month:
        return jsonify({'status': 'error', 'message': 'Month is required!'}), 400

    try:
        db = get_db()
        num_months = 3  # Default to propagating the budget for the next 3 months
        start_month = datetime.strptime(active_month, '%Y-%m')
        categories = request.form.getlist('budget_category[]')
        amounts = request.form.getlist('budget_amount[]')

        budget_map = {}
        if categories and amounts:
            for category_raw, amount_raw in zip(categories, amounts):
                category_name = (category_raw or '').strip()
                amount_text = (amount_raw or '').strip()
                if not category_name or not amount_text:
                    continue
                budget_map[category_name] = float(amount_text)
        else:
            for category_name in DEFAULT_CATEGORY_OPTIONS:
                amount_text = (request.form.get(category_name, '0.0') or '').strip()
                if not amount_text:
                    continue
                budget_map[category_name] = float(amount_text)

        if not budget_map:
            return jsonify({'status': 'error', 'message': 'Add at least one budget category and amount.'}), 400
        
        for i in range(num_months):
            current_month_dt = start_month + relativedelta(months=i)
            current_month_str = current_month_dt.strftime('%Y-%m')

            for category, amount in budget_map.items():
                upsert_budget_amount(db, current_user.id, current_month_str, category, amount)
        db.commit()
        message = f'Budget updated for {num_months} months successfully!'
        return jsonify({'status': 'success', 'message': message})
    except ValueError as e:
        app.logger.error(f"Error setting budgets via API: Invalid amount - {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': 'Invalid amount entered. Please use numbers only.'}), 400
    except Exception as e:
        app.logger.error(f"Error setting budgets via API: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': 'An error occurred while updating the budget.'}), 500


@app.route('/api/get_income/<int:income_id>', methods=['GET'])
@login_required
def api_get_income(income_id):
    """API endpoint to fetch a single income entry by its ID."""
    try:
        db = get_db()
        income_rs = db.execute('SELECT * FROM income WHERE id = ? AND user_id = ?', (income_id, current_user.id))
        income = db.fetchone(income_rs)
        if income:
            return jsonify(income)
        else:
            return jsonify({'status': 'error', 'message': 'Income entry not found'}), 404
    except Exception as e:
        app.logger.error(f"Error fetching income via API: {e}")
        return jsonify({'status': 'error', 'message': 'An error occurred'}), 500

@app.route('/api/get_emi/<int:emi_id>', methods=['GET'])
@login_required
def api_get_emi(emi_id):
    """API endpoint to fetch a single EMI entry by its ID."""
    try:
        db = get_db()
        emi_rs = db.execute('SELECT * FROM emis WHERE id = ? AND user_id = ?', (emi_id, current_user.id))
        emi = db.fetchone(emi_rs)
        if emi:
            return jsonify(emi)
        else:
            return jsonify({'status': 'error', 'message': 'EMI entry not found'}), 404
    except Exception as e:
        app.logger.error(f"Error fetching EMI via API: {e}")
        return jsonify({'status': 'error', 'message': 'An error occurred'}), 500



# This route is kept for non-JS compatibility if needed, but the primary delete is via API
@app.route('/delete_expense/<int:expense_id>', methods=['POST'])
@login_required
def delete_expense(expense_id):
    """Route to delete a single expense item."""
    # The month is needed to redirect back correctly
    smart_default = get_smart_default_month()
    active_month = request.args.get('month_select', default=smart_default)
    try:
        db = get_db()
        db.execute('DELETE FROM expenses WHERE id = ? AND user_id = ?', (expense_id, current_user.id))
        db.commit()
        flash('Expense deleted successfully!', 'success')
    except Exception as e:
        app.logger.error(f"Error deleting expense {expense_id}: {e}")
        flash('An error occurred while deleting the expense.', 'error')
    return redirect(url_for('index', month_select=active_month))


# This route is kept for non-JS compatibility if needed, but the primary edit is via API
@app.route('/edit_expense/<int:expense_id>', methods=['GET', 'POST'])
@login_required
def edit_expense(expense_id):
    db = get_db()
    smart_default = get_smart_default_month()
    active_month = request.args.get('month_select', default=smart_default)

    if request.method == 'POST':
        date = request.form['date']
        category = request.form['category']
        description = request.form['description']
        amount = request.form['amount']
        payment_type = request.form['payment_type']
        # Use the active_month from the form, not the expense's date
        month_for_db = request.form.get('month_select', active_month)

        db.execute('''UPDATE expenses 
                   SET month = ?, date = ?, category = ?, description = ?, amount = ?, payment_type = ?
                   WHERE id = ? AND user_id = ?''',
                   (month_for_db, date, category, description, float(amount), payment_type, expense_id, current_user.id))
        db.commit()
        flash('Expense updated successfully!', 'success')
        return redirect(url_for('index', month_select=month_for_db))

    # For GET request
    expense_rs = db.execute('SELECT * FROM expenses WHERE id = ? AND user_id = ?', (expense_id, current_user.id))
    expense = db.fetchone(expense_rs)
    if expense is None:
        flash('Expense not found!', 'error')
        return redirect(url_for('index', month_select=active_month))

    # Pass the expense object as 'item' and specify the 'item_type'
    return render_template(
        'edit_item.html',
        item=expense,
        item_type='expense',
        active_month=active_month,
        category_options=get_user_category_options(current_user.id)
    )


@app.route('/edit_item/<int:item_id>', methods=['GET'])
@login_required
def edit_item(item_id):
    """Serves the page to edit an existing expense."""
    db = get_db()
    smart_default = get_smart_default_month()
    active_month = request.args.get('month_select', smart_default)
    
    item_cursor = db.execute('SELECT * FROM expenses WHERE id = ? AND user_id = ?', (item_id, current_user.id))
    item = db.fetchone(item_cursor)

    if item is None:
        return "Item not found", 404
        
    return render_template(
        'edit_item.html',
        item=item,
        active_month=active_month,
        category_options=get_user_category_options(current_user.id)
    )

@app.route('/edit_income/<int:income_id>', methods=['GET'])
@login_required
def edit_income(income_id):
    """Serves the page to edit an existing income record."""
    db = get_db()
    smart_default = get_smart_default_month()
    active_month = request.args.get('month_select', smart_default)

    income_cursor = db.execute('SELECT * FROM income WHERE id = ? AND user_id = ?', (income_id, current_user.id))
    income = db.fetchone(income_cursor)

    if income is None:
        return "Income record not found", 404
        
    return render_template('edit_income.html', income=income, active_month=active_month)

@app.route('/edit_emi/<int:emi_id>', methods=['GET'])
@login_required
def edit_emi(emi_id):
    """Serves the page to edit an existing EMI record."""
    db = get_db()
    smart_default = get_smart_default_month()
    active_month = request.args.get('month_select', smart_default)

    emi_cursor = db.execute('SELECT * FROM emis WHERE id = ? AND user_id = ?', (emi_id, current_user.id))
    emi = db.fetchone(emi_cursor)

    if emi is None:
        return "EMI record not found", 404
        
    return render_template('edit_emi.html', emi=emi, active_month=active_month)


@app.route('/api/edit_item/<int:item_id>', methods=['POST'])
@login_required
def api_edit_item(item_id):
    """API endpoint to update an existing expense."""
    date = request.form.get('date')
    category = request.form.get('category')
    description = request.form.get('description')
    amount = request.form.get('amount')
    payment_type = request.form.get('payment_type')
    # Use the active_month from the form, not the expense's date
    active_month = request.form.get('month_select')

    if not all([date, category, description, amount, payment_type, active_month]):
        return jsonify({'status': 'error', 'message': 'All fields are required!'}), 400

    try:
        month_for_db = active_month
        db = get_db()
        db.execute(
            """UPDATE expenses 
               SET date = ?, category = ?, description = ?, amount = ?, payment_type = ?, month = ?
               WHERE id = ? AND user_id = ?""",
            (date, category, description, float(amount), payment_type, month_for_db, item_id, current_user.id)
        )
        db.commit()
        return jsonify({'status': 'success', 'message': 'Expense updated successfully!'})
    except ValueError:
        return jsonify({'status': 'error', 'message': 'Invalid amount. Please use numbers only.'}), 400
    except Exception as e:
        app.logger.error(f"Error updating expense {item_id} via API: {e}")
        return jsonify({'status': 'error', 'message': 'An error occurred while updating the expense.'}), 500


# --- RESTORE /api/edit_emi/<int:emi_id> API ENDPOINT ---
@app.route('/api/edit_emi/<int:emi_id>', methods=['POST'])
@login_required
def api_edit_emi(emi_id):
    """API endpoint to update an existing EMI record."""
    loan_name = request.form.get('loan_name')
    emi_amount = request.form.get('emi_amount')
    month = request.form.get('month')

    if not all([loan_name, emi_amount, month]):
        return jsonify({'status': 'error', 'message': 'All fields are required!'}), 400

    try:
        db = get_db()
        db.execute(
            'UPDATE emis SET loan_name = ?, emi_amount = ? WHERE id = ? AND user_id = ?',
            (loan_name, float(emi_amount), emi_id, current_user.id)
        )
        db.commit()
        message = 'EMI updated successfully!'

        return jsonify({'status': 'success', 'message': message})
    except ValueError:
        return jsonify({'status': 'error', 'message': 'Invalid amount. Please use numbers only.'}), 400
    except Exception as e:
        app.logger.error(f"Error updating EMI {emi_id} via API: {e}")
        return jsonify({'status': 'error', 'message': 'An error occurred while updating the EMI.'}), 500



@app.route('/api/edit_expense/<int:expense_id>', methods=['GET', 'POST'])
@login_required
def api_edit_expense(expense_id):
    db = get_db()
    if request.method == 'GET':
        try:
            rs = db.execute('SELECT * FROM expenses WHERE id = ? AND user_id = ?', (expense_id, current_user.id))
            expense = db.fetchone(rs)
            if expense is None:
                return jsonify({'status': 'error', 'message': 'Expense not found.'}), 404
            return jsonify({'status': 'success', 'expense': dict(expense)})
        except Exception as e:
            app.logger.error(f"Error fetching expense {expense_id}: {e}")
            return jsonify({'status': 'error', 'message': 'Failed to fetch expense.'}), 500
    else:  # POST
        try:
            data = request.get_json() or {}
            date = data.get('date', '')
            category = data.get('category', '')
            description = data.get('description', '')
            amount = data.get('amount', '')
            payment_type = data.get('payment_type', '')
            month = data.get('month', '')
            if not all([date, category, description, amount, payment_type, month]):
                return jsonify({'status': 'error', 'message': 'All fields are required.'}), 400
            db.execute(
                '''UPDATE expenses SET month=?, date=?, category=?, description=?, amount=?, payment_type=?
                   WHERE id=? AND user_id=?''',
                (month, date, category, description, float(amount), payment_type, expense_id, current_user.id)
            )
            db.commit()
            return jsonify({'status': 'success', 'message': 'Expense updated successfully!'})
        except Exception as e:
            app.logger.error(f"Error updating expense {expense_id}: {e}")
            return jsonify({'status': 'error', 'message': 'Failed to update expense.'}), 500


@app.route('/api/delete_expense/<int:item_id>', methods=['POST'])
@login_required
def api_delete_expense_post(item_id):
    try:
        db = get_db()
        db.execute('DELETE FROM expenses WHERE id = ? AND user_id = ?', (item_id, current_user.id))
        db.commit()
        return jsonify({'status': 'success', 'message': 'Expense deleted successfully!'})
    except Exception as e:
        app.logger.error(f"Error deleting expense {item_id}: {e}")
        return jsonify({'status': 'error', 'message': 'An error occurred while deleting the expense.'}), 500

@app.route('/api/delete_income/<int:income_id>', methods=['POST'])
@login_required
def api_delete_income(income_id):
    try:
        db = get_db()
        db.execute('DELETE FROM income WHERE id = ? AND user_id = ?', (income_id, current_user.id))
        db.commit()
        return jsonify({'status': 'success', 'message': 'Income record deleted successfully!'})
    except Exception as e:
        app.logger.error(f"Error deleting income {income_id}: {e}")
        return jsonify({'status': 'error', 'message': 'An error occurred while deleting the income record.'}), 500

@app.route('/api/delete_emi/<int:emi_id>', methods=['POST'])
@login_required
def api_delete_emi(emi_id):
    try:
        db = get_db()
        db.execute('DELETE FROM emis WHERE id = ? AND user_id = ?', (emi_id, current_user.id))
        db.commit()
        return jsonify({'status': 'success', 'message': 'EMI record deleted successfully!'})
    except Exception as e:
        app.logger.error(f"Error deleting EMI {emi_id}: {e}")
        return jsonify({'status': 'error', 'message': 'An error occurred while deleting the EMI record.'}), 500

@app.route('/api/edit_budget/<int:budget_id>', methods=['POST'])
@login_required
def api_edit_budget(budget_id):
    """Inline edit for budget records."""
    try:
        data = request.get_json() or {}
        category = (data.get('category') or '').strip()
        amount = data.get('amount')
        
        if not category or amount is None:
            return jsonify({'status': 'error', 'message': 'Category and amount are required.'}), 400
        
        try:
            amount = float(amount)
        except (ValueError, TypeError):
            return jsonify({'status': 'error', 'message': 'Amount must be a valid number.'}), 400
        
        db = get_db()
        current_budget_rs = db.execute(
            'SELECT id, month, category FROM budgets WHERE id = ? AND user_id = ?',
            (budget_id, current_user.id)
        )
        current_budget = db.fetchone(current_budget_rs)

        if not current_budget:
            return jsonify({'status': 'error', 'message': 'Budget record not found.'}), 404

        duplicate_budget_rs = db.execute(
            'SELECT id FROM budgets WHERE user_id = ? AND month = ? AND category = ? AND id != ?',
            (current_user.id, current_budget['month'], category, budget_id)
        )
        duplicate_budget = db.fetchone(duplicate_budget_rs)

        if duplicate_budget:
            return jsonify({'status': 'error', 'message': 'A budget with this category already exists for the selected month.'}), 400

        db.execute(
            'UPDATE budgets SET category = ?, amount = ? WHERE id = ? AND user_id = ?',
            (category, amount, budget_id, current_user.id)
        )
        db.commit()
        
        return jsonify({
            'status': 'success',
            'message': 'Budget record updated successfully!',
            'budget': {
                'id': budget_id,
                'category': category,
                'amount': amount,
                'month': current_budget['month']
            }
        })
    except Exception as e:
        app.logger.error(f"Error editing budget {budget_id}: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': 'An error occurred while editing the budget record.'}), 500

@app.route('/api/delete_budget/<int:budget_id>', methods=['POST'])
@login_required
def api_delete_budget(budget_id):
    """Inline delete for budget records."""
    try:
        db = get_db()
        db.execute('DELETE FROM budgets WHERE id = ? AND user_id = ?', (budget_id, current_user.id))
        db.commit()
        return jsonify({'status': 'success', 'message': 'Budget record deleted successfully!'})
    except Exception as e:
        app.logger.error(f"Error deleting budget {budget_id}: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': 'An error occurred while deleting the budget record.'}), 500


@app.route('/generate_report')
@login_required
def generate_report():
    # This route will generate a report for the current month.
    active_month = datetime.now().strftime('%Y-%m')
    db = get_db()

    # Fetch data for current user
    expenses_rs = db.execute('SELECT * FROM expenses WHERE strftime("%Y-%m", date) = ? AND user_id = ?', (active_month, current_user.id))
    expenses = db.fetchall(expenses_rs)

    income_rs = db.execute('SELECT * FROM income WHERE month = ? AND user_id = ?', (active_month, current_user.id))
    income = db.fetchall(income_rs)

    emis_rs = db.execute('SELECT * FROM emis WHERE month = ? AND user_id = ?', (active_month, current_user.id))
    emis = db.fetchall(emis_rs)

    budget_rs = db.execute('SELECT category, amount FROM budgets WHERE month = ? AND user_id = ?', (active_month, current_user.id))
    budget = {row['category']: row['amount'] for row in db.fetchall(budget_rs)}

    # Calculate totals
    total_income = sum(i['amount'] for i in income)
    total_expenses = sum(e['amount'] for e in expenses)
    total_emi = sum(e['emi_amount'] for e in emis)
    total_budget = sum(budget.values())
    remaining_budget = total_budget - total_expenses
    net_savings = total_income - (total_expenses + total_emi)

    # Generate CSV report
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['Category', 'Budgeted Amount', 'Actual Amount', 'Difference'])
    
    for category, budgeted_amount in budget.items():
        actual_amount = sum(e['amount'] for e in expenses if e['category'] == category)
        difference = budgeted_amount - actual_amount
        writer.writerow([category, budgeted_amount, actual_amount, difference])

    # Add summary row
    writer.writerow(['Total', total_budget, total_expenses, total_budget - total_expenses])

    output.seek(0)

    return send_file(
        output,
        mimetype="text/csv",
        as_attachment=True,
        download_name=f"budget_report_{active_month}.csv"
    )

# --- COPY FROM PREVIOUS MONTH ENDPOINTS ---

@app.route('/api/copy_income_from_previous', methods=['POST'])
@login_required
def copy_income_from_previous():
    """Copy income records from the previous month to the current month."""
    try:
        app.logger.info(f"Copy income request received. Request data: {request.json}")
        current_month = request.json.get('current_month')
        app.logger.info(f"Current month from request: {current_month}")
        
        if not current_month:
            return jsonify({'status': 'error', 'message': 'Current month is required'}), 400
        
        # Calculate previous month
        current_date = datetime.strptime(current_month, '%Y-%m')
        previous_date = current_date - relativedelta(months=1)
        previous_month = previous_date.strftime('%Y-%m')
        
        db = get_db()
        
        # Get income records from previous month for current user
        previous_income_rs = db.execute('SELECT description, amount FROM income WHERE month = ? AND user_id = ?', (previous_month, current_user.id))
        previous_income = db.fetchall(previous_income_rs)
        
        if not previous_income:
            # Check what months have income data to provide helpful suggestions
            available_months_rs = db.execute('SELECT DISTINCT month FROM income WHERE user_id = ? ORDER BY month DESC LIMIT 5', (current_user.id,))
            available_months = [row['month'] for row in db.fetchall(available_months_rs)]
            
            if available_months:
                months_text = ', '.join(available_months)
                return jsonify({
                    'status': 'error', 
                    'message': f'No income records found for {previous_month}. Available months with income data: {months_text}'
                }), 404
            else:
                return jsonify({
                    'status': 'error', 
                    'message': f'No income records found for {previous_month}. No income data exists in the database yet.'
                }), 404
        
        # Delete existing income for current month
        db.execute('DELETE FROM income WHERE month = ? AND user_id = ?', (current_month, current_user.id))
        
        # Copy income records to current month
        copied_count = 0
        for record in previous_income:
            db.execute('INSERT INTO income (user_id, month, description, amount) VALUES (?, ?, ?, ?)',
                      (current_user.id, current_month, record['description'], record['amount']))
            copied_count += 1
        
        db.commit()
        
        return jsonify({
            'status': 'success', 
            'message': f'Copied {copied_count} income records from {previous_month}',
            'copied_count': copied_count
        })
        
    except Exception as e:
        app.logger.error(f"Error copying income from previous month: {e}")
        return jsonify({'status': 'error', 'message': 'An error occurred while copying income records'}), 500


@app.route('/api/copy_budget_from_previous', methods=['POST'])
@login_required
def copy_budget_from_previous():
    """Copy budget settings from the previous month to the current month."""
    try:
        current_month = request.json.get('current_month')
        if not current_month:
            return jsonify({'status': 'error', 'message': 'Current month is required'}), 400
        
        # Calculate previous month
        current_date = datetime.strptime(current_month, '%Y-%m')
        previous_date = current_date - relativedelta(months=1)
        previous_month = previous_date.strftime('%Y-%m')
        
        db = get_db()
        
        # Get budget records from previous month for current user
        previous_budget_rs = db.execute('SELECT category, amount FROM budgets WHERE month = ? AND user_id = ?', (previous_month, current_user.id))
        previous_budget = db.fetchall(previous_budget_rs)
        
        if not previous_budget:
            # Check what months have budget data to provide helpful suggestions
            available_months_rs = db.execute('SELECT DISTINCT month FROM budgets WHERE user_id = ? ORDER BY month DESC LIMIT 5', (current_user.id,))
            available_months = [row['month'] for row in db.fetchall(available_months_rs)]
            
            if available_months:
                months_text = ', '.join(available_months)
                return jsonify({
                    'status': 'error', 
                    'message': f'No budget records found for {previous_month}. Available months with budget data: {months_text}'
                }), 404
            else:
                return jsonify({
                    'status': 'error', 
                    'message': f'No budget records found for {previous_month}. No budget data exists in the database yet.'
                }), 404
        
        # Delete existing budget for current month
        db.execute('DELETE FROM budgets WHERE month = ? AND user_id = ?', (current_month, current_user.id))
        
        # Copy budget records to current month
        copied_count = 0
        for record in previous_budget:
            db.execute('INSERT INTO budgets (user_id, month, category, amount) VALUES (?, ?, ?, ?)',
                      (current_user.id, current_month, record['category'], record['amount']))
            copied_count += 1
        
        db.commit()
        
        return jsonify({
            'status': 'success', 
            'message': f'Copied {copied_count} budget categories from {previous_month}',
            'copied_count': copied_count
        })
        
    except Exception as e:
        app.logger.error(f"Error copying budget from previous month: {e}")
        return jsonify({'status': 'error', 'message': 'An error occurred while copying budget settings'}), 500


@app.route('/api/copy_emi_from_previous', methods=['POST'])
@login_required
def copy_emi_from_previous():
    """Copy EMI records from the previous month to the current month."""
    try:
        current_month = request.json.get('current_month')
        if not current_month:
            return jsonify({'status': 'error', 'message': 'Current month is required'}), 400
        
        # Calculate previous month
        current_date = datetime.strptime(current_month, '%Y-%m')
        previous_date = current_date - relativedelta(months=1)
        previous_month = previous_date.strftime('%Y-%m')
        
        db = get_db()
        
        # Get EMI records from previous month for current user
        previous_emi_rs = db.execute('SELECT loan_name, emi_amount FROM emis WHERE month = ? AND user_id = ?', (previous_month, current_user.id))
        previous_emi = db.fetchall(previous_emi_rs)
        
        if not previous_emi:
            # Check what months have EMI data to provide helpful suggestions
            available_months_rs = db.execute('SELECT DISTINCT month FROM emis WHERE user_id = ? ORDER BY month DESC LIMIT 5', (current_user.id,))
            available_months = [row['month'] for row in db.fetchall(available_months_rs)]
            
            if available_months:
                months_text = ', '.join(available_months)
                return jsonify({
                    'status': 'error', 
                    'message': f'No EMI records found for {previous_month}. Available months with EMI data: {months_text}'
                }), 404
            else:
                return jsonify({
                    'status': 'error', 
                    'message': f'No EMI records found for {previous_month}. No EMI data exists in the database yet.'
                }), 404
        
        # Delete existing EMI for current month
        db.execute('DELETE FROM emis WHERE month = ? AND user_id = ?', (current_month, current_user.id))
        
        # Copy EMI records to current month
        copied_count = 0
        for record in previous_emi:
            db.execute('INSERT INTO emis (user_id, month, loan_name, emi_amount) VALUES (?, ?, ?, ?)',
                      (current_user.id, current_month, record['loan_name'], record['emi_amount']))
            copied_count += 1
        
        db.commit()
        
        return jsonify({
            'status': 'success', 
            'message': f'Copied {copied_count} EMI records from {previous_month}',
            'copied_count': copied_count
        })
        
    except Exception as e:
        app.logger.error(f"Error copying EMI from previous month: {e}")
        return jsonify({'status': 'error', 'message': 'An error occurred while copying EMI records'}), 500

# --- Error Handlers ---
@app.errorhandler(404)
def not_found_error(error):
    # For API requests, return JSON
    if request.path.startswith('/api/'):
        return jsonify(error='Not found'), 404
    # For web pages, render a 404 template
    return render_template('404.html'), 404

@app.errorhandler(500)
def internal_error(error):
    # For API requests, return JSON
    if request.path.startswith('/api/'):
        return jsonify(error='Internal server error'), 500
    # For web pages, render a 500 template
    return render_template('500.html'), 500

# --- Main App Runner ---
if __name__ == '__main__':
    # The init_db() function can be called here to ensure the database
    # is created before the app starts. This is useful for local development.
    # In a production environment, you might run this from a separate build script.
    with app.app_context():
        init_db()
    
    # Use Render-provided PORT in production, fallback to 5001 for local runs.
    port = int(os.environ.get('PORT', 5001))
    debug_mode = os.environ.get('FLASK_DEBUG', '0') == '1'
    app.run(host='0.0.0.0', port=port, debug=debug_mode)