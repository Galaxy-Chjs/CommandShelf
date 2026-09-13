import { useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'

import type { AppInfo, Settings, ThemeMode } from '@shared/types'

import { Icon, type IconName } from '../components/Icon'
import {
  Badge,
  Banner,
  Button,
  ConfirmDialog,
  Field,
  Modal,
  Select,
  Toggle,
  cx,
  type ToastAction,
} from '../components/ui'
import { api } from '../lib/api'
import { describeAccelerator, formatAccelerator, parseAcceleratorEvent } from '../lib/accelerator'

/**
 * Settings.
 *
 * The hotkey field is a recorder rather than a text box: accelerator syntax is
 * easy to get subtly wrong, and a broken hotkey is invisible until the user
 * tries it.
 */

const THEMES: { value: ThemeMode; label: string; icon: IconName }[] = [
  { value: 'dark', label: '深色', icon: 'moon' },
  { value: 'light', label: '浅色', icon: 'sun' },
  { value: 'system', label: '跟随系统', icon: 'monitor' },
]

export function SettingsDialog({
  open,
  settings,
  info,
  onClose,
  onSettingsChanged,
  onDataChanged,
  onNotice,
}: {
  open: boolean
  settings: Settings
  info: AppInfo | null
  onClose: () => void
  onSettingsChanged: (settings: Settings) => void
  onDataChanged: () => void
  onNotice: (message: string, tone?: 'info' | 'good' | 'bad', action?: ToastAction) => void
}) {
  const [recording, setRecording] = useState(false)
  const [pendingHotkey, setPendingHotkey] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const update = async (patch: Partial<Settings>) => {
    const result = await api.settings.update(patch)
    if (!result.ok) {
      onNotice(result.error, 'bad')
      return
    }
    onSettingsChanged(result.data)
  }

  const record = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!recording) return
    event.preventDefault()
    event.stopPropagation()

    const parts = parseAcceleratorEvent(event.nativeEvent)
    if (!parts) {
      setPendingHotkey('需要同时包含 Ctrl / Alt / Shift 中的至少一个')
      return
    }
    setPendingHotkey(null)
    setRecording(false)
    event.currentTarget.blur()
    void update({ hotkey: formatAccelerator(parts) })
  }

  const runDataAction = async (key: string, action: () => Promise<void>) => {
    setBusy(key)
    try {
      await action()
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <Modal
        open={open}
        title="设置"
        onClose={onClose}
        width={620}
        footer={<Button onClick={onClose}>完成</Button>}
      >
        <div className="flex flex-col gap-5">
          <Section title="外观">
            <Field label="主题" as="group">
              <div className="flex gap-1.5">
                {THEMES.map((theme) => (
                  <button
                    key={theme.value}
                    type="button"
                    aria-pressed={settings.theme === theme.value}
                    onClick={() => void update({ theme: theme.value })}
                    className={cx(
                      'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[12.5px] transition-colors',
                      settings.theme === theme.value
                        ? 'border-[var(--cs-accent)] bg-[color-mix(in_srgb,var(--cs-accent)_12%,transparent)] text-[var(--cs-accent)]'
                        : 'border-[var(--cs-border)] text-[var(--cs-muted)] hover:border-[var(--cs-border-strong)] hover:text-[var(--cs-text)]',
                    )}
                  >
                    <Icon name={theme.icon} size={13} />
                    {theme.label}
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="面板宽度">
                <Select
                  value={String(settings.panelWidth)}
                  onChange={(event) => void update({ panelWidth: Number(event.target.value) })}
                >
                  {[560, 620, 680, 740, 820, 900].map((width) => (
                    <option key={width} value={width}>
                      {width} px
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="面板最多显示">
                <Select
                  value={String(settings.panelMaxResults)}
                  onChange={(event) => void update({ panelMaxResults: Number(event.target.value) })}
                >
                  {[5, 6, 8, 10, 12, 15].map((count) => (
                    <option key={count} value={count}>
                      {count} 条
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Section>

          <Section title="快捷面板">
            <Field
              label="全局快捷键"
              hint="在任意程序中按下这个组合键即可呼出面板。点击输入框后直接按下新的组合键。"
            >
              <div
                role="button"
                tabIndex={0}
                aria-label="录制全局快捷键"
                onFocus={() => setRecording(true)}
                onBlur={() => setRecording(false)}
                onKeyDown={record}
                className={cx(
                  'mono flex h-8 cursor-pointer items-center justify-between rounded-md border px-2.5 text-[12.5px] transition-colors',
                  recording
                    ? 'border-[var(--cs-accent)] bg-[color-mix(in_srgb,var(--cs-accent)_10%,transparent)]'
                    : 'border-[var(--cs-border)] bg-[var(--cs-surface-2)] hover:border-[var(--cs-border-strong)]',
                )}
              >
                <span>
                  {recording ? '请按下新的组合键…' : describeAccelerator(settings.hotkey)}
                </span>
                <Icon name="keyboard" size={13} />
              </div>
            </Field>

            {pendingHotkey ? <Banner tone="warn">{pendingHotkey}</Banner> : null}

            {info && !info.hotkeyRegistered ? (
              <Banner tone="bad">
                当前快捷键 <span className="mono">{describeAccelerator(settings.hotkey)}</span>{' '}
                没有注册成功，可能已被其他程序占用。请换一个组合。
              </Banner>
            ) : null}

            <Toggle
              checked={settings.hideAfterCopy}
              onChange={(value) => void update({ hideAfterCopy: value })}
              label="复制后自动隐藏面板"
              hint="关闭后，复制成功时面板会保留，方便连续复制多条。"
            />
          </Section>

          <Section title="启动">
            <Toggle
              checked={settings.launchAtLogin}
              onChange={(value) => void update({ launchAtLogin: value })}
              label="开机自动启动"
              hint="安装版本才会生效；开发模式下不会写入系统登录项。"
            />
          </Section>

          <Section title="数据">
            <div className="flex items-center gap-2 rounded-md border border-[var(--cs-border)] bg-[var(--cs-surface-2)] px-2.5 py-2">
              <Icon name="database" size={14} />
              <span className="mono min-w-0 flex-1 truncate text-[11.5px] text-[var(--cs-muted)]">
                {info?.databasePath ?? '—'}
              </span>
              <Button size="sm" onClick={() => void api.app.openDataDir()}>
                打开目录
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                icon="download"
                disabled={busy === 'export'}
                onClick={() =>
                  void runDataAction('export', async () => {
                    const result = await api.data.exportJson()
                    if (!result.ok) return onNotice(result.error, 'bad')
                    if (!result.data.path) return
                    onNotice(`已导出 ${result.data.items} 条到 ${result.data.path}`, 'good')
                  })
                }
              >
                导出 JSON
              </Button>
              <Button
                icon="upload"
                disabled={busy === 'import'}
                onClick={() =>
                  void runDataAction('import', async () => {
                    const result = await api.data.importJson()
                    if (!result.ok) return onNotice(result.error, 'bad')
                    if (!result.data) return
                    const { items, collections, tags, skipped } = result.data
                    onNotice(
                      `已导入 ${items} 条（新增分类 ${collections}、标签 ${tags}，跳过重复 ${skipped}）`,
                      'good',
                    )
                    onDataChanged()
                  })
                }
              >
                导入 JSON
              </Button>
              <Button
                icon="plus"
                disabled={busy === 'seed'}
                onClick={() =>
                  void runDataAction('seed', async () => {
                    const result = await api.data.seedDemo()
                    if (!result.ok) return onNotice(result.error, 'bad')
                    onNotice(`已载入 ${result.data.items} 条示例数据`, 'good')
                    onDataChanged()
                  })
                }
              >
                载入示例数据
              </Button>
              <Button
                variant="danger"
                icon="trash"
                className="ml-auto"
                disabled={busy === 'clear'}
                onClick={() => setConfirmClear(true)}
              >
                清空全部数据
              </Button>
            </div>

            <p className="text-[11.5px] text-[var(--cs-faint)]">
              所有数据都保存在上面的 SQLite 文件中。CommandShelf 不联网、不上传、不含任何遥测。
            </p>
          </Section>

          <Section title="关于">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11.5px]">
              <Line label="版本" value={info?.version ?? '—'} />
              <Line label="数据库 schema" value={`v${info?.schemaVersion ?? '—'}`} />
              <Line label="Electron" value={info?.electron ?? '—'} />
              <Line label="Chromium" value={info?.chrome ?? '—'} />
              <Line label="Node" value={info?.node ?? '—'} />
              <Line label="平台" value={info?.platform ?? '—'} />
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={info?.hotkeyRegistered ? 'good' : 'bad'}>
                {info?.hotkeyRegistered ? '全局快捷键已生效' : '全局快捷键未生效'}
              </Badge>
              <Badge>本地优先</Badge>
              <Badge>无遥测</Badge>
            </div>
          </Section>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmClear}
        title="清空全部数据"
        danger
        confirmLabel="确认清空"
        message={
          <>
            这会永久删除所有条目、分类和标签，且无法撤销。
            <br />
            如果只是想重新开始，建议先导出一次 JSON 备份。
          </>
        }
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setConfirmClear(false)
          void runDataAction('clear', async () => {
            const result = await api.data.clearAll()
            if (!result.ok) return onNotice(result.error, 'bad')
            onNotice(`已删除 ${result.data.items} 条数据`, 'good')
            onDataChanged()
          })
        }}
      />
    </>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-[11px] font-semibold tracking-[0.07em] text-[var(--cs-faint)] uppercase">
        {title}
      </h3>
      {children}
    </section>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-dashed border-[var(--cs-border)] pb-1">
      <span className="text-[var(--cs-faint)]">{label}</span>
      <span className="mono truncate text-[var(--cs-muted)]">{value}</span>
    </div>
  )
}
