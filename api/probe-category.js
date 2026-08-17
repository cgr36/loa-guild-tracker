// 임시 진단용 엔드포인트 - 각인서 CategoryCode 확인 후 삭제 예정
const LOSTARK_KEY = process.env.LOSTARK_API_KEY;

async function searchOne(name, category) {
  const r = await fetch('https://developer-lostark.game.onstove.com/auctions/items', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `bearer ${LOSTARK_KEY}`,
    },
    body: JSON.stringify({ ItemName: name, CategoryCode: category, Sort: 'BUY_PRICE', SortCondition: 'ASC', PageNo: 1 }),
  });
  const rawText = await r.text();
  let data = null;
  try { data = JSON.parse(rawText); } catch (e) { /* ignore */ }
  return { category, status: r.status, totalCount: data ? data.TotalCount : null };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!LOSTARK_KEY) {
    res.status(500).json({ error: 'LOSTARK_API_KEY 없음' });
    return;
  }
  const name = req.query.name || '유물 원한 각인서';
  const from = Number(req.query.from || 10000);
  const to = Number(req.query.to || 300000);
  const step = Number(req.query.step || 10000);
  const codes = [];
  for (let c = from; c <= to; c += step) codes.push(c);

  try {
    const results = await Promise.all(codes.map((c) => searchOne(name, c).catch((e) => ({ category: c, error: e.message }))));
    const hits = results.filter((r) => r.totalCount != null && r.totalCount > 0);
    res.status(200).json({ name, scanned: codes.length, hits, all: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
