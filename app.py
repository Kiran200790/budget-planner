import os
from flask import Flask, render_template, request, redirect, url_for, session, g, send_file
import sqlite3
import datetime
import io
import csv
from weasyprint import HTML, CSS # Added for PDF generation
import libsql_client

app = Flask(__name__)
app.secret_key = 'your_very_secret_key' # Needed for session management

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
            # The rows from libsql-client are already dict-like.
            # We just need to ensure they are plain dicts for consistent behavior.
            return [dict(row.items()) for row in result_set_or_cursor]
        else:
            rows = result_set_or_cursor.fetchall()
            return [dict(row) for row in rows]

    def fetchone(self, result_set_or_cursor):
        """Fetches one row and returns it as a dict."""
        if self._is_libsql:
            # Assuming the result set might have one row
            rows = [dict(row.items()) for row in result_set_or_cursor]
            return rows[0] if rows else None
        else:
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
        db.commit() # Commit is a no-op for Turso but necessary for SQLite

# Call this function once to initialize/update the database schema
# init_db() # Commented out for production, will be run via build.sh

def get_active_month():
    return session.get('active_month', datetime.date.today().strftime("%Y-%m"))

@app.route('/', methods=['GET']) # Simplified to GET only for month selection via query param
def index():
    month_from_get = request.args.get('month_select')
    if month_from_get:
        previous_active_month = get_active_month() # This is the month we might copy FROM
        new_active_month = month_from_get

        # Only proceed with carry-over logic if the selected month is different
        if new_active_month != previous_active_month:
            try:
                # Add a dummy day for parsing, as months are YYYY-MM
                prev_month_date = datetime.datetime.strptime(previous_active_month + "-01", "%Y-%m-%d").date()
                new_month_date = datetime.datetime.strptime(new_active_month + "-01", "%Y-%m-%d").date()

                if new_month_date > prev_month_date:
                    db = get_db()
                    # Check if the new_active_month is truly empty
                    income_count_res = db.execute("SELECT COUNT(*) as count FROM income WHERE month = ?", (new_active_month,))
                    income_count = db.fetchone(income_count_res)['count']
                    
                    expenses_count_res = db.execute("SELECT COUNT(*) as count FROM expenses WHERE month = ?", (new_active_month,))
                    expenses_count = db.fetchone(expenses_count_res)['count']

                    emis_count_res = db.execute("SELECT COUNT(*) as count FROM emis WHERE month = ?", (new_active_month,))
                    emis_count = db.fetchone(emis_count_res)['count']

                    budgets_count_res = db.execute("SELECT COUNT(*) as count FROM budgets WHERE month = ?", (new_active_month,))
                    budgets_count = db.fetchone(budgets_count_res)['count']


                    if income_count == 0 and expenses_count == 0 and emis_count == 0 and budgets_count == 0:
                        # This is a new, future month. Carry over data.
                        
                        # 1. Carry over Income
                        income_to_carry_res = db.execute("SELECT description, amount FROM income WHERE month = ?", (previous_active_month,))
                        income_to_carry = db.fetchall(income_to_carry_res)
                        for item in income_to_carry:
                            db.execute("INSERT INTO income (month, description, amount) VALUES (?, ?, ?)",
                                       (new_active_month, item['description'], item['amount']))
                        
                        # 2. Carry over Budgets
                        budgets_to_carry_res = db.execute("SELECT category, amount FROM budgets WHERE month = ?", (previous_active_month,))
                        budgets_to_carry = db.fetchall(budgets_to_carry_res)
                        for budget_item in budgets_to_carry:
                            # Note: ON CONFLICT is SQLite specific. For Turso/libSQL, this needs to be handled carefully.
                            # The current implementation will work for SQLite and might raise an error on Turso if a duplicate is inserted.
                            # A robust solution would be to check for existence first.
                            # For now, we assume new months are empty, making this safe.
                            db.execute("""INSERT INTO budgets (month, category, amount) VALUES (?, ?, ?)""",
                                       (new_active_month, budget_item['category'], budget_item['amount']))

                        # 3. Carry over EMIs
                        emis_to_carry_res = db.execute("SELECT loan_name, emi_amount FROM emis WHERE month = ?", (previous_active_month,))
                        emis_to_carry = db.fetchall(emis_to_carry_res)
                        for emi in emis_to_carry:
                            db.execute("INSERT INTO emis (month, loan_name, emi_amount) VALUES (?, ?, ?)",
                                       (new_active_month, emi['loan_name'], emi['emi_amount']))
                        
                        db.commit()
            except ValueError:
                # Handle cases where month strings might be invalid during parsing
                # If parsing fails, we just proceed to set the active month without carry-over
                pass
            except Exception as e:
                # Log other potential errors during carry-over if necessary
                # For now, just proceed
                app.logger.error(f"Error during data carry-over: {e}")
                pass

        session['active_month'] = new_active_month
        return redirect(url_for('index')) # Redirect to clean URL

    active_month = get_active_month()
    db = get_db()
    
    # Fetch data using the wrapper
    income_data_res = db.execute("SELECT * FROM income WHERE month = ? ORDER BY id", (active_month,))
    income_data = db.fetchall(income_data_res)

    expenses_data_res = db.execute("SELECT * FROM expenses WHERE month = ? ORDER BY date DESC, id DESC", (active_month,))
    expenses_data = db.fetchall(expenses_data_res)

    emis_data_res = db.execute("SELECT * FROM emis WHERE month = ? ORDER BY id", (active_month,))
    emis_data = db.fetchall(emis_data_res)
    
    budget_res = db.execute("SELECT category, amount FROM budgets WHERE month = ?", (active_month,))
    budget_rows = db.fetchall(budget_res)
    current_budget = {row["category"]: row["amount"] for row in budget_rows}

    # Generate available_months from all tables
    # The UNION query is standard SQL and should work on both
    months_res = db.execute("SELECT DISTINCT month FROM income UNION SELECT DISTINCT month FROM expenses UNION SELECT DISTINCT month FROM emis UNION SELECT DISTINCT month FROM budgets ORDER BY month DESC")
    available_months_dicts = db.fetchall(months_res)
    available_months = [row['month'] for row in available_months_dicts]
    
    if not available_months: # Ensure at least the current month is available if DB is empty
        available_months = [active_month]
    elif active_month not in available_months: # If active_month has no data yet, add it for selection
        # This case might be complex if we only want to show months with data.
        # For now, let's ensure active_month is added to the list if it's the default.
        if datetime.date.today().strftime("%Y-%m") == active_month and active_month not in available_months:
             available_months.append(active_month)
             available_months.sort(reverse=True)


    current_date = datetime.date.today().strftime("%Y-%m-%d")
    
    categories = ['Food', 'Cloth', 'Online', 'Miscellaneous', 'Other'] # Define categories
    
    spent_by_category_for_table = {category: 0.0 for category in categories}
    for expense in expenses_data: # Use the converted list of dicts
        category = expense['category']
        try:
            amount = float(expense['amount'])
        except (ValueError, TypeError):
            amount = 0.0
        if category in spent_by_category_for_table:
            spent_by_category_for_table[category] += amount
            
    chart_labels_table = categories
    chart_budgeted_values_table = [float(current_budget.get(cat, 0.0)) for cat in categories]
    chart_spent_values_table = [spent_by_category_for_table.get(cat, 0.0) for cat in categories]

    doughnut_chart_labels = chart_labels_table
    doughnut_chart_budget_values = chart_budgeted_values_table
    active_month_total_budget = sum(doughnut_chart_budget_values)
    active_month_total_spent = sum(chart_spent_values_table)

    return render_template('index.html',
                           active_month=active_month,
                           available_months=available_months,
                           income=income_data,
                           expenses=expenses_data,
                           emis=emis_data,
                           budget=current_budget, # Pass the dictionary
                           current_date=current_date,
                           chart_labels=chart_labels_table,
                           chart_budgeted_values=chart_budgeted_values_table,
                           chart_spent_values=chart_spent_values_table,
                           doughnut_chart_labels=doughnut_chart_labels,
                           doughnut_chart_values=doughnut_chart_budget_values,
                           active_month_total_budget=active_month_total_budget, 
                           active_month_total_spent=active_month_total_spent)

