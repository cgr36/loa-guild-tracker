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
{ name: '10레벨 겁화의 보석', category: 210000 },
{ name: '10레벨 작열의 보석', category: 210000 },
{ name: '9레벨 겁화의 보석', category: 210000 },
{ name: '9레벨 작열의 보석', category: 210000 },
{ name: '8레벨 겁화의 보석', category: 210000 },
{ name: '8레벨 작열의 보석', category: 210000 },
{ name: '7레벨 겁화의 보석', category: 210000 },
{ name: '7레벨 작열의 보석', category: 210000 },
];

// 각인서는 거래소(markets/items) 아이템이지만 실제 거래 통계(Stats)가 비어있어
// 재료처럼 일별 평균가 대신, 보석처럼 "오늘의 최저가" 스냅샷만 하루 한 번 기록합니다.
const ENGRAVING_ITEMS = [
{ name: '유물 원한 각인서', category: 40000, grade: '유물' },
{ name: '유물 돌격대장 각인서', category: 40000, grade: '유물' },
{ name: '유물 예리한 둔기 각인서', category: 40000, grade: '유물' },
{ name: '유물 아드레날린 각인서', category: 40000, grade: '유물' },
{ name: '유물 질량 증가 각인서', category: 40000, grade: '유물' },
{ name: '유물 기습의 대가 각인서', category: 40000, grade: '유물' },
{ name: '유물 저주받은 인형 각인서', category: 40000, grade: '유물' },
{ name: '유물 타격의 대가 각인서', category: 40000, grade: '유물' },
{ name: '유물 각성 각인서', category: 40000, grade: '유물' },
{ name: '유물 전문의 각인서', category: 40000, grade: '유물' },
{ name: '유물 결투의 대가 각인서', category: 40000, grade: '유물' },
{ name: '유물 슈퍼 차지 각인서', category: 40000, grade: '유물' },
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
    body: JSON.stringify({ ItemName: name, CategoryCode: 50000, Sort: 'CURRENT_MIN_PRICE', SortCondition: 'ASC', PageNo: 1 }),
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

async function fetchMarketSnapshot(name, category, grade) {
const body = { ItemName: name, CategoryCode: category, Sort: 'CURRENT_MIN_PRICE', SortCondition: 'ASC', PageNo: 1 };
if (grade) body.ItemGrade = grade;
const searchRes = await fetch('https://developer-lostark.game.onstove.com/markets/items', {
method: 'POST',
headers: {
accept: 'application/json',
'content-type': 'application/json',
authorization: `bearer ${LOSTARK_KEY}`,
},
body: JSON.stringify(body),
});
const searchData = await searchRes.json();
const items = (searchData && searchData.Items) || [];
const found = items.find((it) => it.Name === name);
if (!found || found.CurrentMinPrice == null) return { name, currentMinPrice: null };
return { name, currentMinPrice: found.CurrentMinPrice };
}

async function fetchAuctionItem(name, category) {
const r = await fetch('https://developer-lostark.game.onstove.com/auctions/items', {
method: 'POST',
headers: {
accept: 'application/json',
'content-type': 'application/json',
authorization: `bearer ${LOSTARK_KEY}`,
},
body: JSON.stringify({ ItemName: name, CategoryCode: category, Sort: 'BUY_PRICE', SortCondition: 'ASC', PageNo: 1 }),
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

function appendMarketSnapshot(history, name, currentMinPrice, date) {
if (!history[name]) history[name] = [];
const existing = history[name].find((d) => d.date === date);
if (existing) {
existing.avgPrice = currentMinPrice;
} else {
history[name].push({ date, avgPrice: currentMinPrice });
}
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
AUCTION_ITEMS.map((item) =>
fetchAuctionItem(item.name, item.category).catch((err) => ({ name: item.name, error: err.message }))
)
);
auctionResults.forEach((result) => {
if (result && result.minBuyPrice != null) {
appendAuctionHistory(history, result.name, result.minBuyPrice, date);
}
});

const engravingResults = await Promise.all(
ENGRAVING_ITEMS.map((item) =>
fetchMarketSnapshot(item.name, item.category, item.grade).catch((err) => ({ name: item.name, error: err.message }))
)
);
engravingResults.forEach((result) => {
if (result && result.currentMinPrice != null) {
appendMarketSnapshot(history, result.name, result.currentMinPrice, date);
}
});

await writeHistory(history);

res.status(200).json({
ok: true,
collectedAt: new Date().toISOString(),
marketCount: marketResults.filter((r) => r && r.stats).length,
auctionCount: auctionResults.filter((r) => r && r.minBuyPrice != null).length,
engravingCount: engravingResults.filter((r) => r && r.currentMinPrice != null).length,
});
} catch (err) {
res.status(500).json({ error: '서버 오류: ' + err.message });
}
}
