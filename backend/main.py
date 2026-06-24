
from datetime import datetime, timedelta, date
import hashlib
import os
import json
import uuid
import mimetypes
from typing import Optional, List
from pathlib import Path
from fastapi import FastAPI, Depends, HTTPException, Header, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import OAuth2PasswordRequestForm
from jose import jwt, JWTError
from pydantic import BaseModel
from openai import OpenAI
from sqlalchemy import create_engine, Column, String, DateTime, Boolean, Text
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from sqlalchemy import text, inspect
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./license_saas.db"
    SECRET_KEY: str = "change_this_secret_key"
    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""
    # CORS strict:
    # - NE PAS utiliser "*" en production.
    # - Mettre ici uniquement les origines frontend autorisées, séparées par des virgules.
    # - Une origine = protocole + domaine, sans chemin et sans slash final.
    #   Exemple: https://mon-site.vercel.app
    FRONTEND_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000"
    # Optionnel. Laisser vide pour désactiver les regex et accepter seulement FRONTEND_ORIGINS.
    CORS_ORIGIN_REGEX: str = ""
    DEMO_USERNAME: str = "demo"
    DEMO_PASSWORD: str = "demo123"
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = "admin123"
    RESET_BOOTSTRAP_ACCOUNTS: bool = True
    class Config:
        env_file = ".env"

