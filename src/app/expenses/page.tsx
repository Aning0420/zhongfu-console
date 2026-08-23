'use client';

import React, { useState, useMemo } from 'react';
import { useAppContext } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Wallet, Plus, TrendingUp, TrendingDown, PieChart, Trash2, Search, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Expense } from '@/lib/store';

const categoryColors: Record<string, string> = {
  '主粮': '#87CEEB',
  '零食': '#FFB6C1',
  '日用': '#B0E0E6',
  '保健品': '#C9B1FF',
  '玩具': '#E88888',
  '医疗': '#F0B98A',
  '体检': '#87CEEB',
  '疫苗': '#98D8C8',
  '驱虫': '#D4C5A0',
};

export default function ExpensesPage() {
  const { state, addExpense, updateExpense, deleteExpense } = useAppContext();
  const [showAdd, setShowAdd] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const availableCategories = useMemo(() =>
    Array.from(new Set(state.expenses.map(expense => expense.category))).sort((a, b) => a.localeCompare(b, 'zh-CN')),
    [state.expenses]
  );

  const filteredExpenses = useMemo(() =>
    state.expenses
      .filter(e => e.date.startsWith(filterMonth))
      .filter(e => categoryFilter === 'all' || e.category === categoryFilter)
      .filter(e => !search.trim() || e.description.toLowerCase().includes(search.trim().toLowerCase()) || e.category.includes(search.trim()))
      .sort((a, b) => b.date.localeCompare(a.date)),
    [state.expenses, filterMonth, categoryFilter, search]
  );

  const stats = useMemo(() => {
    const total = filteredExpenses.reduce((s, e) => s + e.amount, 0);
    const byCategory: Record<string, number> = {};
    filteredExpenses.forEach(e => {
      byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
    });
    const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
    return { total, byCategory: sorted, count: filteredExpenses.length };
  }, [filteredExpenses]);

  // Compare with previous month
  const prevMonthStats = useMemo(() => {
    const [y, m] = filterMonth.split('-').map(Number);
    const prev = new Date(y, m - 2, 1);
    const prevStr = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
    return state.expenses.filter(e => e.date.startsWith(prevStr)).reduce((s, e) => s + e.amount, 0);
  }, [state.expenses, filterMonth]);

  const changePercent = prevMonthStats > 0 ? ((stats.total - prevMonthStats) / prevMonthStats * 100).toFixed(0) : null;

  return (
    <div className="space-y-6 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">支出记账</h1>
          <p className="text-sm text-muted-foreground mt-1">管理日常支出，追踪费用趋势</p>
        </div>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button className="btn-press bg-primary hover:bg-primary/90 text-primary-foreground">
              <Plus className="w-4 h-4 mr-1.5" /> 记一笔
            </Button>
          </DialogTrigger>
          <ExpenseDialog onClose={() => setShowAdd(false)} onSave={addExpense} />
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card-warm p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-[#87CEEB]/8 flex items-center justify-center">
              <Wallet className="w-4 h-4 text-[#87CEEB]" />
            </div>
            <span className="text-xs text-muted-foreground">本月总支出</span>
          </div>
          <p className="text-2xl font-bold text-foreground">¥{stats.total.toLocaleString()}</p>
          {changePercent && (
            <div className="flex items-center gap-1 mt-1">
              {Number(changePercent) > 0 ? (
                <TrendingUp className="w-3 h-3 text-destructive" />
              ) : (
                <TrendingDown className="w-3 h-3 text-primary" />
              )}
              <span className={cn('text-xs', Number(changePercent) > 0 ? 'text-destructive' : 'text-primary')}>
                较上月 {Number(changePercent) > 0 ? '+' : ''}{changePercent}%
              </span>
            </div>
          )}
        </div>
        <div className="card-warm p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary/8 flex items-center justify-center">
              <PieChart className="w-4 h-4 text-primary" />
            </div>
            <span className="text-xs text-muted-foreground">消费笔数</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{stats.count}</p>
          <p className="text-xs text-muted-foreground mt-1">笔交易记录</p>
        </div>
        <div className="card-warm p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-muted-foreground">日均消费</span>
          </div>
          <p className="text-2xl font-bold text-foreground">
            ¥{stats.total > 0 ? Math.round(stats.total / new Date().getDate()) : 0}
          </p>
          <p className="text-xs text-muted-foreground mt-1">本月日均</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Expense List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-base font-semibold text-foreground">支出明细</h2>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[180px] flex-1 sm:w-[220px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索支出说明" className="bg-card pl-9" />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[130px] bg-card"><SelectValue placeholder="全部分类" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部分类</SelectItem>
                  {availableCategories.map(category => <SelectItem key={category} value={category}>{category}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                type="month"
                value={filterMonth}
                onChange={e => setFilterMonth(e.target.value)}
                className="w-[150px] bg-card"
              />
            </div>
          </div>
          <div className="card-warm divide-y divide-border/50">
            {filteredExpenses.map(expense => (
              <div key={expense.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors">
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className="w-2 h-8 rounded-full"
                    style={{ backgroundColor: categoryColors[expense.category] || '#8A8A8A' }}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{expense.description}</p>
                    <p className="text-xs text-muted-foreground">{expense.category} · {expense.date}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">¥{expense.amount.toLocaleString()}</span>
                  <button
                    type="button"
                    onClick={() => setEditingExpense(expense)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary-foreground"
                    title="编辑支出"
                    aria-label={`编辑支出：${expense.description}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (confirm('确定删除该支出？')) deleteExpense(expense.id); }}
                    className="w-6 h-6 rounded-full border border-destructive/30 text-destructive flex items-center justify-center hover:bg-destructive/10 transition-all"
                    title="删除"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
            {filteredExpenses.length === 0 && (
              <div className="text-center py-12 text-muted-foreground text-sm">本月暂无支出记录</div>
            )}
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="card-warm p-5">
          <h2 className="text-base font-semibold text-foreground mb-4">分类占比</h2>
          <div className="space-y-3">
            {stats.byCategory.map(([cat, amount]) => {
              const pct = stats.total > 0 ? (amount / stats.total * 100).toFixed(0) : '0';
              return (
                <div key={cat}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: categoryColors[cat] || '#8A8A8A' }} />
                      <span className="text-sm text-foreground">{cat}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-medium text-foreground">¥{amount.toLocaleString()}</span>
                      <span className="text-xs text-muted-foreground ml-1.5">{pct}%</span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: categoryColors[cat] || '#8A8A8A' }}
                    />
                  </div>
                </div>
              );
            })}
            {stats.byCategory.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">暂无数据</p>
            )}
          </div>
        </div>
      </div>

      {editingExpense && (
        <Dialog open onOpenChange={open => { if (!open) setEditingExpense(null); }}>
          <ExpenseDialog
            key={editingExpense.id}
            initialExpense={editingExpense}
            onClose={() => setEditingExpense(null)}
            onSave={updates => {
              updateExpense(editingExpense.id, updates);
              setEditingExpense(null);
            }}
          />
        </Dialog>
      )}
    </div>
  );
}

function ExpenseDialog({ initialExpense, onClose, onSave }: {
  initialExpense?: Expense;
  onClose: () => void;
  onSave: (expense: Omit<Expense, 'id'>) => void;
}) {
  const [form, setForm] = useState({
    date: initialExpense?.date || new Date().toISOString().split('T')[0],
    category: initialExpense?.category || '主粮',
    amount: initialExpense ? String(initialExpense.amount) : '',
    description: initialExpense?.description || '',
    relatedModule: initialExpense?.relatedModule || 'procurement' as Expense['relatedModule'],
  });

  const handleSubmit = () => {
    if (!form.amount || !form.description) return;
    onSave({
      date: form.date,
      category: form.category,
      amount: Number(form.amount),
      description: form.description,
      relatedModule: form.relatedModule,
    });
    onClose();
  };

  return (
    <DialogContent className="sm:max-w-[400px]">
      <DialogHeader>
        <DialogTitle>{initialExpense ? '编辑支出' : '记一笔支出'}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 pt-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>日期</Label>
            <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>金额(¥)</Label>
            <Input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="0" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>分类</Label>
            <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {['主粮', '零食', '日用', '保健品', '玩具', '医疗', '体检', '疫苗', '驱虫', '其他'].map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>关联模块</Label>
            <Select value={form.relatedModule} onValueChange={v => setForm(p => ({ ...p, relatedModule: v as Expense['relatedModule'] }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="procurement">采购</SelectItem>
                <SelectItem value="health">健康</SelectItem>
                <SelectItem value="feeding">喂食</SelectItem>
                <SelectItem value="other">其他</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>描述</Label>
          <Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="如：皇家猫粮 10kg" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleSubmit} className="bg-primary hover:bg-primary/90 text-primary-foreground">{initialExpense ? '保存修改' : '确认'}</Button>
        </div>
      </div>
    </DialogContent>
  );
}
