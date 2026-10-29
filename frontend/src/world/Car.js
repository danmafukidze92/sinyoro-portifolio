import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/**
 * Four-door performance saloon in the spirit of a tuned 2018 E63 S:
 * long bonnet, fastback roofline, wide stance, quad exhaust, diffuser and lip spoiler.
 * Original low-poly model — no manufacturer badging.
 *
 * Local axes: +X = forward, +Y = up, +Z = right side.
 */

export const PAINTS = [
  { name: 'Diamond White', color: '#f2f3f1', metalness: 0.35, roughness: 0.22 },
  { name: 'Selenite Grey', color: '#7d838b', metalness: 0.75, roughness: 0.26 },
  { name: 'Obsidian Black', color: '#16181c', metalness: 0.7, roughness: 0.28 },
  { name: 'Magno Grey', color: '#5d6168', metalness: 0.15, roughness: 0.62 },
  { name: 'Hyacinth Red', color: '#7d1020', metalness: 0.65, roughness: 0.3 },
  { name: 'Sunset Copper', color: '#b4532a', metalness: 0.7, roughness: 0.3 },
];

// Proportions from the real car: 4,988 L × 1,907 W × 1,463 H mm, 2,939 mm wheelbase, 265/35 R20 tyres
const WHEEL_RADIUS = 0.35;
const WHEEL_WIDTH = 0.29;
const AXLE_X = 1.47;
const TRACK_Z = 0.82;

function sideShape(points) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  return s;
}

/** Pull the upper part of a cabin inwards (tumblehome) so the glasshouse tapers like a real saloon. */
function taper(geo, fromY, amount) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > fromY) pos.setZ(i, pos.getZ(i) * (1 - (y - fromY) * amount));
  }
  geo.computeVertexNormals();
  return geo;
}

function extrude(shape, width, bevel = 0.06, curveSegments = 8) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 3,
    curveSegments,
  });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.computeVertexNormals();
  return g;
}

function buildBodyShape() {
  // Lower body silhouette (side view) with wheel-arch cut-outs along the bottom.
  const s = new THREE.Shape();
  const r = WHEEL_RADIUS + 0.075;
  const yb = 0.17; // sill (≈130 mm ride height)
  s.moveTo(2.42, yb);                               // front splitter
  s.quadraticCurveTo(2.52, 0.3, 2.5, 0.46);         // bumper face
  s.quadraticCurveTo(2.48, 0.64, 2.36, 0.72);       // headlight line
  s.quadraticCurveTo(2.0, 0.8, 1.0, 0.9);           // long bonnet up to the cowl
  s.lineTo(-1.2, 0.96);                             // shoulder / beltline
  s.quadraticCurveTo(-1.9, 1.0, -2.3, 0.995);       // short trunk deck
  s.lineTo(-2.43, 0.98);                            // integrated lip
  s.quadraticCurveTo(-2.5, 0.8, -2.49, 0.58);       // tail
  s.quadraticCurveTo(-2.48, 0.28, -2.38, yb + 0.02);// rear bumper
  s.lineTo(-AXLE_X - r, yb);
  s.absarc(-AXLE_X, WHEEL_RADIUS, r, Math.PI, 0, true);
  s.lineTo(AXLE_X - r, yb);
  s.absarc(AXLE_X, WHEEL_RADIUS, r, Math.PI, 0, true);
  s.lineTo(2.42, yb);
  return s;
}

function buildCabinShape() {
  // glasshouse: steep-raked screen, arched roof, long sloping rear glass
  const s = new THREE.Shape();
  s.moveTo(1.02, 0.88);
  s.quadraticCurveTo(0.45, 1.25, 0.05, 1.42);  // windscreen
  s.quadraticCurveTo(-0.45, 1.5, -0.98, 1.41);  // roof arc
  s.quadraticCurveTo(-1.5, 1.2, -1.92, 0.99);   // rear screen
  s.lineTo(-1.7, 0.93);
  s.lineTo(0.9, 0.86);
  return s;
}

function buildRoofShape() {
  const s = new THREE.Shape();
  s.moveTo(0.12, 1.39);
  s.quadraticCurveTo(-0.45, 1.5, -1.02, 1.385);
  s.lineTo(-0.98, 1.43);
  s.quadraticCurveTo(-0.45, 1.535, 0.06, 1.435);
  s.closePath();
  return s;
}

