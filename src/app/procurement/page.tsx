'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useAppContext } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import Image from 'next/image';
import type { Expense } from '@/lib/store';
import { calcDailyUsage, convertInventoryToUsageAmount, convertUsageToInventoryAmount, formatInventoryDailyUsage, getPriceHistory, inventoryRemaining, normalizeConfiguredDailyUsage, orderTotalPrice } from '@/lib/store';
import { Plus, Search, ShoppingCart, Package, PackageCheck, Truck, CheckCircle2, XCircle, Filter, Clock, AlertTriangle, Calendar, TrendingDown, ArrowDown, ArrowUp, ArrowUpDown, Pencil, Trash2, Archive, BellOff, ImagePlus, Loader2, WandSparkles, Utensils, Star, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Order, FeedingRecord } from '@/lib/store';
import { InventoryCategoryOptions } from '@/components/inventory-category-options';
import { RepurchaseDialog } from '@/components/repurchase-dialog';
import { addLocalDays, localDateKey } from '@/lib/local-date';
import { analyzeProductImages, compressProductImage, type ProductImageAnalysis } from '@/lib/product-image';

const statusMap: Record<Order['status'], { label: string; icon: React.ElementType; color: string }> = {
  pending: { label: '待发货', icon: Clock, color: 'text-accent bg-accent/10' },
  shipped: { label: '运输中', icon: Truck, color: 'text-[#87CEEB] bg-[#87CEEB]/10' },
  delivered: { label: '已到货', icon: CheckCircle2, color: 'text-primary bg-primary/10' },
  'no-repurchase': { label: '使用中·不回购', icon: BellOff, color: 'text-[#8A6A54] bg-[#8A6A54]/10' },
  durable: { label: '耐用品·无消耗', icon: Archive, color: 'text-[#52796F] bg-[#52796F]/10' },
  finished: { label: '已用完·不回购', icon: PackageCheck, color: 'text-muted-foreground bg-muted' },
  cancelled: { label: '已取消', icon: XCircle, color: 'text-muted-foreground bg-muted' },
};

type SortField = 'name' | 'category' | 'purchaseDate' | 'status';
type SortDirection = 'asc' | 'desc';
type ShelfLifeUnit = NonNullable<Order['shelfLifeUnit']>;

const SORT_STORAGE_KEY = 'zhongfu-procurement-sort';
const sortFieldLabels: Record<SortField, string> = {
  name: '名称',
  category: '分类',
  purchaseDate: '采购时间',
  status: '状态',
};
const statusSortOrder: Record<Order['status'], number> = {
  pending: 0,
  shipped: 1,
  delivered: 2,
  'no-repurchase': 3,
  durable: 4,
  finished: 5,
  cancelled: 6,
};
const chineseCollator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });

function shelfLifeInDays(value: string, unit: ShelfLifeUnit = 'day'): number | undefined {
  if (!value) return undefined;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  return unit === 'year' ? amount * 365 : unit === 'month' ? amount * 30 : amount;
}

function shelfLifeForEditing(days?: number, preferredUnit?: ShelfLifeUnit): { value: string; unit: ShelfLifeUnit } {
  if (!days || days <= 0) return { value: '', unit: 'day' };
  if (preferredUnit === 'year') return { value: String(days / 365), unit: 'year' };
  if (preferredUnit === 'month') return { value: String(days / 30), unit: 'month' };
  if (preferredUnit === 'day') return { value: String(days), unit: 'day' };
  if (days % 365 === 0) return { value: String(days / 365), unit: 'year' };
  if (days % 30 === 0) return { value: String(days / 30), unit: 'month' };
  return { value: String(days), unit: 'day' };
}

function formatShelfLife(order: Order): string {
  const display = shelfLifeForEditing(order.shelfLife, order.shelfLifeUnit);
  const label = display.unit === 'year' ? '年' : display.unit === 'month' ? '个月' : '天';
  return display.value ? `${display.value}${label}` : '-';
}

function productDisplayName(order: Order): string {
  return [order.brand, order.itemName].filter(Boolean).join(' ');
}

function packageConversionLabel(order: Order): string {
  const parts: string[] = [];
  if (order.packageCount && order.packageCountUnit) {
    parts.push(`1${order.unit} = ${order.packageCount}${order.packageCountUnit}`);
  }
  if (order.packageSize && order.packageUnit) {
    const sourceUnit = order.packageCount && order.packageCountUnit ? order.packageCountUnit : order.unit;
    parts.push(`1${sourceUnit} = ${order.packageSize}${order.packageUnit}`);
    if (order.packageCount && order.packageCountUnit) {
      parts.push(`每${order.unit}共${order.packageCount * order.packageSize}${order.packageUnit}`);
    }
  }
  return parts.join('；');
}

function bundlePriceLabel(order: Order): string | null {
  if (!order.purchaseBundleName || !Number.isFinite(order.purchaseBundleTotalPrice)) return null;
  const quantity = order.purchaseBundleQuantity && order.purchaseBundleQuantity > 0 ? order.purchaseBundleQuantity : 1;
  return `${order.purchaseBundleName} · ${quantity}${order.purchaseBundleUnit || '套'}共 ¥${(order.purchaseBundleTotalPrice ?? 0).toFixed(2)}`;
}

function inventoryOperationUnits(order: Order): string[] {
  return [order.unit, order.packageCountUnit, order.packageUnit]
    .filter((unit): unit is string => Boolean(unit?.trim()))
    .filter((unit, index, units) => units.findIndex(item => normalizeHistorySearch(item) === normalizeHistorySearch(unit)) === index);
}

function countPurchaseRecords(orders: Order[]): number {
  return new Set(orders.map(order => order.purchaseBatchId || order.id)).size;
}

function SortableHeader({ field, label, activeField, direction, onSort, className }: {
  field: SortField;
  label: string;
  activeField: SortField;
  direction: SortDirection;
  onSort: (field: SortField) => void;
  className?: string;
}) {
  const active = field === activeField;
  const Icon = active ? (direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th
      className={cn('px-4 py-3 text-left font-medium text-muted-foreground', className)}
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          'inline-flex items-center gap-1.5 whitespace-nowrap transition-colors hover:text-foreground',
          active && 'text-foreground'
        )}
        title={`按${label}排序${active ? `，当前${direction === 'asc' ? '正序' : '倒序'}` : ''}`}
      >
        {label}
        <Icon className={cn('h-3.5 w-3.5', !active && 'opacity-45')} />
      </button>
    </th>
  );
}

/** Get depletion info for an order */
function getExpiryInfo(order: Order): { daysLeft: number; expiryDate: string } | null {
  if (!order.productionDate || !order.shelfLife) return null;
  const prod = new Date(`${order.productionDate}T00:00:00Z`);
  const expiry = new Date(prod.getTime() + order.shelfLife * 24 * 60 * 60 * 1000);
  const today = localDateKey();
  const daysLeft = Math.round((expiry.getTime() - new Date(`${today}T00:00:00Z`).getTime()) / (24 * 60 * 60 * 1000));
  return { daysLeft, expiryDate: localDateKey(expiry) };
}

function expiryDaysLabel(daysLeft: number, compact = false) {
  if (daysLeft < 0) return `已过期${compact ? '' : ' '}${Math.abs(daysLeft)}天`;
  if (daysLeft === 0) return compact ? '今天' : '今天到期';
  return compact ? `${daysLeft}天` : `还剩 ${daysLeft} 天`;
}

function getDepletionInfo(order: Order, feedingRecords: FeedingRecord[]): { daysLeft: number; depletionDate: string; dailyUsage: number } | null {
  if (!['delivered', 'no-repurchase'].includes(order.status)) return null;
  const remaining = inventoryRemaining(order);
  if (remaining <= 0) {
    return { daysLeft: 0, depletionDate: localDateKey(), dailyUsage: 0 };
  }
  // Feeding records are measured in their own units (usually grams). Convert
  // observed usage to the inventory unit before estimating depletion. This
  // prevents 30g/day from being interpreted as 30kg/day.
  const dailyUsage = getDailyUsage(order, feedingRecords);
  if (dailyUsage <= 0) return null;
  const daysLeft = Math.floor(remaining / dailyUsage);
  return { daysLeft, depletionDate: addLocalDays(localDateKey(), daysLeft), dailyUsage };
}

function getDailyUsage(order: Order, feedingRecords: FeedingRecord[]): number {
  const observedUsage = calcDailyUsage(order.itemName, feedingRecords, order.unit, order);
  return observedUsage > 0
    ? observedUsage
    : normalizeConfiguredDailyUsage(order.dailyUsage, order.unit, order.quantity);
}

