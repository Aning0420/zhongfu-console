export interface Order {
  id: string;
  itemName: string;
  category: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  /** Amount actually paid for this purchase. Older records only have unitPrice. */
  totalPrice?: number;
  purchaseDate: string;
  status: 'pending' | 'shipped' | 'delivered' | 'durable' | 'finished' | 'cancelled';
  consumed: number;
  consumedBeforeFinished?: number;
  consumedBeforeDurable?: number;
  repurchasedAt?: string;
  supplier: string;
  productionDate?: string;
  shelfLife?: number; // days
  dailyUsage?: number; // average daily consumption
}

export interface PriceHistory {
  lastUnitPrice: number;
  lowestUnitPrice: number;
  changePercent: number;
  isHistoricalLow: boolean;
}

export function orderTotalPrice(order: Order): number {
  if (Number.isFinite(order.totalPrice) && (order.totalPrice ?? 0) >= 0) {
    return order.totalPrice ?? 0;
  }
  return order.quantity * order.unitPrice;
}

function normalizeProductIdentity(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s\-_/·.,，。()（）]+/g, '');
}

export function getPriceHistory(
  itemName: string,
  unit: string,
  currentUnitPrice: number,
  orders: Order[],
): PriceHistory | null {
  if (!itemName.trim() || !unit.trim() || !Number.isFinite(currentUnitPrice) || currentUnitPrice <= 0) return null;

  const normalizedName = normalizeProductIdentity(itemName);
  const normalizedUnit = normalizeProductIdentity(unit);
  const matches = orders.filter(order =>
    order.status !== 'cancelled'
    && order.unitPrice > 0
    && normalizeProductIdentity(order.itemName) === normalizedName
    && normalizeProductIdentity(order.unit) === normalizedUnit
  );
  if (matches.length === 0) return null;

  const lastUnitPrice = matches[matches.length - 1].unitPrice;
  const lowestUnitPrice = Math.min(...matches.map(order => order.unitPrice));
  return {
    lastUnitPrice,
    lowestUnitPrice,
    changePercent: ((currentUnitPrice - lastUnitPrice) / lastUnitPrice) * 100,
    isHistoricalLow: currentUnitPrice <= lowestUnitPrice * (1 + 0.0001),
  };
}

export interface FeedingRecord {
  id: string;
  date: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  foodName: string;
  amount: string;
  remainingAmount?: string;
  completed: boolean;
  note: string;
  eatingSpeed?: 'fast' | 'normal' | 'slow'; // 进食速度/喜好程度
  plannedTime?: string;
  planId?: string;
  planStageId?: string;
  inventoryDeductions?: InventoryDeduction[];
}

export interface InventoryDeduction {
  orderId: string;
  amount: number;
  unit?: string;
}

interface ParsedAmount {
  value: number;
  unit: string;
}

const AMOUNT_PATTERN = /(\d+(?:\.\d+)?)\s*(kg|公斤|千克|mg|毫克|g|克|ml|毫升|l|升|罐|包|袋|盒|支|条|片|粒|份|个)/i;

function normalizeStockProductName(value: string): string {
  return normalizeProductIdentity(
    value.replace(/\d+(?:\.\d+)?\s*(?:kg|公斤|千克|mg|毫克|g|克|ml|毫升|l|升|罐|包|袋|盒|支|条|片|粒|份|个)/gi, '')
  );
}

const PRODUCT_KINDS = [
  '主食冻干', '零食冻干', '主食罐头', '零食罐头', '主食餐包', '零食餐包',
  '处方粮', '幼猫粮', '成猫粮', '羊奶粉', '乳铁蛋白', '益生菌', '猫条',
  '冻干', '罐头', '餐包', '汤包', '奶粉', '猫粮',
] as const;

function stockProductKind(value: string): string {
  const normalized = normalizeStockProductName(value);
  return PRODUCT_KINDS.find(kind => normalized.includes(kind)) || '';
}

