import { NextResponse } from 'next/server';

// Forces the extremely fast Edge runtime, preventing standard 10s timeouts on big playlists
export const runtime = 'edge'; 

const API_KEY = process.env.YOUTUBE_API_KEY;

async function fetchChannelHandlesForIds(channelIds = [], apiKey, handleCache) {
  if (!channelIds || channelIds.length === 0) return;

  // Only request channel IDs that we have not already seen
  // during this playlist request.
  const missingIds = [
    ...new Set(channelIds.filter(Boolean))
  ].filter(channelId => !handleCache.has(channelId));

  if (missingIds.length === 0) return;

  const CHUNK_SIZE = 50;

  const chunks = [];

  for (let i = 0; i < missingIds.length; i += CHUNK_SIZE) {
    chunks.push(missingIds.slice(i, i + CHUNK_SIZE));
  }

  // Fetch all required channel chunks in parallel.
  await Promise.all(
    chunks.map(async (chunk) => {
      const url =
        `https://www.googleapis.com/youtube/v3/channels` +
        `?part=snippet` +
        `&id=${chunk.join(',')}` +
        `&fields=items(id,snippet(customUrl))` +
        `&key=${apiKey}`;

      try {
        const res = await fetch(url);

        if (!res.ok) return;

        const data = await res.json();

        (data.items || []).forEach(ch => {
          // Store null too. This means we won't repeatedly ask
          // YouTube about a channel that has no custom URL.
          handleCache.set(
            ch.id,
            ch.snippet?.customUrl || null
          );
        });
      } catch (err) {
        console.error("Error fetching channels:", err);
      }
    })
  );
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
      // Keeps channel handles we've already retrieved during
      // this playlist request.
      const channelHandleCache = new Map();

      const fetchPlaylistPage = async (token = '') => {
      let url =
        `https://www.googleapis.com/youtube/v3/playlistItems` +
        `?part=snippet` +
        `&maxResults=50` +
        `&playlistId=${playlistId}` +
        `&fields=` +
        `nextPageToken,` +
        `pageInfo(totalResults),` +
        `items(` +
          `snippet(` +
            `title,` +
            `description,` +
            `videoOwnerChannelTitle,` +
            `videoOwnerChannelId,` +
            `resourceId(videoId),` +
            `thumbnails(medium(url))` +
          `)` +
        `)` +
        `&key=${API_KEY}`;

      if (token) {
        url += `&pageToken=${token}`;
      }

      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.error?.message || "YouTube API error"
        );
      }

      return data;
    };

    const fetchPlaylistMetadata = async () => {
      const url =
        `https://www.googleapis.com/youtube/v3/playlists` +
        `?part=snippet` +
        `&id=${playlistId}` +
        `&fields=items(snippet(title,channelTitle))` +
        `&key=${API_KEY}`;

      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.error?.message || "YouTube API error"
        );
      }

      return data;
    };

    try {
          let data;
          let playlistTitle = null;
          let playlistChannelTitle = null;

          // ========================================================================
          // FIRST PAGE + PLAYLIST METADATA IN PARALLEL
          // ========================================================================

          const firstPagePromise = fetchPlaylistPage('');
          const playlistMetadataPromise = fetchPlaylistMetadata();

          let playlistMetadataResult;
          
          [data, playlistMetadataResult] = await Promise.all([
            firstPagePromise,
            playlistMetadataPromise
          ]);

          const playlistInfo = playlistMetadataResult.items?.[0];

          if (playlistInfo) {
            playlistTitle =
              playlistInfo.snippet?.title || null;

            playlistChannelTitle =
              playlistInfo.snippet?.channelTitle || null;
          }

          // ========================================================================
          // PROCESS PAGES
          // ========================================================================

          while (true) {

            // ----------------------------------------------------------------------
            // FORMAT CURRENT PAGE
            // ----------------------------------------------------------------------

            const itemsRaw = (data.items || [])
              .map(item => ({
                videoId: item.snippet?.resourceId?.videoId,
                title: item.snippet?.title,
                channelTitle: item.snippet?.videoOwnerChannelTitle,
                channelId: item.snippet?.videoOwnerChannelId,
                description: item.snippet?.description || '',
                thumbnailUrl: item.snippet?.thumbnails?.medium?.url,
                videoUrl: item.snippet?.resourceId?.videoId
                  ? `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`
                  : null
              }))
              .filter(item => item.videoId && item.title);

            const channelIds = [
              ...new Set(
                itemsRaw
                  .map(item => item.channelId)
                  .filter(Boolean)
              )
            ];

            // ----------------------------------------------------------------------
            // PIPELINE:
            //
            // Start BOTH operations without waiting for either.
            //
            // 1. Get channel handles for the current page.
            // 2. Fetch the next playlist page.
            // ----------------------------------------------------------------------

            const channelHandlePromise =
              fetchChannelHandlesForIds(
                channelIds,
                API_KEY,
                channelHandleCache
              );

            const nextPageToken =
              data.nextPageToken || null;

            const nextPagePromise = nextPageToken
              ? fetchPlaylistPage(nextPageToken)
              : null;

            // ----------------------------------------------------------------------
            // WAIT FOR CURRENT PAGE'S CHANNEL HANDLES
            // ----------------------------------------------------------------------

            await channelHandlePromise;

            // ----------------------------------------------------------------------
            // ADD CHANNEL HANDLES TO ITEMS
            // ----------------------------------------------------------------------

            const items = itemsRaw.map(item => ({
              ...item,
              channelHandle: item.channelId
                ? (channelHandleCache.get(item.channelId) || null)
                : null
            }));

            // ----------------------------------------------------------------------
            // SEND CURRENT PAGE TO CLIENT
            // ----------------------------------------------------------------------

            const chunk = JSON.stringify({
              items,
              nextPageToken,
              totalResults: data.pageInfo?.totalResults || 0,
              playlistTitle: playlistTitle,
              playlistChannelTitle: playlistChannelTitle
            });

            controller.enqueue(
              encoder.encode(chunk + '\n')
            );

            // ----------------------------------------------------------------------
            // FINISHED?
            // ----------------------------------------------------------------------

            if (!nextPagePromise) {
              break;
            }

            // The next page has already been requested while we were processing
            // the current page.
            data = await nextPagePromise;

            // Only expose playlist metadata on the first page.
            playlistTitle = null;
            playlistChannelTitle = null;
          }

        controller.close();
      } catch (err) {
        console.error("Streaming error:", err);
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              error: err.message || "Internal Server Error"
            }) + '\n'
          )
        );
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