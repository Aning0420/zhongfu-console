'use client';

import React, { useState, useMemo } from 'react';
import { useAppContext } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import type { Expense } from '@/lib/store';
import { calcDailyUsage } from '@/lib/store';
import { ShoppingCart, Plus, Search, Package, Truck, CheckCircle2, XCircle, Filter, Clock, AlertTriangle, Calendar, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Order, FeedingRecord } from '@/lib/store';

const statusMap: Record<Order['status'], { label: string; icon: React.ElementType; color: string }> = {
  pending: { label: '待发货', icon: Clock, color: 'text-accent bg-accent/10' },
  shipped: { label: '运输中', icon: Truck, color: 'text-[#87CEEB] bg-[#87CEEB]/10' },
  delivered: { label: '已到货', icon: CheckCircle2, color: 'text-primary bg-primary/10' },
  cancelled: { label: '已取消', icon: XCircle, color: 'text-muted-foreground bg-muted' },
};

/** Get depletion info for an order */
function getExpiryInfo(order: Order): { daysLeft: number; expiryDate: string } | null {
  if (!order.productionDate || !order.shelfLife) return null;
  const prod = new Date(order.productionDate);
  const expiry = new Date(prod.getTime() + order.shelfLife * 24 * 60 * 60 * 1000);
  const now = new Date();
  const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  return { daysLeft, expiryDate: expiry.toISOString().split('T')[0] };
}

