// 임시 진단용 엔드포인트 - markets/items CategoryCode 40000 확인 후 삭제 예정
const LOSTARK_KEY = process.env.LOSTARK_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!LOSTARK_KEY) {
    res.status(500).json({ error: 'LOSTARK_API_KEY 없음' });
    return;
  }
  const name = req.query.name != null ? req.query.name : '유물 원한 각인서';
  const category = Number(req.query.category || 40000);
  const endpoint = req.query.endpoint === 'market' ? 'markets/items' : 'auctions/items';
  try {
    const body = endpoint === 'markets/items'
      ? { CategoryCode: category, Sort: 'CURRENT_MIN_PRICE', SortCondition: 'ASC', PageNo: 1 }
      : { CategoryCode: category, Sort: 'BUY_PRICE', SortCondition: 'ASC', PageNo: 1 };
    if (name) body.ItemName = name;
    if (req.query.itemGrade) body.ItemGrade = req.query.itemGrade;
    if (req.query.itemTier) body.ItemTier = Number(req.query.itemTier);
    const r = await fetch(`https://developer-lostark.game.onstove.com/${endpoint}`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: `bearer ${LOSTARK_KEY}`,
      },
      body: JSON.stringify(body),
    });
    const rawText = await r.text();
    let data = null;
    try { data = JSON.parse(rawText); } catch (e) { /* ignore */ }
    res.status(200).json({
      sentBody: body,
      endpoint,
      category,
      lostarkStatus: r.status,
      rawText: data ? undefined : rawText.slice(0, 300),
      totalCount: data && data.TotalCount,
      items: ((data && data.Items) || []).slice(0, 5).map((it) => ({ Name: it.Name, Grade: it.Grade, CurrentMinPrice: it.CurrentMinPrice, BuyPrice: it.AuctionInfo && it.AuctionInfo.BuyPrice })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
