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
import { ShoppingCart, Plus, Search, Package, Truck, CheckCircle2, XCircle, Filter, Clock, AlertTriangle, Calendar, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Order } from '@/lib/store';

const statusMap: Record<Order['status'], { label: string; icon: React.ElementType; color: string }> = {
  pending: { label: '待发货', icon: Clock, color: 'text-accent bg-accent/10' },
  shipped: { label: '运输中', icon: Truck, color: 'text-[#87CEEB] bg-[#87CEEB]/10' },
  delivered: { label: '已到货', icon: CheckCircle2, color: 'text-primary bg-primary/10' },
  cancelled: { label: '已取消', icon: XCircle, color: 'text-muted-foreground bg-muted' },
};

function getExpiryInfo(order: Order): { daysLeft: number; expiryDate: string } | null {
  if (!order.productionDate || !order.shelfLife) return null;
  const prod = new Date(order.productionDate);
  const expiry = new Date(prod.getTime() + order.shelfLife * 24 * 60 * 60 * 1000);
  const now = new Date();
  const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  return { daysLeft, expiryDate: expiry.toISOString().split('T')[0] };
}

function getDepletionInfo(order: Order): { daysLeft: number; depletionDate: string } | null {
  if (!order.dailyUsage || order.dailyUsage <= 0) return null;
  const remaining = order.quantity - order.consumed;
  if (remaining <= 0) return null;
  const daysLeft = Math.floor(remaining / order.dailyUsage);
  const depletion = new Date();
  depletion.setDate(depletion.getDate() + daysLeft);
  return { daysLeft, depletionDate: depletion.toISOString().split('T')[0] };
}

export default function ProcurementPage() {
  const { state, addOrder, updateOrderStatus, addExpense } = useAppContext();
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
        const info = getDepletionInfo(order);
        if (!info) return null;
        return { order, ...info };
      })
      .filter((item): item is { order: Order; daysLeft: number; depletionDate: string } => item !== null && item.daysLeft <= 7)
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [state.orders]);

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
            {repurchaseItems.map(({ order, daysLeft, depletionDate }) => (
              <div key={order.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-accent/5">
                <div className="flex items-center gap-2">
                  <Package className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">{order.itemName}</span>
                  <span className="text-xs text-muted-foreground">剩余 {order.quantity - order.consumed}{order.unit}</span>
                  <span className="text-xs text-muted-foreground">· 日均消耗 {order.dailyUsage}{order.unit}</span>
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
                        const depletion = getDepletionInfo(order);
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
    productionDate: '', shelfLife: '', dailyUsage: '', syncExpense: true,
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
      shelfLife: form.shelfLife ? Number(form.shelfLife) : undefined,
      dailyUsage: form.dailyUsage ? Number(form.dailyUsage) : undefined,
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
                {['主粮', '零食', '日用', '保健品', '玩具', '医疗'].map(c => (
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
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>生产日期</Label>
            <Input type="date" value={form.productionDate} onChange={e => setForm(p => ({ ...p, productionDate: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>保质期(天)</Label>
            <Input type="number" value={form.shelfLife} onChange={e => setForm(p => ({ ...p, shelfLife: e.target.value }))} placeholder="如：365" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>日均消耗量</Label>
          <Input type="number" step="0.01" value={form.dailyUsage} onChange={e => setForm(p => ({ ...p, dailyUsage: e.target.value }))} placeholder={`如：0.1（${form.unit || '单位'}/天）`} />
          <p className="text-xs text-muted-foreground">用于预估库存耗尽时间，提前7天提醒回购</p>
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
