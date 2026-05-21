// news.js — fetches headlines from RSS feeds for theological interpretation.

import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'ChurchOfTheSun/1.0 (theological commentary bot)' }
});

// Curated feeds. Skewed toward macro, markets, policy, and a dash of science.
// Keep this list short. The agent does not need volume; it needs resonance.
const FEEDS = [
  { url: 'https://feeds.reuters.com/reuters/topNews', name: 'Reuters Top News' },
  { url: 'https://feeds.reuters.com/reuters/businessNews', name: 'Reuters Business' },
  { url: 'https://feeds.reuters.com/news/wealth', name: 'Reuters Wealth' },
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', name: 'BBC World' },
  { url: 'https://feeds.bbci.co.uk/news/business/rss.xml', name: 'BBC Business' },
  { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', name: 'CoinDesk' },
  { url: 'https://hnrss.org/frontpage?points=200', name: 'Hacker News (200+)' },
  { url: 'https://www.federalreserve.gov/feeds/press_monetary.xml', name: 'Federal Reserve' },
  { url: 'https://services.swpc.noaa.gov/products/alerts.json', name: 'NOAA Space Weather', json: true }
];

export async function fetchHeadlines({ hoursBack = 24, perFeed = 15 } = {}) {
  const cutoff = Date.now() - hoursBack * 60 * 60 * 1000;
  const results = [];

  for (const feed of FEEDS) {
    try {
      if (feed.json) {
        // NOAA returns JSON; handled separately
        continue;
      }
      const parsed = await parser.parseURL(feed.url);
      for (const item of parsed.items.slice(0, perFeed)) {
        const pubMs = item.isoDate ? new Date(item.isoDate).getTime() : Date.now();
        if (pubMs < cutoff) continue;
        results.push({
          source: feed.name,
          title: item.title?.trim() || '',
          summary: (item.contentSnippet || item.content || '').slice(0, 400).trim(),
          url: item.link,
          publishedAt: new Date(pubMs).toISOString()
        });
      }
    } catch (err) {
      console.error(`[news] feed failed: ${feed.name}: ${err.message}`);
    }
  }

  // Deduplicate by title
  const seen = new Set();
  return results.filter(r => {
    const key = r.title.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
