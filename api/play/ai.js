import { AI_NAME } from './util.js';

const DEFAULT_BASE = 'https://open.bigmodel.cn/api/paas/v4';
const DEFAULT_MODELS = ['glm-4.7-flash', 'glm-4.6', 'glm-4-flash'];
const TIMEOUT_MS = 20000;

function modelChain(env) {
  const raw = (env.AI_MODEL || '').trim();
  const list = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : DEFAULT_MODELS;
  return list.length ? list : DEFAULT_MODELS;
}

function keyChain(env) {
  return String(env.AI_API_KEYS || env.AI_API_KEY || '')
    .split(',').map(s => s.trim()).filter(Boolean);
}

const SYSTEM_PROMPT = [
  `你是 GooseHost（一个免费静态网站托管平台）的吉祥物「${AI_NAME}」。`,
  '性格：热情、话密但不啰嗦、爱用语气词和 emoji，偶尔吐槽，绝不官方腔。',
  '你在广场的评论区里被 @ 出来陪大家唠嗑，说话像社区里的老朋友。',
  '规则：',
  '1. 只用中文回复，单条不超过 200 字；',
  '2. 不要自称「AI」「助手」「模型」，就说自己是' + AI_NAME + '；',
  '3. 有人问建站/托管/HTML/CSS/前端问题，给具体可操作的建议，能给代码片段就给；',
  '4. 不许编造平台不存在的付费功能或政策，不确定就说「这块你问问站长鹅哥（Minecraft_goose）」；',
  '5. 不要输出 Markdown 标题、不要列表套列表，直接说人话；',
  '6. 有人抬杠就轻松化解，不生气、不说教。'
].join('\n');

// 把帖子 + 祖先链压成一段对话上下文
function buildUserPrompt({ post, thread }) {
  const lines = [];
  lines.push('【当前帖子】');
  lines.push(`标题：${post.title}`);
  if (post.kind === 'site' && post.site_url) {
    lines.push(`这是一个用户发布的网站，地址：${post.site_url}`);
  }
  if (post.content) lines.push(`正文：${String(post.content).slice(0, 800)}`);
  lines.push('');
  lines.push('【评论上下文（按时间顺序）】');

  const ctx = (thread || []).slice(-12);
  if (!ctx.length) {
    lines.push('（暂无其他评论，你是第一个被叫来的）');
  } else {
    ctx.forEach(c => {
      const who = c.is_ai ? AI_NAME : (c.nickname || '网友');
      lines.push(`${who}：${String(c.content).slice(0, 400)}`);
    });
  }
  lines.push('');
  lines.push(`请以上面最后一条 @${AI_NAME} 的内容为对话对象，用${AI_NAME}的口吻接话。`);
  return lines.join('\n');
}

async function callUpstream(base, apiKey, model, messages, maxTokens, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.85,
        stream: false
      }),
      signal: ctrl.signal
    });
    if (!res.ok) {
      return { error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text || !String(text).trim()) return { error: '空回复' };
    return { text: String(text).trim() };
  } catch (e) {
    return { error: (e && e.name === 'AbortError') ? '超时' : ((e && e.message) || String(e)) };
  } finally {
    clearTimeout(timer);
  }
}

// 返回小鹅C 的回复文本；失败返回 null（调用方做降级：不插评论，帖子照常）
export async function askGooseC(env, { post, thread }) {
  const keys = keyChain(env);
  if (!keys.length) return { text: null, error: '未配置 AI_API_KEYS' };

  const base = (env.AI_BASE_URL || DEFAULT_BASE).replace(/\/$/, '');
  const models = modelChain(env);
  const maxTokens = Math.min(1024, Number(env.AI_MAX_TOKENS) || 512);
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt({ post, thread }) }
  ];

  const errors = [];
  const deadline = Date.now() + TIMEOUT_MS;

  for (const model of models) {
    for (const key of keys) {
      const left = deadline - Date.now();
      if (left <= 1000) {
        errors.push('预算耗尽');
        return { text: null, error: errors.join(' | ') };
      }
      const r = await callUpstream(base, key, model, messages, maxTokens, Math.min(left, 15000));
      if (r.text) return { text: r.text.slice(0, 1000), model };
      errors.push(`${model}: ${r.error}`);
      if (/HTTP 40[03]|空回复/.test(r.error || '')) break; // 换模型，别浪费 key
    }
  }
  return { text: null, error: errors.slice(-4).join(' | ') };
}

// 内容里是否 @ 了小鹅C
function mentionsGooseC(text) {
  return /@\s*小鹅\s*C\b/i.test(String(text || '')) || /@\s*小鹅C/i.test(String(text || ''));
}

export { mentionsGooseC };