settings = Settings()
engine = create_engine(settings.DATABASE_URL, connect_args={"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {})
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

app = FastAPI(title="Smart Inventory Pharmacy Web SaaS Licence API")

# Storage local pour les images publicitaires quand Cloudinary n'est pas configuré.
# IMPORTANT: le mount doit être fait après la création de `app`.
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

allowed_origins = [x.strip().rstrip("/") for x in settings.FRONTEND_ORIGINS.split(",") if x.strip()]
# En production, on préfère une liste exacte d'origines.
# CORS_ORIGIN_REGEX reste disponible seulement si vous voulez volontairement accepter un motif.
allow_origin_regex = settings.CORS_ORIGIN_REGEX.strip() or None

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=allow_origin_regex,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=86400,
)

@app.options("/{full_path:path}")
def cors_preflight_fallback(full_path: str):
    # Fallback inoffensif si un proxy envoie directement un OPTIONS à l'app.
    return {"ok": True}

class Account(Base):
    __tablename__ = "accounts"
    username = Column(String, primary_key=True)
    password_hash = Column(String, nullable=False)
    pharmacy_name = Column(String, nullable=False)
    role = Column(String, default="client")
    subscription_status = Column(String, default="active")
    expires_at = Column(DateTime, nullable=False)
    active = Column(Boolean, default=True)
    ai_premium = Column(Boolean, default=False)
    parent_username = Column(String, nullable=True)
    page_permissions = Column(Text, default="")
    can_manage_users = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class DashboardContent(Base):
    __tablename__ = "dashboard_content"
    id = Column(String, primary_key=True)
    scope = Column(String, default="global")
    target_username = Column(String, nullable=True)
    title = Column(String, nullable=False)
    message = Column(String, nullable=False)
    cta_label = Column(String, default="")
    cta_url = Column(String, default="")
    content_type = Column(String, default="info")
    image_url = Column(Text, default="")
    extra_config = Column(String, default="contain")
    active = Column(Boolean, default=True)
    ai_premium = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


CLIENT_PAGE_IDS = ["dashboard", "operations", "association", "inventory", "cash", "ai"]
ADMIN_PAGE_IDS = CLIENT_PAGE_IDS + ["cashAdmin", "platform", "dashboardAdmin"]


def normalize_page_permissions(pages=None):
    if not pages:
        return list(CLIENT_PAGE_IDS)
    cleaned = []
    for page in pages:
        p = str(page or "").strip()
        if p in CLIENT_PAGE_IDS and p not in cleaned:
            cleaned.append(p)
    return cleaned or list(CLIENT_PAGE_IDS)


def serialize_pages(pages=None):
    return json.dumps(normalize_page_permissions(pages), ensure_ascii=False)


def account_pages(acc: Account):
    if getattr(acc, "role", "") == "platform_admin":
        return list(ADMIN_PAGE_IDS)
    raw = getattr(acc, "page_permissions", "") or ""
    try:
        data = json.loads(raw) if raw else []
    except Exception:
        data = []
    pages = normalize_page_permissions(data)
    if not getattr(acc, "ai_premium", False) and "ai" in pages:
        # Le menu peut cacher l'IA si l'admin retire cette page; Premium AI reste géré séparément.
        pass
    return pages

Base.metadata.create_all(engine)

def db():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()

def hpw(p: str):
    return hashlib.sha256(p.encode("utf-8")).hexdigest()

def verify(p: str, h: str):
    return hpw(p) == h

def token(data: dict):
    d = data.copy()
    d["exp"] = datetime.utcnow() + timedelta(hours=12)
    return jwt.encode(d, settings.SECRET_KEY, algorithm="HS256")

def current_user(authorization: Optional[str] = Header(None), s: Session = Depends(db)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing token")
    try:
        payload = jwt.decode(authorization.split(" ", 1)[1], settings.SECRET_KEY, algorithms=["HS256"])
        username = payload.get("sub")
    except JWTError:
        raise HTTPException(401, "Invalid token")
    acc = s.get(Account, username)
    if not acc or not acc.active:
        raise HTTPException(401, "Inactive account")
    if acc.role != "platform_admin":
        if acc.subscription_status != "active" or acc.expires_at < datetime.utcnow():
            raise HTTPException(402, "Subscription expired")
    return acc

class ClientIn(BaseModel):
    username: str
    password: str
    pharmacy_name: str
    days: int = 30
    ai_premium: bool = False
    page_permissions: List[str] = []
    can_manage_users: bool = False

class PasswordIn(BaseModel):
    password: str

class ExpiryIn(BaseModel):
    expires_at: str


class PagePermissionsIn(BaseModel):
    page_permissions: List[str] = []
    can_manage_users: bool = False


class StoreUserIn(BaseModel):
    username: str
    password: str
    full_name: str = ""
    page_permissions: List[str] = []


class DashboardContentIn(BaseModel):
    scope: str = "global"
    target_username: Optional[str] = None
    title: str
    message: str
    cta_label: str = ""
    cta_url: str = ""
    content_type: str = "info"
    image_url: str = ""
    extra_config: str = "contain"
    active: bool = True


def ensure_schema():
    """Ajoute les colonnes manquantes quand une ancienne base SQLite/Postgres existe déjà."""
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())

    def add_column_if_missing(table_name: str, column_name: str, ddl: str):
        if table_name not in tables:
            return
        existing = {c["name"] for c in inspector.get_columns(table_name)}
        if column_name in existing:
            return
        with engine.begin() as conn:
            conn.execute(text(ddl))

    migrations = [
        ("accounts", "ai_premium", "ALTER TABLE accounts ADD COLUMN ai_premium BOOLEAN DEFAULT FALSE"),
        ("accounts", "parent_username", "ALTER TABLE accounts ADD COLUMN parent_username VARCHAR"),
        ("accounts", "page_permissions", "ALTER TABLE accounts ADD COLUMN page_permissions TEXT DEFAULT ''"),
        ("accounts", "can_manage_users", "ALTER TABLE accounts ADD COLUMN can_manage_users BOOLEAN DEFAULT FALSE"),
        ("dashboard_content", "ai_premium", "ALTER TABLE dashboard_content ADD COLUMN ai_premium BOOLEAN DEFAULT FALSE"),
        ("dashboard_content", "image_url", "ALTER TABLE dashboard_content ADD COLUMN image_url VARCHAR DEFAULT ''"),
        ("dashboard_content", "extra_config", "ALTER TABLE dashboard_content ADD COLUMN extra_config VARCHAR DEFAULT 'contain'"),
        ("dashboard_content", "cta_label", "ALTER TABLE dashboard_content ADD COLUMN cta_label VARCHAR DEFAULT ''"),
        ("dashboard_content", "cta_url", "ALTER TABLE dashboard_content ADD COLUMN cta_url VARCHAR DEFAULT ''"),
    ]
    for table_name, column_name, ddl in migrations:
        try:
            add_column_if_missing(table_name, column_name, ddl)
        except Exception:
            # Ne bloque pas le démarrage; l'app continuera si la base est déjà correcte.
            pass


def ensure_demo():
    """Crée ou répare les comptes de démarrage.

    Sur Render/Postgres, la base peut déjà contenir un ancien compte demo
    désactivé ou avec un ancien mot de passe. Dans ce cas, le frontend affiche
    "Connexion échouée" même si demo/demo123 est indiqué à l'écran.
    RESET_BOOTSTRAP_ACCOUNTS=True remet les comptes demo/admin dans un état
    utilisable à chaque redémarrage.
    """
    s = SessionLocal()
    try:
        demo_username = settings.DEMO_USERNAME.strip() or "demo"
        demo_password = settings.DEMO_PASSWORD or "demo123"
        admin_username = settings.ADMIN_USERNAME.strip() or "admin"
        admin_password = settings.ADMIN_PASSWORD or "admin123"

        demo = s.get(Account, demo_username)
        if not demo:
            demo = Account(username=demo_username, created_at=datetime.utcnow())
            s.add(demo)
        if settings.RESET_BOOTSTRAP_ACCOUNTS:
            demo.password_hash = hpw(demo_password)
            demo.pharmacy_name = "Pharmacie Démo"
            demo.role = "client"
            demo.subscription_status = "active"
            demo.expires_at = datetime.utcnow() + timedelta(days=365)
            demo.active = True
            demo.ai_premium = False
            demo.parent_username = None
            demo.page_permissions = serialize_pages(CLIENT_PAGE_IDS)
            demo.can_manage_users = True

        admin = s.get(Account, admin_username)
        if not admin:
            admin = Account(username=admin_username, created_at=datetime.utcnow())
            s.add(admin)
        if settings.RESET_BOOTSTRAP_ACCOUNTS:
            admin.password_hash = hpw(admin_password)
            admin.pharmacy_name = "admin"
            admin.role = "platform_admin"
            admin.ai_premium = True
            admin.parent_username = None
            admin.page_permissions = json.dumps(ADMIN_PAGE_IDS, ensure_ascii=False)
            admin.can_manage_users = True
            admin.subscription_status = "active"
            admin.expires_at = datetime.utcnow() + timedelta(days=3650)
            admin.active = True

        s.commit()
    finally:
        s.close()

ensure_schema()
ensure_demo()

@app.get("/health")
def health():
    db_status = {"ok": True, "tables": [], "dashboard_columns": []}
    try:
        inspector = inspect(engine)
        db_status["tables"] = inspector.get_table_names()
        if "dashboard_content" in db_status["tables"]:
            db_status["dashboard_columns"] = [c["name"] for c in inspector.get_columns("dashboard_content")]
    except Exception as e:
        db_status = {"ok": False, "error": str(e)}
    return {
        "ok": True,
        "service": "Smart Inventory API",
        "version": "V118_VERCEL_VITE_PERMISSION_FIX",
        "cors_origins": allowed_origins,
        "cors_origin_regex": allow_origin_regex or "",
        "db": db_status,
    }

@app.post("/auth/login")
async def login(request: Request, s: Session = Depends(db)):
    """Connexion robuste.

    Accepte application/x-www-form-urlencoded, multipart/form-data et JSON.
    Cela évite les échecs quand le navigateur ou Vercel envoie un Content-Type
    légèrement différent.
    """
    username = ""
    password = ""
    content_type = (request.headers.get("content-type") or "").lower()
    try:
        if "application/json" in content_type:
            payload = await request.json()
            username = str(payload.get("username", "")).strip()
            password = str(payload.get("password", ""))
        else:
            form = await request.form()
            username = str(form.get("username", "")).strip()
            password = str(form.get("password", ""))
    except Exception:
        raise HTTPException(400, "Invalid login payload")

    acc = s.get(Account, username)
    if not acc or not verify(password, acc.password_hash) or not acc.active:
        raise HTTPException(401, "Bad credentials")
    if acc.role != "platform_admin":
        if acc.subscription_status != "active" or acc.expires_at < datetime.utcnow():
            raise HTTPException(402, "Subscription expired")
    return {
        "access_token": token({"sub": acc.username}),
        "token_type": "bearer",
        "username": acc.username,
        "pharmacy_name": acc.pharmacy_name,
        "role": acc.role,
        "ai_premium": getattr(acc, "ai_premium", False),
        "parent_username": getattr(acc, "parent_username", None),
        "page_permissions": account_pages(acc),
        "can_manage_users": bool(getattr(acc, "can_manage_users", False)),
        "expires_at": None if acc.role == "platform_admin" else acc.expires_at.isoformat()
    }

@app.get("/me")
def me(acc: Account = Depends(current_user)):
    return {
        "username": acc.username,
        "pharmacy_name": acc.pharmacy_name,
        "role": acc.role,
        "subscription_status": acc.subscription_status,
        "ai_premium": getattr(acc, "ai_premium", False),
        "parent_username": getattr(acc, "parent_username", None),
        "page_permissions": account_pages(acc),
        "can_manage_users": bool(getattr(acc, "can_manage_users", False)),
        "expires_at": None if acc.role == "platform_admin" else acc.expires_at.isoformat()
    }

@app.post("/platform/create-client")
def create_client(data: ClientIn, acc: Account = Depends(current_user), s: Session = Depends(db)):
    if acc.role != "platform_admin":
        raise HTTPException(403, "Platform admin only")
    if s.get(Account, data.username):
        raise HTTPException(400, "Username exists")
    s.add(Account(
        username=data.username,
        password_hash=hpw(data.password),
        pharmacy_name=data.pharmacy_name,
        role="client",
        ai_premium=data.ai_premium,
        parent_username=None,
        page_permissions=serialize_pages(data.page_permissions),
        can_manage_users=bool(data.can_manage_users),
        subscription_status="active",
        expires_at=datetime.utcnow() + timedelta(days=data.days)
    ))
    s.commit()
    return {"ok": True}

@app.get("/platform/clients")
def clients(acc: Account = Depends(current_user), s: Session = Depends(db)):
    if acc.role != "platform_admin":
        raise HTTPException(403, "Platform admin only")
    return [
        {
            "username": x.username,
            "pharmacy_name": x.pharmacy_name,
            "role": x.role,
            "subscription_status": "admin" if x.role == "platform_admin" else x.subscription_status,
            "expires_at": None if x.role == "platform_admin" else x.expires_at.isoformat(),
            "active": x.active,
            "ai_premium": getattr(x, "ai_premium", False),
            "parent_username": getattr(x, "parent_username", None),
            "page_permissions": account_pages(x),
            "can_manage_users": bool(getattr(x, "can_manage_users", False))
        }
        for x in s.query(Account).order_by(Account.created_at.desc()).all()
    ]

@app.post("/platform/toggle-active/{username}")
def toggle_active(username: str, acc: Account = Depends(current_user), s: Session = Depends(db)):
    if acc.role != "platform_admin":
        raise HTTPException(403, "Platform admin only")
    if username == "admin":
        raise HTTPException(400, "Admin account cannot be disabled")
    obj = s.get(Account, username)
    if not obj:
        raise HTTPException(404, "Client not found")
    obj.active = not obj.active
    s.commit()
    return {"ok": True, "username": username, "active": obj.active}

@app.delete("/platform/client/{username}")
def delete_client(username: str, acc: Account = Depends(current_user), s: Session = Depends(db)):
    if acc.role != "platform_admin":
        raise HTTPException(403, "Platform admin only")
    if username == "admin":
        raise HTTPException(400, "Admin account cannot be deleted")
    obj = s.get(Account, username)
    if obj:
        s.delete(obj)
        s.commit()
    return {"ok": True}

@app.post("/platform/change-password/{username}")
def change_password(username: str, data: PasswordIn, acc: Account = Depends(current_user), s: Session = Depends(db)):
    if acc.role != "platform_admin":
        raise HTTPException(403, "Platform admin only")
    obj = s.get(Account, username)
    if not obj:
        raise HTTPException(404, "Account not found")
    if not data.password or len(data.password) < 4:
        raise HTTPException(400, "Password too short")
    obj.password_hash = hpw(data.password)
    s.commit()
    return {"ok": True}


@app.post("/platform/set-active/{username}")
def set_active(username: str, active: bool, acc: Account = Depends(current_user), s: Session = Depends(db)):
    if acc.role != "platform_admin":
        raise HTTPException(403, "Platform admin only")
    if username == "admin":
        raise HTTPException(400, "Admin account cannot be disabled")
    obj = s.get(Account, username)
    if not obj:
        raise HTTPException(404, "Client not found")
    obj.active = active
    s.commit()
    return {"ok": True, "username": username, "active": obj.active}

@app.post("/platform/update-expiry/{username}")
def update_expiry(username: str, data: ExpiryIn, acc: Account = Depends(current_user), s: Session = Depends(db)):
    if acc.role != "platform_admin":
        raise HTTPException(403, "Platform admin only")
    obj = s.get(Account, username)
    if not obj:
        raise HTTPException(404, "Client not found")
    try:
        d = datetime.strptime(data.expires_at, "%Y-%m-%d")
    except Exception:
        raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD")
    obj.expires_at = d
    obj.subscription_status = "active" if obj.expires_at >= datetime.utcnow() else "expired"
    s.commit()
    return {"ok": True, "username": username, "expires_at": obj.expires_at.isoformat(), "subscription_status": obj.subscription_status}

@app.delete("/platform/delete-client/{username}")
def delete_client_v10(username: str, acc: Account = Depends(current_user), s: Session = Depends(db)):
    if acc.role != "platform_admin":
        raise HTTPException(403, "Platform admin only")
    if username == "admin":
        raise HTTPException(400, "Admin account cannot be deleted")
    obj = s.get(Account, username)
    if not obj:
        raise HTTPException(404, "Client not found")
    s.delete(obj)
    s.commit()
    return {"ok": True}



@app.post("/platform/client-set-active/{username}")
def client_set_active(username: str, active: bool, acc: Account = Depends(current_user), s: Session = Depends(db)):
    if acc.role != "platform_admin":
        raise HTTPException(403, "Platform admin only")
    if username == "admin":
        raise HTTPException(400, "Admin account cannot be disabled")
    obj = s.get(Account, username)
    if not obj:
        raise HTTPException(404, "Client not found")
    obj.active = active
    s.commit()
    return {"ok": True, "username": username, "active": obj.active}

@app.post("/platform/client-delete/{username}")
def client_delete(username: str, acc: Account = Depends(current_user), s: Session = Depends(db)):
    if acc.role != "platform_admin":
        raise HTTPException(403, "Platform admin only")
    if username == "admin":
        raise HTTPException(400, "Admin account cannot be deleted")
    obj = s.get(Account, username)
    if not obj:
        raise HTTPException(404, "Client not found")
    s.delete(obj)
    s.commit()
    return {"ok": True, "deleted": username}

@app.post("/platform/client-update-expiry/{username}")
def client_update_expiry(username: str, data: ExpiryIn, acc: Account = Depends(current_user), s: Session = Depends(db)):
    if acc.role != "platform_admin":
        raise HTTPException(403, "Platform admin only")
    if username == "admin":
        raise HTTPException(400, "Admin account does not have expiration date")
    obj = s.get(Account, username)
    if not obj:
        raise HTTPException(404, "Client not found")
    try:
        new_date = datetime.strptime(data.expires_at, "%Y-%m-%d")
    except Exception:
        raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD")
    obj.expires_at = new_date
    obj.subscription_status = "active" if new_date >= datetime.utcnow() else "expired"
    s.commit()
    return {"ok": True, "username": username, "expires_at": obj.expires_at.isoformat(), "subscription_status": obj.subscription_status}




def _dashboard_content_rows(s: Session, include_inactive: bool = False, username: Optional[str] = None):
    """Lecture robuste du contenu dashboard.

    Anciennes bases Render/Postgres peuvent avoir une table dashboard_content créée
    avant l'ajout de image_url / extra_config / cta_label. Une requête ORM peut alors
    tomber en 500. Cette fonction lit les colonnes existantes avec SELECT * et remplit
    les champs manquants avec des valeurs par défaut.
    """
    try:
        ensure_schema()
    except Exception:
        pass

    try:
        inspector = inspect(engine)
        if "dashboard_content" not in inspector.get_table_names():
            return []
    except Exception:
        return []

    where = []
    params = {}
    if not include_inactive:
        where.append("active = :active")
        params["active"] = True
    if username:
        where.append("(scope = :global_scope OR target_username = :username)")
        params["global_scope"] = "global"
        params["username"] = username
    sql = "SELECT * FROM dashboard_content"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY created_at DESC"

    try:
        rows = s.execute(text(sql), params).mappings().all()
    except Exception:
        # Dernier filet de sécurité: ne pas casser l'écran admin à cause d'une ancienne table.
        return []

    result = []
    for r in rows:
        created_at = r.get("created_at")
        if hasattr(created_at, "isoformat"):
            created_at = created_at.isoformat()
        result.append({
            "id": r.get("id", ""),
            "scope": r.get("scope", "global") or "global",
            "target_username": r.get("target_username", None),
            "title": r.get("title", ""),
            "message": r.get("message", ""),
            "cta_label": r.get("cta_label", "") or "",
            "cta_url": r.get("cta_url", "") or "",
            "content_type": r.get("content_type", "info") or "info",
            "image_url": r.get("image_url", "") or "",
            "extra_config": r.get("extra_config", "contain") or "contain",
            "active": bool(r.get("active", True)),
            "created_at": created_at or "",
        })
    return result

@app.get("/dashboard/content")
def dashboard_content(acc: Account = Depends(current_user), s: Session = Depends(db)):
    return _dashboard_content_rows(s, include_inactive=False, username=acc.username)

@app.get("/platform/dashboard-content")
def platform_dashboard_content(acc: Account = Depends(current_user), s: Session = Depends(db)):
    if acc.role != "platform_admin":
        raise HTTPException(403, "Platform admin only")
    return _dashboard_content_rows(s, include_inactive=True)

@app.post("/platform/dashboard-content")
def create_dashboard_content(data: DashboardContentIn, acc: Account = Depends(current_user), s: Session = Depends(db)):
    if acc.role != "platform_admin":
        raise HTTPException(403, "Platform admin only")
    if data.scope not in ("global", "pharmacy"):
        raise HTTPException(400, "scope must be global or pharmacy")
    if data.scope == "pharmacy" and not data.target_username:
        raise HTTPException(400, "target_username required")

    try:
        ensure_schema()
    except Exception:
        pass

    content_id = "dash_" + uuid.uuid4().hex
    created_at = datetime.utcnow()
    params = {
        "id": content_id,
        "scope": data.scope or "global",
        "target_username": data.target_username,
        "title": data.title or "Publicité Dashboard",
        "message": data.message or "",
        "cta_label": data.cta_label or "",
        "cta_url": data.cta_url or "",
        "content_type": data.content_type or "publicite",
        "image_url": data.image_url or "",
        "extra_config": (getattr(data, "extra_config", "contain") or "contain"),
        "active": bool(data.active),
        "created_at": created_at,
    }

    # Insertion SQL explicite: évite les 500 quand une ancienne base Render/Postgres
    # n'a pas exactement les mêmes colonnes que le modèle SQLAlchemy.
    try:
        s.execute(text("""
            INSERT INTO dashboard_content
                (id, scope, target_username, title, message, cta_label, cta_url,
                 content_type, image_url, extra_config, active, created_at)
            VALUES
                (:id, :scope, :target_username, :title, :message, :cta_label, :cta_url,
                 :content_type, :image_url, :extra_config, :active, :created_at)
        """), params)
        s.commit()
    except Exception as e:
        s.rollback()
        raise HTTPException(500, f"Erreur sauvegarde publicité DB: {str(e)}")
    return {"ok": True, "id": content_id}

@app.post("/platform/dashboard-content-toggle/{content_id}")
def toggle_dashboard_content(content_id: str, acc: Account = Depends(current_user), s: Session = Depends(db)):
    if acc.role != "platform_admin":
        raise HTTPException(403, "Platform admin only")
    try:
        res = s.execute(
            text("UPDATE dashboard_content SET active = CASE WHEN active THEN false ELSE true END WHERE id = :id"),
            {"id": content_id},
        )
        if res.rowcount == 0:
            raise HTTPException(404, "Content not found")
        s.commit()
        rows = _dashboard_content_rows(s, include_inactive=True)
        active = next((x["active"] for x in rows if x["id"] == content_id), None)
        return {"ok": True, "active": active}
    except HTTPException:
        raise
    except Exception as e:
        s.rollback()
        raise HTTPException(500, f"Erreur changement statut publicité: {str(e)}")

@app.post("/platform/dashboard-content-delete/{content_id}")
def delete_dashboard_content(content_id: str, acc: Account = Depends(current_user), s: Session = Depends(db)):
    if acc.role != "platform_admin":
        raise HTTPException(403, "Platform admin only")
    try:
        s.execute(text("DELETE FROM dashboard_content WHERE id = :id"), {"id": content_id})
        s.commit()
    except Exception as e:
        s.rollback()
        raise HTTPException(500, f"Erreur suppression publicité: {str(e)}")
    return {"ok": True}


class AIAnalyzeIn(BaseModel):
    products_count: int = 0
    associations_count: int = 0
    products_with_rfid: int = 0
    products_without_rfid: int = 0
    coverage: int = 0
    detected_epc_count: int = 0
    present_count: int = 0
    missing_count: int = 0
    no_association_count: int = 0
    question: str = ""

@app.post("/ai/analyze")
def ai_analyze(data: AIAnalyzeIn, acc: Account = Depends(current_user)):
    fallback = {
        "score": max(0, min(100, int(data.coverage))),
        "niveau": "Analyse locale",
        "resume": f"Taux de couverture {data.coverage}%. {data.products_without_rfid} produits restent sans association.",
        "recommandations": [
            "Associer les produits à forte rotation en priorité.",
            "Sauvegarder le projet JSON après chaque session.",
            "Importer les identifiants détectés avant chaque analyse d’inventaire.",
            "Viser progressivement 95% de taux de couverture."
        ],
        "alertes": [
            "Les produits sans association ne seront pas détectés automatiquement.",
            "Les données locales doivent être sauvegardées régulièrement."
        ],
        "prochaine_action": "Continuer l’association des produits non liés."
    }
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return {"mode": "local-fallback", "analysis": fallback}

    prompt = f"""
Tu es un assistant professionnel pour une application SaaS de gestion d’inventaire destinée aux pharmacies.
Réponds uniquement en JSON valide.
Données:
produits={data.products_count}
associations={data.associations_count}
produits_avec_rfid={data.products_with_rfid}
produits_sans_rfid={data.products_without_rfid}
couverture={data.coverage}%
epc_detectes={data.detected_epc_count}
presents={data.present_count}
manquants={data.missing_count}
sans_association={data.no_association_count}
question={data.question or "Analyse automatiquement la situation d’inventaire."}
Format JSON:
score, niveau, resume, recommandations, alertes, prochaine_action
"""
    try:
        client = OpenAI(api_key=api_key)
        resp = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": "Tu réponds uniquement en JSON valide, sans markdown."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2
        )
        text = resp.choices[0].message.content or "{}"
        try:
            parsed = json.loads(text)
        except Exception:
            parsed = fallback
            parsed["resume"] = text
        return {"mode": "openai", "analysis": parsed}
    except Exception as e:
        return {"mode": "fallback-error", "error": str(e), "analysis": fallback}


