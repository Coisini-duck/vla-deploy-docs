---
title: 桥接层 vla_bridge
sidebar_position: 4
---

# 桥接层：action chunk → 100 Hz

模型不是这部分，这部分是**真机部署真正要写的代码**。

```
fake_policy --/vla/action_chunk 10 Hz--> vla_bridge --/joint_targets 100 Hz--> 控制器 / 仿真
```

## 参数

| 参数 | 默认 | 含义 |
|---|---|---|
| `control_rate` | 100.0 | 控制拍频率 |
| `chunk_timeout` | 0.3 | 超过这么久没新 chunk → 保持最后指令 |
| `position_limit` | 1.5 | 关节位置限幅（rad） |
| `max_delta_per_tick` | 0.02 | 每拍最大增量（防跳变） |
| `dof` | 2 | 关节数（首次收块前使用） |
| `fixed_dof` | 0 | 强制输出维度；下游接口数固定时必须设 |

## 看门狗为什么是重点

模型挂掉时，桥**不能停发指令**（驱动会丢使能），也**不能外推**（会飞车），
只能保持最后位置并告警。实测：杀掉上游后控制仍以 **100.015 Hz** 运行，日志出现「看门狗触发」。

## 验收（verify.sh 第 6 节）

| 断言 | 实测 |
|---|---|
| chunk 频率 8–12 Hz | 9.998 Hz |
| 控制频率 | 99.995 Hz |
| 控制/块 比值 | 10.0 |
| 急停后输出全零并锁死 | ✅ |
| 杀掉上游后控制仍 ≥90 Hz | **100.015 Hz** |
| 看门狗日志出现 | ✅ |

## 跑起来

```bash
ros2 launch vla_bridge demo.launch.py
ros2 topic hz /joint_targets
ros2 topic pub --once /estop std_msgs/Bool "{data: true}"
```
