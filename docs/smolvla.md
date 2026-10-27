---
title: 真模型 SmolVLA
sidebar_position: 6
---

# 接入真模型：SmolVLA

```
smolvla_policy.py --/vla/action_chunk 2 Hz--> vla_bridge --/joint_targets 100 Hz--> 控制器
```

| 项 | 值 |
|---|---|
| 模型 | `lerobot/smolvla_base`（865 MB，底座 SmolVLM2-500M） |
| 动作 | `[6]`，`chunk_size=50`，`dt=1/30` |
| 实测 | 热态 **0.25–0.39 s/次**，显存 **0.90 GB**，chunk **1.98 Hz** → 桥 **99.99 Hz** |

## 必须改的参数

```bash
ros2 run vla_bridge bridge --ros-args -p dof:=6 -p chunk_timeout:=2.0
```

默认 `chunk_timeout=0.3` 会在 0.3 s 后就"保持"，**白丢 1.37 s 的有效预测**
（一块 50×33.3 ms = 1.67 s）。改 2.0 后 `holds=0`，控制 100.007 Hz。

## 五条 lerobot 坑

| 现象 | 真因 | 修法 |
|---|---|---|
| `KeyError: 'observation.language.tokens'` | 裸 dict 喂 `predict_action_chunk` | 必须走 `make_smolvla_pre_post_processors` 的 6 步链 |
| `mat1 and mat2 must have same dtype` | dtype 一刀切 | 视觉编码器 bf16、`state_proj` fp32 |
| `(b,c,h,w) expected, got [256,256,3]` | 图像布局 | 自己转 HWC→CHW + batch 维 |
| HF 下载 401 | Xet 存储对镜像不支持 | `HF_HUB_DISABLE_XET=1` |
| 卡 91 秒 | 镜像限流 | 缓存齐后 `HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1` |

## 跑

```bash
source /opt/ros/jazzy/setup.bash && source /root/ros2_ws/install/setup.bash
export HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1
/root/venvs/vla/bin/python /root/ros2_ws/tools/smolvla_policy.py &
ros2 run vla_bridge bridge --ros-args -p dof:=6 -p chunk_timeout:=2.0
```
