interface ShortcutsHelpProps {
  onClose: () => void
}

const SHORTCUTS: Array<[string, string]> = [
  ['← / →', 'Previous / next photo'],
  ['Space / Enter', 'Open full-screen loupe'],
  ['Esc', 'Close loupe'],
  ['A', 'Accept'],
  ['X', 'Reject'],
  ['F', 'Favorite'],
  ['U', 'Clear flag']
]

export default function ShortcutsHelp({ onClose }: ShortcutsHelpProps): JSX.Element {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Keyboard Shortcuts</h2>
        <table className="shortcuts-table">
          <tbody>
            {SHORTCUTS.map(([key, desc]) => (
              <tr key={key}>
                <td className="shortcuts-table__key">
                  <kbd>{key}</kbd>
                </td>
                <td>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn btn--primary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
