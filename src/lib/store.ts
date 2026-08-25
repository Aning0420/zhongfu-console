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
  status: 'pending' | 'shipped' | 'delivered' | 'cancelled';
  consumed: number;
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
