import { getStore } from "@netlify/blobs";

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
    const { name, clientName, description, fileCount } = await req.json();

    // Generate unique project ID
    const projectId = `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const projectsStore = getStore("projects");

    // Create initial project metadata (pending state)
    const project = {
      id: projectId,
      name: name || "Untitled Project",
      clientName: clientName || "",
      description: description || "",
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      status: "uploading",
      expectedFiles: fileCount || 0,
      uploadedFiles: 0,
      pages: [],
      assetKeys: [],
    };

    await projectsStore.set(projectId, JSON.stringify(project), {
      metadata: { contentType: "application/json" },
    });

    return new Response(JSON.stringify({
      success: true,
      projectId: projectId,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error) {
    console.error("Init project error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

export const config = {
  path: "/api/init-project",
};

