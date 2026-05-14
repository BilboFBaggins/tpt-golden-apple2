exports.handler = async (event, context) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const { keyword } = JSON.parse(event.body);
    
    if (!keyword || keyword.trim() === '') {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Keyword required' }),
      };
    }

    const encodedKeyword = encodeURIComponent(keyword).replace(/'/g, '%27');
    
    // Call TPT's Algolia API
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
              params: `query=${keyword}&hitsPerPage=20`,
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`TPT API returned ${response.status}`);
    }

    const data = await response.json();
    
    // Extract and process results
    if (!data.results || !data.results[0] || !data.results[0].hits) {
      return {
        statusCode: 200,
        body: JSON.stringify({ hits: [], message: 'No results found' }),
      };
    }

    const hits = data.results[0].hits;
    
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
      body: JSON.stringify({ error: error.message }),
    };
  }
};
