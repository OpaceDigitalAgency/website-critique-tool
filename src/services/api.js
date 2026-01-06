// API Service for Opace Annotate
// Handles all communication with Netlify Functions backend

const API_BASE = '/api';

// Version for cache busting
const API_VERSION = '1.0.1';

/**
 * Upload a project ZIP file
 * @param {File} file - ZIP file to upload
 * @param {Object} metadata - Project metadata (name, clientName, description)
 * @returns {Promise<Object>} - Created project data
 */
export async function uploadProject(file, metadata) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('name', metadata.name || 'Untitled Project');
  formData.append('clientName', metadata.clientName || '');
  formData.append('description', metadata.description || '');

  const response = await fetch(`${API_BASE}/upload-project?v=${API_VERSION}`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error || 'Upload failed');
  }

  return response.json();
}

/**
 * List all projects
 * @returns {Promise<Array>} - Array of project summaries
 */
export async function listProjects() {
  const response = await fetch(`${API_BASE}/projects?v=${API_VERSION}`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch projects');
  }

  const data = await response.json();
  return data.projects || [];
}

/**
 * Get a specific project by ID
 * @param {string} projectId - Project ID
 * @returns {Promise<Object>} - Full project data
 */
export async function getProject(projectId) {
  const response = await fetch(`${API_BASE}/project/${projectId}?v=${API_VERSION}`);
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Project not found');
    }
    throw new Error('Failed to fetch project');
  }

  return response.json();
}

/**
 * Delete a project
 * @param {string} projectId - Project ID to delete
 * @returns {Promise<Object>} - Deletion confirmation
 */
export async function deleteProject(projectId) {
  const response = await fetch(`${API_BASE}/project/${projectId}?v=${API_VERSION}`, {
    method: 'DELETE',
  });
  
  if (!response.ok) {
    throw new Error('Failed to delete project');
  }

  return response.json();
}

/**
 * Get asset URL for a project file
 * @param {string} projectId - Project ID
 * @param {string} assetPath - Path to the asset within the project
 * @returns {string} - URL to fetch the asset
 */
export function getAssetUrl(projectId, assetPath) {
  return `${API_BASE}/asset/${projectId}/${assetPath}?v=${API_VERSION}`;
}

/**
 * Get comments for a project page
 * @param {string} projectId - Project ID
 * @param {string} pageKey - Optional page key for page-specific comments
 * @returns {Promise<Array>} - Array of comments
 */
export async function getComments(projectId, pageKey = null) {
  const params = new URLSearchParams({ v: API_VERSION });
  if (pageKey) params.append('pageKey', pageKey);
  
  const response = await fetch(`${API_BASE}/comments/${projectId}?${params}`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch comments');
  }

  const data = await response.json();
  return data.comments || [];
}

/**
 * Save comments for a project page
 * @param {string} projectId - Project ID
 * @param {Array} comments - Array of comment objects
 * @param {string} pageKey - Optional page key for page-specific comments
 * @returns {Promise<Object>} - Save confirmation
 */
export async function saveComments(projectId, comments, pageKey = null) {
  const params = new URLSearchParams({ v: API_VERSION });
  if (pageKey) params.append('pageKey', pageKey);
  
  const response = await fetch(`${API_BASE}/comments/${projectId}?${params}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ comments }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to save comments');
  }

  return response.json();
}

/**
 * Generate a shareable URL for a project
 * @param {string} projectId - Project ID
 * @returns {string} - Full shareable URL
 */
export function getShareUrl(projectId) {
  const baseUrl = window.location.origin;
  return `${baseUrl}/review/${projectId}`;
}

export default {
  uploadProject,
  listProjects,
  getProject,
  deleteProject,
  getAssetUrl,
  getComments,
  saveComments,
  getShareUrl,
};

