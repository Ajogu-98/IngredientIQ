exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

  const { mode, content, mimeType, category = 'personal', extractOnly = false } = body;
  if (!mode || !content) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing mode or content' }) };
  }

  // EXTRACT ONLY — image OCR
  if (extractOnly && mode === 'image') {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: content } },
            { type: 'text', text: 'List only the ingredients from this product label as a plain comma-separated list. Nothing else.' }
          ]}]
        })
      });
      const d = await r.json();
      return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ extractedText: d.content[0].text.trim() }) };
    } catch(e) {
      return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
    }
  }

  // ANALYZE
  const commas = (content.match(/,/g) || []).length;
  const isName = commas < 3 && content.trim().length < 80;
  const userMsg = isName
    ? 'Analyze up to 8 key ingredients of "' + content + '". Category: ' + category
    : 'Analyze these ingredients (' + category + '): ' + content;

  const sys = 'Return ONLY a JSON object. No markdown. Structure: {"productName":null,"ingredients":[{"name":"","inci":"","safety":"safe","category":[],"description":"","benefits":[],"concerns":[],"comedogenic":0,"pregnancySafe":true,"bannedRegions":[],"ewgScore":1}],"summary":{"overallSafety":"safe","safeCount":0,"cautionCount":0,"flagCount":0,"topConcerns":[],"pregnancyNote":"","safetyNote":""}} Rules: safety=safe/caution/flag, max 2 benefits/concerns, brief descriptions.';

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1500, system: sys, messages: [{ role: 'user', content: userMsg }] })
    });

    if (!r.ok) {
      const e = await r.text();
      return { statusCode: 500, body: JSON.stringify({ error: 'API: ' + e.slice(0, 100) }) };
    }

    const d = await r.json();
    const txt = d.content[0].text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'').trim();

    let parsed;
    try { parsed = JSON.parse(txt); }
    catch(e) { return { statusCode: 500, body: JSON.stringify({ error: 'Parse error: ' + txt.slice(0,100) }) }; }

    return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(parsed) };

  } catch(e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
