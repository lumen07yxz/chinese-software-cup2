const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, PageBreak, LevelFormat, TableOfContents,
} = require("docx");

// ─── Color Palette ───
const BLUE = "1F4E79";
const LIGHT_BLUE = "D6E4F0";
const MID_BLUE = "2E75B6";
const DARK = "333333";
const GRAY = "666666";
const WHITE = "FFFFFF";

// ─── Reusable helpers ───
const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };

const PAGE_W = 11906; // A4
const PAGE_H = 16838;
const MARGIN = 1440;
const CONTENT_W = PAGE_W - 2 * MARGIN; // 9026

function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 200 },
    children: [new TextRun({ text, bold: true, font: "Microsoft YaHei", size: 32, color: BLUE })],
  });
}

function heading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 160 },
    children: [new TextRun({ text, bold: true, font: "Microsoft YaHei", size: 28, color: MID_BLUE })],
  });
}

function heading3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 120 },
    children: [new TextRun({ text, bold: true, font: "Microsoft YaHei", size: 24, color: DARK })],
  });
}

function bodyText(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120, line: 360 },
    alignment: opts.align || AlignmentType.JUSTIFIED,
    children: [new TextRun({ text, font: "Microsoft YaHei", size: 22, color: DARK, ...opts })],
  });
}

function boldBody(boldPart, normalPart) {
  return new Paragraph({
    spacing: { after: 120, line: 360 },
    children: [
      new TextRun({ text: boldPart, font: "Microsoft YaHei", size: 22, color: DARK, bold: true }),
      new TextRun({ text: normalPart, font: "Microsoft YaHei", size: 22, color: DARK }),
    ],
  });
}

function emptyLine() {
  return new Paragraph({ spacing: { after: 80 }, children: [] });
}

function makeHeaderRow(texts, widths) {
  return new TableRow({
    children: texts.map((t, i) =>
      new TableCell({
        borders,
        width: { size: widths[i], type: WidthType.DXA },
        shading: { fill: BLUE, type: ShadingType.CLEAR },
        margins: cellMargins,
        verticalAlign: "center",
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: t, bold: true, font: "Microsoft YaHei", size: 20, color: WHITE })],
          }),
        ],
      })
    ),
  });
}

function makeRow(texts, widths, shaded = false) {
  return new TableRow({
    children: texts.map((t, i) =>
      new TableCell({
        borders,
        width: { size: widths[i], type: WidthType.DXA },
        shading: shaded ? { fill: "F2F7FB", type: ShadingType.CLEAR } : undefined,
        margins: cellMargins,
        children: [
          new Paragraph({
            children: [new TextRun({ text: t, font: "Microsoft YaHei", size: 20, color: DARK })],
          }),
        ],
      })
    ),
  });
}

// ─── Architecture diagram as formatted text ───
function archDiagram() {
  const lines = [
    "┌──────────────────────────────────────────────────────────┐",
    "│                   前端 (React 19 + TypeScript)             │",
    "│         Vite 8 + Tailwind CSS 4 + Zustand 5              │",
    "│       Markdown / KaTeX / Mermaid / Prism.js 多模态渲染     │",
    "└─────────────────────────┬────────────────────────────────┘",
    "                          │  RESTful API + SSE 流式",
    "┌─────────────────────────┴────────────────────────────────┐",
    "│                后端 (Python FastAPI)                      │",
    "│         SQLAlchemy async + SQLite + ChromaDB              │",
    "└─────────────────────────┬────────────────────────────────┘",
    "            ┌─────────────┼─────────────┐",
    "            ▼             ▼             ▼",
    "     讯飞星火大模型   星火Embedding   DuckDuckGo/Bing",
    "     (spark-x 对话)   (1024维向量)    (联网搜索补充)",
  ];
  return lines.map(
    (l) =>
      new Paragraph({
        spacing: { after: 0, line: 260 },
        alignment: AlignmentType.LEFT,
        children: [new TextRun({ text: l, font: "Consolas", size: 18, color: DARK })],
      })
  );
}

