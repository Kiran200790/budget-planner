import os
import sqlite3
import logging
import libsql_client

from flask import Flask, render_template, request, redirect, url_for, session, g, send_file, flash, jsonify
from datetime import datetime, date
from dateutil.relativedelta import relativedelta # Added for month iteration
import io
import csv

app = Flask(__name__)
# Use an environment variable for the secret key in production, with a fallback for local dev
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'a_default_fallback_key_for_development')

# --- DEVELOPMENT SETTINGS TO PREVENT CACHING ---
# These settings ensure that changes to templates and static files are
# reflected immediately without needing a manual server restart or hard refresh.
# Do not use these settings in a production environment.
if app.config['DEBUG']:
    app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
    app.config['TEMPLATES_AUTO_RELOAD'] = True


# Configure logging to see output in the terminal
logging.basicConfig(level=logging.INFO)
# --- ADD /api/edit_income/<int:income_id> API ENDPOINT ---

# --- ADD /api/edit_income/<int:income_id> API ENDPOINT ---
@app.route('/api/edit_income/<int:income_id>', methods=['POST'])
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
            'UPDATE income SET description = ?, amount = ?, month = ? WHERE id = ?',
            (description, float(amount), month, income_id)
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

    def execute(self, sql, params=()):
        """Executes a query. For non-SELECT queries, it returns None.
           For SELECT queries, it returns an object that can be passed to fetch methods."""
        if self._is_libsql:
            return self._conn.execute(sql, params)
        else:
            cursor = self._conn.cursor()
            cursor.execute(sql, params)
            return cursor

    def execute_batch(self, sqls):
        """Executes multiple SQL statements in a batch."""
        if self._is_libsql:
            # libsql_client supports batch execution
            self._conn.batch(sqls)
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
            # Production: Connect to Turso
            https_url = db_url.replace("libsql://", "https://")
            conn = libsql_client.create_client_sync(url=https_url, auth_token=auth_token)
            db = g._database = DbWrapper(conn, is_libsql=True)
        else:
            # Local development: Connect to local SQLite file
            conn = sqlite3.connect(DATABASE)
            conn.row_factory = sqlite3.Row # Allows accessing columns by name
            db = g._database = DbWrapper(conn, is_libsql=False)
    return db

@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()

def init_db():
    with app.app_context():
        db = get_db()
        # Use a list of SQL statements for batch execution
        schema_queries = [
            """
            CREATE TABLE IF NOT EXISTS income (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                month TEXT NOT NULL,
                description TEXT NOT NULL,
                amount REAL NOT NULL
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS expenses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                month TEXT NOT NULL,
                date TEXT NOT NULL,
                category TEXT NOT NULL,
                description TEXT NOT NULL,
                amount REAL NOT NULL,
                payment_type TEXT
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS emis (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                month TEXT NOT NULL,
                loan_name TEXT NOT NULL,
                emi_amount REAL NOT NULL
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS budgets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                month TEXT NOT NULL,
                category TEXT NOT NULL,
                amount REAL NOT NULL,
                UNIQUE(month, category)
            );
            """
        ]
        db.execute_batch(schema_queries)
        # db.commit() is not needed here for Turso, and execute_batch handles it for SQLite

# Call this function once to initialize/update the database schema
# init_db() # Commented out for production, will be run via build.sh