@app.post("/platform/client-ai-premium/{username}")
def client_ai_premium(username: str, enabled: bool, acc: Account = Depends(current_user), s: Session = Depends(db)):
    if acc.role != "platform_admin":
        raise HTTPException(403, "Platform admin only")
    obj = s.get(Account, username)
    if not obj:
        raise HTTPException(404, "Client not found")
    obj.ai_premium = enabled
    s.commit()
    return {"ok": True, "username": username, "ai_premium": obj.ai_premium}


@app.post("/platform/client-page-permissions/{username}")
def client_page_permissions(username: str, data: PagePermissionsIn, acc: Account = Depends(current_user), s: Session = Depends(db)):
    if acc.role != "platform_admin":
        raise HTTPException(403, "Platform admin only")
    obj = s.get(Account, username)
    if not obj:
        raise HTTPException(404, "Client not found")
    if obj.role == "platform_admin":
        raise HTTPException(400, "Admin pages cannot be changed")
    obj.page_permissions = serialize_pages(data.page_permissions)
    obj.can_manage_users = bool(data.can_manage_users)
    s.commit()
    return {"ok": True, "username": username, "page_permissions": account_pages(obj), "can_manage_users": obj.can_manage_users}


def owner_username(acc: Account):
    return getattr(acc, "parent_username", None) or acc.username


