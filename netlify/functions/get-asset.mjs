import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

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

    const projectId = pathMatch[1];
    let assetPath = pathMatch[2];

    try {
      assetPath = decodeURIComponent(assetPath);
    } catch (error) {
      return new Response(JSON.stringify({ error: "Invalid asset path encoding" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const assetKey = `${projectId}/${assetPath}`;

    const assetsStore = getStore("assets");
    const { data, metadata } = await assetsStore.getWithMetadata(assetKey, { type: "arrayBuffer" });

    if (!data) {
      return new Response(JSON.stringify({ error: "Asset not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const contentType = metadata?.contentType || "application/octet-stream";

    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000",
        ...corsHeaders,
      },
    });

  } catch (error) {
    console.error("Get asset error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

export const config = {
  path: "/api/asset/:projectId/*",
};
