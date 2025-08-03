// script.js
// ==========

// 1) Your API proxy endpoint
const API_BASE = 'https://api.keyofkingdavid.org/api';

// State holders
let bibles, bookSets = {}, layout;

// ————————————————————————————————————————————
// Populate the “Bible” dropdown
function populateBibleDropdown() {
  const select = document.getElementById('bible-select');
  select.innerHTML = '';
  bibles.forEach(b => {
    const opt = document.createElement('option');
    opt.value       = b.bible_id;
    opt.textContent = `${b.name} (${b.lang})`;
    opt.dataset.bookSets = JSON.stringify(b.book_set_ids);
    select.appendChild(opt);
  });
}

// Populate the “Book” dropdown
function populateBookDropdown() {
  const bibleId = document.getElementById('bible-select').value;
  const bible   = bibles.find(b => b.bible_id === bibleId);
  if (!bible) return;

  // gather books from all sets this Bible uses
  const available = [];
  bible.book_set_ids.forEach(setId => {
    (bookSets[setId]||[]).forEach(book => available.push(book));
  });

  // helper to match by name
  const findBookByName = name =>
    available.find(b => b.name.toLowerCase() === name.toLowerCase());

  const bookSel = document.getElementById('book-select');
  bookSel.innerHTML = '';

  ['old_testament','new_testament'].forEach(testKey => {
    const section = layout[testKey];
    if (!section) return;

    section.categories.forEach(category => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = category.name;

      category.books.forEach(bookName => {
        const bObj = findBookByName(bookName);
        if (bObj) {
          const opt = document.createElement('option');
          opt.value       = bObj.id;
          opt.textContent = bObj.name;
          opt.dataset.chapters = bObj.chapter_count;
          optgroup.appendChild(opt);
        }
      });

      if (optgroup.children.length) {
        bookSel.appendChild(optgroup);
      }
    });
  });

  // reset chapter input
  const chapInput = document.getElementById('chapter-input');
  const firstOpt  = bookSel.selectedOptions[0];
  chapInput.max   = firstOpt ? Number(firstOpt.dataset.chapters) : 1;
  chapInput.value = 1;
}

// ————————————————————————————————————————————
// Fetch LaTeX for a chapter from your API
async function fetchChapterLaTeX(bookId, chapter) {
  const bibleId = document.getElementById('bible-select').value;
  const q       = encodeURIComponent(`${bookId} ${chapter}`);
  const url = `${API_BASE}/search`
            + `?module=${bibleId}`
            + `&query=${q}`
            + `&output_format=LaTeX`
            + `&output_encoding=UTF8`
            + `&variant=0`
            + `&locale=en`
            + `&option_filters=nfmhcvaplsrbwgeixtM`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`API returned ${res.status}`);
  const { result: latex } = await res.json();
  return latex;
}

// Parse the LaTeX into structured nodes
function parseSwordLaTeX(latex) {
  const nodes = [];
  // chapter header
  const chapRe = /\\swordchapter\{([^}]+)\}\{([^}]+)\}\{\d+\}/;
  const cm = chapRe.exec(latex);
  if (cm) {
    nodes.push({ type: 'chapter', osis: cm[1], title: cm[2] });
  }
  // verses
  const verseRe = /\\swordverse\{[^}]+\}\{[^}]+\}\{(\d+)\}([\s\S]*?)(?=(?:\\swordverse|\\end\{document\}))/g;
  let m;
  while ((m = verseRe.exec(latex)) !== null) {
    let text = m[2]
      .replace(/\\[a-zA-Z]+(?:\{[^}]*\})*/g, '')  // strip commands
      .replace(/[{}]/g, '')                      // strip braces
      .trim();
    nodes.push({ type: 'verse', number: m[1], text });
  }
  return nodes;
}

