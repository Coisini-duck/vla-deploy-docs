---
title: Gazebo 仿真
sidebar_position: 9
---

# Gazebo Sim 仿真（第三种后端）

同一个 URDF 现在支持三种后端，靠 `use_sim` 参数切换：

| 模式 | 硬件插件 | 需要什么 | 能验什么 |
|---|---|---|---|
| `use_sim:=false`（默认） | `mock_components/GenericSystem` | 无 | 控制器 + 接口 + 状态回读（命令直接镜像） |
| `use_sim:=true` | `gz_ros2_control/GazeboSimSystem` | Gazebo Sim 8 | **动力学、碰撞、URDF 限位** |

## 为什么值得加这一层

`mock_components` **不做任何物理**：你发 2.0 rad，它就回 2.0 rad。所以"限幅生效"只能证明**桥的钳位**，
证明不了机器人侧。接上 Gazebo 之后，**URDF 的 ±1.5 rad 限位真的会生效** —— 这是 mock 做不到的。

## 三个文件

| 文件 | 内容 |
|---|---|
| `urdf/vla_arm.urdf.xacro` | 每个 link 补 `<inertial>` + `<collision>`；`use_sim` 切换硬件插件；仿真时挂 `gz_ros2_control-system` 插件 |
| `worlds/vla_world.sdf` | 地面（摩擦力 1.0）+ 重力 −9.81 + 一个 0.1 m 的障碍箱（撞箱测试用） |
| `launch/gz.launch.py` | `gz sim -r -s`（headless）+ `/clock` 桥 + spawn 机械臂 + 两个 spawner |

## 跑

```bash
# headless（WSL 推荐）
ros2 launch vla_control gz.launch.py

# 带界面
ros2 launch vla_control gz.launch.py gui:=true

# 桥接层照旧接上去
ros2 run vla_bridge bridge --ros-args \
    -p dof:=6 -p fixed_dof:=6 -p chunk_timeout:=2.0 \
    -r /joint_targets:=/forward_position_controller/commands
```

## 实测（verify.sh 第 10 节）

| 断言 | 实测 |
|---|---|
| 控制器 active | **2** |
| `/joint_states`（仿真时钟） | **99.998 Hz** |
| 跟随误差（指令 0.3 rad，verify 实测） | **4.35e-11 rad** |
| 三组指令跟随（0.3 / −0.4 / 0.25，单独一轮） | 4.37e-11 / 3.98e-11 / 2.99e-11 |
| **URDF 限位**：指令 2.0 → 实际 | **1.5000 rad** ✅ |
| 仿真进程清理 | ✅ |

> 跟随误差小到 1e-11，是因为 `forward_position_controller` 直接把关节设到目标（无外力负载）。
> 真正能体现物理的是**限位那一条**：指令 2.0 被 Gazebo 钳到 1.5。

## 撞柱测试：**用位置接口验不出来**（重要负面结论）

实验设计：世界里 x = ±0.35 各立一根 0.1×0.1×0.6 m 柱子，命令 `joint1 = ±0.9 rad`，
预期机械臂摆到 ~0.6 rad 就被柱子挡住。

实测结果：

| 场景 | 指令 | 实际 joint1 |
|---|---|---|
| 有柱（两侧都放） | +0.9 | **0.9000** |
| 有柱（两侧都放） | −0.9 | **−0.9000** |
| 无柱对照 | +0.9 | **0.9000** |

**柱子完全没起作用。** 不是柱子位置放错了，而是：

> `gz_ros2_control` 的 `forward_position_controller` 是**运动学写入**（对内直接 `SetPosition`），
> 不经过力学求解器 —— 所以接触不会产生反力，关节想去哪就去哪。

这意味着「接上 Gazebo = 有物理」这句话**只对了一半**：URDF 限位会生效（那是关节约束，不是接触），
但**接触/碰撞要用动力学接口才验得出来**。

### 要真验碰撞，得换命令接口

| 做法 | 需要改什么 |
|---|---|
| effort 接口 | URDF 加 `<command_interface name="effort"/>`，控制器换 `effort_controllers/JointGroupEffortController`，自己写 PD（或 JTC 带 PID gains） |
| velocity 接口 | 命令速度 + 控制器闭环，接触会表现为速度跟不上 |
| `JointTrajectoryController` | 带 PID，接触 → 跟踪误差显著上升（最接近真实机器人测试） |

**教训（可推广）**：做物理验证前先问一句 —— **这个控制接口是运动学写入还是动力学驱动？**
用运动学接口测碰撞，永远测不出来，而且会得出"仿真没问题"的错误结论。

## 踩坑记录

- **`$(find vla_control)` 在 xacro 里需要先 source 工作空间**，否则报 `package 'vla_control' not found`；
- **headless 用 `-s`**（只起服务器），WSL 下比带 GUI 稳得多；
- **`use_sim_time` 必须给 spawner 和 rsp**，否则控制器按墙钟跑、和仿真时钟打架；
- **解析 `/joint_states` 时别用裸正则**：`ros2 topic echo` 偶尔会插 `A message was lost!!!` / `total count: 1`，
  正则会把这些 `1` 当成关节角 —— 已经踩过，导致"假 PASS"。
