import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const projectId = context.params?.projectId || url.searchParams.get("projectId");
  const pageKey = url.searchParams.get("pageKey");

  if (!projectId) {
    return new Response(JSON.stringify({ error: "Project ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const commentsStore = getStore("comments");
  const commentsKey = pageKey ? `${projectId}/${pageKey}` : projectId;

  try {
    // GET - Retrieve comments
    if (req.method === "GET") {
      let comments = [];
      try {
        const data = await commentsStore.get(commentsKey, { type: "json" });
        if (data) comments = data;
      } catch (e) { /* No comments yet */ }

      return new Response(JSON.stringify({ comments }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // POST - Save comments
    if (req.method === "POST") {
      const body = await req.json();
      const comments = body.comments || [];

      await commentsStore.set(commentsKey, JSON.stringify(comments), {
        metadata: { contentType: "application/json" },
      });

      // Update project lastModified
      const projectsStore = getStore("projects");
      try {
        const project = await projectsStore.get(projectId, { type: "json" });
        if (project) {
          project.lastModified = new Date().toISOString();
          await projectsStore.set(projectId, JSON.stringify(project), {
            metadata: { contentType: "application/json" },
          });
        }
      } catch (e) { /* Ignore project update errors */ }

      return new Response(JSON.stringify({ success: true, count: comments.length }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // DELETE - Delete all comments for a project/page
    if (req.method === "DELETE") {
      await commentsStore.delete(commentsKey);

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error) {
    console.error("Comments error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

export const config = {
  path: ["/api/comments/:projectId", "/api/comments"],
};