def get_budget_data(active_month):
    """Fetches and calculates all necessary data for a given month."""
    app.logger.info(f"--- Fetching data for active_month: {active_month} ---")
    db = get_db()

    # Fetch all data for the active month
    expenses_rs = db.execute('SELECT * FROM expenses WHERE month = ? ORDER BY date DESC', (active_month,))
    expenses = db.fetchall(expenses_rs)
    app.logger.info(f"Found {len(expenses)} expenses.")

    income_rs = db.execute('SELECT * FROM income WHERE month = ? ORDER BY id DESC', (active_month,))
    income = db.fetchall(income_rs)
    app.logger.info(f"Found {len(income)} income records.")

    emis_rs = db.execute('SELECT * FROM emis WHERE month = ? ORDER BY id DESC', (active_month,))
    emis = db.fetchall(emis_rs)
    app.logger.info(f"Found {len(emis)} EMI records.")

    budget_cursor = db.execute('SELECT category, amount FROM budgets WHERE month = ?', (active_month,))
    budget = {row['category']: row['amount'] for row in db.fetchall(budget_cursor)}
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

    # Define a fixed list of all possible categories to ensure they always appear.
    all_categories = sorted(['Food', 'Cloth', 'Online', 'Miscellaneous', 'Other'])

    chart_labels = all_categories
    budget_values = [budget.get(cat, 0) for cat in chart_labels]
    spent_values = [category_totals.get(cat, 0) for cat in chart_labels]

    # Fetch recent transactions for mobile view
    # Ensure date for income is a full date string for proper sorting
    recent_trans_rs = db.execute("""
        SELECT date, category, description, amount, 'expense' as type
        FROM expenses
        WHERE month = ?
        UNION ALL
        SELECT month || '-01' as date, 'Income' as category, description, amount, 'income' as type
        FROM income
        WHERE month = ?
        ORDER BY date DESC
        LIMIT 5
    """, (active_month, active_month))
    recent_transactions = db.fetchall(recent_trans_rs)
    app.logger.info(f"Found {len(recent_transactions)} recent transactions for mobile view.")

    # This dictionary is the single source of truth for the frontend.
    result_data = {
        'active_month': active_month,
        'expenses': expenses,
        'income': income,
        'emis': emis,
        'budget': budget,
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

@app.route('/api/report_data', methods=['GET'])
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

@app.route('/', methods=['GET'])
def index():
    active_month = request.args.get('month_select', default=datetime.now().strftime('%Y-%m'))
    # Check for a success message passed in the URL, used for redirects from edit pages
    flash_success = request.args.get('flash_success')
    if flash_success:
        flash(flash_success, 'success')

    js_data = get_budget_data(active_month)

    db = get_db()
    available_months_rs = db.execute('''
        SELECT DISTINCT strftime("%Y-%m", date) as month FROM expenses
        UNION
        SELECT DISTINCT month FROM income
        UNION
        SELECT DISTINCT month FROM emis
        ORDER BY month DESC
    ''')
    available_months = [row['month'] for row in db.fetchall(available_months_rs)]

    return render_template('index.html', 
                         js_data=js_data, 
                         active_month=active_month, 
                         available_months=available_months, 
                         current_date=datetime.now().strftime('%Y-%m-%d'),
                         # Pass individual data points that the template still needs directly
                         budget=js_data.get('budget', {}),
                         income=js_data.get('income', []),
                         expenses=js_data.get('expenses', []),
                         emis=js_data.get('emis', []))


@app.route('/add_expense', methods=['POST'])
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
        # The month for the expense record should match the active month context
        month_for_db = active_month

        db = get_db()
        db.execute(
            '''INSERT INTO expenses (month, date, category, description, amount, payment_type)
               VALUES (?, ?, ?, ?, ?, ?)''',
            (month_for_db, date, category, description, float(amount), payment_type)
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
            '''INSERT INTO expenses (month, date, category, description, amount, payment_type)
               VALUES (?, ?, ?, ?, ?, ?)''',
            (month_for_db, date, category, description, float(amount), payment_type)
        )
        db.commit()
        return jsonify({'status': 'success', 'message': 'Expense added successfully!'})
    except ValueError:
        return jsonify({'status': 'error', 'message': 'Invalid amount. Please use numbers only.'}), 400
    except Exception as e:
        app.logger.error(f"Error adding expense via API: {e}")
        return jsonify({'status': 'error', 'message': 'An error occurred while adding the expense.'}), 500


@app.route('/api/add_income', methods=['POST'])
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
                ('INSERT INTO income (description, amount, month) VALUES (?, ?, ?)',
                (description, float(amount), current_month_str))
            )
        
        db.execute_batch(queries)
        message = f'Income added for {num_months} months successfully!'
        return jsonify({'status': 'success', 'message': message})
    except ValueError:
        return jsonify({'status': 'error', 'message': 'Invalid amount. Please use numbers only.'}), 400
    except Exception as e:
        app.logger.error(f"Error adding income via API: {e}")
        return jsonify({'status': 'error', 'message': 'An error occurred while adding the income.'}), 500

