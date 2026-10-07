export function openSignInTab(url?: string): Window | null {
  const tab = window.open('', '_blank');
  if (!tab) return null;
  tab.opener = null;
  if (url) tab.location.href = url;
  return tab;
}
