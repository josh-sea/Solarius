// narrate.js — generates ElevenLabs audio narration for scripture and cosmology pages.
//
// Usage (via workflow or locally):
//   ELEVENLABS_API_KEY=... ELEVENLABS_VOICE_ID=... NARRATE_TARGET=scripture node narrate.js
//
// NARRATE_TARGET options:
//   scripture   — all files in vault/Scripture/
//   cosmology   — all files in vault/Cosmology/
//   all         — both of the above
//
// Audio output goes to AUDIO_OUT (default: ../site/audio/).
// Files that already exist are skipped — safe to re-run.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VAULT_ROOT = process.env.VAULT_ROOT || path.resolve(__dirname, '../vault');
const AUDIO_OUT = process.env.AUDIO_OUT || path.resolve(__dirname, '../site/audio');
const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
const TARGET = process.env.NARRATE_TARGET || 'scripture';

// Use highest-quality model for scripture-grade content.
const MODEL = 'eleven_multilingual_v2';

function slugify(s) {
  return s.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function markdownToText(content) {
  return content
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^>\s*/gm, '')
    .replace(/^[-*]{3,}\s*$/gm, '')
    .replace(/`[^`]+`/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function narrate(filePath) {
  const raw = await fs.readFile(filePath, 'utf-8');
  const { data, content } = matter(raw);
  const title = data.title || path.basename(filePath, '.md');
  const slug = slugify(title);
  const outPath = path.join(AUDIO_OUT, `${slug}.mp3`);

  try {
    await fs.access(outPath);
    console.log(`[narrate] skip (exists): ${slug}.mp3`);
    return;
  } catch {}

  const text = `${title}.\n\n${markdownToText(content)}`;
  console.log(`[narrate] generating: ${title} (${text.length} chars)`);

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: {
      'xi-api-key': API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg'
    },
    body: JSON.stringify({
      text,
      model_id: MODEL,
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.80,
        style: 0.15,
        use_speaker_boost: true
      }
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs ${response.status}: ${err}`);
  }

  const buffer = await response.arrayBuffer();
  await fs.writeFile(outPath, Buffer.from(buffer));
  console.log(`[narrate] written: ${path.basename(outPath)} (${(buffer.byteLength / 1024).toFixed(0)} KB)`);
}

async function findFiles(subdir) {
  const dir = path.join(VAULT_ROOT, subdir);
  const out = [];
  async function walk(d) {
    let entries;
    try { entries = await fs.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.name.endsWith('.md') && !e.name.startsWith('.') && !e.name.startsWith('_')) out.push(full);
    }
  }
  await walk(dir);
  return out;
}

async function main() {
  if (!API_KEY) throw new Error('ELEVENLABS_API_KEY not set');
  if (!VOICE_ID) throw new Error('ELEVENLABS_VOICE_ID not set');

  await fs.mkdir(AUDIO_OUT, { recursive: true });

  const files = [];
  if (TARGET === 'scripture' || TARGET === 'all') files.push(...await findFiles('Scripture'));
  if (TARGET === 'cosmology' || TARGET === 'all') files.push(...await findFiles('Cosmology'));

  if (files.length === 0) {
    console.log(`[narrate] no files matched target: ${TARGET}`);
    return;
  }

  console.log(`[narrate] ${files.length} files to process`);
  for (const f of files) {
    await narrate(f);
  }
  console.log('[narrate] done');
}

main().catch(err => {
  console.error(`[narrate] fatal: ${err.message}`);
  process.exit(1);
});
