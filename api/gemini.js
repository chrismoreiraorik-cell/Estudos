module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.GEMINI_API_KEY;

  // ============ MODO DIAGNÓSTICO (via GET no navegador) ============
  if (req.method === 'GET') {
    const result = {
      passo1_chave_existe: !!apiKey,
      passo1_tamanho_chave: apiKey ? apiKey.length : 0,
      passo1_prefixo_chave: apiKey ? apiKey.slice(0, 6) + '...' : null,
    };

    if (!apiKey) {
      result.erro = 'GEMINI_API_KEY não configurada nas variáveis de ambiente do Vercel.';
      return res.status(200).json(result);
    }

    // Testa quais modelos estão disponíveis
    const testarModelo = async (model) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'Responda apenas: OK' }] }],
            generationConfig: { maxOutputTokens: 10 }
          })
        });
        const data = await r.json();
        return {
          modelo: model,
          status_http: r.status,
          ok: r.ok && !!data.candidates,
          resposta: data.candidates?.[0]?.content?.parts?.[0]?.text || null,
          erro: data.error?.message || null
        };
      } catch (e) {
        return { modelo: model, status_http: 0, ok: false, erro: String(e) };
      }
    };

    result.testes_de_modelo = [];
    for (const m of ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-flash', 'gemini-pro']) {
      result.testes_de_modelo.push(await testarModelo(m));
    }

    return res.status(200).json(result);
  }

  // ============ MODO NORMAL (POST do app) ============
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY não configurada.' });
  }

  const { parts, useSearch, jsonMode } = req.body || {};
  if (!parts || !Array.isArray(parts)) {
    return res.status(400).json({ error: 'parts inválido' });
  }

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
  };
  if (useSearch) body.tools = [{ google_search: {} }];
  else if (jsonMode) body.generationConfig.responseMimeType = 'application/json';

  // Tenta vários modelos até um funcionar
  const modelos = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash-latest'];
  let ultimoErro = null;

  for (const model of modelos) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await r.json();

      if (r.ok && data.candidates) {
        return res.status(200).json(data);
      }
      ultimoErro = { model, status: r.status, msg: data?.error?.message || 'erro desconhecido' };
    } catch (e) {
      ultimoErro = { model, status: 0, msg: String(e) };
    }
  }

  return res.status(500).json({
    error: 'Nenhum modelo do Gemini respondeu.',
    ultimo_erro: ultimoErro
  });
};
