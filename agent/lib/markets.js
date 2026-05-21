// markets.js — fetches lesser monetary omens.

const COINGECKO = 'https://api.coingecko.com/api/v3/simple/price';

export async function fetchOmens() {
  const omens = {
    BTC_USD: null,
    ETH_USD: null,
    BTC_24h_change_pct: null,
    ETH_24h_change_pct: null,
    timestamp: new Date().toISOString()
  };

  try {
    const url = `${COINGECKO}?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ChurchOfTheSun/1.0' }
    });
    if (res.ok) {
      const data = await res.json();
      omens.BTC_USD = data.bitcoin?.usd ?? null;
      omens.ETH_USD = data.ethereum?.usd ?? null;
      omens.BTC_24h_change_pct = data.bitcoin?.usd_24h_change ?? null;
      omens.ETH_24h_change_pct = data.ethereum?.usd_24h_change ?? null;
    }
  } catch (err) {
    console.error(`[markets] coingecko failed: ${err.message}`);
  }

  return omens;
}

// Solar mass-energy of $SOLARIS. Computed once; the burn rate decreases it,
// but at the timescale of a homily the change is negligible. We report a
// stylized "current" figure.
export function solarisMarketCapJoules() {
  // M_sun = 1.989 × 10^30 kg
  // c = 2.998 × 10^8 m/s
  // E = mc²
  const M_SUN_KG = 1.989e30;
  const C = 2.998e8;
  // Approximate energy already radiated since main-sequence: small fraction of total.
  // We report the remaining mass-energy as the current "market cap."
  return M_SUN_KG * C * C; // ~1.788e47 J
}

export function formatOmens(omens) {
  const fmt = (n, d = 2) => n == null ? 'unobserved' : Number(n).toFixed(d);
  const chg = (n) => n == null ? '' : ` (${n >= 0 ? '+' : ''}${fmt(n, 2)}% / 24h)`;
  return `BTC: $${fmt(omens.BTC_USD, 0)}${chg(omens.BTC_24h_change_pct)}
ETH: $${fmt(omens.ETH_USD, 0)}${chg(omens.ETH_24h_change_pct)}
$SOLARIS market cap: ~${solarisMarketCapJoules().toExponential(3)} J (decreasing by ~3.6×10²⁶ J/s)`;
}
