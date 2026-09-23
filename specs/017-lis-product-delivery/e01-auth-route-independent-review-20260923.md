# E-01 登录/改密路由稳定性独立审查

审查位置：`/private/tmp/lis-active-20260923/delivery-worktree`；审查方式：只读源码、安装的 React Router/Carbon 实现及新增行为测试。本代理未修改产品或测试源文件，未代替 QA 执行浏览器验收。

## 根因与修复边界

旧 App.jsx:475、479 将新建箭头函数作为 Route.component。安装的 React Router v5 在匹配路由后通过 `React.createElement(component, props)` 渲染（node_modules/react-router/cjs/react-router.js:695）。App 每次会话响应执行 setUserSessionDetails（App.jsx:281）后生成新组件类型，React 因而卸载旧 Login/ChangePassword 子树。

登录页真实定时器在空闲时每 10 秒执行 refresh（Login.jsx:83–100、125–126），refresh 经 App.jsx:414–415 再请求 session。即便响应仍为 authenticated=false，只要它是新返回对象，就可能触发旧写法重挂载，丢失输入与 Formik 状态。活动标记只能阻止下一次发起请求，不能取消已经在途的会话响应。改密页自身没有相同轮询，但 App 初次在途 session 返回足以触发同类丢稿。

将这两条路由改为导入组件的稳定引用与当前逻辑相容：

- path、exact、路由顺序、Switch key 不变；Route 新传入 history/location/match 不被两表单用于业务判断。Login 仅依赖其 intl 属性及 Context，ChangePassword 通过 hooks 获取 intl/Context。
- UserSessionDetailsContext Provider 及 refresh/logout 函数、Layout 的配置与通知 Context 保留，稳定组件仍会接收最新会话状态。
- Login 的 authenticated=true effect 仍按 Login.jsx:119–123 导航 Dashboard；表单登录成功仍 await refresh 后导航（182–183）。此次修复不改变服务端认证、权限或密码策略。
- 普通退出仍 POST Logout 后转 login（App.jsx:359–371）；SAML 退出分支也不变。改变密码成功后的退出与匿名返回 login 逻辑未改。
- 正常离开路由仍卸载表单，不跨登录/退出缓存密码。显式 routeRefreshKey 和 IntlProvider 的 locale key 所定义的主动重挂载行为仍保留。

## 新行为测试的审查

`frontend/src/App.authRouteStability.test.jsx` 使用真实 App、Router、Layout、Formik、两表单和 Carbon，仅控制 fetch 的返回；不是另造一个模拟 Route，也不依赖源码文本断言。

两条初始响应测试在 session 未完成时填入登录两字段/改密四字段，然后放回匿名结果，要求原 DOM 仍连接、当前 DOM 与原节点一致、输入值全部保留。自然轮询测试通过真实 Login 的 10 秒定时器发出第二次 session 请求，在该请求在途时填入草稿，再放回新的匿名对象检查保留。这些断言可以直接区分用户草稿被重置与正常重新渲染。

最初测试尾部点击改密按钮后直接期待 jsdom 的 window.location.href 完成整页导航不成立；已通知实现代理修正为使用真实 BrowserRouter 的 history/popstate 切换来证明旧页面卸载、新改密表单空值。不要为测试修改产品的改密按钮导航。

最终测试已按真实 BrowserRouter history/popstate 验证离页卸载；另明确补齐 Layout 的帮助配置、通知数组与推送配置响应，仍保留未知请求为空的严格断言。上述测试只验证会话更新与表单生命周期，不等于认证/退出流程已通过。

## 最终证据复核

- 主树 App.jsx SHA256：`4f2394da42edd3bfd4080fa9260fcbefbbb19aaaa95b625b09a8ba738a54b2a7`。独立 git diff 确认产品仅将 login 与 ChangePasswordLogin 的 component 改为稳定导入引用，恰好两行，没有其他产品逻辑变更。
- 最终测试 SHA256：`ca274e1fbe4030876c6c99dc2189ab67ab9ba474502169ae2e3716e60d1f07f4`。新测试与实现代理红灯前冻结记录相同。
- `e01-auth-route-stability-red-complete.log`：旧 App 的同一最终测试 3/3 失败，用时 18.33 秒；全部失败均为 `loginName remains mounted: expected false to be true`，没有用未知请求或 jsdom 导航错误充当缺陷证据。
- `e01-auth-route-stability-green-v2.log`：修复后定向 4 文件 9/9 通过，用时 25.82 秒。独立读取日志与文件哈希，未额外重复运行。

结论：本次两条路由稳定引用修复符合已确认的缺陷范围，新测试证明真实会话响应导致的草稿丢失已在该行为回归中修复；可进入 root 的类型/翻译/构建与 QA 真实隔离浏览器回归。此结论不覆盖尚未执行的新产物浏览器验收、完整 Cypress 或其它内联路由。

## 需要保留的回归范围

1. 新三例先在旧产品上因 DOM/草稿丢失失败，再在两条 Route 修复后通过；不能以超时或测试导航设施错误作为红灯证据。
2. 既有登录 8 例继续验证正确/错误凭证、密码修改及退出回登录的真实路径。实际隔离浏览器须确认匿名自然轮询后输入与节点保留。
3. 新变更仅两个 Route 引用；权限和退出逻辑不得顺带改写。登录/改密本就是现有公开入口，此次不新增访问能力。

## 仍待核实的邻近风险

App.jsx 的 landing 以及多个 SecureRoute 仍采用内联 component；SecureRoute 最终渲染 `<Route {...props}/>`，所以结构上具备同类重新挂载风险。尚无本审查范围内的具体业务丢稿复现，不把它们算作已修复，也不擅自扩展本次范围。后续需按实际会话更新触发源和页面表单逐项取证。
