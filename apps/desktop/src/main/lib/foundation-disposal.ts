let disposal: (() => Promise<void>) | undefined
/** The existing quit owner takes this application callback only after transport startup. */
export const registerFoundationDisposal = (close: () => Promise<void>): void => {
  disposal = close
}
/** No disposal or asynchronous turn is invented when bootstrap has not installed a server. */
export const takeFoundationDisposal = (): (() => Promise<void>) | undefined => {
  const current = disposal
  disposal = undefined
  return current
}