@app.route('/add_income', methods=['POST'])
def add_income():
    active_month = get_active_month()
    description = request.form.get('description')
    amount = request.form.get('amount')
    if description and amount:
        try:
            db = get_db()
            db.execute("INSERT INTO income (month, description, amount) VALUES (?, ?, ?)",
                       (active_month, description, float(amount)))
            db.commit()
        except ValueError:
            pass # Optionally, flash an error message
    return redirect(url_for('index'))

@app.route('/edit_income/<int:item_id>', methods=['GET', 'POST'])
def edit_income(item_id):
    active_month = get_active_month() # Keep for context if needed, or remove if item_id is globally unique
    db = get_db()
    
    if request.method == 'POST':
        description = request.form.get('description')
        amount = request.form.get('amount')
        if description and amount:
            try:
                db.execute("UPDATE income SET description = ?, amount = ? WHERE id = ? AND month = ?",
                           (description, float(amount), item_id, active_month))
                db.commit()
            except ValueError:
                pass # Optionally, flash an error message
        return redirect(url_for('index'))
    
    # GET request
    income_item_res = db.execute("SELECT * FROM income WHERE id = ? AND month = ?", (item_id, active_month))
    income_item = db.fetchone(income_item_res)
    if income_item is None:
        return "Error: Income item not found", 404
    return render_template('edit_item.html', item=income_item, item_id=item_id, active_month=active_month, item_type='income')

