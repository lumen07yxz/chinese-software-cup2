"""快速预览：生成一份样例 PPT，不调用 LLM"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE

from services.local_ppt_service import (
    WHITE, INK, ACCENT, GRAY, LIGHTGRAY, FONT_BODY,
    _set_bg, _add_rect, _set_font,
    _add_cover_slide, _add_content_slide, _add_ending_slide,
)

SAMPLE = {
    "slides": [
        {"type": "cover", "title": "Transformer 架构详解", "subtitle": "从注意力机制到大语言模型的演进之路"},
        {"type": "content", "title": "背景与动机：为什么需要 Transformer", "bullets": [
            "传统 RNN 存在长距离依赖瓶颈，序列建模效率低下",
            "注意力机制允许模型直接关注输入序列中的任意位置",
            "2017 年 Google 论文 Attention is All You Need 开创先河",
            "一举奠定 NLP、CV、多模态等领域的架构基础",
            "彻底告别 RNN/CNN 混合架构，开启纯注意力时代",
        ]},
        {"type": "content", "title": "Self-Attention 核心机制", "bullets": [
            "输入经过线性变换得到 Q（查询）、K（键）、V（值）三个矩阵",
            "核心公式：Attention(Q,K,V) = softmax(QKᵀ/√dₖ) · V",
            "多头注意力并行捕获不同子空间的语义关系",
            "缩放因子 √dₖ 防止点积过大导致梯度消失",
            "📊  [图表: Self-Attention 计算流程图]",
        ]},
        {"type": "content", "title": "编码器与解码器架构", "bullets": [
            "编码器：多层 Self-Attention + FFN，输出上下文表示",
            "解码器：Masked Attention 防止信息泄漏，自回归生成",
            "交叉注意力（Cross-Attention）连接编码器与解码器",
            "残差连接 + LayerNorm 保证深层网络训练稳定性",
            "每层 FFN 提供非线性变换能力，增强表达力",
        ]},
        {"type": "content", "title": "位置编码：让 Transformer 理解顺序", "bullets": [
            "Transformer 本身无内建序列位置感知能力",
            "原始方案：正弦/余弦函数生成绝对位置编码",
            "RoPE 旋转位置编码：支持长度外推，效果更优",
            "ALiBi 方案：无需训练额外参数，泛化性更强",
            "📊  [图表: 不同位置编码方案对比]",
        ]},
        {"type": "content", "title": "从 GPT 到 ChatGPT 的演进", "bullets": [
            "GPT 系列：纯解码器 + 自回归语言建模",
            "GPT-3 展示 few-shot 上下文学习能力（175B 参数）",
            "InstructGPT 引入 RLHF 人类反馈强化学习",
            "ChatGPT 标志大模型从实验室走向产品化落地",
        ]},
        {"type": "content", "title": "Transformer 的未来方向", "bullets": [
            "稀疏注意力：降低计算复杂度，支持超长序列",
            "Mixture of Experts（MoE）：动态激活部分参数",
            "多模态统一架构：文本、图像、音频、视频一体化",
            "端侧部署：模型量化 + 蒸馏，适配移动设备",
        ]},
        {"type": "ending", "title": "谢谢", "subtitle": "Questions & Discussion"},
    ]
}

prs = Presentation()
prs.slide_width = Inches(10)
prs.slide_height = Inches(7.5)

content_slides = [s for s in SAMPLE["slides"] if s.get("type") == "content"]
total = len(content_slides)
page_num = 1

for sd in SAMPLE["slides"]:
    t = sd.get("type", "content")
    if t == "cover":
        _add_cover_slide(prs, sd)
    elif t == "ending":
        _add_ending_slide(prs, sd)
    else:
        _add_content_slide(prs, sd, page_num, total)
        page_num += 1

out = os.path.join(os.path.dirname(__file__), "preview_v2.pptx")
prs.save(out)
print(f"OK -> {out}")