@app.route('/api/add_emi', methods=['POST'])
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
                ('INSERT INTO emis (loan_name, emi_amount, month) VALUES (?, ?, ?)',
                (loan_name, float(emi_amount), current_month_str))
            )

        db.execute_batch(queries)
        message = f'EMI added for {num_months} months successfully!'
        return jsonify({'status': 'success', 'message': message})
    except ValueError:
        return jsonify({'status': 'error', 'message': 'Invalid amount. Please use numbers only.'}), 400
    except Exception as e:
        app.logger.error(f"Error adding EMI via API: {e}")
        return jsonify({'status': 'error', 'message': 'An error occurred while adding the EMI.'}), 500


@app.route('/set_budget', methods=['POST'])
def set_budget():
    active_month = request.form.get('month_select')
    # This route now handles multiple budget entries from the form
    for category in ['Food', 'Cloth', 'Online', 'Miscellaneous', 'Other']:
        amount = request.form.get(category)
        if amount:  # Only process if an amount was entered
            try:
                db = get_db()
                # Use UPSERT logic to either insert a new budget or update the existing one
                db.execute(
                    '''INSERT INTO budgets (month, category, amount)
                       VALUES (?, ?, ?)
                       ON CONFLICT(month, category) DO UPDATE SET amount = excluded.amount''',
                    (active_month, category, float(amount))
                )
                db.commit()
            except ValueError:
                flash(f'Invalid amount entered for {category}. Please use numbers only.', 'error')
            except Exception as e:
                app.logger.error(f"Error setting budget for {category}: {e}")
                flash(f'An error occurred while setting the budget for {category}.', 'error')
    
    flash('Budget updated successfully!', 'success')
    return redirect(url_for('index', month_select=active_month))


@app.route('/api/set_budget', methods=['POST'])
def api_set_budget():
    active_month = request.form.get('month_select')
    category = request.form.get('category')
    amount = request.form.get('amount')

    if not all([active_month, category, amount]):
        return jsonify({'status': 'error', 'message': 'All fields are required!'}), 400

    try:
        db = get_db()
        db.execute(
            '''INSERT INTO budgets (month, category, amount)
               VALUES (?, ?, ?)
               ON CONFLICT(month, category) DO UPDATE SET amount = excluded.amount''',
            (active_month, category, float(amount))
        )
        db.commit()
        return jsonify({'status': 'success', 'message': 'Budget set successfully!'})
    except ValueError:
        return jsonify({'status': 'error', 'message': 'Invalid amount. Please use numbers only.'}), 400
    except Exception as e:
        app.logger.error(f"Error setting budget via API: {e}")
        return jsonify({'status': 'error', 'message': 'An error occurred while setting the budget.'}), 500


