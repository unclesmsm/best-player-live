// Vercel Serverless Function (multi-league version)
// Pulls top scorers from the top 5 leagues + Champions League, then merges each player's numbers into one score.

const COMPETITIONS = [
  { code: 'PL', label: 'PL' },
  { code: 'PD', label: 'Liga' },
  { code: 'BL1', label: 'BL' },
  { code: 'SA', label: 'SerieA' },
  { code: 'FL1', label: 'L1' },
  { code: 'CL', label: 'UCL' }, // last, so the domestic club is kept as the player's team
];

async function fetchScorers(code, apiKey) {
  const response = await fetch(
    `https://api.football-data.org/v4/competitions/${code}/scorers?limit=30`,
    { headers: { 'X-Auth-Token': apiKey } }
  );
  if (!response.ok) throw new Error(`${code}: ${response.status}`);
  const data = await response.json();
  return data.scorers || [];
}

export default async function handler(req, res) {
  const API_KEY = process.env.FOOTBALL_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({
      error: 'Missing API key. Add FOOTBALL_API_KEY in Vercel > Settings > Environment Variables.',
    });
  }

  try {
    const results = await Promise.all(
      COMPETITIONS.map(async (c) => {
        try {
          return { ...c, scorers: await fetchScorers(c.code, API_KEY), ok: true };
        } catch (e) {
          return { ...c, scorers: [], ok: false };
        }
      })
    );

    const failed = results.filter((r) => !r.ok).map((r) => r.code);
    if (failed.length === results.length) {
      return res.status(502).json({ error: 'Could not reach the data source (all requests failed).' });
    }

    const map = new Map();
    for (const r of results) {
      for (const s of r.scorers) {
        const id = s.player?.id;
        if (!id) continue;
        if (!map.has(id)) {
          map.set(id, {
            name: s.player?.name || 'Unknown',
            team: s.team?.name || '',
            goals: 0,
            assists: 0,
            parts: [],
          });
        }
        const p = map.get(id);
        p.goals += s.goals || 0;
        p.assists += s.assists || 0;
        p.parts.push(`${r.label} ${s.goals || 0}G`);
      }
    }

    const players = [...map.values()]
      .map((p) => ({
        name: p.name,
        team: `${p.team} · ${p.parts.join(' + ')}`,
        goals: p.goals,
        assists: p.assists,
        // simple rating: goal = 3 points, assist = 2 points
        score: p.goals * 3 + p.assists * 2,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate');
    return res.status(200).json({
      updatedAt: new Date().toISOString(),
      competition: 'Top 5 leagues + Champions League',
      failed,
      players,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Unexpected error', detail: String(err) });
  }
}