function makeWheelMesh(materials) {
  const g = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 28, 1), materials.tyre);
  tyre.rotation.x = Math.PI / 2;
  tyre.castShadow = true;
  g.add(tyre);

  // Rim: dished face with 10 thin spokes (multi-spoke forged look)
  const rimR = WHEEL_RADIUS * 0.76;
  const face = new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR, WHEEL_WIDTH + 0.01, 28, 1), materials.rimDark);
  face.rotation.x = Math.PI / 2;
  g.add(face);
  const spokes = new THREE.Group();
  for (let i = 0; i < 20; i++) {
    // 10 twin spokes, slightly offset for a forged multi-spoke look
    const a = (Math.floor(i / 2) / 10) * Math.PI * 2 + (i % 2 ? 0.09 : -0.09);
    const sp = new THREE.Mesh(new THREE.BoxGeometry(rimR * 0.9, 0.03, 0.03), materials.rim);
    sp.position.set(Math.cos(a) * rimR * 0.5, Math.sin(a) * rimR * 0.5, 0);
    sp.rotation.z = a;
    spokes.add(sp);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12), materials.rim);
  hub.rotation.x = Math.PI / 2;
  spokes.add(hub);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(rimR, 0.018, 6, 28), materials.rim);
  spokes.add(lip);
  g.userData.spokes = spokes;
  g.add(spokes);
  return g;
}

