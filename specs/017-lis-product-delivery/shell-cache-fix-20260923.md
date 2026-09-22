# 深链加载旧前端的修复

部署两页改造时发现：运行容器已包含新版构建，直接读取 `/index.html` 与构建一致，但浏览器打开原 `/order` 仍复用旧 HTML，加载旧 JS。实际 HTTP 响应中 `/index.html` 有缓存重验证策略，`/order` 没有。

原 Nginx `try_files $uri $uri/ /index.html =404` 把 index.html 当作当前 location 的候选文件直接发送，因此没有使用精确 `/index.html` location 的缓存配置。修正为 `try_files $uri $uri/ /index.html`，让深链内部转向已有应用首页及其重验证策略。带指纹的 `/assets/` 保留长期缓存和缺文件 404；版本清单单独禁止缓存。

本地快速镜像同时复制仓库内的 Nginx 配置，避免只复制 dist 却永久沿用基础镜像中的旧配置；完整 Dockerfile 本来就使用这份配置。未改代理或 API 转发规则。

独立代码复核确认根因，临时小容器的 `nginx -t` 通过。随后正式部署需检查首页、index、order、Results 和管理深链的 HTML/缓存头，带指纹资源与缺资源 404，实际登录及页面；结果记入部署验收。新缓存头不会追溯清除浏览器已有旧缓存，第一次需要重新加载页面；不清除登录存储或结果草稿。