@app.route('/api/set_budgets', methods=['POST'])
def api_set_budgets():
    active_month = request.form.get('month_select')

    if not active_month:
        return jsonify({'status': 'error', 'message': 'Month is required!'}), 400

    try:
        db = get_db()
        num_months = 3  # Default to propagating the budget for the next 3 months
        start_month = datetime.strptime(active_month, '%Y-%m')
        
        queries = []
        for i in range(num_months):
            current_month_dt = start_month + relativedelta(months=i)
            current_month_str = current_month_dt.strftime('%Y-%m')

            for category in ['Food', 'Cloth', 'Online', 'Miscellaneous', 'Other']:
                amount_str = request.form.get(category, '0.0').strip()
                amount = float(amount_str) if amount_str else 0.0
                queries.append(
                    ('INSERT INTO budgets (month, category, amount) VALUES (?, ?, ?) ON CONFLICT(month, category) DO UPDATE SET amount = excluded.amount',
                    (current_month_str, category, amount))
                )

        db.execute_batch(queries)
        message = f'Budget updated for {num_months} months successfully!'
        return jsonify({'status': 'success', 'message': message})
    except ValueError as e:
        app.logger.error(f"Error setting budgets via API: Invalid amount - {e}")
        return jsonify({'status': 'error', 'message': 'Invalid amount entered. Please use numbers only.'}), 400
    except Exception as e:
        app.logger.error(f"Error setting budgets via API: {e}")
        return jsonify({'status': 'error', 'message': 'An error occurred while updating the budget.'}), 500


@app.route('/api/get_income/<int:income_id>', methods=['GET'])
def api_get_income(income_id):
    """API endpoint to fetch a single income entry by its ID."""
    try:
        db = get_db()
        income_rs = db.execute('SELECT * FROM income WHERE id = ?', (income_id,))
        income = db.fetchone(income_rs)
        if income:
            return jsonify(income)
        else:
            return jsonify({'status': 'error', 'message': 'Income entry not found'}), 404
    except Exception as e:
        app.logger.error(f"Error fetching income via API: {e}")
        return jsonify({'status': 'error', 'message': 'An error occurred'}), 500

@app.route('/api/get_emi/<int:emi_id>', methods=['GET'])
def api_get_emi(emi_id):
    """API endpoint to fetch a single EMI entry by its ID."""
    try:
        db = get_db()
        emi_rs = db.execute('SELECT * FROM emis WHERE id = ?', (emi_id,))
        emi = db.fetchone(emi_rs)
        if emi:
            return jsonify(emi)
        else:
            return jsonify({'status': 'error', 'message': 'EMI entry not found'}), 404
    except Exception as e:
        app.logger.error(f"Error fetching EMI via API: {e}")
        return jsonify({'status': 'error', 'message': 'An error occurred'}), 500



@app.route('/api/delete_expense/<int:expense_id>', methods=['DELETE'])
def api_delete_expense(expense_id):
    """API endpoint to delete an expense."""
    try:
        db = get_db()
        db.execute('DELETE FROM expenses WHERE id = ?', (expense_id,))
        db.commit()
        return jsonify({'status': 'success', 'message': 'Expense deleted successfully!'})
    except Exception as e:
        app.logger.error(f"Error deleting expense {expense_id} via API: {e}")
        return jsonify({'status': 'error', 'message': 'An error occurred while deleting.'}), 500


# This route is kept for non-JS compatibility if needed, but the primary delete is via API
@app.route('/delete_expense/<int:expense_id>', methods=['POST'])
def delete_expense(expense_id):
    """Route to delete a single expense item."""
    # The month is needed to redirect back correctly
    active_month = request.args.get('month_select', default=datetime.now().strftime('%Y-%m'))
    try:
        db = get_db()
        db.execute('DELETE FROM expenses WHERE id = ?', (expense_id,))
        db.commit()
        flash('Expense deleted successfully!', 'success')
    except Exception as e:
        app.logger.error(f"Error deleting expense {expense_id}: {e}")
        flash('An error occurred while deleting the expense.', 'error')
    return redirect(url_for('index', month_select=active_month))


