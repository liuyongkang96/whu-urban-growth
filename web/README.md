# D 组地图前端

从仓库的 `web` 目录运行 `npm ci` 和 `npm run dev`。执行 `npm run build` 生成静态构建。Windows 若 C 盘不足，可用 `npm.cmd ci --cache D:/CodexProjects/.npm-cache`。

默认使用三格合成样例。地图中的长江和东湖为示意线形。模型切换、选区、揭晓和误差均使用相同数据结构，面积单位为 km²。先选“框选范围”，再在左图拖拽；支持从右侧排名选择网格。

## 真实服务联调

复制 `.env.example` 为 `.env.local`，填入 C 提供的 GeoServer 和 PyWPS 服务源站。重新启动 Vite 后查看页头的数据模式。Vite 开发和预览服务均配置同源代理。静态部署时由宿主反向代理 `/geoserver` 与 `/wps`。环境变量 `VITE_WFS_URL`、`VITE_WMS_URL`、`VITE_WPS_URL` 可覆盖同源路径。

实现使用 PROJECT.md 的 `whu:grid`、`whu:settlement_year`、`growth_summary`。验证 WFS GeoJSON 坐标顺序、WPS JSON 类型及网格 ID 是否一致。预测视图隐藏含 2015 年信息的 WMS 图层；揭晓或误差视图可以手动叠加。真实服务连通性须在 C 提供实例后核验。