// ─── Multi-agent pipeline diagram ───
function pipelineDiagram() {
  const lines = [
    "用户请求 → ResourceCoordinator（编排器）",
    "    ├── Step 1: RAG 检索助手 → 课程知识库向量检索",
    "    ├── Step 2: Orchestrator Agent → 需求分析 + 资源规划",
    "    ├── Step 3: 专业 Agent → 内容生成（doc/mindmap/quiz/video/code）",
    "    └── Step 4: 安全审查 Agent → 正则过滤 + LLM-as-judge",
    "",
    "输出 → SSE 流式推送到前端 + Agent 状态面板实时展示",
  ];
  return lines.map(
    (l) =>
      new Paragraph({
        spacing: { after: 0, line: 280 },
        children: [new TextRun({ text: l, font: "Consolas", size: 18, color: DARK })],
      })
  );
}

// ─── Build the document ───
const children = [];

// ═══ Title Page ═══
children.push(emptyLine(), emptyLine(), emptyLine(), emptyLine(), emptyLine());
children.push(
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: "智学", font: "Microsoft YaHei", size: 56, bold: true, color: BLUE })],
  })
);
children.push(
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [new TextRun({ text: "AI 个性化学习系统", font: "Microsoft YaHei", size: 40, color: MID_BLUE })],
  })
);
children.push(emptyLine());
children.push(
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 60 },
    children: [new TextRun({ text: "技术路线说明书", font: "Microsoft YaHei", size: 36, bold: true, color: DARK })],
  })
);
children.push(emptyLine(), emptyLine(), emptyLine());
children.push(
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "2026 年 6 月", font: "Microsoft YaHei", size: 24, color: GRAY })],
  })
);
children.push(new Paragraph({ children: [new PageBreak()] }));

// ═══ TOC ═══
children.push(
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 300 },
    children: [new TextRun({ text: "目  录", font: "Microsoft YaHei", size: 32, bold: true, color: BLUE })],
  })
);
children.push(
  new TableOfContents("Table of Contents", {
    hyperlink: true,
    headingStyleRange: "1-3",
  })
);
children.push(new Paragraph({ children: [new PageBreak()] }));

// ═══ 一、整体架构 ═══
children.push(heading1("一、整体架构"));
children.push(bodyText("智学系统采用前后端分离的 B/S 架构，以大模型为核心驱动，构建了包含多智能体协作、个性化画像、知识图谱、RAG 检索、流式交互、安全过滤六大技术模块的完整技术体系。"));
children.push(emptyLine());
children.push(heading2("1.1 系统架构图"));
children.push(emptyLine());
children.push(...archDiagram());
children.push(emptyLine());

children.push(heading2("1.2 技术栈总览"));
const techWidths = [1800, 3600, 3626];
children.push(
  new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: techWidths,
    rows: [
      makeHeaderRow(["层级「, 」技术「, 」说明"], techWidths),
      makeRow(["前端", "React 19 + TypeScript + Vite 8", "现代化前端框架，极速热更新"], techWidths),
      makeRow(["UI 框架", "Tailwind CSS 4 + Zustand 5", "原子化样式 + 轻量状态管理"], techWidths, true),
      makeRow(["后端", "Python FastAPI + SQLAlchemy async", "高性能异步 Web 框架"], techWidths),
      makeRow(["数据库", "SQLite + ChromaDB", "关系数据 + 向量检索双引擎"], techWidths, true),
      makeRow(["LLM 服务「, 」科大讯飞星火大模型（spark-x）", "对话/生成/辅导核心引擎"], techWidths),
      makeRow(["Embedding", "星火 Embedding API（1024 维）", "文本向量化，驱动语义检索"], techWidths, true),
      makeRow(["认证", "JWT（python-jose + bcrypt）", "无状态令牌认证体系"], techWidths),
      makeRow(["渲染", "KaTeX + Mermaid + Prism.js", "数学公式/图表/代码高亮"], techWidths, true),
    ],
  })
);
children.push(new Paragraph({ children: [new PageBreak()] }));

