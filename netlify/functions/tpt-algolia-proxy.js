exports.handler = async (event, context) => {
  // CORS headers for browser requests
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: 'OK',
    };
  }

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const { keyword } = JSON.parse(event.body);
    
    if (!keyword || keyword.trim() === '') {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Keyword required' }),
      };
    }

    const encodedKeyword = encodeURIComponent(keyword).replace(/'/g, '%27');
    
    // Helper function for random delay (0.25s to 2s)
    const randomDelay = () => {
      const ms = Math.random() * 1750 + 250; // 250-2000ms
      return new Promise(resolve => setTimeout(resolve, ms));
    };

    // Strategy: Make requests with keyword variations to get different result sets
    // This works around Algolia's lack of offset-based pagination
    const keywordVariations = [
      keyword,
      `${keyword} activity`,
      `${keyword} worksheet`,
      `${keyword} template`,
      `${keyword} guide`,
      `${keyword} lesson`,
    ];

    let allHits = [];
    const seenKeywords = new Set(); // Track keywords we've already added

    for (let i = 0; i < keywordVariations.length; i++) {
      // Random delay before each request (except first)
      if (i > 0) {
        await randomDelay();
      }

      const variedKeyword = keywordVariations[i];
      const response = await fetch(
        'https://SBEKGJSJ8M-dsn.algolia.net/1/indexes/*/queries',
        {
          method: 'POST',
          headers: {
            'X-Algolia-Application-Id': 'SBEKGJSJ8M',
            'X-Algolia-API-Key': 'ce17b545c6ba0432cf638e0c29ee64ef',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [
              {
                indexName: 'Resource Suggestions',
                params: `query=${variedKeyword}&hitsPerPage=10`,
              },
            ],
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`TPT API returned ${response.status} for variation "${variedKeyword}"`);
      }

      const data = await response.json();

      if (data.results && data.results[0] && data.results[0].hits) {
        // Add only unique keywords (avoid duplicates)
        data.results[0].hits.forEach(hit => {
          if (!seenKeywords.has(hit.query)) {
            allHits.push(hit);
            seenKeywords.add(hit.query);
          }
        });
      }
    }

    if (allHits.length === 0) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ hits: [], message: 'No results found' }),
      };
    }

    const hits = allHits;
    
    // Process hits into our format
    const processed = hits.map((hit) => {
      const supply = hit.Resources?.exact_nb_hits;
      const popularity = hit.popularity || 1;
      const hasSupply = supply != null;
      
      const supplyDisplay = hasSupply ? supply : 'n/a';
      const gaScore = hasSupply ? (supply / popularity).toFixed(2) : 'n/a';
      const demandPer1k = hasSupply && supply > 0 ? ((popularity / supply) * 1000).toFixed(0) : 'n/a';
      const difficulty = hasSupply ? Math.log(supply).toFixed(2) : 'n/a';
      
      return {
        keyword: hit.query,
        popularity,
        supply: supplyDisplay,
        difficulty,
        gaScore,
        demandPer1k,
      };
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
      body: JSON.stringify({
        hits: processed,
        seedTerm: keyword,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    console.error('Proxy error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
