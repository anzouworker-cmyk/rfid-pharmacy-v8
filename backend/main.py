
from datetime import datetime, timedelta, date
import hashlib
import os
import json
import uuid
import mimetypes
from typing import Optional
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
    FRONTEND_ORIGINS: str = "https://rfid-pharmacy-v8-staging-cr53cfcaz-anzou-s-projects.vercel.app,https://rfid-pharmacy-v8-staging.vercel.app,http://localhost:5173,http://localhost:3000"
    class Config:
        env_file = ".env"

settings = Settings()
engine = create_engine(settings.DATABASE_URL, connect_args={"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {})
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

app = FastAPI(title="RFID Pharmacy Web SaaS Licence API")

# Storage local pour les images publicitaires quand Cloudinary n'est pas configuré.
# IMPORTANT: le mount doit être fait après la création de `app`.
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

allowed_origins = [x.strip() for x in settings.FRONTEND_ORIGINS.split(",") if x.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

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

class PasswordIn(BaseModel):
    password: str

class ExpiryIn(BaseModel):
    expires_at: str


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
    s = SessionLocal()
    try:
        if not s.get(Account, "demo"):
            s.add(Account(
                username="demo",
                password_hash=hpw("demo123"),
                pharmacy_name="Pharmacie Démo",
                subscription_status="active",
                expires_at=datetime.utcnow() + timedelta(days=365)
            ))
        if not s.get(Account, "admin"):
            s.add(Account(
                username="admin",
                password_hash=hpw("admin123"),
                pharmacy_name="admin",
                role="platform_admin",
                ai_premium=True,
                subscription_status="active",
                expires_at=datetime.utcnow() + timedelta(days=3650)
            ))
        s.commit()
    finally:
        s.close()

ensure_schema()
ensure_demo()

@app.post("/auth/login")
def login(form: OAuth2PasswordRequestForm = Depends(), s: Session = Depends(db)):
    acc = s.get(Account, form.username)
    if not acc or not verify(form.password, acc.password_hash) or not acc.active:
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
        ai_premium=data.ai_premium,
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
            "ai_premium": getattr(x, "ai_premium", False)
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


@app.get("/dashboard/content")
def dashboard_content(acc: Account = Depends(current_user), s: Session = Depends(db)):
    rows = s.query(DashboardContent).filter(DashboardContent.active == True).order_by(DashboardContent.created_at.desc()).all()
    result = []
    for x in rows:
        if x.scope == "global" or x.target_username == acc.username:
            result.append({
                "id": x.id,
                "scope": x.scope,
                "target_username": x.target_username,
                "title": x.title,
                "message": x.message,
                "cta_label": x.cta_label,
                "cta_url": x.cta_url,
                "content_type": x.content_type,
                "image_url": getattr(x, "image_url", ""),
                "extra_config": getattr(x, "extra_config", "contain") or "contain",
                "active": x.active,
                "created_at": x.created_at.isoformat()
            })
    return result

@app.get("/platform/dashboard-content")
def platform_dashboard_content(acc: Account = Depends(current_user), s: Session = Depends(db)):
    if acc.role != "platform_admin":
        raise HTTPException(403, "Platform admin only")
    return [{
        "id": x.id,
        "scope": x.scope,
        "target_username": x.target_username,
        "title": x.title,
        "message": x.message,
        "cta_label": x.cta_label,
        "cta_url": x.cta_url,
        "content_type": x.content_type,
        "image_url": x.image_url,
        "extra_config": x.extra_config or "contain",
        "active": x.active,
        "created_at": x.created_at.isoformat()
    } for x in s.query(DashboardContent).order_by(DashboardContent.created_at.desc()).all()]

@app.post("/platform/dashboard-content")
def create_dashboard_content(data: DashboardContentIn, acc: Account = Depends(current_user), s: Session = Depends(db)):
    if acc.role != "platform_admin":
        raise HTTPException(403, "Platform admin only")
    if data.scope not in ("global", "pharmacy"):
        raise HTTPException(400, "scope must be global or pharmacy")
    if data.scope == "pharmacy" and not data.target_username:
        raise HTTPException(400, "target_username required")
    obj = DashboardContent(
        id="dash_" + str(int(datetime.utcnow().timestamp() * 1000)),
        scope=data.scope,
        target_username=data.target_username,
        title=data.title,
        message=data.message,
        cta_label=data.cta_label,
        cta_url=data.cta_url,
        content_type=data.content_type,
        image_url=data.image_url,
        extra_config=getattr(data, "extra_config", "contain"),
        active=data.active
    )
    s.add(obj)
    s.commit()
    return {"ok": True, "id": obj.id}

@app.post("/platform/dashboard-content-toggle/{content_id}")
def toggle_dashboard_content(content_id: str, acc: Account = Depends(current_user), s: Session = Depends(db)):
    if acc.role != "platform_admin":
        raise HTTPException(403, "Platform admin only")
    obj = s.get(DashboardContent, content_id)
    if not obj:
        raise HTTPException(404, "Content not found")
    obj.active = not obj.active
    s.commit()
    return {"ok": True, "active": obj.active}

@app.post("/platform/dashboard-content-delete/{content_id}")
def delete_dashboard_content(content_id: str, acc: Account = Depends(current_user), s: Session = Depends(db)):
    if acc.role != "platform_admin":
        raise HTTPException(403, "Platform admin only")
    obj = s.get(DashboardContent, content_id)
    if obj:
        s.delete(obj)
        s.commit()
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
        "resume": f"Couverture RFID {data.coverage}%. {data.products_without_rfid} produits restent sans RFID.",
        "recommandations": [
            "Associer les produits à forte rotation en priorité.",
            "Sauvegarder le projet JSON après chaque session.",
            "Importer les EPC détectés avant chaque analyse d’inventaire.",
            "Viser progressivement 95% de couverture RFID."
        ],
        "alertes": [
            "Les produits sans RFID ne seront pas détectés automatiquement.",
            "Les données locales doivent être sauvegardées régulièrement."
        ],
        "prochaine_action": "Continuer l’association RFID des produits sans tag."
    }
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return {"mode": "local-fallback", "analysis": fallback}

    prompt = f"""
Tu es un assistant professionnel pour une application SaaS RFID destinée aux pharmacies.
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
question={data.question or "Analyse automatiquement la situation RFID."}
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
