import { getStore } from "@netlify/blobs";

const generateId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

export default async (req, context) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const projectId = context.params?.projectId || url.searchParams.get("projectId");

  if (!projectId) {
    return new Response(JSON.stringify({ error: "Project ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const approvalsStore = getStore("approvals");
  const approvalsKey = projectId;

  const loadState = async () => {
    try {
      const data = await approvalsStore.get(approvalsKey, { type: "json" });
      return data || { approvals: {}, history: [] };
    } catch {
      return { approvals: {}, history: [] };
    }
  };

  const saveState = async (state) => {
    await approvalsStore.set(approvalsKey, JSON.stringify(state), {
      metadata: { contentType: "application/json" },
    });
  };

  try {
    if (req.method === "GET") {
      const data = await loadState();
      return new Response(JSON.stringify({
        approvals: data.approvals || {},
        history: data.history || [],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const action = body.action;
      const pageKey = body.pageKey;
      const viewport = body.viewport;

      if (!action || !pageKey || !viewport) {
        return new Response(JSON.stringify({ error: "Action, pageKey, and viewport are required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const state = await loadState();
      const approvals = state.approvals || {};
      const history = state.history || [];
      const timestamp = new Date().toISOString();
      const actor = body.actor || body.approvedBy || body.approverName || "system";

      if (action === "approve") {
        const approvalId = body.approvalId || generateId();
        if (!approvals[pageKey]) approvals[pageKey] = {};
        approvals[pageKey][viewport] = {
          status: "approved",
          approvalId,
          approvedAt: timestamp,
          approvedBy: body.approvedBy || body.approverName || null,
          commentCount: Number.isFinite(body.commentCount) ? body.commentCount : null,
        };

        history.push({
          id: generateId(),
          action: "approved",
          timestamp,
          pageKey,
          viewport,
          actor,
          approvalId,
          commentCount: Number.isFinite(body.commentCount) ? body.commentCount : null,
        });
      } else if (action === "clear") {
        if (approvals[pageKey] && approvals[pageKey][viewport]) {
          delete approvals[pageKey][viewport];
          if (Object.keys(approvals[pageKey]).length === 0) {
            delete approvals[pageKey];
          }
        }

        history.push({
          id: generateId(),
          action: "cleared",
          timestamp,
          pageKey,
          viewport,
          actor,
          reason: body.reason || "updated",
        });
      } else {
        return new Response(JSON.stringify({ error: "Unsupported action" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      state.approvals = approvals;
      state.history = history.slice(-500);
      await saveState(state);

      const projectsStore = getStore("projects");
      try {
        const project = await projectsStore.get(projectId, { type: "json" });
        if (project) {
          project.lastModified = new Date().toISOString();
          await projectsStore.set(projectId, JSON.stringify(project), {
            metadata: { contentType: "application/json" },
          });
        }
      } catch {
        // Ignore project update errors.
      }

      return new Response(JSON.stringify({
        approvals: state.approvals,
        history: state.history,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error) {
    console.error("Approvals error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

export const config = {
  path: ["/api/approvals/:projectId", "/api/approvals"],
};
