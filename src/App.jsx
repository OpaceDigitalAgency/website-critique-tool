import { useState, useEffect } from 'react'
import ProjectDashboard from './components/ProjectDashboard'
import ProjectViewer from './components/ProjectViewer'
import api from './services/api'
import './App.css'

// App version for cache busting
const APP_VERSION = '2.0.1'

function App() {
  const [currentView, setCurrentView] = useState('dashboard')
  const [selectedProject, setSelectedProject] = useState(null)
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Check if we're on a review URL
    const path = window.location.pathname
    const reviewMatch = path.match(/^\/review\/(.+)$/)

    if (reviewMatch) {
      const projectId = reviewMatch[1]
      loadProjectForReview(projectId)
    } else {
      loadProjects()
    }
  }, [])

  const loadProjects = async () => {
    setLoading(true)
    setError(null)
    try {
      const projectsList = await api.listProjects()
      setProjects(projectsList)
    } catch (err) {
      console.error('Failed to load projects:', err)
      setError('Failed to load projects. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const loadProjectForReview = async (projectId) => {
    setLoading(true)
    setError(null)
    try {
      const project = await api.getProject(projectId)
      setSelectedProject(project)
      setCurrentView('viewer')
    } catch (err) {
      console.error('Failed to load project:', err)
      setError('Project not found or has been deleted.')
      setCurrentView('dashboard')
      loadProjects()
    } finally {
      setLoading(false)
    }
  }

  const handleProjectSelect = async (project) => {
    // If we only have summary data, fetch full project
    if (!project.pages || project.pages.length === 0) {
      setLoading(true)
      try {
        const fullProject = await api.getProject(project.id)
        setSelectedProject(fullProject)
        window.history.pushState({}, '', `/review/${project.id}`)
      } catch (err) {
        setError('Failed to load project details')
        return
      } finally {
        setLoading(false)
      }
    } else {
      setSelectedProject(project)
      window.history.pushState({}, '', `/review/${project.id}`)
    }
    setCurrentView('viewer')
  }

  const handleBackToDashboard = () => {
    setCurrentView('dashboard')
    setSelectedProject(null)
    window.history.pushState({}, '', '/')
    loadProjects()
  }

  const handleProjectCreate = async (newProject) => {
    // Project is already created via API in dashboard
    // Just refresh the list
    await loadProjects()
  }

  const handleProjectDelete = async (projectId) => {
    try {
      await api.deleteProject(projectId)
      await loadProjects()
    } catch (err) {
      console.error('Failed to delete project:', err)
      setError('Failed to delete project')
    }
  }

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname
      const reviewMatch = path.match(/^\/review\/(.+)$/)

      if (reviewMatch) {
        loadProjectForReview(reviewMatch[1])
      } else {
        setCurrentView('dashboard')
        setSelectedProject(null)
        loadProjects()
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  if (loading && !projects.length && !selectedProject) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
          <p>{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-sm underline mt-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {currentView === 'dashboard' ? (
        <ProjectDashboard
          projects={projects}
          onProjectSelect={handleProjectSelect}
          onProjectCreate={handleProjectCreate}
          onProjectDelete={handleProjectDelete}
          loading={loading}
        />
      ) : (
        <ProjectViewer
          project={selectedProject}
          onBack={handleBackToDashboard}
        />
      )}
    </div>
  )
}

export default App

