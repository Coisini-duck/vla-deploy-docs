---
title: 项目简介
sidebar_position: 1
slug: /
---

# VLA 真机部署侧 Demo

> 在**没有机器人、没有相机**的条件下，把 VLA 模型的输出接到真实控制器，并测出跟踪误差。

这个项目不追求策略效果（模型输出的是合成图像下的动作），追求的是**部署侧的可验证性**：
模型每 0.3 秒吐一块 50 步的关节位置，怎么把它变成 100 Hz 的平滑指令、怎么限幅限速、
模型挂掉时怎么不飞车、最后怎么证明"控制器真的跟上了"。

## 四层链路

```
策略层   SmolVLA 450M (lerobot/smolvla_base)        ── /vla/action_chunk  2 Hz
   │
桥接层   vla_bridge 插值 / 限幅 / 限速 / 看门狗 / 急停  ── /joint_targets   100 Hz
   │
控制层   ros2_control + forward_position_controller  ── 6 轴，±1.5 rad
   │
反馈层   /joint_states → /vla/tracking_error         ── 指令 − 实际
```

## 硬数字

| 指标 | 实测 |
|---|---|
| 模型推理 | 0.25–0.39 s/次（热态），显存 **0.90 GB** |
| chunk 频率 | **2.018 Hz**（50 步 × 1/30 s = 1.67 s 覆盖） |
| 控制频率 | **99.996 Hz** |
| 限幅生效 | 模型输出 1.6 rad → 执行器最大 **1.500 rad** |
| 跟踪误差 | 均值 **4.7 mrad** / 峰值 **33.6 mrad** |
| 回归断言 | **12 节 51 项全 PASS**（严格档/满负载档双档） |
| ONNX 导出 | 可行，ORT CUDA **211 ms**（原生 torch 250–390 ms） |

## 环境

| 项 | 版本 |
|---|---|
| OS | WSL Ubuntu 24.04 |
| ROS 2 | Jazzy |
| GPU | RTX 5060 Laptop 8 GB（sm_120 / Blackwell） |
| 模型栈 | lerobot 0.6.1 + PyTorch 2.14 cu130 |
| 主库 | `/root/ros2_ws`（ext4，纯 ASCII 路径） |

## 边界（明确没做）

- **无真机**：`mock_components/GenericSystem` 只镜像命令，驱动层限幅未验证；
- **无相机**：模型输入是合成图像，输出不代表真实语义；
- **未接 Gazebo**：没有动力学与碰撞。
