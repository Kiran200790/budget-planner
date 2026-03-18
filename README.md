# Budget Planner Application

A simple web application to track income, expenses, loan EMIs, and plan monthly budgets.

## Features

- Record income
- Record expenses (categorized into Food, Cloth, Online, Miscellaneous, Other)
- Record loan EMIs
- Set a monthly budget for different expense categories

## Setup and Run

1.  **Prerequisites:**
    *   Python 3.x
    *   Flask

2.  **Create and Activate Virtual Environment (Recommended):**
    ```bash
    python3 -m venv .venv
    source .venv/bin/activate 
    ```
    *(On Windows, use `.venv\\Scripts\\activate`)*

3.  **Install Dependencies:**
    ```bash
    pip install Flask
    ```

4.  **To Run the Application:**
    ```bash
    python app.py
    ```
    (Ensure your virtual environment is activated if you created one)

    The application will be available at `http://127.0.0.1:5000`.

## Upgrading an Existing Single-User Database

If your running app already has data from the old single-user version, do not deploy the auth changes without backfilling `user_id` first.

The migration script `migrate_add_users_and_userid.py` will:

- create the `users` table if needed
- add missing `user_id` columns to `income`, `expenses`, `emis`, and `budgets`
- create or reuse a legacy login account
- attach all existing rows with `user_id IS NULL` to that legacy account
- add the required unique budget index on `(user_id, month, category)`

Run it once before or during deployment:

```bash
export LEGACY_USERNAME="your-existing-admin"
export LEGACY_PASSWORD="choose-a-strong-password"
python migrate_add_users_and_userid.py
```

If you deploy with `build.sh`, make the backfill explicit:

```bash
export RUN_LEGACY_USER_BACKFILL=1
export LEGACY_USERNAME="your-existing-admin"
export LEGACY_PASSWORD="choose-a-strong-password"
./build.sh
```

Notes:

- Use the same `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` env vars as the app if production uses Turso/libSQL.
- The password is only used if the legacy user does not already exist.
- After migration, sign in with the legacy account to see all pre-auth data.

## Project Structure

```
/
|-- app.py                  # Main Flask application
|-- templates/
|   |-- index.html          # Frontend HTML
|-- static/
|   |-- style.css           # CSS styles
|   |-- script.js           # JavaScript for frontend (currently basic)
|-- .github/
|   |-- copilot-instructions.md # Instructions for GitHub Copilot
|-- README.md               # This file
```
