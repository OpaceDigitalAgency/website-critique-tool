import { getStore } from "@netlify/blobs";

// API version for cache busting
const API_VERSION = "2.0.4";

// Helper to check if HTML has meaningful body content
function hasBodyContent(html) {
  if (!html || typeof html !== 'string') return false;

  // Just check if there's a body tag with some content
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) return false;

  // Remove whitespace and check if there's anything left
  const bodyContent = bodyMatch[1].trim();
  return bodyContent.length > 0;
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

    // Helper function to rewrite HTML asset paths to absolute URLs
    const rewriteHtmlAssetPaths = (htmlContent, pagePath, assetKeys, projectId, baseUrl) => {
      if (!htmlContent || !assetKeys || assetKeys.length === 0) {
        return htmlContent;
      }

      const baseDir = pagePath.split('/').slice(0, -1).join('/');

      // Build a map of filenames to asset URLs
      const assetMap = new Map();
      for (const assetKey of assetKeys) {
        const assetPath = assetKey.replace(`${projectId}/`, '');
        const fileName = assetPath.split('/').pop();
        const assetUrl = `${baseUrl}/api/asset/${projectId}/${encodeURIComponent(assetPath)}?v=${API_VERSION}`;

        // Store multiple path variations for matching
        assetMap.set(assetPath, assetUrl);
        assetMap.set(fileName, assetUrl);
        if (baseDir) {
          assetMap.set(`${baseDir}/${fileName}`, assetUrl);
        }
      }

      // Helper to resolve asset URL
      const resolveAssetUrl = (rawPath) => {
        if (!rawPath) return null;
        const [pathOnly, suffix = ''] = rawPath.split(/([?#].*)/);
        const cleanPath = pathOnly.replace(/^\.\//, '').replace(/^\//, '');

        if (baseDir) {
          const withBaseDir = `${baseDir}/${cleanPath}`.replace(/\/+/g, '/');
          if (assetMap.has(withBaseDir)) {
            return `${assetMap.get(withBaseDir)}${suffix}`;
          }
        }

        if (assetMap.has(cleanPath)) {
          return `${assetMap.get(cleanPath)}${suffix}`;
        }

        const fileName = cleanPath.split('/').pop();
        if (fileName && assetMap.has(fileName)) {
          return `${assetMap.get(fileName)}${suffix}`;
        }

        return null;
      };

      // Replace all src and href attributes with absolute URLs
      let rewrittenHtml = htmlContent.replace(
        /(src|href)=["']([^"']+)["']/gi,
        (match, attr, path) => {
          // Skip absolute URLs, data URIs, mailto, tel, and anchors
          if (path.startsWith('http://') || path.startsWith('https://') ||
              path.startsWith('data:') || path.startsWith('//') ||
              path.startsWith('mailto:') || path.startsWith('tel:') ||
              path.startsWith('#')) {
            return match;
          }

          const resolved = resolveAssetUrl(path);
          return resolved ? `${attr}="${resolved}"` : match;
        }
      );

      // Also replace url() in inline styles
      rewrittenHtml = rewrittenHtml.replace(
        /url\(["']?([^"')]+)["']?\)/gi,
        (match, path) => {
          if (path.startsWith('http://') || path.startsWith('https://') ||
              path.startsWith('data:') || path.startsWith('//')) {
            return match;
          }
          const resolved = resolveAssetUrl(path);
          return resolved ? `url("${resolved}")` : match;
        }
      );

      return rewrittenHtml;
    };

    // Get the base URL from the request
    const baseUrl = new URL(req.url).origin;

    // Fetch HTML content for each page from assets store
    if (projectData.pages && projectData.pages.length > 0) {
      const pagesWithContent = (await Promise.all(
        projectData.pages.map(async (page) => {
          try {
            if (page.assetKey) {
              let content = await assetsStore.get(page.assetKey, { type: "text" });
              // Skip pages without meaningful content
              if (!hasBodyContent(content)) {
                return null;
              }

              // Rewrite asset paths to absolute URLs
              content = rewriteHtmlAssetPaths(content, page.path, projectData.assetKeys, projectId, baseUrl);

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

            // Rewrite asset paths to absolute URLs
            let content = rewriteHtmlAssetPaths(page.content, page.path, projectData.assetKeys, projectId, baseUrl);

            return {
              ...page,
              relativePath: page.path,
              content: content || "",
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

