---
title: ONNX 导出实验
sidebar_position: 7
---

# SmolVLA → ONNX 导出实验

目标：让模型脱离 Python 部署。结论是**可行，而且更快**。

## 四路实测（单帧 fp32）

| 路线 | 结果 | 稳态延迟 |
|---|---|---|
| torch CUDA（原路） | 基线 | 250–390 ms |
| torch CPU | 基线 | ~2700 ms |
| **ONNX + ORT CUDA** | ✅ 最快 | **211 ms** |
| ONNX + ORT CPU | ✅ | 856 ms |
| ONNX + ORT TensorRT | ❌ 需另装 TRT 11 | — |

数值等价：`max|diff| = 1.341e-06`。

## 工件

| 项 | 值 |
|---|---|
| 文件 | `smolvla_eager.onnx`（图 12 MB）+ `smolvla_eager.onnx.data`（权重 1.6 GB） |
| 合计 | **1.6 GB**（fp32）；>1 GB 权重被自动外置，**拷贝必须两个文件一起带** |
| IR / opset | IR=10，opset 18 |
| 导出耗时 | 427.9 s |

## 三个卡点

1. **传统导出必崩**：`dynamo=False` 在 `transformers` 的
   `create_bidirectional_mask → sdpa_mask` 里 `q_length.shape[0]` 抛 `IndexError`；
   把全部子模块 `_attn_implementation` 强改 `eager` 也无效。
2. **必须 `dynamo=True`**：走 `torch.export(strict=False)`，四阶段全绿；唯一缺的依赖是 `onnxscript`。
3. **onnxruntime-gpu 会静默回落 CPU**：报 `libcublasLt.so.13: cannot open shared object file`，
   需把 venv 的 `site-packages/nvidia/*/lib` 写进 `LD_LIBRARY_PATH`。

## 关键设计：噪声提成图输入

流匹配的初始噪声原本内部 `randn` 采样。`_get_action_chunk(batch, noise)` 已暴露该参数，
传一个 `(1, 50, 32)` 的零张量作为第 7 个输入 → 图变确定性，既能导出也能逐帧对拍。

## 计时陷阱

CUDA EP **首次推理 7972 ms** 是 kernel 自动调优，稳态才 211 ms。
不分首次与稳态，会得出"ONNX 更慢"的错误结论。

## 部署含义

211 ms/次 ≈ 4.7 Hz 出块；一块覆盖 1.67 s 指令，**2 Hz 刷新即可**。
1.6 GB fp32 工件可交给 C++ onnxruntime；**fp16 一版可望减半到约 800 MB**（未做）。
