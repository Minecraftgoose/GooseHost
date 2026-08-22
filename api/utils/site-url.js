export function getPublicBaseUrl(env) {
  const cfg = (env && env.API_URL && env.API_URL.trim()) || '';
  if (/^https?:\/\/.+/i.test(cfg)) {
    return cfg.replace(/\/+$/, '');
  }
  return 'https://page.goose.gs.cn';
}