# This route is kept for non-JS compatibility if needed, but the primary edit is via API
@app.route('/edit_expense/<int:expense_id>', methods=['GET', 'POST'])
def edit_expense(expense_id):
    db = get_db()
    active_month = request.args.get('month_select', default=datetime.now().strftime('%Y-%m'))

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
                   WHERE id = ?''',
                   (month_for_db, date, category, description, float(amount), payment_type, expense_id))
        db.commit()
        flash('Expense updated successfully!', 'success')
        return redirect(url_for('index', month_select=month_for_db))

    # For GET request
    expense_rs = db.execute('SELECT * FROM expenses WHERE id = ?', (expense_id,))
    expense = db.fetchone(expense_rs)
    if expense is None:
        flash('Expense not found!', 'error')
        return redirect(url_for('index', month_select=active_month))

    # Pass the expense object as 'item' and specify the 'item_type'
    return render_template('edit_item.html', item=expense, item_type='expense', active_month=active_month)


@app.route('/edit_item/<int:item_id>', methods=['GET'])
def edit_item(item_id):
    """Serves the page to edit an existing expense."""
    db = get_db()
    active_month = request.args.get('month_select', datetime.now().strftime('%Y-%m'))
    
    item_cursor = db.execute('SELECT * FROM expenses WHERE id = ?', (item_id,))
    item = db.fetchone(item_cursor)

    if item is None:
        return "Item not found", 404
        
    return render_template('edit_item.html', item=item, active_month=active_month)

@app.route('/edit_income/<int:income_id>', methods=['GET'])
def edit_income(income_id):
    """Serves the page to edit an existing income record."""
    db = get_db()
    active_month = request.args.get('month_select', datetime.now().strftime('%Y-%m'))

    income_cursor = db.execute('SELECT * FROM income WHERE id = ?', (income_id,))
    income = db.fetchone(income_cursor)

    if income is None:
        return "Income record not found", 404
        
    return render_template('edit_income.html', income=income, active_month=active_month)

@app.route('/edit_emi/<int:emi_id>', methods=['GET'])
def edit_emi(emi_id):
    """Serves the page to edit an existing EMI record."""
    db = get_db()
    active_month = request.args.get('month_select', datetime.now().strftime('%Y-%m'))

    emi_cursor = db.execute('SELECT * FROM emis WHERE id = ?', (emi_id,))
    emi = db.fetchone(emi_cursor)

    if emi is None:
        return "EMI record not found", 404
        
    return render_template('edit_emi.html', emi=emi, active_month=active_month)


@app.route('/api/edit_item/<int:item_id>', methods=['POST'])
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
               WHERE id = ?""",
            (date, category, description, float(amount), payment_type, month_for_db, item_id)
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
            'UPDATE emis SET loan_name = ?, emi_amount = ? WHERE id = ?',
            (loan_name, float(emi_amount), emi_id)
        )
        db.commit()
        message = 'EMI updated successfully!'

        return jsonify({'status': 'success', 'message': message})
    except ValueError:
        return jsonify({'status': 'error', 'message': 'Invalid amount. Please use numbers only.'}), 400
    except Exception as e:
        app.logger.error(f"Error updating EMI {emi_id} via API: {e}")
        return jsonify({'status': 'error', 'message': 'An error occurred while updating the EMI.'}), 500



@app.route('/api/delete_expense/<int:item_id>', methods=['POST'])
def api_delete_expense_post(item_id):
    try:
        db = get_db()
        db.execute('DELETE FROM expenses WHERE id = ?', (item_id,))
        db.commit()
        return jsonify({'status': 'success', 'message': 'Expense deleted successfully!'})
    except Exception as e:
        app.logger.error(f"Error deleting expense {item_id}: {e}")
        return jsonify({'status': 'error', 'message': 'An error occurred while deleting the expense.'}), 500

@app.route('/api/delete_income/<int:income_id>', methods=['POST'])
def api_delete_income(income_id):
    try:
        db = get_db()
        db.execute('DELETE FROM income WHERE id = ?', (income_id,))
        db.commit()
        return jsonify({'status': 'success', 'message': 'Income record deleted successfully!'})
    except Exception as e:
        app.logger.error(f"Error deleting income {income_id}: {e}")
        return jsonify({'status': 'error', 'message': 'An error occurred while deleting the income record.'}), 500

@app.route('/api/delete_emi/<int:emi_id>', methods=['POST'])
def api_delete_emi(emi_id):
    try:
        db = get_db()
        db.execute('DELETE FROM emis WHERE id = ?', (emi_id,))
        db.commit()
        return jsonify({'status': 'success', 'message': 'EMI record deleted successfully!'})
    except Exception as e:
        app.logger.error(f"Error deleting EMI {emi_id}: {e}")
        return jsonify({'status': 'error', 'message': 'An error occurred while deleting the EMI record.'}), 500


@app.route('/generate_report')
def generate_report():
    # This route will generate a report for the current month.
    active_month = datetime.now().strftime('%Y-%m')
    db = get_db()

    # Fetch data
    expenses_rs = db.execute('SELECT * FROM expenses WHERE strftime("%Y-%m", date) = ?', (active_month,))
    expenses = db.fetchall(expenses_rs)

    income_rs = db.execute('SELECT * FROM income WHERE month = ?', (active_month,))
    income = db.fetchall(income_rs)

    emis_rs = db.execute('SELECT * FROM emis WHERE month = ?', (active_month,))
    emis = db.fetchall(emis_rs)

    budget_rs = db.execute('SELECT category, amount FROM budgets WHERE month = ?', (active_month,))
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
        
        # Get income records from previous month
        previous_income_rs = db.execute('SELECT description, amount FROM income WHERE month = ?', (previous_month,))
        previous_income = db.fetchall(previous_income_rs)
        
        if not previous_income:
            # Check what months have income data to provide helpful suggestions
            available_months_rs = db.execute('SELECT DISTINCT month FROM income ORDER BY month DESC LIMIT 5')
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
        db.execute('DELETE FROM income WHERE month = ?', (current_month,))
        
        # Copy income records to current month
        copied_count = 0
        for record in previous_income:
            db.execute('INSERT INTO income (month, description, amount) VALUES (?, ?, ?)',
                      (current_month, record['description'], record['amount']))
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
        
        # Get budget records from previous month
        previous_budget_rs = db.execute('SELECT category, amount FROM budgets WHERE month = ?', (previous_month,))
        previous_budget = db.fetchall(previous_budget_rs)
        
        if not previous_budget:
            # Check what months have budget data to provide helpful suggestions
            available_months_rs = db.execute('SELECT DISTINCT month FROM budgets ORDER BY month DESC LIMIT 5')
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
        db.execute('DELETE FROM budgets WHERE month = ?', (current_month,))
        
        # Copy budget records to current month
        copied_count = 0
        for record in previous_budget:
            db.execute('INSERT INTO budgets (month, category, amount) VALUES (?, ?, ?)',
                      (current_month, record['category'], record['amount']))
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
        
        # Get EMI records from previous month
        previous_emi_rs = db.execute('SELECT loan_name, emi_amount FROM emis WHERE month = ?', (previous_month,))
        previous_emi = db.fetchall(previous_emi_rs)
        
        if not previous_emi:
            # Check what months have EMI data to provide helpful suggestions
            available_months_rs = db.execute('SELECT DISTINCT month FROM emis ORDER BY month DESC LIMIT 5')
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
        db.execute('DELETE FROM emis WHERE month = ?', (current_month,))
        
        # Copy EMI records to current month
        copied_count = 0
        for record in previous_emi:
            db.execute('INSERT INTO emis (month, loan_name, emi_amount) VALUES (?, ?, ?)',
                      (current_month, record['loan_name'], record['emi_amount']))
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
    
    # The host='0.0.0.0' makes the server accessible from other devices on the network.
    # The debug=True flag enables the interactive debugger and reloads the server on code changes.
    # IMPORTANT: Do NOT use debug=True in a production environment.
    app.run(host='0.0.0.0', port=5001, debug=True)