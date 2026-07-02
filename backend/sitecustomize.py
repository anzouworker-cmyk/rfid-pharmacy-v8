"""Backend safety extensions for Inventory Connect.

This module is loaded automatically by Python when the backend starts from the
backend directory. It imports main.py once, adds small compatibility routes, then
uvicorn reuses the already-loaded main module.
"""


def _install_inventory_connect_extensions():
    try:
        import json
        from datetime import datetime

        import main  # type: ignore
        from fastapi import Depends, HTTPException, Request
        from sqlalchemy import Column, DateTime, String, Text, func, or_

        # Table used to persist the browser cash localStorage payload in PostgreSQL.
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

        def owner_username(acc):
            try:
                return main.owner_username(acc)
            except Exception:
                return getattr(acc, "parent_username", None) or getattr(acc, "username", "")

        def install_once(path, method):
            method = method.upper()
            for route in getattr(main.app, "routes", []):
                if getattr(route, "path", None) == path and method in getattr(route, "methods", set()):
                    return False
            return True

        if install_once("/platform/delete-empty-username-users", "DELETE"):
            @main.app.delete("/platform/delete-empty-username-users")
            def delete_empty_username_users(acc=Depends(main.current_user), s=Depends(main.db)):
                if getattr(acc, "role", "") != "platform_admin":
                    raise HTTPException(403, "Platform admin only")

                rows = (
                    s.query(main.Account)
                    .filter(
                        or_(
                            main.Account.username == None,  # noqa: E711
                            func.trim(main.Account.username) == "",
                        )
                    )
                    .all()
                )
                count = len(rows)
                for row in rows:
                    s.delete(row)
                s.commit()
                return {"ok": True, "deleted": count}

        if install_once("/cash/data", "GET"):
            @main.app.get("/cash/data")
            def get_cash_data(acc=Depends(main.current_user), s=Depends(main.db)):
                owner = owner_username(acc)
                rows = s.query(CloudCashData).filter(CloudCashData.owner_username == owner).all()
                result = {"ok": True, "owner_username": owner, "register": "", "settings": "", "updated_at": {}}
                for row in rows:
                    if row.data_type in ("register", "settings"):
                        result[row.data_type] = row.payload or ""
                        result["updated_at"][row.data_type] = row.updated_at.isoformat() if row.updated_at else ""
                return result

        if install_once("/cash/data", "POST"):
            @main.app.post("/cash/data")
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

    except Exception:
        # Never block backend startup because of optional compatibility endpoints.
        pass


_install_inventory_connect_extensions()
