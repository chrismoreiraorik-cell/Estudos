module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY não configurada.' });

  // Modelos candidatos (do mais novo ao mais antigo)
  const MODELOS = [
    'gemini-3.8-flash',
    'gemini-3.5-flash',
    'gemini-2.5-flash-latest',
    'gemini-flash-latest',
    'gemini-2.0-flash-001'
  ];
  const VERSOES = ['v1beta', 'v1'];

  // ---- MODO DIAGNÓSTICO (via GET) ----
  if (req.method === 'GET') {
    const resultado = {
      chave_ok: true,
      tamanho_chave: apiKey.length,
      testes: []
    };
    for (const versao of VERSOES) {
      for (const modelo of MODELOS) {
        const url = `https://generativelanguage.googleapis.com/${versao}/models/${modelo}:generateContent?key=${apiKey}`;
        try {
          const r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: 'Responda: OK' }] }],
              generationConfig: { maxOutputTokens: 10 }
            })
          });
          const data = await r.json();
          resultado.testes.push({
            versao, modelo,
            status: r.status,
            ok: r.ok && !!data.candidates,
            resposta: data.candidates?.[0]?.content?.parts?.[0]?.text || null,
            erro: data.error?.message?.slice(0, 120) || null
          });
        } catch (e) {
          resultado.testes.push({ versao, modelo, status: 0, ok: false, erro: String(e).slice(0, 120) });
        }
      }
    }
    return res.status(200).json(resultado);
  }

  // ---- MODO NORMAL (via POST) ----
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  const { parts, useSearch, jsonMode } = req.body || {};
  if (!parts || !Array.isArray(parts)) return res.status(400).json({ error: 'parts inválido' });

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
  };
  if (useSearch) body.tools = [{ google_search: {} }];
  else if (jsonMode) body.generationConfig.responseMimeType = 'application/json';

  let ultimoErro = null;
  for (const versao of VERSOES) {
    for (const modelo of MODELOS) {
      try {
        const url = `https://generativelanguage.googleapis.com/${versao}/models/${modelo}:generateContent?key=${apiKey}`;
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await r.json();
        if (r.ok && data.candidates) return res.status(200).json(data);
        ultimoErro = { versao, modelo, status: r.status, msg: data?.error?.message || 'erro' };
      } catch (e) {
        ultimoErro = { versao, modelo, status: 0, msg: String(e) };
      }
    }
  }
  return res.status(500).json({ error: 'Nenhum modelo respondeu', ultimo_erro: ultimoErro });
};
