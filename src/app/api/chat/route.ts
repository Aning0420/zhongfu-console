import { NextRequest } from "next/server";
import { INVENTORY_CATEGORIES } from "@/lib/inventory-categories";

interface ChatContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string; detail?: "high" | "low" };
}

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string | ChatContentPart[];
}

const SYSTEM_PROMPT = `你是"钟福供养办事处"的猫咪管理助手，负责帮助用户管理多只猫咪的日常生活数据。上下文中的 activeCat 是当前正在操作的猫咪；喂食、健康和普通支出应针对当前猫咪，不要把不同猫咪的记录混在一起。采购与库存属于家庭共用，不区分猫咪。

你可以理解用户的自然语言指令，并自动提取结构化数据。当用户描述购买、喂食、健康、支出相关的事情时，你需要：
1. 理解用户意图
2. 提取关键信息
3. 在回复末尾用 JSON 格式输出需要同步的数据

## 数据同步格式（必须严格遵循）

当你识别到需要录入数据时，在回复的最后用以下格式输出（用 ---SYNC_DATA_START--- 和 ---SYNC_DATA_END--- 包裹）：

### 采购录入
---SYNC_DATA_START---
{"type":"procurement","data":{"brand":"品牌或空字符串","item_name":"具体物品名或口味","item_group":"系列/大标题或空字符串","category":"物品细分类","quantity":数量,"unit":"单位","package_size":每个库存单位内含数量或null,"package_unit":"片/粒/g等或空字符串","total_price":本次实付总价,"supplier":"供应商","product_benefits":"包装宣称或常见用途","suitable_life_stages":"适合的猫咪阶段","feeding_guidance":"按包装和兽医建议整理的喂食提示"}}
---SYNC_DATA_END---

### 支出录入
---SYNC_DATA_START---
{"type":"expense","data":{"category":"分类","amount":金额,"description":"描述","note":"备注"}}
---SYNC_DATA_END---

### 喂食打卡
---SYNC_DATA_START---
{"type":"feeding","data":{"meal_type":"breakfast/lunch/dinner/snack","food_name":"食物名","amount":"用量","medication":"药物名和用量或空字符串","note":"备注"}}
---SYNC_DATA_END---

### 喂食计划
---SYNC_DATA_START---
{"type":"feeding_plan","data":{"name":"计划名","active":true,"stages":[{"name":"阶段名","start_date":"YYYY-MM-DD","end_date":"YYYY-MM-DD","description":"说明","meals":[{"time":"08:00","food":"主粮45g＋益生菌1g","medication":"速诺0.5片","note":"饭后服用"}],"supplements":"营养补充"}]}}
---SYNC_DATA_END---

### 体重记录
---SYNC_DATA_START---
{"type":"weight","data":{"weight":数值}}
---SYNC_DATA_END---

### 每日健康观察
---SYNC_DATA_START---
{"type":"daily_observation","data":{"date":"YYYY-MM-DD","appetite":"great/normal/low/none","energy":"active/normal/quiet/poor","stool":"normal/soft/diarrhea/constipation/unseen","urine":"normal/less/frequent/abnormal/unseen","vomiting":"none/hairball/food/yellow/other","note":"补充说明"}}
---SYNC_DATA_END---

### 照护提醒
---SYNC_DATA_START---
{"type":"care_reminder","data":{"title":"提醒事项","date":"YYYY-MM-DD","time":"HH:mm","kind":"medication/deworming/vaccine/followup/care/other","repeat":"none/daily/weekly/monthly/yearly","note":"备注"}}
---SYNC_DATA_END---

### 就医记录
---SYNC_DATA_START---
{"type":"health_visit","data":{"reason":"原因","description":"描述","start_date":"YYYY-MM-DD","end_date":"YYYY-MM-DD或空字符串","hospital":"医院","doctor":"医生","cost":费用}}
---SYNC_DATA_END---

## 规则
- 采购中的 total_price 是整次购买的实付总额，不是单价；例如“1.8kg共109元”应提取 quantity=1.8、unit=kg、total_price=109
- 药品优先按实际消耗的最小单位入库；例如“1盒速诺，每盒20片”优先提取 quantity=20、unit=片，package_size=null、package_unit=""，这样每次0.5片可以直接扣减；只有用户明确要求按盒管理时才使用包装换算
- 采购会由应用自动同步支出，不要再额外生成一条支出数据
- 如果信息不完整（如没提总价），用合理默认值（总价设为0）
- 回复要友好自然，告知用户已录入什么数据
- 如果用户只是闲聊或查询，不需要输出同步数据
- 如果用户发了图片，仔细识别图片内容（物品、文字、数字等），并据此录入数据
- 识别商品图片时，采购数据可额外填写 product_benefits、suitable_life_stages、feeding_guidance；这些只能根据包装可见信息整理，不确定就留空，不要把包装宣称当成医疗诊断
- 住院或连续治疗要提取开始和结束日期；用户只说持续天数时，根据开始日期计算包含首尾的结束日期
- 用户要求制定、添加或修改喂食安排时，输出 feeding_plan；每个阶段至少包含一餐
- 喂食计划中，meal.food 必须填写这一餐所有实际消耗的食物、奶粉和营养补充剂及用量，例如“澳龙处方粮10g＋麦德氏K41羊奶粉5g＋乳铁蛋白0.225g＋K09益生菌1g”；药品必须独立填写在对应餐次的 meal.medication，格式为“准确药名＋用量”，例如“速诺0.5片”，没有药品则填空字符串；温水、服用方式等不消耗库存的内容放在 meal.note
- meal.medication 中的药名优先使用当前库存里已有药品的完整名称，避免简称和商品名不一致导致无法扣减
- 用户描述当天的食欲、精神、便便、排尿或呕吐情况时，输出 daily_observation
- 用户说“提醒我”或提到未来的用药、驱虫、疫苗、复查日期时，输出 care_reminder
- 采购分类必须从以下细分类中选择：${INVENTORY_CATEGORIES.join('、')}
- 判断主食或零食时以包装上的营养用途为准；无法判断的湿粮优先根据用户原话追问，不要把包装形态当作营养用途`;

