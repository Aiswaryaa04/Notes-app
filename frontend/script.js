const API = 'http://127.0.0.1:8000'

let allNotes = []
let activeTag = null

document.addEventListener('DOMContentLoaded', function () {

  // Elements
  const notesList = document.getElementById('notes-list')
  const titleInput = document.getElementById('note-title')
  const bodyInput = document.getElementById('note-body')
  const saveBtn = document.getElementById('save-btn')
  const cancelBtn = document.getElementById('cancel-btn')
  const newNoteBtn = document.getElementById('new-note-btn')
  const noteInputArea = document.getElementById('note-input-area')
  const askInput = document.getElementById('ask-input')
  const askBtn = document.getElementById('ask-btn')
  const askAnswer = document.getElementById('ask-answer')
  const themeToggle = document.getElementById('theme-toggle')
  const streakCount = document.getElementById('streak-count')

  // Init
  loadNotes()
  loadStreak()

  // ── Show / hide new note form ──
  newNoteBtn.addEventListener('click', function () {
    noteInputArea.style.display = 'flex'
    titleInput.focus()
  })

  cancelBtn.addEventListener('click', function () {
    noteInputArea.style.display = 'none'
    titleInput.value = ''
    bodyInput.value = ''
  })

  // ── Theme toggle ──
  themeToggle.addEventListener('click', function () {
    const html = document.documentElement
    const isDark = html.getAttribute('data-theme') === 'dark'
    html.setAttribute('data-theme', isDark ? 'light' : 'dark')
    themeToggle.textContent = isDark ? '🌙 Dark mode' : '☀️ Light mode'
  })

  // ── Save note ──
  saveBtn.addEventListener('click', saveNote)

  async function saveNote() {
    const title = titleInput.value.trim()
    const body = bodyInput.value.trim()

    if (!title || !body) {
      alert('Please fill in both fields!')
      return
    }

    saveBtn.textContent = '✨ Analysing...'
    saveBtn.disabled = true

    // Get AI tags and mood
    let tags = []
    let mood = '💡'

    try {
      const aiRes = await fetch(`${API}/ai/tags-and-mood`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body })
      })
      const aiData = await aiRes.json()
      tags = aiData.tags || []
      mood = aiData.mood || '💡'
    } catch (e) {
      console.log('AI tagging failed, saving without tags')
    }

    const note = {
      id: Date.now(),
      title,
      body,
      date: new Date().toLocaleDateString(),
      pinned: false,
      tags,
      mood
    }

    const response = await fetch(`${API}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(note)
    })

    if (response.ok) {
      titleInput.value = ''
      bodyInput.value = ''
      noteInputArea.style.display = 'none'
      saveBtn.textContent = 'Save Note'
      saveBtn.disabled = false
      loadNotes()
      loadStreak()
    }
  }

  // ── Load notes ──
  async function loadNotes() {
    const response = await fetch(`${API}/notes`)
    allNotes = await response.json()
    renderNotes()
    renderTagFilters()
  }

  // ── Render notes ──
  function renderNotes() {
    const filtered = activeTag
      ? allNotes.filter(n => n.tags && n.tags.includes(activeTag))
      : allNotes

    if (filtered.length === 0) {
      notesList.innerHTML = `
        <div class="empty-state">
          <div style="font-size:40px">🧠</div>
          <p>No notes yet. Start building your second brain!</p>
        </div>`
      return
    }

    notesList.innerHTML = filtered.map(function (note) {
      const tagsHTML = (note.tags || []).map(tag =>
        `<span class="note-tag">#${tag}</span>`
      ).join('')

      return `
        <div class="note-card ${note.pinned ? 'pinned' : ''}" id="card-${note.id}">
          <div class="note-card-top">
            <span class="note-mood">${note.mood || '💡'}</span>
            <span class="note-title">${note.title}</span>
            <button class="pin-btn ${note.pinned ? 'pinned' : ''}"
              onclick="togglePin(${note.id})"
              title="${note.pinned ? 'Unpin' : 'Pin'}">
              ${note.pinned ? '📌' : '📍'}
            </button>
          </div>
          <p class="note-body">${note.body}</p>
          ${tagsHTML ? `<div class="note-tags">${tagsHTML}</div>` : ''}
          <div class="note-card-footer">
            <span class="note-date">${note.date}</span>
            <button class="delete-btn" onclick="deleteNote(${note.id})">🗑</button>
          </div>
        </div>
      `
    }).join('')
  }

  // ── Tag filters ──
  function renderTagFilters() {
    const tagSet = new Set()
    allNotes.forEach(n => (n.tags || []).forEach(t => tagSet.add(t)))
    const tags = Array.from(tagSet)

    const container = document.getElementById('tag-filters')

    if (tags.length === 0) {
      container.innerHTML = '<span style="font-size:12px;color:var(--text3)">Tags appear after saving notes</span>'
      return
    }

    container.innerHTML = `
      <button class="tag-filter-btn ${!activeTag ? 'active' : ''}" onclick="filterTag(null)">All</button>
      ${tags.map(tag => `
        <button class="tag-filter-btn ${activeTag === tag ? 'active' : ''}"
          onclick="filterTag('${tag}')">
          #${tag}
        </button>
      `).join('')}
    `
  }

  // ── Load streak ──
  async function loadStreak() {
    const res = await fetch(`${API}/streak`)
    const data = await res.json()
    streakCount.textContent = data.streak
  }

  // ── Ask AI ──
  askBtn.addEventListener('click', async function () {
    const question = askInput.value.trim()
    if (!question) return

    askAnswer.style.display = 'block'
    askAnswer.textContent = '🤔 Thinking...'

    const res = await fetch(`${API}/ai/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question })
    })

    const data = await res.json()
    askAnswer.textContent = data.answer
  })

  // ── Global functions ──
  window.deleteNote = async function (id) {
    await fetch(`${API}/notes/${id}`, { method: 'DELETE' })
    loadNotes()
  }

  window.togglePin = async function (id) {
    await fetch(`${API}/notes/${id}/pin`, { method: 'PATCH' })
    loadNotes()
  }

  window.filterTag = function (tag) {
    activeTag = tag
    renderNotes()
    renderTagFilters()
  }

})