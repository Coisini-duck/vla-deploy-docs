---
title: 控制层 ros2_control
sidebar_position: 5
---

# 控制层：6 轴臂 + ros2_control（mock 硬件）

**没有机器人、没有 Gazebo** 也能把"控制器 + 硬件接口 + 状态回读"这条链路跑通。
用 `mock_components/GenericSystem` 当硬件：命令直接镜像到状态。

## 内容

| 文件 | 作用 |
|---|---|
| `urdf/vla_arm.urdf.xacro` | 6 个 revolute 关节（±1.5 rad、velocity 2.0），带 `<ros2_control>` 块 |
| `config/controllers.yaml` | `update_rate: 100`；`joint_state_broadcaster` + `forward_position_controller` |
| `launch/control.launch.py` | robot_state_publisher + controller_manager + 两个 spawner |

## 跑

```bash
ros2 launch vla_control control.launch.py
ros2 run vla_bridge bridge --ros-args \
    -p dof:=6 -p fixed_dof:=6 -p position_limit:=0.3 -p chunk_timeout:=1.0 \
    -r /joint_targets:=/forward_position_controller/commands
ros2 run vla_bridge fake_policy --ros-args -p dof:=6
```

## 验收（verify.sh 第 8 节）

| 断言 | 实测 |
|---|---|
| 两个控制器 active | ✔ |
| `/joint_states` | 99.989 Hz |
| 限幅穿透到执行器（策略要 0.8） | 实际最大 **0.300 rad** |
| 跟踪误差 | ≤ **0.0223 rad** |

## 两个坑

1. **`command size (N) does not match number of interfaces (6)`** → controller_manager 会直接把控制器 **deactivate**，
   之后 `/joint_states` 一直是 0、跟踪误差恒等于限幅值，看起来像"限幅正常但不跟随"。
   修法：桥加 `fixed_dof:=6`，或让上游出 6 维。
2. **xacro 里的 parent 别用字符串拼接**：`link${0 or 'base_link'}` 会得到 `linkbase_link`。把 parent 当宏参数传进来。

## 注意

`mock_components` **不做限幅**（只镜像命令）。所以"限幅生效"验的是**桥的钳位**落到了执行器上；
真硬件才会在驱动层再钳一次。要验驱动层限幅得接真控制器或 Gazebo。
