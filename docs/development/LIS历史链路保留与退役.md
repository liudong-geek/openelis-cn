# LIS 历史链路保留与退役

日期：2026-10-14。范围：CHG-083 第六批的前端旧检验项目向导清理。消费者核对基准为提交 `4e64ae9ce0ae3612f1b2cdecf63e1851157583e3`；本清单说明源码删除边界，不代表已部署或通过端到端、院方验收。各批执行、测试与运行版本以[六批优化验收记录](../qa/China-LIS-six-batch-optimization-2026-10-13.md)为准；活动功能定位见[功能与代码索引](LIS功能与代码索引.md)。

## 本批退役的 7 个文件

以下路径均相对 `frontend/src/components/admin/testManagementConfigMenu/`，行数取上述基准提交，共 4,576 行。它们不是旧 URL 或后端接口的删除清单。

| 文件                                                            | 原行数 | 消费者核对与承接                                                          |
| --------------------------------------------------------------- | -----: | ------------------------------------------------------------------------- |
| `TestModifyFilters.jsx`                                         |    117 | 无运行消费者；当前目录筛选在 TestCatalogList。                            |
| `customComponents/CustomShowGuide.jsx`                          |     36 | 无运行消费者；旧向导专用展示。                                            |
| `customComponents/CustomTestDataDisplay.jsx`                    |    309 | 无运行消费者；旧向导专用展示。                                            |
| `customComponents/TestFormData.js`                              |    241 | 仅被本次退役的 TestStepForm 引用 `extractAgeRangeParts`。                 |
| `customComponents/TestStepForm.jsx`                             |  3,613 | 无外部运行消费者；新增、编辑由当前目录弹窗及 TestCatalogEditor 分区承接。 |
| `customComponents/testStepDictionaryMatching.js`                |     84 | 仅被 TestStepForm 及其专用测试引用；当前结果项直接使用持久化选项 DTO。    |
| `customComponents/__tests__/testStepDictionaryMatching.test.js` |    176 | 只测试上述旧 helper；14 个用例逐项处置见下表。                            |

核对范围包括静态与动态 import/require、导出、App/Admin 路由、Cypress/Playwright、Java、JSP、XML tiles、报表及脚本。未发现这 7 个文件的组外运行消费者；前端源码及 Vite 配置未发现 `import.meta.glob` 或 `require.context` 隐式加载。历史设计文档 `specs/OGC-949-unified-test-catalog/research.md` 中的旧向导引用是历史说明，不是运行消费者。旧代码可从上述 Git 基准恢复。

## 继续保留的兼容链路

| 保留范围                                | 原因与活动位置                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 旧前端地址 `TestAdd`、`TestModifyEntry` | [Admin.jsx](../../frontend/src/components/admin/Admin.jsx) 在 `/admin` 与 `/MasterListsPage` 下均保留路由，由 [LegacyCatalogRedirect.jsx](../../frontend/src/components/admin/testCatalog/LegacyCatalogRedirect.jsx) 转入当前目录；新增打开同一弹窗，查询、导航 state 与受白名单约束的返回上下文继续保留。旧修改地址本身没有对象 ID，仍先进入选项目目录。 |
| 当前目录、编辑器及分区                  | [testCatalog](../../frontend/src/components/admin/testCatalog/) 保存活动列表、新增、结果项、参考范围和翻译等逻辑；不能据旧向导退役删除这些实现及其行为测试。                                                                                                                                                                                              |
| 旧 MVC、REST、form/service              | `src/main/java/org/openelisglobal/testconfiguration/` 下的 `controller/TestAddController.java`、`controller/TestModifyEntryController.java`、`controller/rest/TestAddRestController.java`、`controller/rest/TestModifyEntryRestController.java` 及其依赖继续保留；前端无 import 不能证明服务接口已失去消费者。                                            |
| JSP 与 tiles                            | [testAdd.jsp](../../src/main/webapp/pages/testConfiguration/testAdd.jsp)、[testModify.jsp](../../src/main/webapp/pages/testConfiguration/testModify.jsp) 仍提交旧服务器 action；[tiles-defs.xml](../../src/main/resources/tiles/tiles-defs.xml) 仍注册这两页。                                                                                            |
| 共用 SortableList                       | [SortableList.jsx](../../frontend/src/components/admin/testManagementConfigMenu/sortableListComponent/SortableList.jsx) 仍被 PanelOrder、SampleTypeOrder、TestSectionOrder、ResultSelectListAdd 和 TestActivation 引用，不在退役范围。                                                                                                                    |
| 结果、字典与报告数据链                  | 保留 `testcatalog`、`testresult`、`resultlimits`、`dictionary`、`testresultcomponent` 等后端服务、现有集成测试、Jasper/报表模板、数据库迁移和历史记录；本批不改数据库结构或临床权限。                                                                                                                                                                     |

## 原 helper 的 14 个用例如何承接

