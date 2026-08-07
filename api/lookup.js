// 이 파일은 브라우저가 아니라 Vercel의 서버에서 실행됩니다.
// 그래서 로스트아크 API를 직접 호출해도 CORS에 걸리지 않습니다.
// 흐름: 브라우저(index.html) -> 이 함수(/api/lookup) -> 로스트아크 API -> 이 함수 -> 브라우저

export default async function handler(req, res) {
  // 우리 페이지(브라우저)가 이 함수를 호출할 수 있도록 허용
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

  try {
    const lostarkRes = await fetch(
      `https://developer-lostark.game.onstove.com/armories/characters/${encodeURIComponent(name)}/profiles`,
      {
        headers: {
          accept: 'application/json',
          authorization: `bearer ${key}`,
        },
      }
    );

    const data = await lostarkRes.json();

    if (!lostarkRes.ok) {
      res.status(lostarkRes.status).json({
        error: data?.Message || `로스트아크 API 오류 (status ${lostarkRes.status})`,
      });
      return;
    }

    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: '서버 오류: ' + err.message });
  }
}
