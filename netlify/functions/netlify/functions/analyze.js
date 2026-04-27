exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not set in environment variables' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

  const { mode, content, mimeType, category = 'personal' } = body;
  if (!mode || !content) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing mode or content' }) };
  }

  // Category-specific context for the AI prompt
  const categoryContext = {
    personal: {
      label: 'personal care product (skincare, body wash, soap, shampoo, deodorant, sunscreen, perfume, etc.)',
      notes: 'Focus on skin safety, irritation potential, comedogenic rating, pregnancy safety, and common allergens. Note any parabens, sulfates, synthetic fragrances, or endocrine disruptors.',
      summaryField: 'skinTypeNotes'
    },
    household: {
      label: 'household product (laundry detergent, dish soap, fabric softener, all-purpose cleaner, air freshener, etc.)',
      notes: 'Focus on skin contact safety (residue on clothes/dishes), respiratory concerns, aquatic toxicity, and ingredients that persist on surfaces. Note any optical brighteners, surfactants, preservatives, or VOCs.',
      summaryField: 'usageNotes'
    },
    outdoor: {
      label: 'outdoor or garden product (bug spray, insect repellent, weed killer, pesticide, herbicide, fertilizer, etc.)',
      notes: 'Focus on toxicity to humans, pets, and the environment. Note any carcinogens, neurotoxins, endocrine disruptors, or ingredients banned in certain regions. Highlight EPA registration status where relevant.',
      summaryField: 'usageNotes'
    }
  };

  const ctx = categoryContext[category] || categoryContext.personal;

  // Build message content
  let userMessage;
  if (mode === 'image') {
    userMessage = [
      {
        type: 'image',
        source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: content }
      },
      {
        type: 'text',
        text: `Please read the ingredient list from this ${ctx.label} label image and analyze each ingredient. Extract all ingredients you can see clearly, then analyze them. ${ctx.notes}`
      }
    ];
  } else {
    const lines = content.trim().split(/[\n,]/);
    const isProductName = lines.length <= 3 && content.trim().length < 80;
    userMessage = isProductName
      ? `Analyze the ingredients in this ${ctx.label}: "${content}". If you know this product, list and analyze its ingredients. ${ctx.notes}`
      : `Analyze these ingredients from a ${ctx.label}:\n\n${content}\n\n${ctx.notes}`;
  }

  const systemPrompt = `You are an expert chemist and product safety analyst specializing in consumer product ingredients. Analyze ingredients and return ONLY a valid JSON object with no extra text, markdown, or code blocks.

Return this exact JSON structure:
{
  "productName": "string or null",
  "extractedIngredientText": "raw ingredient list as string",
  "ingredients": [
    {
      "name": "Common name",
      "inci": "INCI/chemical name",
      "safety": "safe|caution|flag",
      "category": ["array", "of", "categories"],
      "description": "Brief description of what this ingredient is and does in the product",
      "benefits": ["benefit 1", "benefit 2"],
      "concerns": ["concern 1", "concern 2"],
      "comedogenic": 0,
      "pregnancySafe": true,
      "bannedRegions": [],
      "ewgScore": 1
    }
  ],
  "summary": {
    "overallSafety": "safe|caution|flag",
    "safeCount": 0,
    "cautionCount": 0,
    "flagCount": 0,
    "topConcerns": ["concern 1", "concern 2"],
    "skinTypeNotes": "Notes about skin suitability or usage recommendations",
    "usageNotes": "Notes about safe usage, ventilation needs, protective equipment, etc.",
    "pregnancyNote": "Overall pregnancy/child safety note",
    "safetyNote": "General safety recommendations"
  }
}

Safety ratings:
- safe: Generally recognized as safe, well-studied with minimal concerns
- caution: Some concerns, worth being aware of (e.g. fragrances, certain surfactants, mild irritants)
- flag: Known hazards, carcinogens, neurotoxins, endocrine disruptors, banned ingredients, or strong irritants/allergens

comedogenic: 0-5 scale (0=non-comedogenic, 5=highly comedogenic) — use 0 for non-skincare products
ewgScore: 1-10 (1=safest, 10=highest concern)
pregnancySafe: true, false, or null if unknown/not applicable

Return ONLY the JSON. No explanation, no markdown, no code fences.`;

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
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return { statusCode: 500, body: JSON.stringify({ error: `Anthropic API error: ${err}` }) };
    }

    const data = await response.json();
    const text = data.content[0].text.trim();
    const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let parsed;
    try { parsed = JSON.parse(clean); }
    catch {
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to parse AI response as JSON', raw: clean.slice(0, 500) }) };
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