export default function ProcurementPage() {
  const { state, addOrder, updateOrder, updateOrderStatus, updateOrderCategory, adjustOrderStock, deleteOrder, addExpense } = useAppContext();
  const catOrders = state.orders;
  const catFeedingRecords = state.feedingRecords;
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('purchaseDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [sortReady, setSortReady] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [stockAdjustment, setStockAdjustment] = useState<{ order: Order; mode: 'consume' | 'restore' } | null>(null);
  const [repurchaseOrder, setRepurchaseOrder] = useState<Order | null>(null);
  const ordersSectionRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [tableScrollWidth, setTableScrollWidth] = useState(0);
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);
  const [windowScrollGeometry, setWindowScrollGeometry] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const requestedFilter = new URLSearchParams(window.location.search).get('filter');
    if (requestedFilter && ['low-stock', 'expiring', 'expired', 'in-progress', 'pending', 'shipped', 'delivered', 'no-repurchase', 'durable', 'finished', 'cancelled'].includes(requestedFilter)) {
      setStatusFilter(requestedFilter);
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SORT_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { field?: string; direction?: string };
        if (saved.field && saved.field in sortFieldLabels) setSortField(saved.field as SortField);
        if (saved.direction === 'asc' || saved.direction === 'desc') setSortDirection(saved.direction);
      }
    } catch {
      // Ignore an invalid saved preference and keep the useful default.
    }
    setSortReady(true);
  }, []);

  useEffect(() => {
    if (!sortReady) return;
    localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify({ field: sortField, direction: sortDirection }));
  }, [sortField, sortDirection, sortReady]);

  useEffect(() => {
    const tableScroll = tableScrollRef.current;
    const table = tableRef.current;
    if (!tableScroll || !table) return;

    const updateScrollMetrics = () => {
      setTableScrollWidth(tableScroll.scrollWidth);
      setHasHorizontalOverflow(tableScroll.scrollWidth > tableScroll.clientWidth + 1);
      const bounds = tableScroll.getBoundingClientRect();
      setWindowScrollGeometry({ left: bounds.left, width: bounds.width });
    };
    const observer = new ResizeObserver(updateScrollMetrics);
    observer.observe(tableScroll);
    observer.observe(table);
    updateScrollMetrics();

    return () => observer.disconnect();
  }, []);

  const syncHorizontalScroll = (source: 'top' | 'table') => {
    const topScroll = topScrollRef.current;
    const tableScroll = tableScrollRef.current;
    if (!topScroll || !tableScroll) return;
    if (source === 'top' && tableScroll.scrollLeft !== topScroll.scrollLeft) {
      tableScroll.scrollLeft = topScroll.scrollLeft;
    }
    if (source === 'table' && topScroll.scrollLeft !== tableScroll.scrollLeft) {
      topScroll.scrollLeft = tableScroll.scrollLeft;
    }
  };

  const changeSortField = (field: SortField) => {
    if (field === sortField) {
      setSortDirection(current => current === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortField(field);
    setSortDirection(field === 'purchaseDate' ? 'desc' : 'asc');
  };

  const filteredOrders = useMemo(() => {
    return catOrders
      .filter(o => {
        const expiry = getExpiryInfo(o);
        const depletion = getDepletionInfo(o, catFeedingRecords);
        const stockRatio = o.quantity > 0 ? inventoryRemaining(o) / o.quantity : 0;
        if (statusFilter === 'low-stock' && !(o.status === 'delivered' && !o.repurchasedAt && (stockRatio <= 0.3 || (depletion && depletion.daysLeft <= 7)))) return false;
        if (statusFilter === 'expiring' && !(['delivered', 'no-repurchase'].includes(o.status) && expiry && expiry.daysLeft >= 0 && expiry.daysLeft <= 7)) return false;
        if (statusFilter === 'expired' && !(['delivered', 'no-repurchase'].includes(o.status) && expiry && expiry.daysLeft < 0)) return false;
        if (statusFilter === 'in-progress' && !['pending', 'shipped'].includes(o.status)) return false;
        if (!['all', 'low-stock', 'expiring', 'expired', 'in-progress'].includes(statusFilter) && o.status !== statusFilter) return false;
        if (categoryFilter !== 'all' && o.category !== categoryFilter) return false;
        if (search && !(o.brand || '').includes(search) && !o.itemName.includes(search) && !(o.itemGroup || '').includes(search) && !o.category.includes(search) && !o.supplier.includes(search)) return false;
        return true;
      })
      .sort((a, b) => {
        let comparison = 0;
        if (sortField === 'name') comparison = chineseCollator.compare(`${a.brand || ''}${a.itemGroup || ''}${a.itemName}`, `${b.brand || ''}${b.itemGroup || ''}${b.itemName}`);
        if (sortField === 'category') comparison = chineseCollator.compare(a.category, b.category);
        if (sortField === 'purchaseDate') comparison = a.purchaseDate.localeCompare(b.purchaseDate);
        if (sortField === 'status') comparison = statusSortOrder[a.status] - statusSortOrder[b.status];
        if (comparison !== 0) return sortDirection === 'asc' ? comparison : -comparison;
        return b.purchaseDate.localeCompare(a.purchaseDate)
          || chineseCollator.compare(a.itemName, b.itemName)
          || chineseCollator.compare(a.id, b.id);
      });
  }, [catOrders, catFeedingRecords, search, statusFilter, categoryFilter, sortField, sortDirection]);

  const purchaseBatchCovers = useMemo(() => {
    const covers = new Map<string, string>();
    catOrders.forEach(order => {
      if (!order.purchaseBatchId || covers.has(order.purchaseBatchId)) return;
      const cover = order.imageUrls?.[0] || order.imageUrl;
      if (cover) covers.set(order.purchaseBatchId, cover);
    });
    return covers;
  }, [catOrders]);

  // Items expiring within 7 days
  const expiringItems = useMemo(() => {
    return catOrders
      .map(order => {
        const info = getExpiryInfo(order);
        if (!info) return null;
        return { order, ...info };
      })
      .filter((item): item is { order: Order; daysLeft: number; expiryDate: string } => item !== null && item.daysLeft <= 7 && ['delivered', 'no-repurchase'].includes(item.order.status))
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [catOrders]);

  // Items needing repurchase within 7 days (based on consumption speed)
  const repurchaseItems = useMemo(() => {
    return catOrders
      .filter(o => o.status === 'delivered' && !o.repurchasedAt)
      .map(order => {
        const info = getDepletionInfo(order, catFeedingRecords);
        if (!info) return null;
        return { order, ...info };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null && item.daysLeft <= 7)
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [catOrders, catFeedingRecords]);

  // Food preference analysis from feeding records
  const foodPreferences = useMemo(() => {
    const foodMap = new Map<string, { fast: number; normal: number; slow: number; total: number }>();
    catFeedingRecords.forEach(r => {
      const food = r.foodName || r.mealType;
      if (!foodMap.has(food)) foodMap.set(food, { fast: 0, normal: 0, slow: 0, total: 0 });
      const stats = foodMap.get(food)!;
      stats.total++;
      if (r.eatingSpeed === 'fast') stats.fast++;
      else if (r.eatingSpeed === 'slow') stats.slow++;
      else stats.normal++;
    });
    // Link to procurement orders
    return catOrders
      .filter(o => ['delivered', 'no-repurchase'].includes(o.status))
      .map(order => {
        const food = order.itemName;
        const stats = foodMap.get(food);
        if (!stats || stats.total === 0) return { order, preference: 'unknown' as const, stats: null };
        const score = (stats.fast * 2 + stats.normal) / (stats.total * 2);
        const preference = score >= 0.6 ? 'loved' as const : score <= 0.3 ? 'disliked' as const : 'normal' as const;
        return { order, preference, stats };
      })
      .filter(item => item.preference !== 'unknown');
  }, [catOrders, catFeedingRecords]);

  const summary = useMemo(() => {
    const activeStatuses: Order['status'][] = ['delivered', 'no-repurchase', 'durable'];
    const regularStockValue = catOrders
      .filter(order => !order.purchaseBatchId && activeStatuses.includes(order.status))
      .reduce((sum, order) => sum + inventoryRemaining(order) * order.unitPrice, 0);
    const purchaseBatches = new Map<string, Order[]>();
    catOrders.filter(order => order.purchaseBatchId).forEach(order => {
      const items = purchaseBatches.get(order.purchaseBatchId as string) || [];
      items.push(order);
      purchaseBatches.set(order.purchaseBatchId as string, items);
    });
    const bundleStockValue = [...purchaseBatches.values()].reduce((sum, items) => {
      const totalQuantity = items.reduce((quantity, item) => quantity + item.quantity, 0);
      if (totalQuantity <= 0) return sum;
      const activeRemaining = items
        .filter(item => activeStatuses.includes(item.status))
        .reduce((quantity, item) => quantity + inventoryRemaining(item), 0);
      const totalPrice = items[0]?.purchaseBundleTotalPrice ?? 0;
      return sum + totalPrice * Math.min(1, activeRemaining / totalQuantity);
    }, 0);
    const stockValue = regularStockValue + bundleStockValue;
    const lowStock = catOrders.filter(order => {
      if (order.status !== 'delivered' || order.repurchasedAt) return false;
      const ratio = order.quantity > 0 ? inventoryRemaining(order) / order.quantity : 0;
      const depletion = getDepletionInfo(order, catFeedingRecords);
      return ratio <= 0.3 || Boolean(depletion && depletion.daysLeft <= 7);
    }).length;
    const pending = countPurchaseRecords(catOrders.filter(order => order.status === 'pending' || order.status === 'shipped'));
    return { stockValue, lowStock, pending, count: countPurchaseRecords(catOrders) };
  }, [catOrders, catFeedingRecords]);

  const showOrderFilter = (filter: string) => {
    setStatusFilter(filter);
    setCategoryFilter('all');
    setSearch('');
    window.requestAnimationFrame(() => ordersSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <div className="space-y-6 fade-in">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">物资与采购</h1>
          <p className="text-sm text-muted-foreground mt-1">采购入库、日常领用、临期与补货在这里形成闭环</p>
        </div>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button className="btn-press bg-primary hover:bg-primary/90 text-primary-foreground">
              <Plus className="w-4 h-4 mr-1.5" /> 新建采购
            </Button>
          </DialogTrigger>
          {showAdd && <AddOrderDialog orders={catOrders} onClose={() => setShowAdd(false)} onAdd={addOrder} addExpense={addExpense} />}
        </Dialog>
      </div>

      {/* Expiry Reminder */}
      {expiringItems.length > 0 && (
        <div className="card-warm border-l-4 border-l-[#E88888] p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-[#E88888]" />
            <h3 className="font-semibold text-foreground text-sm">保质期提醒</h3>
            <Badge variant="secondary" className="bg-[#E88888]/10 text-[#E88888] text-xs">{expiringItems.length} 项需处理</Badge>
          </div>
          <div className="space-y-2">
            {expiringItems.map(({ order, daysLeft, expiryDate }) => (
              <div key={order.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-[#E88888]/5">
                <div className="flex items-center gap-2">
                  <Package className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">{productDisplayName(order)}</span>
                  <span className="text-xs text-muted-foreground">{inventoryRemaining(order)}{order.unit} 剩余</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">到期 {expiryDate}</span>
                  <Badge className={cn('text-xs', daysLeft <= 3 ? 'bg-[#E88888] text-white' : 'bg-[#E88888]/20 text-[#E88888]')}>
                    {expiryDaysLabel(daysLeft)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Repurchase Reminder */}
      {repurchaseItems.length > 0 && (
        <div className="card-warm border-l-4 border-l-accent p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="w-4 h-4 text-accent" />
            <h3 className="font-semibold text-foreground text-sm">回购提醒</h3>
            <Badge variant="secondary" className="bg-accent/10 text-accent text-xs">{repurchaseItems.length} 项即将耗尽</Badge>
          </div>
          <div className="space-y-2">
            {repurchaseItems.map(({ order, daysLeft, depletionDate, dailyUsage }) => (
              <div key={order.id} className="flex flex-col gap-2 py-2 px-3 rounded-lg bg-accent/5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <Package className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">{productDisplayName(order)}</span>
                  <span className="text-xs text-muted-foreground">剩余 {inventoryRemaining(order)}{order.unit}</span>
                  <span className="text-xs text-muted-foreground">· 日均消耗 {formatInventoryDailyUsage(dailyUsage, order.unit)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">预计 {depletionDate} 耗尽</span>
                  <Badge className={cn('text-xs', daysLeft <= 3 ? 'bg-accent text-white' : 'bg-accent/20 text-accent')}>
                    {daysLeft === 0 ? '今天耗尽' : `还剩 ${daysLeft} 天`}
                  </Badge>
                  <Button variant="outline" size="sm" onClick={() => setRepurchaseOrder(order)} className="h-7 text-xs">
                    <ShoppingCart className="h-3.5 w-3.5" />已回购
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Food Preference Repurchase Suggestions */}
      {foodPreferences.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 card-hover">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🐾</span>
              <h3 className="font-semibold text-foreground text-sm">回购决策建议</h3>
            </div>
            <div className="flex gap-2">
              <Badge variant="secondary" className="bg-primary/10 text-primary text-xs">
                {foodPreferences.filter(f => f.preference === 'loved').length} 推荐回购
              </Badge>
              <Badge variant="secondary" className="bg-destructive/10 text-destructive text-xs">
                {foodPreferences.filter(f => f.preference === 'disliked').length} 不建议回购
              </Badge>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {foodPreferences.map(({ order, preference, stats }) => (
              <div
                key={order.id}
                className={`rounded-lg border p-3 transition-all ${
                  preference === 'loved'
                    ? 'border-primary/30 bg-primary/5'
                    : preference === 'disliked'
                    ? 'border-destructive/30 bg-destructive/5'
                    : 'border-border bg-muted/30'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-medium text-sm text-foreground">{productDisplayName(order)}</span>
                  {preference === 'loved' ? (
                    <Badge className="bg-primary/15 text-primary text-xs">推荐回购</Badge>
                  ) : preference === 'disliked' ? (
                    <Badge className="bg-destructive/15 text-destructive text-xs">不建议</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">一般</Badge>
                  )}
                </div>
                {stats && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="text-primary">😋{stats.fast}</span>
                    <span>😐{stats.normal}</span>
                    <span className="text-destructive">😒{stats.slow}</span>
                    <span className="ml-auto">共{stats.total}次</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="当前库存价值" value={`¥${summary.stockValue.toLocaleString()}`} active={statusFilter === 'all'} onClick={() => showOrderFilter('all')} />
        <SummaryCard label="物资批次" value={`${summary.count} 批`} active={statusFilter === 'all'} onClick={() => showOrderFilter('all')} />
        <SummaryCard label="需要补货" value={`${summary.lowStock} 项`} accent={summary.lowStock ? 'text-[#D4915E]' : 'text-primary-foreground'} active={statusFilter === 'low-stock'} onClick={() => showOrderFilter('low-stock')} />
        <SummaryCard label="进行中" value={`${summary.pending} 单`} accent="text-accent" active={statusFilter === 'in-progress'} onClick={() => showOrderFilter('in-progress')} />
      </div>

      {/* Filters */}
      <div ref={ordersSectionRef} className="flex scroll-mt-4 items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="搜索品牌、系列、物资名称、分类、供应商..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-card"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[150px] bg-card">
            <SelectValue placeholder="全部分类" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部分类</SelectItem>
            <InventoryCategoryOptions />
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[156px] bg-card">
            <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="全部状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="low-stock">需要补货</SelectItem>
            <SelectItem value="expiring">7 天内到期</SelectItem>
            <SelectItem value="expired">已过期</SelectItem>
            <SelectItem value="in-progress">进行中</SelectItem>
            <SelectItem value="pending">待发货</SelectItem>
            <SelectItem value="shipped">运输中</SelectItem>
            <SelectItem value="delivered">已到货</SelectItem>
            <SelectItem value="no-repurchase">使用中·不回购</SelectItem>
            <SelectItem value="durable">耐用品·无消耗</SelectItem>
            <SelectItem value="finished">已用完·不回购</SelectItem>
            <SelectItem value="cancelled">已取消</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortField} onValueChange={value => changeSortField(value as SortField)}>
          <SelectTrigger className="w-[150px] bg-card">
            <ArrowUpDown className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue aria-label="排序依据" />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(sortFieldLabels) as [SortField, string][]).map(([field, label]) => (
              <SelectItem key={field} value={field}>按{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortDirection} onValueChange={value => setSortDirection(value as SortDirection)}>
          <SelectTrigger className="w-[112px] bg-card">
            {sortDirection === 'asc'
              ? <ArrowUp className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
              : <ArrowDown className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />}
            <SelectValue aria-label="排序方向" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="asc">正序</SelectItem>
            <SelectItem value="desc">倒序</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Orders Table */}
      <div className="relative">
        <div className="card-warm overflow-hidden">
          <div
            ref={tableScrollRef}
            className="overflow-x-auto"
            onScroll={() => syncHorizontalScroll('table')}
          >
            <table ref={tableRef} className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <SortableHeader
                  field="name"
                  label="物资名称"
                  activeField={sortField}
                  direction={sortDirection}
                  onSort={changeSortField}
                  className="sticky left-0 z-20 w-[172px] min-w-[172px] max-w-[172px] bg-muted shadow-[7px_0_9px_-9px_rgba(56,45,49,0.65)]"
                />
                <SortableHeader field="category" label="分类" activeField={sortField} direction={sortDirection} onSort={changeSortField} />
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">库存</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">日均消耗</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">单价</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">供应商</th>
                <SortableHeader field="purchaseDate" label="采购时间" activeField={sortField} direction={sortDirection} onSort={changeSortField} />
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">生产日期</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">保质期</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">预计耗尽</th>
                <SortableHeader field="status" label="状态" activeField={sortField} direction={sortDirection} onSort={changeSortField} />
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order, visibleIndex) => {
                const remaining = inventoryRemaining(order);
                const ratio = order.quantity > 0 ? Math.max(0, remaining / order.quantity) : 0;
                const st = statusMap[order.status];
                const expiry = getExpiryInfo(order);
                const dailyUsage = getDailyUsage(order, catFeedingRecords);
                const depletion = getDepletionInfo(order, catFeedingRecords);
                const needsRestock = order.status === 'delivered' && !order.repurchasedAt
                  && (ratio <= 0.3 || Boolean(depletion && depletion.daysLeft <= 7));
                const sourceOrderIndex = state.orders.findIndex(item => item.id === order.id);
                const showGroupHeading = Boolean(order.itemGroup && filteredOrders[visibleIndex - 1]?.itemGroup !== order.itemGroup);
                const showBundlePrice = !order.purchaseBatchId || filteredOrders[visibleIndex - 1]?.purchaseBatchId !== order.purchaseBatchId;
                const coverImage = order.imageUrls?.[0] || order.imageUrl || (order.purchaseBatchId ? purchaseBatchCovers.get(order.purchaseBatchId) : undefined);
                const priceHistory = getPriceHistory(
                  order.itemName,
                  order.unit,
                  order.unitPrice,
                  sourceOrderIndex > 0 ? state.orders.slice(0, sourceOrderIndex) : [],
                );
                return (
                  <tr key={order.id} className="group border-b border-border/50 transition-colors hover:bg-muted/20">
                    <td className="sticky left-0 z-10 w-[172px] min-w-[172px] max-w-[172px] bg-card px-4 py-3 shadow-[7px_0_9px_-9px_rgba(56,45,49,0.65)] transition-colors group-hover:bg-muted">
                      {order.brand && <div className="mb-0.5 text-xs font-semibold text-foreground" title={order.brand}>{order.brand}</div>}
                      {showGroupHeading && <div className="mb-1 text-xs font-semibold text-primary" title={order.itemGroup}>{order.itemGroup}</div>}
                      <div className={cn('flex items-center gap-2', (order.brand || order.itemGroup) && 'pl-2')}>
                        {coverImage ? (
                          <Image src={coverImage} alt="" width={32} height={32} unoptimized className="h-8 w-8 shrink-0 rounded border border-border object-cover" />
                        ) : <Package className="w-4 h-4 text-muted-foreground shrink-0" />}
                        <span className="line-clamp-2 break-words font-medium leading-5 text-foreground" title={order.itemName}>{order.itemName}</span>
                      </div>
                      {(order.productBenefits || order.suitableLifeStages || order.feedingGuidance) && (
                        <div className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted-foreground" title={order.productBenefits || order.feedingGuidance}>
                          {order.productBenefits || order.feedingGuidance}
                          {order.suitableLifeStages ? ` · ${order.suitableLifeStages}` : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Select value={order.category} onValueChange={category => updateOrderCategory(order.id, category)}>
                        <SelectTrigger size="sm" className="w-[116px] border-transparent bg-transparent px-2 shadow-none hover:border-input hover:bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent><InventoryCategoryOptions /></SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn('h-full rounded-full transition-all', ratio > 0.3 ? 'bg-primary' : 'bg-accent')}
                            style={{ width: `${ratio * 100}%` }}
                          />
                        </div>
                        <span className={cn('text-xs', ratio < 0.3 ? 'text-accent font-medium' : 'text-muted-foreground')}>
                          {remaining}{order.unit}
                        </span>
                      </div>
                      {packageConversionLabel(order) && (
                        <div className="mt-1 whitespace-nowrap text-[10px] text-muted-foreground">{packageConversionLabel(order)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {formatInventoryDailyUsage(dailyUsage, order.unit)}
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {bundlePriceLabel(order) && showBundlePrice ? (
                        <>
                          <div className="max-w-[220px] text-xs font-medium leading-5">整盒采购</div>
                          <div className="max-w-[220px] text-xs leading-5 text-muted-foreground" title={bundlePriceLabel(order) || undefined}>{bundlePriceLabel(order)}</div>
                        </>
                      ) : order.purchaseBatchId ? (
                        <div className="whitespace-nowrap text-xs text-muted-foreground">同一整盒采购</div>
                      ) : (
                        <>
                          <div className="whitespace-nowrap font-medium">¥{order.unitPrice.toFixed(2)}/{order.unit}</div>
                          <div className="whitespace-nowrap text-xs text-muted-foreground">本次共 ¥{orderTotalPrice(order).toFixed(2)}</div>
                          {priceHistory && <PriceChangeLabel history={priceHistory} />}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{order.supplier}</td>
                    <td className="px-4 py-3 text-muted-foreground">{order.purchaseDate}</td>
                    <td className="px-4 py-3 text-muted-foreground">{order.productionDate || '-'}</td>
                    <td className="px-4 py-3">
                      {order.shelfLife ? (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-muted-foreground" />
                          <span className="text-muted-foreground">{formatShelfLife(order)}</span>
                          {expiry && expiry.daysLeft <= 7 && (
                            <Badge className="ml-1 text-[10px] px-1 py-0 bg-[#E88888]/15 text-[#E88888] border-0">
                              {expiryDaysLabel(expiry.daysLeft, true)}
                            </Badge>
                          )}
                        </div>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      {depletion ? (
                          <div className="flex items-center gap-1">
                            <TrendingDown className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{depletion.depletionDate}</span>
                            {depletion.daysLeft <= 7 && (
                              <Badge className="ml-1 text-[10px] px-1 py-0 bg-accent/15 text-accent border-0">
                                {depletion.daysLeft === 0 ? '今天' : `${depletion.daysLeft}天`}
                              </Badge>
                            )}
                          </div>
                        ) : <span className="text-muted-foreground text-xs">-</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Select value={order.status} onValueChange={status => updateOrderStatus(order.id, status as Order['status'])}>
                        <SelectTrigger size="sm" className={cn('w-[144px] border-0 shadow-none', st.color)} aria-label={`修改${order.itemName}的状态`}>
                          <st.icon className="h-3.5 w-3.5 shrink-0" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.entries(statusMap) as [Order['status'], (typeof statusMap)[Order['status']]][]).map(([value, status]) => (
                            <SelectItem key={value} value={value}>{status.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex min-w-[246px] items-center gap-1.5">
                        <Select
                          value=""
                          onValueChange={mode => setStockAdjustment({ order, mode: mode as 'consume' | 'restore' })}
                          disabled={!['delivered', 'no-repurchase'].includes(order.status) || (remaining <= 0 && order.consumed <= 0)}
                        >
                          <SelectTrigger size="sm" className="w-[104px]" aria-label={`调整${order.itemName}的库存`}>
                            <SelectValue placeholder="库存操作" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="consume" disabled={remaining <= 0}>领用</SelectItem>
                            <SelectItem value="restore" disabled={order.consumed <= 0}>退回</SelectItem>
                          </SelectContent>
                        </Select>
                        {needsRestock && (
                          <Button variant="outline" size="sm" onClick={() => setRepurchaseOrder(order)} className="h-8 text-xs">
                            <ShoppingCart className="h-3.5 w-3.5" />已回购
                          </Button>
                        )}
                        <Button variant="ghost" size="icon-sm" onClick={() => openFeedingPlanDraft(order)} title="用商品资料编辑喂食计划" aria-label={`用${order.itemName}编辑喂食计划`}>
                          <Utensils className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => setEditingOrder(order)} title="编辑采购记录" aria-label={`编辑${order.itemName}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => { if (confirm('确定删除该订单？')) deleteOrder(order.id); }} className="text-destructive" title="删除采购记录" aria-label={`删除${order.itemName}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            </table>
            {filteredOrders.length === 0 && (
              <div className="text-center py-12 text-muted-foreground text-sm">没有找到匹配的订单</div>
            )}
          </div>
        </div>
      </div>
      {hasHorizontalOverflow && windowScrollGeometry.width > 0 && (
        <div
          className="procurement-window-scrollbar fixed bottom-2 z-50 overflow-hidden rounded-md bg-card/95 shadow-md backdrop-blur"
          style={{ left: windowScrollGeometry.left, width: windowScrollGeometry.width, bottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        >
          <div
            ref={topScrollRef}
            className="procurement-top-scrollbar overflow-x-scroll"
            onScroll={() => syncHorizontalScroll('top')}
            aria-label="采购表横向滚动条"
          >
            <div className="h-px" style={{ width: tableScrollWidth }} />
          </div>
        </div>
      )}
      {stockAdjustment && (
        <InventoryAdjustmentDialog
          key={`${stockAdjustment.order.id}-${stockAdjustment.mode}`}
          order={stockAdjustment.order}
          mode={stockAdjustment.mode}
          onClose={() => setStockAdjustment(null)}
          onConfirm={amount => {
            adjustOrderStock(stockAdjustment.order.id, stockAdjustment.mode, amount);
            setStockAdjustment(null);
          }}
        />
      )}
      {editingOrder && (
        <EditOrderDialog
          key={editingOrder.id}
          order={editingOrder}
          orders={catOrders}
          onClose={() => setEditingOrder(null)}
          onSave={updates => {
            updateOrder(editingOrder.id, updates);
            setEditingOrder(null);
          }}
        />
      )}
      {repurchaseOrder && (
        <RepurchaseDialog
          key={repurchaseOrder.id}
          order={repurchaseOrder}
          open
          onOpenChange={open => { if (!open) setRepurchaseOrder(null); }}
        />
      )}
    </div>
  );
}

function InventoryAdjustmentDialog({ order, mode, onClose, onConfirm }: {
  order: Order;
  mode: 'consume' | 'restore';
  onClose: () => void;
  onConfirm: (amount: number) => void;
}) {
  const remaining = inventoryRemaining(order);
  const operationUnits = inventoryOperationUnits(order);
  const hasAlternativeUnits = operationUnits.length > 1;
  const [inputUnit, setInputUnit] = useState(order.unit);
  const maximumInPrimaryUnit = mode === 'consume' ? remaining : order.consumed;
  const maximum = inputUnit === order.unit || !hasAlternativeUnits
    ? maximumInPrimaryUnit
    : convertInventoryToUsageAmount(order, maximumInPrimaryUnit, inputUnit) || 0;
  const configuredUsage = normalizeConfiguredDailyUsage(order.dailyUsage, order.unit, order.quantity);
  const suggestedInPrimaryUnit = mode === 'consume' && configuredUsage > 0
    ? Math.min(configuredUsage, maximumInPrimaryUnit)
    : Math.min(1, maximumInPrimaryUnit);
  const suggested = inputUnit === order.unit || !hasAlternativeUnits
    ? suggestedInPrimaryUnit
    : convertInventoryToUsageAmount(order, suggestedInPrimaryUnit, inputUnit) || 0;
  const [amount, setAmount] = useState(String(suggested));
  const parsedAmount = Number(amount);
  const parsedInPrimaryUnit = inputUnit === order.unit || !hasAlternativeUnits
    ? parsedAmount
    : convertUsageToInventoryAmount(order, parsedAmount, inputUnit) || 0;
  const valid = Number.isFinite(parsedAmount) && parsedAmount > 0 && parsedInPrimaryUnit > 0 && parsedInPrimaryUnit <= maximumInPrimaryUnit;
  const verb = mode === 'consume' ? '领用' : '退回';
  const afterRemaining = inventoryRemaining({
    ...order,
    consumed: mode === 'consume' ? order.consumed + parsedInPrimaryUnit : order.consumed - parsedInPrimaryUnit,
  });

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>确认库存{verb}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg bg-muted/45 px-3 py-3">
            <p className="text-sm font-medium text-foreground">{order.itemName}</p>
            <p className="text-xs text-muted-foreground mt-1">当前可用 {remaining}{order.unit}，已领用 {order.consumed}{order.unit}</p>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label>本次{verb}数量</Label>
              {hasAlternativeUnits && (
                <Select value={inputUnit} onValueChange={nextUnit => { setInputUnit(nextUnit); setAmount(''); }}>
                  <SelectTrigger className="h-8 w-[120px]" aria-label="选择库存操作单位"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {operationUnits.map(unit => (
                      <SelectItem key={unit} value={unit}>
                        {unit}{unit === order.unit ? '（库存）' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <Input type="number" min="0" max={maximum} step="any" value={amount} onChange={event => setAmount(event.target.value)} autoFocus />
            {!valid && amount !== '' && <p className="text-xs text-destructive">数量必须大于 0，且不能超过{mode === 'consume' ? '当前库存' : '已领用数量'}。</p>}
            {hasAlternativeUnits && <p className="text-xs text-muted-foreground">{packageConversionLabel(order)}。当前可用约 {maximum}{inputUnit}；确认后会换算成库存单位保存。</p>}
          </div>
          <p className="text-xs text-muted-foreground">确认后剩余 {valid ? afterRemaining : remaining}{order.unit}，补货提醒会自动重算。</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>取消</Button>
            <Button disabled={!valid} onClick={() => onConfirm(parsedInPrimaryUnit)} className="bg-primary text-primary-foreground hover:bg-primary/90">确认{verb}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({ label, value, accent, active, onClick }: {
  label: string;
  value: string;
  accent?: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'card-warm p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        active && 'border-primary/45 bg-primary/5'
      )}
    >
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={cn('text-xl font-bold', accent || 'text-foreground')}>{value}</p>
    </button>
  );
}

function PriceChangeLabel({ history }: { history: NonNullable<ReturnType<typeof getPriceHistory>> }) {
  const nearlyEqual = Math.abs(history.changePercent) < 0.01;
  if (history.isHistoricalLow) return <div className="mt-0.5 whitespace-nowrap text-xs text-[#3F8A61]">历史低价</div>;
  if (nearlyEqual) return <div className="mt-0.5 whitespace-nowrap text-xs text-muted-foreground">与上次持平</div>;
  const lower = history.changePercent < 0;
  return (
    <div className={cn('mt-0.5 whitespace-nowrap text-xs', lower ? 'text-[#3F8A61]' : 'text-[#C56C5C]')}>
      比上次{lower ? '低' : '高'} {Math.abs(history.changePercent).toFixed(1)}%
    </div>
  );
}

function ShelfLifeField({ value, unit, onValueChange, onUnitChange, label = '保质期（选填）', compact = false }: {
  value: string;
  unit: ShelfLifeUnit;
  onValueChange: (value: string) => void;
  onUnitChange: (unit: ShelfLifeUnit) => void;
  label?: string;
  compact?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className={cn(compact && 'text-xs text-muted-foreground')}>{label}</Label>
      <div className="flex gap-2">
        <Input type="number" min="0" step="any" value={value} onChange={event => onValueChange(event.target.value)} placeholder="如：18" className="min-w-0 flex-1" />
        <Select value={unit} onValueChange={nextUnit => onUnitChange(nextUnit as ShelfLifeUnit)}>
          <SelectTrigger className={cn('shrink-0', compact ? 'w-[72px]' : 'w-[92px]')}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="day">天</SelectItem>
            <SelectItem value="month">月</SelectItem>
            <SelectItem value="year">年</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function normalizeHistorySearch(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/[\s\-_/·.,，。()（）]+/g, '');
}

function recentOrderValues(orders: Order[], select: (order: Order) => string | undefined): string[] {
  return [...orders]
    .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate))
    .map(order => select(order)?.trim() || '')
    .filter(Boolean);
}

function packageFieldsValid(packageCount: string, packageCountUnit: string, packageSize: string, packageUnit: string): boolean {
  const innerPackageValid = (!packageCount && !packageCountUnit.trim())
    || (Number.isFinite(Number(packageCount)) && Number(packageCount) > 0 && Boolean(packageCountUnit.trim()));
  const smallestUnitValid = (!packageSize && !packageUnit.trim())
    || (Number.isFinite(Number(packageSize)) && Number(packageSize) > 0 && Boolean(packageUnit.trim()));
  return innerPackageValid && smallestUnitValid;
}

function HistoryItemAutocomplete({ value, orders, onChange, onSelect, placeholder }: {
  value: string;
  orders: Order[];
  onChange: (value: string) => void;
  onSelect: (order: Order) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = React.useId();
  const templates = useMemo(() => {
    const seen = new Set<string>();
    return [...orders]
      .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate))
      .filter(order => {
        const key = normalizeHistorySearch(`${order.brand || ''}\u0000${order.itemName}\u0000${order.unit}`);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [orders]);
  const suggestions = useMemo(() => {
    const query = normalizeHistorySearch(value);
    if (!query) return templates.slice(0, 8);
    return templates.filter(order => normalizeHistorySearch([
      order.brand,
      order.itemName,
      order.itemGroup,
      order.category,
      order.unit,
    ].filter(Boolean).join(' ')).includes(query)).slice(0, 8);
  }, [templates, value]);

  useEffect(() => setActiveIndex(0), [value]);

  const choose = (order: Order) => {
    onSelect(order);
    setOpen(false);
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(current => (current + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(current => (current - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(suggestions[activeIndex]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={event => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && suggestions.length > 0}
        aria-controls={listId}
        aria-activedescendant={open && suggestions.length > 0 ? `${listId}-${suggestions[activeIndex]?.id}` : undefined}
      />
      {open && suggestions.length > 0 && (
        <div id={listId} role="listbox" className="absolute inset-x-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg">
          {suggestions.map((order, index) => (
            <button
              key={order.id}
              id={`${listId}-${order.id}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={event => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(order)}
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm',
                index === activeIndex && 'bg-accent text-accent-foreground'
              )}
            >
              <History className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-baseline gap-2">
                  {order.brand && <span className="shrink-0 font-semibold">{order.brand}</span>}
                  <span className="truncate">{order.itemName}</span>
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {[order.itemGroup, order.unit, order.purchaseDate].filter(Boolean).join(' · ')}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryTextAutocomplete({ value, values, onChange, placeholder }: {
  value: string;
  values: string[];
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = React.useId();
  const templates = useMemo(() => {
    const seen = new Set<string>();
    return values.filter(item => {
      const normalized = normalizeHistorySearch(item);
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
  }, [values]);
  const suggestions = useMemo(() => {
    const query = normalizeHistorySearch(value);
    if (!query) return templates.slice(0, 8);
    return templates
      .filter(item => normalizeHistorySearch(item).includes(query))
      .slice(0, 8);
  }, [templates, value]);

  useEffect(() => setActiveIndex(0), [value]);

  const choose = (suggestion: string) => {
    onChange(suggestion);
    setOpen(false);
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(current => (current + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(current => (current - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(suggestions[activeIndex]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={event => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && suggestions.length > 0}
        aria-controls={listId}
        aria-activedescendant={open && suggestions.length > 0 ? `${listId}-${activeIndex}` : undefined}
      />
      {open && suggestions.length > 0 && (
        <div id={listId} role="listbox" className="absolute inset-x-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg">
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion}
              id={`${listId}-${index}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={event => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(suggestion)}
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm',
                index === activeIndex && 'bg-accent text-accent-foreground'
              )}
            >
              <History className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{suggestion}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryTextareaAutocomplete({ value, values, onChange, placeholder }: {
  value: string;
  values: string[];
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const templates = useMemo(() => {
    const seen = new Set<string>();
    return values.filter(item => {
      const normalized = normalizeHistorySearch(item);
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
  }, [values]);
  const suggestions = useMemo(() => {
    const query = normalizeHistorySearch(value);
    return (query ? templates.filter(item => normalizeHistorySearch(item).includes(query)) : templates).slice(0, 6);
  }, [templates, value]);

  return (
    <div className="relative">
      <Textarea
        value={value}
        onChange={event => { onChange(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        placeholder={placeholder}
        rows={2}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 max-h-52 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg">
          {suggestions.map(suggestion => (
            <button
              key={suggestion}
              type="button"
              onMouseDown={event => event.preventDefault()}
              onClick={() => { onChange(suggestion); setOpen(false); }}
              className="flex w-full items-start gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
            >
              <History className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="line-clamp-2">{suggestion}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const MAX_PRODUCT_IMAGES = 4;

function ProductImageField({ imageUrls, onChange, onAnalysis }: {
  imageUrls: string[];
  onChange: (value: string[]) => void;
  onAnalysis: (analysis: ProductImageAnalysis) => void;
}) {
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const inputId = React.useId();

  const handleFiles = async (files: File[]) => {
    setError('');
    const remainingSlots = MAX_PRODUCT_IMAGES - imageUrls.length;
    if (remainingSlots <= 0) {
      setError(`每条记录最多保存 ${MAX_PRODUCT_IMAGES} 张图片`);
      return;
    }
    const selectedFiles = files.slice(0, remainingSlots);
    try {
      const compressed = await Promise.all(selectedFiles.map(file => compressProductImage(file)));
      onChange(Array.from(new Set([...imageUrls, ...compressed])).slice(0, MAX_PRODUCT_IMAGES));
      if (files.length > remainingSlots) setError(`已添加前 ${remainingSlots} 张，每条记录最多 ${MAX_PRODUCT_IMAGES} 张`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '图片读取失败');
    }
  };

  const handleAnalyze = async () => {
    if (!imageUrls.length || analyzing) return;
    setAnalyzing(true);
    setError('');
    try {
      onAnalysis(await analyzeProductImages(imageUrls));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '图片识别失败');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="rounded-lg border border-border/70 p-3">
      <div>
        <Label>商品图片（可选）</Label>
        <p className="mt-1 text-xs text-muted-foreground">最多 {MAX_PRODUCT_IMAGES} 张，可一次多选；采购列表只显示第一张，识别时会读取全部图片。</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {imageUrls.map((imageUrl, index) => (
          <div key={`${imageUrl.slice(-24)}-${index}`} className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-md border border-border bg-muted">
            <Image src={imageUrl} alt={`商品包装图 ${index + 1}`} fill sizes="72px" unoptimized className="object-cover" />
            {index === 0 ? (
              <span className="absolute bottom-1 left-1 rounded bg-foreground/75 px-1.5 py-0.5 text-[10px] text-background">首图</span>
            ) : (
              <button
                type="button"
                aria-label={`将第 ${index + 1} 张设为首图`}
                title="设为首图"
                onClick={() => onChange([imageUrl, ...imageUrls.filter((_, imageIndex) => imageIndex !== index)])}
                className="absolute bottom-1 left-1 flex h-6 w-6 items-center justify-center rounded bg-background/90 text-foreground shadow-sm hover:bg-background"
              >
                <Star className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              aria-label={`移除第 ${index + 1} 张图片`}
              title="移除图片"
              onClick={() => onChange(imageUrls.filter((_, imageIndex) => imageIndex !== index))}
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded bg-background/90 text-destructive shadow-sm hover:bg-background"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {!imageUrls.length && (
          <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><ImagePlus className="h-5 w-5" /></div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <input id={inputId} type="file" accept="image/*" multiple className="hidden" onChange={event => { const files = Array.from(event.target.files || []); if (files.length) void handleFiles(files); event.target.value = ''; }} />
        <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById(inputId)?.click()} disabled={imageUrls.length >= MAX_PRODUCT_IMAGES}>
          <ImagePlus className="h-3.5 w-3.5" />添加图片
        </Button>
        {imageUrls.length > 0 && <Button type="button" variant="outline" size="sm" onClick={handleAnalyze} disabled={analyzing}>
          {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <WandSparkles className="h-3.5 w-3.5" />}
          {analyzing ? '识别中…' : `识别全部 ${imageUrls.length} 张`}
        </Button>}
        {imageUrls.length > 0 && <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>全部移除</Button>}
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function ProductInfoFields({ benefits, suitableLifeStages, feedingGuidance, benefitsHistory = [], lifeStageHistory = [], feedingGuidanceHistory = [], onChange }: {
  benefits: string;
  suitableLifeStages: string;
  feedingGuidance: string;
  benefitsHistory?: string[];
  lifeStageHistory?: string[];
  feedingGuidanceHistory?: string[];
  onChange: (field: 'productBenefits' | 'suitableLifeStages' | 'feedingGuidance', value: string) => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-border/70 p-3">
      <div>
        <Label>商品资料（可选）</Label>
        <p className="mt-1 text-xs text-muted-foreground">可由图片识别填入，也可以自己修改。功效仅作包装信息记录，不替代兽医建议。</p>
      </div>
      <div className="space-y-1.5">
        <Label>功效 / 用途</Label>
        <HistoryTextareaAutocomplete value={benefits} values={benefitsHistory} onChange={value => onChange('productBenefits', value)} placeholder="如：完整营养主食、补充水分、日常营养支持" />
      </div>
      <div className="space-y-1.5">
        <Label>适合的猫咪阶段</Label>
        <HistoryTextAutocomplete value={suitableLifeStages} values={lifeStageHistory} onChange={value => onChange('suitableLifeStages', value)} placeholder="如：幼猫、成猫、恢复期（以包装和兽医意见为准）" />
      </div>
      <div className="space-y-1.5">
        <Label>喂食 / 使用提示</Label>
        <HistoryTextareaAutocomplete value={feedingGuidance} values={feedingGuidanceHistory} onChange={value => onChange('feedingGuidance', value)} placeholder="如：每日建议量、是否需要泡软、用药剂量等" />
      </div>
    </div>
  );
}

function openFeedingPlanDraft(order: Order) {
  const details = [
    order.brand ? `品牌：${order.brand}` : '',
    `商品：${order.itemName}`,
    order.itemGroup ? `系列：${order.itemGroup}` : '',
    order.category ? `分类：${order.category}` : '',
    order.productBenefits ? `功效/用途：${order.productBenefits}` : '',
    order.suitableLifeStages ? `适合阶段：${order.suitableLifeStages}` : '',
    order.feedingGuidance ? `喂食提示：${order.feedingGuidance}` : '',
    packageConversionLabel(order) ? `包装换算：${packageConversionLabel(order)}` : '',
  ].filter(Boolean).join('\n');
  window.dispatchEvent(new CustomEvent('zhongfu-chat-draft', {
    detail: `请根据以下采购商品资料，帮我编辑当前喂食计划。先结合钟福当前年龄、体重、健康状态和现有计划判断是否适合，再给出需要新增或替换的餐次和用量。不要擅自改变兽医已经给出的药物剂量；不确定的地方先问我。\n\n${details}`,
  }));
}

function applyProductAnalysis<T extends {
  brand: string;
  itemName: string;
  itemGroup: string;
  category: string;
  quantity: string;
  unit: string;
  totalPrice: string;
  supplier: string;
  packageCount: string;
  packageCountUnit: string;
  packageSize: string;
  packageUnit: string;
  productBenefits: string;
  suitableLifeStages: string;
  feedingGuidance: string;
}>(current: T, analysis: ProductImageAnalysis): T {
  return {
    ...current,
    brand: analysis.brand || current.brand,
    itemName: analysis.itemName || current.itemName,
    itemGroup: analysis.itemGroup || current.itemGroup,
    category: analysis.category || current.category,
    quantity: analysis.quantity ? String(analysis.quantity) : current.quantity,
    unit: analysis.unit || current.unit,
    totalPrice: analysis.totalPrice !== undefined ? String(analysis.totalPrice) : current.totalPrice,
    supplier: analysis.supplier || current.supplier,
    packageCount: analysis.packageCount ? String(analysis.packageCount) : current.packageCount,
    packageCountUnit: analysis.packageCountUnit || current.packageCountUnit,
    packageSize: analysis.packageSize ? String(analysis.packageSize) : current.packageSize,
    packageUnit: analysis.packageUnit || current.packageUnit,
    productBenefits: analysis.productBenefits || current.productBenefits,
    suitableLifeStages: analysis.suitableLifeStages || current.suitableLifeStages,
    feedingGuidance: analysis.feedingGuidance || current.feedingGuidance,
  };
}

function EditOrderDialog({ order, orders, onClose, onSave }: {
  order: Order;
  orders: Order[];
  onClose: () => void;
  onSave: (updates: Partial<Omit<Order, 'id'>>) => void;
}) {
  const initialShelfLife = shelfLifeForEditing(order.shelfLife, order.shelfLifeUnit);
  const [form, setForm] = useState({
    brand: order.brand || '',
    itemName: order.itemName,
    itemGroup: order.itemGroup || '',
    category: order.category,
    quantity: String(order.quantity),
    unit: order.unit,
    totalPrice: String(orderTotalPrice(order)),
    supplier: order.supplier,
    purchaseDate: order.purchaseDate,
    productionDate: order.productionDate || '',
    shelfLife: initialShelfLife.value,
    shelfLifeUnit: initialShelfLife.unit,
    packageCount: order.packageCount ? String(order.packageCount) : '',
    packageCountUnit: order.packageCountUnit || '',
    packageSize: order.packageSize ? String(order.packageSize) : '',
    packageUnit: order.packageUnit || '',
    imageUrls: order.imageUrls?.length ? order.imageUrls : order.imageUrl ? [order.imageUrl] : [],
    productBenefits: order.productBenefits || '',
    suitableLifeStages: order.suitableLifeStages || '',
    feedingGuidance: order.feedingGuidance || '',
    status: order.status,
  });
  const quantity = Number(form.quantity);
  const totalPrice = Number(form.totalPrice);
  const unitPrice = quantity > 0 && totalPrice >= 0 ? totalPrice / quantity : 0;
  const comparableOrders = orders.filter(item => item.id !== order.id);
  const priceHistory = getPriceHistory(form.itemName, form.unit, unitPrice, comparableOrders);
  const packageValid = packageFieldsValid(form.packageCount, form.packageCountUnit, form.packageSize, form.packageUnit);
  const valid = Boolean(
    form.itemName.trim()
    && form.unit.trim()
    && form.purchaseDate
    && Number.isFinite(quantity)
    && quantity > 0
    && Number.isFinite(totalPrice)
    && totalPrice >= 0
    && packageValid
  );

  const handleSave = () => {
    if (!valid) return;
    onSave({
      brand: form.brand.trim() || undefined,
      itemName: form.itemName.trim(),
      itemGroup: form.itemGroup.trim() || undefined,
      category: form.category,
      quantity,
      unit: form.unit.trim(),
      unitPrice,
      totalPrice,
      supplier: form.supplier.trim(),
      purchaseDate: form.purchaseDate,
      productionDate: form.productionDate || undefined,
      shelfLife: shelfLifeInDays(form.shelfLife, form.shelfLifeUnit),
      shelfLifeUnit: form.shelfLife ? form.shelfLifeUnit : undefined,
      packageCount: form.packageCount ? Number(form.packageCount) : undefined,
      packageCountUnit: form.packageCount ? form.packageCountUnit.trim() || undefined : undefined,
      packageSize: form.packageSize ? Number(form.packageSize) : undefined,
      packageUnit: form.packageSize ? form.packageUnit.trim() || undefined : undefined,
      imageUrls: form.imageUrls.length ? form.imageUrls : undefined,
      imageUrl: form.imageUrls[0] || undefined,
      productBenefits: form.productBenefits.trim() || undefined,
      suitableLifeStages: form.suitableLifeStages.trim() || undefined,
      feedingGuidance: form.feedingGuidance.trim() || undefined,
      status: form.status,
    });
  };

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>编辑采购记录</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <ProductImageField
            imageUrls={form.imageUrls}
            onChange={imageUrls => setForm(current => ({ ...current, imageUrls }))}
            onAnalysis={analysis => setForm(current => applyProductAnalysis(current, analysis))}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>品牌（可选）</Label>
              <HistoryTextAutocomplete value={form.brand} values={recentOrderValues(orders, item => item.brand)} onChange={brand => setForm(current => ({ ...current, brand }))} placeholder="如：麦德氏" />
            </div>
            <div className="space-y-1.5">
              <Label>物资名称</Label>
              <HistoryItemAutocomplete
                value={form.itemName}
                orders={orders.filter(item => item.id !== order.id)}
                onChange={itemName => setForm(current => ({ ...current, itemName }))}
                onSelect={template => {
                  const shelfLife = shelfLifeForEditing(template.shelfLife, template.shelfLifeUnit);
                  setForm(current => ({
                    ...current,
                    brand: template.brand || '',
                    itemName: template.itemName,
                    itemGroup: template.itemGroup || '',
                    category: template.category,
                    unit: template.unit,
                    supplier: template.supplier,
                    shelfLife: shelfLife.value,
                    shelfLifeUnit: shelfLife.unit,
                    packageCount: template.packageCount ? String(template.packageCount) : '',
                    packageCountUnit: template.packageCountUnit || '',
                    packageSize: template.packageSize ? String(template.packageSize) : '',
                    packageUnit: template.packageUnit || '',
                    imageUrls: template.imageUrls?.length ? template.imageUrls : template.imageUrl ? [template.imageUrl] : [],
                    productBenefits: template.productBenefits || '',
                    suitableLifeStages: template.suitableLifeStages || '',
                    feedingGuidance: template.feedingGuidance || '',
                  }));
                }}
                placeholder="输入品牌或名称联想历史物资"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>物资系列 / 大标题（可选）</Label>
            <HistoryTextAutocomplete value={form.itemGroup} values={recentOrderValues(orders, item => item.itemGroup)} onChange={itemGroup => setForm(current => ({ ...current, itemGroup }))} placeholder="输入可联想历史系列，如：原切冻干" />
          </div>
          <ProductInfoFields
            benefits={form.productBenefits}
            suitableLifeStages={form.suitableLifeStages}
            feedingGuidance={form.feedingGuidance}
            benefitsHistory={recentOrderValues(orders, item => item.productBenefits)}
            lifeStageHistory={recentOrderValues(orders, item => item.suitableLifeStages)}
            feedingGuidanceHistory={recentOrderValues(orders, item => item.feedingGuidance)}
            onChange={(field, value) => setForm(current => ({ ...current, [field]: value }))}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>分类</Label>
              <Select value={form.category} onValueChange={category => setForm(current => ({ ...current, category }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><InventoryCategoryOptions /></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>状态</Label>
              <Select value={form.status} onValueChange={status => setForm(current => ({ ...current, status: status as Order['status'] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(statusMap) as [Order['status'], (typeof statusMap)[Order['status']]][]).map(([value, status]) => (
                    <SelectItem key={value} value={value}>{status.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>数量</Label>
              <Input type="number" min="0" step="any" value={form.quantity} onChange={event => setForm(current => ({ ...current, quantity: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>单位</Label>
              <HistoryTextAutocomplete value={form.unit} values={recentOrderValues(orders, item => item.unit)} onChange={unit => setForm(current => ({ ...current, unit }))} placeholder="盒/包/袋/kg" />
            </div>
            <div className="space-y-1.5">
              <Label>本次总价(¥)</Label>
              <Input type="number" min="0" step="0.01" value={form.totalPrice} onChange={event => setForm(current => ({ ...current, totalPrice: event.target.value }))} />
            </div>
          </div>
          <div className="rounded-lg border border-border/70 p-3">
            <Label>包装换算（可选）</Label>
            <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
              <span className="text-sm text-muted-foreground">每{form.unit.trim() || '单位'}含</span>
              <Input type="number" min="0" step="any" value={form.packageCount} onChange={event => setForm(current => ({ ...current, packageCount: event.target.value }))} placeholder="如：6" />
              <HistoryTextAutocomplete value={form.packageCountUnit} values={recentOrderValues(orders, item => item.packageCountUnit)} onChange={packageCountUnit => setForm(current => ({ ...current, packageCountUnit }))} placeholder="包/袋/板" />
            </div>
            <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
              <span className="text-sm text-muted-foreground">每{form.packageCountUnit.trim() || form.unit.trim() || '单位'}含</span>
              <Input type="number" min="0" step="any" value={form.packageSize} onChange={event => setForm(current => ({ ...current, packageSize: event.target.value }))} placeholder="如：20" />
              <HistoryTextAutocomplete value={form.packageUnit} values={recentOrderValues(orders, item => item.packageUnit)} onChange={packageUnit => setForm(current => ({ ...current, packageUnit }))} placeholder="片/粒/g" />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">例：数量1、单位盒；每盒6包；每包60g。也可只填第二行表示每盒20片。</p>
          </div>
          {unitPrice > 0 && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs">
              <div className="font-medium text-foreground">自动换算：¥{unitPrice.toFixed(2)}/{form.unit.trim() || '单位'}</div>
              {priceHistory && <PriceChangeLabel history={priceHistory} />}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>购买渠道 / 商家（可选）</Label>
              <HistoryTextAutocomplete value={form.supplier} values={recentOrderValues(orders, item => item.supplier)} onChange={supplier => setForm(current => ({ ...current, supplier }))} placeholder="如：抖音直播间、宠物店" />
            </div>
            <div className="space-y-1.5">
              <Label>采购日期</Label>
              <Input type="date" value={form.purchaseDate} onChange={event => setForm(current => ({ ...current, purchaseDate: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>生产日期</Label>
              <Input type="date" value={form.productionDate} onChange={event => setForm(current => ({ ...current, productionDate: event.target.value }))} />
            </div>
            <ShelfLifeField
              value={form.shelfLife}
              unit={form.shelfLifeUnit}
              onValueChange={shelfLife => setForm(current => ({ ...current, shelfLife }))}
              onUnitChange={shelfLifeUnit => setForm(current => ({ ...current, shelfLifeUnit }))}
            />
          </div>
          {quantity < order.consumed && (
            <p className="text-xs text-[#C56C5C]">总数量小于当前已领用数量，保存后已领用数量会同步调整为 {quantity}{form.unit}。</p>
          )}
          <p className="text-xs text-muted-foreground">这里仅修改采购记录；新建采购时同步生成的历史支出不会自动改动。</p>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>取消</Button>
            <Button disabled={!valid} onClick={handleSave}>保存修改</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddOrderDialog({ orders, onClose, onAdd, addExpense }: { orders: Order[]; onClose: () => void; onAdd: (order: Omit<Order, 'id'>) => void; addExpense: (expense: Omit<Expense, 'id'>) => void }) {
  const [mode, setMode] = useState<'single' | 'mixed' | 'bundle'>('single');
  const [form, setForm] = useState({
    brand: '', itemName: '', itemGroup: '', category: '猫粮', quantity: '', unit: '', totalPrice: '', supplier: '',
    bundleName: '', bundleQuantity: '1', bundleUnit: '盒',
    productionDate: '', shelfLife: '', shelfLifeUnit: 'day' as ShelfLifeUnit,
    packageCount: '', packageCountUnit: '', packageSize: '', packageUnit: '',
    imageUrls: [] as string[], productBenefits: '', suitableLifeStages: '', feedingGuidance: '', syncExpense: true,
    purchaseDate: localDateKey(),
  });
  const [bundleItems, setBundleItems] = useState([
    { id: 'bundle_1', brand: '', itemGroup: '', itemName: '', category: '主食罐头', quantity: '', unit: '罐', allocatedPrice: '', productionDate: '', shelfLife: '', shelfLifeUnit: 'day' as ShelfLifeUnit, packageCount: '', packageCountUnit: '', packageSize: '', packageUnit: '' },
    { id: 'bundle_2', brand: '', itemGroup: '', itemName: '', category: '主食餐包', quantity: '', unit: '包', allocatedPrice: '', productionDate: '', shelfLife: '', shelfLifeUnit: 'day' as ShelfLifeUnit, packageCount: '', packageCountUnit: '', packageSize: '', packageUnit: '' },
  ]);
  const [mixedFlavors, setMixedFlavors] = useState([
    { id: 'flavor_1', name: '', quantity: '' },
    { id: 'flavor_2', name: '', quantity: '' },
  ]);
  const applyHistoryTemplate = (template: Order) => {
    const shelfLife = shelfLifeForEditing(template.shelfLife, template.shelfLifeUnit);
    setForm(current => ({
      ...current,
      brand: template.brand || '',
      itemName: template.itemName,
      itemGroup: template.itemGroup || '',
      category: template.category,
      quantity: String(template.quantity),
      unit: template.unit,
      totalPrice: String(orderTotalPrice(template)),
      supplier: template.supplier,
      productionDate: '',
      shelfLife: shelfLife.value,
      shelfLifeUnit: shelfLife.unit,
      packageCount: template.packageCount ? String(template.packageCount) : '',
      packageCountUnit: template.packageCountUnit || '',
      packageSize: template.packageSize ? String(template.packageSize) : '',
      packageUnit: template.packageUnit || '',
      imageUrls: template.imageUrls?.length ? template.imageUrls : template.imageUrl ? [template.imageUrl] : [],
      productBenefits: template.productBenefits || '',
      suitableLifeStages: template.suitableLifeStages || '',
      feedingGuidance: template.feedingGuidance || '',
    }));
  };

  const quantity = Number(form.quantity);
  const totalPrice = Number(form.totalPrice);
  const unitPrice = quantity > 0 && totalPrice >= 0 ? totalPrice / quantity : 0;
  const priceHistory = getPriceHistory(form.itemName, form.unit, unitPrice, orders);
  const bundleAllocated = bundleItems.reduce((sum, item) => sum + (Number(item.allocatedPrice) || 0), 0);
  const bundleRemaining = Number.isFinite(totalPrice) ? totalPrice - bundleAllocated : 0;
  const bundleQuantity = Number(form.bundleQuantity);
  const bundleItemsValid = bundleItems.length > 0 && bundleItems.every(item => {
    const itemQuantity = Number(item.quantity);
    const allocatedPrice = item.allocatedPrice === '' ? 0 : Number(item.allocatedPrice);
    return Boolean(
      item.itemName.trim()
      && item.unit.trim()
      && Number.isFinite(itemQuantity)
      && itemQuantity > 0
      && Number.isFinite(allocatedPrice)
      && allocatedPrice >= 0
      && packageFieldsValid(item.packageCount, item.packageCountUnit, item.packageSize, item.packageUnit)
    );
  });
  const bundleValid = Boolean(
    form.purchaseDate
    && form.totalPrice !== ''
    && Number.isFinite(totalPrice)
    && totalPrice >= 0
    && (!form.bundleName.trim() || (Number.isFinite(bundleQuantity) && bundleQuantity > 0 && Boolean(form.bundleUnit.trim())))
    && bundleItemsValid
    && bundleRemaining >= -0.005
  );
  const mixedValid = Boolean(
    form.bundleName.trim()
    && form.purchaseDate
    && form.totalPrice !== ''
    && Number.isFinite(totalPrice)
    && totalPrice >= 0
    && Number.isFinite(bundleQuantity)
    && bundleQuantity > 0
    && form.bundleUnit.trim()
    && form.unit.trim()
    && packageFieldsValid('', '', form.packageSize, form.packageUnit)
    && mixedFlavors.length > 0
    && mixedFlavors.every(flavor => flavor.name.trim() && Number.isFinite(Number(flavor.quantity)) && Number(flavor.quantity) > 0)
  );

  const handleSubmit = () => {
    if (mode === 'mixed') {
      if (!mixedValid) return;
      const purchaseBatchId = `bundle-${Date.now()}`;
      const bundleName = form.bundleName.trim();
      mixedFlavors.forEach((flavor, index) => onAdd({
        catId: 'shared',
        brand: form.brand.trim() || undefined,
        itemName: flavor.name.trim(),
        itemGroup: bundleName,
        purchaseBatchId,
        purchaseBundleName: bundleName,
        purchaseBundleQuantity: bundleQuantity,
        purchaseBundleUnit: form.bundleUnit.trim(),
        purchaseBundleTotalPrice: totalPrice,
        category: form.category,
        quantity: Number(flavor.quantity),
        unit: form.unit.trim(),
        unitPrice: 0,
        totalPrice: 0,
        purchaseDate: form.purchaseDate,
        status: 'pending',
        consumed: 0,
        supplier: form.supplier.trim(),
        productionDate: form.productionDate || undefined,
        shelfLife: shelfLifeInDays(form.shelfLife, form.shelfLifeUnit),
        shelfLifeUnit: form.shelfLife ? form.shelfLifeUnit : undefined,
        packageSize: form.packageSize ? Number(form.packageSize) : undefined,
        packageUnit: form.packageSize ? form.packageUnit.trim() || undefined : undefined,
        imageUrls: index === 0 && form.imageUrls.length ? form.imageUrls : undefined,
        imageUrl: index === 0 ? form.imageUrls[0] || undefined : undefined,
        productBenefits: form.productBenefits.trim() || undefined,
        suitableLifeStages: form.suitableLifeStages.trim() || undefined,
        feedingGuidance: form.feedingGuidance.trim() || undefined,
      }));
      if (form.syncExpense && totalPrice > 0) {
        addExpense({
          catId: 'shared',
          date: form.purchaseDate,
          category: form.category,
          amount: totalPrice,
          description: `多口味整盒·${bundleName}：${mixedFlavors.map(flavor => flavor.name.trim()).join('、')}`,
          relatedModule: 'procurement',
        });
      }
      onClose();
      return;
    }
    if (mode === 'bundle') {
      if (!bundleValid) return;
      const purchaseBatchId = `bundle-${Date.now()}`;
      const bundleName = form.bundleName.trim();
      bundleItems.forEach(item => {
        const itemQuantity = Number(item.quantity);
        const allocatedPrice = item.allocatedPrice === '' ? 0 : Number(item.allocatedPrice);
        onAdd({
          catId: 'shared',
          brand: item.brand.trim() || undefined,
          itemName: item.itemName.trim(),
          itemGroup: item.itemGroup.trim() || bundleName || undefined,
          purchaseBatchId,
          purchaseBundleName: bundleName || '组合采购',
          purchaseBundleQuantity: bundleQuantity,
          purchaseBundleUnit: form.bundleUnit.trim() || '单',
          purchaseBundleTotalPrice: totalPrice,
          category: item.category,
          quantity: itemQuantity,
          unit: item.unit.trim(),
          unitPrice: allocatedPrice / itemQuantity,
          totalPrice: allocatedPrice,
          purchaseDate: form.purchaseDate,
          status: 'pending',
          consumed: 0,
          supplier: form.supplier.trim(),
          productionDate: item.productionDate || undefined,
          shelfLife: shelfLifeInDays(item.shelfLife, item.shelfLifeUnit),
          shelfLifeUnit: item.shelfLife ? item.shelfLifeUnit : undefined,
          packageCount: item.packageCount ? Number(item.packageCount) : undefined,
          packageCountUnit: item.packageCount ? item.packageCountUnit.trim() || undefined : undefined,
          packageSize: item.packageSize ? Number(item.packageSize) : undefined,
          packageUnit: item.packageSize ? item.packageUnit.trim() || undefined : undefined,
        });
      });
      if (form.syncExpense && totalPrice > 0) {
        const hasExactAllocation = Math.abs(bundleRemaining) < 0.005 && bundleItems.every(item => Number(item.allocatedPrice) > 0);
        if (hasExactAllocation) {
          bundleItems.forEach(item => addExpense({
            catId: 'shared',
            date: form.purchaseDate,
            category: item.category,
            amount: Number(item.allocatedPrice),
            description: `组合采购·${item.itemName.trim()}`,
            relatedModule: 'procurement',
          }));
        } else {
          addExpense({
            catId: 'shared',
            date: form.purchaseDate,
            category: '其他',
            amount: totalPrice,
            description: bundleName
              ? `组合采购·${bundleName}：${bundleItems.map(item => item.itemName.trim()).join('、')}`
              : `组合采购：${bundleItems.map(item => item.itemName.trim()).join('、')}`,
            relatedModule: 'procurement',
          });
        }
      }
      onClose();
      return;
    }
    const packageValid = packageFieldsValid(form.packageCount, form.packageCountUnit, form.packageSize, form.packageUnit);
    if (!form.itemName.trim() || !form.totalPrice || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(totalPrice) || totalPrice < 0 || !packageValid) return;
    onAdd({
      catId: 'shared',
      brand: form.brand.trim() || undefined,
      itemName: form.itemName.trim(),
      itemGroup: form.itemGroup.trim() || undefined,
      category: form.category,
      quantity,
      unit: form.unit.trim() || '件',
      unitPrice,
      totalPrice,
      purchaseDate: form.purchaseDate,
      status: 'pending',
      consumed: 0,
      supplier: form.supplier,
      productionDate: form.productionDate || undefined,
      shelfLife: shelfLifeInDays(form.shelfLife, form.shelfLifeUnit),
      shelfLifeUnit: form.shelfLife ? form.shelfLifeUnit : undefined,
      packageCount: form.packageCount ? Number(form.packageCount) : undefined,
      packageCountUnit: form.packageCount ? form.packageCountUnit.trim() || undefined : undefined,
      packageSize: form.packageSize ? Number(form.packageSize) : undefined,
      packageUnit: form.packageSize ? form.packageUnit.trim() || undefined : undefined,
      imageUrls: form.imageUrls.length ? form.imageUrls : undefined,
      imageUrl: form.imageUrls[0] || undefined,
      productBenefits: form.productBenefits.trim() || undefined,
      suitableLifeStages: form.suitableLifeStages.trim() || undefined,
      feedingGuidance: form.feedingGuidance.trim() || undefined,
    });
    if (form.syncExpense && totalPrice > 0) {
      addExpense({
        catId: 'shared',
        date: form.purchaseDate || localDateKey(),
        category: form.category,
        amount: totalPrice,
        description: `采购${form.itemName}`,
        relatedModule: 'procurement',
      });
    }
    onClose();
  };

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[760px]">
      <DialogHeader>
        <DialogTitle>新建采购订单</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 pt-2">
        <div className="grid grid-cols-3 rounded-lg bg-muted/55 p-1" role="tablist" aria-label="采购录入方式">
          <button type="button" role="tab" aria-selected={mode === 'single'} onClick={() => setMode('single')} className={cn('h-8 rounded-md text-sm transition-colors', mode === 'single' ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground')}>单品采购</button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'mixed'}
            onClick={() => {
              setMode('mixed');
              setForm(current => ({
                ...current,
                category: current.category === '猫粮' ? '主食餐盒' : current.category,
              }));
            }}
            className={cn('h-8 rounded-md px-1 text-sm transition-colors', mode === 'mixed' ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground')}
          >多口味整盒</button>
          <button type="button" role="tab" aria-selected={mode === 'bundle'} onClick={() => setMode('bundle')} className={cn('h-8 rounded-md text-sm transition-colors', mode === 'bundle' ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground')}>组合采购</button>
        </div>
        {mode === 'bundle' ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>采购日期</Label>
                <Input type="date" value={form.purchaseDate} onChange={event => setForm(current => ({ ...current, purchaseDate: event.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>商家/直播间</Label>
                <HistoryTextAutocomplete value={form.supplier} values={recentOrderValues(orders, item => item.supplier)} onChange={supplier => setForm(current => ({ ...current, supplier }))} placeholder="如：抖音某某直播间" />
              </div>
              <div className="space-y-1.5">
                <Label>整单实付(¥)</Label>
                <Input type="number" min="0" step="0.01" value={form.totalPrice} onChange={event => setForm(current => ({ ...current, totalPrice: event.target.value }))} placeholder="如：199.90" />
              </div>
            </div>
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_100px_110px]">
                <div className="space-y-1.5">
                  <Label>混合装 / 整盒名称（可选）</Label>
                  <HistoryTextAutocomplete
                    value={form.bundleName}
                    values={[
                      ...recentOrderValues(orders, item => item.purchaseBundleName),
                      ...recentOrderValues(orders, item => item.itemGroup),
                    ]}
                    onChange={bundleName => setForm(current => ({ ...current, bundleName }))}
                    placeholder="如：主食餐盒混合装"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>整装数量</Label>
                  <Input type="number" min="0" step="any" value={form.bundleQuantity} onChange={event => setForm(current => ({ ...current, bundleQuantity: event.target.value }))} placeholder="1" />
                </div>
                <div className="space-y-1.5">
                  <Label>外包装单位</Label>
                  <HistoryTextAutocomplete value={form.bundleUnit} values={recentOrderValues(orders, item => item.purchaseBundleUnit)} onChange={bundleUnit => setForm(current => ({ ...current, bundleUnit }))} placeholder="盒/箱/套" />
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">整盒价格填上方“整单实付”；下面每个口味分别填写实际数量，分摊金额可以全部留空。</p>
            </div>
            <div className="space-y-2">
              {bundleItems.map((item, index) => (
                <div key={item.id} className="rounded-lg border border-border/70 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">库存明细 {index + 1}</span>
                    {bundleItems.length > 1 && (
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => setBundleItems(current => current.filter(entry => entry.id !== item.id))} className="text-destructive" title="删除明细">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <HistoryTextAutocomplete value={item.brand} values={recentOrderValues(orders, order => order.brand)} onChange={brand => setBundleItems(current => current.map(entry => entry.id === item.id ? { ...entry, brand } : entry))} placeholder="品牌，如：麦德氏" />
                    <HistoryItemAutocomplete
                      value={item.itemName}
                      orders={orders}
                      onChange={itemName => setBundleItems(current => current.map(entry => entry.id === item.id ? { ...entry, itemName } : entry))}
                      onSelect={template => {
                        const shelfLife = shelfLifeForEditing(template.shelfLife, template.shelfLifeUnit);
                        setBundleItems(current => current.map(entry => entry.id === item.id ? {
                          ...entry,
                          brand: template.brand || '',
                          itemName: template.itemName,
                          itemGroup: template.itemGroup || '',
                          category: template.category,
                          quantity: String(template.quantity),
                          unit: template.unit,
                          shelfLife: shelfLife.value,
                          shelfLifeUnit: shelfLife.unit,
                          packageCount: template.packageCount ? String(template.packageCount) : '',
                          packageCountUnit: template.packageCountUnit || '',
                          packageSize: template.packageSize ? String(template.packageSize) : '',
                          packageUnit: template.packageUnit || '',
                        } : entry));
                      }}
                      placeholder="物品名称，输入可联想"
                    />
                    <HistoryTextAutocomplete value={item.itemGroup} values={recentOrderValues(orders, order => order.itemGroup)} onChange={itemGroup => setBundleItems(current => current.map(entry => entry.id === item.id ? { ...entry, itemGroup } : entry))} placeholder="系列/大标题，如：原切冻干" />
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[130px_80px_80px_minmax(0,1fr)]">
                    <Select value={item.category} onValueChange={category => setBundleItems(current => current.map(entry => entry.id === item.id ? { ...entry, category } : entry))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><InventoryCategoryOptions /></SelectContent>
                    </Select>
                    <Input type="number" min="0" step="any" value={item.quantity} onChange={event => setBundleItems(current => current.map(entry => entry.id === item.id ? { ...entry, quantity: event.target.value } : entry))} placeholder="数量" />
                    <HistoryTextAutocomplete value={item.unit} values={recentOrderValues(orders, order => order.unit)} onChange={unit => setBundleItems(current => current.map(entry => entry.id === item.id ? { ...entry, unit } : entry))} placeholder="单位" />
                    <Input type="number" min="0" step="0.01" value={item.allocatedPrice} onChange={event => setBundleItems(current => current.map(entry => entry.id === item.id ? { ...entry, allocatedPrice: event.target.value } : entry))} placeholder="分摊金额(选填)" />
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">生产日期（选填）</Label>
                      <Input type="date" value={item.productionDate} onChange={event => setBundleItems(current => current.map(entry => entry.id === item.id ? { ...entry, productionDate: event.target.value } : entry))} aria-label={`明细 ${index + 1} 生产日期`} />
                    </div>
                    <ShelfLifeField
                      label="保质期（选填）"
                      compact
                      value={item.shelfLife}
                      unit={item.shelfLifeUnit}
                      onValueChange={shelfLife => setBundleItems(current => current.map(entry => entry.id === item.id ? { ...entry, shelfLife } : entry))}
                      onUnitChange={shelfLifeUnit => setBundleItems(current => current.map(entry => entry.id === item.id ? { ...entry, shelfLifeUnit } : entry))}
                    />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="space-y-1"><Label className="text-xs text-muted-foreground">每{item.unit || '单位'}含</Label><Input type="number" min="0" step="any" value={item.packageCount} onChange={event => setBundleItems(current => current.map(entry => entry.id === item.id ? { ...entry, packageCount: event.target.value } : entry))} placeholder="如：6" /></div>
                    <div className="space-y-1"><Label className="text-xs text-muted-foreground">中间单位</Label><HistoryTextAutocomplete value={item.packageCountUnit} values={recentOrderValues(orders, order => order.packageCountUnit)} onChange={packageCountUnit => setBundleItems(current => current.map(entry => entry.id === item.id ? { ...entry, packageCountUnit } : entry))} placeholder="包/袋/板" /></div>
                    <div className="space-y-1"><Label className="text-xs text-muted-foreground">每{item.packageCountUnit || item.unit || '单位'}含</Label><Input type="number" min="0" step="any" value={item.packageSize} onChange={event => setBundleItems(current => current.map(entry => entry.id === item.id ? { ...entry, packageSize: event.target.value } : entry))} placeholder="如：60" /></div>
                    <div className="space-y-1"><Label className="text-xs text-muted-foreground">最小单位</Label><HistoryTextAutocomplete value={item.packageUnit} values={recentOrderValues(orders, order => order.packageUnit)} onChange={packageUnit => setBundleItems(current => current.map(entry => entry.id === item.id ? { ...entry, packageUnit } : entry))} placeholder="片/粒/g" /></div>
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setBundleItems(current => [...current, { id: `bundle_${Date.now()}`, brand: '', itemGroup: '', itemName: '', category: '零食冻干', quantity: '', unit: '袋', allocatedPrice: '', productionDate: '', shelfLife: '', shelfLifeUnit: 'day', packageCount: '', packageCountUnit: '', packageSize: '', packageUnit: '' }])} className="w-full">
                <Plus className="h-3.5 w-3.5" />添加库存明细
              </Button>
            </div>
            <div className="rounded-lg bg-primary/8 px-3 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">已分摊 ¥{bundleAllocated.toFixed(2)}</span>
                <span className={cn('font-medium', bundleRemaining < -0.005 ? 'text-destructive' : 'text-foreground')}>未分摊 ¥{bundleRemaining.toFixed(2)}</span>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">不知道单品价格可以不填分摊金额，库存仍会正常入库；系统只记录一笔整单支出，不会虚构单价。</p>
            </div>
          </>
        ) : mode === 'mixed' ? (
          <>
            <ProductImageField
              imageUrls={form.imageUrls}
              onChange={imageUrls => setForm(current => ({ ...current, imageUrls }))}
              onAnalysis={analysis => setForm(current => {
                const analyzed = applyProductAnalysis(current, analysis);
                return {
                  ...analyzed,
                  bundleName: current.bundleName || analysis.itemGroup || analysis.itemName || '',
                  itemName: current.itemName,
                  quantity: current.quantity,
                  unit: current.unit,
                };
              })}
            />

            <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
              <div>
                <Label>整盒共享信息</Label>
                <p className="mt-1 text-xs text-muted-foreground">以下内容只填一次，会应用到下面所有口味；整盒价格不会平均成各口味单价。</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>品牌（可选）</Label>
                  <HistoryTextAutocomplete value={form.brand} values={recentOrderValues(orders, item => item.brand)} onChange={brand => setForm(current => ({ ...current, brand }))} placeholder="如：帕特" />
                </div>
                <div className="space-y-1.5">
                  <Label>整盒 / 系列名称</Label>
                  <HistoryTextAutocomplete
                    value={form.bundleName}
                    values={[
                      ...recentOrderValues(orders, item => item.purchaseBundleName),
                      ...recentOrderValues(orders, item => item.itemGroup),
                    ]}
                    onChange={bundleName => setForm(current => ({ ...current, bundleName }))}
                    placeholder="如：幼猫主食餐盒混合装"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>分类</Label>
                  <Select value={form.category} onValueChange={category => setForm(current => ({ ...current, category }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><InventoryCategoryOptions /></SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>商家 / 直播间（可选）</Label>
                  <HistoryTextAutocomplete value={form.supplier} values={recentOrderValues(orders, item => item.supplier)} onChange={supplier => setForm(current => ({ ...current, supplier }))} placeholder="如：抖音直播间" />
                </div>
                <div className="space-y-1.5">
                  <Label>采购日期</Label>
                  <Input type="date" value={form.purchaseDate} onChange={event => setForm(current => ({ ...current, purchaseDate: event.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>购买整盒数量</Label>
                  <Input type="number" min="0" step="any" value={form.bundleQuantity} onChange={event => setForm(current => ({ ...current, bundleQuantity: event.target.value }))} placeholder="如：1" />
                </div>
                <div className="space-y-1.5">
                  <Label>外包装单位</Label>
                  <HistoryTextAutocomplete value={form.bundleUnit} values={recentOrderValues(orders, item => item.purchaseBundleUnit)} onChange={bundleUnit => setForm(current => ({ ...current, bundleUnit }))} placeholder="盒/箱/套" />
                </div>
                <div className="space-y-1.5">
                  <Label>整盒实付(¥)</Label>
                  <Input type="number" min="0" step="0.01" value={form.totalPrice} onChange={event => setForm(current => ({ ...current, totalPrice: event.target.value }))} placeholder="如：199.90" />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>单个库存单位</Label>
                  <HistoryTextAutocomplete value={form.unit} values={recentOrderValues(orders, item => item.unit)} onChange={unit => setForm(current => ({ ...current, unit }))} placeholder="餐盒/罐/包" />
                </div>
                <div className="space-y-1.5">
                  <Label>每个容量（可选）</Label>
                  <Input type="number" min="0" step="any" value={form.packageSize} onChange={event => setForm(current => ({ ...current, packageSize: event.target.value }))} placeholder="如：80" />
                </div>
                <div className="space-y-1.5">
                  <Label>容量单位</Label>
                  <HistoryTextAutocomplete value={form.packageUnit} values={recentOrderValues(orders, item => item.packageUnit)} onChange={packageUnit => setForm(current => ({ ...current, packageUnit }))} placeholder="g/ml/片" />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>生产日期（可选）</Label>
                  <Input type="date" value={form.productionDate} onChange={event => setForm(current => ({ ...current, productionDate: event.target.value }))} />
                </div>
                <ShelfLifeField
                  label="保质期（可选）"
                  value={form.shelfLife}
                  unit={form.shelfLifeUnit}
                  onValueChange={shelfLife => setForm(current => ({ ...current, shelfLife }))}
                  onUnitChange={shelfLifeUnit => setForm(current => ({ ...current, shelfLifeUnit }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <Label>口味库存</Label>
                  <p className="mt-1 text-xs text-muted-foreground">这里只填写不同口味和实际个数。</p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  合计 {mixedFlavors.reduce((sum, flavor) => sum + (Number(flavor.quantity) || 0), 0)}{form.unit.trim() || '个'}
                </span>
              </div>
              {mixedFlavors.map((flavor, index) => (
                <div key={flavor.id} className="grid grid-cols-[minmax(0,1fr)_92px_36px] items-end gap-2 rounded-lg border border-border/70 p-2.5">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">口味 {index + 1}</Label>
                    <HistoryTextAutocomplete
                      value={flavor.name}
                      values={recentOrderValues(orders, item => item.itemName)}
                      onChange={name => setMixedFlavors(current => current.map(entry => entry.id === flavor.id ? { ...entry, name } : entry))}
                      placeholder="如：鸡肉味"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">数量</Label>
                    <Input type="number" min="0" step="any" value={flavor.quantity} onChange={event => setMixedFlavors(current => current.map(entry => entry.id === flavor.id ? { ...entry, quantity: event.target.value } : entry))} placeholder="0" />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setMixedFlavors(current => current.filter(entry => entry.id !== flavor.id))}
                    disabled={mixedFlavors.length === 1}
                    className="text-destructive"
                    title="删除口味"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMixedFlavors(current => [...current, { id: `flavor_${Date.now()}_${current.length}`, name: '', quantity: '' }])}
                className="w-full"
              >
                <Plus className="h-3.5 w-3.5" />添加口味
              </Button>
            </div>

            <ProductInfoFields
              benefits={form.productBenefits}
              suitableLifeStages={form.suitableLifeStages}
              feedingGuidance={form.feedingGuidance}
              benefitsHistory={recentOrderValues(orders, item => item.productBenefits)}
              lifeStageHistory={recentOrderValues(orders, item => item.suitableLifeStages)}
              feedingGuidanceHistory={recentOrderValues(orders, item => item.feedingGuidance)}
              onChange={(field, value) => setForm(current => ({ ...current, [field]: value }))}
            />
          </>
        ) : (
          <>
        <ProductImageField
          imageUrls={form.imageUrls}
          onChange={imageUrls => setForm(current => ({ ...current, imageUrls }))}
          onAnalysis={analysis => setForm(current => applyProductAnalysis(current, analysis))}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>品牌（可选）</Label>
            <HistoryTextAutocomplete value={form.brand} values={recentOrderValues(orders, item => item.brand)} onChange={brand => setForm(current => ({ ...current, brand }))} placeholder="如：麦德氏" />
          </div>
          <div className="space-y-1.5">
            <Label>物资名称</Label>
            <HistoryItemAutocomplete
              value={form.itemName}
              orders={orders}
              onChange={itemName => setForm(current => ({ ...current, itemName }))}
              onSelect={applyHistoryTemplate}
              placeholder="输入品牌或名称联想历史物资"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>物资系列 / 大标题（可选）</Label>
          <HistoryTextAutocomplete value={form.itemGroup} values={recentOrderValues(orders, item => item.itemGroup)} onChange={itemGroup => setForm(current => ({ ...current, itemGroup }))} placeholder="输入可联想历史系列，如：原切冻干" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>分类</Label>
            <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><InventoryCategoryOptions /></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>购买渠道 / 商家（可选）</Label>
            <HistoryTextAutocomplete value={form.supplier} values={recentOrderValues(orders, item => item.supplier)} onChange={supplier => setForm(current => ({ ...current, supplier }))} placeholder="如：抖音直播间、宠物店" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>采购时间</Label>
          <Input type="date" value={form.purchaseDate} onChange={e => setForm(p => ({ ...p, purchaseDate: e.target.value }))} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>数量</Label>
            <Input type="number" value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <Label>单位</Label>
            <HistoryTextAutocomplete value={form.unit} values={recentOrderValues(orders, item => item.unit)} onChange={unit => setForm(current => ({ ...current, unit }))} placeholder="kg/包/袋" />
          </div>
          <div className="space-y-1.5">
            <Label>本次总价(¥)</Label>
            <Input type="number" min="0" step="0.01" value={form.totalPrice} onChange={e => setForm(p => ({ ...p, totalPrice: e.target.value }))} placeholder="实付金额" />
          </div>
        </div>
        <div className="rounded-lg border border-border/70 p-3">
          <Label>包装换算（可选）</Label>
          <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
            <span className="text-sm text-muted-foreground">每{form.unit.trim() || '单位'}含</span>
            <Input type="number" min="0" step="any" value={form.packageCount} onChange={event => setForm(current => ({ ...current, packageCount: event.target.value }))} placeholder="如：6" />
            <HistoryTextAutocomplete value={form.packageCountUnit} values={recentOrderValues(orders, item => item.packageCountUnit)} onChange={packageCountUnit => setForm(current => ({ ...current, packageCountUnit }))} placeholder="包/袋/板" />
          </div>
          <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
            <span className="text-sm text-muted-foreground">每{form.packageCountUnit.trim() || form.unit.trim() || '单位'}含</span>
            <Input type="number" min="0" step="any" value={form.packageSize} onChange={event => setForm(current => ({ ...current, packageSize: event.target.value }))} placeholder="如：20" />
            <HistoryTextAutocomplete value={form.packageUnit} values={recentOrderValues(orders, item => item.packageUnit)} onChange={packageUnit => setForm(current => ({ ...current, packageUnit }))} placeholder="片/粒/g" />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">整盒食品示例：数量1、单位盒；每盒6包；每包60g。药品可留空第一行，只填每盒20片。</p>
        </div>
        {unitPrice > 0 && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs">
            <div className="font-medium text-foreground">自动换算：¥{unitPrice.toFixed(2)}/{form.unit.trim() || '单位'}</div>
            {priceHistory ? (
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
                <span>上次 ¥{priceHistory.lastUnitPrice.toFixed(2)}/{form.unit}</span>
                <span>历史最低 ¥{priceHistory.lowestUnitPrice.toFixed(2)}/{form.unit}</span>
                <PriceChangeLabel history={priceHistory} />
              </div>
            ) : (
              <div className="mt-1 text-muted-foreground">暂无同名同单位的历史价格</div>
            )}
          </div>
        )}
        {!['猫砂与清洁', '喂养用品', '洗护用品', '玩具', '居家用品', '外出用品', '其他用品'].includes(form.category) && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>生产日期</Label>
              <Input type="date" value={form.productionDate} onChange={e => setForm(p => ({ ...p, productionDate: e.target.value }))} />
            </div>
            <ShelfLifeField
              value={form.shelfLife}
              unit={form.shelfLifeUnit}
              onValueChange={shelfLife => setForm(current => ({ ...current, shelfLife }))}
              onUnitChange={shelfLifeUnit => setForm(current => ({ ...current, shelfLifeUnit }))}
            />
        </div>
        )}
        <ProductInfoFields
          benefits={form.productBenefits}
          suitableLifeStages={form.suitableLifeStages}
          feedingGuidance={form.feedingGuidance}
          benefitsHistory={recentOrderValues(orders, item => item.productBenefits)}
          lifeStageHistory={recentOrderValues(orders, item => item.suitableLifeStages)}
          feedingGuidanceHistory={recentOrderValues(orders, item => item.feedingGuidance)}
          onChange={(field, value) => setForm(current => ({ ...current, [field]: value }))}
        />
        <div className="rounded-lg bg-primary/5 px-3 py-2.5">
          <p className="text-xs text-muted-foreground">💡 日均消耗量将根据喂食记录自动学习计算，无需手动填写。喂食记录越多，估算越准确。</p>
        </div>
          </>
        )}
        <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2.5">
          <Checkbox id="sync-expense" checked={form.syncExpense} onCheckedChange={v => setForm(p => ({ ...p, syncExpense: !!v }))} />
          <label htmlFor="sync-expense" className="text-sm text-muted-foreground cursor-pointer select-none">
            同步记录{mode === 'mixed' ? '整盒' : mode === 'bundle' ? '整单' : '购物'}支出到<span className="text-foreground font-medium">支出记账</span>（¥{(Number.isFinite(totalPrice) ? totalPrice : 0).toFixed(2)}）
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button
            disabled={(mode === 'bundle' && !bundleValid) || (mode === 'mixed' && !mixedValid)}
            onClick={handleSubmit}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {mode === 'bundle' ? `添加 ${bundleItems.length} 项库存` : mode === 'mixed' ? `添加 ${mixedFlavors.length} 个口味库存` : '确认添加'}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}
