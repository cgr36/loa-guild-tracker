// Vercel Cron이 매주 수요일 오전 6시(KST)에 호출하여, 수동 초기화 버튼과 동일한 동작
// (레이드 체크/골드 초기화)을 자동으로 수행합니다.
//
// 같은 주에 중복 실행되지 않도록 loa_guild-meta의 resetWeekKey로 멱등성을 보장합니다.
// (Vercel Cron이 드물게 중복 호출되거나, 수동으로 다시 호출되어도 같은 주라면 건너뜁니다.)

const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const CHARACTERS_KEY = 'loa_characters';
const GUILD_META_KEY = 'loa_guild-meta';
const RAIDCHECKS_KEY = 'loa_raidchecks';

async function redisCommand(cmd) {
  const r = await fetch(REST_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const data = await r.json();
  if (!r.ok || data.error) throw new Error(data.error || 'redis command failed');
  return data.result;
}

async function getJson(key, fallback) {
  const result = await redisCommand(['GET', key]);
  if (!result) return fallback;
  try {
    return JSON.parse(result);
  } catch (e) {
    return fallback;
  }
}

async function setJson(key, value) {
  await redisCommand(['SET', key, JSON.stringify(value)]);
}

// index.html의 getResetWeekKey()와 동일한 로직입니다.
// "지금(now) 기준, 가장 최근에 지나간 수요일 오전 6시(KST)"를 구합니다.
function getResetWeekKey(d) {
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  const day = kst.getUTCDay();
  const hours = kst.getUTCHours();
  let diffDays = (day - 3 + 7) % 7;
  if (diffDays === 0 && hours < 6) diffDays = 7;
  const resetDate = new Date(kst.getTime() - diffDays * 86400000);
  resetDate.setUTCHours(6, 0, 0, 0);
  return resetDate.toISOString();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (!REST_URL || !REST_TOKEN) {
    res.status(500).json({ error: 'Redis 연결 정보가 없습니다.' });
    return;
  }

  try {
    const weekKey = getResetWeekKey(new Date());
    const guildMeta = await getJson(GUILD_META_KEY, { resetWeekKey: '' });

    if (guildMeta.resetWeekKey === weekKey) {
      res.status(200).json({ ok: true, skipped: true, weekKey });
      return;
    }

    const characters = await getJson(CHARACTERS_KEY, []);
    characters.forEach((c) => {
      c.raids = {};
    });
    await setJson(CHARACTERS_KEY, characters);

    await redisCommand(['DEL', RAIDCHECKS_KEY]);

    guildMeta.resetWeekKey = weekKey;
    await setJson(GUILD_META_KEY, guildMeta);

    res.status(200).json({ ok: true, skipped: false, weekKey, resetCharacters: characters.length });
  } catch (err) {
    res.status(500).json({ error: '서버 오류: ' + err.message });
  }
}
