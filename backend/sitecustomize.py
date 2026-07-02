"""V237 backend safety patch.

Adds a platform-admin cleanup endpoint for corrupted accounts whose username is
empty, without editing the large main.py file directly.

This module is automatically imported by Python when the backend starts from the
backend directory. It imports main.py once, registers the route on main.app, then
uvicorn reuses the already-loaded main module.
"""


def _install_empty_username_cleanup_route():
    try:
        import main  # type: ignore
        from fastapi import Depends, HTTPException
        from sqlalchemy import or_, func

        route_path = "/platform/delete-empty-username-users"
        if any(getattr(route, "path", None) == route_path for route in getattr(main.app, "routes", [])):
            return

        @main.app.delete(route_path)
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

    except Exception:
        # Never block backend startup because of an optional cleanup endpoint.
        pass


_install_empty_username_cleanup_route()
