---
title: 软件包一览
sidebar_position: 3
---

# 软件包一览

| 包 | 类型 | 作用 |
|---|---|---|
| `01_square_driver` | ament_python | 走正方形（跑在 turtlesim 上，不是真差速底盘） |
| `02_sensor_publisher` | ament_python | 传感器采集 + 滑窗滤波 + 阈值告警 |
| `03_arm_description` | ament_cmake | 3-DOF 机械臂 URDF / TF / rviz |
| `04_sensor_interfaces` | ament_cmake | 自定义消息（含 `ActionChunk`） |
| `05_vla_bridge` | ament_python | `fake_policy` + `bridge`：块 → 100 Hz 指令 |
| `06_vla_control` | ament_cmake | 6 轴臂 + ros2_control + mock 硬件 |
| `tools/` | 脚本 | `smolvla_policy.py`、`export_attempt2.py`、`ort_gpu_bench.py` |

## 构建与验证

```bash
rw                    # 一键 colcon build（/usr/local/bin/rw）
/root/ros2_ws/verify.sh   # 9 节 32 项断言
```

## 话题总览

| 话题 | 类型 | 发布者 |
|---|---|---|
| `/vla/action_chunk` | `sensor_interfaces/ActionChunk` | `fake_policy` / `smolvla_policy` |
| `/joint_targets` | `std_msgs/Float64MultiArray` | `bridge` |
| `/estop` | `std_msgs/Bool` | 人工 / 上层 |
| `/vla/tracking_error` | `std_msgs/Float64MultiArray` | `bridge` |
| `/joint_states` | `sensor_msgs/JointState` | `joint_state_broadcaster` |
