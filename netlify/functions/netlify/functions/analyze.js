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
          model: 'claude-haiku-4-5-20251001', temperature: 0,
          max_tokens: 300,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: content } },
            { type: 'text', text: 'Read this product label. Return ONLY compact JSON, no markdown: {"detectedCategory":"personal|household|outdoor","ingredients":"comma-separated ingredient list"}. For ingredients: list every named substance shown, including active ingredients and any named inactive or other ingredients, in label order. Include a generic entry such as "Other Ingredients" only if the label shows one and names no substances for it. Do not include percentages, weights, or warning text. For detectedCategory: personal = skincare, hair, body, cosmetics, oral care; household = cleaning, laundry, dish soap, air freshener, surface disinfectant; outdoor = ANY insecticide, insect repellent, insect killer, pest control, garden, lawn, pool, or automotive product, including ones used indoors such as ant, roach, fly, or wasp sprays. If no ingredient list is visible, use an empty string.' }
          ]}]
        })
      });
      const d = await r.json();
      const raw = (d.content && d.content[0] && d.content[0].text || '').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'').trim();
      let extractedText = raw, detectedCategory = null;
      try {
        const j = JSON.parse(raw);
        if (j && typeof j.ingredients === 'string') extractedText = j.ingredients.trim();
        if (['personal','household','outdoor'].includes(j.detectedCategory)) detectedCategory = j.detectedCategory;
      } catch(e) { /* fall back to raw text */ }
      return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ extractedText, detectedCategory }) };
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

  const sys = 'Return ONLY a JSON object. No markdown. Structure: {"productName":null,"detectedCategory":"personal|household|outdoor","ingredients":[{"name":"","inci":"","safety":"safe","category":[],"description":"","benefits":[],"concerns":[],"comedogenic":0,"pregnancySafe":true,"bannedRegions":[],"ewgScore":1}],"summary":{"overallSafety":"safe","safeCount":0,"cautionCount":0,"flagCount":0,"topConcerns":[],"pregnancyNote":"","safetyNote":""}} Rules: detectedCategory = the category this product actually belongs to (personal = skincare/hair/body/cosmetics/oral care, household = cleaning/laundry/dish/air care/surface disinfectant, outdoor = any insecticide, insect repellent or killer, pest control, garden, lawn, pool or automotive product, including indoor-use bug sprays), regardless of the category given. safety=safe/caution/flag, max 2 benefits/concerns, descriptions under 12 words, max 2 tags, bannedRegions max 2. Output compact single-line JSON with no whitespace between tokens.';

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', temperature: 0, max_tokens: 2000, system: sys, messages: [{ role: 'user', content: userMsg }] })
    });

    if (!r.ok) {
      const e = await r.text();
      return { statusCode: 500, body: JSON.stringify({ error: 'API: ' + e.slice(0, 100) }) };
    }

    const d = await r.json();
    if (d.stop_reason === 'max_tokens') {
      return { statusCode: 500, body: JSON.stringify({ error: 'The ingredient list was too long to analyze in one pass. Please try a shorter list.' }) };
    }
    const txt = (d.content && d.content[0] && d.content[0].text || '').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'').trim();

    let parsed;
    try { parsed = JSON.parse(txt); }
    catch(e) { return { statusCode: 500, body: JSON.stringify({ error: 'We could not read the analysis results. Please try again.' }) }; }

    return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(parsed) };

  } catch(e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
