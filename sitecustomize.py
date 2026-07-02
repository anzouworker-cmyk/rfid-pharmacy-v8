"""Runtime compatibility patch for Inventory Connect deployments.

Python imports this module automatically when the repository root is on sys.path.
It keeps /health version aligned and installs the cloud cash endpoints when the
backend is started as backend.main from the repository root.
"""


def _install_runtime_patch():
    try:
        import importlib
        import json
        from datetime import datetime

        from fastapi import Depends, HTTPException, Request
        from fastapi.responses import JSONResponse
        from sqlalchemy import Column, DateTime, String, Text, func, inspect as sqlalchemy_inspect, or_
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
    if app is None or getattr(app.state, "v244_runtime_patch", False):
        return
    app.state.v244_runtime_patch = True

    try:
        class CloudCashData(main.Base):  # type: ignore
            __tablename__ = "cash_data"
            __table_args__ = {"extend_existing": True}

            id = Column(String, primary_key=True)
            owner_username = Column(String, nullable=False)
            data_type = Column(String, nullable=False)
            payload = Column(Text, default="")
            updated_at = Column(DateTime, default=datetime.utcnow)

        try:
            main.Base.metadata.create_all(main.engine, tables=[CloudCashData.__table__])
        except Exception:
            main.Base.metadata.create_all(main.engine)
    except Exception:
        CloudCashData = None

    def owner_username(acc):
        try:
            return main.owner_username(acc)
        except Exception:
            return getattr(acc, "parent_username", None) or getattr(acc, "username", "")

    def install_once(path, method):
        method = method.upper()
        for route in getattr(app, "routes", []):
            if getattr(route, "path", None) == path and method in getattr(route, "methods", set()):
                return False
        return True

    if CloudCashData is not None and install_once("/cash/data", "GET"):
        @app.get("/cash/data")
        def get_cash_data(acc=Depends(main.current_user), s=Depends(main.db)):
            owner = owner_username(acc)
            rows = s.query(CloudCashData).filter(CloudCashData.owner_username == owner).all()
            result = {"ok": True, "owner_username": owner, "register": "", "settings": "", "updated_at": {}}
            for row in rows:
                if row.data_type in ("register", "settings"):
                    result[row.data_type] = row.payload or ""
                    result["updated_at"][row.data_type] = row.updated_at.isoformat() if row.updated_at else ""
            return result

    if CloudCashData is not None and install_once("/cash/data", "POST"):
        @app.post("/cash/data")
        async def save_cash_data(request: Request, acc=Depends(main.current_user), s=Depends(main.db)):
            owner = owner_username(acc)
            try:
                body = await request.json()
            except Exception:
                raise HTTPException(400, "Invalid cash payload")
            if not isinstance(body, dict):
                raise HTTPException(400, "Invalid cash payload")

            saved = []
            now = datetime.utcnow()
            for data_type in ("register", "settings"):
                if data_type not in body:
                    continue
                payload = body.get(data_type)
                if payload is None:
                    payload = ""
                if not isinstance(payload, str):
                    payload = json.dumps(payload, ensure_ascii=False)
                if len(payload.encode("utf-8")) > 5 * 1024 * 1024:
                    raise HTTPException(413, f"Cash {data_type} payload too large")

                row_id = f"{owner}:{data_type}"
                row = s.get(CloudCashData, row_id)
                if not row:
                    row = CloudCashData(id=row_id, owner_username=owner, data_type=data_type)
                    s.add(row)
                row.payload = payload
                row.updated_at = now
                saved.append(data_type)

            s.commit()
            return {"ok": True, "owner_username": owner, "saved": saved, "updated_at": now.isoformat()}

    if install_once("/platform/delete-empty-username-users", "DELETE"):
        @app.delete("/platform/delete-empty-username-users")
        def delete_empty_username_users(acc=Depends(main.current_user), s=Depends(main.db)):
            if getattr(acc, "role", "") != "platform_admin":
                raise HTTPException(403, "Platform admin only")
            rows = (
                s.query(main.Account)
                .filter(or_(main.Account.username == None, func.trim(main.Account.username) == ""))  # noqa: E711
                .all()
            )
            count = len(rows)
            for row in rows:
                s.delete(row)
            s.commit()
            return {"ok": True, "deleted": count}

    @app.middleware("http")
    async def v244_health_version_middleware(request, call_next):
        if request.url.path != "/health":
            return await call_next(request)

        db_status = {"ok": True, "tables": [], "dashboard_columns": []}
        try:
            inspector = sqlalchemy_inspect(main.engine)
            db_status["tables"] = inspector.get_table_names()
            if "dashboard_content" in db_status["tables"]:
                db_status["dashboard_columns"] = [c["name"] for c in inspector.get_columns("dashboard_content")]
        except Exception as exc:
            db_status = {"ok": False, "error": str(exc)}

        return JSONResponse(
            {
                "ok": True,
                "service": "Inventory Connect API",
                "version": "V244_API_BASE_AND_CASH_DB_SYNC",
                "cors_origins": getattr(main, "allowed_origins", []),
                "cors_origin_regex": getattr(main, "allow_origin_regex", None) or "",
                "db": db_status,
            }
        )


_install_runtime_patch()
