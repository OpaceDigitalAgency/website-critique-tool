import { useState } from 'react'
import { Upload, FolderOpen, Globe, Plus, Trash2, Eye } from 'lucide-react'

export default function ProjectDashboard({ projects, onProjectSelect, onProjectCreate, onProjectDelete }) {
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadType, setUploadType] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    clientName: '',
    description: '',
    url: '',
    files: [],
    assets: {}
  })

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files)
    const htmlFiles = []
    const allFiles = {}

    for (const file of files) {
      const relativePath = file.webkitRelativePath || file.name

      if (file.name.endsWith('.html')) {
        const content = await file.text()
        htmlFiles.push({
          name: file.name,
          path: relativePath,
          content: content,
          relativePath: relativePath
        })
      }

      if (file.name.endsWith('.css') || file.name.endsWith('.js') ||
          file.name.match(/\.(jpg|jpeg|png|gif|svg|webp|ico)$/i)) {
        const reader = new FileReader()
        const fileData = await new Promise((resolve) => {
          reader.onload = (e) => resolve(e.target.result)
          reader.readAsDataURL(file)
        })
        allFiles[relativePath] = fileData
      }
    }

    setFormData({ ...formData, files: htmlFiles, assets: allFiles })
  }

  const handleZipUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    const zipContent = await zip.loadAsync(file)

    const htmlFiles = []
    const allFiles = {}

    for (const [path, zipEntry] of Object.entries(zipContent.files)) {
      if (zipEntry.dir) continue

      if (path.endsWith('.html')) {
        const content = await zipEntry.async('text')
        htmlFiles.push({
          name: path.split('/').pop(),
          path: path,
          content: content,
          relativePath: path
        })
      } else if (path.endsWith('.css') || path.endsWith('.js') ||
                 path.match(/\.(jpg|jpeg|png|gif|svg|webp|ico)$/i)) {
        const blob = await zipEntry.async('blob')
        const reader = new FileReader()
        const fileData = await new Promise((resolve) => {
          reader.onload = (e) => resolve(e.target.result)
          reader.readAsDataURL(blob)
        })
        allFiles[path] = fileData
      }
    }

    setFormData({ ...formData, files: htmlFiles, assets: allFiles })
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    const items = Array.from(e.dataTransfer.items)

    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file.name.endsWith('.zip')) {
          const fakeEvent = { target: { files: [file] } }
          await handleZipUpload(fakeEvent)
          setUploadType('folder')
          setShowUploadModal(true)
          return
        }
      }
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
  }

  const handleCreateProject = () => {
    const newProject = {
      id: Date.now().toString(),
      name: formData.name || 'Untitled Project',
      clientName: formData.clientName,
      description: formData.description,
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      type: uploadType,
      pages: uploadType === 'url'
        ? [{ name: 'Home', path: formData.url, relativePath: formData.url }]
        : formData.files,
      baseUrl: uploadType === 'url' ? formData.url : null,
      assets: formData.assets || {}
    }

    onProjectCreate(newProject)
    setShowUploadModal(false)
    setFormData({ name: '', clientName: '', description: '', url: '', files: [], assets: {} })
    setUploadType(null)
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
            onChange={handleZipUpload}
            className="hidden"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <button
            onClick={() => { setUploadType('folder'); setShowUploadModal(true) }}
            className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow border-2 border-transparent hover:border-blue-500"
          >
            <FolderOpen className="w-12 h-12 text-blue-600 mb-3" />
            <h3 className="font-semibold text-lg mb-2">Upload HTML Files</h3>
            <p className="text-sm text-gray-600">Select HTML files from your computer</p>
          </button>

          <button
            onClick={() => { setUploadType('url'); setShowUploadModal(true) }}
            className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow border-2 border-transparent hover:border-blue-500"
          >
            <Globe className="w-12 h-12 text-green-600 mb-3" />
            <h3 className="font-semibold text-lg mb-2">Add Website URL</h3>
            <p className="text-sm text-gray-600">Review a live website</p>
          </button>

          <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-6 rounded-lg shadow-md text-white">
            <Plus className="w-12 h-12 mb-3" />
            <h3 className="font-semibold text-lg mb-2">Quick Start</h3>
            <p className="text-sm opacity-90">Drag a ZIP or select files above</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold mb-4">Your Projects</h2>
          
          {projects.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Upload className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>No projects yet. Create your first project above!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map(project => (
                <div key={project.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-lg">{project.name}</h3>
                    <button
                      onClick={() => onProjectDelete(project.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {project.clientName && (
                    <p className="text-sm text-gray-600 mb-2">Client: {project.clientName}</p>
                  )}
                  <p className="text-xs text-gray-500 mb-3">
                    {project.pages?.length || 0} pages • {formatDate(project.lastModified)}
                  </p>
                  <button
                    onClick={() => onProjectSelect(project)}
                    className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Eye className="w-4 h-4" />
                    Open Project
                  </button>
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
              {uploadType === 'url' ? 'Add Website URL' : 'Upload HTML Files'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Project Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="My Awesome Project"
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
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium mb-1">Select HTML Files *</label>
                  <input
                    type="file"
                    multiple
                    webkitdirectory=""
                    directory=""
                    onChange={handleFileSelect}
                    className="w-full border rounded px-3 py-2"
                    accept=".html"
                  />
                  {formData.files.length > 0 && (
                    <p className="text-sm text-green-600 mt-2">
                      {formData.files.length} HTML file(s) selected
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowUploadModal(false)
                  setFormData({ name: '', clientName: '', description: '', url: '', files: [], assets: {} })
                  setUploadType(null)
                }}
                className="flex-1 px-4 py-2 border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateProject}
                disabled={!formData.name || (uploadType === 'url' ? !formData.url : formData.files.length === 0)}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Create Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