def require_user_manager(acc: Account):
    if acc.role == "platform_admin" or not bool(getattr(acc, "can_manage_users", False)):
        raise HTTPException(403, "Gestion utilisateurs non autorisée")


@app.get("/users/my-users")
def my_users(acc: Account = Depends(current_user), s: Session = Depends(db)):
    require_user_manager(acc)
    owner = owner_username(acc)
    rows = s.query(Account).filter(Account.parent_username == owner).order_by(Account.created_at.desc()).all()
    return [
        {
            "username": x.username,
            "full_name": x.pharmacy_name,
            "active": x.active,
            "page_permissions": account_pages(x),
            "created_at": x.created_at.isoformat() if x.created_at else "",
        }
        for x in rows
    ]


@app.post("/users/create")
def create_store_user(data: StoreUserIn, acc: Account = Depends(current_user), s: Session = Depends(db)):
    require_user_manager(acc)
    username = data.username.strip()
    if not username or not data.password:
        raise HTTPException(400, "username and password required")
    if len(data.password) < 4:
        raise HTTPException(400, "Password too short")
    if s.get(Account, username):
        raise HTTPException(400, "Username exists")
    allowed = set(account_pages(acc))
    requested = [p for p in normalize_page_permissions(data.page_permissions) if p in allowed]
    if not requested:
        requested = list(allowed) or normalize_page_permissions([])
    owner = owner_username(acc)
    s.add(Account(
        username=username,
        password_hash=hpw(data.password),
        pharmacy_name=data.full_name or username,
        role="client_user",
        parent_username=owner,
        page_permissions=json.dumps(requested, ensure_ascii=False),
        can_manage_users=False,
        ai_premium=bool(getattr(acc, "ai_premium", False)),
        subscription_status="active",
        expires_at=acc.expires_at,
        active=True,
    ))
    s.commit()
    return {"ok": True}


