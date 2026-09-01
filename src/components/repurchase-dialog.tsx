'use client';

import React, { useState } from 'react';
import { useAppContext } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getPriceHistory, type Order } from '@/lib/store';
import { localDateKey } from '@/lib/local-date';

export function RepurchaseDialog({ order, open, onOpenChange }: {
  order: Order;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { state, addOrder, addExpense, markOrderRepurchased } = useAppContext();
  const [form, setForm] = useState({
    quantity: String(order.quantity),
    unit: order.unit,
    totalPrice: '',
    supplier: order.supplier,
    purchaseDate: localDateKey(),
    status: 'pending' as 'pending' | 'delivered',
    syncExpense: true,
  });

  const quantity = Number(form.quantity);
  const totalPrice = form.totalPrice ? Number(form.totalPrice) : 0;
  const unitPrice = quantity > 0 && totalPrice > 0 ? totalPrice / quantity : 0;
  const history = getPriceHistory(order.itemName, form.unit, unitPrice, state.orders);

  const submit = () => {
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(totalPrice) || totalPrice < 0) return;

    addOrder({
      catId: 'shared',
      itemName: order.itemName,
      category: order.category,
      quantity,
      unit: form.unit.trim() || order.unit,
      unitPrice,
      totalPrice,
      purchaseDate: form.purchaseDate,
      status: form.status,
      consumed: 0,
      supplier: form.supplier.trim() || order.supplier,
    });
    markOrderRepurchased(order.id, form.purchaseDate);

    if (form.syncExpense && totalPrice > 0) {
      addExpense({
        catId: 'shared',
        date: form.purchaseDate,
        category: order.category,
        amount: totalPrice,
        description: `回购${order.itemName}`,
        relatedModule: 'procurement',
      });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>记录回购：{order.itemName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <Field label="采购日期">
              <Input type="date" value={form.purchaseDate} onChange={event => setForm(prev => ({ ...prev, purchaseDate: event.target.value }))} />
            </Field>
            <Field label="订单状态">
              <Select value={form.status} onValueChange={value => setForm(prev => ({ ...prev, status: value as 'pending' | 'delivered' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">已下单</SelectItem>
                  <SelectItem value="delivered">已到货</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="数量">
              <Input type="number" min="0" step="0.01" value={form.quantity} onChange={event => setForm(prev => ({ ...prev, quantity: event.target.value }))} />
            </Field>
            <Field label="单位">
              <Input value={form.unit} onChange={event => setForm(prev => ({ ...prev, unit: event.target.value }))} />
            </Field>
          </div>
          <Field label="实付总价（可选）">
            <Input type="number" min="0" step="0.01" value={form.totalPrice} onChange={event => setForm(prev => ({ ...prev, totalPrice: event.target.value }))} placeholder="本次一共花了多少" />
          </Field>
          {unitPrice > 0 && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
              自动换算 ¥{unitPrice.toFixed(2)}/{form.unit || '单位'}
              {history && `；上次 ¥${history.lastUnitPrice.toFixed(2)}，历史最低 ¥${history.lowestUnitPrice.toFixed(2)}`}
            </div>
          )}
          <Field label="购买渠道">
            <Input value={form.supplier} onChange={event => setForm(prev => ({ ...prev, supplier: event.target.value }))} placeholder="店铺或平台" />
          </Field>
          <label className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
            <Checkbox checked={form.syncExpense} onCheckedChange={checked => setForm(prev => ({ ...prev, syncExpense: checked === true }))} />
            同步生成 ¥{totalPrice.toFixed(2)} 支出
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button onClick={submit}>确认回购</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
