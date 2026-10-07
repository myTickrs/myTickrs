import { spawn } from 'node:child_process';

export function browserUrl(host: string, port: number): string {
  const local = ['0.0.0.0', '::', '127.0.0.1', '::1', 'localhost'].includes(host);
  return `http://${local ? 'localhost' : host.includes(':') ? `[${host}]` : host}:${port}`;
}

export function openBrowser(url: string): void {
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) return;
  const [command, args] =
    process.platform === 'win32'
      ? ['explorer.exe', [url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  spawn(command, args, { stdio: 'ignore', detached: true })
    .on('error', () => {})
    .unref();
}
