// ===== 通用响应 =====

function jsonResp(data, status, corsHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}

export { jsonResp };
