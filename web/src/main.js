import 'ol/ol.css';
import './style.css';
import Map from 'ol/Map.js';
import View from 'ol/View.js';
import Feature from 'ol/Feature.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import { fromExtent } from 'ol/geom/Polygon.js';
import DragBox from 'ol/interaction/DragBox.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import TileWMS from 'ol/source/TileWMS.js';
import { Fill, Stroke, Style, Text } from 'ol/style.js';
import { transformExtent } from 'ol/proj.js';
import { context, fixtureGrid, fetchGrid, fetchSummary, sampleBounds, studyBounds, summarizeFixture } from './data.js';

const el = (id) => document.getElementById(id);
const live = import.meta.env.VITE_DATA_MODE === 'service';
const geojson = new GeoJSON();
const projection = { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' };
const project = (bounds) => transformExtent(bounds, 'EPSG:4326', 'EPSG:3857');
const read = (data) => geojson.readFeatures(data, projection);
const area = (number) => number.toFixed(3);
const signed = (number) => (number > 0 ? '+' : '') + area(number);
const areaColors = ['#e5edd4','#b6d5a4','#6ca88c','#377e70','#215847'];
const errorColors = ['#2e6c9e','#94c1db','#eee9df','#e0a37c','#a64839'];
const initialBounds = live ? studyBounds : sampleBounds;
let mode = 'prediction';
let bbox = initialBounds;
let selectedId;
let result;
let lookup = new globalThis.Map();
let pending;
let dragging = false;

const gridSource = new VectorSource();
const selectionSource = new VectorSource();
const waterSource = new VectorSource({ features: live ? [] : read(context) });
const view = new View({ center: [0,0], zoom: 11, constrainRotation: 0, enableRotation: false, minZoom: 8, maxZoom: 17 });
const wmsSource = new TileWMS({
  url: import.meta.env.VITE_WMS_URL || '/geoserver/wms',
  params: { LAYERS: 'whu:settlement_year', TILED: true },
});

function gridStyle(feature, observed) {
  const id = feature.get('grid_id');
  const row = lookup.get(id);
  if (!row && result) return null;
  const error = !observed && mode === 'error';
  const value = row ? (observed ? row.obs_km2 : error ? row.error_km2 : row.pred_km2) : 0;
  const index = error
    ? (value < -.15 ? 0 : value < -.03 ? 1 : value <= .03 ? 2 : value <= .15 ? 3 : 4)
    : Math.min(4, Math.floor(value / .2));
  const active = id === selectedId;
  return new Style({
    fill: new Fill({ color: row ? (error ? errorColors : areaColors)[index] : '#e9eee4' }),
    stroke: new Stroke({ color: active ? '#dc813e' : '#466258', width: active ? 3 : 1 }),
    text: active && row ? new Text({ text: error ? signed(value) : area(value), font: 'bold 13px sans-serif',
      fill: new Fill({color:'#19362c'}), stroke: new Stroke({color:'#fff',width:3}) }) : undefined,
  });
}

function createMap(target, observed) {
  const tile = new TileLayer({ source: wmsSource, visible: false, opacity: .43 });
  const layers = [
    new VectorLayer({ source: waterSource, style: new Style({ fill: new Fill({color:'#cddedb'}),
      stroke: new Stroke({color:'#aac4c0', width:1}),
      text: new Text({ text:'', fill:new Fill({color:'#547671'}) }) }) }),
    tile,
    new VectorLayer({ source: selectionSource, style: new Style({ stroke: new Stroke({color:'#688777', width:2,lineDash:[6,6]}) }) }),
    new VectorLayer({ source: gridSource, style: (feature) => gridStyle(feature, observed) }),
  ];
  const map = new Map({ target, view, layers, controls: [] });
  map.on('singleclick', (event) => {
    const feature = map.forEachFeatureAtPixel(event.pixel, (item) => item, { layerFilter: (layer) => layer === layers[3] });
    if (feature) selectGrid(feature.get('grid_id'));
  });
  return { map, tile, grid: layers[3] };
}

const primary = createMap('map', false);
const comparison = createMap('compare-map', true);
const dragBox = new DragBox({ condition: (event) => dragging && event.originalEvent.button === 0 });
primary.map.addInteraction(dragBox);

function setDragging(active) {
  dragging = active;
  el('box').setAttribute('aria-pressed', String(active));
  el('box').textContent = active ? '取消框选' : '框选范围';
  el('map').classList.toggle('drawing', active);
}

dragBox.on('boxend', () => {
  bbox = transformExtent(dragBox.getGeometry().getExtent(), 'EPSG:3857', 'EPSG:4326');
  setDragging(false);
  refresh();
});

function selectGrid(id) {
  selectedId = id;
  redraw();
}

function renderLegend() {
  const errors = mode === 'error';
  const colors = errors ? errorColors : areaColors;
  const scale = errors ? ['< −0.15','−0.15 至 −0.03','≈ 0','0.03 至 0.15','> 0.15'] : ['0–0.2','0.2–0.4','0.4–0.6','0.6–0.8','0.8–1'];
  el('legend').replaceChildren(...colors.map((color, index) => {
    const key = document.createElement('span');
    const swatch = document.createElement('i');
    swatch.style.backgroundColor = color;
    key.append(swatch, scale[index]);
    return key;
  }));
  el('legend').setAttribute('aria-label', errors ? '预测减观测，单位平方千米' : '新增面积，单位平方千米');
}

function redraw() {
  const reveal = mode !== 'prediction';
  el('obs-box').hidden = !reveal;
  el('count').textContent = result?.count ?? '—';
  el('pred').textContent = result ? area(result.pred_total_km2) : '—';
  el('obs').textContent = reveal && result ? area(result.obs_total_km2) : '—';
  el('map-label').textContent = mode === 'error' ? '预测减观测 · km²' : '预测新增面积 · km²';
  el('compare-cell').hidden = mode !== 'compare';
  el('maps').classList.toggle('paired', mode === 'compare');
  el('wms-toggle').hidden = !live || !reveal;
  [primary, comparison].forEach(({tile, grid}) => {
    tile.setVisible(live && reveal && el('show-wms').checked);
    grid.changed();
  });
  const row = lookup.get(selectedId);
  el('detail').textContent = row
    ? row.grid_id + '  ·  预测 ' + area(row.pred_km2) +
      (reveal ? '  ·  观测 ' + area(row.obs_km2) + '  ·  误差 ' + signed(row.error_km2) +
         (row.error_km2 > 0 ? '（高估）' : row.error_km2 < 0 ? '（低估）' : '（相等）') : '')
    : result?.count === 0 ? '框内没有网格。' : '点击地图或下方列表查看网格。';

  el('ranking').replaceChildren(...(result?.rows ?? []).slice(0,10).map((item) => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.setAttribute('aria-pressed', String(item.grid_id === selectedId));
    const amount = document.createElement('strong');
    amount.textContent = area(item.pred_km2);
    button.append(item.grid_id, amount);
    button.addEventListener('click', () => selectGrid(item.grid_id));
    li.append(button);
    return li;
  }));
  renderLegend();
  requestAnimationFrame(() => {
    primary.map.updateSize();
    if (mode === 'compare') comparison.map.updateSize();
  });
}

