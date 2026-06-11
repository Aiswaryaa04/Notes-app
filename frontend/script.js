const API = 'http://127.0.0.1:8000'

document.addEventListener('DOMContentLoaded', function() {

  const titleInput = document.getElementById('note-title')
  const bodyInput = document.getElementById('note-body')
  const saveBtn = document.getElementById('save-btn')
  const notesList = document.getElementById('notes-list')

  // Load notes when page opens
  loadNotes()

  // Save button click
  saveBtn.addEventListener('click', saveNote)

  // ─────────────────────────────────────
  // SAVE — POST request to backend
  // ─────────────────────────────────────
  async function saveNote() {

    const title = titleInput.value.trim()
    const body = bodyInput.value.trim()

    if (!title || !body) {
      alert('Please fill in both fields!')
      return
    }

    const note = {
      id: Date.now(),
      title: title,
      body: body,
      date: new Date().toLocaleDateString()
    }

    const response = await fetch(`${API}/notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(note)
    })

    if (response.ok) {
      titleInput.value = ''
      bodyInput.value = ''
      loadNotes()
    } else {
      alert('Something went wrong saving the note!')
    }
  }

  // ─────────────────────────────────────
  // LOAD — GET request to backend
  // ─────────────────────────────────────
  async function loadNotes() {

    const response = await fetch(`${API}/notes`)
    const notes = await response.json()

    if (notes.length === 0) {
      notesList.innerHTML = '<p style="color:#999;text-align:center;">No notes yet. Write your first one!</p>'
      return
    }

    notesList.innerHTML = notes.map(function(note) {
      return `
        <div class="note-card" id="card-${note.id}">
          <h3>${note.title}</h3>
          <p>${note.body}</p>
          <div id="summary-${note.id}" class="summary-box" style="display:none;"></div>
          <div class="note-card-footer">
            <span class="note-date">${note.date}</span>
            <div style="display:flex; gap:8px;">
              <button class="summarise-btn" onclick="summariseNote(${note.id}, '${encodeURIComponent(note.title)}', '${encodeURIComponent(note.body)}')">✨ Summarise</button>
              <button class="delete-btn" onclick="deleteNote(${note.id})">Delete</button>
            </div>
          </div>
        </div>
      `
    }).join('')
  }

  // ─────────────────────────────────────
  // DELETE — DELETE request to backend
  // ─────────────────────────────────────
  window.deleteNote = async function(id) {

    const response = await fetch(`${API}/notes/${id}`, {
      method: 'DELETE'
    })

    if (response.ok) {
      loadNotes()
    }
  }

  // ─────────────────────────────────────
  // SUMMARISE — AI call to backend
  // ─────────────────────────────────────
  window.summariseNote = async function(id, encodedTitle, encodedBody) {

    const title = decodeURIComponent(encodedTitle)
    const body = decodeURIComponent(encodedBody)

    const summaryBox = document.getElementById(`summary-${id}`)
    summaryBox.style.display = 'block'
    summaryBox.textContent = '✨ Summarising...'

    const response = await fetch(`${API}/summarise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body })
    })

    const data = await response.json()
    summaryBox.textContent = data.summary
  }

})