export class Car {
  constructor(scene, world, envMap) {
    this.scene = scene;
    this.world = world;
    this.paintIndex = 0;

    this.materials = {
      paint: new THREE.MeshStandardMaterial({ envMap, envMapIntensity: 1.1 }),
      glass: new THREE.MeshStandardMaterial({ color: '#0b0e12', metalness: 0.9, roughness: 0.08, envMap, envMapIntensity: 1.4 }),
      trim: new THREE.MeshStandardMaterial({ color: '#0d0e10', metalness: 0.3, roughness: 0.55 }),
      carbon: new THREE.MeshStandardMaterial({ color: '#1c1e22', metalness: 0.5, roughness: 0.35, envMap }),
      chrome: new THREE.MeshStandardMaterial({ color: '#d7dbe0', metalness: 1, roughness: 0.18, envMap }),
      tyre: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.9 }),
      rim: new THREE.MeshStandardMaterial({ color: '#b9bdc2', metalness: 0.9, roughness: 0.25, envMap }),
      rimDark: new THREE.MeshStandardMaterial({ color: '#0e0f11', metalness: 0.4, roughness: 0.6 }),
      caliper: new THREE.MeshStandardMaterial({ color: '#c8102e', roughness: 0.4 }),
      head: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#e8f4ff', emissiveIntensity: 2.2 }),
      tail: new THREE.MeshStandardMaterial({ color: '#4a0006', emissive: '#ff1a2a', emissiveIntensity: 0.9 }),
      flame: new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    };
    this.setPaint(0);

    this.buildMesh();
    this.buildPhysics();

    this.steer = 0;
    this.input = { forward: 0, back: 0, left: 0, right: 0, brake: 0, boost: 0 };
    this.flameTimer = 0;
  }

  setPaint(i) {
    this.paintIndex = (i + PAINTS.length) % PAINTS.length;
    const p = PAINTS[this.paintIndex];
    this.materials.paint.color.set(p.color);
    this.materials.paint.metalness = p.metalness;
    this.materials.paint.roughness = p.roughness;
    return p;
  }

  nextPaint() { return this.setPaint(this.paintIndex + 1); }

  buildMesh() {
    const m = this.materials;
    const car = new THREE.Group();
    const body = new THREE.Group();
    body.position.y = -0.7; // mesh ground (y=0) relative to chassis body centre at rest
    car.add(body);

    const add = (mesh, parent = body) => { mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh; };

    add(new THREE.Mesh(extrude(buildBodyShape(), 1.91, 0.1, 16), m.paint));
    const cabin = add(new THREE.Mesh(taper(extrude(buildCabinShape(), 1.7, 0.08, 12), 0.9, 0.5), m.glass));
    cabin.position.y = 0.004;
    this.roof = add(new THREE.Mesh(taper(extrude(buildRoofShape(), 1.6, 0.04, 12), 0.9, 0.5), m.paint));

    for (const z of [-1, 1]) {
      // chrome window surround along the beltline
      const dlo = add(new THREE.Mesh(new THREE.BoxGeometry(2.75, 0.022, 0.03), m.chrome));
      dlo.position.set(-0.42, 0.935, z * 0.815); dlo.rotation.z = 0.025;
      // B and C pillars in gloss black so the side reads as two windows
      const b = add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.44, 0.03), m.trim));
      b.position.set(-0.38, 1.16, z * 0.74); b.rotation.x = z * 0.22;
      // shoulder crease + lower character line
      const crease = add(new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.018, 0.02), m.paint));
      crease.position.set(-0.1, 0.82, z * 0.958);
      // mirrors on stalks
      const mirror = add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.18), m.paint));
      mirror.position.set(0.78, 1.0, z * 1.06);
      // side skirt with lip
      const skirt = add(new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.08, 0.07), m.carbon));
      skirt.position.set(0, 0.19, z * 0.95);
      // power domes on the bonnet
      const dome = add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.035, 0.05), m.paint));
      dome.position.set(1.62, 0.84, z * 0.3); dome.rotation.z = 0.075;
      // door handles
      for (const hx of [0.25, -0.75]) {
        const h = add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.02), m.chrome));
        h.position.set(hx, 0.86, z * 0.962);
      }
    }

    // Front (body bevel pushes the nose out to x≈2.58): grille, outer intakes with blades, splitter, LED lights
    const grille = add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.8), m.trim));
    grille.position.set(2.58, 0.54, 0);
    for (let i = -2; i <= 2; i++) {
      const slat = add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.016, 0.76), m.chrome));
      slat.position.set(2.615, 0.54 + i * 0.045, 0);
    }
    for (const z of [-1, 1]) {
      const intake = add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.42), m.trim));
      intake.position.set(2.585, 0.3, z * 0.6);
      for (let k = 0; k < 2; k++) {
        const blade = add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.022, 0.4), m.carbon));
        blade.position.set(2.62, 0.25 + k * 0.09, z * 0.6);
      }
      // swept headlight: dark lens with a bright LED strip, following the nose
      const lens = add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.44), m.glass));
      lens.position.set(2.47, 0.69, z * 0.63); lens.rotation.y = z * -0.32; lens.rotation.z = 0.22;
      const led = add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.42), m.head));
      led.position.set(2.53, 0.68, z * 0.63); led.rotation.y = z * -0.32;
    }
    const centreIntake = add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.6), m.trim));
    centreIntake.position.set(2.59, 0.27, 0);
    const splitter = add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 1.9), m.carbon));
    splitter.position.set(2.52, 0.16, 0);

    // Rear: LED tail strips, diffuser with fins, quad tips, lip spoiler
    for (const z of [-0.62, 0.62]) {
      const tail = add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.62), m.tail));
      tail.position.set(-2.575, 0.84, z * 1.04);
      const wrapL = add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.05), m.tail));
      wrapL.position.set(-2.34, 0.84, z * 1.53);
    }
    const tailBar = add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.025, 0.64), m.tail));
    tailBar.position.set(-2.585, 0.84, 0);
    const spoiler = add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 1.5), m.carbon));
    spoiler.position.set(-2.45, 1.05, 0); spoiler.rotation.z = -0.25;
    const diffuser = add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 1.4), m.carbon));
    diffuser.position.set(-2.46, 0.22, 0);
    for (let i = -2; i <= 2; i++) {
      const fin = add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.02), m.trim));
      fin.position.set(-2.52, 0.2, i * 0.17);
    }
    this.exhaustTips = [];
    for (const z of [-0.74, -0.56, 0.56, 0.74]) {
      const tip = add(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.18, 14, 1, true), m.chrome));
      tip.rotation.z = Math.PI / 2;
      tip.position.set(-2.55, 0.25, z);
      const inner = add(new THREE.Mesh(new THREE.CircleGeometry(0.045, 12), m.trim));
      inner.position.set(-2.635, 0.25, z); inner.rotation.y = -Math.PI / 2;
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.42, 10, 1, true), m.flame);
      flame.rotation.z = Math.PI / 2;
      flame.position.set(-2.86, 0.25, z);
      body.add(flame);
      this.exhaustTips.push(flame);
    }

    // Number plate (blank, with site name)
    const plateTex = makePlateTexture();
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.12), new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.6 }));
    plate.position.set(-2.58, 0.6, 0); plate.rotation.y = -Math.PI / 2;
    body.add(plate);
    const fplate = plate.clone(); fplate.position.set(2.625, 0.42, 0); fplate.rotation.y = Math.PI / 2;
    body.add(fplate);

    // Wheels (separate meshes driven by the physics wheels) + brake calipers on the body
    this.wheelMeshes = [];
    for (let i = 0; i < 4; i++) {
      const w = makeWheelMesh(m);
      this.scene.add(w);
      this.wheelMeshes.push(w);
    }
    for (const [x, z] of [[AXLE_X, TRACK_Z], [AXLE_X, -TRACK_Z], [-AXLE_X, TRACK_Z], [-AXLE_X, -TRACK_Z]]) {
      const cal = add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.08), m.caliper));
      cal.position.set(x + 0.11, WHEEL_RADIUS + 0.09, z * 0.9);
    }

    this.mesh = car;
    this.body = body;
    this.buildInterior(body);
    this.scene.add(car);
  }

  /** Cockpit for the driver's-seat camera (right-hand drive, as in Zimbabwe). Driver sits on +Z. */
  buildInterior(body) {
    const dz = 0.38;
    const env = this.materials.chrome.envMap;
    const black = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.7 });
    const softBlack = new THREE.MeshStandardMaterial({ color: '#1d1d1f', roughness: 0.85 });
    const gloss = new THREE.MeshStandardMaterial({ color: '#0a0a0b', roughness: 0.15, metalness: 0.3, envMap: env });
    const alu = new THREE.MeshStandardMaterial({ color: '#b8bcc2', metalness: 0.95, roughness: 0.28, envMap: env });
    const brushed = new THREE.MeshStandardMaterial({ color: '#c3c7cc', metalness: 0.8, roughness: 0.4, envMap: env });
    const liner = new THREE.MeshStandardMaterial({ color: '#2b2b2e', roughness: 0.95, side: THREE.DoubleSide });
    const inner = new THREE.Group();
    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); inner.add(m); return m;
    };

    // cabin floor / tub (hides the body's top surface from inside)
    add(new THREE.BoxGeometry(2.6, 0.04, 1.84), softBlack, -0.45, 0.985, 0);
    // headliner just under the roof
    add(new THREE.BoxGeometry(1.38, 0.02, 1.6), liner, -0.61, 1.4, 0);

    // dashboard: lower body, soft top, cowl sloping to the screen
    add(new THREE.BoxGeometry(0.42, 0.17, 1.62), black, 0.84, 1.06, 0);
    add(new THREE.BoxGeometry(0.42, 0.03, 1.6), softBlack, 0.9, 1.15, 0, 0, 0, -0.18);
    // silver trim band running the full width
    add(new THREE.BoxGeometry(0.02, 0.085, 1.58), brushed, 0.625, 1.07, 0);
    // four round turbine vents in the middle + one at each end
    const vent = (z, r) => {
      add(new THREE.TorusGeometry(r, r * 0.16, 8, 24), alu, 0.618, 1.07, z, 0, Math.PI / 2, 0);
      add(new THREE.CircleGeometry(r * 0.9, 24), gloss, 0.62, 1.07, z, 0, -Math.PI / 2, 0);
      for (let k = 0; k < 6; k++) add(new THREE.BoxGeometry(0.004, r * 1.6, 0.008), brushed, 0.612, 1.07, z, k * (Math.PI / 6), 0, 0);
    };
    [-0.2, -0.067, 0.067, 0.2].forEach((z) => vent(z, 0.034));
    vent(-0.74, 0.05); vent(0.74, 0.05);

    // one wide glass panel: media/nav on the left, instrument cluster behind the wheel
    this.clusterCanvas = document.createElement('canvas');
    this.clusterCanvas.width = 2048; this.clusterCanvas.height = 420;
    this.clusterTex = new THREE.CanvasTexture(this.clusterCanvas);
    this.clusterTex.colorSpace = THREE.SRGBColorSpace;
    add(new THREE.BoxGeometry(0.02, 0.25, 1.18), gloss, 0.7, 1.27, 0.24);
    add(new THREE.PlaneGeometry(1.15, 0.235), new THREE.MeshBasicMaterial({ map: this.clusterTex, toneMapped: false }), 0.689, 1.27, 0.24, 0, -Math.PI / 2, 0);

    // centre stack + console with control panel and touchpad
    add(new THREE.BoxGeometry(0.06, 0.16, 0.26), gloss, 0.6, 0.95, 0);
    add(new THREE.BoxGeometry(0.01, 0.02, 0.22), alu, 0.568, 0.99, 0);
    add(new THREE.CylinderGeometry(0.018, 0.018, 0.01, 16), alu, 0.566, 0.955, 0, 0, 0, Math.PI / 2);
    // centre stack: control button row, analogue clock, drive-mode panel
    add(new THREE.BoxGeometry(0.02, 0.03, 0.22), gloss, 0.612, 1.005, 0);
    for (let k = -3; k <= 3; k++) add(new THREE.BoxGeometry(0.008, 0.012, 0.022), brushed, 0.6, 1.005, k * 0.03);
    const clockTex = new THREE.CanvasTexture(makeClockCanvas());
    clockTex.colorSpace = THREE.SRGBColorSpace;
    add(new THREE.CircleGeometry(0.028, 32), new THREE.MeshBasicMaterial({ map: clockTex }), 0.6, 0.965, 0, 0, -Math.PI / 2, 0);
    add(new THREE.TorusGeometry(0.03, 0.004, 8, 32), alu, 0.6, 0.965, 0, 0, Math.PI / 2, 0);
    add(new THREE.BoxGeometry(0.62, 0.12, 0.26), black, 0.25, 1.03, 0);
    add(new THREE.BoxGeometry(0.3, 0.012, 0.2), gloss, 0.36, 1.095, 0);
    add(new THREE.BoxGeometry(0.1, 0.014, 0.08), brushed, 0.3, 1.1, 0);
    add(new THREE.BoxGeometry(0.3, 0.04, 0.26), softBlack, -0.12, 1.11, 0);  // armrest

    // door tops with silver trim and handles
    for (const z of [-1, 1]) {
      add(new THREE.BoxGeometry(1.5, 0.07, 0.12), black, 0.0, 1.0, z * 0.79);
      add(new THREE.BoxGeometry(1.2, 0.008, 0.008), brushed, -0.1, 1.04, z * 0.75);
      add(new THREE.BoxGeometry(0.12, 0.025, 0.02), alu, 0.35, 1.0, z * 0.72);
      // A-pillars along the windscreen edge
      add(new THREE.BoxGeometry(0.03, 1.05, 0.04), softBlack, 0.55, 1.16, z * 0.7, 0, 0, 1.06);
      // seats (black, grey stitching)
      add(new THREE.BoxGeometry(0.5, 0.12, 0.5), black, -0.08, 1.04, z * dz);
      add(new THREE.BoxGeometry(0.12, 0.62, 0.5), black, -0.38, 1.33, z * dz, 0, 0, 0.16);
      add(new THREE.BoxGeometry(0.125, 0.5, 0.01), brushed, -0.375, 1.33, z * dz, 0, 0, 0.16);
    }
    add(new THREE.BoxGeometry(0.03, 0.06, 0.24), black, 0.4, 1.36, 0); // rear-view mirror

    // steering wheel: thick black rim, flattened bottom, silver 3-spoke, paddles, plain hub
    const wheel = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.025, 12, 40, Math.PI * 1.6), black);
    rim.rotation.z = -Math.PI * 0.3; wheel.add(rim);
    const flat = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.045, 0.045), black);
    flat.position.y = -0.155; wheel.add(flat);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.05), alu);
    top.position.y = 0.18; wheel.add(top);
    for (const [x, y, w, r] of [[-0.09, 0, 0.17, 0], [0.09, 0, 0.17, 0], [0, -0.085, 0.06, Math.PI / 2]]) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, 0.02), alu);
      sp.position.set(x, y, 0.005); sp.rotation.z = r; wheel.add(sp);
    }
    for (const x of [-0.055, 0.055]) { // thumb button pads
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.035, 0.012), gloss);
      pad.position.set(x, 0.02, 0.018); wheel.add(pad);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.04, 24), black);
    hub.rotation.x = Math.PI / 2; wheel.add(hub);
    for (const x of [-0.14, 0.14]) {
      const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.008), alu);
      paddle.position.set(x, 0.03, -0.04); wheel.add(paddle);
    }
    const wheelMount = new THREE.Group();
    wheelMount.position.set(0.44, 1.14, dz);
    wheelMount.rotation.order = 'ZYX';
    wheelMount.rotation.set(0, -Math.PI / 2, -0.3);
    wheelMount.add(wheel);
    inner.add(wheelMount);
    this.steeringWheel = wheel;
    add(new THREE.CylinderGeometry(0.035, 0.05, 0.22, 12), black, 0.56, 1.11, dz, 0, 0, Math.PI / 2 + 0.3);

    // daylight bouncing into the cabin (only on in cockpit view)
    this.cabinLight = new THREE.PointLight('#fff4e6', 0, 3.2, 1.5);
    this.cabinLight.position.set(0.1, 1.33, 0);
    inner.add(this.cabinLight);

    inner.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
    body.add(inner);
    this.interior = inner;
    this.eye = new THREE.Vector3(-0.3, 1.27, dz);
    this.drawCluster(0, 800, 'N', 0);
  }

  /** Redraw the wide display: media/nav on the left, digital instruments on the right (behind the wheel). */
  drawCluster(kmh, rpm, gear, boost) {
    const c = this.clusterCanvas; if (!c) return;
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height, half = W / 2;
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0b1220'); bg.addColorStop(1, '#03060c');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // --- left: media tile + map
    ctx.fillStyle = '#121a2a'; ctx.fillRect(40, 60, 420, 300);
    const art = ctx.createLinearGradient(60, 80, 220, 240);
    art.addColorStop(0, '#ff5d73'); art.addColorStop(1, '#4fb3ff');
    ctx.fillStyle = art; ctx.fillRect(64, 90, 150, 150);
    ctx.fillStyle = '#fff'; ctx.font = '600 30px "Bricolage Grotesque Variable", sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('Now playing', 236, 130);
    ctx.fillStyle = '#9fb0c8'; ctx.font = '400 24px "JetBrains Mono", monospace';
    ctx.fillText('V8 Biturbo · Live', 236, 170);
    ctx.fillStyle = '#2b3a55'; ctx.fillRect(64, 290, 370, 6);
    ctx.fillStyle = '#4fb3ff'; ctx.fillRect(64, 290, 140, 6);
    // map
    ctx.fillStyle = '#16233a'; ctx.fillRect(490, 60, 470, 300);
    ctx.strokeStyle = '#2f4566'; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(520, 330); ctx.lineTo(640, 200); ctx.lineTo(820, 230); ctx.lineTo(930, 90); ctx.stroke();
    ctx.strokeStyle = '#4fb3ff'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(520, 330); ctx.lineTo(640, 200); ctx.lineTo(760, 220); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(760, 220, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#9fb0c8'; ctx.font = '400 22px "JetBrains Mono", monospace';
    ctx.fillText('nexigent-labs.co.zw', 510, 100);

    // --- right: twin round dials + digital speed
    const dial = (cx, val, max, label, red) => {
      const r = 120, cy = 210;
      const face = ctx.createRadialGradient(cx, cy, 10, cx, cy, r);
      face.addColorStop(0, '#16233a'); face.addColorStop(1, '#070d18');
      ctx.fillStyle = face; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 6; ctx.strokeStyle = '#c9d0d8';
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.font = '500 22px "JetBrains Mono", monospace'; ctx.fillStyle = '#c9d3e0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i <= 7; i++) {
        const a2 = Math.PI * 0.75 + (Math.PI * 1.5 * i) / 7;
        ctx.fillText(String(Math.round((max / 7) * i / (max > 1000 ? 1000 : 1))), cx + Math.cos(a2) * (r - 46), cy + Math.sin(a2) * (r - 46));
      }
      for (let i = 0; i <= 10; i++) {
        const a = Math.PI * 0.75 + (Math.PI * 1.5 * i) / 10;
        ctx.strokeStyle = red && i >= 9 ? '#ff2a3a' : '#c9d3e0'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (r - 8), cy + Math.sin(a) * (r - 8));
        ctx.lineTo(cx + Math.cos(a) * (r - 24), cy + Math.sin(a) * (r - 24)); ctx.stroke();
      }
      const f = Math.min(1, val / max), a = Math.PI * 0.75 + Math.PI * 1.5 * f;
      ctx.strokeStyle = '#ff2a3a'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * (r - 18), cy + Math.sin(a) * (r - 18)); ctx.stroke();
      ctx.fillStyle = '#0b1220'; ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#9fb0c8'; ctx.textAlign = 'center'; ctx.font = '400 20px "JetBrains Mono", monospace';
      ctx.fillText(label, cx, cy + 70);
    };
    dial(half + 230, rpm, 7000, '×1000 rpm', true);
    dial(W - 230, kmh, 300, 'km/h', false);
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    ctx.font = '800 110px "Bricolage Grotesque Variable", sans-serif'; ctx.fillText(String(Math.round(kmh)), half + 512, 220);
    ctx.font = '700 46px "Bricolage Grotesque Variable", sans-serif'; ctx.fillStyle = '#ff2a3a';
    ctx.fillText(String(gear), half + 512, 300);
    ctx.font = '500 22px "JetBrains Mono", monospace'; ctx.fillStyle = '#9fb0c8';
    ctx.fillText(this.input?.boost ? 'RACE' : 'SPORT+', half + 512, 80);
    ctx.fillStyle = '#1d2a40'; ctx.fillRect(half + 412, 340, 200, 8);
    ctx.fillStyle = '#4fb3ff'; ctx.fillRect(half + 412, 340, 200 * boost, 8);
    this.clusterTex.needsUpdate = true;
  }

  /** Steering wheel follows the steering input (≈ 4× the road-wheel angle). */
  /** Inside the car the painted roof would show its underside; hide it and let the headliner take over. */
  setCockpit(on) { if (this.roof) this.roof.visible = !on; if (this.cabinLight) this.cabinLight.intensity = on ? 0.9 : 0; }

  updateCockpit() { if (this.steeringWheel) this.steeringWheel.rotation.z = this.steer * 4; }

  buildPhysics() {
    const chassisShape = new CANNON.Box(new CANNON.Vec3(2.4, 0.3, 0.93));
    this.chassis = new CANNON.Body({ mass: 900, material: new CANNON.Material('car') });
    this.chassis.addShape(chassisShape, new CANNON.Vec3(0, 0.1, 0));
    this.chassis.position.set(0, 1.2, 0);
    this.chassis.angularDamping = 0.4;
    this.chassis.linearDamping = 0.06;
    this.chassis.allowSleep = false;

    this.vehicle = new CANNON.RaycastVehicle({
      chassisBody: this.chassis,
      indexRightAxis: 2,
      indexUpAxis: 1,
      indexForwardAxis: 0,
    });

    const opts = {
      radius: WHEEL_RADIUS,
      directionLocal: new CANNON.Vec3(0, -1, 0),
      suspensionStiffness: 42,
      suspensionRestLength: 0.32,
      frictionSlip: 3.2,
      dampingRelaxation: 2.6,
      dampingCompression: 4.6,
      maxSuspensionForce: 200000,
      rollInfluence: 0.04,
      axleLocal: new CANNON.Vec3(0, 0, 1),
      chassisConnectionPointLocal: new CANNON.Vec3(),
      maxSuspensionTravel: 0.3,
      customSlidingRotationalSpeed: -30,
      useCustomSlidingRotationalSpeed: true,
    };
    // 0 FL, 1 FR, 2 RL, 3 RR
    const pts = [[AXLE_X, -0.12, -TRACK_Z], [AXLE_X, -0.12, TRACK_Z], [-AXLE_X, -0.12, -TRACK_Z], [-AXLE_X, -0.12, TRACK_Z]];
    for (const [x, y, z] of pts) {
      opts.chassisConnectionPointLocal = new CANNON.Vec3(x, y, z);
      this.vehicle.addWheel({ ...opts });
    }
    this.vehicle.addToWorld(this.world);
    this.baseFriction = opts.frictionSlip;
  }

  /** Place the car at x,z facing `heading` radians (0 = +X). */
  reset(x = 0, z = 0, heading = 0) {
    const b = this.chassis;
    b.position.set(x, 1.4, z);
    b.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), heading);
    b.velocity.setZero();
    b.angularVelocity.setZero();
  }

  get speed() {
    // signed forward speed (m/s)
    const v = this.chassis.velocity;
    const fwd = this.chassis.quaternion.vmult(new CANNON.Vec3(1, 0, 0));
    return v.x * fwd.x + v.y * fwd.y + v.z * fwd.z;
  }

  get heading() {
    const fwd = this.chassis.quaternion.vmult(new CANNON.Vec3(1, 0, 0));
    return Math.atan2(-fwd.z, fwd.x);
  }

  /** Called before each physics step. Returns the throttle amount (0..1) for the audio engine. */
  update(dt) {
    const i = this.input;
    const v = this.speed;
    const absV = Math.abs(v);
    const throttle = Math.max(i.forward, i.back);
    const maxSpeed = i.boost ? 42 : 32;

    // Steering: tighter at low speed, calmer at high speed
    const steerTarget = (i.left - i.right) * (0.62 - Math.min(absV / 60, 0.36));
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 9);
    this.vehicle.setSteeringValue(this.steer, 0);
    this.vehicle.setSteeringValue(this.steer, 1);

    // Engine (AWD with rear bias). Positive force drives toward +X.
    let force = 0;
    if (i.forward) {
      if (v < -0.5) { this.brakeAll(28); } // braking from reverse
      else if (v < maxSpeed) force = (i.boost ? 7800 : 5600) * i.forward;
    } else if (i.back) {
      if (v > 0.5) { this.brakeAll(32); }
      else if (v > -12) force = -3200 * i.back;
    }
    const engaged = force !== 0;
    if (engaged || (!i.forward && !i.back)) this.brakeAll(0);
    if (!throttle) this.brakeAll(3.5); // engine braking / rolling resistance

    this.vehicle.applyEngineForce(force * 0.35, 0);
    this.vehicle.applyEngineForce(force * 0.35, 1);
    this.vehicle.applyEngineForce(force * 0.65, 2);
    this.vehicle.applyEngineForce(force * 0.65, 3);

    // Handbrake: lock rears and loosen rear grip → drift
    if (i.brake) {
      this.vehicle.setBrake(60, 2);
      this.vehicle.setBrake(60, 3);
      this.vehicle.wheelInfos[2].frictionSlip = this.baseFriction * 0.45;
      this.vehicle.wheelInfos[3].frictionSlip = this.baseFriction * 0.45;
    } else {
      this.vehicle.wheelInfos[2].frictionSlip = this.baseFriction;
      this.vehicle.wheelInfos[3].frictionSlip = this.baseFriction;
    }

    // Recover if flipped over
    const up = this.chassis.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
    if (up.y < 0.2 && absV < 2) {
      this.flipTimer = (this.flipTimer || 0) + dt;
      if (this.flipTimer > 1.5) { this.reset(this.chassis.position.x, this.chassis.position.z, this.heading); this.flipTimer = 0; }
    } else this.flipTimer = 0;

    return i.forward ? i.forward : 0;
  }

  brakeAll(v) { for (let w = 0; w < 4; w++) this.vehicle.setBrake(v, w); }

  /** Called from the audio engine when the exhaust pops. */
  flash(strength = 1) { this.flameTimer = 0.09 * strength; this.flameStrength = strength; }

  sync(dt) {
    this.mesh.position.copy(this.chassis.position);
    this.mesh.quaternion.copy(this.chassis.quaternion);
    for (let w = 0; w < 4; w++) {
      this.vehicle.updateWheelTransform(w);
      const t = this.vehicle.wheelInfos[w].worldTransform;
      const mesh = this.wheelMeshes[w];
      mesh.position.copy(t.position);
      mesh.quaternion.copy(t.quaternion);
      // spokes face outward on the right-hand wheels
      mesh.userData.spokes.position.z = (w % 2 === 1 ? 1 : -1) * (WHEEL_WIDTH / 2 + 0.006);
    }
    // exhaust flames
    if (this.flameTimer > 0) {
      this.flameTimer -= dt;
      const o = Math.max(0, this.flameTimer / 0.09) * 0.95 * (this.flameStrength || 1);
      this.materials.flame.opacity = o;
      for (const f of this.exhaustTips) f.scale.set(1, 0.6 + Math.random() * 0.8, 1);
    } else this.materials.flame.opacity = 0;
    // brake lights glow when braking
    const braking = this.input.brake || (this.input.back && this.speed > 0.5);
    this.materials.tail.emissiveIntensity = braking ? 3.2 : 0.9;
  }
}

function makeClockCanvas() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e9ecef'; ctx.beginPath(); ctx.arc(64, 64, 64, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#222'; ctx.lineWidth = 3;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(64 + Math.cos(a) * 50, 64 + Math.sin(a) * 50); ctx.lineTo(64 + Math.cos(a) * 58, 64 + Math.sin(a) * 58); ctx.stroke();
  }
  ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(64, 64); ctx.lineTo(64, 28); ctx.stroke();
  ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(64, 64); ctx.lineTo(94, 76); ctx.stroke();
  return c;
}

function makePlateTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 60;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f4f1e8'; ctx.fillRect(0, 0, 256, 60);
  ctx.strokeStyle = '#111'; ctx.lineWidth = 4; ctx.strokeRect(3, 3, 250, 54);
  ctx.fillStyle = '#111';
  ctx.font = '700 30px "JetBrains Mono", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('DRM · 92', 128, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
