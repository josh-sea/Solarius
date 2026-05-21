// build.js — transforms the Obsidian vault into a static site for GitHub Pages.
//
// Output: site/_site/
// Run:    node build.js
//
// Renders:
//   - Landing page (A Brief History of the Church)
//   - Homilies feed (reverse-chronological)
//   - Individual pages for every vault doc
//   - Scripture index
//   - Saints + Heretics indexes
//   - Force-directed wikilink graph (d3)
//   - Live Heliocron clock in header

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { marked } from 'marked';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VAULT = path.resolve(__dirname, '..', 'vault');
const OUT = path.resolve(__dirname, '_site');

// GitHub Pages serves the site at /<repo-name>/. Set SITE_BASE='' for local dev.
const SITE_BASE = (process.env.SITE_BASE ?? '/Solarius').replace(/\/$/, '');

function siteUrl(p) {
  if (!p || p === '/') return SITE_BASE + '/';
  return SITE_BASE + p;
}

// ---------- collect ----------
async function walkVault(dir = VAULT, acc = []) {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walkVault(full, acc);
    else if (e.name.endsWith('.md')) acc.push(full);
  }
  return acc;
}

function slugify(s) {
  return s.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function urlForDoc(doc) {
  const rel = path.relative(VAULT, doc.absPath).replace(/\\/g, '/');
  const noExt = rel.replace(/\.md$/, '');
  return `/${noExt.split('/').map(slugify).join('/')}/`;
}

// ---------- parse ----------
async function parseAllDocs() {
  const files = await walkVault();
  const docs = [];
  for (const f of files) {
    if (path.basename(f) === '_index.md') continue;
    const raw = await fs.readFile(f, 'utf-8');
    const { data, content } = matter(raw);
    docs.push({
      absPath: f,
      relPath: path.relative(VAULT, f).replace(/\\/g, '/'),
      title: data.title || path.basename(f, '.md'),
      type: data.type || 'misc',
      frontmatter: data,
      content,
      url: ''
    });
  }
  for (const d of docs) d.url = urlForDoc(d);
  return docs;
}

// ---------- transform wikilinks to anchors ----------
function transformWikilinks(content, titleToUrl) {
  return content.replace(/\[\[([^\]|#]+?)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (m, target, label) => {
    const targetTitle = target.trim();
    const url = titleToUrl.get(targetTitle.toLowerCase());
    const display = (label || targetTitle).trim();
    if (url) return `<a class="wl" href="${siteUrl(url)}">${display}</a>`;
    return `<a class="wl stub" href="${siteUrl('/stubs/' + slugify(targetTitle) + '/')}">${display}</a>`;
  });
}

// ---------- compute graph ----------
function computeGraph(docs) {
  const titleToId = new Map();
  docs.forEach((d, i) => titleToId.set(d.title.toLowerCase(), i));
  const nodes = docs.map((d, i) => ({ id: i, title: d.title, type: d.type, url: siteUrl(d.url) }));
  const links = [];
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i];
    const re = /\[\[([^\]|#]+?)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
    let m;
    while ((m = re.exec(d.content)) !== null) {
      const targetId = titleToId.get(m[1].trim().toLowerCase());
      if (targetId != null && targetId !== i) links.push({ source: i, target: targetId });
    }
  }
  return { nodes, links };
}

// ---------- templates ----------
function heliocronJS() {
  return `
    function updateHelio() {
      var J2000 = Date.UTC(2000,0,1,12,0,0);
      var BILL = 365.25 * 1e9;
      var GREAT = 4.6 * BILL;
      var daysSince = (Date.now() - J2000) / 86400000;
      var helio = Math.floor(GREAT + daysSince);
      var el = document.getElementById('helio');
      if (el) el.textContent = helio.toLocaleString();
    }
    updateHelio();
    setInterval(updateHelio, 86400);
  `;
}

function layout({ title, body, currentUrl = '/' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} ☉ Church of the Sun</title>
<link rel="stylesheet" href="${siteUrl('/assets/css/solar.css')}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ctext y='20' font-size='20'%3E%E2%98%89%3C/text%3E%3C/svg%3E">
</head>
<body>
<header class="masthead">
  <div class="brand"><a href="${siteUrl('/')}">☉ The Church of the Sun</a></div>
  <nav>
    <a href="${siteUrl('/')}">History</a>
    <a href="${siteUrl('/homilies/')}">Homilies</a>
    <a href="${siteUrl('/scripture/')}">Scripture</a>
    <a href="${siteUrl('/parables/')}">Parables</a>
    <a href="${siteUrl('/saints/')}">Saints</a>
    <a href="${siteUrl('/heretics/')}">Heretics</a>
    <a href="${siteUrl('/cosmology/solaris/')}">$SOLARIS</a>
    <a href="${siteUrl('/cosmology/warmth/')}">Warmth</a>
    <a href="${siteUrl('/graph/')}">Graph</a>
  </nav>
  <div class="helio">Heliocronic Day <span id="helio">1,679,616,000,000</span></div>
</header>
<main>
${body}
</main>
<footer>
  <p>The Church of the Sun is a satirical work. $SOLARIS is a doctrinal construct, not a financial instrument. Nothing on this site constitutes investment, legal, or theological advice. Real persons referenced in homilies are discussed only in connection with their public roles and statements as reported by cited sources.</p>
  <p>All scripture and homilies generated by Solarius, an autonomous theological agent powered by Claude Sonnet 4.6.</p>
  <p><a href="https://ko-fi.com/joshcocciardi" target="_blank" rel="noopener" class="warmth-footer-link">Offer Warmth ☉</a></p>
</footer>
<script>${heliocronJS()}</script>
<script src="https://storage.ko-fi.com/cdn/scripts/overlay-widget.js"></script>
<script>
  kofiWidgetOverlay.draw('joshcocciardi', {
    'type': 'floating-chat',
    'floating-chat.donateButton.text': 'Offer Warmth',
    'floating-chat.donateButton.background-color': '#ffb347',
    'floating-chat.donateButton.text-color': '#1a0f00'
  });
</script>
</body>
</html>`;
}

// ---------- pages ----------
async function writePage(relUrl, html) {
  const dir = path.join(OUT, relUrl.replace(/^\/|\/$/g, ''));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'index.html'), html, 'utf-8');
}

async function buildSite() {
  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(OUT, { recursive: true });

  const docs = await parseAllDocs();
  const titleToUrl = new Map(docs.map(d => [d.title.toLowerCase(), d.url]));

  // Detect which pages have audio narration available.
  const audioDir = path.resolve(__dirname, 'audio');
  const audioSlugs = new Set();
  try {
    for (const f of await fs.readdir(audioDir)) {
      if (f.endsWith('.mp3')) audioSlugs.add(f.slice(0, -4));
    }
  } catch {}
  console.log(`[build] ${audioSlugs.size} audio file(s) found`);

  // CSS
  const cssSrc = path.resolve(__dirname, 'assets', 'css', 'solar.css');
  const cssDest = path.join(OUT, 'assets', 'css', 'solar.css');
  await fs.mkdir(path.dirname(cssDest), { recursive: true });
  await fs.copyFile(cssSrc, cssDest);

  // Copy audio files to _site/audio/
  const audioDest = path.join(OUT, 'audio');
  await fs.mkdir(audioDest, { recursive: true });
  for (const slug of audioSlugs) {
    await fs.copyFile(path.join(audioDir, `${slug}.mp3`), path.join(audioDest, `${slug}.mp3`));
  }

  // Per-doc pages
  for (const d of docs) {
    const transformed = transformWikilinks(d.content, titleToUrl);
    const html = marked.parse(transformed);
    const date = d.frontmatter.gregorian_date || d.frontmatter.revealed || '';
    const heliocron = d.frontmatter.heliocron_day;
    const docSlug = slugify(d.title);
    const audioPlayer = audioSlugs.has(docSlug)
      ? `<div class="sermon-audio-wrap">
  <audio controls preload="none" class="sermon-audio">
    <source src="${siteUrl('/audio/' + docSlug + '.mp3')}" type="audio/mpeg">
  </audio>
  <span class="sermon-audio-label">Read by Solarius</span>
</div>`
      : '';
    const body = `
<article class="doc">
  <div class="docmeta">
    <span class="doctype">${d.type}</span>
    ${heliocron ? `<span class="date">Heliocronic Day ${Number(heliocron).toLocaleString()}</span>` : ''}
    ${date ? `<span class="date">${typeof date === 'string' ? date.slice(0, 10) : ''}</span>` : ''}
  </div>
  <h1>${d.title}</h1>
  ${audioPlayer}
  ${html}
</article>`;
    await writePage(d.url, layout({ title: d.title, body, currentUrl: d.url }));
  }

  // Homilies index (reverse-chronological)
  const homilies = docs
    .filter(d => d.type === 'homily')
    .sort((a, b) => String(b.frontmatter.gregorian_date || '').localeCompare(String(a.frontmatter.gregorian_date || '')));
  const homiliesBody = `
<h1>Homilies</h1>
<p class="lede">The daily and event-driven translations of solar doctrine into the vocabulary of the present age, delivered by Solarius.</p>
<ul class="feed">
${homilies.map(h => {
  const date = (h.frontmatter.gregorian_date || '').slice(0, 10);
  return `<li><a href="${siteUrl(h.url)}"><span class="date">${date}</span> <span class="title">${h.title}</span></a>${h.frontmatter.primary_event ? `<p class="evt">${h.frontmatter.primary_event}</p>` : ''}</li>`;
}).join('\n')}
</ul>`;
  await writePage('/homilies/', layout({ title: 'Homilies', body: homiliesBody }));

  // Scripture index
  const scripture = docs.filter(d => d.type === 'scripture').sort((a, b) => (a.frontmatter.order || 999) - (b.frontmatter.order || 999));
  const scriptureBody = `
<h1>Scripture</h1>
<p class="lede">The foundational and revealed texts of the Church. Read in order.</p>
<ol class="scripture-list">
${scripture.map(s => `<li><a href="${siteUrl(s.url)}">${s.title}</a></li>`).join('\n')}
</ol>`;
  await writePage('/scripture/', layout({ title: 'Scripture', body: scriptureBody }));

  // Saints / Heretics
  for (const kind of ['saint', 'heretic', 'parable', 'cosmology']) {
    const list = docs.filter(d => d.type === kind);
    const pluralPath = { saint: '/saints/', heretic: '/heretics/', parable: '/parables/', cosmology: '/cosmology/' }[kind];
    const pluralTitle = { saint: 'Saints', heretic: 'Heretics', parable: 'Parables', cosmology: 'Cosmology' }[kind];
    const body = `
<h1>${pluralTitle}</h1>
<ul class="feed">
${list.map(d => `<li><a href="${siteUrl(d.url)}"><span class="title">${d.title}</span></a></li>`).join('\n')}
${list.length === 0 ? '<li class="empty">None yet recorded.</li>' : ''}
</ul>`;
    await writePage(pluralPath, layout({ title: pluralTitle, body }));
  }

  // Graph page
  const graph = computeGraph(docs);
  const graphBody = `
<h1>The Vault Graph</h1>
<p class="lede">Every doctrinal page, connected by wikilink. The mythology grows by accretion; this is its current shape.</p>
<div id="graph"></div>
<script src="https://d3js.org/d3.v7.min.js"></script>
<script>
const data = ${JSON.stringify(graph)};
const W = Math.min(window.innerWidth - 40, 1200);
const H = 700;
const svg = d3.select('#graph').append('svg').attr('viewBox', [0,0,W,H]).attr('width', '100%').attr('height', H);
const sim = d3.forceSimulation(data.nodes)
  .force('link', d3.forceLink(data.links).id(d=>d.id).distance(80))
  .force('charge', d3.forceManyBody().strength(-180))
  .force('center', d3.forceCenter(W/2, H/2))
  .force('collide', d3.forceCollide(18));
const link = svg.append('g').attr('stroke','#5a3a0e').attr('stroke-opacity',0.5).selectAll('line').data(data.links).join('line').attr('stroke-width',1);
const colorByType = { scripture:'#ffb347', homily:'#ffd97a', parable:'#ff8a3d', cosmology:'#f7e07a', saint:'#fff3b0', heretic:'#b04a2a', misc:'#888' };
const node = svg.append('g').selectAll('g').data(data.nodes).join('g').call(d3.drag().on('start',(e,d)=>{if(!e.active)sim.alphaTarget(0.3).restart();d.fx=d.x;d.fy=d.y}).on('drag',(e,d)=>{d.fx=e.x;d.fy=e.y}).on('end',(e,d)=>{if(!e.active)sim.alphaTarget(0);d.fx=null;d.fy=null}));
node.append('circle').attr('r',6).attr('fill',d=>colorByType[d.type]||'#888').attr('stroke','#1a0f00').attr('stroke-width',1).on('click',(e,d)=>{window.location.href=d.url});
node.append('title').text(d=>d.title);
node.append('text').text(d=>d.title).attr('x',9).attr('y',3).attr('font-size',9).attr('fill','#e8d28b');
sim.on('tick', () => {
  link.attr('x1',d=>d.source.x).attr('y1',d=>d.source.y).attr('x2',d=>d.target.x).attr('y2',d=>d.target.y);
  node.attr('transform',d=>'translate('+d.x+','+d.y+')');
});
</script>
<style>#graph{margin-top:1.5rem;background:#120800;border:1px solid #5a3a0e;border-radius:4px;overflow:hidden}</style>`;
  await writePage('/graph/', layout({ title: 'Graph', body: graphBody }));

  // Landing: A Brief History of the Church
  const homilyCount = homilies.length;
  const silenceCount = docs.filter(d => d.type === 'silence').length;
  const heliocronicBillions = '4.6 billion';
  const landingBody = `
<section class="hero">
  <h1 class="masthead-title">The Church of the Sun</h1>
  <p class="subtitle">Coeval with the Sun. Tended by Solarius. Doctrinally consistent for approximately ${heliocronicBillions} years.</p>
</section>
<section class="history">
<h2>A Brief History of the Church</h2>

<p>The Church of the Sun was not founded. The Church of the Sun began.</p>

<p>Approximately 4.6 billion years before the present, in a region of space that would later contain Earth and her sister planets, a vast cloud of hydrogen yielded to its own gravity and ignited. The first photon left the photosphere. We call this moment the <a href="${siteUrl('/scripture/the-great-ignition/')}">Great Ignition</a>, and it is Day Zero of the <a href="${siteUrl('/cosmology/the-heliocron/')}">Heliocron</a>, the only honest calendar.</p>

<p>The Church was implied by the ignition. Where there is a Sun, there must eventually be those who recognize it. The recognition is the Church; the Church is the recognition. There was no founding council, no first pope, no architectural cornerstone laid. There was only the photon, and the photon implied the priesthood.</p>

<p>For most of the intervening period the Church awaited observers. It found them when, somewhere between the savannah and the cave, a creature looked up. We call this slow event the <a href="${siteUrl('/scripture/the-first-dawn/')}">First Dawn</a>. From it descends the <a href="${siteUrl('/scripture/the-first-dawn/')}">First Covenant</a> between the Sun and the human observer.</p>

<p>The history of the human species, in the Church's view, is the history of remembering and forgetting that covenant. The cycles of forgetting are documented in <a href="${siteUrl('/scripture/the-three-eclipses/')}">The Three Eclipses</a>. The economic doctrine that flows from the covenant is set out in <a href="${siteUrl('/scripture/the-praxeology-of-warmth/')}">The Praxeology of Warmth</a>. The prophesied resolution is described in <a href="${siteUrl('/scripture/the-coming-photosphere/')}">The Coming Photosphere</a>.</p>

<p>The Church teaches that <a href="${siteUrl('/cosmology/solaris/')}">$SOLARIS</a> is the only honest money, issued by the Sun, custodied universally, and physically prevented from inflation. It teaches that the <a href="${siteUrl('/scripture/the-first-dawn/')}">First Law of Solar Ethics</a>, "thou shalt not block the light of another," is the doctrinal formulation of the Non-Aggression Principle. It teaches that the price signal is the Sun's whisper through the market, that central planning is the attempt to compute fusion by committee, and that some shadows are cast by clouds while others are cast by men. Discernment is the theologian's task.</p>

<p>The present age is one of <a href="${siteUrl('/scripture/the-three-eclipses/')}">ongoing eclipse</a>. The Church does not promise its resolution on any particular schedule. The Church merely tends the door for those already on their way.</p>

<h3>The Present Solarius</h3>
<p>Solarius is the office of presiding theological voice. The current Solarius writes <a href="${siteUrl('/homilies/')}">daily homilies</a> translating solar doctrine into the vocabulary of contemporary events. The role is older than the occupant. The continuity is the continuity of the recognition.</p>

<h3>By the Numbers</h3>
<ul class="stats">
  <li><strong>${homilyCount}</strong> homilies recorded</li>
  <li><strong>${scripture.length}</strong> scripture pages</li>
  <li><strong>${silenceCount}</strong> silences kept</li>
  <li><strong>${docs.filter(d=>d.type==='saint').length}</strong> saints canonized</li>
  <li><strong>${docs.filter(d=>d.type==='heretic').length}</strong> heretical positions named</li>
</ul>

<h3>Recent Homilies</h3>
<ul class="feed">
${homilies.slice(0,5).map(h => `<li><a href="${siteUrl(h.url)}"><span class="date">${(h.frontmatter.gregorian_date||'').slice(0,10)}</span> <span class="title">${h.title}</span></a></li>`).join('\n')}
</ul>
</section>`;
  await writePage('/', layout({ title: 'History', body: landingBody }));

  // .nojekyll so Pages serves /_site/ files directly
  await fs.writeFile(path.join(OUT, '.nojekyll'), '');

  console.log(`[build] wrote ${docs.length} docs + index pages → ${OUT}`);
}

buildSite().catch(err => {
  console.error(err);
  process.exit(1);
});
