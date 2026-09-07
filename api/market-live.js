// 거래소 시세 탭의 "실시간 현재가"를 서버가 보유한 로스트아크 API 키로 대신 조회해
// Redis에 캐싱하는 엔드포인트. 방문자는 자신의 API 키를 등록하지 않아도 이 엔드포인트를
// 통해 캐시(최대 TTL_MS 만큼 지연될 수 있음) 값을 받아볼 수 있음.
// 캐시가 TTL보다 오래됐을 때만 로스트아크 API를 다시 호출해 갱신하고,
// 개별 아이템 조회가 실패하면 그 아이템만 이전 캐시 값을 그대로 유지함.
// (일별 누적 그래프 데이터는 이 엔드포인트가 아니라 /api/collect가 채우는
// market-history를 그대로 사용함 - 여기서는 "방금" 값만 다룸)

const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const LOSTARK_KEY = process.env.LOSTARK_API_KEY;

const REDIS_KEY = 'loa_market-live-prices';
const TTL_MS = 5 * 60 * 1000; // 5분

const MARKET_ITEMS = [
  { name: '운명의 파괴석', type: 'market' },
  { name: '운명의 파괴석 결정', type: 'market' },
  { name: '운명의 수호석', type: 'market' },
  { name: '운명의 수호석 결정', type: 'market' },
  { name: '운명의 돌파석', type: 'market' },
  { name: '위대한 운명의 돌파석', type: 'market' },
  { name: '아비도스 융화 재료', type: 'market' },
  { name: '상급 아비도스 융화 재료', type: 'market' },
  { name: '운명의 파편 주머니(소)', type: 'market' },
  { name: '운명의 파편 주머니(중)', type: 'market' },
  { name: '운명의 파편 주머니(대)', type: 'market' },
  { name: '용암의 숨결', type: 'market' },
  { name: '빙하의 숨결', type: 'market' },
  { name: '에스더의 기운', type: 'market' },
  { name: '10레벨 겁화의 보석', type: 'auction', category: 210000 },
  { name: '10레벨 작열의 보석', type: 'auction', category: 210000 },
  { name: '9레벨 겁화의 보석', type: 'auction', category: 210000 },
  { name: '9레벨 작열의 보석', type: 'auction', category: 210000 },
  { name: '8레벨 겁화의 보석', type: 'auction', category: 210000 },
  { name: '8레벨 작열의 보석', type: 'auction', category: 210000 },
  { name: '7레벨 겁화의 보석', type: 'auction', category: 210000 },
  { name: '7레벨 작열의 보석', type: 'auction', category: 210000 },
  { name: '유물 원한 각인서', type: 'market', category: 40000, grade: '유물' },
  { name: '유물 돌격대장 각인서', type: 'market', category: 40000, grade: '유물' },
  { name: '유물 예리한 둔기 각인서', type: 'market', category: 40000, grade: '유물' },
  { name: '유물 아드레날린 각인서', type: 'market', category: 40000, grade: '유물' },
  { name: '유물 질량 증가 각인서', type: 'market', category: 40000, grade: '유물' },
  { name: '유물 기습의 대가 각인서', type: 'market', category: 40000, grade: '유물' },
  { name: '유물 저주받은 인형 각인서', type: 'market', category: 40000, grade: '유물' },
  { name: '유물 타격의 대가 각인서', type: 'market', category: 40000, grade: '유물' },
  { name: '유물 각성 각인서', type: 'market', category: 40000, grade: '유물' },
  { name: '유물 전문의 각인서', type: 'market', category: 40000, grade: '유물' },
  { name: '유물 결투의 대가 각인서', type: 'market', category: 40000, grade: '유물' },
  { name: '유물 슈퍼 차지 각인서', type: 'market', category: 40000, grade: '유물' },
];

async function readCache() {
  const r = await fetch(`${REST_URL}/get/${encodeURIComponent(REDIS_KEY)}`, {
    headers: { Authorization: `Bearer ${REST_TOKEN}` },
  });
  const data = await r.json();
  if (data && data.result) {
    try {
      return JSON.parse(data.result);
    } catch (e) {
      return null;
    }
  }
  return null;
}

async function writeCache(value) {
  const r = await fetch(`${REST_URL}/set/${encodeURIComponent(REDIS_KEY)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'text/plain' },
    body: JSON.stringify(value),
  });
  if (!r.ok) {
    const errData = await r.json().catch(() => ({}));
    throw new Error(errData.error || 'Redis 저장 실패');
  }
}

async function fetchMarketLiveItem(name, category, grade) {
  const body = { ItemName: name, CategoryCode: category || 50000, Sort: 'CURRENT_MIN_PRICE', SortCondition: 'ASC', PageNo: 1 };
  if (grade) body.ItemGrade = grade;
  const r = await fetch('https://developer-lostark.game.onstove.com/markets/items', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `bearer ${LOSTARK_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  const items = (data && data.Items) || [];
  const found = items.find((it) => it.Name === name) || items[0];
  if (!found) return null;
  return { recentPrice: found.RecentPrice != null ? found.RecentPrice : null, ydayAvgPrice: found.YDayAvgPrice != null ? found.YDayAvgPrice : null };
}

async function fetchAuctionLiveItem(name, category) {
  const r = await fetch('https://developer-lostark.game.onstove.com/auctions/items', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `bearer ${LOSTARK_KEY}`,
    },
    body: JSON.stringify({ ItemName: name, CategoryCode: category || 210000, Sort: 'BUY_PRICE', SortCondition: 'ASC', PageNo: 1 }),
  });
  const data = await r.json();
  const items = (data && data.Items) || [];
  const exact = items.filter((it) => it.Name === name && it.AuctionInfo && typeof it.AuctionInfo.BuyPrice === 'number');
  if (exact.length === 0) return null;
  return { minBuyPrice: Math.min(...exact.map((it) => it.AuctionInfo.BuyPrice)) };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (!REST_URL || !REST_TOKEN) {
    res.status(500).json({ error: 'Redis 연결 정보가 없습니다.' });
    return;
  }
  if (!LOSTARK_KEY) {
    res.status(500).json({ error: 'LOSTARK_API_KEY 환경변수가 설정되지 않았습니다.' });
    return;
  }

  try {
    const cached = await readCache();
    const now = Date.now();
    if (cached && cached.updatedAt && now - cached.updatedAt < TTL_MS) {
      res.status(200).json(cached);
      return;
    }

    const results = await Promise.all(
      MARKET_ITEMS.map((item) =>
        (item.type === 'auction' ? fetchAuctionLiveItem(item.name, item.category) : fetchMarketLiveItem(item.name, item.category, item.grade)).catch(() => null)
      )
    );

    const live = Object.assign({}, cached && cached.live);
    MARKET_ITEMS.forEach((item, i) => {
      if (results[i] != null) live[item.name] = results[i];
    });

    const value = { updatedAt: now, live };
    await writeCache(value);
    res.status(200).json(value);
  } catch (err) {
    res.status(500).json({ error: '서버 오류: ' + err.message });
  }
}
