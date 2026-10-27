---
title: 系统架构
sidebar_position: 2
---

# 系统架构

## 为什么分四层

VLA 模型和真实执行器之间有三个**频率与语义都不匹配**的裂缝：

| 裂缝 | 现状 | 谁来解决 |
|---|---|---|
| 频率 | 模型 2 Hz，控制器 100 Hz | 桥接层重采样 |
| 语义 | 模型给"未来 50 步"，控制器要"当前这一拍" | 桥接层插值 + 队列 |
| 安全 | 模型可能输出 1.6 rad，关节限位 ±1.5 | 桥接层钳位 + 限速 |

分层之后，**换模型不改控制器，换控制器不改模型**——桥接层的输入永远是一个 `ActionChunk`。

## 消息契约

```text
sensor_interfaces/msg/ActionChunk
  int32    dof            # 关节数
  int32    n_steps        # 步数
  float64  dt             # 每步时长 (s)
  float64[] positions     # 扁平化：positions[i*dof : (i+1)*dof]
```

> rosidl 不支持嵌套数组（`float64[][]` 不存在），所以必须扁平化 + 带 `n_steps/dof`，
> 接收端切片 `positions[i*dof:(i+1)*dof]`，并校验 `len(positions) == n_steps * dof`。

## 数据流与时间尺度

```
t=0.00  smolvla_policy 出 chunk[50×6]，dt=1/30
t=0.30  vla_bridge 每 10 ms 取一帧（插值到 100 Hz）
t=1.67  这块 chunk 用完 → 上游已送来新块（2 Hz 刷新，余量 0.33 s）
```

一块 chunk 覆盖 1.67 s，上游只要 **2 Hz** 刷新就不会饿死；这也是 `chunk_timeout` 必须
≥ chunk 时长的原因（默认 0.3 s 会白丢 82% 的预测）。

## 安全分层

| 层 | 手段 | 触发条件 |
|---|---|---|
| 桥接层 | 位置限幅 `position_limit` | 每条指令 |
| 桥接层 | 每拍限速 `max_delta_per_tick` | 每条指令 |
| 桥接层 | 看门狗 `chunk_timeout` | 上游超时 → 保持最后位置（**不外推**） |
| 桥接层 | 急停 `/estop` | 收到 true → 全零并锁死 |
| 控制器 | 关节限位（URDF） | 硬件侧兜底 |
