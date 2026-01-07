import { getStore } from "@netlify/blobs";

export default async (req) => {
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
    const projectsStore = getStore("projects");

    // Get current list
    let projectsList = [];
    try {
      const list = await projectsStore.get("_list", { type: "json" });
      if (list) projectsList = list;
    } catch (e) {
      // List doesn't exist
    }

    const originalCount = projectsList.length;

    // Filter out invalid entries (must have id starting with "proj_")
    const cleanedList = projectsList.filter((project) => {
      if (!project || !project.id) return false;
      // Valid project IDs start with "proj_"
      if (!project.id.startsWith("proj_")) {
        console.log(`Removing invalid project entry: ${project.id}`);
        return false;
      }
      return true;
    });

    const removedCount = originalCount - cleanedList.length;

    // Save cleaned list
    await projectsStore.set("_list", JSON.stringify(cleanedList), {
      metadata: { contentType: "application/json" },
    });

    return new Response(
      JSON.stringify({
        success: true,
        originalCount,
        cleanedCount: cleanedList.length,
        removedCount,
        projects: cleanedList.map((p) => ({ id: p.id, name: p.name })),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error) {
    console.error("Cleanup error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

export const config = {
  path: "/api/cleanup-projects",
};

