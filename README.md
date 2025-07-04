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
