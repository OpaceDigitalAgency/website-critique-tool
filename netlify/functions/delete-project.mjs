import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "DELETE") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const url = new URL(req.url);
    const projectId = context.params?.projectId || url.searchParams.get("id");

    if (!projectId) {
      return new Response(JSON.stringify({ error: "Project ID required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const projectsStore = getStore("projects");
    const assetsStore = getStore("assets");
    const commentsStore = getStore("comments");

    // Get project to find all asset keys
    const project = await projectsStore.get(projectId, { type: "json" });
    
    if (!project) {
      return new Response(JSON.stringify({ error: "Project not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Delete all assets
    if (project.assetKeys) {
      for (const assetKey of project.assetKeys) {
        try {
          await assetsStore.delete(assetKey);
        } catch (e) { /* Ignore individual delete errors */ }
      }
    }

    // Delete comments
    try {
      await commentsStore.delete(projectId);
      // Also try to delete page-specific comments
      if (project.pages) {
        for (const page of project.pages) {
          try {
            await commentsStore.delete(`${projectId}/${page.path}`);
          } catch (e) { /* Ignore */ }
        }
      }
    } catch (e) { /* Ignore */ }

    // Delete project metadata
    await projectsStore.delete(projectId);

    // Update projects list
    try {
      const projectsList = await projectsStore.get("_list", { type: "json" }) || [];
      const updatedList = projectsList.filter(p => p.id !== projectId);
      await projectsStore.set("_list", JSON.stringify(updatedList), {
        metadata: { contentType: "application/json" },
      });
    } catch (e) { /* Ignore list update errors */ }

    return new Response(JSON.stringify({ success: true, deletedId: projectId }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error) {
    console.error("Delete project error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

export const config = {
  path: ["/api/project/:projectId", "/api/project"],
  method: "DELETE",
};

