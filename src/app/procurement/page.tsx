'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useAppContext } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import type { Expense } from '@/lib/store';
import { calcDailyUsage, getPriceHistory, orderTotalPrice } from '@/lib/store';
import { Plus, Search, ShoppingCart, Package, PackageCheck, Truck, CheckCircle2, XCircle, Filter, Clock, AlertTriangle, Calendar, TrendingDown, ArrowDown, ArrowUp, ArrowUpDown, Pencil, Trash2, Archive } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Order, FeedingRecord } from '@/lib/store';
import { InventoryCategoryOptions } from '@/components/inventory-category-options';
import { RepurchaseDialog } from '@/components/repurchase-dialog';

const statusMap: Record<Order['status'], { label: string; icon: React.ElementType; color: string }> = {
  pending: { label: '待发货', icon: Clock, color: 'text-accent bg-accent/10' },
  shipped: { label: '运输中', icon: Truck, color: 'text-[#87CEEB] bg-[#87CEEB]/10' },
  delivered: { label: '已到货', icon: CheckCircle2, color: 'text-primary bg-primary/10' },
  durable: { label: '耐用品·无消耗', icon: Archive, color: 'text-[#52796F] bg-[#52796F]/10' },
  finished: { label: '已用完·不回购', icon: PackageCheck, color: 'text-muted-foreground bg-muted' },
  cancelled: { label: '已取消', icon: XCircle, color: 'text-muted-foreground bg-muted' },
};

type SortField = 'name' | 'category' | 'purchaseDate' | 'status';
type SortDirection = 'asc' | 'desc';

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
  durable: 3,
  finished: 4,
  cancelled: 5,
};
const chineseCollator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });

