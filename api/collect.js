// 매일 한 번 Vercel Cron이 호출하여 거래소/경매장 시세를 Redis에 누적 저장하는 함수
// 저장 위치: loa_market-history (기존 /api/state.js와 동일한 Redis를 재활용)

const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const LOSTARK_KEY = process.env.LOSTARK_API_KEY;

const HISTORY_REDIS_KEY = 'loa_market-history';
const MAX_DAYS = 90;

const MARKET_ITEMS = [
'운명의 파괴석',
'운명의 파괴석 결정',
'운명의 수호석',
'운명의 수호석 결정',
'운명의 돌파석',
'위대한 운명의 돌파석',
'아비도스 융화 재료',
'상급 아비도스 융화 재료',
'명예의 파편 주머니(소)',
'명예의 파편 주머니(중)',
'명예의 파편 주머니(대)',
'운명의 파편 주머니(소)',
'운명의 파편 주머니(중)',
'운명의 파편 주머니(대)',
'용암의 숨결',
'빙하의 숨결',
'에스더의 기운',
];

const AUCTION_ITEMS = [
'10레벨 겁화의 보석',
'10레벨 작열의 보석',
'9레벨 겁화의 보석',
'9레벨 작열의 보석',
'8레벨 겁화의 보석',
'8레벨 작열의 보석',
'7레벨 겁화의 보석',
'7레벨 작열의 보석',
];

async function readHistory() {
const r = await fetch(`${REST_URL}/get/${encodeURIComponent(HISTORY_REDIS_KEY)}`, {
headers: { Authorization: `Bearer ${REST_TOKEN}` },
});
const data = await r.json();
if (data && data.result) {
try {
return JSON.parse(data.result);
} catch (e) {
return {};
}
}
return {};
}

async function writeHistory(history) {
  const value = JSON.stringify(history);
const r = await fetch(`${REST_URL}/set/${encodeURIComponent(HISTORY_REDIS_KEY)}`, {
method: 'POST',
  headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'text/plain' },
  body: value,
    });
if (!r.ok) {
const errData = await r.json().catch(() => ({}));
throw new Error(errData.error || 'Redis 저장 실패');
}
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchMarketItem(name) {
const searchRes = await fetch('https://developer-lostark.game.onstove.com/markets/items', {
  method: 'POST',
  headers: {
  accept: 'application/json',
    'content-type': 'application/json',
    authorization: `bearer ${LOSTARK_KEY}`,
    },
    body: JSON.stringify({ ItemName: name, Sort: 'CURRENT_MIN_PRICE', SortCondition: 'ASC', PageNo: 1 }),
    });
const searchData = await searchRes.json();
const items = (searchData && searchData.Items) || [];
const found = items.find((it) => it.Name === name) || items[0];
if (!found) return null;

const statsRes = await fetch(
`https://developer-lostark.game.onstove.com/markets/items/${encodeURIComponent(found.Id)}`,
{
headers: { accept: 'application/json', authorization: `bearer ${LOSTARK_KEY}` },
}
);
const statsData = await statsRes.json();
const statsItem = Array.isArray(statsData) ? statsData[0] : statsData;
const stats = (statsItem && statsItem.Stats) || [];
return { name, stats };
}

async function fetchAuctionItem(name) {
const r = await fetch('https://developer-lostark.game.onstove.com/auctions/items', {
method: 'POST',
headers: {
accept: 'application/json',
'content-type': 'application/json',
authorization: `bearer ${LOSTARK_KEY}`,
},
body: JSON.stringify({ ItemName: name, Sort: 'BUY_PRICE', SortCondition: 'ASC', PageNo: 1 }),
});
const data = await r.json();
const items = (data && data.Items) || [];
const exact = items.filter((it) => it.Name === name && it.AuctionInfo && typeof it.AuctionInfo.BuyPrice === 'number');
if (exact.length === 0) return { name, minBuyPrice: null };
const minBuyPrice = Math.min(...exact.map((it) => it.AuctionInfo.BuyPrice));
return { name, minBuyPrice };
}

function mergeMarketHistory(history, name, stats) {
if (!history[name]) history[name] = [];
const existingDates = new Set(history[name].map((d) => d.date));
stats.forEach((s) => {
if (!s.Date) return;
const date = s.Date.slice(0, 10);
if (existingDates.has(date)) return;
history[name].push({ date, avgPrice: s.AvgPrice });
existingDates.add(date);
});
history[name].sort((a, b) => (a.date < b.date ? -1 : 1));
if (history[name].length > MAX_DAYS) {
history[name] = history[name].slice(history[name].length - MAX_DAYS);
}
}

function appendAuctionHistory(history, name, minBuyPrice, date) {
if (!history[name]) history[name] = [];
const existing = history[name].find((d) => d.date === date);
if (existing) {
existing.minBuyPrice = minBuyPrice;
} else {
history[name].push({ date, minBuyPrice });
}
history[name].sort((a, b) => (a.date < b.date ? -1 : 1));
if (history[name].length > MAX_DAYS) {
history[name] = history[name].slice(history[name].length - MAX_DAYS);
}
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
const history = await readHistory();
const date = todayStr();

const marketResults = await Promise.all(
MARKET_ITEMS.map((name) =>
fetchMarketItem(name).catch((err) => ({ name, error: err.message }))
)
);
marketResults.forEach((result) => {
if (result && result.stats) {
mergeMarketHistory(history, result.name, result.stats);
}
});

const auctionResults = await Promise.all(
AUCTION_ITEMS.map((name) =>
fetchAuctionItem(name).catch((err) => ({ name, error: err.message }))
)
);
auctionResults.forEach((result) => {
if (result && result.minBuyPrice != null) {
appendAuctionHistory(history, result.name, result.minBuyPrice, date);
}
});

await writeHistory(history);

res.status(200).json({
ok: true,
collectedAt: new Date().toISOString(),
marketCount: marketResults.filter((r) => r && r.stats).length,
auctionCount: auctionResults.filter((r) => r && r.minBuyPrice != null).length,
});
} catch (err) {
res.status(500).json({ error: '서버 오류: ' + err.message });
}
}
