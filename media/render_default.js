// render_default.js
export function renderQPU(data, scene, THREE, gateLib) {
  // Clear scene; re-add basic lights (library may also add its own via getPlaneMesh etc.)
  while (scene.children.length) scene.remove(scene.children[0]);
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dir = new THREE.DirectionalLight(0xffffff, 0.7);
  dir.position.set(40, -30, 80);
  scene.add(dir);

  const qubits   = data?.hardware?.nodes || [];
  const couplers = data?.hardware?.edges || [];
  const gates    = data?.circuit?.gates || [];
  const depth    = gates.length ? Math.max(...gates.map(g => g.t)) : 1;

  // Background plane (theme-controlled)
  const plane = gateLib.getPlaneMesh?.(THREE) ??
    new THREE.Mesh(
      new THREE.PlaneGeometry(220, 220),
      new THREE.MeshBasicMaterial({ color: 0x0f172a, side: THREE.DoubleSide, transparent: true, opacity: 0.5 })
    );
  plane.rotation.x = Math.PI / 2;
  plane.position.set(0, 0, -0.1);
  scene.add(plane);

  // Qubit nodes
  const nodePos = {};
  qubits.forEach(n => {
    const m = gateLib.getQubitMesh?.(THREE, n) ??
      new THREE.Mesh(
        new THREE.SphereGeometry(0.4, 16, 16),   // SMALLER default spheres
        new THREE.MeshStandardMaterial({ color: 0x5eead4, metalness: 0.2, roughness: 0.6 })
      );
    m.position.set(n.x, n.y, n.z ?? 0);
    m.userData = { id: n.id };
    scene.add(m);
    nodePos[n.id] = m.position.clone();

    // id label (kept renderer-side; you can move to library if you like)
    const label = makeLabel(THREE, String(n.id), { scale: 1.8, fontSize: 8, bgAlpha: 0.0 });
    label.position.copy(m.position).add(new THREE.Vector3(0, 0, 0.9)); // a bit closer to the sphere
    scene.add(label);

  });

  // Hardware edges
  const topoMat = gateLib.getTopologyMaterial?.(THREE) ??
    new THREE.LineBasicMaterial({ color: 0x334155 });
  couplers.forEach(e => {
    const a = nodePos[e.source], b = nodePos[e.target];
    if (!a || !b) return;
    const geom = new THREE.BufferGeometry().setFromPoints([a, b]);
    scene.add(new THREE.Line(geom, topoMat));
  });

  // Per-qubit timelines
  const timelineMat = gateLib.getTimelineMaterial?.(THREE) ??
    new THREE.LineDashedMaterial({ color: 0xaaaaaa, dashSize: 0.18, gapSize: 0.18 });
  qubits.forEach(q => {
    const geom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(q.x, q.y, 0),
      new THREE.Vector3(q.x, q.y, depth + 1)
    ]);
    const line = new THREE.Line(geom, timelineMat);
    if (line.computeLineDistances) line.computeLineDistances();
    scene.add(line);
  });

  // Gates + 2-qubit connectors
  gates.forEach(g => {
    // gate markers over each touched qubit
    g.qargs.forEach(qid => {
      const p = nodePos[qid];
      if (!p) return;
      const obj = gateLib.getMeshForGate(THREE, g);
      if (!obj) return;
      const inst = obj.clone();
      inst.position.set(p.x, p.y, g.t);
      scene.add(inst);
    });

    // 2-qubit link at same time layer
    if (g.qargs.length === 2) {
      const [qa, qb] = g.qargs;
      const A = nodePos[qa], B = nodePos[qb];
      if (A && B) {
        const linkMat = gateLib.getTwoQConnectorMaterial?.(THREE, g) ??
          new THREE.LineBasicMaterial({ color: 0xff4d4f });
        const linkGeom = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(A.x, A.y, g.t),
          new THREE.Vector3(B.x, B.y, g.t)
        ]);
        scene.add(new THREE.Line(linkGeom, linkMat));
      }
    }
  });
}
function makeLabel(THREE, text, {
  fontSize = 12,          // smaller text
  padding  = 2,           // tight plate
  bgAlpha  = 0.0,         // fully transparent plate
  textColor = '#e5e7eb',
  strokeColor = 'rgba(0,0,0,0.65)', // subtle outline for contrast
  scale = 1.8,            // overall sprite scale
} = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // measure
  ctx.font = `${fontSize}px Arial`;
  const m = ctx.measureText(text);
  const w = Math.max(2, Math.ceil(m.width + padding * 2));
  const h = Math.ceil(fontSize + padding * 2);

  canvas.width = w;
  canvas.height = h;

  // transparent plate (bgAlpha=0 => invisible)
  ctx.fillStyle = `rgba(15, 23, 42, ${bgAlpha})`;
  ctx.fillRect(0, 0, w, h);

  // optional subtle border if you set bgAlpha > 0
  if (bgAlpha > 0) {
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.8)';
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  }

  // text with a faint stroke to pop on any background
  ctx.font = `${fontSize}px Arial`;
  ctx.lineWidth = 2;
  ctx.strokeStyle = strokeColor;
  ctx.strokeText(text, padding, padding + fontSize * 0.8);
  ctx.fillStyle = textColor;
  ctx.fillText(text, padding, padding + fontSize * 0.8);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });

  // critical bits so labels don't occlude spheres/edges
  mat.depthTest = false;
  mat.depthWrite = false;

  const sp = new THREE.Sprite(mat);
  sp.scale.set((w / 32) * scale, (h / 32) * scale, 1);
  sp.renderOrder = 9999; // draw last-on-top without z-fighting
  return sp;
}
