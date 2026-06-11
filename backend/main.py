from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from anthropic import Anthropic
from dotenv import load_dotenv
import json
import os

# Load the .env file so we can read ANTHROPIC_API_KEY
load_dotenv()

# Create FastAPI app
app = FastAPI()

# Allow frontend to talk to backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Anthropic client
client = Anthropic()

# Note shape
class Note(BaseModel):
    id: int
    title: str
    body: str
    date: str

# File storage
NOTES_FILE = "notes.json"

def read_notes():
    if not os.path.exists(NOTES_FILE):
        return []
    with open(NOTES_FILE, "r") as f:
        return json.load(f)

def write_notes(notes):
    with open(NOTES_FILE, "w") as f:
        json.dump(notes, f)

# ─────────────────────────────────────
# EXISTING ROUTES
# ─────────────────────────────────────

@app.get("/notes")
def get_notes():
    return read_notes()

@app.post("/notes")
def create_note(note: Note):
    notes = read_notes()
    notes.insert(0, note.dict())
    write_notes(notes)
    return note

@app.delete("/notes/{note_id}")
def delete_note(note_id: int):
    notes = read_notes()
    updated = [n for n in notes if n["id"] != note_id]
    write_notes(updated)
    return {"message": "Note deleted"}

# ─────────────────────────────────────
# AI ROUTE — summarise a note
# ─────────────────────────────────────

class SummariseRequest(BaseModel):
    title: str
    body: str

@app.post("/summarise")
def summarise_note(request: SummariseRequest):

    message = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=256,
        messages=[
            {
                "role": "user",
                "content": f"Summarise this note in 2-3 sentences. Be concise and clear.\n\nTitle: {request.title}\n\nNote: {request.body}"
            }
        ]
    )

    summary = message.content[0].text
    return {"summary": summary}