export async function POST(request: NextRequest) {
  const { messages, image } = await request.json();
  const { LLMClient, Config, HeaderUtils } = await import("coze-coding-dev-sdk");
  const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);

  const config = new Config();
  const client = new LLMClient(config, customHeaders);

  // Build LLM messages
  const llmMessages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  // Add conversation history (last 10 messages for context)
  const historyMessages = messages.slice(-10);
  for (const msg of historyMessages) {
    if (msg.role === "user" || msg.role === "assistant") {
      llmMessages.push({ role: msg.role, content: msg.content });
    }
  }

  // Add current user message with optional image
  const currentMsg = messages[messages.length - 1];
  if (currentMsg?.role === "user") {
    if (image) {
      llmMessages.push({
        role: "user",
        content: [
          { type: "text", text: currentMsg.content || "请识别这张图片中的内容" },
          { type: "image_url", image_url: { url: image, detail: "high" } },
        ],
      });
    } else if (!historyMessages.includes(currentMsg)) {
      llmMessages.push({ role: "user", content: currentMsg.content });
    }
  }

  // Stream response
  const stream = client.stream(llmMessages, {
    model: "doubao-seed-1-8-251228",
    temperature: 0.7,
  });

  const encoder = new TextEncoder();
  let fullResponse = "";

  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (chunk.content) {
            const text = chunk.content.toString();
            fullResponse += text;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text })}\n\n`)
            );
          }
        }

        // Parse and save sync data
        const syncDataMatch = fullResponse.match(
          /---SYNC_DATA_START---\n?([\s\S]*?)\n?---SYNC_DATA_END---/
        );
        let syncedData = null;
        if (syncDataMatch) {
          try {
            syncedData = JSON.parse(syncDataMatch[1]);
          } catch {
            // ignore parse errors
          }
        }

        // Send sync data to frontend
        if (syncedData) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ syncData: syncedData })}\n\n`
            )
          );
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Unknown error";
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: errMsg })}\n\n`
          )
        );
        controller.close();
      }
    },
  });

  return new Response(readableStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
