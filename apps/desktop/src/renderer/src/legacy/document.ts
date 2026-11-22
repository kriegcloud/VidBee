import { DesktopLogChannel } from '../../../shared/logging/DesktopLog.model'
import { makeDesktopDocument } from '../runtime/DesktopAtomRuntime.entry'

let documentOwner: ReturnType<typeof makeDesktopDocument> | undefined
/** The document outlives React mount replay; only departure/HMR closes it. */
export const getDesktopDocument = (): ReturnType<typeof makeDesktopDocument> => {
  if (!documentOwner) {
    documentOwner = makeDesktopDocument({
      bridge: window.vidbeeRpc,
      sendLog: (entry) => window.electron.ipcRenderer.send(DesktopLogChannel, entry)
    })
    const owned = documentOwner
    window.addEventListener(
      'beforeunload',
      () => {
        void owned.close()
      },
      { once: true }
    )
    import.meta.hot?.dispose(() => {
      void owned.close()
    })
  }
  return documentOwner
}
