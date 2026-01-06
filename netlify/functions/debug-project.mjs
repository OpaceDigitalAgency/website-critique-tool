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
    const projectId = url.searchParams.get("id");

    if (!projectId) {
      return new Response(JSON.stringify({ error: "Project ID required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const assetsStore = getStore("assets");
    const projectsStore = getStore("projects");

    // Get project metadata
    const projectData = await projectsStore.get(projectId, { type: "json" });

    // List all assets for this project
    const { blobs } = await assetsStore.list({ prefix: projectId });

    // Group by type
    const filesByType = {
      html: [],
      css: [],
      js: [],
      images: [],
      fonts: [],
      other: []
    };

    blobs.forEach(blob => {
      const path = blob.key.replace(`${projectId}/`, '');
      const ext = path.split('.').pop()?.toLowerCase();
      
      if (ext === 'html') filesByType.html.push(path);
      else if (ext === 'css') filesByType.css.push(path);
      else if (ext === 'js') filesByType.js.push(path);
      else if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico'].includes(ext)) filesByType.images.push(path);
      else if (['woff', 'woff2', 'ttf', 'eot'].includes(ext)) filesByType.fonts.push(path);
      else filesByType.other.push(path);
    });

    const debug = {
      projectId,
      projectData,
      totalAssets: blobs.length,
      filesByType: {
        html: { count: filesByType.html.length, files: filesByType.html },
        css: { count: filesByType.css.length, files: filesByType.css },
        js: { count: filesByType.js.length, files: filesByType.js },
        images: { count: filesByType.images.length, files: filesByType.images.slice(0, 20) },
        fonts: { count: filesByType.fonts.length, files: filesByType.fonts },
        other: { count: filesByType.other.length, files: filesByType.other.slice(0, 20) }
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
  path: "/api/debug-project",
};

