// Vercel Serverless Function
// يشتغل على السيرفر (مو المتصفح) عشان يخفي مفتاح الـ API ويتجنب مشاكل CORS.
// يسحب هدافي دوري أبطال أوروبا (أقوى مؤشر حي متاح مجاناً) لحظة ما أي زائر يفتح الموقع.

export default async function handler(req, res) {
  const API_KEY = process.env.FOOTBALL_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({
      error: 'ما فيه مفتاح API. لازم تضيف FOOTBALL_API_KEY في إعدادات Vercel > Environment Variables.'
    });
  }

  try {
    const response = await fetch(
      'https://api.football-data.org/v4/competitions/CL/scorers?limit=15',
      { headers: { 'X-Auth-Token': API_KEY } }
    );

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: 'فشل الاتصال بمصدر البيانات', detail: text });
    }

    const data = await response.json();

    const players = (data.scorers || []).map((s) => ({
      name: s.player?.name || 'غير معروف',
      team: s.team?.name || '',
      goals: s.goals || 0,
      assists: s.assists || 0,
      // معادلة تقييم بسيطة: هدف = 3 نقاط، تمريرة حاسمة = 2 نقطة
      score: (s.goals || 0) * 3 + (s.assists || 0) * 2,
    }));

    players.sort((a, b) => b.score - a.score);

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate'); // يحدّث كل 30 دقيقة تقريباً
    return res.status(200).json({
      updatedAt: new Date().toISOString(),
      competition: 'دوري أبطال أوروبا',
      players,
    });
  } catch (err) {
    return res.status(500).json({ error: 'خطأ غير متوقع', detail: String(err) });
  }
}
