/** Select the keyring used by the dedicated Chrome profile on Linux. */
export const resolveSocialSessionKeyring = (
  desktop: string,
  kwalletAvailable: boolean
): 'kwallet' | null => {
  if (/kde|plasma/i.test(desktop)) {
    return 'kwallet'
  }
  // Some launchers omit desktop variables even inside a Plasma session.
  if (!desktop.trim() && kwalletAvailable) {
    return 'kwallet'
  }
  return null
}
