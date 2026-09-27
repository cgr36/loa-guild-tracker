// 캐릭터 계산기 탭(뭉가 효율 계산 등)에서 쓰는 캐릭터 상세 정보(스탯/각인/아크패시브/장비)를
// 한 번에 모아서 내려주는 엔드포인트. /api/lookup과 마찬가지로 방문자가 직접 등록한
// 개인 API 키(key)를 그대로 로스트아크 API에 전달하는 프록시 역할만 함(CORS 우회 목적).

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { name, key } = req.query;

  if (!name || !key) {
    res.status(400).json({ error: '캐릭터명 또는 API 키가 없습니다.' });
    return;
  }

  const endpoints = ['profiles', 'engravings', 'arkpassive', 'equipment', 'arkgrid', 'combat-skills'];

  try {
    const results = await Promise.all(
      endpoints.map((ep) =>
        fetch(`https://developer-lostark.game.onstove.com/armories/characters/${encodeURIComponent(name)}/${ep}`, {
          headers: { accept: 'application/json', authorization: `bearer ${key}` },
        })
          .then(async (r) => ({ ok: r.ok, status: r.status, data: await r.json().catch(() => null) }))
          .catch(() => ({ ok: false, status: 0, data: null }))
      )
    );

    const [profiles, engravings, arkpassive, equipment, arkgrid, skills] = results;

    if (!profiles.ok || !profiles.data) {
      res.status(profiles.status || 500).json({
        error: (profiles.data && profiles.data.Message) || `로스트아크 API 오류 (status ${profiles.status})`,
      });
      return;
    }

    res.status(200).json({
      profile: profiles.data,
      engravings: engravings.ok ? engravings.data : null,
      arkpassive: arkpassive.ok ? arkpassive.data : null,
      equipment: equipment.ok ? equipment.data : null,
      arkgrid: arkgrid.ok ? arkgrid.data : null,
      skills: skills.ok ? skills.data : null,
    });
  } catch (err) {
    res.status(500).json({ error: '서버 오류: ' + err.message });
  }
}
