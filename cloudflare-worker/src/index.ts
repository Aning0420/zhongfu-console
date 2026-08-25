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
  context?: string;
}

const TEXT_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';
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
- feeding: meal_type(breakfast/lunch/dinner/snack), food_name, amount, remaining_amount(可选), note
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
- 回答涉及“现在、今天、当前库存、当前计划、最近体重”等问题时，优先使用应用数据摘要，不要让用户重复提供已有记录。
- 不要声称已经记录数据，除非同时输出了完整同步标记。
- 用户提供医生制定的用药或恢复计划时应忠实保留，不擅自改变剂量或疗程；可以提示风险，但不要覆盖原计划。
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
  return (
    /(饮食|喂食)计划/.test(text) && /(添加|记录|录入|保存|创建|编辑|修改|帮我)/.test(text)
  ) || (/计划名称\s*[:：]/.test(text) && /阶段\s*1\s*[:：]/.test(text));
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return toIsoDate(value);
}

function parseExplicitFeedingPlan(text: string): Record<string, unknown> | null {
  const normalized = text.replace(/\r\n?/g, '\n').replace(/[–—−]/g, '-');
  const planName = normalized.match(
    /计划名称\s*[:：]\s*(.*?)(?=\s*(?:固定喂食时间|计划周期|阶段\s*1)\s*[:：]|\n|$)/
  )?.[1]?.trim() || '钟福喂食计划';
  const stagePattern = /(?:^|\n|[ \t])阶段\s*(\d+)\s*[:：]\s*(.*?)(?=\s*(?:(?:开始日期|日期)\s*[:：]|\n|$))/g;
  const matches = [...normalized.matchAll(stagePattern)];
  if (matches.length === 0) return null;

  const fixedTimes = [...new Set(
    [...normalized.slice(0, matches[0].index).matchAll(/(\d{2}:\d{2})\s+(?:早餐|午餐|晚餐)/g)]
      .map(match => match[1])
  )];
  const mealTimes = fixedTimes.length > 0 ? fixedTimes : ['08:00', '13:00', '22:00'];
  const prelude = normalized.slice(0, matches[0].index)
    .replace(/^\s*计划名称[^\n]*\n?/m, '')
    .replace(/^\s*固定喂食时间[^\n]*\n?/m, '')
    .replace(/^\s*[-*]?\s*\d{2}:\d{2}\s+(?:早餐|午餐|晚餐)\s*$/gm, '')
    .trim();

  let previousEnd = '';
  const today = toIsoDate(new Date());
  const stages = matches.map((match, index) => {
    const blockStart = match.index ?? 0;
    const blockEnd = matches[index + 1]?.index ?? normalized.length;
    const block = normalized.slice(blockStart, blockEnd).replace(/\\\s*$/gm, '').trim();
    const explicitDates = block.match(/\d{4}-\d{2}-\d{2}/g) || [];
    const startDate = explicitDates[0] || (previousEnd ? addDays(previousEnd, 1) : today);

    const durationEnds = [
      ...[...block.matchAll(/第\s*(\d+)(?:\s*[～~\-至]\s*(\d+))?\s*天/g)]
        .map(value => Number(value[2] || value[1])),
      ...[...block.matchAll(/(?:^|[^第\d])(\d+)\s*[～~\-至]\s*(\d+)\s*天/g)]
        .map(value => Number(value[2])),
    ].filter(value => Number.isFinite(value) && value > 0);
    const duration = durationEnds.length > 0 ? Math.max(...durationEnds) : 1;
    const endDate = explicitDates[1]
      || (index === matches.length - 1 ? '2099-12-31' : addDays(startDate, duration - 1));
    previousEnd = endDate;

    const timedMeals = [...block.matchAll(
      /(?:^|\n|\s)(\d{2}:\d{2})\s*[｜|]\s*([^\n]*?)(?=\s+(?:\d{2}:\d{2}\s*[｜|]|营养补充\s*[:：]|阶段说明\s*[:：]|进入条件\s*[:：]|设为当前计划\s*[:：])|\n|$)/g
    )].map(value => {
      const parts = value[2].split(/[｜|]/).map(part => part.trim()).filter(Boolean);
      return {
        time: value[1],
        food: parts[0] || '按本阶段说明执行',
        note: parts.slice(1).join('；'),
      };
    });
    const meals = timedMeals.length > 0
      ? timedMeals
      : mealTimes.map(time => ({ time, food: '按本阶段说明执行', note: '' }));
    const supplementLines = block.split('\n')
      .map(line => line.replace(/^\s*[-*]\s*/, '').trim())
      .filter(line => /^(?:营养补充|补充剂|用药)\s*[:：]/.test(line));
    const description = [index === 0 ? prelude : '', block]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 8_000);

    return {
      name: `阶段${match[1]}：${match[2].trim()}`,
      start_date: startDate,
      end_date: endDate,
      description,
      meals,
      supplements: supplementLines.join('；').slice(0, 2_000),
    };
  });

  return {
    name: planName,
    active: /设为当前计划\s*[:：]\s*是/.test(normalized),
    stages,
  };
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

