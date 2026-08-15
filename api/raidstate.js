// 레이드 "체크 여부"만 별도로 관리하는 API입니다.
//
// 왜 따로 뺐나: 기존에는 캐릭터 전체 목록(loa_characters)을 한 덩어리 JSON으로 저장했고,
// 레이드를 체크할 때마다 그 전체 배열을 통째로 다시 저장했습니다. 그래서 두 사람이 비슷한
// 시간에 서로 다른 레이드를 체크하면, 나중에 저장한 사람이 자기 브라우저에 있던(=상대방의
// 체크가 반영되기 전) 오래된 전체 배열로 서버 데이터를 덮어써서 상대방의 체크가 사라지는
// 문제가 있었습니다.
//
// 이 API는 레이드 체크 상태를 Redis 해시(loa_raidchecks) 하나에 "캐릭터ID::레이드ID" 필드
// 단위로 저장합니다. HSET/HDEL은 그 필드 하나만 건드리는 원자적(atomic) 연산이라, 여러 명이
// 동시에 서로 다른 체크박스를 눌러도 서로의 기록을 덮어쓰지 않습니다.

const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const HASH_KEY = 'loa_raidchecks';

async function redisCommand(cmd) {
  const r = await fetch(REST_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  const data = await r.json();
  if (!r.ok || data.error) throw new Error(data.error || 'redis command failed');
  return data.result;
}

function fieldKey(charId, raidId) {
  return `${charId}::${raidId}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (!REST_URL || !REST_TOKEN) {
    res.status(500).json({
      error: 'Redis 연결 정보가 없습니다. Vercel 프로젝트에 Upstash Redis 연동을 먼저 완료해주세요.'
    });
    return;
  }

  try {
    if (req.method === 'GET') {
      // 전체 체크 상태를 한 번에 내려줍니다: { [charId]: { [raidId]: {tier, gold} } }
      const flat = await redisCommand(['HGETALL', HASH_KEY]); // [field1, value1, field2, value2, ...]
      const out = {};
      if (Array.isArray(flat)) {
        for (let i = 0; i < flat.length; i += 2) {
          const field = flat[i];
          const sep = field.indexOf('::');
          if (sep === -1) continue;
          const charId = field.slice(0, sep);
          const raidId = field.slice(sep + 2);
          if (!charId || !raidId) continue;
          try {
            if (!out[charId]) out[charId] = {};
            out[charId][raidId] = JSON.parse(flat[i + 1]);
          } catch (e) { /* 손상된 값은 건너뜁니다 */ }
        }
      }
      res.status(200).json({ value: out });
      return;
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { charId, raidId, clear } = body || {};
      if (!charId || !raidId) {
        res.status(400).json({ error: 'charId, raidId가 필요합니다.' });
        return;
      }
      const field = fieldKey(charId, raidId);
      if (clear) {
        await redisCommand(['HDEL', HASH_KEY, field]);
      } else {
        const tier = body.tier;
        const gold = !!body.gold;
        await redisCommand(['HSET', HASH_KEY, field, JSON.stringify({ tier, gold })]);
      }
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === 'DELETE') {
      // 주간 초기화 등, 특정 캐릭터(들)의 체크를 한 번에 지울 때 사용합니다.
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { charId, allCharIds } = body || {};
      const targetIds = Array.isArray(allCharIds) ? allCharIds : (charId ? [charId] : null);
      if (!targetIds || !targetIds.length) {
        res.status(400).json({ error: 'charId 또는 allCharIds가 필요합니다.' });
        return;
      }
      const flat = await redisCommand(['HGETALL', HASH_KEY]);
      const fieldsToDelete = [];
      if (Array.isArray(flat)) {
        for (let i = 0; i < flat.length; i += 2) {
          const field = flat[i];
          const sep = field.indexOf('::');
          const cId = sep === -1 ? null : field.slice(0, sep);
          if (cId && targetIds.includes(cId)) fieldsToDelete.push(field);
        }
      }
      if (fieldsToDelete.length) {
        await redisCommand(['HDEL', HASH_KEY, ...fieldsToDelete]);
      }
      res.status(200).json({ ok: true, cleared: fieldsToDelete.length });
      return;
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    res.status(500).json({ error: '서버 오류: ' + err.message });
  }
}
