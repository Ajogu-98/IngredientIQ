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

  // EXTRACT ONLY — fast image OCR, no analysis
  if (extractOnly && mode === 'image') {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: content } },
              { type: 'text', text: 'List only the ingredients from this label as a comma-separated list. No other text.' }
            ]
          }]
        })
      });
      if (!response.ok) return { statusCode: 500, body: JSON.stringify({ error: 'Extract failed' }) };
      const data = await response.json();
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ extractedText: data.content[0].text.trim() })
      };
    } catch(err) {
      return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
  }

  // ANALYZE — text ingredients only
  const catMap = {
    personal: 'skincare/personal care',
    household: 'household cleaner/detergent',
    outdoor: 'outdoor/garden chemical'
  };
  const catLabel = catMap[category] || catMap.personal;

  const commas = (content.match(/,/g) || []).length;
  const isName = commas < 3 && content.trim().length < 80;

  const userMsg = isName
    ? 'List and analyze up to 8 key ingredients in "' + content + '" (' + catLabel + ').'
    : 'Analyze these ' + catLabel + ' ingredients: ' + content;

  const systemPrompt = 'Product safety analyst. Return ONLY valid JSON, no markdown.\n{"productName":null,"detectedProductType":"personal","ingredients":[{"name":"","inci":"","safety":"safe","category":[],"description":"","benefits":[],"concerns":[],"comedogenic":0,"pregnancySafe":true,"bannedRegions":[],"ewgScore":1}],"summary":{"overallSafety":"safe","safeCount":0,"cautionCount":0,"flagCount":0,"topConcerns":[],"pregnancyNote":"","safetyNote":""}}\ndetectedProductType: personal|household|outdoor. safety: safe|caution|flag. Max 2 benefits, 2 concerns. One-sentence descriptions. JSON only.';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMsg }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return { statusCode: 500, body: JSON.stringify({ error: 'API error: ' + err.slice(0, 200) }) };
    }

    const data = await response.json();
    const text = data.content[0].text.trim();
    const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let parsed;
    try { parsed = JSON.parse(clean); }
    catch(e) { return { statusCode: 500, body: JSON.stringify({ error: 'Parse failed: ' + clean.slice(0, 200) }) }; }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(parsed)
    };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