@app.post("/users/page-permissions/{username}")
def update_store_user_pages(username: str, data: PagePermissionsIn, acc: Account = Depends(current_user), s: Session = Depends(db)):
    require_user_manager(acc)
    owner = owner_username(acc)
    obj = s.get(Account, username)
    if not obj or obj.parent_username != owner:
        raise HTTPException(404, "User not found")
    allowed = set(account_pages(acc))
    obj.page_permissions = json.dumps([p for p in normalize_page_permissions(data.page_permissions) if p in allowed], ensure_ascii=False)
    s.commit()
    return {"ok": True, "page_permissions": account_pages(obj)}


@app.post("/users/set-active/{username}")
def set_store_user_active(username: str, active: bool, acc: Account = Depends(current_user), s: Session = Depends(db)):
    require_user_manager(acc)
    owner = owner_username(acc)
    obj = s.get(Account, username)
    if not obj or obj.parent_username != owner:
        raise HTTPException(404, "User not found")
    obj.active = active
    s.commit()
    return {"ok": True, "active": obj.active}


@app.post("/users/change-password/{username}")
def change_store_user_password(username: str, data: PasswordIn, acc: Account = Depends(current_user), s: Session = Depends(db)):
    require_user_manager(acc)
    owner = owner_username(acc)
    obj = s.get(Account, username)
    if not obj or obj.parent_username != owner:
        raise HTTPException(404, "User not found")
    if not data.password or len(data.password) < 4:
        raise HTTPException(400, "Password too short")
    obj.password_hash = hpw(data.password)
    s.commit()
    return {"ok": True}


