---
title: TensorRT 加速
sidebar_position: 8.5
---

# TensorRT 加速（ORT TensorRT EP）

把 11,640 个节点交给 TensorRT 融合，是这个项目里**唯一出现数量级差别**的优化。

## 四路对比（同一帧、确定性输入）

| 路线 | 装载/构建 | 稳态单次 | 相对 CUDA EP | 数值（vs fp32 CUDA） |
|---|---|---|---|---|
| CUDA EP（原生 ONNX） | 4.5–6.5 s | **240–282 ms** | 1× | 基准 |
| **TRT fp32 首次** | **171.7 s**（构建 engine） | **87 ms** | **2.88×** | max\|diff\| 1.14e-03 |
| **TRT fp32 二次**（命中缓存） | **14.7 s** | **92 ms** | **2.67×** | 同上（两轮完全一致） |
| **TRT fp16** | 137.9 s | **76 ms** | **3.43×** | max\|diff\| 1.45e-03 |

对照更早的数据：torch CUDA 250–390 ms、ORT CPU 856 ms。

## 三个关键事实

1. **fp16 走 TRT 没问题，走 ORT 转换器却崩了**（见 [ONNX 实验](/onnx)）。
   原因：TensorRT 自己决定每层精度并保留敏感层，而不是把整图一刀切成 half。
2. **engine 缓存必须靠 provider options 才会写盘**（`trt_engine_cache_enable`），
   塞进 `SessionOptions` 只会静默失败 —— 表现为每轮都重建 150 s、缓存目录永远 0 MB。
3. **engine 不是通用工件**：`v3_fp32_..._sm120.engine` 1518 MB，绑定 **GPU 架构（sm120）+ TensorRT 版本（10.16）+ 图结构**。
   换卡、升级 TRT、改 shape 都要重建。

## 用法

```python
import onnxruntime as ort

trt = {
    'trt_engine_cache_enable': True,
    'trt_engine_cache_path': '/root/models/smolvla_onnx/trt_cache',
    'trt_engine_cache_prefix': 'v3_fp32',
    'trt_fp16_enable': False,
    'trt_builder_optimization_level': 3,
    'trt_max_workspace_size': 4 << 30,
}
sess = ort.InferenceSession(
    'smolvla_merged.onnx',
    providers=[('TensorrtExecutionProvider', trt),   # ← 必须这样传
               'CUDAExecutionProvider', 'CPUExecutionProvider'],
)
```

前提：TensorRT 大版本要配 ORT 编译时用的版本。本机 **ORT 1.31.1 需要 `libnvinfer.so.10`**，
所以装 `tensorrt-cu13==10.16.1.11`（**不是** 11.x），并把 `tensorrt_libs` 加进 `LD_LIBRARY_PATH`。

## 对部署的意义

92 ms/次 ≈ **10.9 Hz** 出块，而一块 chunk 覆盖 1.67 s、上游 2 Hz 刷新就够 —— 余量从「够用」变成「很宽」。
代价是首次部署要付一次 ~3 分钟的 engine 构建（可预烧进镜像），以及 engine 与硬件绑定。

## 接进 ROS 节点（全栈实测）

`smolvla_policy.py` 加了 `backend` 参数（也可用环境变量 `SMOLVLA_BACKEND`）：

| 后端 | 单次推理 | chunk 频率 | 跟踪误差均值 | 装载 |
|---|---|---|---|---|
| `torch`（默认） | 0.25–0.39 s | **1.90–2.02 Hz** | 0.0116 rad | 约 7 s |
| **`onnx`（TRT）** | **0.072–0.154 s** | **7.97–8.01 Hz** | **0.0007 rad** | 14.2–15.2 s（命中缓存） |

```bash
SMOLVLA_BACKEND=onnx HF_HUB_OFFLINE=1 \
  /root/venvs/vla/bin/python smolvla_policy.py --ros-args -p chunk_rate:=8.0
```

节点启动时会做一次**数值对齐自检**：同一批次分别喂 torch 与 onnx，打印 `max|diff|`。
实测 **9.091e-03**（torch 侧走 bf16、ONNX 是 fp32，这个量级正常），超过 1e-2 才告警。

> 跟踪误差从 0.0116 降到 0.0007，不是模型变准了，而是**块来得更密**：
> 8 Hz 下每块只推进 1/8 s，桥的限速滞后来不及累积。

## 两个坑（都踩过）

| 现象 | 真因 | 修法 |
|---|---|---|
| TRT "生效"但只快 1.09×、缓存 0 MB、`max|diff|` 恰好 0 | 装的是 TRT 11，ORT 要 TRT 10 → **静默回退到 CUDA** | 装 `tensorrt-cu13==10.16.1.11` |
| 缓存目录一直空、每轮重建 150 s | `trt_*` 参数写进了 `SessionOptions`，TRT EP 不读那里 | 改成 provider options 元组传参 |
| 计时出现负数（CUDA 基线 −597 ms） | WSL 时钟会跳，`time.time()` 不可靠 | 用 `time.perf_counter()` |
