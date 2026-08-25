'use client';

import React, { useState, useMemo, useRef } from 'react';
import { useAppContext } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Wallet, Plus, TrendingUp, TrendingDown, PieChart as PieChartIcon, Trash2, Search, Pencil } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
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
  '奶': '#7CC6A6',
  '猫粮': '#6EA8D9',
  '喂养用品': '#D49AC2',
  '洗护用品': '#F0A36E',
  '主食罐头': '#91B85B',
  '主食冻干': '#D77A61',
};
const categoryPalette = ['#6EA8D9', '#F39AAE', '#7CC6A6', '#E7B04B', '#A58BD4', '#F08080', '#5FB7B7', '#D49AC2', '#8A9A5B'];
const expenseCategories = ['主粮', '零食', '日用', '保健品', '玩具', '医疗', '体检', '疫苗', '驱虫', '其他'];

export default function ExpensesPage() {
  const { state, addExpense, updateExpense, deleteExpense } = useAppContext();
  const [showAdd, setShowAdd] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const detailsRef = useRef<HTMLDivElement>(null);
  const breakdownRef = useRef<HTMLDivElement>(null);

  const availableCategories = useMemo(() =>
    Array.from(new Set(state.expenses.map(expense => expense.category))).sort((a, b) => a.localeCompare(b, 'zh-CN')),
    [state.expenses]
  );
  const categoryColorMap = useMemo(() => Object.fromEntries(
    availableCategories.map((category, index) => [category, categoryColors[category] || categoryPalette[index % categoryPalette.length]])
  ), [availableCategories]);

  const monthExpenses = useMemo(() =>
    state.expenses.filter(expense => expense.date.startsWith(filterMonth)),
    [state.expenses, filterMonth]
  );

  const filteredExpenses = useMemo(() =>
    monthExpenses
      .filter(e => categoryFilter === 'all' || e.category === categoryFilter)
      .filter(e => !search.trim() || e.description.toLowerCase().includes(search.trim().toLowerCase()) || e.category.includes(search.trim()))
      .sort((a, b) => b.date.localeCompare(a.date)),
    [monthExpenses, categoryFilter, search]
  );

  const stats = useMemo(() => {
    const total = monthExpenses.reduce((s, e) => s + e.amount, 0);
    const byCategory: Record<string, number> = {};
    monthExpenses.forEach(e => {
      byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
    });
    const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
    return { total, byCategory: sorted, count: monthExpenses.length };
  }, [monthExpenses]);

  // Compare with previous month
  const prevMonthStats = useMemo(() => {
    const [y, m] = filterMonth.split('-').map(Number);
    const prev = new Date(y, m - 2, 1);
    const prevStr = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
    return state.expenses.filter(e => e.date.startsWith(prevStr)).reduce((s, e) => s + e.amount, 0);
  }, [state.expenses, filterMonth]);

  const changePercent = prevMonthStats > 0 ? ((stats.total - prevMonthStats) / prevMonthStats * 100).toFixed(0) : null;
  const showDetails = () => {
    setCategoryFilter('all');
    setSearch('');
    window.requestAnimationFrame(() => detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const showBreakdown = () => {
    window.requestAnimationFrame(() => breakdownRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

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
          <ExpenseDialog
            onClose={() => setShowAdd(false)}
            onSave={addExpense}
            onSaveMany={expenses => expenses.forEach(addExpense)}
          />
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button type="button" onClick={showDetails} className="card-warm p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
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
        </button>
        <button type="button" onClick={showDetails} className="card-warm p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary/8 flex items-center justify-center">
              <PieChartIcon className="w-4 h-4 text-primary" />
            </div>
            <span className="text-xs text-muted-foreground">消费笔数</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{stats.count}</p>
          <p className="text-xs text-muted-foreground mt-1">笔交易记录</p>
        </button>
        <button type="button" onClick={showBreakdown} className="card-warm p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-muted-foreground">日均消费</span>
          </div>
          <p className="text-2xl font-bold text-foreground">
            ¥{stats.total > 0 ? Math.round(stats.total / new Date().getDate()) : 0}
          </p>
          <p className="text-xs text-muted-foreground mt-1">本月日均</p>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Expense List */}
        <div ref={detailsRef} className="scroll-mt-4 lg:col-span-2 space-y-4">
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
                    style={{ backgroundColor: categoryColorMap[expense.category] || '#8A8A8A' }}
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
        <div ref={breakdownRef} className="card-warm scroll-mt-4 p-5">
          <h2 className="text-base font-semibold text-foreground mb-4">分类占比</h2>
          {stats.byCategory.length > 0 && (
            <div className="relative mx-auto mb-5 h-56 w-full max-w-[320px]" aria-label="本月支出分类饼图">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.byCategory.map(([name, value]) => ({ name, value }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={54}
                    outerRadius={86}
                    paddingAngle={2}
                    stroke="transparent"
                  >
                    {stats.byCategory.map(([category], index) => (
                      <Cell key={category} fill={categoryColorMap[category] || categoryPalette[index % categoryPalette.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={value => [`¥${Number(value).toLocaleString()}`, '支出']} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs text-muted-foreground">本月合计</span>
                <span className="mt-1 text-lg font-bold text-foreground">¥{stats.total.toLocaleString()}</span>
              </div>
            </div>
          )}
          <div className="space-y-3">
            {stats.byCategory.map(([cat, amount], index) => {
              const pct = stats.total > 0 ? (amount / stats.total * 100).toFixed(0) : '0';
              const color = categoryColorMap[cat] || categoryPalette[index % categoryPalette.length];
              return (
                <button key={cat} type="button" onClick={() => setCategoryFilter(cat)} className={cn('w-full rounded-md px-1 py-1 text-left transition-colors hover:bg-muted/50', categoryFilter === cat && 'bg-primary/8')}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
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
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>
                </button>
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

function ExpenseDialog({ initialExpense, onClose, onSave, onSaveMany }: {
  initialExpense?: Expense;
  onClose: () => void;
  onSave: (expense: Omit<Expense, 'id'>) => void;
  onSaveMany?: (expenses: Omit<Expense, 'id'>[]) => void;
}) {
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [form, setForm] = useState({
    date: initialExpense?.date || new Date().toISOString().split('T')[0],
    category: initialExpense?.category || '主粮',
    amount: initialExpense ? String(initialExpense.amount) : '',
    description: initialExpense?.description || '',
    relatedModule: initialExpense?.relatedModule || 'procurement' as Expense['relatedModule'],
  });
  const [batchItems, setBatchItems] = useState([
    { id: 'batch_1', description: '', category: '主粮', amount: '' },
    { id: 'batch_2', description: '', category: '日用', amount: '' },
  ]);

  const batchTotal = batchItems.reduce((total, item) => total + (Number(item.amount) || 0), 0);
  const batchValid = batchItems.length > 0 && batchItems.every(item =>
    item.description.trim() && Number.isFinite(Number(item.amount)) && Number(item.amount) > 0
  );

  const handleSubmit = () => {
    if (!initialExpense && mode === 'batch') {
      if (!batchValid || !onSaveMany) return;
      onSaveMany(batchItems.map(item => ({
        date: form.date,
        category: item.category,
        amount: Number(item.amount),
        description: item.description.trim(),
        relatedModule: form.relatedModule,
      })));
      onClose();
      return;
    }
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
        {!initialExpense && (
          <div className="grid grid-cols-2 rounded-lg bg-muted/55 p-1" role="tablist" aria-label="支出录入方式">
            <button type="button" role="tab" aria-selected={mode === 'single'} onClick={() => setMode('single')} className={cn('h-8 rounded-md text-sm transition-colors', mode === 'single' ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground')}>单笔支出</button>
            <button type="button" role="tab" aria-selected={mode === 'batch'} onClick={() => setMode('batch')} className={cn('h-8 rounded-md text-sm transition-colors', mode === 'batch' ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground')}>多项目合单</button>
          </div>
        )}
        {!initialExpense && mode === 'batch' ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>付款日期</Label>
                <Input type="date" value={form.date} onChange={event => setForm(current => ({ ...current, date: event.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>关联模块</Label>
                <Select value={form.relatedModule} onValueChange={value => setForm(current => ({ ...current, relatedModule: value as Expense['relatedModule'] }))}>
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
            <div className="space-y-2">
              {batchItems.map((item, index) => (
                <div key={item.id} className="rounded-lg border border-border/70 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">项目 {index + 1}</span>
                    {batchItems.length > 1 && (
                      <Button variant="ghost" size="icon-sm" onClick={() => setBatchItems(current => current.filter(entry => entry.id !== item.id))} className="text-destructive" title="删除项目">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_110px_100px]">
                    <Input value={item.description} onChange={event => setBatchItems(current => current.map(entry => entry.id === item.id ? { ...entry, description: event.target.value } : entry))} placeholder="项目名称，如：猫粮" />
                    <Select value={item.category} onValueChange={category => setBatchItems(current => current.map(entry => entry.id === item.id ? { ...entry, category } : entry))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{expenseCategories.map(category => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input type="number" min="0" step="0.01" value={item.amount} onChange={event => setBatchItems(current => current.map(entry => entry.id === item.id ? { ...entry, amount: event.target.value } : entry))} placeholder="金额" />
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setBatchItems(current => [...current, { id: `batch_${Date.now()}`, description: '', category: '其他', amount: '' }])} className="w-full">
                <Plus className="h-3.5 w-3.5" />添加项目
              </Button>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-primary/8 px-3 py-3">
              <span className="text-sm text-muted-foreground">合计 {batchItems.length} 个项目</span>
              <span className="text-base font-bold text-foreground">¥{batchTotal.toFixed(2)}</span>
            </div>
          </>
        ) : (
          <>
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
                {expenseCategories.map(c => (
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
          </>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button disabled={!initialExpense && mode === 'batch' && !batchValid} onClick={handleSubmit} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            {initialExpense ? '保存修改' : mode === 'batch' ? `保存 ${batchItems.length} 项` : '确认'}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}
