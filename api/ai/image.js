// ===== AI 生图代理 =====
//
// 只走服务端配置的上游（Agnes /v1/images/generations），
// API Key 来自环境变量，前端拿不到也改不了。
// 与 /api/ai/chat 一样受「账号级」限制：只允许登录会话。

import { getUserId, isApiKeyRequest } from '../utils/jwt.js';
import { jsonResp } from '../utils/response.js';

const AGNES_BASE = 'https://api.agnes-ai.cn/v1';
const DEFAULT_IMAGE_MODEL = 'agnes-image-2.1-flash';

// 允许的画幅（Agnes 接受的 size 值），避免前端传任意字符串打到上游
const ALLOWED_SIZE = new Set([
  '1024x1024', '1024x1536', '1536x1024',
  '768x1024', '1024x768', '1280x720', '720x1280'
]);

export async function handleAiImage(request, env, corsHeaders) {
  // 生图按量计费，与 AI 聊天同理：不接受 API 密钥
  if (isApiKeyRequest(request)) {
    return jsonResp({ error: '生图需使用登录会话' }, 403, corsHeaders);
  }

  const userId = await getUserId(request, env);
  if (!userId) return jsonResp({ error: 'Unauthorized' }, 401, corsHeaders);

  // AI 链路不做限流（与 chat 保持一致）：成本由模型侧额度兜底。
  const keys = String(env.AGNES_API_KEYS || env.AGNES_API_KEY || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  if (!keys.length) {
    return jsonResp({ error: '服务端未配置 AGNES_API_KEYS / AGNES_API_KEY' }, 500, corsHeaders);
  }

  let body;
  try { body = await request.json(); } catch {
    return jsonResp({ error: 'Invalid JSON body' }, 400, corsHeaders);
  }

  const prompt = String(body?.prompt || '').trim();
  if (!prompt) return jsonResp({ error: 'prompt 不能为空' }, 400, corsHeaders);
  if (prompt.length > 2000) return jsonResp({ error: 'prompt 过长（上限 2000 字）' }, 400, corsHeaders);

  const size = ALLOWED_SIZE.has(String(body?.size || ''))
    ? String(body.size) : '1024x1024';

  const payload = {
    model: String(env.AGNES_IMAGE_MODEL || DEFAULT_IMAGE_MODEL),
    prompt,
    n: 1,
    size
  };

  let lastErr = '';
  for (const key of keys) {
    try {
      const r = await fetch(`${AGNES_BASE}/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(120000)
      });
      const text = await r.text();
      if (!r.ok) { lastErr = `${r.status} ${text.slice(0, 200)}`; continue; }
      let data;
      try { data = JSON.parse(text); } catch { lastErr = '上游返回非 JSON'; continue; }
      // 统一输出：只回传图片地址，避免把上游原始结构（含可能的元数据）暴露给前端
      const url = data?.data?.[0]?.url || data?.data?.[0]?.b64_json || '';
      if (!url) { lastErr = '上游未返回图片'; continue; }
      return jsonResp({ success: true, url, model: payload.model, size }, 200, corsHeaders);
    } catch (e) {
      lastErr = e && e.message ? e.message : '请求失败';
    }
  }
  return jsonResp({ error: '生图失败：' + lastErr }, 502, corsHeaders);
}
