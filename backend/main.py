
from datetime import datetime, timedelta, date
import hashlib
from typing import Optional
from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from jose import jwt, JWTError
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, String, DateTime, Boolean
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./license_saas.db"
    SECRET_KEY: str = "change_this_secret_key"
    class Config:
        env_file = ".env"

settings = Settings()
engine = create_engine(settings.DATABASE_URL, connect_args={"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {})
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

app = FastAPI(title="RFID Pharmacy Web SaaS Licence API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

class Account(Base):
    __tablename__ = "accounts"
    username = Column(String, primary_key=True)
    password_hash = Column(String, nullable=False)
    pharmacy_name = Column(String, nullable=False)
    role = Column(String, default="client")
    subscription_status = Column(String, default="active")
    expires_at = Column(DateTime, nullable=False)
    active = Column(Boolean, default=True)
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
    if acc.subscription_status != "active" or acc.expires_at < datetime.utcnow():
        raise HTTPException(402, "Subscription expired")
    return acc

class ClientIn(BaseModel):
    username: str
    password: str
    pharmacy_name: str
    days: int = 30

class PasswordIn(BaseModel):
    password: str

class ExpiryIn(BaseModel):
    expires_at: str

def ensure_demo():
    s = SessionLocal()
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
            pharmacy_name="Plateforme",
            role="platform_admin",
            subscription_status="active",
            expires_at=datetime.utcnow() + timedelta(days=3650)
        ))
    s.commit()
    s.close()
ensure_demo()

@app.post("/auth/login")
def login(form: OAuth2PasswordRequestForm = Depends(), s: Session = Depends(db)):
    acc = s.get(Account, form.username)
    if not acc or not verify(form.password, acc.password_hash) or not acc.active:
        raise HTTPException(401, "Bad credentials")
    if acc.subscription_status != "active" or acc.expires_at < datetime.utcnow():
        raise HTTPException(402, "Subscription expired")
    return {
        "access_token": token({"sub": acc.username}),
        "token_type": "bearer",
        "username": acc.username,
        "pharmacy_name": acc.pharmacy_name,
        "role": acc.role,
        "expires_at": acc.expires_at.isoformat()
    }

@app.get("/me")
def me(acc: Account = Depends(current_user)):
    return {
        "username": acc.username,
        "pharmacy_name": acc.pharmacy_name,
        "role": acc.role,
        "subscription_status": acc.subscription_status,
        "expires_at": acc.expires_at.isoformat()
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
            "subscription_status": x.subscription_status,
            "expires_at": x.expires_at.isoformat(),
            "active": x.active
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