function hasDistinctiveOverlap(left: string, right: string, kind: string): boolean {
  const a = left.replace(kind, '');
  const b = right.replace(kind, '');
  if (!a || !b) return false;
  if ((a.includes(b) && b.length >= 2) || (b.includes(a) && a.length >= 2)) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  for (let index = 0; index < shorter.length - 1; index += 1) {
    if (longer.includes(shorter.slice(index, index + 2))) return true;
  }
  return false;
}

function parseAmount(value?: string): ParsedAmount | null {
  const match = value?.match(AMOUNT_PATTERN);
  if (!match) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) && amount > 0 ? { value: amount, unit: match[2].toLowerCase() } : null;
}

function unitInfo(rawUnit: string): { family: string; factor: number; unit: string } {
  const unit = rawUnit.trim().toLowerCase();
  if (['kg', '公斤', '千克'].includes(unit)) return { family: 'mass', factor: 1000, unit: 'kg' };
  if (['g', '克'].includes(unit)) return { family: 'mass', factor: 1, unit: 'g' };
  if (['mg', '毫克'].includes(unit)) return { family: 'mass', factor: 0.001, unit: 'mg' };
  if (['l', '升'].includes(unit)) return { family: 'volume', factor: 1000, unit: 'l' };
  if (['ml', '毫升'].includes(unit)) return { family: 'volume', factor: 1, unit: 'ml' };
  return { family: `count:${unit}`, factor: 1, unit };
}

export function convertInventoryAmount(value: number, fromUnit: string, toUnit: string): number | null {
  const from = unitInfo(fromUnit);
  const to = unitInfo(toUnit);
  if (!from.unit || !to.unit || from.family !== to.family) return null;
  return (value * from.factor) / to.factor;
}

