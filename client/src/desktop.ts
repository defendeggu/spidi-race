/** Set by the Windows app (Electron preload): the address other players in the home network open. */
declare global {
  interface Window {
    spidiDesktop?: { lanHost: string | null };
  }
}

/** Address of this server for other players: in the Windows app its LAN address, otherwise the page's host. */
export function shareHost() {
  return window.spidiDesktop?.lanHost ?? location.host;
}
