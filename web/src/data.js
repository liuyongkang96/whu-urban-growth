export const studyBounds = [114.10, 30.35, 114.60, 30.75];

const samples = [
  { id: 'fixture_01', center: [114.32, 30.55], obs: 0.10, rf: 0.12, distance: 0.21, mean: 0.16 },
  { id: 'fixture_02', center: [114.38, 30.54], obs: 0.26, rf: 0.35, distance: 0.29, mean: 0.16 },
  { id: 'fixture_03', center: [114.43, 30.50], obs: 0.41, rf: 0.32, distance: 0.19, mean: 0.16 },
];

const feature = (ring, properties) => ({
  type: 'Feature',
  geometry: { type: 'Polygon', coordinates: [ring] },
  properties,
});

const collection = (features) => ({ type: 'FeatureCollection', features });

export const sampleBounds = [114.22,30.46,114.48,30.62];
export const fixtureGrid = collection(samples.map(({ id, center: [x,y] }) =>
  feature([[x-.013,y-.009],[x+.013,y-.009],[x+.013,y+.009],[x-.013,y+.009],[x-.013,y-.009]],
    { grid_id: id })));

export function summarizeFixture(model, [west, south, east, north]) {
  if (!['rf', 'mean', 'distance'].includes(model) || west >= east || south >= north) {
    throw new Error('模型或框选范围无效。');
  }
  const rows = samples
    .filter(({ center: [x,y] }) => west <= x && x <= east && south <= y && y <= north)
    .map((sample) => ({
      grid_id: sample.id, pred_km2: sample[model], obs_km2: sample.obs,
      error_km2: sample[model] - sample.obs,
    }))
    .sort((a,b) => b.pred_km2 - a.pred_km2 || a.grid_id.localeCompare(b.grid_id));
  return {
    t: 2010, model, count: rows.length, rows,
    pred_total_km2: rows.reduce((sum,row) => sum + row.pred_km2, 0),
    obs_total_km2: rows.reduce((sum,row) => sum + row.obs_km2, 0),
  };
}

async function responseBody(response) {
  if (!response.ok) throw new Error('地理服务请求失败（HTTP ' + response.status + '）。');
  try { return await response.json(); }
  catch { throw new Error('地理服务未返回 JSON，请检查联调地址和 WPS 输出格式。'); }
}

export async function fetchGrid(url) {
  const target = new URL(url, location.href);
  Object.entries({
    service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: 'whu:grid',
    outputFormat: 'application/json', srsName: 'EPSG:4326',
  }).forEach(([key,value]) => target.searchParams.set(key,value));
  const grid = await responseBody(await fetch(target));
  if (grid.type !== 'FeatureCollection' || !Array.isArray(grid.features)) {
    throw new Error('WFS 返回的网格格式有误。');
  }
  return grid;
}

export function executeXml(model, bbox) {
  if (!['rf','mean','distance'].includes(model) || bbox.length !== 4 ||
      !bbox.every(Number.isFinite) || bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) {
    throw new Error('模型或框选范围无效。');
  }
  const inputs = [['t',2010],['model',model],['bbox',bbox.join(',')]]
    .map(([key,value]) => '<wps:Input><ows:Identifier>'+key+'</ows:Identifier><wps:Data><wps:LiteralData>'+value+'</wps:LiteralData></wps:Data></wps:Input>').join('');
  return '<wps:Execute service="WPS" version="1.0.0" xmlns:wps="http://www.opengis.net/wps/1.0.0" xmlns:ows="http://www.opengis.net/ows/1.1"><ows:Identifier>growth_summary</ows:Identifier><wps:DataInputs>'+inputs+'</wps:DataInputs><wps:ResponseForm><wps:RawDataOutput mimeType="application/json"><ows:Identifier>result</ows:Identifier></wps:RawDataOutput></wps:ResponseForm></wps:Execute>';
}

export async function fetchSummary(url, model, bbox, signal) {
  const result = await responseBody(await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/xml' },
    body: executeXml(model,bbox), signal,
  }));
  if (result.model !== model || result.t !== 2010 || !Array.isArray(result.rows) ||
      result.count !== result.rows.length || !Number.isFinite(result.pred_total_km2) ||
      !Number.isFinite(result.obs_total_km2) || result.rows.some((row) =>
        typeof row.grid_id !== 'string' || ![row.pred_km2,row.obs_km2,row.error_km2].every(Number.isFinite))) {
    throw new Error('WPS 返回的数据与接口契约不一致。');
  }
  return result;
}
