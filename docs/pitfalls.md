---
title: 踩过的坑
sidebar_position: 9
---

# 踩过的坑（十条）

每一条都是"看起来像别的问题"的真故障。

| # | 现象 | 真因 | 修法 |
|---|---|---|---|
| 1 | 日志刷「看门狗触发」，`holds` 涨到 1539 | `chunk_timeout=0.3 s` < chunk 时长 1.67 s | 改成 2.0 s |
| 2 | 限幅正常但控制器不跟随 | 命令 2 维、接口 6 维 → controller_manager **静默 deactivate** | 桥加 `fixed_dof:=6` |
| 3 | `KeyError: observation.language.tokens` | 裸 dict 喂模型 | 走官方 6 步预处理链 |
| 4 | `mat1 and mat2 must have same dtype` | dtype 一刀切 | 视觉 bf16 / state fp32 |
| 5 | `(b,c,h,w) expected, got [256,256,3]` | 图像 HWC | 转 CHW + batch |
| 6 | 构建绿但 `ros2 pkg executables` 为空 | `ament_python` 缺 `setup.cfg` → 装到 `bin/` 而非 `lib/<pkg>/` | 补两行 `setup.cfg` 并清 build/install |
| 7 | rosidl 报 `Target dependency '.../ROS2' does not exist` | 中文路径被按 component 截断 | 迁到纯 ASCII 路径（`/root/ros2_ws`） |
| 8 | rviz2 起窗但空白、`Global Status: Error` | 没给 `.rviz` 配置，Fixed Frame 默认 `map` | 随包发 `arm.rviz`（Fixed Frame=base_link） |
| 9 | `kill` 后日志出现 `ExternalShutdownException`，像崩溃 | 直接 SIGTERM | 先 SIGINT，1 s 后对残余 SIGTERM |
| 10 | `grep -c` 断言恒为 1 | 整段响应是一行 | 用 `grep -o … \| wc -l` 计数 |

## 一条经验

**"绿了"不等于"对了"。** 上面第 2、6 条都是构建/启动全绿、但功能根本没生效 ——
只有把**输出维度**和**下游状态**一起断言，才能抓住这类静默失败。
