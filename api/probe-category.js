// 임시 진단용 엔드포인트 - 각인서 CategoryCode 확인 후 삭제 예정
const LOSTARK_KEY = process.env.LOSTARK_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!LOSTARK_KEY) {
    res.status(500).json({ error: 'LOSTARK_API_KEY 없음' });
    return;
  }
  const name = req.query.name || '유물 원한 각인서';
  const category = Number(req.query.category || 0);
  try {
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
    try { data = JSON.parse(rawText); } catch (e) { /* keep raw */ }
    res.status(200).json({
      lostarkStatus: r.status,
      category,
      rawText: data ? undefined : rawText.slice(0, 500),
      totalCount: data && data.TotalCount,
      items: ((data && data.Items) || []).slice(0, 3).map((it) => ({ Name: it.Name, Grade: it.Grade, BuyPrice: it.AuctionInfo && it.AuctionInfo.BuyPrice })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
