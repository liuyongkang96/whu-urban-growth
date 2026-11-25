import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxy = {};
  if (env.GEOSERVER_TARGET) proxy['/geoserver'] = { target: env.GEOSERVER_TARGET, changeOrigin: true };
  if (env.WPS_TARGET) proxy['/wps'] = { target: env.WPS_TARGET, changeOrigin: true };
  return { base: './', server: { proxy }, preview: { proxy } };
});
