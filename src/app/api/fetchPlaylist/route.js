import { NextResponse } from 'next/server';

// Forces the extremely fast Edge runtime, preventing standard 10s timeouts on big playlists
export const runtime = 'edge'; 

const API_KEY = process.env.YOUTUBE_API_KEY;

async function fetchChannelHandlesForIds(channelIds = [], apiKey) {
  const map = {}; 
  if (!channelIds || channelIds.length === 0) return map;

  const CHUNK_SIZE = 50;
  for (let i = 0; i < channelIds.length; i += CHUNK_SIZE) {
    const chunk = channelIds.slice(i, i + CHUNK_SIZE);
    const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${chunk.join(',')}&key=${apiKey}`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      (data.items || []).forEach(ch => {
        map[ch.id] = ch.snippet?.customUrl || null;
      });
    } catch (err) {
      console.error("Error fetching channels:", err);
    }
  }
  return map;
}

export async function GET(request) {
  if (!API_KEY) {
    return NextResponse.json({ error: "No YouTube API key configured." }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const playlistId = searchParams.get('playlistId');

  if (!playlistId) {
    return NextResponse.json({ error: "Missing playlistId parameter" }, { status: 400 });
  }

  const encoder = new TextEncoder();

  // Create a stream that stays open while we loop through YouTube pages
  const stream = new ReadableStream({
    async start(controller) {
      let pageToken = '';
      let isFirstPage = true;

      try {
        do {
          let url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&key=${API_KEY}`;
          if (pageToken) url += `&pageToken=${pageToken}`;

          const res = await fetch(url);
          const data = await res.json();

          if (!res.ok) {
            controller.enqueue(encoder.encode(JSON.stringify({ error: data.error?.message || "YouTube API error" }) + '\n'));
            break;
          }

          // Only fetch the playlist name on the first loop
          let playlistTitle = null;
          let playlistChannelTitle = null;
          if (isFirstPage) {
            const playlistApiUrl = `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${playlistId}&key=${API_KEY}`;
            const playlistResp = await fetch(playlistApiUrl);
            const playlistData = await playlistResp.json();
            
            if (playlistData.items && playlistData.items.length > 0) {
              playlistTitle = playlistData.items[0].snippet?.title || null;
              playlistChannelTitle = playlistData.items[0].snippet?.channelTitle || null;
            }
            isFirstPage = false;
          }

          // Format data
          const itemsRaw = (data.items || []).map(item => ({
            videoId: item.snippet?.resourceId?.videoId,
            title: item.snippet?.title,
            channelTitle: item.snippet?.videoOwnerChannelTitle,
            channelId: item.snippet?.videoOwnerChannelId,
            description: item.snippet?.description || '',
            thumbnailUrl: item.snippet?.thumbnails?.medium?.url,
            videoUrl: item.snippet?.resourceId?.videoId
              ? `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`
              : null
          })).filter(item => item.videoId && item.title);

          const channelIds = [...new Set(itemsRaw.map(i => i.channelId).filter(Boolean))];
          const channelHandleMap = await fetchChannelHandlesForIds(channelIds, API_KEY);

          const items = itemsRaw.map(it => ({
            ...it,
            channelHandle: it.channelId ? (channelHandleMap[it.channelId] || null) : null
          }));

          // Send this batch immediately to the client
          const chunk = JSON.stringify({
            items,
            nextPageToken: data.nextPageToken || null,
            totalResults: data.pageInfo?.totalResults || 0,
            playlistTitle,
            playlistChannelTitle
          });

          controller.enqueue(encoder.encode(chunk + '\n'));
          
          pageToken = data.nextPageToken;

        } while (pageToken); // Vercel keeps looping server-side until done

        controller.close();
      } catch (err) {
        console.error("Streaming error:", err);
        controller.enqueue(encoder.encode(JSON.stringify({ error: "Internal Server Error" }) + '\n'));
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson', // Newline Delimited JSON
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}