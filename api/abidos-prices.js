// 아비도스 제작 효율 탭에서 쓰는 재료/판매가 최저가를 서버가 보유한 로스트아크 API 키로
// 대신 조회해 Redis에 캐싱해두는 엔드포인트. 방문자는 자신의 API 키를 등록하지 않아도
// 이 엔드포인트를 통해 캐시(최대 TTL_MS 만큼 지연될 수 있음) 값을 받아볼 수 있음.
// 캐시가 TTL보다 오래됐을 때만 로스트아크 API를 다시 호출해 갱신하고,
// 개별 아이템 조회가 실패하면 그 아이템만 이전 캐시 값을 그대로 유지함.

const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const LOSTARK_KEY = process.env.LOSTARK_API_KEY;

const REDIS_KEY = 'loa_abidos-live-prices';
const TTL_MS = 10 * 60 * 1000; // 10분

const MATERIAL_CATEGORY = 90000; // 생활 재료(목재 등) 카테고리
const SELL_ITEM_CATEGORY = 50000;
const SELL_ITEM = '상급 아비도스 융화 재료';

const MATERIAL_ITEMS = [
  '목재', '부드러운 목재', '아비도스 목재',
  '고대 유물', '희귀한 유물', '아비도스 유물',
  '생선', '붉은 살 생선', '아비도스 태양 잉어',
  '들꽃', '수줍은 들꽃', '아비도스 들꽃',
  '철광석', '묵직한 철광석', '아비도스 철광석',
  '두툼한 생고기', '다듬은 생고기', '아비도스 두툼한 생고기',
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

async function fetchCurrentMinPrice(name, category) {
  const r = await fetch('https://developer-lostark.game.onstove.com/markets/items', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `bearer ${LOSTARK_KEY}`,
    },
    body: JSON.stringify({ ItemName: name, CategoryCode: category, Sort: 'CURRENT_MIN_PRICE', SortCondition: 'ASC', PageNo: 1 }),
  });
  const data = await r.json();
  const items = (data && data.Items) || [];
  const found = items.find((it) => it.Name === name);
  return found && found.CurrentMinPrice != null ? found.CurrentMinPrice : null;
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

    const allNames = [...MATERIAL_ITEMS, SELL_ITEM];
    const results = await Promise.all(
      allNames.map((name) =>
        fetchCurrentMinPrice(name, name === SELL_ITEM ? SELL_ITEM_CATEGORY : MATERIAL_CATEGORY).catch(() => null)
      )
    );

    const prices = Object.assign({}, cached && cached.prices);
    allNames.forEach((name, i) => {
      if (results[i] != null) prices[name] = results[i];
    });

    const value = { updatedAt: now, prices };
    await writeCache(value);
    res.status(200).json(value);
  } catch (err) {
    res.status(500).json({ error: '서버 오류: ' + err.message });
  }
}
