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

    // Fetch 5 pages of 10 results each to get ~50 total
    let allHits = [];
    const pageSize = 10;
    const numPages = 5;

    for (let page = 0; page < numPages; page++) {
      // Random delay before each request (except first)
      if (page > 0) {
        await randomDelay();
      }

      const offset = page * pageSize;
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
                params: `query=${keyword}&hitsPerPage=${pageSize}&offset=${offset}`,
              },
            ],
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`TPT API returned ${response.status} on page ${page}`);
      }

      const data = await response.json();

      if (data.results && data.results[0] && data.results[0].hits) {
        allHits = allHits.concat(data.results[0].hits);
      }

      // Stop early if we got fewer results than requested (end of results)
      if (!data.results || !data.results[0] || data.results[0].hits.length < pageSize) {
        break;
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
