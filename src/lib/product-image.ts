import { normalizeInventoryCategory } from '@/lib/inventory-categories';

export interface ProductImageAnalysis {
  itemName?: string;
  itemGroup?: string;
  category?: string;
  quantity?: number;
  unit?: string;
  packageSize?: number;
  packageUnit?: string;
  totalPrice?: number;
  supplier?: string;
  productBenefits?: string;
  suitableLifeStages?: string;
  feedingGuidance?: string;
}

const CHAT_API_URL = process.env.NEXT_PUBLIC_CHAT_API_URL || '/api/chat';

/** Keep photos small enough for localStorage, cloud sync, and the vision API. */
export function compressProductImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('请选择图片文件'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.onload = () => {
      const source = String(reader.result || '');
      const image = new Image();
      image.onerror = () => reject(new Error('图片格式无法读取'));
      image.onload = () => {
        const maxSide = 900;
        const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
        let width = Math.max(1, Math.round(image.naturalWidth * scale));
        let height = Math.max(1, Math.round(image.naturalHeight * scale));
        const render = (quality: number) => {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d');
          if (!context) return source;
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, width, height);
          context.drawImage(image, 0, 0, width, height);
          return canvas.toDataURL('image/jpeg', quality);
        };

        // Four photos still need to fit inside the 2MB cloud snapshot limit.
        const maxDataUrlLength = 300_000;
        let quality = 0.7;
        let result = render(quality);
        while (result.length > maxDataUrlLength && quality > 0.46) {
          quality -= 0.08;
          result = render(quality);
        }
        while (result.length > maxDataUrlLength && Math.max(width, height) > 520) {
          width = Math.max(1, Math.round(width * 0.84));
          height = Math.max(1, Math.round(height * 0.84));
          result = render(0.54);
        }
        resolve(result);
      };
      image.src = source;
    };
    reader.readAsDataURL(file);
  });
}

function readSseResponse(response: Response): Promise<{ text: string; syncData: unknown | null }> {
  return new Promise(async (resolve, reject) => {
    try {
      const reader = response.body?.getReader();
      if (!reader) throw new Error('助手返回内容不完整');
      const decoder = new TextDecoder();
      let buffer = '';
      let text = '';
      let syncData: unknown | null = null;
      const process = (line: string) => {
        if (!line.startsWith('data: ')) return;
        const payload = line.slice(6).trim();
        if (!payload || payload === '[DONE]') return;
        try {
          const data = JSON.parse(payload) as { text?: string; syncData?: unknown };
          if (typeof data.text === 'string') text += data.text;
          if (data.syncData) syncData = data.syncData;
        } catch {
          // The stream can split a line; the complete line is processed next.
        }
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        lines.forEach(process);
      }
      buffer += decoder.decode();
      if (buffer) process(buffer);
      resolve({ text, syncData });
    } catch (error) {
      reject(error);
    }
  });
}

function stringValue(value: unknown): string | undefined {
  const result = String(value ?? '').trim();
  return result || undefined;
}

function numberValue(value: unknown): number | undefined {
  const result = Number(value);
  return Number.isFinite(result) && result > 0 ? result : undefined;
}

function parseMarkedData(text: string): unknown | null {
  const match = text.match(/---SYNC_DATA_START---\s*([\s\S]*?)\s*---SYNC_DATA_END---/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export async function analyzeProductImage(image: string): Promise<ProductImageAnalysis> {
  const response = await fetch(CHAT_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{
        role: 'user',
        content: '请识别并录入这张商品包装图中的采购资料。不要创建喂食计划，不要输出额外建议。若看不清请留空，不要猜测。',
      }],
      image,
    }),
  });
  if (!response.ok) throw new Error(`图片识别服务暂不可用（${response.status}）`);
  const result = await readSseResponse(response);
  const parsed = (result.syncData || parseMarkedData(result.text)) as { type?: string; data?: Record<string, unknown> } | null;
  if (!parsed?.data || parsed.type !== 'procurement') {
    throw new Error('没有识别到完整商品资料，请补充拍摄正面或配料表');
  }
  const data = parsed.data;
  return {
    itemName: stringValue(data.item_name),
    itemGroup: stringValue(data.item_group),
    category: data.category ? normalizeInventoryCategory(data.category) : undefined,
    quantity: numberValue(data.quantity),
    unit: stringValue(data.unit),
    packageSize: numberValue(data.package_size),
    packageUnit: stringValue(data.package_unit),
    totalPrice: numberValue(data.total_price),
    supplier: stringValue(data.supplier),
    productBenefits: stringValue(data.product_benefits),
    suitableLifeStages: stringValue(data.suitable_life_stages),
    feedingGuidance: stringValue(data.feeding_guidance),
  };
}

/** Read all saved package photos, keeping the first photo's values when images disagree. */
export async function analyzeProductImages(images: string[]): Promise<ProductImageAnalysis> {
  const results = await Promise.allSettled(images.map(image => analyzeProductImage(image)));
  const successful = results
    .filter((result): result is PromiseFulfilledResult<ProductImageAnalysis> => result.status === 'fulfilled')
    .map(result => result.value);
  if (successful.length === 0) {
    const firstFailure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    throw firstFailure?.reason instanceof Error ? firstFailure.reason : new Error('图片识别失败');
  }
  return successful.reduce<ProductImageAnalysis>((combined, current) => ({
    itemName: combined.itemName || current.itemName,
    itemGroup: combined.itemGroup || current.itemGroup,
    category: combined.category || current.category,
    quantity: combined.quantity || current.quantity,
    unit: combined.unit || current.unit,
    packageSize: combined.packageSize || current.packageSize,
    packageUnit: combined.packageUnit || current.packageUnit,
    totalPrice: combined.totalPrice ?? current.totalPrice,
    supplier: combined.supplier || current.supplier,
    productBenefits: combined.productBenefits || current.productBenefits,
    suitableLifeStages: combined.suitableLifeStages || current.suitableLifeStages,
    feedingGuidance: combined.feedingGuidance || current.feedingGuidance,
  }), {});
}
