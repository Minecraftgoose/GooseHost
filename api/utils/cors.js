// ===== CORS 配置 =====

const ALLOWED_ORIGINS = [
  'https://host.goose.cc.cd',
  'https://chat.goose.cc.cd',
  'https://0bd05515.gh-site-frontend.pages.dev',
  'https://fd8f279a.gh-site-frontend.pages.dev',
  'https://c5d1aff2.gh-site-frontend.pages.dev',
  'https://9a2676c5.gh-site-frontend.pages.dev',
  'https://2a9941ab.gh-site-frontend.pages.dev',
];

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

export { ALLOWED_ORIGINS, getCorsHeaders };
