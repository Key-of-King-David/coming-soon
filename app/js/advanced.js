// js/advanced.js

const API_BASE = 'https://api.keyofkingdavid.org/api';
let allBibles = [];

/**
 * 1) Load Bibles metadata so we can filter by strongs_numbers
 */
async function loadBiblesMetadata() {
  const res  = await fetch('./books/bibles.json');
  if (!res.ok) throw new Error(`Failed to load bibles.json: ${res.status}`);
  const json = await res.json();
  allBibles  = json.bibles || [];
}

/**
 * 2) Populate the version dropdown with only Strong's-enabled Bibles
 */
function populateVersionDropdown() {
  const sel = document.getElementById('adv-version');
  sel.innerHTML = '';

  const strongsBibles = allBibles
    .filter(b => b.strongs_numbers)
    .sort((a,b) => (a.lang || '').localeCompare(b.lang || '') || a.name.localeCompare(b.name));

  strongsBibles.forEach(b => {
    const opt = document.createElement('option');
    opt.value       = b.bible_id;
    opt.textContent = `${b.name} (${b.lang})`;
    sel.appendChild(opt);
  });

  if (sel.options.length === 0) {
    const opt = document.createElement('option');
    opt.textContent = 'No Strong’s-enabled Bibles found';
    opt.disabled = true;
    sel.appendChild(opt);
  }
}

/**
 * 3) Search verses by words/phrase (multi-word)
 */
async function searchInspirationWords() {
  const q = document.getElementById('adv-words').value.trim();
  const out = document.getElementById('adv-results');
  out.innerHTML = 'Searching…';

  if (!q) { out.innerHTML = '<em>Please type a word or phrase.</em>'; return; }

  const module = document.getElementById('adv-version').value;
  const url = `${API_BASE}/search?module=${encodeURIComponent(module)}`
    + `&query=${encodeURIComponent(q)}`
    + `&search_type=multiword`
    + `&output_format=plain`
    + `&output_encoding=UTF8`
    + `&variant=0&locale=en`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();

    // Pull refs like "John 3:16" etc.
    const refs = (data.result || '').match(/([1-3]?\s?[A-Za-z]+\s+\d+:\d+)/g) || [];
    if (refs.length === 0) {
      out.innerHTML = '<em>No matches.</em>';
      return;
    }
    out.innerHTML = refs.map(r =>
      `<a href="#" class="adv-ref" data-ref="${r.trim()}">${r.trim()}</a>`
    ).join('');
  } catch (e) {
    out.innerHTML = `<span class="error">Error: ${e.message}</span>`;
  }
}

/**
 * 4) Fetch a verse in LaTeX (so we get Strong’s markup), then render to HTML
 */
async function fetchVerseLaTeX(ref) {
  const module = document.getElementById('adv-version').value;
  const url = `${API_BASE}/search?module=${encodeURIComponent(module)}`
    + `&query=${encodeURIComponent(ref)}`
    + `&output_format=LaTeX`
    + `&output_encoding=UTF8`
    + `&variant=0&locale=en`
    + `&option_filters=nfmhcvaplsrbwgeixtM`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  return data.result || '';
}

/**
 * 5) Parse SWORD LaTeX — reuse your robust approach, but tolerant for single-verse payloads
 */

// Zero-pad to 5, escape HTML
const pad5 = n => String(n).padStart(5, '0');
const esc = s => (s || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));

// Wrap plain H#### / G#### already added earlier…

// Wrap plain H#### / G#### tokens into clickable <span class="strong-number">…</span>
function wrapPlainStrongs(html) {
  if (!html) return html;
  // Avoid touching inside existing tags
  return html.replace(/(^|[^A-Za-z0-9_>])([HG])0?(\d{1,5})(?!\d)/g, (m, lead, hg, num) => {
    const mod = hg === 'H' ? 'Hebrew' : 'Greek';
    const n   = String(Number(num)); // trim leading zeros
    return `${lead}<span class="strong-number" data-module="${mod}" data-strong="${n}">${hg}${n}</span>`;
  });
}

