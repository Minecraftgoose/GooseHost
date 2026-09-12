export function getPublicBaseUrl(env) {
  const cfg = (env && env.API_URL && env.API_URL.trim()) || '';
  if (/^https?:\/\/.+/i.test(cfg)) {
    let base = cfg;
    while (base.endsWith('/')) base = base.slice(0, -1);
    return base;
  }
  return 'https://page.goose.cc.cd';
}