async function refresh() {
  pending?.abort();
  const controller = new AbortController();
  pending = controller;
  selectionSource.clear();
  selectionSource.addFeature(new Feature(fromExtent(project(bbox))));
  const model = el('model').value;
  result = undefined;
  lookup.clear();
  redraw();
  el('status').textContent = '正在计算选区…';
  try {
    const next = live
      ? await fetchSummary(import.meta.env.VITE_WPS_URL || '/wps', model, bbox, controller.signal)
      : summarizeFixture(model, bbox);
    if (controller.signal.aborted) return;
    result = next;
    lookup = new globalThis.Map(next.rows.map((row) => [row.grid_id, row]));
    if (!lookup.has(selectedId)) selectedId = undefined;
    el('status').textContent = next.count ? '回测区间 2011—2015' : '框内没有网格，请扩大或重置范围。';
  } catch (error) {
    if (!controller.signal.aborted) el('status').textContent = error.message;
  }
  redraw();
}

function fit() {
  view.fit(project(initialBounds), { size: primary.map.getSize(), padding:[26,26,26,26], maxZoom:13 });
}

document.querySelectorAll('[data-mode]').forEach((button) => {
  button.addEventListener('click', () => {
    mode = button.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach((item) => {
      item.setAttribute('aria-pressed', String(item === button));
    });
    redraw();
  });
});
el('model').addEventListener('change', refresh);
el('box').addEventListener('click', () => {
  setDragging(!dragging);
  if (dragging) el('status').textContent = '在左侧地图按住鼠标并拖动，画出查询范围。';
  else el('status').textContent = '已取消框选。';
});
el('reset').addEventListener('click', () => {
  bbox = initialBounds;
  setDragging(false);
  fit();
  refresh();
});
el('show-wms').addEventListener('change', redraw);

try {
  if (live) {
    el('source').textContent = '地理服务';
    el('foot-note').textContent = '聚居地年份图层 © DLR · WSF Evolution · CC BY 4.0';
  }
  const data = live ? await fetchGrid(import.meta.env.VITE_WFS_URL || '/geoserver/wfs') : fixtureGrid;
  gridSource.addFeatures(read(data));
  fit();
  await refresh();
} catch (error) {
  el('status').textContent = error.message;
}
