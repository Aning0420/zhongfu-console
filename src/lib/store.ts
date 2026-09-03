import { localDateKey } from '@/lib/local-date';

export interface Order {
  id: string;
  catId?: string;
  /** Product brand, kept separate from a series/group name. */
  brand?: string;
  itemName: string;
  /** Optional series/group heading shared by related flavors or variants. */
  itemGroup?: string;
  /** Shared purchase batch metadata for mixed-flavor boxes and assorted bundles. */
  purchaseBatchId?: string;
  purchaseBundleName?: string;
  purchaseBundleQuantity?: number;
  purchaseBundleUnit?: string;
  purchaseBundleTotalPrice?: number;
  category: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  /** Amount actually paid for this purchase. Older records only have unitPrice. */
  totalPrice?: number;
  purchaseDate: string;
  status: 'pending' | 'shipped' | 'delivered' | 'no-repurchase' | 'durable' | 'finished' | 'cancelled';
  consumed: number;
  consumedBeforeFinished?: number;
  consumedBeforeDurable?: number;
  repurchasedAt?: string;
  supplier: string;
  productionDate?: string;
  shelfLife?: number; // days
  shelfLifeUnit?: 'day' | 'month' | 'year';
  dailyUsage?: number; // average daily consumption
  /** Optional inner package layer, for example 6 bags per box. */
  packageCount?: number;
  packageCountUnit?: string;
  /** Optional smallest-unit conversion, for example 60g per bag or 20 tablets per box. */
  packageSize?: number;
  packageUnit?: string;
  /** Compressed product/package photos. The first item is the cover image. */
  imageUrls?: string[];
  /** Legacy cover field retained for older clients and backups. */
  imageUrl?: string;
  /** AI or manually recorded product information. */
  productBenefits?: string;
  suitableLifeStages?: string;
  feedingGuidance?: string;
  // 两层包装换算
  packConversion?: {
    outerUnit: string;    // 外层单位，如"盒"
    outerQuantity: number; // 外层数量，如 1
    innerUnit: string;    // 内层单位，如"包"
    innerQuantity: number; // 每外层含内层数量，如 6
    weightPerInner?: number; // 每内层重量，如 60g
  };
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
  options?: {
    packageCount?: number;
    packageCountUnit?: string;
    packageSize?: number;
    packageUnit?: string;
    currentOrderId?: string;
  },
): PriceHistory | null {
  if (!itemName.trim() || !unit.trim() || !Number.isFinite(currentUnitPrice) || currentUnitPrice <= 0) return null;

  const normalizedName = normalizeProductIdentity(itemName);
  const normalizedUnit = normalizeProductIdentity(unit);
  const normalizedPackageCountUnit = normalizeProductIdentity(options?.packageCountUnit || '');
  const normalizedPackageUnit = normalizeProductIdentity(options?.packageUnit || '');
  const sameOptionalNumber = (left: number | undefined, right: number | undefined) =>
    (left === undefined || left === null ? undefined : left) === (right === undefined || right === null ? undefined : right);
  const packageSpecMatches = (order: Order) => options === undefined || (
    sameOptionalNumber(order.packageCount, options.packageCount)
    && normalizeProductIdentity(order.packageCountUnit || '') === normalizedPackageCountUnit
    && sameOptionalNumber(order.packageSize, options.packageSize)
    && normalizeProductIdentity(order.packageUnit || '') === normalizedPackageUnit
  );
  const matches = orders.filter(order =>
    order.status !== 'cancelled'
    && order.unitPrice > 0
    && normalizeProductIdentity(order.itemName) === normalizedName
    && normalizeProductIdentity(order.unit) === normalizedUnit
    && packageSpecMatches(order)
  );
  const historicalMatches = matches
    .filter(order => order.id !== options?.currentOrderId)
    .sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate) || a.id.localeCompare(b.id));
  if (historicalMatches.length === 0) return null;

  const lastUnitPrice = historicalMatches[historicalMatches.length - 1].unitPrice;
  const lowestUnitPrice = Math.min(...historicalMatches.map(order => order.unitPrice));
  return {
    lastUnitPrice,
    lowestUnitPrice,
    changePercent: ((currentUnitPrice - lastUnitPrice) / lastUnitPrice) * 100,
    // Equal prices are not new lows. Only a strictly lower purchase gets the badge.
    isHistoricalLow: currentUnitPrice < lowestUnitPrice - 0.0001,
  };
}

