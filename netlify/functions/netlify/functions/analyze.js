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

  const { mode, content, mimeType, category = 'personal' } = body;
  if (!mode || !content) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing mode or content' }) };
  }

  const categoryContext = {
    personal: 'personal care product (skincare, body wash, soap, shampoo, deodorant, sunscreen). Focus on skin safety, parabens, sulfates, fragrances, endocrine disruptors, pregnancy safety.',
    household: 'household product (laundry detergent, dish soap, cleaner, fabric softener). Focus on skin contact safety, respiratory risks, aquatic toxicity, VOCs.',
    outdoor: 'outdoor/garden product (bug spray, weed killer, pesticide). Focus on human/pet/environmental toxicity, carcinogens, neurotoxins, banned substances.'
  };

  const ctx = categoryContext[category] || categoryContext.personal;

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
      { type: 'text', text: 'Extract and analyze the ingredients from this product label. ' + ctx }
    ];
  } else {
    const commas = (content.match(/,/g) || []).length;
    const isName = commas < 3 && content.trim().length < 80;
    if (isName) {
      userMessage = 'Analyze the main ingredients in "' + content + '". ' + ctx;
    } else {
      // Limit to first 10 ingredients to ensure fast response
      const ingList = content.split(',').map(function(s) { return s.trim(); }).filter(Boolean).slice(0, 10);
      userMessage = 'Analyze these ingredients from a ' + ctx + ':\n\n' + ingList.join(', ');
    }
  }

  const systemPrompt = 'You are an expert product safety analyst. Analyze ingredients and return ONLY a valid JSON object with no extra text, no markdown, no code fences.\n\nReturn this exact structure:\n{\n  "productName": "string or null",\n  "extractedIngredientText": "comma separated ingredient list",\n  "ingredients": [\n    {\n      "name": "Common name",\n      "inci": "INCI name",\n      "safety": "safe",\n      "category": ["category"],\n      "description": "One sentence description",\n      "benefits": ["benefit"],\n      "concerns": ["concern"],\n      "comedogenic": 0,\n      "pregnancySafe": true,\n      "bannedRegions": [],\n      "ewgScore": 1\n    }\n  ],\n  "summary": {\n    "overallSafety": "safe",\n    "safeCount": 0,\n    "cautionCount": 0,\n    "flagCount": 0,\n    "topConcerns": [],\n    "pregnancyNote": "string",\n    "safetyNote": "string"\n  }\n}\n\nRules:\n- safety must be: safe, caution, or flag\n- comedogenic: 0-5 scale\n- ewgScore: 1-10 scale\n- pregnancySafe: true, false, or null\n- Keep descriptions to one sentence\n- Maximum 3 items in benefits and concerns arrays\n- Return ONLY the JSON object, nothing else';

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
        max_tokens: 3000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return { statusCode: 500, body: JSON.stringify({ error: 'API error: ' + err }) };
    }

    const data = await response.json();
    const text = data.content[0].text.trim();
    const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch(e) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to parse response', raw: clean.slice(0, 500) }) };
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
