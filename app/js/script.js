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
    opt.value = b.bible_id;
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
  const url = `${API_BASE}/search?module=${bibleId}`
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

// ————————————————————————————————————————————
// Parse the LaTeX into structured nodes, preserving Strong's numbers
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
    // preserve and wrap Strong's references
    let text = m[2]
      // wrap Strong's number commands in clickable spans
      .replace(/\\swordstrong\{([^}]+)\}\{([^}]+)\}/g, (_, module, num) => {
        const raw = num.replace(/^0+/, '');
        return `<span class="strong-number" data-module="${module}" data-strong="${raw}">${raw}</span>`;
      })
      // strip other LaTeX commands
      .replace(/\\[a-zA-Z]+(?:\{[^}]*\})*/g, '')
      .replace(/[{}]/g, '')
      .trim();

    nodes.push({ type: 'verse', number: m[1], text });
  }
  return nodes;
}

// ————————————————————————————————————————————
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
      // allow HTML for clickable Strong's numbers
      const textNode = document.createElement('span');
      textNode.innerHTML = ' ' + node.text;
      p.appendChild(textNode);
      container.appendChild(p);
    }
  });

  return container;
}

// ————————————————————————————————————————————
// Attach click handlers to Strong's number spans
function initializeStrongClicks() {
  const elems = document.querySelectorAll('.strong-number');
  elems.forEach(elem => {
    elem.style.cursor = 'pointer';
    elem.addEventListener('click', async () => {
      const module = elem.dataset.module;
      const num = elem.dataset.strong;
      const code = num.padStart(5, '0');
      const defPanel = document.querySelector('.lexicon-results');
      defPanel.innerHTML = '<p>Loading…</p>';
      try {
        const data = await lookupStrongs(code, module);
        const parsed = data.parsed;
        defPanel.innerHTML = `
          <div class="lex-entry">
            <span class="strongs-number">${parsed.entry}</span>
            <span class="lex-word">${parsed.word.replace(/<[^>]+>/g, '')} <em>(${parsed.transliteration.replace(/<[^>]+>/g, '')})</em></span>
            <p class="lex-def">${parsed.definition}</p>
          </div>
        `;
      } catch(err) {
        defPanel.innerHTML = `<p class="error">${err.message}</p>`;
      }
    });
  });
}

// ————————————————————————————————————————————
// Main: load & render the selected chapter
async function displayChapter() {
  const bookSel = document.getElementById('book-select');
  const chapter = document.getElementById('chapter-input').value;
  const out = document.getElementById('scripture-container');
  out.textContent = 'Loading…';

  // Get the selected option's text (the book name)
  const bookName = bookSel.selectedOptions[0].textContent;

  try {
    const latex = await fetchChapterLaTeX(bookName, chapter); // use bookName, not bookId
    const parsed = parseSwordLaTeX(latex);
    const html = renderSwordHTML(parsed);
    out.innerHTML = '';
    out.appendChild(html);
    // now enable Strong's lookup clicks
    initializeStrongClicks();
  } catch (err) {
    out.textContent = 'Error: ' + err.message;
  }
}

// ————————————————————————————————————————————
// Lexicon lookup (Strongs)
async function lookupStrongs(strongsNumber, moduleName) {
  const url = `${API_BASE}/commentaries?module=Strongs${moduleName}&strongs=${strongsNumber}`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`No entry for ${strongsNumber} (${moduleName})`);
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
  await loadData();
  populateBibleDropdown();
  populateBookDropdown();

  document.getElementById('bible-select').addEventListener('change', populateBookDropdown);
  document.getElementById('load-btn').addEventListener('click', () => {
    const menuPanel = document.getElementById('menu-panel');
    const controls = document.querySelector('.controls');

    // Collapse both menus if open
    if (menuPanel && menuPanel.classList.contains('open')) {
      menuPanel.classList.remove('open');
    }
    if (window.innerWidth <= 600 && controls) {
      controls.classList.remove('open');
    }
    displayChapter();
  });

  // Hamburger menu toggle
  const menuToggle = document.getElementById('menu-toggle');
  const menuPanel  = document.getElementById('menu-panel');

  if (menuToggle && menuPanel) {
    menuToggle.addEventListener('click', () => {
      menuPanel.classList.toggle('open');
    });
  }

  const ctrlToggle = document.getElementById('ctrl-toggle');
  const controls   = document.querySelector('.controls');
  const loadBtn    = document.getElementById('load-btn');

  // Hamburger toggles controls panel
  ctrlToggle.addEventListener('click', function() {
    controls.classList.toggle('open');
  });

  // When "Load Chapter" is clicked, collapse controls on mobile
  loadBtn.addEventListener('click', function() {
    if (window.innerWidth <= 600) {
      controls.classList.remove('open');
    }
  });
});
