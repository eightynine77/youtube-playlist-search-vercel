export default async function handler(req, res) {
    const { playlistId } = req.query;
    const API_KEY = process.env.YOUTUBE_API_KEY;
  
    if (!playlistId) {
      return res.status(400).json({ error: 'Missing playlistId parameter' });
    }
  
    let allItems = [];
    let nextPageToken = '';
  
    try {
      do {
        const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${encodeURIComponent(playlistId)}&maxResults=50&pageToken=${nextPageToken}&key=${API_KEY}`;
        const response = await fetch(url);

          if (!response.ok) {
  const text = await response.text(); // read raw response
  console.error("Raw error response from YouTube API:", text);
  throw new Error(`YouTube API call failed: ${response.status}`);
}

          
        const data = await response.json();
  
       if (data.error) {
         return res.status(500).json({ error: data.error.message });
       }

          return res.status(200).json({ items: allItems });
  
        allItems = allItems.concat(data.items);
        nextPageToken = data.nextPageToken || '';
      } while (nextPageToken);
  
      res.status(200).json({ items: allItems });
  
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }  
