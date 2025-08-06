// scripture_app.js
// Front-end logic for Key of King David Bible study application
// Handles dropdown population, chapter fetching & rendering, Strong's lookups, phrase search, and cross-references

// 1) Base URL for API proxy
const API_BASE = 'https://api.keyofkingdavid.org/api';

// ----- State Holders -----
let bibles = [];        // Array of available Bible metadata
let bookSets = {};      // Mapping from book_set_id to array of book objects
let layout = {};        // Structure for organizing books by testament and category

// ----- Utility Functions -----

/**
 * Load JSON data from a local file path.
 * @param {string} path - Relative path to JSON file.
 * @returns {Promise<any>} Parsed JSON data.
 */
async function loadJSON(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }
  return response.json();
}

// ----- Dropdown Population -----

/**
 * Populate the "Bible" dropdown (<select id="bible-select").
 * Groups bibles by language and sorts languages & bible names alphabetically.
 */
function populateBibleDropdown() {
  const select = document.getElementById('bible-select');
  select.innerHTML = '';

  // Group bibles by language code
  const byLang = bibles.reduce((acc, bible) => {
    const lang = bible.lang || 'Unknown';
    if (!acc[lang]) acc[lang] = [];
    acc[lang].push(bible);
    return acc;
  }, {});

  // Sort languages, then create <optgroup> for each
  Object.keys(byLang).sort().forEach(lang => {
    const group = byLang[lang];
    group.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );

    const optgroup = document.createElement('optgroup');
    optgroup.label = lang;

    group.forEach(bible => {
      const opt = document.createElement('option');
      opt.value = bible.bible_id;
      opt.textContent = bible.name;
      if (bible.lang) opt.dataset.lang = bible.lang;
      if (bible.book_set_ids) opt.dataset.bookSets = JSON.stringify(bible.book_set_ids);
      optgroup.appendChild(opt);
    });

    select.appendChild(optgroup);
  });
}

/**
 * Populate the "Book" dropdown (<select id="book-select").
 * Filters and organizes books by Old/New Testament and categories.
 */
function populateBookDropdown() {
  const bibleId = document.getElementById('bible-select').value;
  const bible = bibles.find(b => b.bible_id === bibleId);
  if (!bible) return;

  // Collect all books available for this Bible
  const available = bible.book_set_ids.flatMap(setId => bookSets[setId] || []);

  const bookSelect = document.getElementById('book-select');
  bookSelect.innerHTML = '';

  // Iterate through Old and New Testament layout
  ['old_testament', 'new_testament'].forEach(sectionKey => {
    const section = layout[sectionKey];
    if (!section) return;

    section.categories.forEach(category => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = category.name;

      category.books.forEach(bookName => {
        const book = available.find(
          b => b.name.toLowerCase() === bookName.toLowerCase()
        );
        if (book) {
          const opt = document.createElement('option');
          opt.value = book.id;
          opt.textContent = book.name;
          opt.dataset.chapters = book.chapter_count;
          optgroup.appendChild(opt);
        }
      });

      if (optgroup.children.length) {
        bookSelect.appendChild(optgroup);
      }
    });
  });

  // Reset chapter input constraints
  // const chapInput = document.getElementById('chapter-input');
  // const firstOpt = bookSelect.selectedOptions[0];
  // chapInput.max = firstOpt ? Number(firstOpt.dataset.chapters) : 1;
  // chapInput.value = 1;
}

// ----- Chapter Fetch & Parsing -----

/**
 * Fetch LaTeX markup for a specific chapter from the API.
 * @param {string} bookName - Name of the book (e.g., "Genesis").
 * @param {number} chapter - Chapter number.
 * @returns {Promise<string>} Raw LaTeX result.
 */
