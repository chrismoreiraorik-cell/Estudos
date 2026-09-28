// api/gemini.js
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY não configurada no Vercel. Veja o Passo 9.'
    });
  }

  const { parts, useSearch, jsonMode } = req.body || {};
  if (!parts || !Array.isArray(parts)) {
    return res.status(400).json({ error: 'parts inválido' });
  }

  // Lista de modelos para tentar em ordem (do mais novo ao mais compatível)
  const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash-latest'];

  const baseConfig = {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
  };

  if (useSearch) {
    baseConfig.tools = [{ google_search: {} }];
  } else if (jsonMode) {
    baseConfig.generationConfig.responseMimeType = 'application/json';
  }

  let lastError = null;

  for (const model of MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(baseConfig)
      });
      const data = await r.json();

      if (r.ok && data.candidates) {
        return res.status(200).json(data);
      }

      // Salva o erro e tenta o próximo modelo
      lastError = {
        model,
        status: r.status,
        message: data?.error?.message || JSON.stringify(data).slice(0, 400)
      };

      // Se o erro for por causa do google_search, tenta de novo sem ele
      if (useSearch && data?.error?.message?.toLowerCase().includes('tool')) {
        const fallback = { ...baseConfig };
        delete fallback.tools;
        const r2 = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fallback)
        });
        const data2 = await r2.json();
        if (r2.ok && data2.candidates) {
          return res.status(200).json(data2);
        }
      }
    } catch (err) {
      lastError = { model, status: 0, message: String(err) };
    }
  }

  return res.status(500).json({
    error: 'Falha ao chamar a IA.',
    details: lastError,
    hint: 'Verifique se a chave está correta em aistudio.google.com e se o modelo está liberado para ela.'
  });
};
