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
    const projectsStore = getStore("projects");
    const assetsStore = getStore("assets");

    // List all projects
    const { blobs: projectBlobs } = await projectsStore.list();
    
    // Get _list
    let projectsList = [];
    try {
      const list = await projectsStore.get("_list", { type: "json" });
      if (list) projectsList = list;
    } catch (e) {}

    // List all assets (first 100)
    const { blobs: assetBlobs } = await assetsStore.list();

    const debug = {
      timestamp: new Date().toISOString(),
      projectsStore: {
        totalBlobs: projectBlobs.length,
        blobs: projectBlobs.map(b => ({ key: b.key, size: b.size })),
        _list: projectsList
      },
      assetsStore: {
        totalBlobs: assetBlobs.length,
        blobs: assetBlobs.slice(0, 100).map(b => ({ key: b.key, size: b.size }))
      }
    };

    return new Response(JSON.stringify(debug, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error) {
    console.error("Debug error:", error);
    return new Response(JSON.stringify({ error: error.message, stack: error.stack }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

export const config = {
  path: "/api/debug-blobs",
};

