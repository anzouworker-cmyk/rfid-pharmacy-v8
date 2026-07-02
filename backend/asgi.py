"""ASGI entrypoint for Render.

Use this instead of main:app so optional runtime extensions are loaded reliably.
Render start command:
    uvicorn asgi:app --host 0.0.0.0 --port $PORT --app-dir backend
"""

import main  # type: ignore

try:
    import sitecustomize  # type: ignore  # noqa: F401
except Exception:
    # The app must still boot even if optional extensions fail.
    pass

app = main.app