// ═══ 二、核心技术路线 ═══
children.push(heading1("二、核心技术路线"));
children.push(bodyText("本系统围绕六大核心技术路线展开，形成完整的技术闭环。以下逐一说明各技术路线的设计思路与实现方案。"));

// ─── 2.1 多智能体 ───
children.push(heading2("2.1 多智能体协作系统"));
children.push(bodyText("多智能体协作是本系统的核心创新点。系统采用 Coordinator 编排 + 多 Agent 流水线模式，由不同角色的智能体分工协作，完成学习资源的自动化生成。"));
children.push(emptyLine());
children.push(heading3("架构设计"));
children.push(...pipelineDiagram());
children.push(emptyLine());

children.push(heading3("Agent 角色分工"));
const agentWidths = [1600, 2200, 5226];
children.push(
  new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: agentWidths,
    rows: [
      makeHeaderRow(["Agent", "职责「, 」技术实现"], agentWidths),
      makeRow(["RAG 检索助手「, 」课程知识库语义检索", "ChromaDB 向量检索 + 星火 Embedding 1024 维"], agentWidths),
      makeRow(["Orchestrator", "需求分析 + 资源规划", "LLM 分析用户画像，规划资源结构与难度"], agentWidths, true),
      makeRow(["专业 Agent", "内容生成「, 」按类型（doc/mindmap/quiz/video/code）专项生成"], agentWidths),
      makeRow(["安全审查 Agent", "内容安全过滤", "10 类正则模式 + LLM-as-judge 双层审查"], agentWidths, true),
    ],
  })
);
children.push(emptyLine());
children.push(bodyText("核心流程：ResourceCoordinator 接收用户请求后，依次调用四个 Agent，每步结果传递给下一步。整个过程通过 SSE 流式输出，前端实时展示各 Agent 工作状态（检索中→规划中→生成中→审查中），用户可即时感知生成进度。"));

// ─── 2.2 学习画像 ───
children.push(heading2("2.2 对话式学习画像自主构建"));
children.push(bodyText("系统实现了基于对话的 6 维学习画像自主构建，符合赛题「对话式学习画像自主构建」的核心要求。"));
children.push(emptyLine());

children.push(heading3("六维画像体系"));
const profileWidths = [1800, 2400, 4826];
children.push(
  new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: profileWidths,
    rows: [
      makeHeaderRow(["维度「, 」数据类型「, 」说明"], profileWidths),
      makeRow(["知识基础", "JSON（子领域→掌握度 0-1）", "10 章各知识点掌握程度，量化评估"], profileWidths),
      makeRow(["认知风格", "String", "visual / verbal / active / reflective 四种类型"], profileWidths, true),
      makeRow(["易错点", "JSON（列表）", "自动从做题记录中诊断薄弱知识点"], profileWidths),
      makeRow(["学习目标", "Text", "用户自定义的学习目标描述"], profileWidths, true),
      makeRow(["可用时间", "String", "每日可投入学习的时间范围"], profileWidths),
      makeRow(["兴趣方向", "JSON（列表）", "感兴趣的 AI 子领域方向"], profileWidths, true),
    ],
  })
);
children.push(emptyLine());

children.push(heading3("画像提取机制"));
children.push(bodyText("ProfileCoordinator 编排器在每轮对话后自动调用 LLM 进行结构化提取，更新画像并写入数据库。系统采用动态节流策略：画像完整度低时每轮提取，完整后降频到每 3-5 轮一次，平衡提取精度与性能开销。画像数据通过 SSE 实时推送到前端，支持「随学随新」的动态更新。"));

// ─── 2.3 知识图谱 ───
children.push(heading2("2.3 知识图谱与个性化学习路径"));
children.push(bodyText("系统以「人工智能导论」课程为内容，构建了包含 10 章完整知识体系的 DAG（有向无环图）知识图谱，并基于拓扑排序与画像权重生成个性化学习路径。"));
children.push(emptyLine());

