// script.js
// ==========

const API_BASE = 'https://api.keyofkingdavid.org/api';

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
    // stash which book_set_ids this Bible uses:
    opt.dataset.bookSets = JSON.stringify(b.book_set_ids);
    select.appendChild(opt);
  });
}

// Populate the “Book” dropdown, grouped by Old/New Testament & category:
function populateBookDropdown() {
  const bibleId = document.getElementById('bible-select').value;
  const bible   = bibles.find(b => b.bible_id === bibleId);
  if (!bible) return;

  // gather all books available to this Bible
  const available = [];
  bible.book_set_ids.forEach(setId => {
    (bookSets[setId]||[]).forEach(book => available.push(book));
  });

  // helper: find book obj by its human name
  function findBookByName(name) {
    return available.find(b => b.name.toLowerCase() === name.toLowerCase());
  }

  const bookSel = document.getElementById('book-select');
  bookSel.innerHTML = '';

  // for each Testament section in layout:
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
          opt.value = bObj.id;
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

  updateChapterInputMax();
}

// Adjust the chapter `<input>`’s `max` to match the selected book.
function updateChapterInputMax() {
  const opt = document.getElementById('book-select').selectedOptions[0];
  const maxCh = opt ? Number(opt.dataset.chapters) : 1;
  const chapInput = document.getElementById('chapter-input');
  chapInput.max = maxCh;
  chapInput.value = 1;
}

// ————————————————————————————————————————————
// Fetch L a T e X from your API
async function fetchChapterLaTeX(book, chapter) {
  const bibleId = document.getElementById('bible-select').value;
  const q       = encodeURIComponent(`${book} ${chapter}`);
  const url = `${API_BASE}/search?module=${bibleId}&query=${q}`
            + `&output_format=LaTeX&output_encoding=UTF8`
            + `&variant=0&locale=en`
            + `&option_filters=nfmhcvaplsrbwgeixtM`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`API returned ${res.status}`);
  const { result: latex } = await res.json();
  return latex;
}

// Parse out chapter title + all verses
function parseSwordLaTeX(latex) {
  const nodes = [];
  // chapter
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
      .replace(/\\[a-zA-Z]+(?:\{[^}]*\})*/g, '')  // strip LaTeX commands
      .replace(/[{}]/g, '')                      // strip braces
      .trim();
    nodes.push({ type: 'verse', number: m[1], text });
  }

  return nodes;
}

// Render into HTML
function renderSwordHTML(nodes) {
  const container = document.createElement('div');
  container.className = 'scripture';

  nodes.forEach(node => {
    if (node.type === 'chapter') {
      // split OSIS (e.g. "Gen.1") → [bookCode, chapNum]
      const [bookCode, chapNum] = node.osis.split('.');
      // drop trailing “:1” from the human title
      const cleanTitle = node.title.replace(/:\d+$/, '');
      const h2 = document.createElement('h2');
      h2.textContent = `${cleanTitle}`;
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

// Main “Load Chapter” action
async function displayChapter() {
  const book    = document.getElementById('book-select').value;
  const chapter = document.getElementById('chapter-input').value;
  const out     = document.getElementById('scripture-container');
  out.textContent = 'Loading…';

  try {
    const latex  = await fetchChapterLaTeX(book, chapter);
    const parsed = parseSwordLaTeX(latex);
    const html   = renderSwordHTML(parsed);
    out.innerHTML = '';
    out.appendChild(html);
  } catch (err) {
    out.textContent = 'Error: ' + err.message;
  }
}

// ————————————————————————————————————————————
// Load data and wire everything up
async function loadData() {
  const [biblesData, bookSetsData, layoutData] = await Promise.all([
    fetch('books/bibles.json').then(r => r.json()),
    fetch('books/book_sets.json').then(r => r.json()),
    fetch('books/bibles_layout.json').then(r => r.json())
  ]);
  bibles = biblesData.bibles;
  layout = layoutData.layout;
  bookSets = {};
  bookSetsData.book_sets.forEach(set => {
    bookSets[set.set_id] = set.books;
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  populateBibleDropdown();
  populateBookDropdown();
  document.getElementById('bible-select').addEventListener('change', populateBookDropdown);

  // Add this to wire up the button
  document.getElementById('load-btn').addEventListener('click', displayChapter);
});



// grab references once
const toggleBtn = document.getElementById('ctrl-toggle');
const ctrls     = document.querySelector('.controls');
const loadBtn   = document.getElementById('load-btn');

// helper to close the drawer on mobile
function hideControlsIfMobile() {
  if (window.innerWidth <= 600) {
    ctrls.classList.remove('open');
    toggleBtn.textContent = '☰';
  }
}

// 1) wire up your existing toggle
toggleBtn.addEventListener('click', () => {
  ctrls.classList.toggle('open');
  toggleBtn.textContent = ctrls.classList.contains('open') ? '×' : '☰';
});

// 2) intercept the Load button
loadBtn.addEventListener('click', async (e) => {
  e.preventDefault();                // if it's in a form, stop full reload
  hideControlsIfMobile();           // immediately close the drawer

  // now fire off your chapter load (example: fetch + render)
  try {
    await loadChapter();            // if loadChapter returns a Promise
  } catch (err) {
    console.error(err);
  }

  // optionally re-close after the load completes:
  // hideControlsIfMobile();
});



// --- Lexicon Lookup ---
const lexInput    = document.getElementById('lexicon-search');
const lexModule   = document.getElementById('lexicon-module');
const lexButton   = document.querySelector('.panel .btn-search');
const lexResults  = document.querySelector('.lexicon-results');

async function lookupStrongs(strongsNumber, moduleName) {
  // strip leading zeros, then pad if needed by the API
  const raw   = strongsNumber.toString().replace(/^0+/, '');
  const code  = raw.padStart(5, '0');
  const url   = `${API_BASE}/commentaries?module=${moduleName}&strongs=${code}`;
  const res   = await fetch(url);

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`No entry found for ${raw} (${moduleName})`);
    }
    throw new Error(`API error: ${res.status}`);
  }
  return res.json();
}

lexButton.addEventListener('click', async () => {
  const num    = lexInput.value.trim();
  const module = lexModule.value;   // “StrongsHebrew” or “StrongsGreek”

  if (!num) return;
  lexResults.innerHTML = `<p>Loading…</p>`;

  try {
    const { parsed } = await lookupStrongs(num, module);

    lexResults.innerHTML = `
      <div class="lex-entry">
        <span class="strongs-number">${parsed.entry}</span>
        <span class="lex-word">
          ${parsed.word} <em>(${parsed.transliteration})</em>
        </span>
        <p class="lex-def">${parsed.definition}</p>
      </div>
    `;
  } catch (err) {
    lexResults.innerHTML = `<p class="error">${err.message}</p>`;
  }
});

// also allow Enter key
lexInput.addEventListener('keypress', e => {
  if (e.key === 'Enter') lexButton.click();
});
