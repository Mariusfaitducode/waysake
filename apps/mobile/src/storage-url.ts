/** « tour.tail1234.ts.net » → « https://tour.tail1234.ts.net » ; une adresse IP locale reste en http. */
export function normalizeServer(input: string): string {
  let s = input.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(s)) s = (/^(\d{1,3}\.){3}\d{1,3}(:\d+)?$|^localhost(:\d+)?$/.test(s) ? "http://" : "https://") + s;
  return s;
}