// Render nodes into HTML
function renderSwordHTML(nodes) {
  const container = document.createElement('div');
  container.className = 'scripture';

  nodes.forEach(node => {
    if (node.type === 'chapter') {
      const cleanTitle = node.title.replace(/:\d+$/, '');
      const h2 = document.createElement('h2');
      h2.textContent = cleanTitle;
      container.appendChild(h2);
    } else {
      const p   = document.createElement('p');
      const sup = document.createElement('sup');
      sup.textContent = node.number;
      p.appendChild(sup);
      p.appendChild(document.createTextNode(' ' + node.text));
      container.appendChild(p);
    }
  });

  return container;
}

// Main: load & render the selected chapter
async function displayChapter() {
  const bookId = document.getElementById('book-select').value;
  const chapter = document.getElementById('chapter-input').value;
  const out = document.getElementById('scripture-container');
  out.textContent = 'Loading…';

  try {
    const latex = await fetchChapterLaTeX(bookId, chapter);
    const parsed = parseSwordLaTeX(latex);
    const html = renderSwordHTML(parsed);
    out.innerHTML = '';
    out.appendChild(html);
  } catch (err) {
    out.textContent = 'Error: ' + err.message;
  }
}

// ————————————————————————————————————————————
// Lexicon lookup (Strongs)
async function lookupStrongs(strongsNumber, moduleName) {
  const raw = strongsNumber.toString().replace(/^0+/, '');
  const code = raw.padStart(5, '0');
  const url = `${API_BASE}/commentaries`
            + `?module=${moduleName}`
            + `&strongs=${code}`;

  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`No entry for ${raw} (${moduleName})`);
    }
    throw new Error(`API error: ${res.status}`);
  }
  return res.json();
}

// ————————————————————————————————————————————
// Load dropdown data JSON
async function loadData() {
  const [biblesData, bookSetsData, layoutData] = await Promise.all([
    fetch('books/bibles.json').then(r => r.json()),
    fetch('books/book_sets.json').then(r => r.json()),
    fetch('books/bibles_layout.json').then(r => r.json())
  ]);

  bibles   = biblesData.bibles;
  layout   = layoutData.layout;
  bookSets = {};
  bookSetsData.book_sets.forEach(set => {
    bookSets[set.set_id] = set.books;
  });
}

// ————————————————————————————————————————————
// Wire everything up on DOM ready
window.addEventListener('DOMContentLoaded', async () => {
  // 1) load dropdown data & build UI
  await loadData();
  populateBibleDropdown();
  populateBookDropdown();

  // bible/book selection listeners
  document
    .getElementById('bible-select')
    .addEventListener('change', populateBookDropdown);

  // “Load Chapter” button
  document
    .getElementById('load-btn')
    .addEventListener('click', displayChapter);

  // Lexicon controls
  const lexButton  = document.querySelector('.panel .btn-search');
  const lexInput   = document.getElementById('lexicon-search');
  const lexModule  = document.getElementById('lexicon-module');
  const lexResults = document.querySelector('.lexicon-results');

  lexButton.addEventListener('click', async () => {
    const num    = lexInput.value.trim();
    const module = lexModule.value;
    if (!num) return;

    lexResults.innerHTML = '<p>Loading…</p>';
    try {
      const { parsed } = await lookupStrongs(num, module);
      lexResults.innerHTML = `
        <div class="lex-entry">
          <span class="strongs-number">${parsed.entry}</span>
          <span class="lex-word">
            ${parsed.word} <em>(${parsed.transliteration})</em>
          </span>
          <p class="lex-def">${parsed.definition}</p>
        </div>`;
    } catch (err) {
      lexResults.innerHTML = `<p class="error">${err.message}</p>`;
    }
  });

  lexInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') lexButton.click();
  });

  // Drawer toggle (mobile controls)
  const toggleBtn = document.getElementById('ctrl-toggle');
  const ctrls     = document.querySelector('.controls');

  toggleBtn.addEventListener('click', () => {
    ctrls.classList.toggle('open');
    toggleBtn.textContent = ctrls.classList.contains('open') ? '×' : '☰';
  });
});