children.push(heading3("知识图谱构建"));
children.push(bodyText("知识图谱采用 DAG 结构，节点代表章节，边代表前置依赖关系。使用 Kahn 算法进行拓扑排序，确定合理的学习顺序。每个节点包含章节目标、核心概念、难度系数、预估学习时长等元信息。"));
children.push(emptyLine());

children.push(heading3("个性化路径排序"));
children.push(bodyText("在拓扑排序基础上，系统根据学生画像中的知识掌握度对路径进行动态权重调整。已掌握的节点权重降低（可跳过或快速复习），薄弱节点权重提高（推荐优先学习），实现「因材施教」的个性化路径规划。"));
children.push(emptyLine());

children.push(heading3("前端交互"));
children.push(bodyText("学习路径前端采用分层 DAG 可视化布局，支持 hover 高亮关联节点、鼠标滚轮缩放、拖拽平移等交互操作。点击节点弹出详情面板，展示学习目标、核心概念、难度、推荐资源、预估时长等信息，并提供「章节测评」入口。"));

// ─── 2.4 RAG ───
children.push(heading2("2.4 RAG 检索增强生成"));
children.push(bodyText("RAG（Retrieval-Augmented Generation）是系统实现高质量内容生成和智能辅导的关键技术。"));
children.push(emptyLine());

children.push(heading3("向量检索"));
children.push(bodyText("课程文档经分块处理后，通过星火 Embedding API 生成 1024 维向量，存入 ChromaDB 向量数据库。用户提问时，系统将问题向量化后进行语义相似度检索，召回最相关的文档片段。"));
children.push(emptyLine());

children.push(heading3("联网搜索补充"));
children.push(bodyText("系统集成 DuckDuckGo + Bing 双通道联网搜索能力，作为 RAG 的补充来源。在资源生成和智能辅导场景中，当知识库内容不足时，自动检索互联网最新资料，确保内容的时效性和完整性。"));
children.push(emptyLine());

children.push(heading3("来源引用"));
children.push(bodyText("在智能辅导场景中，RAG 检索结果透传章节和来源元数据，Prompt 要求 LLM 在回答中标注 [1][2] 等来源编号，用户可追溯信息出处，提升可信度。"));

// ─── 2.5 SSE ───
children.push(heading2("2.5 SSE 流式交互体系"));
children.push(bodyText("系统所有 AI 生成接口统一采用 Server-Sent Events（SSE）流式输出，实现打字机效果的实时内容呈现，显著提升用户体验。"));
children.push(emptyLine());

children.push(heading3("SSE 事件协议"));
const sseWidths = [2400, 3200, 3426];
children.push(
  new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: sseWidths,
    rows: [
      makeHeaderRow(["事件类型「, 」用途「, 」场景"], sseWidths),
      makeRow(["text", "文本内容流式输出「, 」所有 AI 生成接口"], sseWidths),
      makeRow(["agent_status", "Agent 工作状态更新「, 」资源生成（检索/规划/生成/审查）"], sseWidths, true),
      makeRow(["profile_update", "画像数据实时推送「, 」对话式画像提取"], sseWidths),
      makeRow(["done", "生成完成信号「, 」所有流式接口"], sseWidths, true),
      makeRow(["error", "错误信息「, 」异常情况通知"], sseWidths),
      makeRow(["warning", "警告信息「, 」非致命性提示"], sseWidths, true),
    ],
  })
);
children.push(emptyLine());

children.push(heading3("前端渲染管线"));
children.push(bodyText("前端采用统一的 readSSEStream 解析器处理所有 SSE 流，支持 Markdown 实时渲染（react-markdown）、数学公式（KaTeX）、图表（Mermaid）、代码高亮（Prism.js）等多模态内容的流式呈现。资源生成场景下，Agent 状态面板实时展示四个 Agent 的工作进度。"));

