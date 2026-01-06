import { getStore } from "@netlify/blobs";

// API version for cache busting
const API_VERSION = "2.0.1";

export default async (req, context) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const projectsStore = getStore("projects");

    let projectsList = [];
    try {
      const list = await projectsStore.get("_list", { type: "json" });
      if (list) projectsList = list;
    } catch (e) {
      // List doesn't exist yet
    }

    return new Response(JSON.stringify({
      projects: projectsList,
      apiVersion: API_VERSION,
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error) {
    console.error("List projects error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

export const config = {
  path: "/api/projects",
};

