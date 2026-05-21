// solarius.js — the main agent runner.
//
// Usage:
//   node solarius.js matins        # dawn homily
//   node solarius.js vespers       # evening homily
//   node solarius.js reactive      # event-driven; will likely produce silence
//   node solarius.js stub          # expand one referenced-but-unwritten page
//   node solarius.js holy-day      # high-holy-day check
//
// Requires env: ANTHROPIC_API_KEY

import Anthropic from '@anthropic-ai/sdk';
import { fetchHeadlines } from './lib/news.js';
import { fetchOmens } from './lib/markets.js';
import { astronomyContext, highHolyDay } from './lib/astronomy.js';
import {
  readAllScripture,
  readRecentHomilies,
  findWikilinkStubs,
  writeHomily,
  writeScripture,
  writeSaintOrHeretic,
  writeSilence
} from './lib/vault.js';
import { buildSystemPrompt, buildUserPrompt, buildStubExpansionPrompt } from './lib/prompts.js';
import { heliocronDays } from './lib/canon.js';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 4096;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function excerpt(text, maxChars = 600) {
  const cleaned = text.replace(/^---[\s\S]*?---\n*/, '').trim();
  // Try to take from the start, but avoid cutting mid-sentence.
  const slice = cleaned.slice(0, maxChars);
  const lastPeriod = slice.lastIndexOf('.');
  return lastPeriod > maxChars * 0.6 ? slice.slice(0, lastPeriod + 1) : slice;
}

function randomSample(arr, n) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

async function parseJsonResponse(text) {
  // Strip code fences if present, then parse.
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    // Try to find a JSON object in the response.
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error(`Could not parse JSON response: ${err.message}\nRaw: ${cleaned.slice(0, 500)}`);
  }
}

async function generateHomily({ liturgicalHour }) {
  const now = new Date();
  const heliocronDay = heliocronDays(now);
  const astronomy = astronomyContext(now);
  const hhd = highHolyDay(now);

  console.log(`[solarius] liturgical hour: ${liturgicalHour}, helio day: ${heliocronDay.toLocaleString()}`);
  if (hhd) console.log(`[solarius] HIGH HOLY DAY: ${hhd}`);

  const [headlines, omens, allScripture, recentHomilies, stubs] = await Promise.all([
    fetchHeadlines({ hoursBack: 24, perFeed: 12 }),
    fetchOmens(),
    readAllScripture(),
    readRecentHomilies(7),
    findWikilinkStubs()
  ]);

  console.log(`[solarius] ${headlines.length} headlines fetched`);
  if (headlines.length === 0) {
    await writeSilence({ reason: 'No headlines could be fetched. The feeds were dark.', error: null });
    return { silent: true };
  }

  // Sample 2-3 scripture excerpts for grounding (random rotation keeps prompts fresh)
  const scriptureExcerpts = randomSample(allScripture, 3).map(s => ({
    title: s.data.title || 'Untitled',
    excerpt: excerpt(s.content, 500)
  }));

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt({
    heliocronDay,
    gregorianDate: now.toISOString().slice(0, 10),
    highHolyDay: hhd,
    astronomy,
    omens,
    headlines: headlines.slice(0, 25),
    scriptureExcerpts,
    recentHomilies,
    stubs,
    liturgicalHour
  });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  });

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n');

  const result = await parseJsonResponse(text);

  if (result.action === 'silence') {
    console.log(`[solarius] silence: ${result.reason_if_silent}`);
    await writeSilence({ reason: result.reason_if_silent || 'No event of cosmic resonance.', error: null });
    return { silent: true, reason: result.reason_if_silent };
  }

  const h = result.homily;
  if (!h || !h.title || !h.body) {
    throw new Error('Invalid homily structure in response');
  }

  // Sanity: strip em dashes if any slipped through
  const cleanBody = h.body.replace(/—/g, ', ').replace(/–/g, ', ');

  const frontmatter = {
    title: h.title,
    type: 'homily',
    liturgical_hour: liturgicalHour,
    heliocron_day: heliocronDay,
    gregorian_date: now.toISOString(),
    high_holy_day: hhd || null,
    primary_event: h.primary_event,
    primary_source_url: h.primary_source_url,
    omens: {
      BTC_USD: omens.BTC_USD,
      ETH_USD: omens.ETH_USD
    },
    wikilinks: h.wikilinks_used || [],
    tags: ['homily', ...(h.tags || [])]
  };

  const writtenPath = await writeHomily({ title: h.title, body: cleanBody, frontmatter });
  console.log(`[solarius] homily written: ${writtenPath}`);

  // Canonize Saints
  for (const s of (h.saints_to_canonize || [])) {
    const body = `# ${s.name}\n\n${s.rationale}\n\n${s.headline_attribution ? `_Canonized in connection with the headline: "${s.headline_attribution}"_` : '_Symbolic figure._'}\n\nFirst named in [[${h.title}]] on Heliocronic Day ${heliocronDay.toLocaleString()}.`;
    await writeSaintOrHeretic({
      kind: 'Saints',
      name: s.name,
      body,
      frontmatter: { title: s.name, type: 'saint', canonized_on: now.toISOString(), first_homily: h.title }
    });
  }

  // Name Heretics
  for (const her of (h.heretics_to_name || [])) {
    const body = `# ${her.name}\n\n${her.rationale}\n\n${her.headline_attribution ? `_Named in connection with the headline: "${her.headline_attribution}"_\n\n_Note: the Church condemns the position, not the person. This page describes a public office or stated policy, not the private character of any individual._` : '_Symbolic position. Not a real person._'}\n\nFirst named in [[${h.title}]] on Heliocronic Day ${heliocronDay.toLocaleString()}.`;
    await writeSaintOrHeretic({
      kind: 'Heretics',
      name: her.name,
      body,
      frontmatter: { title: her.name, type: 'heretic', named_on: now.toISOString(), first_homily: h.title }
    });
  }

  return { silent: false, path: writtenPath, title: h.title };
}