export interface FeedingRecord {
  id: string;
  catId?: string;
  date: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  foodName: string;
  amount: string;
  medication?: string;
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

const AMOUNT_PATTERN = /(\d+(?:\.\d+)?)\s*(kg|公斤|千克|mg|毫克|g|克|ml|毫升|l|升|餐盒|餐包|罐|包|袋|盒|支|条|片|粒|份|个)/i;

function normalizeStockProductName(value: string): string {
  return normalizeProductIdentity(
    value.replace(/\d+(?:\.\d+)?\s*(?:kg|公斤|千克|mg|毫克|g|克|ml|毫升|l|升|餐盒|餐包|罐|包|袋|盒|支|条|片|粒|份|个)/gi, '')
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
  if (match) {
    const amount = Number(match[1]);
    return Number.isFinite(amount) && amount > 0 ? { value: amount, unit: match[2].toLowerCase() } : null;
  }
  const halfMatch = value?.match(/半\s*(kg|公斤|千克|mg|毫克|g|克|ml|毫升|l|升|餐盒|餐包|罐|包|袋|盒|支|条|片|粒|份|个)/i);
  return halfMatch ? { value: 0.5, unit: halfMatch[1].toLowerCase() } : null;
}

function unitInfo(rawUnit: string): { family: string; factor: number; unit: string } {
  const unit = rawUnit.trim().toLowerCase();
  if (['kg', '公斤', '千克'].includes(unit)) return { family: 'mass', factor: 1000, unit: 'kg' };
  if (['g', '克'].includes(unit)) return { family: 'mass', factor: 1, unit: 'g' };
  if (['mg', '毫克'].includes(unit)) return { family: 'mass', factor: 0.001, unit: 'mg' };
  if (['l', '升'].includes(unit)) return { family: 'volume', factor: 1000, unit: 'l' };
  if (['ml', '毫升'].includes(unit)) return { family: 'volume', factor: 1, unit: 'ml' };
  if (['盒', '餐盒'].includes(unit)) return { family: 'count:盒', factor: 1, unit: '盒' };
  if (['包', '餐包'].includes(unit)) return { family: 'count:包', factor: 1, unit: '包' };
  return { family: `count:${unit}`, factor: 1, unit };
}

export function convertInventoryAmount(value: number, fromUnit: string, toUnit: string): number | null {
  const from = unitInfo(fromUnit);
  const to = unitInfo(toUnit);
  if (!from.unit || !to.unit || from.family !== to.family) return null;
  return (value * from.factor) / to.factor;
}

export function convertUsageToInventoryAmount(order: Order, value: number, usageUnit: string): number | null {
  const direct = convertInventoryAmount(value, usageUnit, order.unit);
  if (direct !== null) return direct;
  const hasInnerPackage = Number.isFinite(order.packageCount)
    && (order.packageCount ?? 0) > 0
    && Boolean(order.packageCountUnit?.trim());
  if (hasInnerPackage) {
    const inInnerPackages = convertInventoryAmount(value, usageUnit, order.packageCountUnit as string);
    if (inInnerPackages !== null) return inInnerPackages / (order.packageCount as number);
  }
  if (!Number.isFinite(order.packageSize) || (order.packageSize ?? 0) <= 0 || !order.packageUnit?.trim()) return null;
  const inPackageUnit = convertInventoryAmount(value, usageUnit, order.packageUnit);
  if (inPackageUnit === null) return null;
  const smallestUnitsPerInventoryUnit = (order.packageSize as number) * (hasInnerPackage ? order.packageCount as number : 1);
  return inPackageUnit / smallestUnitsPerInventoryUnit;
}

export function convertInventoryToUsageAmount(order: Order, value: number, usageUnit: string): number | null {
  const direct = convertInventoryAmount(value, order.unit, usageUnit);
  if (direct !== null) return direct;
  const hasInnerPackage = Number.isFinite(order.packageCount)
    && (order.packageCount ?? 0) > 0
    && Boolean(order.packageCountUnit?.trim());
  if (hasInnerPackage) {
    const innerPackageAmount = value * (order.packageCount as number);
    const convertedInnerPackages = convertInventoryAmount(innerPackageAmount, order.packageCountUnit as string, usageUnit);
    if (convertedInnerPackages !== null) return convertedInnerPackages;
  }
  if (!Number.isFinite(order.packageSize) || (order.packageSize ?? 0) <= 0 || !order.packageUnit?.trim()) return null;
  const packageAmount = value * (order.packageSize as number) * (hasInnerPackage ? order.packageCount as number : 1);
  return convertInventoryAmount(packageAmount, order.packageUnit, usageUnit);
}

/**
 * Older records sometimes stored gram-based daily usage on kilogram orders
 * (for example 30 instead of 0.03). Correct only clearly impossible values
 * that exceed the stock quantity; ordinary configured values remain unchanged.
 */
export function normalizeConfiguredDailyUsage(value: number | undefined, unit: string, stockQuantity?: number): number {
  if (!Number.isFinite(value) || (value ?? 0) <= 0) return 0;
  const numericValue = value as number;
  const normalizedUnit = unitInfo(unit).unit;
  const isLargeUnit = normalizedUnit === 'kg' || normalizedUnit === 'l';
  if (isLargeUnit && Number.isFinite(stockQuantity) && (stockQuantity ?? 0) > 0 && numericValue > (stockQuantity as number)) {
    return numericValue / 1000;
  }
  return numericValue;
}

export function formatInventoryDailyUsage(value: number, unit: string): string {
  if (!Number.isFinite(value) || value <= 0) return '待记录';
  const rounded = (amount: number) => String(Number(amount.toFixed(amount < 1 ? 4 : 2)));
  const normalizedUnit = unitInfo(unit).unit;
  if (normalizedUnit === 'kg') {
    const grams = convertInventoryAmount(value, unit, 'g');
    return grams ? `${rounded(value)}kg/天（${rounded(grams)}g/天）` : `${rounded(value)}${unit}/天`;
  }
  if (normalizedUnit === 'l') {
    const milliliters = convertInventoryAmount(value, unit, 'ml');
    return milliliters ? `${rounded(value)}L/天（${rounded(milliliters)}ml/天）` : `${rounded(value)}${unit}/天`;
  }
  return `${rounded(value)}${unit}/天`;
}

export function roundInventory(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function inventoryRemaining(order: Order): number {
  return roundInventory(Math.max(0, order.quantity - order.consumed));
}

export function deductInventoryForFeeding(record: FeedingRecord, orders: Order[]): {
  orders: Order[];
  deductions: InventoryDeduction[];
} {
  if (!record.completed) return { orders, deductions: [] };

  // Include legacy plan notes so measured milk powder or supplements that were
  // previously placed in notes can still participate in inventory deduction.
  const source = `${record.foodName} ${record.amount} ${record.medication || ''} ${record.note}`;
  const normalizedSource = normalizeStockProductName(`${record.foodName} ${record.medication || ''} ${record.note}`);
  const eligibleOrders = orders.filter(order =>
    ['delivered', 'no-repurchase', 'shipped', 'pending'].includes(order.status)
    && inventoryRemaining(order) > 0
  );
  const identitiesByKind = new Map<string, Set<string>>();
  eligibleOrders.forEach(order => {
    const kind = stockProductKind(order.itemName);
    if (!kind) return;
    const identities = identitiesByKind.get(kind) || new Set<string>();
    identities.add(normalizeStockProductName(order.itemName));
    identitiesByKind.set(kind, identities);
  });
  const explicitlyMatchedSeries = new Set(
    eligibleOrders
      .filter(order => {
        const itemKey = normalizeStockProductName(order.itemName);
        return Boolean(itemKey && normalizedSource.includes(itemKey));
      })
      .map(order => normalizeStockProductName(order.itemGroup || ''))
      .filter(Boolean)
  );
  const groups = new Map<string, { name: string; orders: Order[]; position: number; matchToken: string }>();

  eligibleOrders.forEach(order => {
    const key = normalizeStockProductName(order.itemName);
    const seriesKey = normalizeStockProductName(order.itemGroup || '');
    const kind = stockProductKind(order.itemName);
    const exactMatch = Boolean(key && normalizedSource.includes(key));
    const seriesMatch = Boolean(
      seriesKey
      && normalizedSource.includes(seriesKey)
      && !explicitlyMatchedSeries.has(seriesKey)
    );
    const kindMatch = Boolean(kind && normalizedSource.includes(kind));
    const distinctiveMatch = kindMatch && hasDistinctiveOverlap(key, normalizedSource, kind);
    const uniqueKindMatch = kindMatch && identitiesByKind.get(kind)?.size === 1;
    // Generic names only match when there is one unambiguous stocked product of that kind.
    if (!exactMatch && !seriesMatch && !distinctiveMatch && !uniqueKindMatch) return;
    const groupKey = seriesMatch ? `series:${seriesKey}` : `item:${key}`;
    const current = groups.get(groupKey);
    const matchToken = exactMatch ? key : seriesMatch ? seriesKey : kind;
    const position = normalizedSource.indexOf(matchToken);
    if (current) current.orders.push(order);
    else groups.set(groupKey, {
      name: seriesMatch ? order.itemGroup as string : order.itemName,
      orders: [order],
      position: position < 0 ? Number.MAX_SAFE_INTEGER : position,
      matchToken,
    });
  });

  const usages = Array.from(groups.values())
    .sort((a, b) => a.position - b.position || b.name.length - a.name.length)
    .map((group, index, allGroups) => {
      const displayName = group.name.replace(/\d+(?:\.\d+)?\s*(?:kg|公斤|千克|mg|毫克|g|克|ml|毫升|l|升|餐盒|餐包|罐|包|袋|盒|支|条|片|粒|份|个)/gi, '').trim();
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
        const priority = { delivered: 0, 'no-repurchase': 1, shipped: 2, pending: 3 } as const;
        return priority[a.status as keyof typeof priority] - priority[b.status as keyof typeof priority]
          || a.purchaseDate.localeCompare(b.purchaseDate)
          || a.id.localeCompare(b.id);
      })
      .forEach(order => {
        if (amountLeft <= 0) return;
        const requestedInOrderUnit = convertUsageToInventoryAmount(order, amountLeft, amount.unit);
        if (requestedInOrderUnit === null) return;
        const available = inventoryRemaining(order);
        const taken = Math.min(available, requestedInOrderUnit);
        if (taken <= 0) return;
        consumedByOrder.set(order.id, roundInventory((consumedByOrder.get(order.id) || 0) + taken));
        const takenInUsageUnit = convertInventoryToUsageAmount(order, taken, amount.unit) || 0;
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
  mealSchedule: { time: string; food: string; medication?: string; note: string }[]; // 每顿安排
  supplements?: string; // 营养补充说明
}

// 喂食计划
export interface FeedingPlan {
  id: string;
  catId?: string;
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
  catId?: string;
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
  catId?: string;
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

export interface CatProfile {
  id: string;
  name: string;
  sex?: 'male' | 'female' | 'unknown';
  birthday?: string;
  ageNote?: string;
  weight?: number;
  color?: string;
  origin?: string;
  notes?: string;
  createdAt: string;
}

export interface AppState {
  dataVersion?: number;
  cats: CatProfile[];
  activeCatId?: string;
  orders: Order[];
  feedingRecords: FeedingRecord[];
  feedingPlans: FeedingPlan[];
  healthRecords: HealthRecord[];
  expenses: Expense[];
  chatMessages: ChatMessage[];
}

const STORAGE_KEY = 'zhongfu-console-data';
const CURRENT_DATA_VERSION = 2;

export interface AppBackup {
  app: 'zhongfu-console';
  version: 1;
  exportedAt: string;
  data: AppState;
}

const defaultOrders: Order[] = [
  { id: 'o3', itemName: '猫砂豆腐砂', category: '猫砂与清洁', quantity: 6, unit: '袋', unitPrice: 35, purchaseDate: '2025-08-10', status: 'shipped', consumed: 2, supplier: '喵星人生活馆', productionDate: '2025-07-20', shelfLife: 730, dailyUsage: 0.15 },
  { id: 'o4', itemName: '化毛膏营养膏', category: '保健品', quantity: 2, unit: '支', unitPrice: 68, purchaseDate: '2025-08-12', status: 'pending', consumed: 0, supplier: '宠物健康屋', productionDate: '2025-05-01', shelfLife: 90, dailyUsage: 0.05 },
  { id: 'o5', itemName: '逗猫棒套装', category: '玩具', quantity: 1, unit: '套', unitPrice: 45, purchaseDate: '2025-08-15', status: 'delivered', consumed: 0, supplier: '喵星人生活馆' },
  { id: 'o6', itemName: '羊奶粉', category: '奶', quantity: 3, unit: '罐', unitPrice: 128, purchaseDate: '2025-08-18', status: 'delivered', consumed: 1, supplier: '宠物健康屋', productionDate: '2025-08-01', shelfLife: 540, dailyUsage: 0.03 },
];

const today = new Date();
const formatDate = (d: Date) => localDateKey(d);
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
  { id: 'e3', date: '2025-08-10', category: '日用', amount: 210, description: '猫砂6袋', relatedModule: 'procurement' },
  { id: 'e4', date: '2025-08-12', category: '保健品', amount: 136, description: '化毛膏2支', relatedModule: 'procurement' },
  { id: 'e5', date: '2025-08-15', category: '玩具', amount: 45, description: '逗猫棒套装', relatedModule: 'procurement' },
  { id: 'e6', date: '2025-08-18', category: '保健品', amount: 384, description: '羊奶粉3罐', relatedModule: 'procurement' },
  { id: 'e7', date: '2025-07-15', category: '体检', amount: 580, description: '年度体检费用', relatedModule: 'health' },
  { id: 'e8', date: '2025-08-01', category: '疫苗', amount: 320, description: '猫三联加强针', relatedModule: 'health' },
  { id: 'e9', date: '2025-08-20', category: '驱虫', amount: 85, description: '体内驱虫药', relatedModule: 'health' },
];

const defaultChatMessages: ChatMessage[] = [
  { id: 'c0', role: 'assistant', content: '你好！我是猫咪管理助手，有什么可以帮你的吗？你可以问我关于喂食、支出、健康等方面的问题。', timestamp: new Date().toISOString() },
];

const defaultCats: CatProfile[] = [
  {
    id: 'cat-zhongfu',
    name: '钟福',
    ageNote: '约两个半月（捡到的流浪猫，年龄待确认）',
    weight: 1.15,
    origin: '救助的流浪猫',
    notes: '正在进行猫瘟康复照护。',
    createdAt: '2026-08-24T00:00:00.000Z',
  },
  {
    id: 'cat-qiyu',
    name: '七遇',
    origin: '新救助的猫咪',
    notes: '档案刚建立，年龄、体重和健康情况待补充。',
    createdAt: '2026-09-01T00:00:00.000Z',
  },
];

function initialAppState(): AppState {
  return {
    dataVersion: CURRENT_DATA_VERSION,
    cats: defaultCats,
    activeCatId: 'cat-zhongfu',
    orders: defaultOrders,
    feedingRecords: defaultFeedingRecords,
    feedingPlans: [],
    healthRecords: defaultHealthRecords,
    expenses: defaultExpenses,
    chatMessages: defaultChatMessages,
  };
}

export function loadState(): AppState {
  if (typeof window === 'undefined') {
    return initialAppState();
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = migrateLegacyDemoData(JSON.parse(raw) as AppState);
      // Migration: add chatMessages if missing from old data
      if (!parsed.chatMessages) {
        parsed.chatMessages = defaultChatMessages;
      }
      return parsed;
    }
  } catch { /* ignore */ }
  // Run the same migration as saved/remote data so seeded demo records also
  // belong to the default cat and are visible immediately after first launch.
  const initial = migrateLegacyDemoData(initialAppState());
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

  return migrateLegacyDemoData({
    dataVersion: typeof candidate.dataVersion === 'number' ? candidate.dataVersion : undefined,
    cats: Array.isArray(candidate.cats) ? candidate.cats as CatProfile[] : [],
    activeCatId: typeof candidate.activeCatId === 'string' ? candidate.activeCatId : undefined,
    orders: candidate.orders as Order[],
    feedingRecords: candidate.feedingRecords as FeedingRecord[],
    feedingPlans: Array.isArray(candidate.feedingPlans) ? candidate.feedingPlans as FeedingPlan[] : [],
    healthRecords: candidate.healthRecords as HealthRecord[],
    expenses: candidate.expenses as Expense[],
    chatMessages: Array.isArray(candidate.chatMessages) ? candidate.chatMessages as ChatMessage[] : [],
  });
}

/** Remove only the two original seeded rows the user previously deleted. */
function migrateLegacyDemoData(state: AppState): AppState {
  const moveLegacySupplierToBrand = (state.dataVersion ?? 1) < 2;
  const removedOrderIds = new Set(['o1', 'o2']);
  const removedExpenseIds = new Set(['e1', 'e2']);
  const existingCats = Array.isArray(state.cats)
    ? state.cats.filter(cat => isRecord(cat) && typeof cat.id === 'string' && typeof cat.name === 'string')
    : [];
  const cats = [
    ...(existingCats.some(cat => cat.id === 'cat-zhongfu' || cat.name === '钟福') ? [] : [defaultCats[0]]),
    ...existingCats,
    ...(existingCats.some(cat => cat.id === 'cat-qiyu' || cat.name === '七遇') ? [] : [defaultCats[1]]),
  ];
  return {
    ...state,
    dataVersion: CURRENT_DATA_VERSION,
    cats,
    activeCatId: state.activeCatId && cats.some(cat => cat.id === state.activeCatId)
      ? state.activeCatId
      : cats[0]?.id,
    orders: state.orders
      .filter(order => !removedOrderIds.has(order.id))
      .map(order => {
        const storedImages = Array.isArray(order.imageUrls)
          ? order.imageUrls.filter(image => typeof image === 'string' && Boolean(image.trim()))
          : [];
        const legacyImage = typeof order.imageUrl === 'string' && order.imageUrl.trim()
          ? order.imageUrl.trim()
          : '';
        const imageUrls = Array.from(new Set([...storedImages, legacyImage].filter(Boolean))).slice(0, 4);
        return {
          ...order,
          catId: 'shared',
          brand: order.brand?.trim() || (moveLegacySupplierToBrand ? order.supplier?.trim() || undefined : undefined),
          supplier: moveLegacySupplierToBrand && !order.brand?.trim() && order.supplier?.trim() ? '' : order.supplier,
          imageUrls: imageUrls.length ? imageUrls : undefined,
          imageUrl: imageUrls[0] || undefined,
        };
      }),
    feedingRecords: state.feedingRecords.map(record => ({ ...record, catId: record.catId || 'cat-zhongfu' })),
    feedingPlans: state.feedingPlans.map(plan => ({ ...plan, catId: plan.catId || 'cat-zhongfu' })),
    healthRecords: state.healthRecords.map(record => ({ ...record, catId: record.catId || 'cat-zhongfu' })),
    expenses: state.expenses
      .filter(expense => !removedExpenseIds.has(expense.id))
      .map(expense => ({ ...expense, catId: expense.catId || 'cat-zhongfu' })),
  };
}

function feedingUsageAmount(itemName: string, record: FeedingRecord): ParsedAmount | null {
  const source = `${record.foodName} ${record.medication || ''} ${record.note}`;
  const normalizedSource = normalizeStockProductName(source);
  const normalizedItem = normalizeStockProductName(itemName);
  const kind = stockProductKind(itemName);
  if (!normalizedItem || (!normalizedSource.includes(normalizedItem) && !(kind && normalizedSource.includes(kind)))) {
    return null;
  }

  const displayName = itemName
    .replace(/\d+(?:\.\d+)?\s*(?:kg|公斤|千克|mg|毫克|g|克|ml|毫升|l|升|餐盒|餐包|罐|包|袋|盒|支|条|片|粒|份|个)/gi, '')
    .trim();
  const sourceLower = source.toLocaleLowerCase('zh-CN');
  const literalName = displayName.toLocaleLowerCase('zh-CN');
  const literalIndex = literalName ? sourceLower.indexOf(literalName) : -1;
  const kindIndex = kind ? sourceLower.indexOf(kind.toLocaleLowerCase('zh-CN')) : -1;
  const tokenIndex = literalIndex >= 0 ? literalIndex : kindIndex;
  const tokenLength = literalIndex >= 0 ? literalName.length : kind.length;
  const nearby = tokenIndex >= 0
    ? source.slice(tokenIndex + tokenLength, tokenIndex + tokenLength + 36).split(/[；;｜|\n]/)[0]
    : '';
  const amount = parseAmount(nearby);
  if (!amount) return null;

  const firstMeasuredItem = source
    .split(/[＋+；;｜|、，,\n]/)
    .find(fragment => parseAmount(fragment) && !/(温水|凉白开|清水|饮用水|纯净水)/.test(fragment));
  const firstItemKey = firstMeasuredItem ? normalizeStockProductName(firstMeasuredItem) : '';
  const matchesFirstItem = Boolean(
    firstItemKey
    && (firstItemKey.includes(normalizedItem) || normalizedItem.includes(firstItemKey) || (kind && firstItemKey.includes(kind)))
  );
  const remaining = matchesFirstItem ? parseAmount(record.remainingAmount) : null;
  if (!remaining) return amount;
  const convertedRemaining = convertInventoryAmount(remaining.value, remaining.unit, amount.unit);
  return convertedRemaining === null
    ? amount
    : { ...amount, value: Math.max(0, amount.value - convertedRemaining) };
}

/** Calculate average consumption per observed day, optionally converted to an order's unit. */
export function calcDailyUsage(itemName: string, feedingRecords: FeedingRecord[], targetUnit?: string, order?: Order): number {
  const usages = feedingRecords
    .filter(record => record.completed)
    .map(record => {
      const deductedAmount = order
        ? (record.inventoryDeductions || [])
          .filter(deduction => deduction.orderId === order.id)
          .reduce((sum, deduction) => {
            const converted = deduction.unit
              ? convertInventoryAmount(deduction.amount, deduction.unit, order.unit)
              : deduction.amount;
            return sum + (converted ?? 0);
          }, 0)
        : 0;
      return deductedAmount > 0
        ? { record, amount: { value: deductedAmount, unit: order?.unit || targetUnit || '' }, alreadyInTargetUnit: true }
        : { record, amount: feedingUsageAmount(itemName, record), alreadyInTargetUnit: false };
    })
    .filter((entry): entry is { record: FeedingRecord; amount: ParsedAmount; alreadyInTargetUnit: boolean } => Boolean(entry.amount));
  if (usages.length < 2) return 0;

  const usageByDate = new Map<string, number>();
  usages.forEach(({ record, amount, alreadyInTargetUnit }) => {
    const converted = alreadyInTargetUnit
      ? amount.value
      : order
      ? convertUsageToInventoryAmount(order, amount.value, amount.unit)
      : targetUnit
        ? convertInventoryAmount(amount.value, amount.unit, targetUnit)
      : amount.value;
    if (converted === null || converted <= 0) return;
    usageByDate.set(record.date, (usageByDate.get(record.date) || 0) + converted);
  });
  if (usageByDate.size === 0) return 0;

  const totalAmount = Array.from(usageByDate.values()).reduce((sum, amount) => sum + amount, 0);
  return roundInventory(totalAmount / usageByDate.size);
}

// ============ 输入历史记录 ============

const INPUT_HISTORY_KEY = 'zhongfu-input-history';

export interface InputHistory {
  suppliers: string[];      // 供应商历史
  categories: string[];     // 分类历史（自定义）
  units: string[];          // 单位历史
  itemNames: string[];      // 物品名称历史
  expenseCategories: string[]; // 支出分类历史
  expenseDescriptions: string[]; // 支出描述历史
  hospitals: string[];      // 医院历史
  doctors: string[];        // 医生历史
  medications: string[];    // 药品历史
}

const defaultInputHistory: InputHistory = {
  suppliers: ['皇家宠物食品', '天猫超市', '京东宠物', '宠物医院'],
  categories: [],
  units: ['kg', 'g', '包', '罐', '盒', '袋', '瓶', '支', '片'],
  itemNames: ['皇家猫粮', '妙鲜包', '猫砂', '化毛膏', '羊奶粉', '逗猫棒'],
  expenseCategories: ['主粮', '零食', '保健品', '医疗', '日用', '玩具'],
  expenseDescriptions: [],
  hospitals: ['爱宠动物医院'],
  doctors: ['张医生', '李医生'],
  medications: ['拜耳拜宠清', '化毛膏', '乳铁蛋白', '益生菌'],
};

export function loadInputHistory(): InputHistory {
  if (typeof window === 'undefined') return defaultInputHistory;
  try {
    const raw = localStorage.getItem(INPUT_HISTORY_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return defaultInputHistory;
}

export function saveInputHistory(history: InputHistory): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(INPUT_HISTORY_KEY, JSON.stringify(history));
}

/** 添加历史记录项（去重，保持最近 20 条） */
export function addToHistory(field: keyof InputHistory, value: string): void {
  if (!value || !value.trim()) return;
  const history = loadInputHistory();
  const list = history[field] as string[];
  const trimmed = value.trim();
  // 移除重复项
  const filtered = list.filter(v => v !== trimmed);
  // 添加到开头，保留最近 20 条
  history[field] = [trimmed, ...filtered].slice(0, 20);
  saveInputHistory(history);
}
