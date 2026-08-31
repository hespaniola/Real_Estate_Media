import { useCallback, useState } from 'react'

interface DropZoneProps {
  onChooseFolder: () => void
  onDropFolder: (path: string) => void
}

export default function DropZone({ onChooseFolder, onDropFolder }: DropZoneProps): JSX.Element {
  const [dragActive, setDragActive] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragActive(false)
      const file = e.dataTransfer.files?.[0]
      if (!file) return
      const path = window.api.getPathForFile(file)
      if (path) onDropFolder(path)
    },
    [onDropFolder]
  )

  return (
    <div
      className={`dropzone ${dragActive ? 'dropzone--active' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="dropzone__content">
        <div className="dropzone__mark">PCS</div>
        <h1>Photo Culling Studio</h1>
        <p>Drag a folder of RAW or JPEG photos here, or choose one to begin.</p>
        <button className="btn btn--primary" onClick={onChooseFolder}>
          Choose Folder
        </button>
        <div className="dropzone__hints">
          <span>Sharpness</span>
          <span>·</span>
          <span>Exposure</span>
          <span>·</span>
          <span>Duplicates</span>
          <span>·</span>
          <span>Faces</span>
          <span>·</span>
          <span>Composition</span>
        </div>
      </div>
    </div>
  )
}
