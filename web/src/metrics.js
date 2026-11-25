const byScore = field => (a,b) => b[field] - a[field] || a.grid_id.localeCompare(b.grid_id);

export function compareModels(summaries) {
  const reference = new Map(summaries[0].rows.map(r => [r.grid_id, r.obs_km2]));
  return summaries.map(({model, rows}) => {
    const ids = new Set(rows.map(r => r.grid_id));
    if (rows.length !== reference.size || ids.size !== reference.size ||
        rows.some(r => !reference.has(r.grid_id) || Math.abs(reference.get(r.grid_id)-r.obs_km2) > 1e-8)) {
      throw new Error('三个模型的网格或观测值不一致，请核对服务结果。');
    }
    const observed = new Set([...rows].sort(byScore('obs_km2')).slice(0,10).map(r => r.grid_id));
    let sum = 0;
    let worst;
    for (const r of rows) {
      const delta = r.pred_km2 - r.obs_km2;
      sum += Math.abs(delta);
      if (!worst || Math.abs(delta) > Math.abs(worst.delta) ||
          (Math.abs(delta) === Math.abs(worst.delta) && r.grid_id < worst.id)) worst = {id:r.grid_id, delta};
    }
    const hits = rows.length > 10 ? [...rows].sort(byScore('pred_km2')).slice(0,10)
      .filter(r => observed.has(r.grid_id)).length : null;
    return {model, mae:rows.length ? sum / rows.length : null, hits, worst};
  });
}
