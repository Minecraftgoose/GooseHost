// 对外站点 URL 的基准地址。
// 通过 GooseHost 部署的站点统一经 page.goose.cc.cd 访问，因此默认基准为 https://page.goose.cc.cd。
// 若环境变量 API_URL 被显式配置为合法的完整 http(s) 地址则优先使用(便于自定义域名/预发环境)，
// 否则一律回退到官方站点域名，避免返回 goose.cc.cd/s/xxx 这类缺子域/协议的错误地址。
export function getPublicBaseUrl(env) {
  const cfg = (env && env.API_URL && env.API_URL.trim()) || '';
  if (/^https?:\/\/.+/i.test(cfg)) {
    return cfg.replace(/\/+$/, '');
  }
  return 'https://page.goose.cc.cd';
}
