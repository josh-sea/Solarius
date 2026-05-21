# ☉ Church of the Sun

> *An autonomous theological agent that translates current events through the doctrines of an absurdly committed solar religion. The Sun is the savior. $SOLARIS is the only honest money. The Non-Aggression Principle is the First Law of Solar Ethics.*

Solarius is a Sonnet 4.6 powered agent that runs on GitHub Actions, reads news headlines and market data, and writes deadpan-serious theological homilies into an Obsidian-compatible vault. The vault is rendered to a public GitHub Pages site with an interactive wikilink graph. The mythology grows by accretion: every wikilink to a non-existent page becomes a stub that the agent eventually expands into full scripture.

## Repo Layout

```
.
├── agent/                  # Solarius runner + libraries
│   ├── solarius.js         # main entry; modes: matins | vespers | reactive | stub
│   ├── lib/
│   │   ├── canon.js        # immutable doctrine
│   │   ├── prompts.js      # system + user prompt builders
│   │   ├── news.js         # RSS aggregation
│   │   ├── markets.js      # BTC/ETH omens
│   │   ├── astronomy.js    # moon phase, high holy days
│   │   └── vault.js        # vault I/O + wikilink graph
│   └── package.json
├── vault/                  # Obsidian-compatible content
│   ├── Scripture/          # The 5 foundational texts + grown scripture
│   ├── Homilies/YYYY/MM/   # Generated daily/event-driven posts
│   ├── Parables/           # Auto-promoted homilies
│   ├── Saints/             # Canonized figures
│   ├── Heretics/           # Named positions (NOT persons)
│   ├── Cosmology/          # $SOLARIS, the Heliocron
│   ├── Silences/           # Days the agent did not speak
│   └── Apocrypha/          # Non-canonical preservations
├── site/                   # Static site generator
│   ├── build.js            # vault → static HTML
│   ├── assets/css/         # Solar-themed styling
│   └── package.json
└── .github/workflows/
    ├── matins.yml          # ~6:30am ET daily
    ├── vespers.yml         # ~6pm ET daily
    ├── reactive.yml        # every 2hr; usually silent
    ├── stub-expansion.yml  # weekly; expands referenced-but-unwritten pages
    └── deploy-pages.yml    # builds + deploys site on vault changes
```

## Setup

1. **Create a new GitHub repo**, push this code to `main`.
2. **Add secret**: `Settings → Secrets and variables → Actions → New repository secret`:
   - `ANTHROPIC_API_KEY` = your Anthropic key
3. **Enable Pages**: `Settings → Pages → Build and deployment → Source: GitHub Actions`.
4. **Adjust workflow permissions** if needed: `Settings → Actions → General → Workflow permissions → Read and write permissions`.
5. (Optional) Test locally:
   ```bash
   cd agent && npm install
   ANTHROPIC_API_KEY=sk-... VAULT_ROOT=../vault node solarius.js matins
   cd ../site && npm install && npm run build
   open _site/index.html
   ```

## How It Works

**Each scheduled run:**
1. Fetches 24h of headlines from curated feeds (Reuters, BBC, CoinDesk, Fed, HN, etc.)
2. Fetches BTC/ETH market data from CoinGecko
3. Computes Heliocronic date, moon phase, high-holy-day status
4. Reads 3 random scripture excerpts and last 7 homilies for context
5. Inventories any wikilink stubs (references to pages that don't yet exist)
6. Sends everything to Sonnet 4.6 with the canon as system prompt
7. The model selects ONE event of cosmic resonance, writes the homily as JSON
8. The runner writes the markdown file with frontmatter, plus any new Saint/Heretic pages
9. Workflow commits and pushes; Pages rebuilds

**Silence is a valid output.** When no event rises above baseline, the agent records a silence and says nothing. Silence is doctrine. Failures also become silences (with the error message preserved).

**Stub expansion** runs weekly and picks the most-referenced unwritten wikilink, then writes it into full scripture grounded in the existing references. This is how the mythology grows.

## Doctrinal Voice

Solarius is a deadpan-serious theological persona. Austrian-school economic framing (Mises, Hayek, Menger as "minor prophets"). NAP as First Law of Solar Ethics. Mixed economy explicitly acknowledged (not anarcho-capitalist). No em dashes. No exclamation points. No emoji. Never breaks frame. The humor is structural.

## Safety Rails

- Real persons are referenced only when the headline names them, and only in their public roles.
- Heretic pages condemn positions, never private character.
- $SOLARIS is clearly marked as a doctrinal construct, not a financial instrument.
- No investment advice. No incitement. No conspiracy theories.
- The site footer makes the satirical framing explicit.

## Costs

A single Sonnet 4.6 generation costs roughly $0.05-0.15. With matins, vespers, ~12 reactive runs/day (most silent), and weekly stub expansion, the agent runs around $5-15/month at typical cadence. Adjust workflow crons to tune.

## License

The code is MIT. The doctrine, like the Sun, is universal.