@app.route('/delete_income/<int:item_id>', methods=['POST'])
def delete_income(item_id):
    active_month = get_active_month() # To ensure deletion is for the correct month context
    db = get_db()
    db.execute("DELETE FROM income WHERE id = ? AND month = ?", (item_id, active_month))
    db.commit()
    return redirect(url_for('index'))

@app.route('/add_expense', methods=['POST'])
def add_expense():
    active_month = get_active_month()
    date = request.form.get('date')
    category = request.form.get('category')
    description = request.form.get('description')
    amount = request.form.get('amount')
    payment_type = request.form.get('payment_type') # Get payment type
    if category and description and amount and date and payment_type:
        try:
            db = get_db()
            db.execute("INSERT INTO expenses (month, date, category, description, amount, payment_type) VALUES (?, ?, ?, ?, ?, ?)",
                       (active_month, date, category, description, float(amount), payment_type))
            db.commit()
        except ValueError:
            pass # Optionally, flash an error message
    return redirect(url_for('index'))

@app.route('/edit_expense/<int:item_id>', methods=['GET', 'POST'])
def edit_expense(item_id):
    active_month = get_active_month()
    db = get_db()
    if request.method == 'POST':
        date = request.form.get('date')
        category = request.form.get('category')
        description = request.form.get('description')
        amount = request.form.get('amount')
        payment_type = request.form.get('payment_type') # Get payment type
        if category and description and amount and date and payment_type:
            try:
                db.execute("UPDATE expenses SET date = ?, category = ?, description = ?, amount = ?, payment_type = ? WHERE id = ? AND month = ?",
                           (date, category, description, float(amount), payment_type, item_id, active_month))
                db.commit()
            except ValueError:
                pass
            except sqlite3.Error as e:
                app.logger.error(f"Database error on expense update: {e}")
                pass
        return redirect(url_for('index'))
    
    # GET request
    expense_item_res = db.execute("SELECT * FROM expenses WHERE id = ? AND month = ?", (item_id, active_month))
    expense_item = db.fetchone(expense_item_res)
    if expense_item is None:
        return "Error: Expense item not found", 404
    
    return render_template('edit_item.html', item=expense_item, item_id=item_id, active_month=active_month, item_type='expense')

@app.route('/delete_expense/<int:item_id>', methods=['POST'])
def delete_expense(item_id):
    active_month = get_active_month()
    db = get_db()
    db.execute("DELETE FROM expenses WHERE id = ? AND month = ?", (item_id, active_month))
    db.commit()
    return redirect(url_for('index'))

@app.route('/add_emi', methods=['POST'])
def add_emi():
    active_month = get_active_month()
    loan_name = request.form.get('loan_name')
    emi_amount = request.form.get('emi_amount')
    if loan_name and emi_amount:
        try:
            db = get_db()
            db.execute("INSERT INTO emis (month, loan_name, emi_amount) VALUES (?, ?, ?)",
                       (active_month, loan_name, float(emi_amount)))
            db.commit()
        except ValueError:
            pass
    return redirect(url_for('index'))

@app.route('/edit_emi/<int:item_id>', methods=['GET', 'POST'])
def edit_emi(item_id):
    active_month = get_active_month()
    db = get_db()
    if request.method == 'POST':
        loan_name = request.form.get('loan_name')
        emi_amount = request.form.get('emi_amount')
        if loan_name and emi_amount:
            try:
                db.execute("UPDATE emis SET loan_name = ?, emi_amount = ? WHERE id = ? AND month = ?",
                           (loan_name, float(emi_amount), item_id, active_month))
                db.commit()
            except ValueError:
                pass
        return redirect(url_for('index'))
        
    emi_item_res = db.execute("SELECT * FROM emis WHERE id = ? AND month = ?", (item_id, active_month))
    emi_item = db.fetchone(emi_item_res)
    if emi_item is None:
        return "Error: EMI item not found", 404
    return render_template('edit_item.html', item=emi_item, item_id=item_id, active_month=active_month, item_type='emi')

@app.route('/delete_emi/<int:item_id>', methods=['POST'])
def delete_emi(item_id):
    db = get_db()
    db.execute("DELETE FROM emis WHERE id = ?", (item_id,))
    db.commit()
    return redirect(url_for('index'))

if __name__ == '__main__':
    # Note: This block is for local development only.
    # In production, a WSGI server like Gunicorn will run the app.
    init_db() # Initialize DB for local development
    app.run(debug=True, port=8080)
