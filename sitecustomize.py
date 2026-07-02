"""Runtime health patch for Inventory Connect deployments.

Python imports this module automatically when the repository root is on sys.path.
It keeps /health version aligned without changing the main application logic.
"""


def _install_health_version_patch():
    try:
        import importlib
        from fastapi.responses import JSONResponse
        from sqlalchemy import inspect as sqlalchemy_inspect
    except Exception:
        return

    main = None
    for module_name in ("backend.main", "main"):
        try:
            main = importlib.import_module(module_name)
            break
        except Exception:
            main = None
    if main is None:
        return

    app = getattr(main, "app", None)
    if app is None or getattr(app.state, "v243_health_patch", False):
        return
    app.state.v243_health_patch = True

    @app.middleware("http")
    async def v243_health_version_middleware(request, call_next):
        if request.url.path != "/health":
            return await call_next(request)

        db_status = {"ok": True, "tables": [], "dashboard_columns": []}
        try:
            inspector = sqlalchemy_inspect(main.engine)
            db_status["tables"] = inspector.get_table_names()
            if "dashboard_content" in db_status["tables"]:
                db_status["dashboard_columns"] = [
                    c["name"] for c in inspector.get_columns("dashboard_content")
                ]
        except Exception as exc:
            db_status = {"ok": False, "error": str(exc)}

        return JSONResponse(
            {
                "ok": True,
                "service": "Inventory Connect API",
                "version": "V243_CORS_CASH_DB_SYNC",
                "cors_origins": getattr(main, "allowed_origins", []),
                "cors_origin_regex": getattr(main, "allow_origin_regex", None) or "",
                "db": db_status,
            }
        )


_install_health_version_patch()