function isDataMutationRequest(text: string): boolean {
  return /(记录|添加|录入|保存|创建|修改|更新|删除|设为当前)/.test(text);
}

function sseResponse(text: string, origin: string, allowSync = true) {
  const parsedSyncData = parseSyncData(text);
  const syncData = allowSync ? parsedSyncData : null;
  const hasSyncMarker = text.includes('---SYNC_DATA_START---');
  const safeText = hasSyncMarker
    ? text.replace(/\s*---SYNC_DATA_START---[\s\S]*$/, '').trim()
      || (parsedSyncData ? '已处理。' : '这份计划没有完整解析，请缩短内容或分阶段发送。')
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
      const appContext = typeof body.context === 'string' ? body.context.slice(0, 8_000) : '';
      const contextualPrompt = appContext
        ? `${SYSTEM_PROMPT}\n\n以下是钟福供养办事处当前应用数据摘要，仅用于回答当前问题：\n${appContext}`
        : SYSTEM_PROMPT;

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
            { role: 'system', content: contextualPrompt },
            ...history.slice(0, -1),
            {
              role: 'user',
              content: `${latest}\n\n图片识别结果（仅作为图片内容参考）：${imageDescription}`,
            },
          ],
          max_tokens: 1200,
          temperature: 0.35,
        });
      } else if (isFeedingPlanEntry(latest)) {
        const explicitPlan = parseExplicitFeedingPlan(latest);
        if (explicitPlan) {
          const responseText = `已按原文保存“${String(explicitPlan.name)}”，共 ${Array.isArray(explicitPlan.stages) ? explicitPlan.stages.length : 0} 个阶段。\n\n---SYNC_DATA_START---\n${JSON.stringify({ type: 'feeding_plan', data: explicitPlan })}\n---SYNC_DATA_END---`;
          return sseResponse(responseText, origin);
        }
        const structuredMessages = [
          {
            role: 'system',
            content: '从对话中提取用户明确提供的喂食计划。只保留实际出现的阶段、日期、餐次和注意事项，不得自行补充阶段或日期。日期使用 YYYY-MM-DD。每餐的克数和冲泡方式写入 food 或 note。reply 只写一句简短确认。',
          },
          ...history,
        ];
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            const structuredResult = await env.AI.run(STRUCTURED_MODEL, {
              messages: structuredMessages,
              response_format: { type: 'json_schema', json_schema: FEEDING_PLAN_SCHEMA },
              max_tokens: 1200,
              temperature: 0,
              seed: 42 + attempt,
            });
            return sseResponse(formatFeedingPlanResult(structuredResult), origin);
          } catch {
            if (attempt === 2) throw new Error('饮食计划没有完整解析，请重新发送一次');
          }
        }
      } else {
        result = await env.AI.run(TEXT_MODEL, {
          messages: [{ role: 'system', content: contextualPrompt }, ...history],
          max_tokens: 1200,
          temperature: 0.35,
        });
      }

      return sseResponse(getText(result), origin, isDataMutationRequest(latest));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI 服务暂时不可用';
      return Response.json({ error: message }, { status: 500, headers: corsHeaders(origin) });
    }
  },
};

export default worker;
