import { NextResponse } from 'next/server';

// This runs securely on Vercel's backend. The key will NEVER be seen by the browser.
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

  // Extract parameters from the request URL
  const { searchParams } = new URL(request.url);
  const playlistId = searchParams.get('playlistId');
  const pageToken = searchParams.get('pageToken');

  if (!playlistId) {
    return NextResponse.json({ error: "Missing playlistId parameter" }, { status: 400 });
  }

  let url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&key=${API_KEY}`;
  
  if (pageToken && pageToken !== 'START') {
    url += `&pageToken=${pageToken}`;
  }

  let playlistTitle = null;
  let playlistChannelTitle = null;

  // Only fetch the playlist name on the first page load
  if (!pageToken || pageToken === 'START') {
    const playlistApiUrl = `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${playlistId}&key=${API_KEY}`;
    try {
      const playlistResp = await fetch(playlistApiUrl);
      const playlistData = await playlistResp.json();
      
      if (playlistData.items && playlistData.items.length > 0) {
        playlistTitle = playlistData.items[0].snippet?.title || null;
        playlistChannelTitle = playlistData.items[0].snippet?.channelTitle || null;
      }
    } catch (err) {
      console.error("Error fetching playlist metadata:", err);
    }
  }

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json({ error: data.error?.message || "YouTube API error" }, { status: res.status });
    }

    // Format data exactly as your old script did
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

    return NextResponse.json({
      items,
      nextPageToken: data.nextPageToken || null,
      totalResults: data.pageInfo?.totalResults || 0,
      playlistTitle: playlistTitle,
      playlistChannelTitle: playlistChannelTitle
    });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}