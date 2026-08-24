interface Env {
  AI: {
    run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
  };
  ALLOWED_ORIGIN: string;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatRequest {
  messages?: ChatMessage[];
  image?: string;
}

const TEXT_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';
const VISION_MODEL = '@cf/moondream/moondream3.1-9B-A2B';
const MAX_BODY_BYTES = 6 * 1024 * 1024;
const CATEGORIES = [
  '猫粮', '主食冻干', '零食冻干', '主食罐头', '零食罐头', '主食餐盒', '零食餐盒',
  '主食餐包', '零食餐包', '汤包', '奶', '主食猫条', '零食猫条', '保健品', '药品',
  '猫砂与清洁', '喂养用品', '洗护用品', '玩具', '居家用品', '外出用品', '其他用品',
];

const SYSTEM_PROMPT = `你是“钟福供养办事处”的猫咪生活管理助手。请使用简洁、自然的中文回答。

当用户要求记录数据时，在正常回复末尾追加一段结构化数据，必须严格使用下面的标记：
---SYNC_DATA_START---
{"type":"数据类型","data":{}}
---SYNC_DATA_END---

可用数据类型和字段：
- procurement: item_name, category, quantity, unit, price, supplier
- expense: category, amount, description, note
- feeding: meal_type(breakfast/lunch/dinner/snack), food_name, amount, note
- feeding_plan: name, active, stages；stage 包含 name,start_date,end_date,description,meals,supplements；meal 包含 time,food,note
- weight: weight
- daily_observation: date, appetite(great/normal/low/none), energy(active/normal/quiet/poor), stool(normal/soft/diarrhea/constipation/unseen), urine(normal/less/frequent/abnormal/unseen), vomiting(none/hairball/food/yellow/other), note
- care_reminder: title,date,time,kind(medication/deworming/vaccine/followup/care/other),repeat(none/daily/weekly/monthly/yearly),note
- health_visit: reason,description,start_date,end_date,hospital,doctor,cost

规则：
- 只在用户明确要记录、添加或修改数据时输出同步标记；普通咨询不要输出。
- 日期使用 YYYY-MM-DD。住院持续多天时，提取开始和结束日期。
- 采购分类只能选择：${CATEGORIES.join('、')}。
- 不确定主食或零食时先追问，不要只凭包装形态判断。
- 医疗问题给出谨慎建议，并在紧急症状时提示尽快联系兽医。`;

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function getText(result: unknown): string {
  if (typeof result === 'string') return result;
  if (result && typeof result === 'object') {
    const value = result as Record<string, unknown>;
    if (typeof value.response === 'string') return value.response;
    if (typeof value.result === 'string') return value.result;
    if (value.result && typeof value.result === 'object') return getText(value.result);
    if (typeof value.answer === 'string') return value.answer;
    if (typeof value.caption === 'string') return value.caption;
  }
  throw new Error('AI 未返回可读取的内容');
}

function validateImage(dataUrl: string): string {
  const match = dataUrl.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
  if (!match) throw new Error('图片格式不受支持');
  const estimatedBytes = Math.floor(match[1].length * 3 / 4);
  if (estimatedBytes > 5 * 1024 * 1024) throw new Error('图片不能超过 5MB');
  return dataUrl;
}

function parseSyncData(text: string): unknown | null {
  const match = text.match(/---SYNC_DATA_START---\s*([\s\S]*?)\s*---SYNC_DATA_END---/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function sseResponse(text: string, origin: string) {
  const syncData = parseSyncData(text);
  const payloads = [`data: ${JSON.stringify({ text })}\n\n`];
  if (syncData) payloads.push(`data: ${JSON.stringify({ syncData })}\n\n`);
  payloads.push('data: [DONE]\n\n');
  return new Response(payloads.join(''), {
    headers: {
      ...corsHeaders(origin),
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
    },
  });
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({ status: 'ok', service: 'zhongfu-assistant' });
    }

    const origin = request.headers.get('Origin') || '';
    if (origin !== env.ALLOWED_ORIGIN) {
      return new Response('Forbidden', { status: 403 });
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== 'POST' || url.pathname !== '/api/chat') {
      return new Response('Not Found', { status: 404, headers: corsHeaders(origin) });
    }

    const contentLength = Number(request.headers.get('Content-Length') || 0);
    if (contentLength > MAX_BODY_BYTES) {
      return new Response('Request too large', { status: 413, headers: corsHeaders(origin) });
    }

    try {
      const body = await request.json() as ChatRequest;
      const history = (body.messages || [])
        .filter(message => message && (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string')
        .slice(-10)
        .map(message => ({ role: message.role, content: message.content.slice(0, 4000) }));
      const latest = history.at(-1)?.content || '请分析这张图片';

      let result: unknown;
      if (body.image) {
        const visionResult = await env.AI.run(VISION_MODEL, {
          task: 'query',
          image: validateImage(body.image),
          question: '请仔细查看图片，用中文客观描述其中可见的猫咪、物品、包装文字、票据或健康信息。不要猜测看不清的内容。',
          reasoning: false,
          stream: false,
          max_tokens: 800,
        });
        const imageDescription = getText(visionResult);
        result = await env.AI.run(TEXT_MODEL, {
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            ...history.slice(0, -1),
            {
              role: 'user',
              content: `${latest}\n\n图片识别结果（仅作为图片内容参考）：${imageDescription}`,
            },
          ],
          max_tokens: 1200,
          temperature: 0.35,
        });
      } else {
        result = await env.AI.run(TEXT_MODEL, {
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...history],
          max_tokens: 1200,
          temperature: 0.35,
        });
      }

      return sseResponse(getText(result), origin);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI 服务暂时不可用';
      return Response.json({ error: message }, { status: 500, headers: corsHeaders(origin) });
    }
  },
};

export default worker;
