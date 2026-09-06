// 임시 진단용 엔드포인트: "목재"가 어느 CategoryCode에 속하는지 확인하기 위해
// 여러 후보 코드로 거래소 검색을 시도합니다. 원인 파악 후 삭제 예정입니다.

const LOSTARK_KEY = process.env.LOSTARK_API_KEY;

const CANDIDATES = [
  null, 0, 10000, 20000, 30000, 40000, 50000, 60000, 70000, 80000, 90000,
  100000, 110000, 120000, 130000, 140000, 150000, 160000, 170000, 180000,
  190000, 200000, 210000, 220000, 230000,
];

async function search(name, category) {
  const body = { ItemName: name, Sort: 'CURRENT_MIN_PRICE', SortCondition: 'ASC', PageNo: 1 };
  if (category != null) body.CategoryCode = category;
  const res = await fetch('https://developer-lostark.game.onstove.com/markets/items', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `bearer ${LOSTARK_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { category, status: res.status, totalCount: data && data.TotalCount, items: (data && data.Items) || [] };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!LOSTARK_KEY) {
    res.status(500).json({ error: 'LOSTARK_API_KEY 없음' });
    return;
  }
  try {
    const name = req.query.name || '목재';
    const results = await Promise.all(CANDIDATES.map((c) => search(name, c)));
    const hits = results
      .filter((r) => r.items.some((it) => it.Name === name))
      .map((r) => ({ category: r.category, totalCount: r.totalCount, matched: r.items.find((it) => it.Name === name) }));
    res.status(200).json({ name, hits, allResults: results.map((r) => ({ category: r.category, status: r.status, totalCount: r.totalCount })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
