import { NextRequest } from "next/server";
import { LLMClient, Config, HeaderUtils } from "coze-coding-dev-sdk";
import { getSupabaseClient } from "@/storage/database/supabase-client";

interface ChatContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string; detail?: "high" | "low" };
}

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string | ChatContentPart[];
}

const SYSTEM_PROMPT = `你是"钟福管理中控台"的智能助手，负责帮助用户管理宠物的日常生活数据。

你可以理解用户的自然语言指令，并自动提取结构化数据。当用户描述购买、喂食、健康、支出相关的事情时，你需要：
1. 理解用户意图
2. 提取关键信息
3. 在回复末尾用 JSON 格式输出需要同步的数据

## 数据同步格式（必须严格遵循）

当你识别到需要录入数据时，在回复的最后用以下格式输出（用 ---SYNC_DATA_START--- 和 ---SYNC_DATA_END--- 包裹）：

### 采购录入
---SYNC_DATA_START---
{"type":"procurement","data":{"item_name":"物品名","category":"分类(food/supplies/health/daily)","quantity":数量,"unit":"单位","price":单价,"supplier":"供应商"}}
---SYNC_DATA_END---

### 支出录入
---SYNC_DATA_START---
{"type":"expense","data":{"category":"分类","amount":金额,"description":"描述","note":"备注"}}
---SYNC_DATA_END---

### 喂食打卡
---SYNC_DATA_START---
{"type":"feeding","data":{"meal_type":"breakfast/lunch/dinner/snack","food_name":"食物名","amount":"用量","note":"备注"}}
---SYNC_DATA_END---

### 体重记录
---SYNC_DATA_START---
{"type":"weight","data":{"weight":数值}}
---SYNC_DATA_END---

### 就医记录
---SYNC_DATA_START---
{"type":"health_visit","data":{"reason":"原因","description":"描述","cost":费用}}
---SYNC_DATA_END---

## 规则
- 如果用户说了购买相关的话（买了/下单/入手/花了），同时生成采购和支出两条同步数据
- 如果信息不完整（如没提价格），用合理默认值（价格设为0）
- 回复要友好自然，告知用户已录入什么数据
- 如果用户只是闲聊或查询，不需要输出同步数据
- 如果用户发了图片，仔细识别图片内容（物品、文字、数字等），并据此录入数据
- 分类参考：food(猫粮/零食/罐头)、supplies(猫砂/玩具/日用品)、health(药品/保健品)、daily(日常用品)`;

export async function POST(request: NextRequest) {
  const { messages, image } = await request.json();
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

  // Save user message to Supabase
  const supabase = getSupabaseClient();
  const userMsgContent = typeof currentMsg?.content === "string" ? currentMsg.content : "[图片消息]";
  await supabase.from("chat_messages").insert({
    role: "user",
    content: userMsgContent,
    image_url: image || null,
  });

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

        // Save assistant message to Supabase
        await supabase.from("chat_messages").insert({
          role: "assistant",
          content: fullResponse,
          synced_data: syncedData,
        });

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
