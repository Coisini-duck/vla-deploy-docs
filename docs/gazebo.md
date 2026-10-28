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

### 已经换了 effort 接口（部分完成）

改动：

- `vla_arm.urdf.xacro` 每个关节同时声明 `position` 与 `effort` 命令接口（各 6 个）；
- `controllers.yaml` 增加 `joint_group_effort_controller`；
- `gz.launch.py` 增加 `spawn_fwd` 参数，做 effort 实验时设 `false`。

已验证：控制器能 active，恒定力矩确实让关节转动（0.4 N·m → joint1 摆到 1.5 限位）。

**但 A/B 结果与预期相反**：

| 接口配置 | 力矩 | 有柱（x=±0.35） | 无柱 |
|---|---|---|---|
| position + effort 同时声明 | 0.40 N·m | 1.5000 rad（限位） | ≈1.099 rad |
| position + effort 同时声明 | 0.15 N·m | 1.5000 rad（限位） | ≈0.635 rad |
| **仅 effort**（`VLA_CONTROL_MODE=effort`） | 0.15 N·m | 1.5000 rad（限位） | **0.6354 rad（可复现）** |

第三行是决定性的一次：把位置接口彻底去掉（`control_mode` 参数，effort 时只声明 effort 命令接口），
结果与"两个接口打架"无关，仍然是有柱 1.5、无柱 0.635。**位置保持假设被证伪。**

好消息是无柱落点现在可复现（两次 0.6348 / 0.6354）。

**但用正运动学一算就露了底**：关节全为 0 时末端在 z≈0.71 m，所以

| θ | 末端 x | 末端 z | 含义 |
|---|---|---|---|
| 0.635 rad | 0.386 m | 0.583 m | **正好落在柱子体积里**（柱 x 0.20–0.50、z 0–0.80） |
| 1.500 rad | 0.648 m | 0.106 m | 出了柱子、近乎贴地 |

也就是说：**无柱那组停在了"如果真有柱子就该被挡住"的位置，有柱那组反而穿过去了。**

再看时间序列就明白了 —— 无柱组第 1 个采样是 1.3837，第 2 个就跳到 0.6353：
机械臂在**没有任何力矩指令的 30 秒空等期里已经被重力砸到地面、又弹回来**，
等 effort 指令到达时早已离开初始姿态。有柱组则可能是在高速摆过柱子时**穿模**
（0.30 m 宽的柱子对半径 0.03 m 的连杆来说太薄）。

**结论：这轮实验的初值不可控，A/B 无法成立。** 正确做法是
**先用控制器把机械臂稳在已知姿态，再切换成力矩模式**；
更省事的方案是直接用 `joint_trajectory_controller` 带 PID —— 接触会表现为跟踪误差突增，
不需要 effort 通道，也不会经历自由落体。

collision 段（7 个）与柱位均已核对，不是"没写碰撞体"。

**结论：碰撞验证仍未形成可信结论**，`verify.sh` 第 12 节只断言跟踪误差与限幅，不断言接触。

### 观测路径也走不通（已查）

本想用 `/world/vla_world/contacts` 看接触点，结果它**始终 0 字节**。逐层排查：

1. 世界文件只有 `physics` / `user-commands` / `scene-broadcaster` 三个系统，没有 `gz-sim-contact-system`；
2. 补上该 plugin 后依旧 0 字节，`gz topic -l` 里根本没有 `contact` 话题；
3. 查插件目录：本机 `gz-sim-8` 的 contact 系统**没有安装**，所以这个系统加载不了。

也就是说：**这台机器上无法直接观测接触**，只能从关节运动反推。补入的 plugin 已撤销，避免留一个加载不到的假配置。

要真正做完这项，路线是：装齐 `gz-sim` 的 contact 系统 → 复现接触点 → 再谈 A/B。
按当前信息判断，无柱世界停在 ≈1.099 rad、有柱却到 1.5，更像是**物理引擎或关节限位配置**的问题，而不是"柱子挡不住"。

## 踩坑记录

- **`$(find vla_control)` 在 xacro 里需要先 source 工作空间**，否则报 `package 'vla_control' not found`；
- **headless 用 `-s`**（只起服务器），WSL 下比带 GUI 稳得多；
- **`use_sim_time` 必须给 spawner 和 rsp**，否则控制器按墙钟跑、和仿真时钟打架；
- **解析 `/joint_states` 时别用裸正则**：`ros2 topic echo` 偶尔会插 `A message was lost!!!` / `total count: 1`，
  正则会把这些 `1` 当成关节角 —— 已经踩过，导致"假 PASS"。
