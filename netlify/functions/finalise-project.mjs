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
    const { projectId } = await req.json();

    if (!projectId) {
      return new Response(JSON.stringify({ error: "Project ID required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const projectsStore = getStore("projects");

    // Get and update project
    const projectData = await projectsStore.get(projectId, { type: "json" });
    if (!projectData) {
      return new Response(JSON.stringify({ error: "Project not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Mark as complete
    projectData.status = "ready";
    projectData.lastModified = new Date().toISOString();
    delete projectData.expectedFiles;
    delete projectData.uploadedFiles;

    await projectsStore.set(projectId, JSON.stringify(projectData), {
      metadata: { contentType: "application/json" },
    });

    // Add to projects list
    let projectsList = [];
    try {
      const existingList = await projectsStore.get("_list", { type: "json" });
      if (existingList) projectsList = existingList;
    } catch (e) { /* List doesn't exist yet */ }

    projectsList.push({
      id: projectData.id,
      name: projectData.name,
      clientName: projectData.clientName,
      createdAt: projectData.createdAt,
      pageCount: projectData.pages.length,
    });

    await projectsStore.set("_list", JSON.stringify(projectsList), {
      metadata: { contentType: "application/json" },
    });

    return new Response(JSON.stringify({
      success: true,
      project: projectData,
      shareUrl: `/review/${projectId}`,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error) {
    console.error("Finalise project error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

export const config = {
  path: "/api/finalise-project",
};

