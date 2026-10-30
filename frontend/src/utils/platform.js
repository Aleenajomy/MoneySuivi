// True when running as the installed app (home-screen PWA or the Android app), not a browser tab.
export const isInstalledApp = () => {
  if (typeof window === 'undefined') return false
  return ['standalone', 'fullscreen', 'minimal-ui'].some(mode => window.matchMedia(`(display-mode: ${mode})`).matches) ||
    window.navigator.standalone === true ||
    document.referrer.startsWith('android-app://')
}
