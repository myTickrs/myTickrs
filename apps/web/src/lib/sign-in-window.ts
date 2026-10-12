const WIDTH = 500;
const HEIGHT = 650;

export function openSignInWindow(url?: string): Window | null {
  const left = Math.max(0, window.screenX + (window.outerWidth - WIDTH) / 2);
  const top = Math.max(0, window.screenY + (window.outerHeight - HEIGHT) / 2);
  const popup = window.open('', '_blank', `popup,width=${WIDTH},height=${HEIGHT},left=${left},top=${top}`);
  if (!popup) return null;
  popup.opener = null;
  if (url) popup.location.href = url;
  return popup;
}
