// 이 함수는 Vercel 서버에서 실행되며, "다같이 보는 데이터"(캐릭터 목록, 레이드 목록 등)를
// Upstash Redis(진짜 서버 저장소)에 저장하고 불러옵니다.
// Vercel 프로젝트에 Upstash Redis 연동을 완료하면 아래 환경변수가 자동으로 생깁니다.

const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

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

  const rawKey = req.method === 'GET' ? req.query.key : (req.body && req.body.key);
  if (!rawKey) {
    res.status(400).json({ error: 'key가 필요합니다.' });
    return;
  }
  const redisKey = 'loa_' + rawKey;

  try {
    if (req.method === 'GET') {
      const r = await fetch(`${REST_URL}/get/${encodeURIComponent(redisKey)}`, {
        headers: { Authorization: `Bearer ${REST_TOKEN}` }
      });
      const data = await r.json();
      let value = null;
      if (data && data.result) {
        try { value = JSON.parse(data.result); } catch (e) { value = data.result; }
      }
      res.status(200).json({ value });
      return;
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const value = JSON.stringify(body.value);
      const r = await fetch(`${REST_URL}/set/${encodeURIComponent(redisKey)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'text/plain' },
        body: value
      });
      if (!r.ok) {
        const errData = await r.json().catch(() => ({}));
        res.status(500).json({ error: errData.error || 'Redis 저장 실패' });
        return;
      }
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    res.status(500).json({ error: '서버 오류: ' + err.message });
  }
}
