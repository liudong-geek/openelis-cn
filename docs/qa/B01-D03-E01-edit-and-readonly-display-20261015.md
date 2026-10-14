# B-01／D-03／E-01：修改申请保存与受限空值显示

2026-10-15。此记录仅对应局部回归；旧 a11 运行版为 c835a2db3，新完整运行版尚待构建验收。

修改申请实际 POST 400：创建连续开单使用的 `rememberSiteAndRequester` 被提交至严格 `SampleEditForm`。创建页面继续提供该偏好，修改页面隐藏该控件，修改 DTO 在复制草稿后剔除该键。其他患者、标本、检验、送检机构和医生字段保持，保存失败不清空草稿。实际旧请求独立读回仍为原两管两项，没有重复提交。

真实 Carbon、实际 ModifyOrder 保存调用和 DTO 边界的三个原测试文件，增加回归后旧实现 79 通过／5 失败，修复后仓内 **84 通过、0 失败、0 跳过**。非作者复审接受。证据：交付目录 `modify-order-local-memory-dto-fix/` 的 `frozen-manifest.json`、`root-integrated-result.json` 与 `independent-review.json`。

受限结果没有值时，空 span 无可见内容。仅使用中性“—”显示空值，数值零、字典、多选和历史结果继续显示原值；不增加输入、保存动作或写请求。原同组加回归先 20 通过／4 失败，修复后仓内 **24 通过、0 失败、0 跳过**。证据：`results-readonly-empty-display-fix/root-integrated-result.json`。

原修改申请19场景和结果30场景需在新运行版完整验收。受限说明弹窗另有实际响应解析失败，单独处理；本记录不宣称该弹窗已修复。未推送、未更新正式应用或业务数据。
