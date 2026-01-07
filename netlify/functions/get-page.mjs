import { getStore } from "@netlify/blobs";

// API version for cache busting
const API_VERSION = "2.1.1";

const encodePath = (value) => value.split('/').map(encodeURIComponent).join('/');

export default async (req, context) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    // Extract projectId and pagePath from URL: /api/page/:projectId/*
    const pathMatch = url.pathname.match(/\/api\/page\/([^\/]+)\/(.+)/);
    
    if (!pathMatch) {
      return new Response("Invalid page path", {
        status: 400,
        headers: { "Content-Type": "text/plain", ...corsHeaders },
      });
    }

    const projectId = pathMatch[1];
    let pagePath = pathMatch[2];

    try {
      pagePath = decodeURIComponent(pagePath);
    } catch (error) {
      return new Response("Invalid page path encoding", {
        status: 400,
        headers: { "Content-Type": "text/plain", ...corsHeaders },
      });
    }

    const assetsStore = getStore("assets");
    const projectsStore = getStore("projects");

    // Get project data to access assetKeys
    const projectData = await projectsStore.get(projectId, { type: "json" });
    if (!projectData) {
      return new Response("Project not found", {
        status: 404,
        headers: { "Content-Type": "text/plain", ...corsHeaders },
      });
    }

    // Get the HTML content
    const assetKey = `${projectId}/${pagePath}`;
    let htmlContent = await assetsStore.get(assetKey, { type: "text" });

    if (!htmlContent) {
      return new Response("Page not found", {
        status: 404,
        headers: { "Content-Type": "text/plain", ...corsHeaders },
      });
    }

    // Rewrite asset paths to absolute URLs
    const baseUrl = url.origin;
    const baseDir = pagePath.split('/').slice(0, -1).join('/');
    const assetKeys = projectData.assetKeys || [];

    // Build a map of filenames to asset URLs
    const assetMap = new Map();
    for (const assetKey of assetKeys) {
      const assetPath = assetKey.replace(`${projectId}/`, '');
      const fileName = assetPath.split('/').pop();
      const assetUrl = `${baseUrl}/api/asset/${projectId}/${encodePath(assetPath)}?v=${API_VERSION}`;

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

      // Check if it's an HTML page first - if so, return the page URL
      if (cleanPath.endsWith('.html') || cleanPath.endsWith('.htm')) {
        const fullPath = baseDir ? `${baseDir}/${cleanPath}`.replace(/\/+/g, '/') : cleanPath;
        return `${baseUrl}/api/page/${projectId}/${encodePath(fullPath)}${suffix}`;
      }

      // For non-HTML assets, check the asset map
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
    htmlContent = htmlContent.replace(
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
    htmlContent = htmlContent.replace(
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

    return new Response(htmlContent, {
      status: 200,
      headers: {
        "Content-Type": "text/html",
        "Cache-Control": "public, max-age=31536000",
        ...corsHeaders,
      },
    });

  } catch (error) {
    console.error("Get page error:", error);
    return new Response(error.message, {
      status: 500,
      headers: { "Content-Type": "text/plain", ...corsHeaders },
    });
  }
};

export const config = {
  path: "/api/page/:projectId/*",
};
