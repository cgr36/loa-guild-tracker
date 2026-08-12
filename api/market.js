// 거래소(재료) 아이템 시세 조회 프록시
// mode=search : 아이템 이름으로 검색 (Id, 현재가, 전일 평균가 등)
// mode=stats  : 아이템 Id로 최근 시세 통계(최근 약 14일치, Stats 배열) 조회

export default async function handler(req, res) {
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

if (req.method === 'OPTIONS') {
res.status(200).end();
return;
}

const { mode, name, id, key } = req.query;

if (!key) {
res.status(400).json({ error: 'API 키가 없습니다.' });
return;
}

try {
if (mode === 'stats') {
if (!id) {
res.status(400).json({ error: 'id가 필요합니다.' });
return;
}
const r = await fetch(
`https://developer-lostark.game.onstove.com/markets/items/${encodeURIComponent(id)}`,
{
headers: {
accept: 'application/json',
authorization: `bearer ${key}`,
},
}
);
const data = await r.json();
if (!r.ok) {
res.status(r.status).json({ error: data?.Message || `로스트아크 API 오류 (status ${r.status})` });
return;
}
res.status(200).json(data);
return;
}

if (!name) {
res.status(400).json({ error: 'name이 필요합니다.' });
return;
}
const r = await fetch('https://developer-lostark.game.onstove.com/markets/items', {
method: 'POST',
headers: {
accept: 'application/json',
'content-type': 'application/json',
authorization: `bearer ${key}`,
},
body: JSON.stringify({
ItemName: name, CategoryCode: 50000,
Sort: 'CURRENT_MIN_PRICE',
SortCondition: 'ASC',
PageNo: 1,
}),
});
const data = await r.json();
if (!r.ok) {
res.status(r.status).json({ error: data?.Message || `로스트아크 API 오류 (status ${r.status})` });
return;
}
res.status(200).json(data);
} catch (err) {
res.status(500).json({ error: '서버 오류: ' + err.message });
}
}
