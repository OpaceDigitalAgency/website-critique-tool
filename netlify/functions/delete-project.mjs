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

    // Delete all assets - use list with prefix to ensure we get everything
    console.log(`[DELETE] Deleting all assets for project ${projectId}`);
    try {
      const { blobs } = await assetsStore.list({ prefix: projectId });
      console.log(`[DELETE] Found ${blobs.length} assets to delete`);

      for (const blob of blobs) {
        try {
          await assetsStore.delete(blob.key);
          console.log(`[DELETE] Deleted asset: ${blob.key}`);
        } catch (e) {
          console.error(`[DELETE] Failed to delete asset ${blob.key}:`, e);
        }
      }
    } catch (e) {
      console.error(`[DELETE] Failed to list/delete assets:`, e);
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

