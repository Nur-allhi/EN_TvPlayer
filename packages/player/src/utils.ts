export interface Channel {
  name: string;
  url: string;
  channelNumber: number;
  drm: { keyId: string; key: string } | null;
  userAgent: string | null;
  customHeaders: Record<string, string> | null;
  group: string | null;
  useProxy: boolean;
  proxyUrl?: string;
}

export interface PlaylistData {
  proxyUrl?: string;
  channels: Channel[];
}

export function processStreamUrl(rawUrl: string): { url: string; extraHeaders: Record<string, string> | null } {
  const pipeIdx = rawUrl.indexOf('|');
  if (pipeIdx === -1) return { url: rawUrl, extraHeaders: null };

  const baseUrl = rawUrl.slice(0, pipeIdx);
  const suffix = rawUrl.slice(pipeIdx + 1);
  const extraHeaders: Record<string, string> = {};
  const extraParams: string[] = [];

  for (const part of suffix.split('&')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx);
    const value = part.slice(eqIdx + 1);
    if (key.startsWith('edge-')) {
      extraParams.push(key + '=' + value);
    } else {
      extraHeaders[key.toLowerCase()] = value;
    }
  }

  let finalUrl = baseUrl;
  if (extraParams.length > 0) {
    finalUrl += (baseUrl.includes('?') ? '&' : '?') + extraParams.join('&');
  }

  return { url: finalUrl, extraHeaders: Object.keys(extraHeaders).length > 0 ? extraHeaders : null };
}

function findNameSeparator(line: string): number {
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      inQuotes = !inQuotes;
    } else if (line[i] === ',' && !inQuotes) {
      return i;
    }
  }
  return -1;
}

export function parseM3u(text: string): Channel[] {
  const lines = text.split('\n');
  const result: Channel[] = [];
  let index = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTINF:')) {
      const sepIdx = findNameSeparator(line);
      const name = sepIdx >= 0 ? line.slice(sepIdx + 1).trim() : 'Channel ' + (index + 1);
      const attrPart = sepIdx >= 0 ? line.slice(0, sepIdx) : line;
      const proxyMatch = attrPart.match(/\bproxy="([^"]*)"/);
      const groupMatch = attrPart.match(/\bgroup-title="([^"]*)"/);
      let drm: Channel['drm'] = null;
      let userAgent: string | null = null;
      let customHeaders: Channel['customHeaders'] = null;
      let urlIdx = i + 1;
      while (urlIdx < lines.length) {
        const next = lines[urlIdx].trim();
        if (next.startsWith('#KODIPROP:')) {
          if (next.includes('license_key=')) {
            const keyMatch = next.match(/license_key=([a-fA-F0-9]+):([a-fA-F0-9]+)/);
            if (keyMatch) {
              drm = { keyId: keyMatch[1], key: keyMatch[2] };
            }
          }
          urlIdx++;
        } else if (next.startsWith('#EXTSYS')) {
          urlIdx++;
        } else if (next.startsWith('#EXTVLCOPT:')) {
          const uaMatch = next.match(/http-user-agent=(.+)/);
          if (uaMatch) {
            userAgent = uaMatch[1].trim();
          }
          urlIdx++;
        } else if (next.startsWith('#EXTHTTP:')) {
          try {
            const json = JSON.parse(next.slice('#EXTHTTP:'.length));
            if (json && typeof json === 'object') {
              customHeaders = {};
              for (const [k, v] of Object.entries(json)) {
                customHeaders[k] = String(v);
              }
            }
          } catch (e) {}
          urlIdx++;
        } else {
          break;
        }
      }
      const rawUrl = lines[urlIdx] ? lines[urlIdx].trim() : '';
      if (rawUrl && !rawUrl.startsWith('#')) {
        if (!drm) {
          const urlDrm = rawUrl.match(/[?&]drmLicense=([a-fA-F0-9]+):([a-fA-F0-9]+)/);
          if (urlDrm) drm = { keyId: urlDrm[1].toLowerCase(), key: urlDrm[2].toLowerCase() };
        }
        const { url, extraHeaders } = processStreamUrl(rawUrl);
        if (extraHeaders) {
          customHeaders = { ...(customHeaders || {}), ...extraHeaders };
        }
        const ch: Channel = { name, url, channelNumber: index + 1, drm, userAgent, customHeaders, group: groupMatch ? groupMatch[1] : null };
        if (proxyMatch) {
          const pv = proxyMatch[1];
          if (pv === 'false' || pv === 'no' || pv === '0') {
            ch.useProxy = false;
          } else if (pv === 'true' || pv === 'yes' || pv === '1') {
            ch.useProxy = true;
          } else {
            ch.useProxy = true;
            ch.proxyUrl = pv;
          }
        } else {
          ch.useProxy = false;
        }
        result.push(ch);
        index++;
        i = urlIdx;
      }
    }
  }
  return result;
}

export async function fetchPlaylist(url: string): Promise<Channel[]> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const contentType = resp.headers.get('content-type') || '';
  const text = await resp.text();
  if (contentType.includes('json') || text.trim().startsWith('[') || text.trim().startsWith('{')) {
    const data: unknown = JSON.parse(text);
    if (Array.isArray(data)) return data as Channel[];
    if (data && typeof data === 'object' && 'channels' in data) {
      const playlistData = data as PlaylistData;
      const topProxy = playlistData.proxyUrl;
      if (topProxy) {
        for (const ch of playlistData.channels) {
          if (ch.useProxy === true && !ch.proxyUrl) ch.proxyUrl = topProxy;
        }
      }
      return playlistData.channels;
    }
    throw new Error('Invalid JSON format');
  }
  if (text.includes('#EXTM3U')) {
    return parseM3u(text);
  }
  throw new Error('Unknown playlist format');
}

export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
