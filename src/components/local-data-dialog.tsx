'use client';

import React, { useRef, useState } from 'react';
import { Cloud, Copy, Database, Download, FileUp, Link2, Link2Off, RefreshCw, X } from 'lucide-react';
import { createBackup, parseBackup } from '@/lib/store';
import { useAppContext } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { localDateKey } from '@/lib/local-date';

interface LocalDataDialogProps {
  open: boolean;
  onClose: () => void;
}

function backupFilename() {
  const date = localDateKey();
  return `福七之家-数据备份-${date}.json`;
}

export function LocalDataDialog({ open, onClose }: LocalDataDialogProps) {
  const {
    state, restoreState, syncInfo, createCloudSync, connectCloudSync, disconnectCloudSync, syncNow,
  } = useAppContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState('');
  const [syncCode, setSyncCode] = useState('');
  const [syncBusy, setSyncBusy] = useState(false);

  if (!open) return null;

  const exportBackup = async () => {
    const json = JSON.stringify(createBackup(state), null, 2);
    const file = new File([json], backupFilename(), { type: 'application/json' });

    try {
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: '福七之家数据备份',
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

  const createSync = async () => {
    setSyncBusy(true);
    setStatus('');
    try {
      const key = await createCloudSync();
      await navigator.clipboard?.writeText(key);
      setStatus('同步码已创建并复制，电脑输入同一个同步码即可连接');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '无法创建同步码');
    } finally {
      setSyncBusy(false);
    }
  };

  const connectSync = async () => {
    if (syncCode.replace(/[^A-Za-z0-9]/g, '').length < 8) {
      setStatus('请输入至少 8 位同步码');
      return;
    }
    setSyncBusy(true);
    setStatus('');
    try {
      const result = await connectCloudSync(syncCode);
      setSyncCode('');
      setStatus(result === 'connected' ? '已下载云端数据并开始自动同步' : '已创建云端数据并开始自动同步');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '无法连接同步码');
    } finally {
      setSyncBusy(false);
    }
  };

  const copySyncCode = async () => {
    await navigator.clipboard?.writeText(syncInfo.key);
    setStatus('同步码已复制');
  };

  const runSync = async () => {
    setSyncBusy(true);
    setStatus('');
    try {
      await syncNow();
      setStatus('当前数据已上传');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '同步失败');
    } finally {
      setSyncBusy(false);
    }
  };

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
              <h2 id="local-data-title" className="text-base font-semibold text-foreground">数据与同步</h2>
              <p className="text-xs text-muted-foreground">当前共 {recordCount} 条生活记录</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭本机数据">
            <X className="size-4" />
          </Button>
        </header>

        <div className="space-y-4 px-5 py-5">
          {syncInfo.key ? (
            <section className="space-y-3 border-b border-border pb-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Cloud className="size-5 shrink-0 text-primary-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">手机与电脑自动同步</p>
                    <p className="text-xs text-muted-foreground">
                      {syncInfo.status === 'syncing' || syncInfo.status === 'connecting' ? '正在同步…'
                        : syncInfo.status === 'synced' ? '云端已同步'
                          : syncInfo.status === 'offline' ? '当前离线，数据已保存在本机'
                            : syncInfo.error || '等待同步'}
                    </p>
                  </div>
                </div>
                <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
              </div>

              <div className="flex h-11 items-center gap-2 rounded-md border border-border bg-muted/30 px-3">
                <span className="min-w-0 flex-1 truncate font-mono text-sm font-semibold tracking-[0.08em] text-foreground">{syncInfo.key}</span>
                <Button variant="ghost" size="icon" onClick={copySyncCode} title="复制同步码">
                  <Copy className="size-4" />
                </Button>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">在另一台设备打开同一网页，在“数据”中输入这个同步码。</p>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" disabled={syncBusy} onClick={() => void runSync()}>
                  <RefreshCw className="size-4" />立即同步
                </Button>
                <Button variant="ghost" disabled={syncBusy} onClick={() => {
                  if (window.confirm('断开后，本机数据会保留，但不再与其他设备同步。')) {
                    disconnectCloudSync();
                    setStatus('已断开云同步，本机数据仍然保留');
                  }
                }}>
                  <Link2Off className="size-4" />断开同步
                </Button>
              </div>
            </section>
          ) : (
            <section className="space-y-3 border-b border-border pb-4">
              <div className="flex items-center gap-2.5">
                <Cloud className="size-5 text-primary-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">开启手机与电脑同步</p>
                  <p className="text-xs text-muted-foreground">本机仍会保留一份数据，断网也能继续使用。</p>
                </div>
              </div>
              <Button className="h-11 w-full" disabled={syncBusy || !syncInfo.available} onClick={() => void createSync()}>
                <Link2 className="size-4" />创建同步码
              </Button>
              <div className="flex items-center gap-2">
                <input
                  value={syncCode}
                  onChange={event => setSyncCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 font-mono text-sm uppercase outline-none focus:ring-2 focus:ring-ring"
                  placeholder="输入另一台设备的同步码"
                  maxLength={32}
                />
                <Button variant="outline" className="h-10" disabled={syncBusy || !syncInfo.available} onClick={() => void connectSync()}>连接</Button>
              </div>
            </section>
          )}

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
