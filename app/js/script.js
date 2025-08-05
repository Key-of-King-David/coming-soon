// 1) Your API proxy endpoint
const API_BASE = 'https://api.keyofkingdavid.org/api';

// State holders
let bibles, bookSets = {}, layout;

/**
 * Populate the “Bible” dropdown, grouped by language and sorted alphabetically
 */
function populateBibleDropdown() {
  const select = document.getElementById('bible-select');
  select.innerHTML = '';

  // Step 1: Group Bibles by language
  const byLang = {};
  bibles.forEach(b => {
    const lang = b.lang || '';
    if (!byLang[lang]) byLang[lang] = [];
    byLang[lang].push(b);
  });

  // Step 2: Sort languages (keys) alphabetically
  const languages = Object.keys(byLang).sort((a, b) => a.localeCompare(b));

  languages.forEach(lang => {
    const group = byLang[lang];

    // Sort Bible entries by name (case-insensitive)
    group.sort((x, y) => 
      x.name.toLowerCase().localeCompare(y.name.toLowerCase())
    );

    const optgroup = document.createElement('optgroup');
    optgroup.label = lang || 'Unknown';

    group.forEach(bible => {
      const opt = document.createElement('option');
      opt.value = bible.bible_id;
      opt.textContent = bible.name;
      if (bible.lang) {
        opt.dataset.lang = bible.lang;
      }
      if (bible.book_set_ids) {
        opt.dataset.bookSets = JSON.stringify(bible.book_set_ids);
      }
      select.appendChild(opt);
      optgroup.appendChild(opt);
    });

    select.appendChild(optgroup);
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
      // render sworddivinename with special styling
      .replace(/\\sworddivinename\{([^}]+)\}/g, (_, name) => {
        return `<span class="divine-name">${name}</span>`;
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

  // Add language-specific class
  const bibleId = document.getElementById('bible-select').value;
  const bible = bibles.find(b => b.bible_id === bibleId);
  if (bible) {
    switch (bible.lang) {
      case 'he':
        container.classList.add('hebrew');
        break;
      case 'gr':
      case 'el':
        container.classList.add('greek');
        break;
      case 'la':
        container.classList.add('latin');
        break;
      default:
        container.classList.add('english');
    }
  }

  nodes.forEach(node => {
    if (node.type === 'chapter') {
      const cleanTitle = node.title.replace(/:\d+$/, '');
      const h2 = document.createElement('h2');
      h2.textContent = cleanTitle;
      container.appendChild(h2);
    } else {
      const p = document.createElement('p');
      const sup = document.createElement('sup');
      const chapterTitle = nodes.find(n => n.type === 'chapter')?.title || '';
      const book = chapterTitle.replace(/\s*\d+$/, '');
      const chapterNum = chapterTitle.match(/\d+$/)?.[0] || '';
      const ref = `${book.trim()} ${chapterNum}:${node.number}`;
      sup.innerHTML = `<a href="#" class="bible-verse-link" data-ref="${ref}">${node.number}</a>`;
      p.appendChild(sup);

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


  // Phrase-search handler
  document.querySelector('.btn-search').addEventListener('click', async () => {
    const query = document.getElementById('phrase-search').value.trim();
    const linksEl = document.querySelector('.phrase-links');
    const verseEl = document.querySelector('.phrase-verse-area');

    linksEl.innerHTML = 'Searching…';
    verseEl.textContent = '';        // clear any old verse

    try {
      const bibleId = document.getElementById('bible-select').value;
      const url = `${API_BASE}/search?module=${bibleId}`
                + `&query=${encodeURIComponent(query)}`
                + `&search_type=multiword`
                + `&output_format=plain`
                + `&output_encoding=UTF8`
                + `&variant=0`
                + `&locale=en`;

      const res  = await fetch(url);
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      const refs = data.result.match(/([1-3]?\s?[A-Za-z]+\s+\d+:\d+)/g) || [];

      if (refs.length === 0) {
        linksEl.innerHTML = '<em>No matches found.</em>';
      } else {
        // build a single row of links, exactly like cross-refs
        linksEl.innerHTML = refs
          .map(r => `<a href="#" class="phrase-xref" data-ref="${r.trim()}">${r.trim()}</a>`)
          .join(' | ');
      }
    } catch (err) {
      linksEl.innerHTML = `<p class="error">Error: ${err.message}</p>`;
    }
  });


  // Cross reference click handler
  document.querySelectorAll('.ref-link').forEach(link => {
    link.addEventListener('click', async function(e) {
      e.preventDefault();
      const verse = this.textContent.split('–')[0].trim(); // e.g. "John 1:1"
      const panel = this.closest('.panel');
      const refArea = panel.querySelector('.ref-list-area') || (() => {
        const d = document.createElement('div');
        d.className = 'ref-list-area';
        panel.appendChild(d);
        return d;
      })();
      refArea.innerHTML = 'Loading cross-references…';

      // Fetch cross-references
      try {
        const res = await fetch(`${API_BASE}/commentaries?module=TSK&strongs=${encodeURIComponent(verse)}`);
        const data = await res.json();
        // Extract all <scripRef>...</scripRef> as references
        const refs = [];
        const re = /<scripRef>(.*?)<\/scripRef>/g;
        let m;
        while ((m = re.exec(data.raw_html)) !== null) {
          m[1].split(';').forEach(ref => {
            const trimmed = ref.trim();
            if (trimmed) refs.push(trimmed);
          });
        }
        if (refs.length === 0) {
          refArea.innerHTML = '<em>No cross-references found.</em>';
          return;
        }
        // Render as hyperlinks
        refArea.innerHTML = refs.map(r =>
          `<a href="#" class="xref-link" data-ref="${r}">${r}</a>`
        ).join(' | ') + '<div class="xref-verse-area" style="margin-top:1em"></div>';

        // Add click handlers for xref links
        refArea.querySelectorAll('.xref-link').forEach(xref => {
          xref.addEventListener('click', async function(ev) {
            ev.preventDefault();
            const ref = this.dataset.ref;
            const verseArea = refArea.querySelector('.xref-verse-area');
            const bibleId = document.getElementById('bible-select').value;
            verseArea.textContent = 'Loading…';
            try {
              const verseRes = await fetch(`${API_BASE}/search?module=${bibleId}&query=${encodeURIComponent(ref)}&output_format=plain&output_encoding=UTF8&variant=0&locale=en`);
              const verseData = await verseRes.json();
              verseArea.textContent = verseData.result || 'Not found.';
            } catch (err) {
              verseArea.textContent = 'Error loading verse.';
            }
          });
        });
      } catch (err) {
        refArea.innerHTML = '<em>Error loading cross-references.</em>';
      }
    });
  });
  function makeTSKKey(rawRef) {
    // 1) Trim whitespace
    let ref = rawRef.trim();

    // 2) Collapse any spaces around colons into a single colon
    //    e.g. "John 3 : 16" → "John 3:16"
    ref = ref.replace(/\s*:\s*/g, ':')

    // 3) Ensure it ends with exactly one trailing colon:
    if (!ref.endsWith(':')) {
      ref = ref + ':';
    }
    return ref;
  }
  document.addEventListener('click', async function(e) {
    // Handle verse number click in Bible content
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

        // Extract all <scripRef>...</scripRef> as references
        const refs = [];
        const re = /<scripRef>(.*?)<\/scripRef>/g;
        let m;
        while ((m = re.exec(data.raw_html)) !== null) {
          m[1].split(';').forEach(r => {
            const trimmed = r.trim();
            if (trimmed) refs.push(trimmed);
          });
        }

        // Render links in the crossref panel
        const linksHtml = refs.map(r =>
          `<a href="#" class="xref-link" data-ref="${r}">${r}</a>`
        ).join(' | ');

        crossrefPanel.innerHTML = `
          <div class="ref-list-area">
            <strong>Cross References for ${ref}:</strong><br>
            ${linksHtml}
            <div class="xref-verse-area" style="margin-top:1em"></div>
          </div>
        `;

        // Render links in the sidebar as before
        if (refs.length === 0) {
          sidebarPanel.innerHTML = '<em>No cross-references found.</em>';
        } else {
          sidebarPanel.innerHTML = linksHtml;
        }

      } catch (err) {
        crossrefPanel.innerHTML = '<em>Error loading cross-references.</em>';
        sidebarPanel.innerHTML = '<em>Error loading cross-references.</em>';
      }
    }

    // Handle click on cross-reference link (event delegation)
    if (e.target.matches('.xref-link')) {
      e.preventDefault();
      const ref = e.target.dataset.ref;
      // Find the nearest .ref-list-area (works for both sidebar and main panel)
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
        const verseRes = await fetch(`${API_BASE}/search?module=KJV&query=${encodeURIComponent(ref)}&output_format=plain&output_encoding=UTF8&variant=0&locale=en`);
        const verseData = await verseRes.json();
        verseArea.textContent = verseData.result || 'Not found.';
      } catch (err) {
        verseArea.textContent = 'Error loading verse.';
      }
    }
  });
});

// Delegate clicks on phrase-search links
document.addEventListener('click', async e => {
  if (!e.target.matches('.phrase-xref')) return;
  e.preventDefault();

  const ref    = e.target.dataset.ref;
  const verseEl = document.querySelector('.phrase-verse-area');
  verseEl.textContent = 'Loading…';

  try {
    const bibleId = document.getElementById('bible-select').value;
    const verseUrl = `${API_BASE}/search?module=KJV`
                   + `&query=${encodeURIComponent(ref)}`
                   + `&output_format=plain`
                   + `&output_encoding=UTF8`
                   + `&variant=0`
                   + `&locale=en`;

    const verseRes  = await fetch(verseUrl);
    if (!verseRes.ok) throw new Error(verseRes.status);
    const verseData = await verseRes.json();

    verseEl.textContent = verseData.result || 'Not found.';
  } catch (err) {
    verseEl.textContent = 'Error loading verse.';
  }
});

