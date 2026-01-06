import { useState, useEffect } from 'react'
import ProjectDashboard from './components/ProjectDashboard'
import ProjectViewer from './components/ProjectViewer'
import './App.css'

function App() {
  const [currentView, setCurrentView] = useState('dashboard')
  const [selectedProject, setSelectedProject] = useState(null)
  const [projects, setProjects] = useState([])

  useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = () => {
    const savedProjects = localStorage.getItem('opace-projects')
    if (savedProjects) {
      setProjects(JSON.parse(savedProjects))
    }
  }

  const saveProjects = (updatedProjects) => {
    localStorage.setItem('opace-projects', JSON.stringify(updatedProjects))
    setProjects(updatedProjects)
  }

  const handleProjectSelect = (project) => {
    setSelectedProject(project)
    setCurrentView('viewer')
  }

  const handleBackToDashboard = () => {
    setCurrentView('dashboard')
    setSelectedProject(null)
    loadProjects()
  }

  const handleProjectCreate = (newProject) => {
    const updatedProjects = [...projects, newProject]
    saveProjects(updatedProjects)
  }

  const handleProjectDelete = (projectId) => {
    const updatedProjects = projects.filter(p => p.id !== projectId)
    saveProjects(updatedProjects)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {currentView === 'dashboard' ? (
        <ProjectDashboard
          projects={projects}
          onProjectSelect={handleProjectSelect}
          onProjectCreate={handleProjectCreate}
          onProjectDelete={handleProjectDelete}
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

