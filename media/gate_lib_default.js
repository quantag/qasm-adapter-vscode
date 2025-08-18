// gate_lib_default.js
// A theme that also defines qubit markers and materials.
// Caches geometries/materials for performance.

let cache = null;
function ensure(THREE) {
  if (cache) return cache;
  cache = {
    // geometries
    gBox: new THREE.BoxGeometry(1.2, 1.2, 0.6),
    gSphereQubit: new THREE.SphereGeometry(0.4, 16, 16), // SMALLER qubit spheres
    gCyl: new THREE.CylinderGeometry(0.5, 0.5, 0.6, 24),
    gSphereGate: new THREE.SphereGeometry(0.7, 20, 20),
    gTorus: new THREE.TorusGeometry(0.6, 0.22, 16, 24),
    gPlane: new THREE.PlaneGeometry(220, 220),

    // materials
    mQubit: new THREE.MeshStandardMaterial({ color: 0x5eead4, metalness: 0.2, roughness: 0.6 }),
    mGateBox: new THREE.MeshStandardMaterial({ color: 0xa78bfa, metalness: 0.2, roughness: 0.6 }),
    mGateSphere: new THREE.MeshStandardMaterial({ color: 0x60a5fa, metalness: 0.2, roughness: 0.6 }),
    mGateCyl: new THREE.MeshStandardMaterial({ color: 0x34d399, metalness: 0.2, roughness: 0.6 }),
    mGateTorus: new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.2, roughness: 0.6 }),
    mGate2Q: new THREE.MeshStandardMaterial({ color: 0xf87171, metalness: 0.2, roughness: 0.6 }),
    mPlane: new THREE.MeshBasicMaterial({ color: 0x0f172a, side: THREE.DoubleSide, transparent: true, opacity: 0.5 }),
    mTopology: new THREE.LineBasicMaterial({ color: 0x334155 }),
    mTimeline: new THREE.LineDashedMaterial({ color: 0xaaaaaa, dashSize: 0.18, gapSize: 0.18 }),
    mTwoQLink: new THREE.LineBasicMaterial({ color: 0xff4d4f }),
  };
  return cache;
}

// QUANTUM GATE MESHES
export function getMeshForGate(THREE, gate) {
  const C = ensure(THREE);
  const name = (gate?.name || '').toLowerCase();

  // 1q gates
  if (['h'].includes(name)) return new THREE.Mesh(C.gSphereGate, C.mGateSphere);
  if (['x', 'sx'].includes(name)) return new THREE.Mesh(C.gTorus, C.mGateTorus);
  if (['z','y','t','s','tdg','sdg','rz','ry','rx','u','u1','u2','u3'].includes(name))
    return new THREE.Mesh(C.gCyl, C.mGateCyl);

  // 2q gates
  if (['cx','cnot','cz','ecr','swap','cswap','csx','crx','cry','crz','cp'].includes(name))
    return new THREE.Mesh(C.gBox, C.mGate2Q);

  // fallback
  return new THREE.Mesh(C.gBox, C.mGateBox);
}

// HARDWARE QUIBIT MARKER
export function getQubitMesh(THREE, node) {
  const C = ensure(THREE);
  return new THREE.Mesh(C.gSphereQubit, C.mQubit);
}

// MATERIALS
export function getTopologyMaterial(THREE) {
  return ensure(THREE).mTopology;
}
export function getTimelineMaterial(THREE) {
  return ensure(THREE).mTimeline;
}
export function getTwoQConnectorMaterial(THREE) {
  return ensure(THREE).mTwoQLink;
}

// BACKGROUND PLANE
export function getPlaneMesh(THREE) {
  const C = ensure(THREE);
  const mesh = new THREE.Mesh(C.gPlane, C.mPlane);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(0, 0, -0.1);
  return mesh;
}

// Optional cleanup if you hot-swap libraries a lot
export function dispose() {
  if (!cache) return;
  Object.values(cache).forEach(obj => {
    if (obj?.dispose) try { obj.dispose(); } catch {}
  });
  cache = null;
}

