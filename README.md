# Mr.IF — Butterfly Effect Financial Reasoning Agent

> **如果今天降温了，美股哪个板块会动？**

Mr.IF 是一个蝴蝶效应金融推理 Agent 工具包，打包为 MCP Server。
从日常事件出发，通过多学科因果推理链，推导美股（NYSE/NASDAQ）市场影响。

## Quick Start

```bash
# 安装依赖
npm install

# 构建
npm run build

# 运行
npm start

# 开发模式
npm run dev

# MCP Inspector 调试
npm run inspect
```

## 架构

```
┌───────────────────────────────────────────┐
│             Mr.IF Agent                    │
│          (系统提示词编排)                    │
├───────────────────────────────────────────┤
│  Mr.IF MCP 工具包 (本项目)                  │
│                                           │
│  mr_if_reason  一次调用，返回全部推理框架     │
│  ├─ 事件分类 + 推理方向                     │
│  ├─ 链条模板匹配 + 构建指引                  │
│  ├─ 历史先例搜索 (15个案例)                  │
│  ├─ 事件相关学科知识注入                     │
│  ├─ 验证框架 + 评分规则                     │
│  └─ 7-Gate推理纪律协议                      │
│                                           │
│  4个 Skill (MCP Resource)                  │
│  ├─ butterfly-effect-chain     方法论       │
│  ├─ cross-domain-reasoning     10学科知识   │
│  ├─ second-order-thinking      二阶思维     │
│  └─ reasoning-discipline       推理纪律     │
│                                           │
├───────────────────────────────────────────┤
│  外部已有工具 (提示词调度，不在本项目中)       │
│  行业映射 | 证券映射 | 取数 | 网络检索       │
│  贪婪先生 | DCF | 蒙特卡洛 | 折线图 | ...   │
└───────────────────────────────────────────┘
```

## 工作流

```
用户: "今天降温了"
  │
  Step 1: mr_if_reason(user_input)
  │  → 返回: 事件分类(weather) + 3-5个链条模板 + 历史案例(德州暴风雪等)
  │         + 天气相关学科知识(HDD锚点/常见错误) + 验证框架 + 7-Gate指令
  │
  Step 2: LLM在thinking中完成7-Gate推理（不调工具）
  │  Gate 1: 事件锚定 → 金融解读
  │  Gate 2: 构建3+条因果链（每步标注学科+强度+"因为"）
  │  Gate 3: 6维度打分验证
  │  Gate 4: 历史案例对照
  │  Gate 5: 多链汇合分析
  │  Gate 6: 二阶思维检测
  │  Gate 7: 10项出口检查
  │
  Step 3: 行业映射 → 证券映射 → 取数（外部已有工具）
  │
  Step 4: [按需] 网络检索、情绪数据、DCF估值、蒙特卡洛等
  │
  Step 5: 输出RIA风格回答 + Ticker Summary Table
```

## 1个MCP工具

| 工具 | 输入 | 输出 |
|------|------|------|
| `mr_if_reason` | 用户原始输入 + 可选日期 | Markdown格式: 事件分类、链条模板、历史案例、学科知识、验证框架、7-Gate指令 |

## 4个Skill (MCP Resource)

| Skill | 用途 |
|-------|------|
| `butterfly-effect-chain.md` | 蝴蝶效应三定律、12个推理模式、质量检查规则 |
| `cross-domain-reasoning.md` | 10大学科推理手册 + 量化锚点 + 常见错误 + 桥接矩阵 |
| `second-order-thinking.md` | 二阶思维框架、5个检测工具、逆向思维模板 |
| `reasoning-discipline.md` | 7-Gate推理纪律协议、反幻觉规则、出口检查清单 |

## 覆盖范围

**事件类型（9类）：** Physiological, Weather, Economic, Social, Technology, Policy, Nature, Daily Observation, Geopolitical

**学科知识（10个）：** 心理学, 生理学, 物理学, 化学, 经济学, 气象学, 社会学, 地缘政治, 供应链, 市场传导机制

**历史案例库（15个）：** COVID-2020, Texas Freeze 2021, Hurricane Katrina 2005, Russia-Ukraine 2022, Trade War 2018, Fed Pivot 2023, ChatGPT 2022, GME 2021, Fed Hike 2022, BTC ETF 2024, GLP-1/Ozempic 2023, Suez Canal 2021, SVB 2023, US Drought 2012

## 项目结构

```
mr.if/
├── src/
│   ├── index.ts                     # MCP Server 入口
│   └── tools/
│       └── mr-if-reason.ts          # 合一推理工具
├── skills/
│   ├── butterfly-effect-chain.md    # 蝴蝶效应推理方法论
│   ├── cross-domain-reasoning.md    # 10学科推理手册
│   ├── second-order-thinking.md     # 二阶思维框架
│   └── reasoning-discipline.md      # 7-Gate推理纪律
├── prompts/
│   └── system-prompt.md             # 完整系统提示词
├── package.json
├── tsconfig.json
└── README.md
```

## MCP 配置

在 MCP 配置中添加：

```json
{
  "mcpServers": {
    "mr-if": {
      "command": "node",
      "args": ["/path/to/mr.if/dist/index.js"]
    }
  }
}
```

## License

MIT
