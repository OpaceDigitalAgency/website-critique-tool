import { getStore } from "@netlify/blobs";

// API version for cache busting
const API_VERSION = "2.0.4";

// Helper to check if HTML has meaningful body content
function hasBodyContent(html) {
  if (!html || typeof html !== 'string') return false;

  // Extract body content
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) return false;

  let bodyContent = bodyMatch[1];

  // Remove script tags
  bodyContent = bodyContent.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  // Remove empty divs like <div id="app"></div>
  bodyContent = bodyContent.replace(/<div[^>]*>\s*<\/div>/gi, '');
  // Remove comments
  bodyContent = bodyContent.replace(/<!--[\s\S]*?-->/g, '');
  // Remove whitespace
  bodyContent = bodyContent.replace(/\s+/g, '').trim();

  // Check if there's any meaningful content left
  return bodyContent.length > 10;
}

export default async (req, context) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-cache, no-store, must-revalidate",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
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

    const projectData = await projectsStore.get(projectId, { type: "json" });

    if (!projectData) {
      return new Response(JSON.stringify({ error: "Project not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Fetch HTML content for each page from assets store
    if (projectData.pages && projectData.pages.length > 0) {
      const pagesWithContent = (await Promise.all(
        projectData.pages.map(async (page) => {
          try {
            if (page.assetKey) {
              const content = await assetsStore.get(page.assetKey, { type: "text" });
              // Skip pages without meaningful content
              if (!hasBodyContent(content)) {
                return null;
              }
              return {
                ...page,
                relativePath: page.path, // Add relativePath for compatibility
                content: content || "",
              };
            }
            // Skip pages without meaningful content
            if (!hasBodyContent(page.content)) {
              return null;
            }
            return {
              ...page,
              relativePath: page.path,
              content: page.content || "",
            };
          } catch (err) {
            console.error(`Failed to fetch content for ${page.assetKey}:`, err);
            return null;
          }
        })
      )).filter(page => page !== null);

      // Sort pages to prioritize index/home pages first
      pagesWithContent.sort((a, b) => {
        const aName = (a.name || a.path || "").toLowerCase();
        const bName = (b.name || b.path || "").toLowerCase();

        const aIsHome = aName.includes("index") || aName.includes("home");
        const bIsHome = bName.includes("index") || bName.includes("home");

        if (aIsHome && !bIsHome) return -1;
        if (!aIsHome && bIsHome) return 1;

        // If both or neither are home pages, sort alphabetically
        return aName.localeCompare(bName);
      });

      projectData.pages = pagesWithContent;
    }

    return new Response(JSON.stringify({ ...projectData, apiVersion: API_VERSION }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error) {
    console.error("Get project error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

export const config = {
  path: ["/api/project/:projectId", "/api/project"],
};

