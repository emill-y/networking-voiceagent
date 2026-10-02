"""Vercel entry point: the Nomi API as a Python serverless function.

vercel.json rewrites the API paths (/contacts, /search, ...) here; the
website and the web app are static files served by Vercel directly.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.main import app  # noqa: E402,F401
