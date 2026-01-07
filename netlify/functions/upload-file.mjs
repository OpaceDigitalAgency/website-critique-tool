import { getStore } from "@netlify/blobs";

// Version for cache busting
const API_VERSION = "2.0.8";

export default async (req, context) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const formData = await req.formData();
    const projectId = formData.get("projectId");
    const filePath = formData.get("path");
    const file = formData.get("file");
    const contentType = formData.get("contentType") || "application/octet-stream";
    const isHtml = formData.get("isHtml") === "true";

    console.log(`[UPLOAD-FILE] Received request for: ${filePath}`);
    console.log(`[UPLOAD-FILE] ContentType: ${contentType}, isHtml: ${isHtml}`);
    console.log(`[UPLOAD-FILE] File type: ${typeof file}, File size: ${typeof file === 'string' ? file.length : file?.size || 'unknown'}`);

    if (!projectId || !filePath || !file) {
      console.error(`[UPLOAD-FILE] Missing fields - projectId: ${!!projectId}, filePath: ${!!filePath}, file: ${!!file}`);
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const assetsStore = getStore("assets");

    // Get project (validation only)
    const projectsStore = getStore("projects");
    const projectData = await projectsStore.get(projectId, { type: "json" });
    if (!projectData) {
      return new Response(JSON.stringify({ error: "Project not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const assetKey = `${projectId}/${filePath}`;

    // Store the file
    if (typeof file === "string") {
      await assetsStore.set(assetKey, file, { metadata: { contentType } });
    } else {
      const arrayBuffer = await file.arrayBuffer();
      await assetsStore.set(assetKey, new Uint8Array(arrayBuffer), { metadata: { contentType } });
    }

    return new Response(JSON.stringify({
      success: true,
      assetKey: assetKey,
      uploadedCount: null,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error) {
    console.error("Upload file error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

export const config = {
  path: "/api/upload-file",
};
