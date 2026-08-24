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
const STRUCTURED_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';
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
- 饮食计划只提取用户实际提供的阶段、日期和餐次，绝对不要自行新增或推测阶段二、阶段三等内容。
- feeding_plan 的 supplements 必须是普通字符串；meal 只使用 time、food、note，其中食物、克数和冲泡方式都可合并写入 food 或 note。
- 结构化数据必须是一个完整、紧凑、有效的 JSON 对象，不要在 JSON 中插入第二个数组或额外说明。
- 信息足够时直接简短确认并输出同步数据；信息不足时只追问缺少的信息，不要同时输出同步数据。
- 日期使用 YYYY-MM-DD。住院持续多天时，提取开始和结束日期。
- 采购分类只能选择：${CATEGORIES.join('、')}。
- 不确定主食或零食时先追问，不要只凭包装形态判断。
- 医疗问题给出谨慎建议，并在紧急症状时提示尽快联系兽医。`;

const FEEDING_PLAN_SCHEMA = {
  name: 'feeding_plan_response',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['reply', 'plan'],
    properties: {
      reply: { type: 'string' },
      plan: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'active', 'stages'],
        properties: {
          name: { type: 'string' },
          active: { type: 'boolean' },
          stages: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'start_date', 'end_date', 'description', 'meals', 'supplements'],
              properties: {
                name: { type: 'string' },
                start_date: { type: 'string' },
                end_date: { type: 'string' },
                description: { type: 'string' },
                meals: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['time', 'food', 'note'],
                    properties: {
                      time: { type: 'string' },
                      food: { type: 'string' },
                      note: { type: 'string' },
                    },
                  },
                },
                supplements: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
};

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
    if (Array.isArray(value.choices)) {
      const first = value.choices[0];
      if (first && typeof first === 'object') {
        const choice = first as Record<string, unknown>;
        if (typeof choice.text === 'string') return choice.text;
        if (choice.message && typeof choice.message === 'object') {
          const message = choice.message as Record<string, unknown>;
          if (typeof message.content === 'string') return message.content;
        }
      }
    }
  }
  throw new Error('AI 未返回可读取的内容');
}

function formatFeedingPlanResult(result: unknown): string {
  const raw = getText(result).trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  const parsed = JSON.parse(raw) as { reply?: unknown; plan?: unknown };
  if (!parsed.plan || typeof parsed.plan !== 'object') throw new Error('饮食计划解析不完整');
  const plan = parsed.plan as Record<string, unknown>;
  if (!Array.isArray(plan.stages) || plan.stages.length === 0) throw new Error('饮食计划缺少阶段或餐次');
  const reply = typeof parsed.reply === 'string' && parsed.reply.trim()
    ? parsed.reply.trim()
    : '饮食计划已经整理完成。';
  return `${reply}\n\n---SYNC_DATA_START---\n${JSON.stringify({ type: 'feeding_plan', data: plan })}\n---SYNC_DATA_END---`;
}

function isFeedingPlanEntry(text: string): boolean {
  return /(饮食|喂食)计划/.test(text) && /(添加|记录|录入|保存|创建|编辑|修改|帮我)/.test(text);
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
  const safeText = !syncData && text.includes('---SYNC_DATA_START---')
    ? text.replace(/---SYNC_DATA_START---[\s\S]*$/, '').trim()
      || '这份计划没有完整解析，请缩短内容或分阶段发送。'
    : text;
  const payloads = [`data: ${JSON.stringify({ text: safeText })}\n\n`];
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
      const validMessages = (body.messages || [])
        .filter(message => message && (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string')
        .slice(-8);
      const history = validMessages.map((message, index) => ({
        role: message.role,
        content: message.content.slice(0, index === validMessages.length - 1 ? 12_000 : 3_000),
      }));
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
          max_tokens: 2000,
          temperature: 0.35,
        });
      } else if (isFeedingPlanEntry(latest)) {
        const structuredMessages = [
          {
            role: 'system',
            content: '从对话中提取用户明确提供的喂食计划。只保留实际出现的阶段、日期、餐次和注意事项，不得自行补充阶段或日期。日期使用 YYYY-MM-DD。每餐的克数和冲泡方式写入 food 或 note。reply 只写一句简短确认。',
          },
          ...history,
        ];
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const structuredResult = await env.AI.run(STRUCTURED_MODEL, {
            messages: structuredMessages,
            response_format: { type: 'json_schema', json_schema: FEEDING_PLAN_SCHEMA },
            max_tokens: 1200,
            temperature: 0,
            seed: 42 + attempt,
          });
          try {
            return sseResponse(formatFeedingPlanResult(structuredResult), origin);
          } catch {
            if (attempt === 2) throw new Error('饮食计划没有完整解析，请重新发送一次');
          }
        }
      } else {
        result = await env.AI.run(TEXT_MODEL, {
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...history],
          max_tokens: 2000,
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