// ─── 2.6 安全过滤 ───
children.push(heading2("2.6 安全过滤双层机制"));
children.push(bodyText("系统实现了双层内容安全审查机制，确保 AI 生成内容的安全性和合规性。"));
children.push(emptyLine());

children.push(heading3("第一层：正则模式过滤"));
children.push(bodyText("系统内置 10 类正则表达式模式，覆盖政治敏感、暴力恐怖、色情低俗、个人隐私、违法信息、歧视言论、虚假信息、危险行为、商业广告、版权侵犯等类别。所有 AI 输出首先经过正则快速过滤，拦截明显的不安全内容。"));
children.push(emptyLine());

children.push(heading3("第二层：LLM-as-judge"));
children.push(bodyText("正则过滤后的内容交由大模型进行二次安全审查。LLM 作为「裁判」，对内容的上下文语义进行深度理解，判断是否存在正则无法捕获的隐含安全风险。"));
children.push(emptyLine());

children.push(heading3("Fail-closed 设计"));
children.push(bodyText("安全审查采用 Fail-closed（默认拒绝）策略：当正则匹配命中时直接拒绝；当 LLM 审查出现异常时同样拒绝放行并记录 ERROR 日志。确保在任何故障场景下都不会输出不安全内容。"));
children.push(new Paragraph({ children: [new PageBreak()] }));

// ═══ 三、关键技术创新点 ═══
children.push(heading1("三、关键技术创新点"));
children.push(bodyText("以下为本系统的核心技术创新点及其与赛题评分维度的对应关系："));
children.push(emptyLine());

const innovationWidths = [600, 2600, 2800, 3026];
children.push(
  new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: innovationWidths,
    rows: [
      makeHeaderRow(["序号「, 」创新点「, 」对应赛题要求「, 」评分维度"], innovationWidths),
      makeRow(["1", "多 Agent 协作编排（4 Agent 流水线）", "多智能体协同资源生成「, 」创新价值 35%"], innovationWidths),
      makeRow(["2", "6 维动态画像 + 动态节流提取「, 」对话式画像自主构建「, 」功能实现 45%"], innovationWidths, true),
      makeRow(["3", "DAG 拓扑排序 + 画像权重路径「, 」个性化学习路径规划「, 」创新价值 35%"], innovationWidths),
      makeRow(["4", "RAG + 联网搜索双通道检索「, 」智能辅导（加分项）", "加分项 10%"], innovationWidths, true),
      makeRow(["5", "SSE 全链路流式 + Agent 状态面板「, 」响应效率「, 」非功能需求"], innovationWidths),
      makeRow(["6", "正则 + LLM-as-judge 双层安全审查「, 」内容安全过滤「, 」非功能需求"], innovationWidths, true),
    ],
  })
);
children.push(new Paragraph({ children: [new PageBreak()] }));

// ═══ 四、技术选型理由 ═══
children.push(heading1("四、技术选型理由"));
children.push(bodyText("系统各技术选型均经过充分调研与对比，以下为核心技术的选型理由："));
children.push(emptyLine());

const choiceWidths = [1800, 2400, 4826];
children.push(
  new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: choiceWidths,
    rows: [
      makeHeaderRow(["技术「, 」选择「, 」选型理由"], choiceWidths),
      makeRow(["LLM 服务「, 」科大讯飞星火大模型「, 」国产大模型，赛事友好；Embedding + Chat 一体；API 稳定可靠"], choiceWidths),
      makeRow(["向量数据库", "ChromaDB", "轻量级嵌入式向量库，无需额外部署；与 Python 生态深度集成"], choiceWidths, true),
      makeRow(["关系数据库", "SQLite", "零配置嵌入式数据库；满足比赛单机部署场景；async 驱动成熟"], choiceWidths),
      makeRow(["Web 框架", "FastAPI", "原生 async/await 支持；内置 SSE 流式响应；自动 API 文档生成"], choiceWidths, true),
      makeRow(["前端框架", "React 19", "生态成熟，组件丰富；流式数据更新性能优异；TypeScript 类型安全"], choiceWidths),
      makeRow(["状态管理", "Zustand 5", "轻量简洁，无 Boilerplate；对 SSE 数据流友好；学习成本低"], choiceWidths, true),
      makeRow(["样式框架", "Tailwind CSS 4", "原子化 CSS，快速原型开发；深色模式支持；响应式适配便捷"], choiceWidths),
    ],
  })
);
children.push(new Paragraph({ children: [new PageBreak()] }));