function getDepletionInfo(order: Order, feedingRecords: FeedingRecord[]): { daysLeft: number; depletionDate: string; dailyUsage: number } | null {
  const remaining = order.quantity - order.consumed;
  if (remaining <= 0) return null;
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
  const { state, addOrder, updateOrderStatus, deleteOrder, addExpense } = useAppContext();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showAdd, setShowAdd] = useState(false);

  const filteredOrders = useMemo(() => {
    return state.orders
      .filter(o => {
        if (statusFilter !== 'all' && o.status !== statusFilter) return false;
        if (search && !o.itemName.includes(search) && !o.category.includes(search) && !o.supplier.includes(search)) return false;
        return true;
      })
      .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
  }, [state.orders, search, statusFilter]);

  // Items expiring within 7 days
  const expiringItems = useMemo(() => {
    return state.orders
      .map(order => {
        const info = getExpiryInfo(order);
        if (!info) return null;
        return { order, ...info };
      })
      .filter((item): item is { order: Order; daysLeft: number; expiryDate: string } => item !== null && item.daysLeft <= 7 && item.daysLeft >= 0 && item.order.status === 'delivered')
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [state.orders]);

  // Items needing repurchase within 7 days (based on consumption speed)
  const repurchaseItems = useMemo(() => {
    return state.orders
      .filter(o => o.status === 'delivered')
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
    const total = state.orders.reduce((s, o) => s + o.quantity * o.unitPrice, 0);
    const delivered = state.orders.filter(o => o.status === 'delivered').length;
    const pending = state.orders.filter(o => o.status === 'pending' || o.status === 'shipped').length;
    return { total, delivered, pending, count: state.orders.length };
  }, [state.orders]);

  return (
    <div className="space-y-6 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">采购总览</h1>
          <p className="text-sm text-muted-foreground mt-1">管理所有采购订单与物资库存</p>
        </div>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button className="btn-press bg-primary hover:bg-primary/90 text-primary-foreground">
              <Plus className="w-4 h-4 mr-1.5" /> 新建采购
            </Button>
          </DialogTrigger>
          <AddOrderDialog onClose={() => setShowAdd(false)} onAdd={addOrder} addExpense={addExpense} />
        </Dialog>
      </div>

      {/* Expiry Reminder */}
      {expiringItems.length > 0 && (
        <div className="card-warm border-l-4 border-l-[#E88888] p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-[#E88888]" />
            <h3 className="font-semibold text-foreground text-sm">保质期提醒</h3>
            <Badge variant="secondary" className="bg-[#E88888]/10 text-[#E88888] text-xs">{expiringItems.length} 项即将到期</Badge>
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
                    {daysLeft === 0 ? '今天到期' : `还剩 ${daysLeft} 天`}
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
              <div key={order.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-accent/5">
                <div className="flex items-center gap-2">
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
        <SummaryCard label="总采购额" value={`¥${summary.total.toLocaleString()}`} />
        <SummaryCard label="订单总数" value={`${summary.count} 单`} />
        <SummaryCard label="已到货" value={`${summary.delivered} 单`} accent="text-primary" />
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
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] bg-card">
            <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="全部状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="pending">待发货</SelectItem>
            <SelectItem value="shipped">运输中</SelectItem>
            <SelectItem value="delivered">已到货</SelectItem>
            <SelectItem value="cancelled">已取消</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Orders Table */}
      <div className="card-warm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">物资名称</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">分类</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">库存</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">单价</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">供应商</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">采购时间</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">生产日期</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">保质期</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">预计耗尽</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">状态</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map(order => {
                const remaining = order.quantity - order.consumed;
                const ratio = remaining / order.quantity;
                const st = statusMap[order.status];
                const expiry = getExpiryInfo(order);
                return (
                  <tr key={order.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="font-medium text-foreground">{order.itemName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{order.category}</td>
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
                    <td className="px-4 py-3 text-foreground">¥{order.unitPrice}</td>
                    <td className="px-4 py-3 text-muted-foreground">{order.supplier}</td>
                    <td className="px-4 py-3 text-muted-foreground">{order.purchaseDate}</td>
                    <td className="px-4 py-3 text-muted-foreground">{order.productionDate || '-'}</td>
                    <td className="px-4 py-3">
                      {order.shelfLife ? (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-muted-foreground" />
                          <span className="text-muted-foreground">{order.shelfLife}天</span>
                          {expiry && expiry.daysLeft <= 7 && expiry.daysLeft >= 0 && (
                            <Badge className="ml-1 text-[10px] px-1 py-0 bg-[#E88888]/15 text-[#E88888] border-0">
                              {expiry.daysLeft === 0 ? '今天' : `${expiry.daysLeft}天`}
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
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', st.color)}>
                        <st.icon className="w-3 h-3" />
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {order.status === 'pending' && (
                          <Button variant="ghost" size="sm" onClick={() => updateOrderStatus(order.id, 'shipped')} className="text-xs h-7">
                            标记发货
                          </Button>
                        )}
                        {order.status === 'shipped' && (
                          <Button variant="ghost" size="sm" onClick={() => updateOrderStatus(order.id, 'delivered')} className="text-xs h-7 text-primary">
                            确认到货
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => { if (confirm('确定删除该订单？')) deleteOrder(order.id); }} className="text-xs h-7 text-destructive">
                          删除
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

function AddOrderDialog({ onClose, onAdd, addExpense }: { onClose: () => void; onAdd: (order: Omit<Order, 'id'>) => void; addExpense: (expense: Omit<Expense, 'id'>) => void }) {
  const [form, setForm] = useState({
    itemName: '', category: '主粮', quantity: '', unit: 'kg', unitPrice: '', supplier: '',
    productionDate: '', shelfLife: '', shelfLifeUnit: 'day' as 'day' | 'month' | 'year', syncExpense: true,
    purchaseDate: new Date().toISOString().split('T')[0],
  });

  const handleSubmit = () => {
    if (!form.itemName || !form.quantity || !form.unitPrice) return;
    const totalAmount = Number(form.quantity) * Number(form.unitPrice);
    onAdd({
      itemName: form.itemName,
      category: form.category,
      quantity: Number(form.quantity),
      unit: form.unit,
      unitPrice: Number(form.unitPrice),
      purchaseDate: form.purchaseDate,
      status: 'pending',
      consumed: 0,
      supplier: form.supplier,
      productionDate: form.productionDate || undefined,
      shelfLife: form.shelfLife ? (form.shelfLifeUnit === 'year' ? Number(form.shelfLife) * 365 : form.shelfLifeUnit === 'month' ? Number(form.shelfLife) * 30 : Number(form.shelfLife)) : undefined,
    });
    if (form.syncExpense && totalAmount > 0) {
      addExpense({
        date: new Date().toISOString().split('T')[0],
        category: form.category,
        amount: totalAmount,
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
              <SelectContent>
                {['干粮', '湿粮', '零食', '保健品', '药品', '用品', '玩具'].map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
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
            <Label>单价(¥)</Label>
            <Input type="number" value={form.unitPrice} onChange={e => setForm(p => ({ ...p, unitPrice: e.target.value }))} placeholder="0" />
          </div>
        </div>
        {form.category !== '用品' && form.category !== '玩具' && (
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
            同步记录购物支出到<span className="text-foreground font-medium">支出记账</span>（¥{(Number(form.quantity || 0) * Number(form.unitPrice || 0)).toFixed(2)}）
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
