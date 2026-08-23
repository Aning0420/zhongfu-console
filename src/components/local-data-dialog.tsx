'use client';

import React, { useRef, useState } from 'react';
import { Database, Download, FileUp, ShieldCheck, X } from 'lucide-react';
import { createBackup, parseBackup } from '@/lib/store';
import { useAppContext } from '@/components/providers';
import { Button } from '@/components/ui/button';

interface LocalDataDialogProps {
  open: boolean;
  onClose: () => void;
}

function backupFilename() {
  const date = new Date().toISOString().slice(0, 10);
  return `钟福供养办事处-数据备份-${date}.json`;
}

export function LocalDataDialog({ open, onClose }: LocalDataDialogProps) {
  const { state, restoreState } = useAppContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState('');

  if (!open) return null;

  const exportBackup = async () => {
    const json = JSON.stringify(createBackup(state), null, 2);
    const file = new File([json], backupFilename(), { type: 'application/json' });

    try {
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: '钟福供养办事处数据备份',
          files: [file],
        });
        setStatus('备份已交给系统保存或分享');
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }

    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(url);
    setStatus('备份文件已下载');
  };

  const importBackup = async (file: File) => {
    try {
      const nextState = parseBackup(await file.text());
      const shouldRestore = window.confirm('导入会覆盖这台设备当前的全部记录，确定继续吗？');
      if (!shouldRestore) return;
      restoreState(nextState);
      setStatus('数据已恢复到这台设备');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '无法读取这个备份文件');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const recordCount = state.orders.length
    + state.feedingRecords.length
    + state.feedingPlans.length
    + state.healthRecords.length
    + state.expenses.length;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/25 p-0 sm:items-center sm:p-4" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="local-data-title"
        className="w-full max-w-md rounded-t-lg border border-border bg-background shadow-xl sm:rounded-lg"
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary-foreground">
              <Database className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 id="local-data-title" className="text-base font-semibold text-foreground">本机数据</h2>
              <p className="text-xs text-muted-foreground">当前共 {recordCount} 条生活记录</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭本机数据">
            <X className="size-4" />
          </Button>
        </header>

        <div className="space-y-4 px-5 py-5">
          <div className="flex gap-3 rounded-lg border border-primary/25 bg-primary/10 p-3.5">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary-foreground" />
            <div className="text-sm leading-6 text-foreground">
              <p className="font-medium">记录只保存在这台设备</p>
              <p className="text-xs leading-5 text-muted-foreground">不会上传 Supabase。删除应用、清除浏览器数据或换手机前，请先导出备份。</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button className="h-12 gap-2" onClick={exportBackup}>
              <Download className="size-4" />
              导出备份
            </Button>
            <Button className="h-12 gap-2" variant="outline" onClick={() => fileInputRef.current?.click()}>
              <FileUp className="size-4" />
              导入备份
            </Button>
          </div>

          <input
            ref={fileInputRef}
            className="hidden"
            type="file"
            accept="application/json,.json"
            onChange={event => {
              const file = event.target.files?.[0];
              if (file) void importBackup(file);
            }}
          />

          {status && (
            <p role="status" className="rounded-md bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
              {status}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
