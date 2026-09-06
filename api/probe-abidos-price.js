// 임시 진단용: "상급 아비도스 융화 재료" 검색 결과를 그대로 반환합니다.
const LOSTARK_KEY = process.env.LOSTARK_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!LOSTARK_KEY) {
    res.status(500).json({ error: 'LOSTARK_API_KEY 없음' });
    return;
  }
  try {
    const name = req.query.name || '상급 아비도스 융화 재료';
    const body = { ItemName: name, Sort: 'CURRENT_MIN_PRICE', SortCondition: 'ASC', PageNo: 1 };
    const r = await fetch('https://developer-lostark.game.onstove.com/markets/items', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `bearer ${LOSTARK_KEY}` },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    res.status(200).json({ query: name, status: r.status, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
