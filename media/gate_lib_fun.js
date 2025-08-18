// "Fun" library: more playful shapes/colors

export function getMeshForGate(THREE, gate) {
  const name = (gate?.name || '').toLowerCase();

  const dode = () => new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.8),
    new THREE.MeshStandardMaterial({ color: 0x22d3ee, metalness: 0.3, roughness: 0.5 })
  );

  const cone = () => new THREE.Mesh(
    new THREE.ConeGeometry(0.7, 1.0, 20),
    new THREE.MeshStandardMaterial({ color: 0x93c5fd, metalness: 0.2, roughness: 0.6 })
  );

  const knot = () => new THREE.Mesh(
    new THREE.TorusKnotGeometry(0.5, 0.16, 80, 14),
    new THREE.MeshStandardMaterial({ color: 0xf472b6, metalness: 0.4, roughness: 0.5 })
  );

  const oct = () => new THREE.Mesh(
    new THREE.OctahedronGeometry(0.8),
    new THREE.MeshStandardMaterial({ color: 0x34d399, metalness: 0.3, roughness: 0.5 })
  );

  // Map
  if (['h'].includes(name)) return dode();
  if (['x', 'sx'].includes(name)) return knot();
  if (['rz', 'ry', 'rx', 'u', 'u1', 'u2', 'u3'].includes(name)) return cone();
  if (['cx', 'cnot', 'cz', 'swap', 'cswap', 'ecr', 'crx', 'cry', 'crz', 'cp', 'csx'].includes(name)) return oct();

  return dode();
}