function parseLaTeXToNodes(latex) {
  const nodes = [];

  // Chapter header (optional)
  const chapRe = /\\swordchapter\{([^}]+)\}\{([^}]+)\}\{\d+\}/;
  const cm = chapRe.exec(latex);
  if (cm) nodes.push({ type: 'chapter', osis: cm[1], title: cm[2] });

  // Verses
  const verseRe = /\\swordverse\{[^}]*\}\{[^}]*\}\{(\d+)\}([\s\S]*?)(?=(?:\\swordverse|\\end\{document\}))/g;
  let m, found = false;

  while ((m = verseRe.exec(latex)) !== null) {
    found = true;

    // use a uniquely named local, never "text"
    let vtext = m[2]
      .replace(/\\swordstrong\{([^}]+)\}\{([^}]+)\}/g, (_, module, num) => {
        const raw    = num.replace(/^0+/, '');
        const prefix = module === 'Hebrew' ? 'H' : (module === 'Greek' ? 'G' : module.charAt(0).toUpperCase());
        return `<span class="strong-number" data-module="${module}" data-strong="${raw}">${prefix}${raw}</span>`;
      })
      .replace(/\\sworddivinename\{([^}]+)\}/g, (_, name) => `<span class="divine-name">${name}</span>`)
      .replace(/\\[a-zA-Z]+(?:\{[^}]*\})*/g, '')
      .replace(/[{}]/g, '')
      .trim();

    // also wrap plain H#### / G#### cases
    vtext = wrapPlainStrongs(vtext);

    nodes.push({ type: 'verse', number: m[1], text: vtext });
  }

  // Single-verse or plain fallback
  if (!found && latex) {
    let vtext = latex
      .replace(/\\[a-zA-Z]+(?:\{[^}]*\})*/g, '')
      .replace(/[{}]/g, '')
      .trim();
    vtext = wrapPlainStrongs(vtext);
    nodes.push({ type: 'verse', number: '', text: vtext });
  }

  return nodes;
}


/**
 * 6) Render the verse with superscript number; attach Strong’s click handlers
 */
function renderNodes(nodes, refLabel) {
  const host = document.getElementById('adv-viewer');
  host.innerHTML = '';

  const container = document.createElement('div');
  container.className = 'scripture';

  const chapterNode = nodes.find(n => n.type === 'chapter');
  nodes.forEach(n => {
    if (n.type !== 'verse') return;
    const p = document.createElement('p');

    if (n.number) {
      const sup = document.createElement('sup');
      sup.textContent = n.number;
      p.appendChild(sup);
      p.appendChild(document.createTextNode(' '));
    }

    const span = document.createElement('span');
    span.innerHTML = n.text;
    p.appendChild(span);
    container.appendChild(p);
  });

  host.appendChild(container);
  document.getElementById('adv-current-ref').textContent = refLabel || '';

  // Hook up Strong’s clicks
  container.querySelectorAll('.strong-number').forEach(el => {
    el.addEventListener('click', () => handleStrongsClick(el));
  });
}

/**
 * 7) Strong’s lookup → show entry in right panel
 */
async function handleStrongsClick(el) {
  const moduleName = el.dataset.module;  // 'Hebrew' or 'Greek'
  const num        = el.dataset.strong;  // e.g., '430'
  const code       = pad5(num);
  const panel      = document.getElementById('adv-lexicon');
  panel.innerHTML  = 'Loading…';

  try {
    // 3a) Primary Strong’s entry (BDB/Thayer style)
    const baseUrl = `${API_BASE}/commentaries?module=Strongs${moduleName}&strongs=${code}`;
    const resLex  = await fetch(baseUrl);
    if (!resLex.ok) throw new Error(`API ${resLex.status}`);
    const dataLex = await resLex.json();

    let lexHTML = '';
    if (dataLex.parsed) {
      const P = dataLex.parsed;
      lexHTML = `
        <div class="lex-entry">
          <div><span class="strongs-number">${esc(P.entry || '')}</span>
               ${esc(P.word || '')} <em>${esc(P.transliteration || '')}</em></div>
          <div class="lex-def">${(P.definition || '').trim()}</div>
        </div>`;
    } else {
      lexHTML = `<div class="lex-entry">${dataLex.raw_html || ''}</div>`;
    }

    // 3b) Hebrew↔Greek mappings
    const { pairs } = await fetchHebrewGreekLinks(code, moduleName);
    const targetLang = moduleName === 'Hebrew' ? 'Greek' : 'Hebrew';
    const hg = targetLang === 'Hebrew' ? 'H' : 'G';

    const mapHTML = pairs.length
      ? `<ul class="hg-pairs">
           ${pairs.map(p => `
             <li>
               <span class="adv-muted">${esc(p.fromWord)}</span>
               → <span class="strong-number"
                        data-module="${targetLang}"
                        data-strong="${esc(p.toNum)}">${hg}${esc(p.toNum)}</span>
                 <span class="adv-muted">${esc(p.toLemma)}</span>
             </li>`).join('')}
         </ul>`
      : `<div class="adv-muted" style="margin-top:.5rem"><em>No ${moduleName}↔${targetLang} links.</em></div>`;

    panel.innerHTML = `${lexHTML}
      <div style="margin-top:.75rem; border-top:1px solid #eee; padding-top:.5rem">
        <strong>Related ${moduleName} ↔ ${targetLang} links</strong>
        ${mapHTML}
      </div>`;

    // Click to drill further from the mapping list
    panel.querySelectorAll('.strong-number').forEach(s => {
      s.addEventListener('click', () => handleStrongsClick(s));
    });
  } catch (e) {
    panel.innerHTML = `<span class="error">Error: ${e.message}</span>`;
  }
}


