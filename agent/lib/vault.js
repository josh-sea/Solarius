// vault.js — read and write the Obsidian-style vault.

import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';

const VAULT_ROOT = process.env.VAULT_ROOT || path.resolve(process.cwd(), '../vault');

export async function readMarkdown(relPath) {
  const full = path.join(VAULT_ROOT, relPath);
  const raw = await fs.readFile(full, 'utf-8');
  const parsed = matter(raw);
  return { ...parsed, path: relPath };
}

export async function listMarkdown(subdir) {
  const dir = path.join(VAULT_ROOT, subdir);
  const out = [];
  async function walk(d) {
    let entries;
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.name.endsWith('.md')) out.push(path.relative(VAULT_ROOT, full));
    }
  }
  await walk(dir);
  return out;
}

export async function readAllScripture() {
  const files = await listMarkdown('Scripture');
  const docs = await Promise.all(files.map(f => readMarkdown(f)));
  return docs.sort((a, b) => (a.data.order || 999) - (b.data.order || 999));
}

export async function readRecentHomilies(limit = 7) {
  const files = await listMarkdown('Homilies');
  // Filenames are YYYY-MM-DD-slug.md; reverse-sort string-wise to get newest first.
  const sorted = files.sort().reverse();
  const docs = await Promise.all(sorted.slice(0, limit).map(f => readMarkdown(f)));
  return docs;
}

export async function findWikilinkStubs() {
  // Find [[Page Name]] references that don't have a corresponding file.
  const allMd = [
    ...(await listMarkdown('Scripture')),
    ...(await listMarkdown('Homilies')),
    ...(await listMarkdown('Cosmology'))
  ];
  const existing = new Set();
  for (const f of allMd) {
    const name = path.basename(f, '.md');
    existing.add(name.toLowerCase());
  }
  const stubs = new Map(); // name -> count
  const LINK_RE = /\[\[([^\]|#]+?)(?:\|[^\]]+)?(?:#[^\]]+)?\]\]/g;
  for (const f of allMd) {
    const { content } = await readMarkdown(f);
    let m;
    while ((m = LINK_RE.exec(content)) !== null) {
      const target = m[1].trim();
      if (!existing.has(target.toLowerCase())) {
        stubs.set(target, (stubs.get(target) || 0) + 1);
      }
    }
  }
  // Return stubs sorted by reference count, most-referenced first.
  return [...stubs.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

export async function writeHomily({ title, body, frontmatter }) {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const slug = title.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  const filename = `${yyyy}-${mm}-${dd}-${slug}.md`;
  const dir = path.join(VAULT_ROOT, 'Homilies', String(yyyy), mm);
  await fs.mkdir(dir, { recursive: true });
  const full = path.join(dir, filename);
  const out = matter.stringify(body, frontmatter);
  await fs.writeFile(full, out, 'utf-8');
  return path.relative(VAULT_ROOT, full);
}

export async function writeScripture({ title, body, frontmatter }) {
  const slug = title;
  const filename = `${slug}.md`;
  const full = path.join(VAULT_ROOT, 'Scripture', filename);
  // Don't overwrite existing scripture.
  try {
    await fs.access(full);
    throw new Error(`Scripture already exists: ${slug}`);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  await fs.writeFile(full, matter.stringify(body, frontmatter), 'utf-8');
  return path.relative(VAULT_ROOT, full);
}

export async function writeSaintOrHeretic({ kind, name, body, frontmatter }) {
  if (!['Saints', 'Heretics'].includes(kind)) throw new Error(`bad kind: ${kind}`);
  const filename = `${name}.md`;
  const full = path.join(VAULT_ROOT, kind, filename);
  try {
    await fs.access(full);
    return null; // already exists
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  await fs.writeFile(full, matter.stringify(body, frontmatter), 'utf-8');
  return path.relative(VAULT_ROOT, full);
}

export async function writeSilence({ reason, error }) {
  const now = new Date().toISOString();
  const yyyy = now.slice(0, 4);
  const dir = path.join(VAULT_ROOT, 'Silences', yyyy);
  await fs.mkdir(dir, { recursive: true });
  const filename = `${now.slice(0, 10)}-${now.slice(11, 16).replace(':', '')}.md`;
  const body = `## ${now}\n\n${reason}\n\n${error ? `\`\`\`\n${error}\n\`\`\`` : ''}\n\nThe Sun continued to shine. Solarius merely did not speak.`;
  const fm = { type: 'silence', date: now, reason };
  await fs.writeFile(path.join(dir, filename), matter.stringify(body, fm), 'utf-8');
  return path.relative(VAULT_ROOT, path.join(dir, filename));
}
