// 경매장(보석) 아이템 최소 즉시구매가 조회 프록시
// 겁화/작열의 보석은 거래소(Market)가 아닌 경매장(Auction)에서만 거래되며,
// 공식 API가 시세 이력(Stats)을 제공하지 않으므로 최소 즉시구매가를 직접 수집합니다.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

if (req.method === 'OPTIONS') {
  res.status(200).end();
  return;
}

const { name, key } = req.query;

if (!name || !key) {
  res.status(400).json({ error: '아이템 이름 또는 API 키가 없습니다.' });
  return;
}

try {
  const r = await fetch('https://developer-lostark.game.onstove.com/auctions/items', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `bearer ${key}`,
    },
    body: JSON.stringify({
      ItemName: name,
      Sort: 'BUY_PRICE',
      SortCondition: 'ASC',
      PageNo: 1,
    }),
  });
  const data = await r.json();
  if (!r.ok) {
    res.status(r.status).json({ error: data?.Message || `로스트아크 API 오류 (status ${r.status})` });
    return;
  }

  const items = (data && data.Items) || [];
  const exact = items.filter((it) => it.Name === name);
  const withBuyPrice = exact.filter((it) => it.AuctionInfo && typeof it.AuctionInfo.BuyPrice === 'number');

  let minBuyPrice = null;
  if (withBuyPrice.length > 0) {
    minBuyPrice = Math.min(...withBuyPrice.map((it) => it.AuctionInfo.BuyPrice));
  }

  res.status(200).json({
    name,
    minBuyPrice,
    listedCount: exact.length,
  });
} catch (err) {
  res.status(500).json({ error: '서버 오류: ' + err.message });
}
}
