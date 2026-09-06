// 임시 진단용: "상급 아비도스 융화 재료"가 어느 CategoryCode에 속하는지 확인합니다.
const LOSTARK_KEY = process.env.LOSTARK_API_KEY;

const CANDIDATES = [50000, 90000];

async function search(name, category) {
  const body = { ItemName: name, CategoryCode: category, Sort: 'CURRENT_MIN_PRICE', SortCondition: 'ASC', PageNo: 1 };
  const r = await fetch('https://developer-lostark.game.onstove.com/markets/items', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `bearer ${LOSTARK_KEY}` },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) {}
  return { category, status: r.status, statusText: r.statusText, items: (data && data.Items) || [] };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!LOSTARK_KEY) {
    res.status(500).json({ error: 'LOSTARK_API_KEY 없음' });
    return;
  }
  try {
    const name = req.query.name || '상급 아비도스 융화 재료';
    const results = await Promise.all(CANDIDATES.map((c) => search(name, c)));
    res.status(200).json({
      query: name,
      results: results.map((r) => ({
        category: r.category,
        status: r.status,
        statusText: r.statusText,
        matched: r.items.find((it) => it.Name === name) || null,
        itemCount: r.items.length,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
