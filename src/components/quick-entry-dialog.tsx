'use client';

import React, { useState } from 'react';
import { Activity, ClipboardCheck, PackagePlus, ReceiptText, Utensils } from 'lucide-react';
import { useAppContext } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getPriceHistory, type DailyObservation, type FeedingRecord } from '@/lib/store';
import { InventoryCategoryOptions } from '@/components/inventory-category-options';

type EntryType = 'feeding' | 'observation' | 'weight' | 'expense' | 'purchase';

function getSuggestedMeal(): FeedingRecord['mealType'] {
  const hour = new Date().getHours();
  if (hour < 10) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}

export function QuickEntryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { state, today, addOrder, addFeedingRecord, addHealthRecord, updateHealthRecord, addExpense } = useAppContext();
  const activeCatId = state.activeCatId || state.cats[0]?.id;
  const [entryType, setEntryType] = useState<EntryType>('feeding');
  const [feeding, setFeeding] = useState({ mealType: getSuggestedMeal(), foodName: '', amount: '', medication: '', remainingAmount: '', eatingSpeed: 'normal' as NonNullable<FeedingRecord['eatingSpeed']>, note: '' });
  const [observation, setObservation] = useState<DailyObservation>({ appetite: 'normal', energy: 'normal', stool: 'normal', urine: 'normal', vomiting: 'none' });
  const [observationNote, setObservationNote] = useState('');
  const [weight, setWeight] = useState({ value: '', note: '' });
  const [expense, setExpense] = useState({ category: '主粮', amount: '', description: '' });
  const [purchase, setPurchase] = useState({ itemName: '', category: '猫粮', quantity: '1', unit: '件', totalPrice: '', supplier: '', syncExpense: true });
  const purchaseQuantity = Number(purchase.quantity);
  const purchaseTotalPrice = Number(purchase.totalPrice);
  const purchaseUnitPrice = purchaseQuantity > 0 && purchaseTotalPrice >= 0 ? purchaseTotalPrice / purchaseQuantity : 0;
  const purchasePriceHistory = getPriceHistory(purchase.itemName, purchase.unit, purchaseUnitPrice, state.orders);

  const close = () => onOpenChange(false);

  const submitFeeding = () => {
    if (!feeding.foodName.trim() || !feeding.amount.trim()) return;
    addFeedingRecord({
      date: today,
      mealType: feeding.mealType,
      foodName: feeding.foodName.trim(),
      amount: feeding.amount.trim(),
      medication: feeding.medication.trim() || undefined,
      remainingAmount: feeding.remainingAmount.trim() || undefined,
      completed: true,
      eatingSpeed: feeding.eatingSpeed,
      note: feeding.note.trim(),
    });
    setFeeding(prev => ({ ...prev, foodName: '', amount: '', medication: '', remainingAmount: '', note: '' }));
    close();
  };

  const submitWeight = () => {
    const value = Number(weight.value);
    if (!Number.isFinite(value) || value <= 0) return;
    addHealthRecord({
      date: today,
      type: 'weight',
      title: '日常称重',
      detail: weight.note.trim() || '快速记录',
      weight: value,
    });
    setWeight({ value: '', note: '' });
    close();
  };

  const submitObservation = () => {
    const existing = state.healthRecords.find(record => record.type === 'observation' && record.date === today && (!activeCatId || record.catId === activeCatId));
    if (existing) {
      updateHealthRecord(existing.id, { observation, detail: observationNote.trim() });
    } else {
      addHealthRecord({ date: today, type: 'observation', title: '每日健康观察', detail: observationNote.trim(), observation });
    }
    setObservationNote('');
    close();
  };

  const submitExpense = () => {
    const amount = Number(expense.amount);
    if (!expense.description.trim() || !Number.isFinite(amount) || amount <= 0) return;
    addExpense({
      date: today,
      category: expense.category,
      amount,
      description: expense.description.trim(),
      relatedModule: 'other',
    });
    setExpense(prev => ({ ...prev, amount: '', description: '' }));
    close();
  };

  const submitPurchase = () => {
    const quantity = Number(purchase.quantity);
    if (!purchase.itemName.trim() || !purchase.totalPrice || !Number.isFinite(quantity) || quantity <= 0) return;

    addOrder({
      itemName: purchase.itemName.trim(),
      category: purchase.category,
      quantity,
      unit: purchase.unit.trim() || '件',
      unitPrice: Number.isFinite(purchaseUnitPrice) ? purchaseUnitPrice : 0,
      totalPrice: Number.isFinite(purchaseTotalPrice) ? purchaseTotalPrice : 0,
      purchaseDate: today,
      status: 'delivered',
      consumed: 0,
      supplier: purchase.supplier.trim() || '未填写',
    });

    if (purchase.syncExpense && purchaseTotalPrice > 0) {
      addExpense({
        date: today,
        category: purchase.category,
        amount: purchaseTotalPrice,
        description: `${purchase.itemName.trim()} ${quantity}${purchase.unit.trim() || '件'}`,
        relatedModule: 'procurement',
      });
    }

    setPurchase(prev => ({ ...prev, itemName: '', quantity: '1', totalPrice: '', supplier: '' }));
    close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>快速记录</DialogTitle>
          <DialogDescription>把刚刚发生的事情记下来，默认使用今天的日期。</DialogDescription>
        </DialogHeader>

        <Tabs value={entryType} onValueChange={value => setEntryType(value as EntryType)}>
          <TabsList className="grid h-auto w-full grid-cols-5">
            <TabsTrigger value="feeding" className="py-2"><Utensils />喂食</TabsTrigger>
            <TabsTrigger value="observation" className="py-2"><ClipboardCheck />观察</TabsTrigger>
            <TabsTrigger value="weight" className="py-2"><Activity />体重</TabsTrigger>
            <TabsTrigger value="expense" className="py-2"><ReceiptText />支出</TabsTrigger>
            <TabsTrigger value="purchase" className="py-2"><PackagePlus />入库</TabsTrigger>
          </TabsList>

          <TabsContent value="feeding" className="space-y-4 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="餐次">
                <Select value={feeding.mealType} onValueChange={value => setFeeding(prev => ({ ...prev, mealType: value as FeedingRecord['mealType'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="breakfast">早餐</SelectItem>
                    <SelectItem value="lunch">午餐</SelectItem>
                    <SelectItem value="dinner">晚餐</SelectItem>
                    <SelectItem value="snack">加餐</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="进食表现">
                <Select value={feeding.eatingSpeed} onValueChange={value => setFeeding(prev => ({ ...prev, eatingSpeed: value as NonNullable<FeedingRecord['eatingSpeed']> }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fast">爱吃</SelectItem>
                    <SelectItem value="normal">正常</SelectItem>
                    <SelectItem value="slow">挑食</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="吃了什么"><Input value={feeding.foodName} onChange={event => setFeeding(prev => ({ ...prev, foodName: event.target.value }))} placeholder="如：主粮或罐头" autoFocus /></Field>
              <Field label="用量"><Input value={feeding.amount} onChange={event => setFeeding(prev => ({ ...prev, amount: event.target.value }))} placeholder="如：45g" /></Field>
            </div>
            <Field label="用药（可选）"><Input value={feeding.medication} onChange={event => setFeeding(prev => ({ ...prev, medication: event.target.value }))} placeholder="如：速诺0.5片" /></Field>
            <Field label="剩余量（可选）"><Input value={feeding.remainingAmount} onChange={event => setFeeding(prev => ({ ...prev, remainingAmount: event.target.value }))} placeholder="如：2g、半碗或无" /></Field>
            <Field label="备注"><Input value={feeding.note} onChange={event => setFeeding(prev => ({ ...prev, note: event.target.value }))} placeholder="可选，如饮水、食欲变化" /></Field>
            <SubmitRow onCancel={close} onSubmit={submitFeeding} label="完成打卡" />
          </TabsContent>

          <TabsContent value="observation" className="space-y-4 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <ObservationSelect label="食欲" value={observation.appetite} options={[['great', '旺盛'], ['normal', '正常'], ['low', '下降'], ['none', '不吃']]} onChange={value => setObservation(previous => ({ ...previous, appetite: value as DailyObservation['appetite'] }))} />
              <ObservationSelect label="精神" value={observation.energy} options={[['active', '活跃'], ['normal', '正常'], ['quiet', '安静'], ['poor', '精神差']]} onChange={value => setObservation(previous => ({ ...previous, energy: value as DailyObservation['energy'] }))} />
              <ObservationSelect label="便便" value={observation.stool} options={[['normal', '正常'], ['soft', '偏软'], ['diarrhea', '腹泻'], ['constipation', '便秘'], ['unseen', '未观察']]} onChange={value => setObservation(previous => ({ ...previous, stool: value as DailyObservation['stool'] }))} />
              <ObservationSelect label="排尿" value={observation.urine} options={[['normal', '正常'], ['less', '减少'], ['frequent', '频繁'], ['abnormal', '异常'], ['unseen', '未观察']]} onChange={value => setObservation(previous => ({ ...previous, urine: value as DailyObservation['urine'] }))} />
              <ObservationSelect label="呕吐" value={observation.vomiting} options={[['none', '无'], ['hairball', '毛球'], ['food', '食物'], ['yellow', '黄水'], ['other', '其他']]} onChange={value => setObservation(previous => ({ ...previous, vomiting: value as DailyObservation['vomiting'] }))} />
              <Field label="备注"><Input value={observationNote} onChange={event => setObservationNote(event.target.value)} placeholder="可选" /></Field>
            </div>
            <SubmitRow onCancel={close} onSubmit={submitObservation} label="保存观察" />
          </TabsContent>

          <TabsContent value="weight" className="space-y-4 pt-3">
            <Field label="体重（kg）"><Input type="number" min="0" step="0.01" value={weight.value} onChange={event => setWeight(prev => ({ ...prev, value: event.target.value }))} placeholder="如：4.52" /></Field>
            <Field label="备注"><Input value={weight.note} onChange={event => setWeight(prev => ({ ...prev, note: event.target.value }))} placeholder="如：饭前称重" /></Field>
            <SubmitRow onCancel={close} onSubmit={submitWeight} label="保存体重" />
          </TabsContent>

          <TabsContent value="expense" className="space-y-4 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="分类">
                <Select value={expense.category} onValueChange={value => setExpense(prev => ({ ...prev, category: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{['主粮', '零食', '日用', '保健品', '玩具', '医疗', '其他'].map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="金额（元）"><Input type="number" min="0" step="0.01" value={expense.amount} onChange={event => setExpense(prev => ({ ...prev, amount: event.target.value }))} placeholder="0.00" /></Field>
            </div>
            <Field label="说明"><Input value={expense.description} onChange={event => setExpense(prev => ({ ...prev, description: event.target.value }))} placeholder="这笔钱花在了哪里" /></Field>
            <SubmitRow onCancel={close} onSubmit={submitExpense} label="保存支出" />
          </TabsContent>

          <TabsContent value="purchase" className="space-y-4 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="物资名称"><Input value={purchase.itemName} onChange={event => setPurchase(prev => ({ ...prev, itemName: event.target.value }))} placeholder="如：猫砂" /></Field>
              <Field label="分类">
                <Select value={purchase.category} onValueChange={value => setPurchase(prev => ({ ...prev, category: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><InventoryCategoryOptions /></SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="数量"><Input type="number" min="0" step="0.01" value={purchase.quantity} onChange={event => setPurchase(prev => ({ ...prev, quantity: event.target.value }))} /></Field>
              <Field label="单位"><Input value={purchase.unit} onChange={event => setPurchase(prev => ({ ...prev, unit: event.target.value }))} placeholder="袋/罐/kg" /></Field>
              <Field label="本次总价"><Input type="number" min="0" step="0.01" value={purchase.totalPrice} onChange={event => setPurchase(prev => ({ ...prev, totalPrice: event.target.value }))} placeholder="实付金额" /></Field>
            </div>
            {purchaseUnitPrice > 0 && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                自动换算 ¥{purchaseUnitPrice.toFixed(2)}/{purchase.unit.trim() || '单位'}
                {purchasePriceHistory && `；上次 ¥${purchasePriceHistory.lastUnitPrice.toFixed(2)}，历史最低 ¥${purchasePriceHistory.lowestUnitPrice.toFixed(2)}`}
              </div>
            )}
            <Field label="购买渠道"><Input value={purchase.supplier} onChange={event => setPurchase(prev => ({ ...prev, supplier: event.target.value }))} placeholder="店铺或平台，可选" /></Field>
            <label className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
              <Checkbox checked={purchase.syncExpense} onCheckedChange={checked => setPurchase(prev => ({ ...prev, syncExpense: checked === true }))} />
              同步生成 ¥{(Number.isFinite(purchaseTotalPrice) ? purchaseTotalPrice : 0).toFixed(2)} 支出
            </label>
            <SubmitRow onCancel={close} onSubmit={submitPurchase} label="确认入库" />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function ObservationSelect({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{options.map(([optionValue, optionLabel]) => <SelectItem key={optionValue} value={optionValue}>{optionLabel}</SelectItem>)}</SelectContent>
      </Select>
    </Field>
  );
}

function SubmitRow({ onCancel, onSubmit, label }: { onCancel: () => void; onSubmit: () => void; label: string }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button variant="outline" onClick={onCancel}>取消</Button>
      <Button onClick={onSubmit} className="bg-primary text-primary-foreground hover:bg-primary/90">{label}</Button>
    </div>
  );
}
