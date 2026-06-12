from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from groq import Groq
from sqlalchemy.orm import Session
from database import get_db, init_db, User, Note, Streak
from auth import (
    hash_password, verify_password,
    create_access_token, get_current_user
)
from dotenv import load_dotenv
from datetime import date
import json
import os

load_dotenv()

app = FastAPI()
init_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# ─────────────────────────────────────
# Pydantic models (request shapes)
# ─────────────────────────────────────

class SignupRequest(BaseModel):
    name: str
    email: str
    password: str

class NoteCreate(BaseModel):
    title: str
    body: str
    date: str
    pinned: bool = False
    tags: list = []
    mood: str = "💡"

class AskRequest(BaseModel):
    question: str

class TagMoodRequest(BaseModel):
    title: str
    body: str

# ─────────────────────────────────────
# AUTH ROUTES
# ─────────────────────────────────────

@app.post("/auth/signup")
def signup(request: SignupRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == request.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        name=request.name,
        email=request.email,
        password_hash=hash_password(request.password)
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": user.email})
    return {"access_token": token, "token_type": "bearer", "name": user.name}

@app.post("/auth/login")
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    token = create_access_token({"sub": user.email})
    return {"access_token": token, "token_type": "bearer", "name": user.name}

@app.get("/auth/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {"id": current_user.id, "name": current_user.name, "email": current_user.email}

# ─────────────────────────────────────
# NOTES ROUTES
# ─────────────────────────────────────

@app.get("/notes")
def get_notes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    notes = db.query(Note).filter(Note.user_id == current_user.id).all()
    pinned = [n for n in notes if n.pinned]
    unpinned = [n for n in notes if not n.pinned]
    result = pinned + unpinned
    return [note_to_dict(n) for n in result]

@app.post("/notes")
def create_note(
    note: NoteCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_note = Note(
        user_id=current_user.id,
        title=note.title,
        body=note.body,
        date=note.date,
        pinned=note.pinned,
        tags=json.dumps(note.tags),
        mood=note.mood
    )
    db.add(db_note)
    db.commit()
    db.refresh(db_note)
    update_streak(current_user.id, db)
    return note_to_dict(db_note)

@app.delete("/notes/{note_id}")
def delete_note(
    note_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    note = db.query(Note).filter(
        Note.id == note_id,
        Note.user_id == current_user.id
    ).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    db.delete(note)
    db.commit()
    return {"message": "Note deleted"}

@app.patch("/notes/{note_id}/pin")
def toggle_pin(
    note_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    note = db.query(Note).filter(
        Note.id == note_id,
        Note.user_id == current_user.id
    ).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    note.pinned = not note.pinned
    db.commit()
    return {"message": "Pin toggled"}

# ─────────────────────────────────────
# STREAK ROUTE
# ─────────────────────────────────────

@app.get("/streak")
def get_streak(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    streak = db.query(Streak).filter(Streak.user_id == current_user.id).first()
    if not streak:
        return {"streak": 0}
    return {"streak": streak.streak}

# ─────────────────────────────────────
# AI ROUTES
# ─────────────────────────────────────

@app.post("/ai/tags-and-mood")
def get_tags_and_mood(
    request: TagMoodRequest,
    current_user: User = Depends(get_current_user)
):
    prompt = f"""Analyze this note and return ONLY a JSON object with no extra text:
{{
  "mood": "one emoji that best represents the mood",
  "tags": ["tag1", "tag2", "tag3"]
}}
Tags should be short single words like: idea, todo, learning, personal, work, focus, creative, reminder
Pick maximum 3 tags. Pick exactly 1 mood emoji.

Note title: {request.title}
Note content: {request.body}"""

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=100
    )

    text = response.choices[0].message.content.strip()
    try:
        text = text.replace("```json", "").replace("```", "").strip()
        result = json.loads(text)
        return result
    except:
        return {"mood": "💡", "tags": ["idea"]}

@app.post("/ai/ask")
def ask_notes(
    request: AskRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    notes = db.query(Note).filter(Note.user_id == current_user.id).all()
    if not notes:
        return {"answer": "You have no notes yet. Start writing!"}

    notes_text = "\n\n".join([
        f"Note {i+1} — {n.title}:\n{n.body}"
        for i, n in enumerate(notes)
    ])

    prompt = f"""You are a helpful assistant. The user has these personal notes:

{notes_text}

Answer this question based only on the notes above:
{request.question}

Be concise and helpful."""

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=300
    )

    return {"answer": response.choices[0].message.content.strip()}

# ─────────────────────────────────────
# HELPERS
# ─────────────────────────────────────

def note_to_dict(note: Note):
    return {
        "id": note.id,
        "title": note.title,
        "body": note.body,
        "date": note.date,
        "pinned": note.pinned,
        "tags": json.loads(note.tags) if note.tags else [],
        "mood": note.mood
    }

def update_streak(user_id: int, db: Session):
    today = str(date.today())
    streak = db.query(Streak).filter(Streak.user_id == user_id).first()

    if not streak:
        streak = Streak(user_id=user_id, streak=1, last_date=today)
        db.add(streak)
        db.commit()
        return

    if streak.last_date == today:
        return

    yesterday = str(date.fromordinal(date.today().toordinal() - 1))
    if streak.last_date == yesterday:
        streak.streak += 1
    else:
        streak.streak = 1

    streak.last_date = today
    db.commit()