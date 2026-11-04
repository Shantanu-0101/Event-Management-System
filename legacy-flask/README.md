# Flask prototype (legacy)

The first version of the project: Flask + SQLite, student and admin portals. It is kept unchanged for the project report and is no longer developed. The new app lives at the repository root.

The same code is tagged `v0-flask-prototype`.

To run it (Python 3):

```bash
cd legacy-flask
python -m venv venv
venv\Scripts\activate
pip install flask flask-sqlalchemy
python app.py
```

The SQLite database (`instance/your_database.db`) is created on first start and is not committed.