function SortableHeader({ field, label, activeField, direction, onSort }: {
  field: SortField;
  label: string;
  activeField: SortField;
  direction: SortDirection;
  onSort: (field: SortField) => void;
}) {
  const active = field === activeField;
  const Icon = active ? (direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th
      className="px-4 py-3 text-left font-medium text-muted-foreground"
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
  const today = new Date().toISOString().split('T')[0];
  const daysLeft = Math.round((expiry.getTime() - new Date(`${today}T00:00:00Z`).getTime()) / (24 * 60 * 60 * 1000));
  return { daysLeft, expiryDate: expiry.toISOString().split('T')[0] };
}

function expiryDaysLabel(daysLeft: number, compact = false) {
  if (daysLeft < 0) return `已过期${compact ? '' : ' '}${Math.abs(daysLeft)}天`;
  if (daysLeft === 0) return compact ? '今天' : '今天到期';
  return compact ? `${daysLeft}天` : `还剩 ${daysLeft} 天`;
}

function getDepletionInfo(order: Order, feedingRecords: FeedingRecord[]): { daysLeft: number; depletionDate: string; dailyUsage: number } | null {
  if (order.status !== 'delivered') return null;
  const remaining = order.quantity - order.consumed;
  if (remaining <= 0) {
    return { daysLeft: 0, depletionDate: new Date().toISOString().split('T')[0], dailyUsage: 0 };
  }
  const dailyUsage = order.dailyUsage && order.dailyUsage > 0
    ? order.dailyUsage
    : calcDailyUsage(order.itemName, feedingRecords);
  if (dailyUsage <= 0) return null;
  const daysLeft = Math.floor(remaining / dailyUsage);
  const depletion = new Date();
  depletion.setDate(depletion.getDate() + daysLeft);
  return { daysLeft, depletionDate: depletion.toISOString().split('T')[0], dailyUsage };
}

export default function ProcurementPage() {
  const { state, addOrder, updateOrder, updateOrderStatus, updateOrderCategory, adjustOrderStock, deleteOrder, addExpense } = useAppContext();
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

  useEffect(() => {
    const requestedFilter = new URLSearchParams(window.location.search).get('filter');
    if (requestedFilter && ['low-stock', 'expiring', 'expired', 'pending', 'shipped', 'delivered', 'durable', 'finished', 'cancelled'].includes(requestedFilter)) {
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

  const changeSortField = (field: SortField) => {
    if (field === sortField) {
      setSortDirection(current => current === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortField(field);
    setSortDirection(field === 'purchaseDate' ? 'desc' : 'asc');
  };

  const filteredOrders = useMemo(() => {
    return state.orders
      .filter(o => {
        const expiry = getExpiryInfo(o);
        const depletion = getDepletionInfo(o, state.feedingRecords);
        const stockRatio = o.quantity > 0 ? (o.quantity - o.consumed) / o.quantity : 0;
        if (statusFilter === 'low-stock' && !(o.status === 'delivered' && !o.repurchasedAt && (stockRatio <= 0.3 || (depletion && depletion.daysLeft <= 7)))) return false;
        if (statusFilter === 'expiring' && !(o.status === 'delivered' && expiry && expiry.daysLeft >= 0 && expiry.daysLeft <= 7)) return false;
        if (statusFilter === 'expired' && !(o.status === 'delivered' && expiry && expiry.daysLeft < 0)) return false;
        if (!['all', 'low-stock', 'expiring', 'expired'].includes(statusFilter) && o.status !== statusFilter) return false;
        if (categoryFilter !== 'all' && o.category !== categoryFilter) return false;
        if (search && !o.itemName.includes(search) && !o.category.includes(search) && !o.supplier.includes(search)) return false;
        return true;
      })
      .sort((a, b) => {
        let comparison = 0;
        if (sortField === 'name') comparison = chineseCollator.compare(a.itemName, b.itemName);
        if (sortField === 'category') comparison = chineseCollator.compare(a.category, b.category);
        if (sortField === 'purchaseDate') comparison = a.purchaseDate.localeCompare(b.purchaseDate);
        if (sortField === 'status') comparison = statusSortOrder[a.status] - statusSortOrder[b.status];
        if (comparison !== 0) return sortDirection === 'asc' ? comparison : -comparison;
        return b.purchaseDate.localeCompare(a.purchaseDate)
          || chineseCollator.compare(a.itemName, b.itemName)
          || chineseCollator.compare(a.id, b.id);
      });
  }, [state.orders, state.feedingRecords, search, statusFilter, categoryFilter, sortField, sortDirection]);

  // Items expiring within 7 days
  const expiringItems = useMemo(() => {
    return state.orders
      .map(order => {
        const info = getExpiryInfo(order);
        if (!info) return null;
        return { order, ...info };
      })
      .filter((item): item is { order: Order; daysLeft: number; expiryDate: string } => item !== null && item.daysLeft <= 7 && item.order.status === 'delivered')
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [state.orders]);

  // Items needing repurchase within 7 days (based on consumption speed)
  const repurchaseItems = useMemo(() => {
    return state.orders
      .filter(o => o.status === 'delivered' && !o.repurchasedAt)
      .map(order => {
        const info = getDepletionInfo(order, state.feedingRecords);
        if (!info) return null;
        return { order, ...info };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null && item.daysLeft <= 7)
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [state.orders, state.feedingRecords]);

  // Food preference analysis from feeding records
  const foodPreferences = useMemo(() => {
    const foodMap = new Map<string, { fast: number; normal: number; slow: number; total: number }>();
    state.feedingRecords.forEach(r => {
      const food = r.foodName || r.mealType;
      if (!foodMap.has(food)) foodMap.set(food, { fast: 0, normal: 0, slow: 0, total: 0 });
      const stats = foodMap.get(food)!;
      stats.total++;
      if (r.eatingSpeed === 'fast') stats.fast++;
      else if (r.eatingSpeed === 'slow') stats.slow++;
      else stats.normal++;
    });
    // Link to procurement orders
    return state.orders
      .filter(o => o.status === 'delivered')
      .map(order => {
        const food = order.itemName;
        const stats = foodMap.get(food);
        if (!stats || stats.total === 0) return { order, preference: 'unknown' as const, stats: null };
        const score = (stats.fast * 2 + stats.normal) / (stats.total * 2);
        const preference = score >= 0.6 ? 'loved' as const : score <= 0.3 ? 'disliked' as const : 'normal' as const;
        return { order, preference, stats };
      })
      .filter(item => item.preference !== 'unknown');
  }, [state.orders, state.feedingRecords]);

  const summary = useMemo(() => {
    const stockValue = state.orders
      .filter(o => o.status === 'delivered' || o.status === 'durable')
      .reduce((sum, order) => sum + Math.max(0, order.quantity - order.consumed) * order.unitPrice, 0);
    const lowStock = state.orders.filter(order => {
      if (order.status !== 'delivered' || order.repurchasedAt) return false;
      const ratio = order.quantity > 0 ? (order.quantity - order.consumed) / order.quantity : 0;
      const depletion = getDepletionInfo(order, state.feedingRecords);
      return ratio <= 0.3 || Boolean(depletion && depletion.daysLeft <= 7);
    }).length;
    const pending = state.orders.filter(o => o.status === 'pending' || o.status === 'shipped').length;
    return { stockValue, lowStock, pending, count: state.orders.length };
  }, [state.orders, state.feedingRecords]);

  return (
    <div className="space-y-6 fade-in">
      <div className="flex items-center justify-between">
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
          <AddOrderDialog orders={state.orders} onClose={() => setShowAdd(false)} onAdd={addOrder} addExpense={addExpense} />
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
                  <span className="text-sm font-medium text-foreground">{order.itemName}</span>
                  <span className="text-xs text-muted-foreground">{order.quantity - order.consumed}{order.unit} 剩余</span>
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
                  <span className="text-sm font-medium text-foreground">{order.itemName}</span>
                  <span className="text-xs text-muted-foreground">剩余 {order.quantity - order.consumed}{order.unit}</span>
                  <span className="text-xs text-muted-foreground">· 日均消耗 {dailyUsage}{order.unit}</span>
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
                  <span className="font-medium text-sm text-foreground">{order.itemName}</span>
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
        <SummaryCard label="当前库存价值" value={`¥${summary.stockValue.toLocaleString()}`} />
        <SummaryCard label="物资批次" value={`${summary.count} 批`} />
        <SummaryCard label="需要补货" value={`${summary.lowStock} 项`} accent={summary.lowStock ? 'text-[#D4915E]' : 'text-primary-foreground'} />
        <SummaryCard label="进行中" value={`${summary.pending} 单`} accent="text-accent" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="搜索物资名称、分类、供应商..."
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
            <SelectItem value="pending">待发货</SelectItem>
            <SelectItem value="shipped">运输中</SelectItem>
            <SelectItem value="delivered">已到货</SelectItem>
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
      <div className="card-warm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <SortableHeader field="name" label="物资名称" activeField={sortField} direction={sortDirection} onSort={changeSortField} />
                <SortableHeader field="category" label="分类" activeField={sortField} direction={sortDirection} onSort={changeSortField} />
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">库存</th>
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
              {filteredOrders.map(order => {
                const remaining = order.quantity - order.consumed;
                const ratio = order.quantity > 0 ? Math.max(0, remaining / order.quantity) : 0;
                const st = statusMap[order.status];
                const expiry = getExpiryInfo(order);
                const orderIndex = state.orders.findIndex(item => item.id === order.id);
                const priceHistory = getPriceHistory(
                  order.itemName,
                  order.unit,
                  order.unitPrice,
                  orderIndex > 0 ? state.orders.slice(0, orderIndex) : [],
                );
                return (
                  <tr key={order.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="font-medium text-foreground">{order.itemName}</span>
                      </div>
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
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      <div className="whitespace-nowrap font-medium">¥{order.unitPrice.toFixed(2)}/{order.unit}</div>
                      <div className="whitespace-nowrap text-xs text-muted-foreground">本次共 ¥{orderTotalPrice(order).toFixed(2)}</div>
                      {priceHistory && <PriceChangeLabel history={priceHistory} />}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{order.supplier}</td>
                    <td className="px-4 py-3 text-muted-foreground">{order.purchaseDate}</td>
                    <td className="px-4 py-3 text-muted-foreground">{order.productionDate || '-'}</td>
                    <td className="px-4 py-3">
                      {order.shelfLife ? (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-muted-foreground" />
                          <span className="text-muted-foreground">{order.shelfLife}天</span>
                          {expiry && expiry.daysLeft <= 7 && (
                            <Badge className="ml-1 text-[10px] px-1 py-0 bg-[#E88888]/15 text-[#E88888] border-0">
                              {expiryDaysLabel(expiry.daysLeft, true)}
                            </Badge>
                          )}
                        </div>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const depletion = getDepletionInfo(order, state.feedingRecords);
                        if (!depletion) return <span className="text-muted-foreground text-xs">-</span>;
                        return (
                          <div className="flex items-center gap-1">
                            <TrendingDown className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{depletion.depletionDate}</span>
                            {depletion.daysLeft <= 7 && (
                              <Badge className="ml-1 text-[10px] px-1 py-0 bg-accent/15 text-accent border-0">
                                {depletion.daysLeft === 0 ? '今天' : `${depletion.daysLeft}天`}
                              </Badge>
                            )}
                          </div>
                        );
                      })()}
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
                          disabled={order.status !== 'delivered' || (remaining <= 0 && order.consumed <= 0)}
                        >
                          <SelectTrigger size="sm" className="w-[104px]" aria-label={`调整${order.itemName}的库存`}>
                            <SelectValue placeholder="库存操作" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="consume" disabled={remaining <= 0}>领用</SelectItem>
                            <SelectItem value="restore" disabled={order.consumed <= 0}>退回</SelectItem>
                          </SelectContent>
                        </Select>
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
          orders={state.orders}
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
  const remaining = Math.max(0, order.quantity - order.consumed);
  const maximum = mode === 'consume' ? remaining : order.consumed;
  const suggested = mode === 'consume' && order.dailyUsage && order.dailyUsage > 0
    ? Math.min(order.dailyUsage, maximum)
    : Math.min(1, maximum);
  const [amount, setAmount] = useState(String(suggested));
  const parsedAmount = Number(amount);
  const valid = Number.isFinite(parsedAmount) && parsedAmount > 0 && parsedAmount <= maximum;
  const verb = mode === 'consume' ? '领用' : '退回';
  const afterRemaining = mode === 'consume' ? remaining - parsedAmount : remaining + parsedAmount;

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
            <Label>本次{verb}数量（{order.unit}）</Label>
            <Input type="number" min="0" max={maximum} step="any" value={amount} onChange={event => setAmount(event.target.value)} autoFocus />
            {!valid && amount !== '' && <p className="text-xs text-destructive">数量必须大于 0，且不能超过{mode === 'consume' ? '当前库存' : '已领用数量'}。</p>}
          </div>
          <p className="text-xs text-muted-foreground">确认后剩余 {valid ? afterRemaining : remaining}{order.unit}，补货提醒会自动重算。</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>取消</Button>
            <Button disabled={!valid} onClick={() => onConfirm(parsedAmount)} className="bg-primary text-primary-foreground hover:bg-primary/90">确认{verb}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="card-warm p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={cn('text-xl font-bold', accent || 'text-foreground')}>{value}</p>
    </div>
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

function EditOrderDialog({ order, orders, onClose, onSave }: {
  order: Order;
  orders: Order[];
  onClose: () => void;
  onSave: (updates: Partial<Omit<Order, 'id'>>) => void;
}) {
  const [form, setForm] = useState({
    itemName: order.itemName,
    category: order.category,
    quantity: String(order.quantity),
    unit: order.unit,
    totalPrice: String(orderTotalPrice(order)),
    supplier: order.supplier,
    purchaseDate: order.purchaseDate,
    productionDate: order.productionDate || '',
    shelfLife: order.shelfLife ? String(order.shelfLife) : '',
    status: order.status,
  });
  const quantity = Number(form.quantity);
  const totalPrice = Number(form.totalPrice);
  const unitPrice = quantity > 0 && totalPrice >= 0 ? totalPrice / quantity : 0;
  const comparableOrders = orders.filter(item => item.id !== order.id);
  const priceHistory = getPriceHistory(form.itemName, form.unit, unitPrice, comparableOrders);
  const valid = Boolean(
    form.itemName.trim()
    && form.unit.trim()
    && form.purchaseDate
    && Number.isFinite(quantity)
    && quantity > 0
    && Number.isFinite(totalPrice)
    && totalPrice >= 0
  );

  const handleSave = () => {
    if (!valid) return;
    onSave({
      itemName: form.itemName.trim(),
      category: form.category,
      quantity,
      unit: form.unit.trim(),
      unitPrice,
      totalPrice,
      supplier: form.supplier.trim(),
      purchaseDate: form.purchaseDate,
      productionDate: form.productionDate || undefined,
      shelfLife: form.shelfLife ? Number(form.shelfLife) : undefined,
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
          <div className="space-y-1.5">
            <Label>物资名称</Label>
            <Input value={form.itemName} onChange={event => setForm(current => ({ ...current, itemName: event.target.value }))} />
          </div>
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
              <Input value={form.unit} onChange={event => setForm(current => ({ ...current, unit: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>本次总价(¥)</Label>
              <Input type="number" min="0" step="0.01" value={form.totalPrice} onChange={event => setForm(current => ({ ...current, totalPrice: event.target.value }))} />
            </div>
          </div>
          {unitPrice > 0 && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs">
              <div className="font-medium text-foreground">自动换算：¥{unitPrice.toFixed(2)}/{form.unit.trim() || '单位'}</div>
              {priceHistory && <PriceChangeLabel history={priceHistory} />}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>供应商</Label>
              <Input value={form.supplier} onChange={event => setForm(current => ({ ...current, supplier: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>采购日期</Label>
              <Input type="date" value={form.purchaseDate} onChange={event => setForm(current => ({ ...current, purchaseDate: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>生产日期</Label>
              <Input type="date" value={form.productionDate} onChange={event => setForm(current => ({ ...current, productionDate: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>保质期（天）</Label>
              <Input type="number" min="0" step="1" value={form.shelfLife} onChange={event => setForm(current => ({ ...current, shelfLife: event.target.value }))} placeholder="可不填" />
            </div>
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
  const [form, setForm] = useState({
    itemName: '', category: '猫粮', quantity: '', unit: 'kg', totalPrice: '', supplier: '',
    productionDate: '', shelfLife: '', shelfLifeUnit: 'day' as 'day' | 'month' | 'year', syncExpense: true,
    purchaseDate: new Date().toISOString().split('T')[0],
  });

  const quantity = Number(form.quantity);
  const totalPrice = Number(form.totalPrice);
  const unitPrice = quantity > 0 && totalPrice >= 0 ? totalPrice / quantity : 0;
  const priceHistory = getPriceHistory(form.itemName, form.unit, unitPrice, orders);

  const handleSubmit = () => {
    if (!form.itemName.trim() || !form.totalPrice || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(totalPrice) || totalPrice < 0) return;
    onAdd({
      itemName: form.itemName.trim(),
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
      shelfLife: form.shelfLife ? (form.shelfLifeUnit === 'year' ? Number(form.shelfLife) * 365 : form.shelfLifeUnit === 'month' ? Number(form.shelfLife) * 30 : Number(form.shelfLife)) : undefined,
    });
    if (form.syncExpense && totalPrice > 0) {
      addExpense({
        date: form.purchaseDate || new Date().toISOString().split('T')[0],
        category: form.category,
        amount: totalPrice,
        description: `采购${form.itemName}`,
        relatedModule: 'procurement',
      });
    }
    onClose();
  };

  return (
    <DialogContent className="sm:max-w-[480px]">
      <DialogHeader>
        <DialogTitle>新建采购订单</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 pt-2">
        <div className="space-y-1.5">
          <Label>物资名称</Label>
          <Input value={form.itemName} onChange={e => setForm(p => ({ ...p, itemName: e.target.value }))} placeholder="如：皇家猫粮 K36" />
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
            <Label>供应商</Label>
            <Input value={form.supplier} onChange={e => setForm(p => ({ ...p, supplier: e.target.value }))} placeholder="供应商名称" />
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
            <Input value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))} placeholder="kg/包/袋" />
          </div>
          <div className="space-y-1.5">
            <Label>本次总价(¥)</Label>
            <Input type="number" min="0" step="0.01" value={form.totalPrice} onChange={e => setForm(p => ({ ...p, totalPrice: e.target.value }))} placeholder="实付金额" />
          </div>
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
            <div className="space-y-1.5">
              <Label>保质期</Label>
              <div className="flex gap-2">
                <Input type="number" className="flex-1" value={form.shelfLife} onChange={e => setForm(p => ({ ...p, shelfLife: e.target.value }))} placeholder="如：30" />
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={form.shelfLifeUnit}
                  onChange={e => setForm(p => ({ ...p, shelfLifeUnit: e.target.value as 'day' | 'month' | 'year' }))}
                >
                  <option value="day">天</option>
                  <option value="month">月</option>
                  <option value="year">年</option>
                </select>
            </div>
          </div>
        </div>
        )}
        <div className="rounded-lg bg-primary/5 px-3 py-2.5">
          <p className="text-xs text-muted-foreground">💡 日均消耗量将根据喂食记录自动学习计算，无需手动填写。喂食记录越多，估算越准确。</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2.5">
          <Checkbox id="sync-expense" checked={form.syncExpense} onCheckedChange={v => setForm(p => ({ ...p, syncExpense: !!v }))} />
          <label htmlFor="sync-expense" className="text-sm text-muted-foreground cursor-pointer select-none">
            同步记录购物支出到<span className="text-foreground font-medium">支出记账</span>（¥{(Number.isFinite(totalPrice) ? totalPrice : 0).toFixed(2)}）
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleSubmit} className="bg-primary hover:bg-primary/90 text-primary-foreground">确认添加</Button>
        </div>
      </div>
    </DialogContent>
  );
}
