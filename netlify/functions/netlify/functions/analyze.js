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
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { mode, content, mimeType, category = 'personal' } = body;
  if (!mode || !content) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing mode or content' }) };
  }

  const categoryNotes = {
    personal: 'Focus on: skin safety, irritation, parabens, sulfates, fragrances, endocrine disruptors, pregnancy safety, comedogenic rating.',
    household: 'Focus on: skin contact safety, respiratory risks, aquatic toxicity, VOCs, optical brighteners, surfactants.',
    outdoor: 'Focus on: human/pet/environmental toxicity, carcinogens, neurotoxins, banned substances, EPA status.'
  };

  const notes = categoryNotes[category] || categoryNotes.personal;

  let userMessage;
  if (mode === 'image') {
    userMessage = [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: (mimeType && mimeType.startsWith('image/') && !mimeType.includes('heic') && !mimeType.includes('heif')) ? mimeType : 'image/jpeg',
          data: content
        }
      },
      { type: 'text', text: `Extract and analyze all ingredients from this product label. ${notes}` }
    ];
  } else {
    const commas = (content.match(/,/g) || []).length;
    const isName = commas < 3 && content.trim().length < 80;
    userMessage = isName
      ? `List and analyze the ingredients in "${content}". ${notes}`
      : `Analyze these ingredients: ${content}\n${notes}`;
  }

  // Compact prompt — less text = faster response = no timeout
  const systemPrompt = `You are a product safety analyst. Return ONLY valid JSON, no markdown, no code fences.

JSON structure:
{"productName":null,"extractedIngredientText":"","ingredients":[{"name":"","inci":"","safety":"safe|caution|flag","category":[],"description":"","benefits":[],"concerns":[],"comedogenic":0,"pregnancySafe":true,"bannedRegions":[],"ewgScore":1}],"summary":{"overallSafety":"safe","safeCount":0,"cautionCount":0,"flagCount":0,"topConcerns":[],"skinTypeNotes":"","usageNotes":"","pregnancyNote":"","safetyNote":""}}

Rules:
- safety: safe=well studied/safe, caution=mild concerns, flag=hazardous/banned/carcinogen
- comedogenic: 0-5 (0=none, 5=highly)
- ewgScore: 1-10 (1=safest)
- pregnancySafe: true/false/null
- Keep descriptions under 20 words
- Keep benefits/concerns arrays to max 3 items each
- Return ONLY the JSON object`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return { statusCode: 500, body: JSON.stringify({ error: `API error: ${err}` }) };
    }

    const data = await response.json();
    const text = data.content[0].text.trim();
    const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let parsed;
    try { parsed = JSON.parse(clean); }
    catch {
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to parse response', raw: clean.slice(0, 300) }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(parsed)
    };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
