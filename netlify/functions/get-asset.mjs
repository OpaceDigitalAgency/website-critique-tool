import { getStore } from "@netlify/blobs";

// API version for cache busting
const API_VERSION = "2.1.1";

export default async (req, context) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  let projectId = 'unknown';
  let assetPath = 'unknown';

  try {
    const url = new URL(req.url);
    // Extract projectId and path from URL: /api/asset/:projectId/*
    const pathMatch = url.pathname.match(/\/api\/asset\/([^\/]+)\/(.+)/);

    if (!pathMatch) {
      return new Response(JSON.stringify({ error: "Invalid asset path" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    projectId = pathMatch[1];
    assetPath = pathMatch[2];

    try {
      assetPath = decodeURIComponent(assetPath);
    } catch (error) {
      return new Response(JSON.stringify({ error: "Invalid asset path encoding" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const assetKey = `${projectId}/${assetPath}`;
    console.log(`[GET-ASSET] Fetching asset: ${assetKey}`);

    const assetsStore = getStore("assets");
    const { data, metadata } = await assetsStore.getWithMetadata(assetKey, { type: "arrayBuffer" });

    if (!data) {
      console.error(`[GET-ASSET] Asset not found: ${assetKey}`);
      return new Response(JSON.stringify({ error: "Asset not found", assetKey }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const contentType = metadata?.contentType || "application/octet-stream";
    console.log(`[GET-ASSET] Serving asset: ${assetKey}, contentType: ${contentType}, size: ${data.byteLength}`);

    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000",
        ...corsHeaders,
      },
    });

  } catch (error) {
    console.error("[GET-ASSET] Error:", error);
    console.error("[GET-ASSET] Stack:", error.stack);
    return new Response(JSON.stringify({
      error: error.message,
      stack: error.stack,
      projectId,
      assetPath: assetPath || 'undefined'
    }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

export const config = {
  path: "/api/asset/:projectId/*",
};