async function fetchHebrewGreekLinks(strongs5, moduleName) {
  // If the clicked one is Hebrew, we ask for HebrewGreek; else GreekHebrew
  const pairModule = moduleName === 'Hebrew' ? 'HebrewGreek' : 'GreekHebrew';
  const url = `${API_BASE}/commentaries?module=${pairModule}&strongs=${strongs5}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();

  const lines = (data.raw_html || '')
    .split(/<br\s*\/?>/i)
    .map(s => s.replace(/^\s+|\s+$/g, ''))
    .filter(s => s && !/^\(.*\)$/.test(s)); // drop footer like "(HebrewGreek)"

  // Lines look like:
  // "elohim                2316 theos"
  // "agapao \t00157\tahab"
  // Sometimes leading "00430:" appears; strip it.
  const pairs = [];
  for (let line of lines) {
    line = line.replace(/^\d{1,5}:\s*/, '');
    const m = line.match(/^(.*?)\s+0?(\d{1,5})\s+(.+?)$/);
    if (m) {
      pairs.push({
        fromWord: m[1].trim(),
        toNum: String(Number(m[2])),     // trim leading zeros
        toLemma: m[3].trim()
      });
    }
  }
  return { pairs, pairModule };
}


/**
 * 8) Wire up events
 */
function wireEvents() {
  document.getElementById('adv-search').addEventListener('click', searchInspirationWords);
  document.getElementById('adv-words').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchInspirationWords();
  });

  document.getElementById('adv-clear').addEventListener('click', () => {
    document.getElementById('adv-words').value = '';
    document.getElementById('adv-results').innerHTML = '<em>No search yet.</em>';
    document.getElementById('adv-viewer').textContent = 'Select a verse from the search results.';
    document.getElementById('adv-current-ref').textContent = '';
    document.getElementById('adv-lexicon').innerHTML =
      '<em>Click a <span class="strong-number">H/G####</span> in the verse.</em>';
  });

  // Delegated click: any search result
  document.addEventListener('click', async (e) => {
    const a = e.target.closest('.adv-ref');
    if (!a) return;
    e.preventDefault();
    const ref = a.dataset.ref;

    try {
      const latex = await fetchVerseLaTeX(ref);
      const nodes = parseLaTeXToNodes(latex);
      renderNodes(nodes, ref);
      // Smooth scroll to viewer on small screens
      document.getElementById('adv-viewer').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      document.getElementById('adv-viewer').innerHTML = `<span class="error">Error: ${err.message}</span>`;
    }
  });

  // Version change: if a verse is displayed, re-fetch it with the new module
  document.getElementById('adv-version').addEventListener('change', async () => {
    const ref = document.getElementById('adv-current-ref').textContent.trim();
    if (!ref) return;
    try {
      const latex = await fetchVerseLaTeX(ref);
      const nodes = parseLaTeXToNodes(latex);
      renderNodes(nodes, ref);
    } catch (err) {
      // soft-fail in viewer
    }
  });
}

/**
 * 9) Init
 */
window.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadBiblesMetadata();
    populateVersionDropdown();
    wireEvents();
  } catch (e) {
    console.error(e);
    document.getElementById('adv-results').innerHTML = `<span class="error">${e.message}</span>`;
  }
});
// Export functions for testing