async function fetchChapterLaTeX(bookName, chapter) {
  const bibleId = document.getElementById('bible-select').value;
  const query = encodeURIComponent(`${bookName} ${chapter}`);
  const url = `${API_BASE}/search?module=${bibleId}` +
    `&query=${query}` +
    `&output_format=LaTeX` +
    `&output_encoding=UTF8` +
    `&variant=0` +
    `&locale=en` +
    `&option_filters=nfmhcvaplsrbwgeixtM`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API returned status ${response.status}`);
  }
  const data = await response.json();
  return data.result;
}

/**
 * Parse LaTeX into structured nodes: chapter header and verses.
 * Preserves Strong's numbers and divine names.
 * @param {string} latex - Raw LaTeX string.
 * @returns {Array<Object>} Array of nodes with type, number/text, etc.
 */
function parseSwordLaTeX(latex) {
  const nodes = [];

  // Match chapter header
  const chapRe = /\\swordchapter\{([^}]+)\}\{([^}]+)\}\{\d+\}/;
  const cm = chapRe.exec(latex);
  if (cm) {
    nodes.push({ type: 'chapter', osis: cm[1], title: cm[2] });
  }

  // Match verses
  const verseRe = /\\swordverse\{[^}]+\}\{[^}]+\}\{(\d+)\}([\s\S]*?)(?=(?:\\swordverse|\\end\{document\}))/g;
  let m;
  while ((m = verseRe.exec(latex)) !== null) {
    let text = m[2]
      // Convert Strong's commands into clickable spans
      .replace(/\\swordstrong\{([^}]+)\}\{([^}]+)\}/g, (_, module, num) => {
        const raw = num.replace(/^0+/, '');
        const prefix = module === 'Hebrew' ? 'H' : module === 'Greek' ? 'G' : module.charAt(0).toUpperCase();
        const display = `${prefix}${raw}`;
        return `<span class="strong-number" data-module="${module}" data-strong="${raw}">${display}</span>`;
      })
      // Convert divine name markup
      .replace(/\\sworddivinename\{([^}]+)\}/g, (_, name) => `<span class="divine-name">${name}</span>`)
      // Strip other LaTeX commands and braces
      .replace(/\\[a-zA-Z]+(?:\{[^}]*\})*/g, '')
      .replace(/[{}]/g, '')
      .trim();

    nodes.push({ type: 'verse', number: m[1], text });
  }

  return nodes;
}

// ----- Rendering HTML -----

/**
 * Render parsed nodes into a HTML container.
 * Adds language-specific CSS classes and verse links.
 * @param {Array<Object>} nodes - Parsed LaTeX nodes.
 * @returns {HTMLElement} Container with rendered content.
 */
function renderSwordHTML(nodes) {
  const container = document.createElement('div');
  container.className = 'scripture';

  // Determine language class from selected Bible
  const bibleId = document.getElementById('bible-select').value;
  const bible = bibles.find(b => b.bible_id === bibleId);
  if (bible) {
    const langClass = bible.lang === 'he' ? 'hebrew'
      : ['gr', 'el'].includes(bible.lang) ? 'greek'
      : bible.lang === 'la' ? 'latin'
      : 'english';
    container.classList.add(langClass);
  }

  // Construct elements for chapter and verses
  nodes.forEach(node => {
    if (node.type === 'chapter') {
      const h2 = document.createElement('h2');
      h2.textContent = node.title.replace(/[:\s]+$/, ''); // Remove trailing colon/space
      h2.className = 'chapter-title';
      container.appendChild(h2);
    } else {
      const p = document.createElement('p');
      const sup = document.createElement('sup');
      const link = document.createElement('a');
      link.href = '#';
      link.className = 'bible-verse-link';
      link.dataset.ref = `${nodes.find(n => n.type==='chapter').title.split(':')[0]}:${node.number}`;
      link.textContent = node.number;
      sup.appendChild(link);
      p.appendChild(sup);

      const span = document.createElement('span');
      span.innerHTML = ' ' + node.text;
      p.appendChild(span);

      container.appendChild(p);
    }
  });

  return container;
}

// ----- Strong's Lookup -----

/**
 * Attach click handlers to Strong's number spans.
 * Fetches definition entries and renders in lexicon panel.
 */
function initializeStrongClicks() {
  document.querySelectorAll('.strong-number').forEach(elem => {
    elem.style.cursor = 'pointer';
    elem.addEventListener('click', async () => {
      const module = elem.dataset.module;
      const num = elem.dataset.strong;
      const code = num.padStart(5, '0');
      const panel = document.querySelector('.lexicon-results');
      panel.innerHTML = '<p>Loading…</p>';
      try {
        const data = await lookupStrongs(code, module);
        const parsed = data.parsed;
        panel.innerHTML = `
          <div class="lex-entry">
            <span class="strongs-number">${parsed.entry}</span>
            <span class="lex-word">${parsed.word} <em>(${parsed.transliteration})</em></span>
            <p class="lex-def">${parsed.definition}</p>
          </div>`;
      } catch (err) {
        panel.innerHTML = `<p class="error">${err.message}</p>`;
      }
    });
  });
}

// ----- Display Chapter Workflow -----

/**
 * Main function to fetch, parse, render, and initialize interactions for a chapter.
 */
async function displayChapter() {
  const bookSelect = document.getElementById('book-select');
  const chapterInput = document.getElementById('chapter-input');
  const out = document.getElementById('scripture-container');
  out.textContent = 'Loading…';

  const bookName = bookSelect.selectedOptions[0].textContent;
  try {
    const latex = await fetchChapterLaTeX(bookName, chapterInput.value);
    const nodes = parseSwordLaTeX(latex);
    const html = renderSwordHTML(nodes);
    out.innerHTML = '';
    out.appendChild(html);
    initializeStrongClicks();
  } catch (err) {
    out.textContent = `Error: ${err.message}`;
  }
}

/**
 * API call to fetch Strong's entry definitions.
 * @param {string} strongsNumber - Zero-padded Strong's number.
 * @param {string} moduleName - 'Hebrew' or 'Greek'.
 */
async function lookupStrongs(strongsNumber, moduleName) {
  const url = `${API_BASE}/commentaries?module=Strongs${moduleName}&strongs=${strongsNumber}`;
  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`No entry for ${strongsNumber} (${moduleName})`);
    }
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

// ----- Phrase Search Handler -----

/**
 * Handles phrase search button click to find verses containing the query.
 */
async function handlePhraseSearch() {
  const query = document.getElementById('phrase-search').value.trim();
  const linksEl = document.querySelector('.phrase-links');
  const verseEl = document.querySelector('.phrase-verse-area');

  linksEl.innerHTML = 'Searching…';
  verseEl.textContent = '';

  try {
    const bibleId = document.getElementById('bible-select').value;
    const url = `${API_BASE}/search?module=${bibleId}` +
      `&query=${encodeURIComponent(query)}` +
      `&search_type=multiword` +
      `&output_format=plain` +
      `&output_encoding=UTF8` +
      `&variant=0` +
      `&locale=en`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const refs = data.result.match(/([1-3]?\s?[A-Za-z]+\s+\d+:\d+)/g) || [];

    if (refs.length === 0) {
      linksEl.innerHTML = '<em>No matches found.</em>';
    } else {
      linksEl.innerHTML = refs.map(r =>
        `<a href="#" class="phrase-xref" data-ref="${r.trim()}">${r.trim()}</a>`
      ).join(' | ');
    }
  } catch (err) {
    linksEl.innerHTML = `<p class="error">Error: ${err.message}</p>`;
  }
}

// ----- Cross-Reference Handlers & Delegation -----

/**
 * Normalize a raw reference into TSK key format (e.g., "John 3:16:").
 * @param {string} rawRef
 * @returns {string} Normalized ref with trailing colon
 */
function makeTSKKey(rawRef) {
  let ref = rawRef.trim();
  ref = ref.replace(/\s*:\s*/g, ':');
  if (!ref.endsWith(':')) ref += ':';
  return ref;
}

// Event delegation for all cross-reference clicks
function initializeCrossReferenceDelegation() {
  document.addEventListener('click', async (e) => {
    // Phrase Xref click
    if (e.target.matches('.phrase-xref')) {
      e.preventDefault();
      const ref = e.target.dataset.ref;
      const verseEl = document.querySelector('.phrase-verse-area');
      verseEl.textContent = 'Loading…';
      try {
        const bibleId = document.getElementById('bible-select').value;
        const url = `${API_BASE}/search?module=${bibleId}` +
          `&query=${encodeURIComponent(ref)}` +
          `&output_format=plain` +
          `&output_encoding=UTF8` +
          `&variant=0` +
          `&locale=en`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(res.status);
        const data = await res.json();
        verseEl.textContent = data.result || 'Not found.';
      } catch (err) {
        verseEl.textContent = 'Error loading verse.';
      }
      return;
    }

    // Bible verse number click -> load cross references in panels
    if (e.target.matches('.bible-verse-link, .bible-verse-link *')) {
      e.preventDefault();
      const link = e.target.closest('.bible-verse-link');
      const ref = link.dataset.ref;
      const crossrefPanel = document.getElementById('crossref-panel');
      const sidebarPanel = document.getElementById('sidebar-crossref');
      crossrefPanel.innerHTML = 'Loading cross-references…';
      sidebarPanel.innerHTML = 'Loading cross-references…';

      try {
        const key = makeTSKKey(ref);
        const res = await fetch(`${API_BASE}/commentaries?module=TSK&strongs=${encodeURIComponent(key)}`);
        const data = await res.json();
        const refs = [];
        const re = /<scripRef>(.*?)<\/scripRef>/g;
        let m;
        while ((m = re.exec(data.raw_html)) !== null) {
          m[1].split(';').forEach(r => {
            const t = r.trim(); if (t) refs.push(t);
          });
        }

        // Render main panel links
        const linksHtml = refs.map(r => `<a href="#" class="xref-link" data-ref="${r}">${r}</a>`).join(' | ');
        crossrefPanel.innerHTML = `<div class="ref-list-area"><strong>Cross References for ${ref}:</strong><br>${linksHtml}<div class="xref-verse-area" style="margin-top:1em"></div></div>`;

        // Render sidebar links
        sidebarPanel.innerHTML = refs.length ? linksHtml : '<em>No cross-references found.</em>';
      } catch (err) {
        crossrefPanel.innerHTML = '<em>Error loading cross-references.</em>';
        sidebarPanel.innerHTML = '<em>Error loading cross-references.</em>';
      }
      return;
    }

    // Cross-reference link click (within ref-list-area)
    if (e.target.matches('.xref-link')) {
      e.preventDefault();
      const ref = e.target.dataset.ref;
      const refArea = e.target.closest('.ref-list-area');
      let verseArea = refArea.querySelector('.xref-verse-area');
      if (!verseArea) {
        verseArea = document.createElement('div');
        verseArea.className = 'xref-verse-area';
        verseArea.style.marginTop = '1em';
        refArea.appendChild(verseArea);
      }
      verseArea.textContent = 'Loading…';
      try {
        const bibleId = document.getElementById('bible-select').value;
        const res = await fetch(`${API_BASE}/search?module=${bibleId}&query=${encodeURIComponent(ref)}&output_format=plain&output_encoding=UTF8&variant=0&locale=en`);
        const data = await res.json();
        verseArea.textContent = data.result || 'Not found.';
      } catch (err) {
        verseArea.textContent = 'Error loading verse.';
      }
    }
  });
}

// ----- Initialization on DOM Ready -----
window.addEventListener('DOMContentLoaded', async () => {
  try {
    // Load all dropdown data
    const [biblesData, bookSetsData, layoutData] = await Promise.all([
      loadJSON('books/bibles.json'),
      loadJSON('books/book_sets.json'),
      loadJSON('books/bibles_layout.json')
    ]);
    bibles = biblesData.bibles;
    layout = layoutData.layout;
    bookSetsData.book_sets.forEach(set => {
      bookSets[set.set_id] = set.books;
    });

    // Populate dropdowns
    populateBibleDropdown();
    populateBookDropdown();

    // Event listeners for controls
    document.getElementById('bible-select').addEventListener('change', populateBookDropdown);
    document.getElementById('load-btn').addEventListener('click', () => {
      displayChapter();
    });

    // Phrase search button
    document.querySelector('.btn-search').addEventListener('click', handlePhraseSearch);

    // Initialize cross-reference delegation
    initializeCrossReferenceDelegation();
  } catch (err) {
    console.error('Initialization error:', err);
  }
});
