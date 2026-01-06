import { useState } from 'react'
import { Upload, FolderOpen, Globe, Plus, Trash2, Eye, Copy, Check, Link } from 'lucide-react'
import api from '../services/api'

export default function ProjectDashboard({ projects, onProjectSelect, onProjectCreate, onProjectDelete, loading }) {
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadType, setUploadType] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [uploadError, setUploadError] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const [zipFile, setZipFile] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    clientName: '',
    description: '',
    url: '',
  })

  const handleZipSelect = (e) => {
    const file = e.target.files[0]
    if (file && file.name.endsWith('.zip')) {
      setZipFile(file)
      setUploadType('zip')
      setShowUploadModal(true)
    }
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    const items = Array.from(e.dataTransfer.items)

    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file.name.endsWith('.zip')) {
          setZipFile(file)
          setUploadType('zip')
          setShowUploadModal(true)
          return
        }
      }
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
  }

  const handleCreateProject = async () => {
    setUploading(true)
    setUploadError(null)
    setUploadProgress('Uploading project...')

    try {
      if (uploadType === 'zip' && zipFile) {
        setUploadProgress('Uploading ZIP file to cloud storage...')
        const result = await api.uploadProject(zipFile, {
          name: formData.name || 'Untitled Project',
          clientName: formData.clientName,
          description: formData.description,
        })

        setUploadProgress('Project created successfully!')

        // Show share URL
        const shareUrl = api.getShareUrl(result.project.id)
        alert(`Project created!\n\nShareable URL:\n${shareUrl}\n\nYou can share this link with your client.`)

        onProjectCreate(result.project)
        setShowUploadModal(false)
        resetForm()
      } else if (uploadType === 'url') {
        // URL projects still work the same way but need API support
        setUploadError('URL projects coming soon. Please use ZIP upload for now.')
        setUploading(false)
        return
      }
    } catch (err) {
      console.error('Upload failed:', err)
      setUploadError(err.message || 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
      setUploadProgress('')
    }
  }

  const resetForm = () => {
    setFormData({ name: '', clientName: '', description: '', url: '' })
    setZipFile(null)
    setUploadType(null)
  }

  const copyShareUrl = async (projectId) => {
    const shareUrl = api.getShareUrl(projectId)
    await navigator.clipboard.writeText(shareUrl)
    setCopiedId(projectId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Opace Annotate</h1>
          <p className="text-gray-600">Visual Feedback & Website Critique Tool</p>
        </div>

        <div
          className="mb-8 p-8 border-4 border-dashed border-blue-300 rounded-lg bg-blue-50 text-center hover:border-blue-500 hover:bg-blue-100 transition-all cursor-pointer"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => document.getElementById('zip-upload-input').click()}
        >
          <Upload className="w-16 h-16 text-blue-600 mx-auto mb-4" />
          <h3 className="text-xl font-bold mb-2">Drag & Drop ZIP File Here</h3>
          <p className="text-gray-600 mb-2">or click to browse</p>
          <p className="text-sm text-gray-500">Upload a ZIP file containing your HTML, CSS, images, and other assets</p>
          <input
            id="zip-upload-input"
            type="file"
            accept=".zip"
            onChange={handleZipSelect}
            className="hidden"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <button
            onClick={() => { setUploadType('url'); setShowUploadModal(true) }}
            className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow border-2 border-transparent hover:border-blue-500"
          >
            <Globe className="w-12 h-12 text-green-600 mb-3" />
            <h3 className="font-semibold text-lg mb-2">Add Website URL</h3>
            <p className="text-sm text-gray-600">Review a live website (coming soon)</p>
          </button>

          <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-6 rounded-lg shadow-md text-white">
            <Plus className="w-12 h-12 mb-3" />
            <h3 className="font-semibold text-lg mb-2">Quick Start</h3>
            <p className="text-sm opacity-90">Drag a ZIP file above to get started</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold mb-4">Your Projects</h2>

          {loading ? (
            <div className="text-center py-12 text-gray-500">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p>Loading projects...</p>
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Upload className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>No projects yet. Create your first project above!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map(project => (
                <div key={project.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-lg truncate flex-1">{project.name}</h3>
                    <button
                      onClick={() => onProjectDelete(project.id)}
                      className="text-red-500 hover:text-red-700 ml-2"
                      title="Delete project"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {project.clientName && (
                    <p className="text-sm text-gray-600 mb-2">Client: {project.clientName}</p>
                  )}
                  <p className="text-xs text-gray-500 mb-3">
                    {project.pageCount || project.pages?.length || 0} pages • {formatDate(project.lastModified || project.createdAt)}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onProjectSelect(project)}
                      className="flex-1 bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <Eye className="w-4 h-4" />
                      Open
                    </button>
                    <button
                      onClick={() => copyShareUrl(project.id)}
                      className="bg-gray-100 text-gray-700 py-2 px-3 rounded hover:bg-gray-200 transition-colors flex items-center justify-center"
                      title="Copy share link"
                    >
                      {copiedId === project.id ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <Link className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold mb-4">
              {uploadType === 'url' ? 'Add Website URL' : 'Create New Project'}
            </h2>

            {uploadError && (
              <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-3 mb-4 text-sm">
                {uploadError}
              </div>
            )}

            {uploadProgress && (
              <div className="bg-blue-100 border-l-4 border-blue-500 text-blue-700 p-3 mb-4 text-sm flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                {uploadProgress}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Project Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="My Awesome Project"
                  disabled={uploading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Client Name</label>
                <input
                  type="text"
                  value={formData.clientName}
                  onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="Acme Corp"
                  disabled={uploading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  rows="3"
                  placeholder="Brief description of the project"
                  disabled={uploading}
                />
              </div>

              {uploadType === 'url' ? (
                <div>
                  <label className="block text-sm font-medium mb-1">Website URL *</label>
                  <input
                    type="url"
                    value={formData.url}
                    onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                    placeholder="https://example.com"
                    disabled={uploading}
                  />
                  <p className="text-xs text-amber-600 mt-1">URL projects coming soon</p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium mb-1">ZIP File</label>
                  {zipFile ? (
                    <div className="bg-green-50 border border-green-200 rounded p-3 flex items-center gap-2">
                      <Check className="w-5 h-5 text-green-600" />
                      <span className="text-sm text-green-700">{zipFile.name}</span>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No file selected</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowUploadModal(false)
                  resetForm()
                  setUploadError(null)
                }}
                className="flex-1 px-4 py-2 border rounded hover:bg-gray-50"
                disabled={uploading}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateProject}
                disabled={uploading || !formData.name || (uploadType === 'url' ? !formData.url : !zipFile)}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Uploading...
                  </>
                ) : (
                  'Create Project'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

