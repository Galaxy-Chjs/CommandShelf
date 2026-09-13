import type { DatabaseSync } from 'node:sqlite'

import type { ItemKind, TransferSummary } from '@shared/types'

import { applyImport, EXPORT_FORMAT_VERSION, type ExportPayload } from './transfer'

/**
 * First-run example content.
 *
 * Two purposes: a brand-new install is not an empty box, and the README
 * screenshots are taken from a real, plausible shelf rather than lorem ipsum.
 * It is loaded through the normal import path, so it is also an end-to-end
 * exercise of `applyImport`.
 */

interface SeedItem {
  title: string
  body: string
  kind: ItemKind
  language?: string
  collection: string | null
  tags: string[]
  favorite?: boolean
  useCount?: number
  /** Age of `created_at`, in hours. Keeps the list ordering believable. */
  age: number
}

const SERVER = '服务器'
const MODELS = '模型与数据'
const TRAINING = '训练与实验'
const DAILY = '日常开发'

const SEED: SeedItem[] = [
  // ---------------------------------------------------------------- servers
  {
    title: '端口转发到本地',
    body: 'ssh -L {{local_port=8888}}:localhost:{{remote_port=8888}} {{server=user@10.0.0.12}} -N',
    kind: 'command',
    collection: SERVER,
    tags: ['ssh', '网络'],
    favorite: true,
    useCount: 37,
    age: 720,
  },
  {
    title: '直连远程 Jupyter',
    body: 'ssh -N -L 8888:localhost:8888 {{server=user@10.0.0.12}}',
    kind: 'command',
    collection: SERVER,
    tags: ['ssh', 'jupyter'],
    useCount: 12,
    age: 700,
  },
  {
    title: '上传文件到服务器',
    body: 'scp -r {{local_path=./data}} {{server=user@10.0.0.12}}:{{remote_path=/nfs-data/user/}}',
    kind: 'command',
    collection: SERVER,
    tags: ['scp'],
    useCount: 21,
    age: 650,
  },
  {
    title: '服务器磁盘占用排行',
    body: 'du -h --max-depth=1 {{path=.}} | sort -rh | head -20',
    kind: 'command',
    collection: SERVER,
    tags: ['磁盘'],
    useCount: 15,
    age: 600,
  },
  {
    title: '查看端口占用',
    body: 'ss -tulpn | grep {{port=8080}}',
    kind: 'command',
    collection: SERVER,
    tags: ['网络'],
    useCount: 8,
    age: 500,
  },
  {
    title: '查看占用 GPU 的进程',
    body: 'nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv',
    kind: 'command',
    collection: SERVER,
    tags: ['gpu'],
    favorite: true,
    useCount: 44,
    age: 480,
  },
  {
    title: '杀掉所有 GPU 进程',
    body: 'nvidia-smi --query-compute-apps=pid --format=csv,noheader | xargs -r kill -9',
    kind: 'command',
    collection: SERVER,
    tags: ['gpu', '危险'],
    useCount: 3,
    age: 460,
  },
  {
    title: '实验室服务器',
    body: 'user@10.0.0.12',
    kind: 'path',
    collection: SERVER,
    tags: ['ssh'],
    favorite: true,
    useCount: 52,
    age: 740,
  },

  // ------------------------------------------------------------ models/data
  {
    title: '下载 Hugging Face 模型',
    body: 'hf download {{repo_id=Qwen/Qwen3-8B}} --local-dir {{target_dir=./models/Qwen3-8B}}',
    kind: 'command',
    collection: MODELS,
    tags: ['hf', '模型'],
    favorite: true,
    useCount: 29,
    age: 430,
  },
  {
    title: '只下载权重文件',
    body: 'hf download {{repo_id}} --include "{{pattern=*.safetensors}}" --local-dir {{target_dir}}',
    kind: 'command',
    collection: MODELS,
    tags: ['hf', '模型'],
    useCount: 9,
    age: 400,
  },
  {
    title: '列出 Hugging Face 缓存',
    body: 'hf cache ls --revisions',
    kind: 'command',
    collection: MODELS,
    tags: ['hf', '磁盘'],
    useCount: 6,
    age: 380,
  },
  {
    title: '模型缓存目录',
    body: '~/.cache/huggingface/hub',
    kind: 'path',
    collection: MODELS,
    tags: ['hf', '路径'],
    useCount: 18,
    age: 420,
  },
  {
    title: '数据集存放目录',
    body: '/nfs-data/datasets',
    kind: 'path',
    collection: MODELS,
    tags: ['路径', '数据'],
    useCount: 11,
    age: 360,
  },

  // -------------------------------------------------------------- training
  {
    title: '指定 GPU 启动训练',
    body: 'CUDA_VISIBLE_DEVICES={{gpu_id=0}} python {{script=train.py}} --config {{config=configs/base.yaml}}',
    kind: 'command',
    collection: TRAINING,
    tags: ['训练', 'cuda'],
    favorite: true,
    useCount: 33,
    age: 340,
  },
  {
    title: '后台训练并写日志',
    body: 'nohup python {{script=train.py}} > {{log_file=logs/train.log}} 2>&1 &',
    kind: 'command',
    collection: TRAINING,
    tags: ['训练', '日志'],
    useCount: 25,
    age: 320,
  },
  {
    title: '实时查看训练日志',
    body: 'tail -f {{log_file=logs/train.log}}',
    kind: 'command',
    collection: TRAINING,
    tags: ['日志'],
    useCount: 61,
    age: 310,
  },
  {
    title: '持续监控 GPU',
    body: 'watch -n 1 nvidia-smi',
    kind: 'command',
    collection: TRAINING,
    tags: ['gpu'],
    useCount: 27,
    age: 300,
  },
  {
    title: '实验输出目录',
    body: '/nfs-data/{{user=yourname}}/experiments',
    kind: 'path',
    collection: TRAINING,
    tags: ['路径', '实验'],
    useCount: 14,
    age: 290,
  },
  {
    title: '启动 TensorBoard',
    body: 'tensorboard --logdir {{logdir=runs}} --port {{port=6006}} --bind_all',
    kind: 'command',
    collection: TRAINING,
    tags: ['实验', '可视化'],
    useCount: 7,
    age: 260,
  },

  // ----------------------------------------------------------------- daily
  {
    title: '撤销上一次提交但保留改动',
    body: 'git reset --soft HEAD~1',
    kind: 'command',
    collection: DAILY,
    tags: ['git'],
    favorite: true,
    useCount: 19,
    age: 240,
  },
  {
    title: '清理已合并的本地分支',
    body: "git branch --merged | grep -v '\\*' | xargs -n 1 git branch -d",
    kind: 'command',
    collection: DAILY,
    tags: ['git'],
    useCount: 5,
    age: 220,
  },
  {
    title: '只重跑上次失败的测试',
    body: 'pytest --lf -x -q',
    kind: 'command',
    collection: DAILY,
    tags: ['pytest'],
    useCount: 23,
    age: 200,
  },
  {
    title: '创建虚拟环境并安装依赖',
    body: 'python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt',
    kind: 'command',
    collection: DAILY,
    tags: ['python', 'venv'],
    useCount: 10,
    age: 180,
  },
  {
    title: '进入运行中的容器',
    body: 'docker exec -it {{container=my-container}} /bin/bash',
    kind: 'command',
    collection: DAILY,
    tags: ['docker'],
    useCount: 13,
    age: 150,
  },
  {
    title: '清理 Docker 无用数据',
    body: 'docker system prune -a --volumes',
    kind: 'command',
    collection: DAILY,
    tags: ['docker', '磁盘'],
    useCount: 4,
    age: 130,
  },
  {
    title: '格式化并修复 Python 代码',
    body: 'ruff format . && ruff check --fix .',
    kind: 'command',
    collection: DAILY,
    tags: ['python', 'ruff'],
    useCount: 16,
    age: 110,
  },

  // --------------------------------------------------------------- prompts
  {
    title: '论文实验设计评审',
    body: [
      '你是一位严格的审稿人。下面是我的实验设计，请指出问题，不要夸奖。',
      '',
      '研究问题：{{question}}',
      '方法：{{method}}',
      '数据集：{{dataset}}',
      '评价指标：{{metrics}}',
      '',
      '请回答：',
      '1. 这个设计最大的三个漏洞是什么？',
      '2. 哪些结论是当前数据无法支撑的？',
      '3. 为了补齐漏洞，最小需要增加哪个对照实验？',
    ].join('\n'),
    kind: 'prompt',
    collection: null,
    tags: ['论文', '实验'],
    favorite: true,
    useCount: 9,
    age: 96,
  },
  {
    title: '代码审查',
    body: [
      '请审查下面的代码，只报告真实存在的问题，不要为了凑数而提建议。',
      '',
      '```{{language=python}}',
      '{{code}}',
      '```',
      '',
      '关注：正确性、边界条件、错误处理、命名。',
      '不要重写全部代码，只列出需要修改的位置和原因。',
    ].join('\n'),
    kind: 'prompt',
    collection: null,
    tags: ['代码', '审查'],
    useCount: 14,
    age: 80,
  },
  {
    title: '把段落改写为学术表达',
    body: [
      '把下面的段落改写为学术论文的语言，保持原意与事实不变，不要增加原文没有的信息，也不要夸大贡献。',
      '',
      '{{paragraph}}',
    ].join('\n'),
    kind: 'prompt',
    collection: null,
    tags: ['写作'],
    useCount: 6,
    age: 60,
  },
  {
    title: '解释报错',
    body: [
      '我遇到了下面的报错，请先解释根本原因，再给出修复方案。不要只贴代码。',
      '',
      '命令：{{command}}',
      '',
      '报错：',
      '{{error}}',
    ].join('\n'),
    kind: 'prompt',
    collection: null,
    tags: ['调试'],
    useCount: 11,
    age: 44,
  },

  // -------------------------------------------------------------- snippets
  {
    title: '固定随机种子',
    body: [
      'import random',
      '',
      'import numpy as np',
      'import torch',
      '',
      '',
      'def set_seed(seed: int = 42) -> None:',
      '    random.seed(seed)',
      '    np.random.seed(seed)',
      '    torch.manual_seed(seed)',
      '    torch.cuda.manual_seed_all(seed)',
    ].join('\n'),
    kind: 'snippet',
    language: 'python',
    collection: null,
    tags: ['python', '实验'],
    useCount: 22,
    age: 36,
  },
  {
    title: '逐行读取 JSONL',
    body: [
      'import json',
      '',
      '',
      'def read_jsonl(path: str):',
      '    with open(path, encoding="utf-8") as handle:',
      '        for line in handle:',
      '            line = line.strip()',
      '            if line:',
      '                yield json.loads(line)',
    ].join('\n'),
    kind: 'snippet',
    language: 'python',
    collection: null,
    tags: ['python', '数据'],
    useCount: 8,
    age: 28,
  },
  {
    title: '保存与加载 checkpoint',
    body: [
      'def save_checkpoint(path, model, optimizer, step):',
      '    torch.save(',
      '        {"model": model.state_dict(), "optimizer": optimizer.state_dict(), "step": step},',
      '        path,',
      '    )',
      '',
      '',
      'def load_checkpoint(path, model, optimizer=None):',
      '    state = torch.load(path, map_location="cpu")',
      '    model.load_state_dict(state["model"])',
      '    if optimizer is not None:',
      '        optimizer.load_state_dict(state["optimizer"])',
      '    return state["step"]',
    ].join('\n'),
    kind: 'snippet',
    language: 'python',
    collection: TRAINING,
    tags: ['python', '训练'],
    useCount: 12,
    age: 20,
  },
  {
    title: '带重试的 shell 函数',
    body: [
      'retry() {',
      '  local attempts=$1',
      '  shift',
      '  for i in $(seq 1 "$attempts"); do',
      '    "$@" && return 0',
      '    echo "第 $i 次失败，重试…" >&2',
      '    sleep 2',
      '  done',
      '  return 1',
      '}',
    ].join('\n'),
    kind: 'snippet',
    language: 'bash',
    collection: null,
    tags: ['bash'],
    useCount: 5,
    age: 14,
  },
  {
    title: '统计可训练参数量',
    body: [
      'def count_parameters(model) -> int:',
      '    return sum(p.numel() for p in model.parameters() if p.requires_grad)',
    ].join('\n'),
    kind: 'snippet',
    language: 'python',
    collection: null,
    tags: ['python', '模型'],
    useCount: 17,
    age: 8,
  },

  // ----------------------------------------------------------------- links
  {
    title: 'Hugging Face 模型库',
    body: 'https://huggingface.co/models',
    kind: 'link',
    collection: MODELS,
    tags: ['hf'],
    useCount: 31,
    age: 6,
  },
  {
    title: 'Papers with Code',
    body: 'https://paperswithcode.com/',
    kind: 'link',
    collection: null,
    tags: ['论文'],
    useCount: 9,
    age: 4,
  },
  {
    title: 'PyTorch 文档',
    body: 'https://pytorch.org/docs/stable/index.html',
    kind: 'link',
    collection: null,
    tags: ['python', '文档'],
    useCount: 24,
    age: 2,
  },
  {
    title: '本地项目目录',
    body: 'D:\\IDE\\vscode\\MyDemo',
    kind: 'path',
    collection: DAILY,
    tags: ['路径'],
    useCount: 7,
    age: 1,
  },
]

function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString()
}

export function buildSeedPayload(): ExportPayload {
  return {
    app: 'CommandShelf',
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    collections: [SERVER, MODELS, TRAINING, DAILY],
    items: SEED.map((item) => {
      const createdAt = isoHoursAgo(item.age)
      const useCount = item.useCount ?? 0
      return {
        title: item.title,
        body: item.body,
        kind: item.kind,
        language: item.language ?? null,
        collection: item.collection,
        tags: item.tags,
        favorite: item.favorite === true,
        useCount,
        // Anything that has been used was last used more recently than it was
        // created, which keeps "最近使用" and "最近创建" meaningfully different.
        lastUsedAt: useCount > 0 ? isoHoursAgo(Math.max(0.5, item.age / 2)) : null,
        createdAt,
        updatedAt: createdAt,
      }
    }),
  }
}

export function seedDemoData(db: DatabaseSync): TransferSummary {
  return applyImport(db, buildSeedPayload(), { skipDuplicates: true })
}

/** True when there is nothing to show yet — drives the first-run prompt. */
export function isEmpty(db: DatabaseSync): boolean {
  const row = db.prepare('SELECT COUNT(*) AS c FROM items').get() as { c: number } | undefined
  return Number(row?.c ?? 0) === 0
}