@app.delete("/users/delete/{username}")
def delete_store_user(username: str, acc: Account = Depends(current_user), s: Session = Depends(db)):
    require_user_manager(acc)
    owner = owner_username(acc)
    obj = s.get(Account, username)
    if not obj or obj.parent_username != owner:
        raise HTTPException(404, "User not found")
    s.delete(obj)
    s.commit()
    return {"ok": True}


@app.post("/platform/upload-ad-image")
async def upload_ad_image(request: Request, file: UploadFile = File(...), acc: Account = Depends(current_user)):
    if acc.role != "platform_admin":
        raise HTTPException(403, "Platform admin only")

    # Le navigateur peut parfois envoyer image/png, image/x-png ou même application/octet-stream.
    # On valide donc le type MIME, l'extension ET la signature du fichier pour éviter les faux rejets.
    allowed_mimes = {"image/png": ".png", "image/x-png": ".png", "image/jpeg": ".jpg", "image/jpg": ".jpg", "image/webp": ".webp"}
    allowed_exts = {".png", ".jpg", ".jpeg", ".webp"}

    content = await file.read()
    if not content:
        raise HTTPException(400, "Image vide ou illisible.")
    if len(content) > 3 * 1024 * 1024:
        raise HTTPException(400, "Image trop lourde. Maximum 3 MB.")

    content_type = (file.content_type or "").split(";", 1)[0].strip().lower()
    original_ext = Path(file.filename or "").suffix.lower()
    ext = allowed_mimes.get(content_type)
    if not ext and original_ext in allowed_exts:
        ext = ".jpg" if original_ext == ".jpeg" else original_ext

    # Validation par signature fichier.
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        ext = ".png"
    elif content.startswith(b"\xff\xd8\xff"):
        ext = ".jpg"
    elif content.startswith(b"RIFF") and content[8:12] == b"WEBP":
        ext = ".webp"

    if ext not in {".png", ".jpg", ".webp"}:
        raise HTTPException(400, "Format image non supporté. Utilisez PNG, JPG ou WEBP.")

    cloudinary_error = ""
    if settings.CLOUDINARY_CLOUD_NAME and settings.CLOUDINARY_API_KEY and settings.CLOUDINARY_API_SECRET:
        try:
            import cloudinary
            import cloudinary.uploader
            cloudinary.config(
                cloud_name=settings.CLOUDINARY_CLOUD_NAME,
                api_key=settings.CLOUDINARY_API_KEY,
                api_secret=settings.CLOUDINARY_API_SECRET,
                secure=True
            )
            result = cloudinary.uploader.upload(
                content,
                folder="smart_inventory_ads",
                resource_type="image"
            )
            secure_url = result.get("secure_url")
            if secure_url:
                return {"image_url": secure_url}
            cloudinary_error = "Cloudinary n'a pas retourné d'URL."
        except Exception as e:
            # Ne bloque pas la publication: on tente le stockage local ensuite.
            cloudinary_error = str(e)

    # Fallback local storage pour développement/testing ou si Cloudinary n'est pas configuré.
    try:
        filename = f"ad_{uuid.uuid4().hex}{ext}"
        path = UPLOAD_DIR / filename
        path.write_bytes(content)
    except Exception as e:
        detail = f"Erreur sauvegarde image locale: {str(e)}"
        if cloudinary_error:
            detail += f" | Cloudinary: {cloudinary_error}"
        raise HTTPException(500, detail)

    # Retourner une URL absolue évite que le frontend cherche /uploads sur Vercel
    # au lieu du backend. Définir BACKEND_PUBLIC_URL en production reste préférable.
    base_url = os.getenv("BACKEND_PUBLIC_URL", "").rstrip("/")
    if not base_url:
        base_url = str(request.base_url).rstrip("/")
    return {"image_url": f"{base_url}/uploads/{filename}"}
