# E-01 / A-01：会话刷新导致认证表单丢输入

日期：2026-09-23。业务基准5448226d35，最新已提交文档58bed58c95。关联工作区CHG-007；不改变医院规则或A—E需求范围。

## 实际缺陷

维护原登录8个浏览器场景时，第4轮在清空输入框的准备步骤出现DOM detached。没有将它当成需要强制输入或加长等待的测试噪声。

QA在旧构建、真实隔离后端上观察正常10秒会话轮询：

- 13,046ms：GET `/session` 发出。
- 13,118ms：向用户名填入合成标记 `SIM-SESSION-REFRESH`。
- 16,255ms：收到200，仍为未认证状态。
- 先前输入节点已断开，新输入框为空，`markerRetained=false`。

没有填写密码、没有提交登录、没有替换网络响应。原始只读诊断为`a02-cypress-isolation-v2/evidence/login-remount.json`及同名截图。时间仅为本机隔离诊断时间线，不当作正式系统性能指标。

## 原因与限定修复

App每次接收会话结果都会更新`userSessionDetails`。原`/login`及`/ChangePasswordLogin`两条Route使用内联匿名component函数；React Router v5收到新组件类型后卸载旧表单，丢失Formik状态和输入DOM。

修复仅将这两条路由改为稳定导入的`Login`和`ChangePassword`组件引用。会话Provider、后端认证、角色、密码规则、登录成功跳转与退出处理保持原逻辑。真正换页依旧卸载原表单，不跨退出保留密码。

`/landing`及部分SecureRoute也使用内联component；本批未批量修改，仍归A-01后续核查。此修复不等于已解决全局CSRF轮换/多标签写入保护或全部临床草稿问题。

## 回归证据

`App.authRouteStability.test.jsx`使用真实App、Router、Layout、认证表单、Formik和Carbon，仅模拟后端fetch：

1. 登录页首次会话响应在途时输入，响应返回后原DOM及两个字段仍应保留。
2. 改密页首次会话响应在途时输入，响应返回后原DOM及全部认证字段仍应保留。
3. 登录页真实10秒轮询已发出时输入，新匿名响应返回后仍保留草稿；真正离开路由仍卸载旧表单。

最初测试文件SHA256 `9783519761a52f6aa4a07f43103108f5b2cc7d6f804dccdac4e8330e74075a46`在旧App上3/3失败（21.80秒），均因原loginName节点卸载；原日志`e01-auth-route-stability-red-final.log`保留。首轮修复后核心行为已通过，但严格服务请求清单遗漏两条真实配置请求；该次失败没有抹除。

补齐明确的`/rest/properties`和`/rest/notification/pnconfig`测试服务响应后，最终测试SHA256为`ca274e1fbe4030876c6c99dc2189ab67ab9ba474502169ae2e3716e60d1f07f4`，未知请求仍必须失败。用**完全相同的最终测试文件**重新验证：

- 旧App：3/3因原节点卸载而失败，18.33秒，`e01-auth-route-stability-red-complete.log`。
- 两Route修复后：新3例与原App/加载/导航相关用例共4文件9/9通过，25.82秒，`e01-auth-route-stability-green-v2.log`。
- 独立复核：App SHA256 `4f2394da42edd3bfd4080fa9260fcbefbbb19aaaa95b625b09a8ba738a54b2a7`，业务diff严格两处引用，详见同目录`e01-auth-route-independent-review-20260923.md`。
- TypeScript交付基线无新增（401历史诊断，非完整类型零错误），1896中文字典引用、11个变更前端文件格式通过。
- 生产构建通过（21.46秒）；1315个前端输入前后相同，208构建文件。输入指纹`47a73832c0b86dbd31be32a57c087cb3e2de2b02d2f7c995944defab0d910986`，index SHA256 `11214ab6517ba79f4f94689bc49dc650d0a02cad48cc845b62617a7610800e1e`。前端Cypress维护仍在工作树，产品两Route及新行为测试随本记录独立本地提交；实际浏览器复测尚待，不预填通过。

## 交付限制

正式18080目前仍为原5448226d35构建，本修复尚未部署。新构建应另存快照、核验摘要后在相同隔离后端复测自然轮询与原登录8例；继续完整34spec门禁，未通过不得推送。后端/数据库不因这两处前端修复重建，原失败证据不覆盖。