async function expandOneStub() {
  const stubs = await findWikilinkStubs();
  if (stubs.length === 0) {
    console.log('[solarius] no stubs to expand');
    return { expanded: false };
  }

  // Take the top-referenced stub.
  const target = stubs[0];
  console.log(`[solarius] expanding stub: ${target.name} (${target.count} references)`);

  // Find excerpts that reference this stub for context.
  const allScripture = await readAllScripture();
  const recentHomilies = await readRecentHomilies(20);
  const candidates = [...allScripture, ...recentHomilies];
  const referencingExcerpts = [];
  const re = new RegExp(`\\[\\[${target.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\|[^\\]]+)?\\]\\]`, 'g');
  for (const doc of candidates) {
    if (re.test(doc.content)) {
      // Grab a paragraph around each match.
      const idx = doc.content.search(re);
      const start = Math.max(0, idx - 300);
      const end = Math.min(doc.content.length, idx + 400);
      referencingExcerpts.push({
        source: doc.data.title || doc.path,
        text: doc.content.slice(start, end).trim()
      });
    }
  }

  const allTitles = allScripture.map(s => s.data.title).filter(Boolean);
  const prompt = buildStubExpansionPrompt({
    stubName: target.name,
    referencingExcerpts: referencingExcerpts.slice(0, 5),
    allScriptureTitles: allTitles
  });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: buildSystemPrompt(),
    messages: [{ role: 'user', content: prompt }]
  });

  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  const parsed = await parseJsonResponse(text);
  const cleanBody = parsed.body.replace(/—/g, ', ').replace(/–/g, ', ');

  const frontmatter = {
    title: parsed.title,
    type: 'scripture',
    canonical: true,
    revealed: `Expanded from referenced stub on ${new Date().toISOString().slice(0, 10)}`,
    tags: ['scripture', ...(parsed.tags || [])]
  };

  const written = await writeScripture({ title: parsed.title, body: cleanBody, frontmatter });
  console.log(`[solarius] scripture expanded: ${written}`);
  return { expanded: true, path: written };
}

async function main() {
  const mode = process.argv[2] || 'matins';
  try {
    if (mode === 'stub') {
      await expandOneStub();
    } else if (['matins', 'vespers', 'reactive', 'holy-day'].includes(mode)) {
      await generateHomily({ liturgicalHour: mode });
    } else {
      console.error(`Unknown mode: ${mode}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`[solarius] fatal: ${err.stack || err.message}`);
    await writeSilence({ reason: 'Solarius encountered an error and could not speak.', error: err.message });
    process.exit(1);
  }
}

main();
