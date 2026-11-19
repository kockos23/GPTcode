const SAFE_DOCUMENT_STYLE = `<style>
html{color-scheme:light}body{max-width:760px;margin:0 auto;padding:20px;background:#fff;color:#171525;font:15px/1.55 Arial,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}a{color:#8b005a}blockquote{margin-left:0;padding-left:14px;border-left:3px solid #ddd;color:#555}.remote-image{display:inline-block;padding:6px 9px;border:1px dashed #aaa;border-radius:6px;color:#666;font-size:12px}
</style>`

export function sanitizeEmailHtml(input: string, allowRemoteImages = false): string {
  let html = String(input || "").slice(0, 250000)
  html = html
    .replace(/<!doctype[^>]*>/gi, "")
    .replace(/<!--([\s\S]*?)-->/g, "")
    .replace(/<(script|iframe|object|embed|form|input|button|textarea|select|video|audio|canvas)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|iframe|object|embed|form|input|button|textarea|select|video|audio|canvas)\b[^>]*\/?\s*>/gi, "")
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, "")
    .replace(/<link\b[^>]*>/gi, "")
    .replace(/\s(?:on[a-z]+|srcdoc|formaction)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\b(href|action)\s*=\s*(["'])\s*(?:javascript|data|vbscript):[\s\S]*?\2/gi, '$1="#"')
    .replace(/@import\s+[^;]+;?/gi, "")
    .replace(/url\s*\(\s*(["']?)https?:[^)]*\1\s*\)/gi, "none")

  if (!allowRemoteImages) {
    html = html.replace(/<img\b([^>]*?)\bsrc\s*=\s*(["'])(https?:\/\/[^"']+)\2([^>]*)>/gi,
      (_match, before, _quote, _url, after) => `<span class="remote-image"${before}${after}>Vzdialený obrázok je zablokovaný</span>`)
  }
  if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b[^>]*>/i, match => match + SAFE_DOCUMENT_STYLE)
  return `<!doctype html><html><head><meta charset="utf-8">${SAFE_DOCUMENT_STYLE}</head><body>${html}</body></html>`
}