function roundInventory(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function deductInventoryForFeeding(record: FeedingRecord, orders: Order[]): {
  orders: Order[];
  deductions: InventoryDeduction[];
} {
  if (!record.completed) return { orders, deductions: [] };

  // Include legacy plan notes so measured milk powder or supplements that were
  // previously placed in notes can still participate in inventory deduction.
  const source = `${record.foodName} ${record.amount} ${record.note}`;
  const normalizedSource = normalizeStockProductName(`${record.foodName} ${record.note}`);
  const eligibleOrders = orders.filter(order =>
    ['delivered', 'shipped', 'pending'].includes(order.status)
    && order.quantity - order.consumed > 0
  );
  const identitiesByKind = new Map<string, Set<string>>();
  eligibleOrders.forEach(order => {
    const kind = stockProductKind(order.itemName);
    if (!kind) return;
    const identities = identitiesByKind.get(kind) || new Set<string>();
    identities.add(normalizeStockProductName(order.itemName));
    identitiesByKind.set(kind, identities);
  });
  const groups = new Map<string, { name: string; orders: Order[]; position: number; matchToken: string }>();

  eligibleOrders.forEach(order => {
    const key = normalizeStockProductName(order.itemName);
    const kind = stockProductKind(order.itemName);
    const exactMatch = Boolean(key && normalizedSource.includes(key));
    const kindMatch = Boolean(kind && normalizedSource.includes(kind));
    const distinctiveMatch = kindMatch && hasDistinctiveOverlap(key, normalizedSource, kind);
    const uniqueKindMatch = kindMatch && identitiesByKind.get(kind)?.size === 1;
    // Generic names only match when there is one unambiguous stocked product of that kind.
    if (!exactMatch && !distinctiveMatch && !uniqueKindMatch) return;
    const current = groups.get(key);
    const matchToken = exactMatch ? key : kind;
    const position = normalizedSource.indexOf(matchToken);
    if (current) current.orders.push(order);
    else groups.set(key, {
      name: order.itemName,
      orders: [order],
      position: position < 0 ? Number.MAX_SAFE_INTEGER : position,
      matchToken,
    });
  });

  const usages = Array.from(groups.values())
    .sort((a, b) => a.position - b.position || b.name.length - a.name.length)
    .map((group, index, allGroups) => {
      const displayName = group.name.replace(/\d+(?:\.\d+)?\s*(?:kg|公斤|千克|mg|毫克|g|克|ml|毫升|l|升|罐|包|袋|盒|支|条|片|粒|份|个)/gi, '').trim();
      const sourceLower = source.toLocaleLowerCase('zh-CN');
      const literalName = displayName.toLocaleLowerCase('zh-CN');
      const literalIndex = sourceLower.indexOf(literalName);
      const tokenIndex = literalIndex >= 0 ? literalIndex : sourceLower.indexOf(group.matchToken);
      const tokenLength = literalIndex >= 0 ? displayName.length : group.matchToken.length;
      const nearby = literalIndex >= 0
        ? source.slice(tokenIndex + tokenLength, tokenIndex + tokenLength + 36).split(/[；;｜|\n]/)[0]
        : tokenIndex >= 0
          ? source.slice(tokenIndex + tokenLength, tokenIndex + tokenLength + 36).split(/[；;｜|\n]/)[0]
        : '';
      const amount = parseAmount(nearby) || (allGroups.length === 1 || index === 0 ? parseAmount(record.amount) : null);
      return amount ? { group, amount } : null;
    })
    .filter((usage): usage is NonNullable<typeof usage> => usage !== null);

  const remaining = parseAmount(record.remainingAmount);
  if (remaining) {
    for (const usage of usages) {
      const converted = convertInventoryAmount(remaining.value, remaining.unit, usage.amount.unit);
      if (converted === null) continue;
      usage.amount.value = Math.max(0, usage.amount.value - converted);
      break;
    }
  }

  const consumedByOrder = new Map<string, number>();
  usages.forEach(({ group, amount }) => {
    let amountLeft = amount.value;
    group.orders
      .slice()
      .sort((a, b) => {
        const priority = { delivered: 0, shipped: 1, pending: 2 } as const;
        return priority[a.status as keyof typeof priority] - priority[b.status as keyof typeof priority]
          || a.purchaseDate.localeCompare(b.purchaseDate)
          || a.id.localeCompare(b.id);
      })
      .forEach(order => {
        if (amountLeft <= 0) return;
        const requestedInOrderUnit = convertInventoryAmount(amountLeft, amount.unit, order.unit);
        if (requestedInOrderUnit === null) return;
        const available = Math.max(0, order.quantity - order.consumed);
        const taken = Math.min(available, requestedInOrderUnit);
        if (taken <= 0) return;
        consumedByOrder.set(order.id, roundInventory((consumedByOrder.get(order.id) || 0) + taken));
        const takenInUsageUnit = convertInventoryAmount(taken, order.unit, amount.unit) || 0;
        amountLeft = Math.max(0, amountLeft - takenInUsageUnit);
      });
  });

  const deductions = Array.from(consumedByOrder, ([orderId, amount]) => ({
    orderId,
    amount,
    unit: orders.find(order => order.id === orderId)?.unit,
  }));
  if (deductions.length === 0) return { orders, deductions };
  return {
    orders: orders.map(order => {
      const amount = consumedByOrder.get(order.id);
      return amount ? {
        ...order,
        status: order.status === 'pending' || order.status === 'shipped' ? 'delivered' as const : order.status,
        consumed: roundInventory(Math.min(order.quantity, order.consumed + amount)),
      } : order;
    }),
    deductions,
  };
}

export function restoreInventoryDeductions(orders: Order[], deductions?: InventoryDeduction[]): Order[] {
  if (!deductions?.length) return orders;
  return orders.map(order => {
    const amount = deductions
      .filter(deduction => deduction.orderId === order.id)
      .reduce((sum, deduction) => {
        const converted = deduction.unit
          ? convertInventoryAmount(deduction.amount, deduction.unit, order.unit)
          : deduction.amount;
        return sum + (converted ?? 0);
      }, 0);
    if (!amount) return order;
    if (order.status === 'finished') {
      const previous = order.consumedBeforeFinished ?? order.consumed;
      return { ...order, consumedBeforeFinished: roundInventory(Math.max(0, previous - amount)) };
    }
    if (order.status === 'durable') {
      const previous = order.consumedBeforeDurable ?? order.consumed;
      return { ...order, consumedBeforeDurable: roundInventory(Math.max(0, previous - amount)) };
    }
    return { ...order, consumed: roundInventory(Math.max(0, order.consumed - amount)) };
  });
}

// 喂食计划阶段
export interface FeedingPlanStage {
  id: string;
  name: string; // 阶段名称，如"恢复期"、"换粮过渡"
  startDate: string;
  endDate: string;
  description: string; // 详细描述
  mealsPerDay: number; // 每天几顿
  mealSchedule: { time: string; food: string; note: string }[]; // 每顿安排
  supplements?: string; // 营养补充说明
}

// 喂食计划
export interface FeedingPlan {
  id: string;
  name: string;
  stages: FeedingPlanStage[];
  createdAt: string;
  active: boolean;
}

export interface DailyObservation {
  appetite: 'great' | 'normal' | 'low' | 'none';
  energy: 'active' | 'normal' | 'quiet' | 'poor';
  stool: 'normal' | 'soft' | 'diarrhea' | 'constipation' | 'unseen';
  urine: 'normal' | 'less' | 'frequent' | 'abnormal' | 'unseen';
  vomiting: 'none' | 'hairball' | 'food' | 'yellow' | 'other';
}

export interface CareReminder {
  kind: 'medication' | 'deworming' | 'vaccine' | 'followup' | 'care' | 'other';
  time?: string;
  repeat: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  completed: boolean;
}

export interface HealthRecord {
  id: string;
  date: string;
  endDate?: string;
  type: 'visit' | 'medication' | 'weight' | 'observation' | 'reminder';
  title: string;
  detail: string;
  weight?: number;
  hospital?: string;
  doctor?: string;
  observation?: DailyObservation;
  reminder?: CareReminder;
}

export interface Expense {
  id: string;
  date: string;
  category: string;
  amount: number;
  description: string;
  relatedModule: 'procurement' | 'health' | 'feeding' | 'other';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface AppState {
  orders: Order[];
  feedingRecords: FeedingRecord[];
  feedingPlans: FeedingPlan[];
  healthRecords: HealthRecord[];
  expenses: Expense[];
  chatMessages: ChatMessage[];
}

const STORAGE_KEY = 'zhongfu-console-data';

export interface AppBackup {
  app: 'zhongfu-console';
  version: 1;
  exportedAt: string;
  data: AppState;
}

const defaultOrders: Order[] = [
  { id: 'o1', itemName: '皇家猫粮 K36', category: '猫粮', quantity: 10, unit: 'kg', unitPrice: 89, purchaseDate: '2025-08-01', status: 'delivered', consumed: 4, supplier: '宠粮旗舰店', productionDate: '2025-07-01', shelfLife: 365, dailyUsage: 0.1 },
  { id: 'o2', itemName: '妙鲜包金枪鱼味', category: '主食餐包', quantity: 24, unit: '包', unitPrice: 8.5, purchaseDate: '2025-08-05', status: 'delivered', consumed: 12, supplier: '宠粮旗舰店', productionDate: '2025-06-15', shelfLife: 180, dailyUsage: 0.5 },
  { id: 'o3', itemName: '猫砂豆腐砂', category: '猫砂与清洁', quantity: 6, unit: '袋', unitPrice: 35, purchaseDate: '2025-08-10', status: 'shipped', consumed: 2, supplier: '喵星人生活馆', productionDate: '2025-07-20', shelfLife: 730, dailyUsage: 0.15 },
  { id: 'o4', itemName: '化毛膏营养膏', category: '保健品', quantity: 2, unit: '支', unitPrice: 68, purchaseDate: '2025-08-12', status: 'pending', consumed: 0, supplier: '宠物健康屋', productionDate: '2025-05-01', shelfLife: 90, dailyUsage: 0.05 },
  { id: 'o5', itemName: '逗猫棒套装', category: '玩具', quantity: 1, unit: '套', unitPrice: 45, purchaseDate: '2025-08-15', status: 'delivered', consumed: 0, supplier: '喵星人生活馆' },
  { id: 'o6', itemName: '羊奶粉', category: '奶', quantity: 3, unit: '罐', unitPrice: 128, purchaseDate: '2025-08-18', status: 'delivered', consumed: 1, supplier: '宠物健康屋', productionDate: '2025-08-01', shelfLife: 540, dailyUsage: 0.03 },
];

const today = new Date();
const formatDate = (d: Date) => d.toISOString().split('T')[0];
const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

const defaultFeedingRecords: FeedingRecord[] = [
  { id: 'f1', date: formatDate(addDays(today, -2)), mealType: 'breakfast', foodName: '皇家猫粮', amount: '50g', completed: true, note: '食欲不错', eatingSpeed: 'fast' },
  { id: 'f2', date: formatDate(addDays(today, -2)), mealType: 'lunch', foodName: '妙鲜包', amount: '1包', completed: true, note: '', eatingSpeed: 'fast' },
  { id: 'f3', date: formatDate(addDays(today, -2)), mealType: 'dinner', foodName: '皇家猫粮', amount: '45g', completed: true, note: '加了羊奶粉', eatingSpeed: 'fast' },
  { id: 'f4', date: formatDate(addDays(today, -1)), mealType: 'breakfast', foodName: '皇家猫粮', amount: '50g', completed: true, note: '', eatingSpeed: 'normal' },
  { id: 'f5', date: formatDate(addDays(today, -1)), mealType: 'lunch', foodName: '零食罐头', amount: '1罐', completed: true, note: '很喜欢', eatingSpeed: 'fast' },
  { id: 'f6', date: formatDate(addDays(today, -1)), mealType: 'dinner', foodName: '皇家猫粮', amount: '50g', completed: true, note: '', eatingSpeed: 'normal' },
  { id: 'f7', date: formatDate(today), mealType: 'breakfast', foodName: '皇家猫粮', amount: '50g', completed: true, note: '精神好', eatingSpeed: 'fast' },
  { id: 'f8', date: formatDate(today), mealType: 'lunch', foodName: '妙鲜包', amount: '1包', completed: false, note: '' },
  { id: 'f9', date: formatDate(today), mealType: 'dinner', foodName: '皇家猫粮', amount: '45g', completed: false, note: '' },
];

const defaultHealthRecords: HealthRecord[] = [
  { id: 'h1', date: '2025-07-15', type: 'visit', title: '年度体检', detail: '各项指标正常，体重达标', hospital: '爱宠动物医院', doctor: '张医生' },
  { id: 'h2', date: '2025-07-15', type: 'weight', title: '体重记录', detail: '体检称重', weight: 4.2 },
  { id: 'h3', date: '2025-07-20', type: 'medication', title: '驱虫药（体内）', detail: '拜耳拜宠清，用量1片' },
  { id: 'h4', date: '2025-08-01', type: 'visit', title: '疫苗接种', detail: '猫三联加强针', hospital: '爱宠动物医院', doctor: '李医生' },
  { id: 'h5', date: '2025-08-01', type: 'weight', title: '体重记录', detail: '接种时称重', weight: 4.3 },
  { id: 'h6', date: '2025-08-10', type: 'medication', title: '化毛膏', detail: '每周2次，每次5cm' },
  { id: 'h7', date: '2025-08-15', type: 'weight', title: '体重记录', detail: '日常称重', weight: 4.5 },
];

const defaultExpenses: Expense[] = [
  { id: 'e1', date: '2025-08-01', category: '主粮', amount: 890, description: '皇家猫粮 K36 10kg', relatedModule: 'procurement' },
  { id: 'e2', date: '2025-08-05', category: '零食', amount: 204, description: '妙鲜包24包', relatedModule: 'procurement' },
  { id: 'e3', date: '2025-08-10', category: '日用', amount: 210, description: '猫砂6袋', relatedModule: 'procurement' },
  { id: 'e4', date: '2025-08-12', category: '保健品', amount: 136, description: '化毛膏2支', relatedModule: 'procurement' },
  { id: 'e5', date: '2025-08-15', category: '玩具', amount: 45, description: '逗猫棒套装', relatedModule: 'procurement' },
  { id: 'e6', date: '2025-08-18', category: '保健品', amount: 384, description: '羊奶粉3罐', relatedModule: 'procurement' },
  { id: 'e7', date: '2025-07-15', category: '体检', amount: 580, description: '年度体检费用', relatedModule: 'health' },
  { id: 'e8', date: '2025-08-01', category: '疫苗', amount: 320, description: '猫三联加强针', relatedModule: 'health' },
  { id: 'e9', date: '2025-08-20', category: '驱虫', amount: 85, description: '体内驱虫药', relatedModule: 'health' },
];

const defaultChatMessages: ChatMessage[] = [
  { id: 'c0', role: 'assistant', content: '你好！我是钟福的专属助手，有什么可以帮你的吗？你可以问我关于喂食、支出、健康等方面的问题。', timestamp: new Date().toISOString() },
];

export function loadState(): AppState {
  if (typeof window === 'undefined') {
    return { orders: defaultOrders, feedingRecords: defaultFeedingRecords, feedingPlans: [], healthRecords: defaultHealthRecords, expenses: defaultExpenses, chatMessages: defaultChatMessages };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      // Migration: add chatMessages if missing from old data
      if (!parsed.chatMessages) {
        parsed.chatMessages = defaultChatMessages;
      }
      return parsed;
    }
  } catch { /* ignore */ }
  const initial = { orders: defaultOrders, feedingRecords: defaultFeedingRecords, feedingPlans: [], healthRecords: defaultHealthRecords, expenses: defaultExpenses, chatMessages: defaultChatMessages };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
  return initial;
}

export function saveState(state: AppState): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function conciseFeedingNote(record: FeedingRecord): string {
  const note = record.note.trim();
  if (!note || !record.planId) return note;
  return note
    .split(/\s*(?:；|\n)?\s*(?=(?:阶段\s*\d*|阶段说明|开始日期|结束日期|进入(?:下一)?阶段条件|设为当前计划)\s*[:：])/)[0]
    .replace(/[；|、\s]+$/, '')
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createBackup(state: AppState): AppBackup {
  return {
    app: 'zhongfu-console',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: state,
  };
}

export function parseBackup(raw: string): AppState {
  const parsed: unknown = JSON.parse(raw);
  const candidate = isRecord(parsed) && parsed.app === 'zhongfu-console'
    ? parsed.data
    : parsed;

  if (!isRecord(candidate)) {
    throw new Error('备份文件格式不正确');
  }

  const requiredCollections = [
    'orders',
    'feedingRecords',
    'healthRecords',
    'expenses',
  ] as const;
  if (requiredCollections.some(key => !Array.isArray(candidate[key]))) {
    throw new Error('备份文件缺少必要的数据');
  }

  return {
    orders: candidate.orders as Order[],
    feedingRecords: candidate.feedingRecords as FeedingRecord[],
    feedingPlans: Array.isArray(candidate.feedingPlans) ? candidate.feedingPlans as FeedingPlan[] : [],
    healthRecords: candidate.healthRecords as HealthRecord[],
    expenses: candidate.expenses as Expense[],
    chatMessages: Array.isArray(candidate.chatMessages) ? candidate.chatMessages as ChatMessage[] : [],
  };
}

/** Calculate average daily consumption for an item based on feeding records */
export function calcDailyUsage(itemName: string, feedingRecords: FeedingRecord[]): number {
  const matches = feedingRecords.filter(r =>
    r.foodName && (
      r.foodName.toLowerCase().includes(itemName.toLowerCase()) ||
      itemName.toLowerCase().includes(r.foodName.toLowerCase())
    )
  );
  if (matches.length < 2) return 0;

  const amounts = matches.map(r => {
    const m = r.amount?.match(/([\d.]+)/);
    return m ? parseFloat(m[1]) : 0;
  }).filter(a => a > 0);
  if (amounts.length < 2) return 0;

  const dates = matches.map(r => new Date(r.date).getTime()).filter(t => !isNaN(t));
  if (dates.length < 2) return 0;

  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  const days = Math.max(1, Math.ceil((maxDate - minDate) / (24 * 60 * 60 * 1000)));

  const totalAmount = amounts.reduce((s, a) => s + a, 0);
  return Math.round((totalAmount / days) * 100) / 100;
}
