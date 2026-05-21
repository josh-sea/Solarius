// astronomy.js — solar and lunar context for liturgical homilies.

// Compute moon phase (0=new, 0.5=full, etc.) using a simple algorithm.
// Reference epoch: 2000-01-06 18:14 UTC (a known new moon).
export function moonPhase(date = new Date()) {
  const SYNODIC_DAYS = 29.530588853;
  const KNOWN_NEW_MOON = new Date('2000-01-06T18:14:00Z').getTime();
  const ageDays = (date.getTime() - KNOWN_NEW_MOON) / 86400000;
  const phase = ((ageDays % SYNODIC_DAYS) + SYNODIC_DAYS) % SYNODIC_DAYS / SYNODIC_DAYS;
  return phase;
}

export function moonPhaseName(phase) {
  if (phase < 0.03 || phase > 0.97) return 'new moon';
  if (phase < 0.22) return 'waxing crescent';
  if (phase < 0.28) return 'first quarter';
  if (phase < 0.47) return 'waxing gibbous';
  if (phase < 0.53) return 'full moon';
  if (phase < 0.72) return 'waning gibbous';
  if (phase < 0.78) return 'last quarter';
  return 'waning crescent';
}

// Determine if the date is on or near a high holy day.
// Returns a key like 'summer solstice' or null.
export function highHolyDay(date = new Date()) {
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  if (month === 3 && day >= 19 && day <= 21) return 'vernal equinox';
  if (month === 6 && day >= 20 && day <= 22) return 'summer solstice';
  if (month === 9 && day >= 21 && day <= 23) return 'autumnal equinox';
  if (month === 12 && day >= 20 && day <= 22) return 'winter solstice';
  if (month === 1 && day >= 2 && day <= 5) return 'perihelion';
  if (month === 7 && day >= 3 && day <= 6) return 'aphelion';
  return null;
}

// Try to fetch real space weather. Best-effort; degrade gracefully.
export async function fetchSpaceWeather() {
  const out = { kp: null, solar_wind_speed: null, alerts: [] };
  try {
    const res = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json', {
      headers: { 'User-Agent': 'ChurchOfTheSun/1.0' }
    });
    if (res.ok) {
      const data = await res.json();
      // First row is headers; latest is last
      const last = data[data.length - 1];
      if (last && last[1] != null) out.kp = parseFloat(last[1]);
    }
  } catch (err) {
    console.error(`[astronomy] kp index failed: ${err.message}`);
  }
  return out;
}

export function astronomyContext(date = new Date()) {
  const phase = moonPhase(date);
  return {
    moon_phase_fraction: phase.toFixed(3),
    moon_phase_name: moonPhaseName(phase),
    high_holy_day: highHolyDay(date)
  };
}