活动前端证据集中在 [SampleResultsSection.test.jsx](../../frontend/src/components/admin/testCatalog/sections/SampleResultsSection.test.jsx)，产品实现在 [SampleResultsSection.jsx](../../frontend/src/components/admin/testCatalog/sections/SampleResultsSection.jsx)。当前接口以选项 `id`、字典 `value`、完整 `valueName`、`sortOrder`、`normal`、`isQuantifiable` 分字段传输；不再从名称中的词或后缀反推身份。

下表逐项对应旧测试名，区分需要保留的数据语义和随旧输入适配器退役的解析行为。它不是“14 个旧单测等于 14 个新 UI 单测”的数量替换。

| 原测试名                                                                      | 当前处置与证据                                                                                        |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `trims surrounding whitespace`                                                | 旧名称匹配归一化随适配器退役；活动读取与保存用原字典 ID，不按名称空格匹配。                           |
| `preserves multi-word content`                                                | DENGUE 用例对保存的完整选项对象断言，保留多词名称。                                                   |
| `strips a trailing 'qualifiable' sentinel (case-insensitive)`                 | 旧内联后缀解析退役；定量属性使用独立 Boolean `isQuantifiable`。                                       |
| `returns empty string for nullish input`                                      | 旧原始字符串空值转换退役；活动页保留空组件与读取失败行为测试。                                        |
| `detects the 'qualifiable' marker case-insensitively`                         | 旧后缀识别退役；活动用例分别验证正常标记和可定量标记。                                                |
| `preserves all 5 values for DENGUE PCR (Serum), including multi-word entries` | 活动 DENGUE 无编辑保存用例断言全部 5 个选项的原 ID、名称、顺序和标记不变。                            |
| `marks qualified='Y' when the inline 'qualifiable' marker is present`         | DENGUE TYPE2 的 `isQuantifiable=true` 保留；另有独立属性编辑用例，不再解析 `qualified` 字符串。       |
| `accepts plain-string entries (legacy payload shape)`                         | 旧字符串数组输入随向导退役；活动 UI 读取持久化选项对象，不从搜索结果重新拼装已选项。                  |
| `returns empty array for empty/missing input`                                 | 旧 initial-array 适配器退役；活动页空组件、加载失败的处理仍有测试。                                   |
| `resolves by id against an extra lookup when value is missing from master`    | 活动 DENGUE 的部分搜索、空搜索两用例均保留所有已配置选项 ID，不依赖搜索命中。                         |
| `drops entries that have no match in the master dictionary`                   | 不继承旧静默丢弃行为；已配置选项即使不在搜索结果中也保留，删除由用户明确操作。                        |
| `resolves a multi-word value to its id`                                       | 默认与正常参考直接使用字典 ID；DENGUE 保留默认 `1003`、正常参考 `1001`，未修改时 PUT 省略这两个字段。 |
| `strips a 'qualifiable' marker before matching`                               | 旧后缀剥离退役；`value`、`valueName`、`isQuantifiable` 分字段保存。                                   |
| `returns null when no master entry matches`                                   | 旧未知名称解析退役；活动“未匹配历史选择”用例保留旧默认/正常值，直到明确清除。                         |

DENGUE fixture 使用结果项 ID `TR1`—`TR5`、字典 ID `1001`—`1005`、顺序 `1`—`5`，名称为 `DENGUE VIRUS NOT DETECTED`、`DENGUE VIRUS TYPE1 DETECTED`、`DENGUE VIRUS TYPE2 DETECTED`、`DENGUE VIRUS TYPE3 DETECTED`、`Invalid`。三种场景为直接保存、搜索仅返回 `1003`、搜索返回空数组；均断言提交的整个 options 数组与原对象相等。第一项正常标记为 true，第三项可定量标记为 true，二者与默认/正常参考选择分别维护。

后端契约证据在 [TestCatalogEditorRestController.java](../../src/main/java/org/openelisglobal/testcatalog/controller/rest/TestCatalogEditorRestController.java) 和 [TestCatalogEditorSampleResultsIntegrationTest.java](../../src/test/java/org/openelisglobal/testcatalog/controller/TestCatalogEditorSampleResultsIntegrationTest.java)：

- `legacyPrimaryProjection_isReadOnlyAndSavingPreservesOptionIdentityAndSettings`：旧 PRIMARY 投影读取不写库，显式保存保留选项身份与配置。
- `sampleResults_labelsDictionaryOptionsWithTheirEntryName`：读取选项带完整字典名称。
- `dictionaryOptionSavedInNewEditor_persistsAndIsVisibleToBothLegacyAndNewReads`：新编辑器保存后，旧、新读取契约可查到同一选项。
- 同类测试还覆盖省略可定量属性时保留旧值、同 ID 调整顺序、默认值与正常参考独立保存及明确清除。

## 验证边界

本清单的消费者结论来自只读源码审查；DENGUE 三场景是活动前端测试中的模拟数据，不是医院样本，也不是新执行的真实数据库 DENGUE 或端到端链路。后端集成测试证据与本轮实际运行结果应分别核对。

删除后的活动分区/旧路由测试、完整检查与构建、最终提交及部署由本批执行者记录到六批优化验收记录。任何失败、未运行或未部署状态都应保留，不以本清单替代发布验收。
