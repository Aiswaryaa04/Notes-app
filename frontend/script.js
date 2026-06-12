const API = 'http://127.0.0.1:8000'

const TAG_COLORS = ['t-blue', 't-lavender', 't-mint', 't-peach', 't-sky']
const TAG_DOTS = ['#7b9ae8', '#9b8ee8', '#6dc4a8', '#e8b87b', '#7bbce8']

let allNotes = []
let activeTag = null
let activeView = 'all'
let isGridView = true

document.addEventListener('DOMContentLoaded', function () {

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
  const searchInput = document.getElementById('search-input')
  const searchResults = document.getElementById('search-results')
  const searchArea = document.getElementById('search-area')
  const chipsContainer = document.getElementById('chips')

  loadNotes()
  loadStreak()

  // ── New note ──
  newNoteBtn.addEventListener('click', function () {
    noteInputArea.style.display = 'flex'
    titleInput.focus()
    showView('all')
  })

  cancelBtn.addEventListener('click', function () {
    noteInputArea.style.display = 'none'
    titleInput.value = ''
    bodyInput.value = ''
  })

  // ── Theme ──
  themeToggle.addEventListener('click', function () {
    const html = document.documentElement
    const isDark = html.getAttribute('data-theme') === 'dark'
    html.setAttribute('data-theme', isDark ? 'light' : 'dark')
    themeToggle.querySelector('i').className = isDark ? 'ti ti-moon' : 'ti ti-sun'
    themeToggle.querySelector('span').textContent = isDark ? 'Dark mode' : 'Light mode'
  })

  // ── View toggle ──
  document.getElementById('view-grid').addEventListener('click', function () {
    isGridView = true
    notesList.classList.remove('list-view')
    document.getElementById('view-grid').classList.add('active')
    document.getElementById('view-list').classList.remove('active')
  })

  document.getElementById('view-list').addEventListener('click', function () {
    isGridView = false
    notesList.classList.add('list-view')
    document.getElementById('view-list').classList.add('active')
    document.getElementById('view-grid').classList.remove('active')
  })

  // ── Sidebar nav ──
  document.getElementById('nav-all').addEventListener('click', function () {
    setNavActive('nav-all')
    showView('all')
    document.getElementById('page-title').textContent = 'My notes'
    document.getElementById('page-sub').textContent = 'Your personal knowledge base'
  })

  document.getElementById('nav-pinned').addEventListener('click', function () {
    setNavActive('nav-pinned')
    showView('pinned')
    document.getElementById('page-title').textContent = 'Pinned'
    document.getElementById('page-sub').textContent = 'Your important notes'
  })

  document.getElementById('nav-search').addEventListener('click', function () {
    setNavActive('nav-search')
    showView('search')
    document.getElementById('page-title').textContent = 'Search'
    document.getElementById('page-sub').textContent = 'Find anything in your notes'
    setTimeout(() => searchInput.focus(), 100)
  })

  function setNavActive(id) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))
    document.getElementById(id).classList.add('active')
  }

  function showView(view) {
    activeView = view
    notesList.style.display = view === 'search' ? 'none' : 'grid'
    chipsContainer.style.display = view === 'search' ? 'none' : 'flex'
    searchArea.style.display = view === 'search' ? 'flex' : 'none'
    if (view !== 'search') renderNotes()
  }

  // ── Search ──
  searchInput.addEventListener('input', function () {
    const q = searchInput.value.trim().toLowerCase()
    if (!q) { searchResults.innerHTML = ''; return }
    const results = allNotes.filter(n =>
      n.title.toLowerCase().includes(q) ||
      n.body.toLowerCase().includes(q) ||
      (n.tags || []).some(t => t.toLowerCase().includes(q))
    )
    searchResults.innerHTML = results.length
      ? results.map(noteCardHTML).join('')
      : '<div class="empty-state"><i class="ti ti-search-off"></i><p>No notes match your search</p></div>'
  })

  // ── Save note ──
  saveBtn.addEventListener('click', saveNote)

  async function saveNote() {
    const title = titleInput.value.trim()
    const body = bodyInput.value.trim()
    if (!title || !body) { alert('Please fill in both fields!'); return }

    saveBtn.textContent = 'Analysing...'
    saveBtn.disabled = true

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
      console.log('AI tagging failed')
    }

    const note = {
      id: Date.now(),
      title, body,
      date: new Date().toLocaleDateString(),
      pinned: false,
      tags, mood
    }

    const res = await fetch(`${API}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(note)
    })

    if (res.ok) {
      titleInput.value = ''
      bodyInput.value = ''
      noteInputArea.style.display = 'none'
      saveBtn.innerHTML = '<i class="ti ti-check" aria-hidden="true"></i> Save note'
      saveBtn.disabled = false
      loadNotes()
      loadStreak()
    }
  }

  // ── Load notes ──
  async function loadNotes() {
    const res = await fetch(`${API}/notes`)
    allNotes = await res.json()
    renderNotes()
    renderTagList()
    renderChips()
  }

  // ── Render notes ──
  function renderNotes() {
    let notes = allNotes
    if (activeView === 'pinned') notes = allNotes.filter(n => n.pinned)
    if (activeTag) notes = notes.filter(n => (n.tags || []).includes(activeTag))

    if (notes.length === 0) {
      notesList.innerHTML = `<div class="empty-state">
        <i class="ti ti-notes-off" aria-hidden="true"></i>
        <p>${activeView === 'pinned' ? 'No pinned notes yet' : 'No notes yet — write your first one!'}</p>
      </div>`
      return
    }

    notesList.innerHTML = notes.map(noteCardHTML).join('')
  }

  function noteCardHTML(note) {
    const tagsHTML = (note.tags || []).map(function (tag, i) {
      const colorClass = TAG_COLORS[i % TAG_COLORS.length]
      return `<span class="note-tag ${colorClass}">#${tag}</span>`
    }).join('')

    return `
      <div class="note-card ${note.pinned ? 'pinned' : ''}" id="card-${note.id}">
        <div class="note-card-top">
          <span class="note-mood">${note.mood || '💡'}</span>
          <span class="note-title">${note.title}</span>
          <button class="pin-btn ${note.pinned ? 'pinned' : ''}"
            onclick="togglePin(${note.id})"
            aria-label="${note.pinned ? 'Unpin note' : 'Pin note'}">
            <i class="ti ${note.pinned ? 'ti-pin-filled' : 'ti-pin'}" aria-hidden="true"></i>
          </button>
        </div>
        <p class="note-body">${note.body}</p>
        ${tagsHTML ? `<div class="note-tags">${tagsHTML}</div>` : ''}
        <div class="note-card-footer">
          <span class="note-date">${note.date}</span>
          <button class="delete-btn" onclick="deleteNote(${note.id})" aria-label="Delete note">
            <i class="ti ti-trash" aria-hidden="true"></i>
          </button>
        </div>
      </div>`
  }

  // ── Tag list in sidebar ──
  function renderTagList() {
    const tagSet = new Set()
    allNotes.forEach(n => (n.tags || []).forEach(t => tagSet.add(t)))
    const tags = Array.from(tagSet)
    const tagList = document.getElementById('tag-list')

    if (tags.length === 0) {
      tagList.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:4px 10px;">Tags appear after saving notes</div>'
      return
    }

    tagList.innerHTML = tags.map(function (tag, i) {
      const dot = TAG_DOTS[i % TAG_DOTS.length]
      return `<div class="tag-item ${activeTag === tag ? 'active' : ''}" onclick="filterByTag('${tag}')">
        <span class="tag-dot" style="background:${dot}"></span> ${tag}
      </div>`
    }).join('')
  }

  // ── Chips ──
  function renderChips() {
    const tagSet = new Set()
    allNotes.forEach(n => (n.tags || []).forEach(t => tagSet.add(t)))
    const tags = Array.from(tagSet)

    chipsContainer.innerHTML = `
      <button class="chip ${!activeTag ? 'active' : ''}" onclick="filterByTag(null)">All</button>
      ${tags.map(t => `<button class="chip ${activeTag === t ? 'active' : ''}" onclick="filterByTag('${t}')">#${t}</button>`).join('')}
    `
  }

  // ── Streak ──
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
    askAnswer.textContent = 'Thinking...'

    const res = await fetch(`${API}/ai/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question })
    })

    const data = await res.json()
    askAnswer.textContent = data.answer
    askInput.value = ''
  })

  askInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') askBtn.click()
  })

  // ── Global ──
  window.deleteNote = async function (id) {
    await fetch(`${API}/notes/${id}`, { method: 'DELETE' })
    loadNotes()
  }

  window.togglePin = async function (id) {
    await fetch(`${API}/notes/${id}/pin`, { method: 'PATCH' })
    loadNotes()
  }

  window.filterByTag = function (tag) {
    activeTag = tag
    renderNotes()
    renderTagList()
    renderChips()
  }
})