// ═══ 五、系统部署架构 ═══
children.push(heading1("五、系统部署架构"));
children.push(bodyText("系统面向比赛演示场景设计，采用开箱即用的本地部署方案，无需 Docker/K8s 等复杂运维环境。"));
children.push(emptyLine());

children.push(heading2("5.1 部署拓扑"));
const deployWidths = [2000, 2400, 4626];
children.push(
  new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: deployWidths,
    rows: [
      makeHeaderRow(["组件「, 」部署方式「, 」说明"], deployWidths),
      makeRow(["前端", "Vite dev server", "localhost:5173，支持热更新"], deployWidths),
      makeRow(["后端", "Uvicorn ASGI", "localhost:8000，Python 异步服务器"], deployWidths, true),
      makeRow(["关系数据库", "SQLite（嵌入式）", "零配置，数据文件随项目存储"], deployWidths),
      makeRow(["向量数据库", "ChromaDB（嵌入式）", "嵌入 Python 进程，无独立服务"], deployWidths, true),
      makeRow(["AI 服务「, 」讯飞星火云端 API", "网络调用，无需本地 GPU"], deployWidths),
      makeRow(["联网搜索", "DuckDuckGo + Bing", "免费 API，无需申请密钥"], deployWidths, true),
    ],
  })
);
children.push(emptyLine());

children.push(heading2("5.2 快速启动"));
children.push(bodyText("系统提供一键启动脚本，两个命令即可完成环境搭建："));
children.push(emptyLine());

const steps = [
  "cd backend && pip install -r requirements.txt && python main.py",
  "cd frontend && npm install && npm run dev",
];
steps.forEach((s, i) => {
  children.push(
    new Paragraph({
      spacing: { after: 80, line: 320 },
      children: [
        new TextRun({ text: `Step ${i + 1}：`, font: "Microsoft YaHei", size: 22, bold: true, color: MID_BLUE }),
        new TextRun({ text: s, font: "Consolas", size: 20, color: DARK }),
      ],
    })
  );
});
children.push(emptyLine());

children.push(heading2("5.3 开源工具标注"));
children.push(bodyText("本系统使用的所有开源工具及其协议已在开发说明书中详细标注，前端 12 项、后端 10 项开源依赖均为 MIT / Apache-2.0 / BSD 协议，可自由使用和分发。"));

// ═══ Build ═══
const doc = new Document({
  styles: {
    default: {
      document: { run: { font: "Microsoft YaHei", size: 22 } },
    },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Microsoft YaHei", color: BLUE },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 },
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Microsoft YaHei", color: MID_BLUE },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 },
      },
      {
        id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Microsoft YaHei", color: DARK },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 },
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: PAGE_W, height: PAGE_H },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "智学 AI 个性化学习系统 — 技术路线说明书", font: "Microsoft YaHei", size: 18, color: GRAY })],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "— ", font: "Microsoft YaHei", size: 18, color: GRAY }),
                new TextRun({ children: [PageNumber.CURRENT], font: "Microsoft YaHei", size: 18, color: GRAY }),
                new TextRun({ text: " —", font: "Microsoft YaHei", size: 18, color: GRAY }),
              ],
            }),
          ],
        }),
      },
      children,
    },
  ],
});

// ─── Write file ───
Packer.toBuffer(doc).then((buffer) => {
  const outPath = "e:/chinese.software.cup2/智学技术路线说明书.docx";
  fs.writeFileSync(outPath, buffer);
  console.log(`Done: ${outPath}`);
});
