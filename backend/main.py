from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq
from dotenv import load_dotenv
import json
import os
from datetime import date

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

NOTES_FILE = "notes.json"
STREAK_FILE = "streak.json"

# ─────────────────────────────────────
# Models
# ─────────────────────────────────────

class Note(BaseModel):
    id: int
    title: str
    body: str
    date: str
    pinned: bool = False
    tags: list = []
    mood: str = ""

class AskRequest(BaseModel):
    question: str

class TagMoodRequest(BaseModel):
    title: str
    body: str

# ─────────────────────────────────────
# File helpers
# ─────────────────────────────────────

def read_notes():
    if not os.path.exists(NOTES_FILE):
        return []
    with open(NOTES_FILE, "r") as f:
        return json.load(f)

def write_notes(notes):
    with open(NOTES_FILE, "w") as f:
        json.dump(notes, f)

def read_streak():
    if not os.path.exists(STREAK_FILE):
        return {"streak": 0, "last_date": ""}
    with open(STREAK_FILE, "r") as f:
        return json.load(f)

def update_streak():
    today = str(date.today())
    streak_data = read_streak()
    if streak_data["last_date"] == today:
        return streak_data
    yesterday = str(date.fromordinal(date.today().toordinal() - 1))
    if streak_data["last_date"] == yesterday:
        streak_data["streak"] += 1
    else:
        streak_data["streak"] = 1
    streak_data["last_date"] = today
    with open(STREAK_FILE, "w") as f:
        json.dump(streak_data, f)
    return streak_data

# ─────────────────────────────────────
# Notes routes
# ─────────────────────────────────────

@app.get("/notes")
def get_notes():
    notes = read_notes()
    pinned = [n for n in notes if n.get("pinned")]
    unpinned = [n for n in notes if not n.get("pinned")]
    return pinned + unpinned

@app.post("/notes")
def create_note(note: Note):
    notes = read_notes()
    notes.insert(0, note.dict())
    write_notes(notes)
    update_streak()
    return note

@app.delete("/notes/{note_id}")
def delete_note(note_id: int):
    notes = read_notes()
    updated = [n for n in notes if n["id"] != note_id]
    write_notes(updated)
    return {"message": "Note deleted"}

@app.patch("/notes/{note_id}/pin")
def toggle_pin(note_id: int):
    notes = read_notes()
    for note in notes:
        if note["id"] == note_id:
            note["pinned"] = not note.get("pinned", False)
    write_notes(notes)
    return {"message": "Pin toggled"}

# ─────────────────────────────────────
# Streak route
# ─────────────────────────────────────

@app.get("/streak")
def get_streak():
    return read_streak()

# ─────────────────────────────────────
# AI routes
# ─────────────────────────────────────

@app.post("/ai/tags-and-mood")
def get_tags_and_mood(request: TagMoodRequest):
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
        model="llama3-8b-8192",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=100
    )

    text = response.choices[0].message.content.strip()
    try:
        # clean up any markdown fences
        text = text.replace("```json", "").replace("```", "").strip()
        result = json.loads(text)
        return result
    except:
        return {"mood": "💡", "tags": ["idea"]}


@app.post("/ai/ask")
def ask_notes(request: AskRequest):
    notes = read_notes()
    if not notes:
        return {"answer": "You have no notes yet. Start writing!"}

    notes_text = "\n\n".join([
        f"Note {i+1} — {n['title']}:\n{n['body']}"
        for i, n in enumerate(notes)
    ])

    prompt = f"""You are a helpful assistant. The user has the following personal notes:

{notes_text}

Answer this question based only on the notes above:
{request.question}

Be concise and helpful. If the answer isn't in the notes, say so."""

    response = client.chat.completions.create(
        model="llama3-8b-8192",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=300
    )

    return {"answer": response.choices[0].message.content.strip()}