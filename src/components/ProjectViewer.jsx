import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, MessageSquare, Monitor, Tablet, Smartphone, Download, Save } from 'lucide-react'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

const VIEWPORTS = {
  mobile: { width: 375, label: 'Mobile', icon: Smartphone },
  tablet: { width: 768, label: 'Tablet', icon: Tablet },
  desktop: { width: 1440, label: 'Desktop', icon: Monitor },
  full: { width: '100%', label: 'Full Width', icon: Monitor }
}

export default function ProjectViewer({ project, onBack }) {
  const [currentPage, setCurrentPage] = useState(0)
  const [viewport, setViewport] = useState('desktop')
  const [commentMode, setCommentMode] = useState(false)
  const [comments, setComments] = useState({})
  const [activeComment, setActiveComment] = useState(null)
  const [showCommentInput, setShowCommentInput] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [tempPinPosition, setTempPinPosition] = useState(null)
  const overlayRef = useRef(null)
  const iframeRef = useRef(null)

  useEffect(() => {
    const savedComments = localStorage.getItem(`comments-${project.id}`)
    if (savedComments) {
      setComments(JSON.parse(savedComments))
    }
  }, [project.id])

  useEffect(() => {
    localStorage.setItem(`comments-${project.id}`, JSON.stringify(comments))
  }, [comments, project.id])

  const currentPageData = project.pages[currentPage]

  const handleOverlayClick = (e) => {
    if (!commentMode) return

    const rect = overlayRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    setTempPinPosition({ x, y })
    setShowCommentInput(true)
    setCommentText('')
  }

  const handleAddComment = () => {
    if (!commentText.trim() || !tempPinPosition) return

    const pageKey = currentPageData.relativePath || currentPageData.path
    const pageComments = comments[pageKey] || []
    
    const newComment = {
      id: Date.now(),
      text: commentText,
      x: tempPinPosition.x,
      y: tempPinPosition.y,
      viewport: viewport,
      timestamp: new Date().toISOString()
    }

    setComments({
      ...comments,
      [pageKey]: [...pageComments, newComment]
    })

    setShowCommentInput(false)
    setTempPinPosition(null)
    setCommentText('')
  }

  const handleDeleteComment = (commentId) => {
    const pageKey = currentPageData.relativePath || currentPageData.path
    const pageComments = comments[pageKey] || []
    
    setComments({
      ...comments,
      [pageKey]: pageComments.filter(c => c.id !== commentId)
    })
    setActiveComment(null)
  }

  const getPageComments = () => {
    const pageKey = currentPageData.relativePath || currentPageData.path
    return comments[pageKey] || []
  }

  const generatePDF = async () => {
    const pdf = new jsPDF('p', 'mm', 'a4')
    let isFirstPage = true

    pdf.setFontSize(20)
    pdf.text(project.name, 20, 20)
    pdf.setFontSize(12)
    pdf.text(`Client: ${project.clientName || 'N/A'}`, 20, 30)
    pdf.text(`Generated: ${new Date().toLocaleDateString()}`, 20, 40)
    pdf.setFontSize(10)
    pdf.text(`Total Comments: ${Object.values(comments).flat().length}`, 20, 50)

    for (const [pagePath, pageComments] of Object.entries(comments)) {
      if (pageComments.length === 0) continue

      if (!isFirstPage) {
        pdf.addPage()
      } else {
        isFirstPage = false
      }

      const pageName = pagePath.split('/').pop()
      pdf.setFontSize(16)
      pdf.text(`Page: ${pageName}`, 20, isFirstPage ? 70 : 20)

      let yPosition = isFirstPage ? 80 : 30

      for (let i = 0; i < pageComments.length; i++) {
        const comment = pageComments[i]
        
        if (yPosition > 270) {
          pdf.addPage()
          yPosition = 20
        }

        pdf.setFontSize(12)
        pdf.setFont(undefined, 'bold')
        pdf.text(`Comment ${i + 1}:`, 20, yPosition)
        pdf.setFont(undefined, 'normal')
        pdf.setFontSize(10)
        
        const lines = pdf.splitTextToSize(comment.text, 170)
        pdf.text(lines, 20, yPosition + 5)
        
        pdf.setFontSize(8)
        pdf.setTextColor(100)
        pdf.text(`Viewport: ${comment.viewport} | Position: (${Math.round(comment.x)}, ${Math.round(comment.y)})`, 20, yPosition + 5 + (lines.length * 4) + 3)
        pdf.setTextColor(0)

        yPosition += 5 + (lines.length * 4) + 10
      }
    }

    pdf.save(`${project.name}-feedback.pdf`)
  }

  const getIframeContent = () => {
    if (project.type === 'url') {
      return currentPageData.path
    } else {
      return `data:text/html;charset=utf-8,${encodeURIComponent(currentPageData.content)}`
    }
  }

  const viewportWidth = VIEWPORTS[viewport].width

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-full mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="w-5 h-5" />
                Back
              </button>
              <div>
                <h1 className="text-xl font-bold">{project.name}</h1>
                {project.clientName && (
                  <p className="text-sm text-gray-600">Client: {project.clientName}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setCommentMode(!commentMode)}
                className={`flex items-center gap-2 px-4 py-2 rounded transition-colors ${
                  commentMode
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                {commentMode ? 'Exit Comment Mode' : 'Add Comments'}
              </button>

              <button
                onClick={generatePDF}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                <Download className="w-4 h-4" />
                Export PDF
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              {Object.entries(VIEWPORTS).map(([key, { label, icon: Icon }]) => (
                <button
                  key={key}
                  onClick={() => setViewport(key)}
                  className={`flex items-center gap-2 px-3 py-2 rounded transition-colors ${
                    viewport === key
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>

            <div className="flex-1 flex gap-2 overflow-x-auto">
              {project.pages.map((page, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentPage(index)}
                  className={`px-3 py-2 rounded whitespace-nowrap transition-colors ${
                    currentPage === index
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {page.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex justify-center items-start overflow-auto bg-gray-200 p-4">
          <div
            className="bg-white shadow-2xl relative"
            style={{
              width: viewportWidth === '100%' ? '100%' : `${viewportWidth}px`,
              minHeight: '100%'
            }}
          >
            <div className="relative" style={{ height: '800px' }}>
              <iframe
                ref={iframeRef}
                src={getIframeContent()}
                className="w-full h-full border-0"
                title={currentPageData.name}
                sandbox="allow-same-origin allow-scripts"
              />

              <div
                ref={overlayRef}
                className={`comment-overlay ${commentMode ? 'active' : ''}`}
                onClick={handleOverlayClick}
              >
                {getPageComments().map((comment) => (
                  <div
                    key={comment.id}
                    className={`comment-pin ${activeComment === comment.id ? 'active' : ''}`}
                    style={{ left: `${comment.x}px`, top: `${comment.y}px` }}
                    onClick={(e) => {
                      e.stopPropagation()
                      setActiveComment(activeComment === comment.id ? null : comment.id)
                    }}
                  >
                    {getPageComments().indexOf(comment) + 1}
                  </div>
                ))}

                {tempPinPosition && (
                  <div
                    className="comment-pin"
                    style={{ left: `${tempPinPosition.x}px`, top: `${tempPinPosition.y}px` }}
                  >
                    ?
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="w-80 bg-white border-l overflow-y-auto">
          <div className="p-4">
            <h2 className="text-lg font-bold mb-4">Comments ({getPageComments().length})</h2>

            {getPageComments().length === 0 ? (
              <p className="text-gray-500 text-sm">No comments yet. Click "Add Comments" and click on the page to add feedback.</p>
            ) : (
              <div className="space-y-3">
                {getPageComments().map((comment, index) => (
                  <div
                    key={comment.id}
                    className={`border rounded p-3 cursor-pointer transition-colors ${
                      activeComment === comment.id ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                    onClick={() => setActiveComment(activeComment === comment.id ? null : comment.id)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="font-bold text-blue-600">#{index + 1}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteComment(comment.id)
                        }}
                        className="text-red-500 hover:text-red-700 text-xs"
                      >
                        Delete
                      </button>
                    </div>
                    <p className="text-sm mb-2">{comment.text}</p>
                    <div className="text-xs text-gray-500">
                      <div>Viewport: {comment.viewport}</div>
                      <div>Position: ({Math.round(comment.x)}, {Math.round(comment.y)})</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showCommentInput && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold mb-4">Add Comment</h3>
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              className="w-full border rounded px-3 py-2 mb-4"
              rows="4"
              placeholder="Enter your feedback here..."
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCommentInput(false)
                  setTempPinPosition(null)
                  setCommentText('')
                }}
                className="flex-1 px-4 py-2 border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddComment}
                disabled={!commentText.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300"
              >
                Add Comment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

