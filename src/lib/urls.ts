
export function applyQueryParam(url: string, prop: string, value: string) {
  if (!url) return url;
  return url.includes('?')
    ? `${url}&${prop}=${value}`
    : `${url}?${prop}=${value}`;
}
