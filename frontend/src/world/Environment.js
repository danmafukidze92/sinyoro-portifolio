import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { canvasTexture } from './textures.js';

export const COLORS = {
  ground: '#d4915e',
  groundDark: '#b8744a',
  road: '#5b3a2a',
  skyTop: '#2a2350',
  skyMid: '#b2577a',
  horizon: '#f6b27a',
  rock: '#8f8580',
  bark: '#7a5a48',
  leaf: '#4f6b3a',
  leafLight: '#7c9550',
};

/** Seeded RNG so the world looks the same on every visit. */
export function rng(seed = 1992) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Environment {
  constructor(scene, world, physicsSync) {
    this.scene = scene;
    this.world = world;
    this.sync = physicsSync;
    this.groundMaterial = new CANNON.Material('ground');
    this.buildSky();
    this.buildLights();
    this.buildGround();
  }

  buildSky() {
    const geo = new THREE.SphereGeometry(400, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(COLORS.skyTop) },
        mid: { value: new THREE.Color(COLORS.skyMid) },
        horizon: { value: new THREE.Color(COLORS.horizon) },
        sunDir: { value: new THREE.Vector3(-0.6, 0.18, 0.78).normalize() },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 sunDir;
        varying vec3 vDir;
        void main(){
          float h = clamp(vDir.y, -0.2, 1.0);
          vec3 c = mix(horizon, mid, smoothstep(0.0, 0.25, h));
          c = mix(c, top, smoothstep(0.2, 0.75, h));
          float sun = max(dot(normalize(vDir), sunDir), 0.0);
          c += vec3(1.0, 0.75, 0.45) * pow(sun, 220.0) * 2.2;   // sun disc
          c += vec3(1.0, 0.6, 0.35) * pow(sun, 8.0) * 0.35;     // glow
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.scene.add(this.sky);
    this.scene.fog = new THREE.Fog(new THREE.Color(COLORS.horizon).lerp(new THREE.Color(COLORS.ground), 0.25), 70, 260);
  }

  buildLights() {
    const hemi = new THREE.HemisphereLight('#ffd7b0', '#6a3b24', 1.25);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight('#ffe2bf', 2.6);
    sun.position.set(-30, 40, 38);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = 34;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 140 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun, sun.target);
    this.sun = sun;
    this.sunOffset = sun.position.clone();
  }

  /** Keep the shadow frustum centred on the car. */
  follow(pos) {
    this.sun.position.set(pos.x + this.sunOffset.x, this.sunOffset.y, pos.z + this.sunOffset.z);
    this.sun.target.position.set(pos.x, 0, pos.z);
  }

  buildGround() {
    const tex = canvasTexture(512, 512, (ctx, w, h) => {
      ctx.fillStyle = COLORS.ground; ctx.fillRect(0, 0, w, h);
      const r = rng(7);
      for (let i = 0; i < 2600; i++) {
        const a = r();
        ctx.fillStyle = a < 0.5 ? 'rgba(150,85,48,0.10)' : 'rgba(255,220,170,0.10)';
        const s = 2 + r() * 10;
        ctx.beginPath(); ctx.arc(r() * w, r() * h, s, 0, Math.PI * 2); ctx.fill();
      }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(60, 60);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(800, 800),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const body = new CANNON.Body({ mass: 0, material: this.groundMaterial });
    body.addShape(new CANNON.Plane());
    body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(body);

    // Invisible boundary so nobody drives off into the sunset forever
    const R = 175;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const wall = new CANNON.Body({ mass: 0 });
      wall.addShape(new CANNON.Box(new CANNON.Vec3(1, 4, R * Math.tan(Math.PI / 24) + 1)));
      wall.position.set(Math.cos(a) * R, 4, Math.sin(a) * R);
      wall.quaternion.setFromEuler(0, -a, 0);
      this.world.addBody(wall);
    }
  }

  /** Flat road strip from (x1,z1) to (x2,z2). */
  road(x1, z1, x2, z2, width = 7) {
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const tex = canvasTexture(64, 256, (ctx, w, h) => {
      ctx.fillStyle = COLORS.road; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,230,190,0.08)';
      for (let i = 0; i < 120; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      ctx.fillStyle = '#f2c38b';
      ctx.fillRect(w / 2 - 2, 20, 4, 110);
      ctx.fillStyle = 'rgba(242,195,139,0.6)';
      ctx.fillRect(2, 0, 3, h); ctx.fillRect(w - 5, 0, 3, h);
    });
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, len / 10);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, len), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.atan2(dx, dz) + Math.PI; // align plane's length (local y) with the road
    mesh.position.set((x1 + x2) / 2, 0.012, (z1 + z2) / 2);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  /**
   * Scatter baobabs, acacias, granite balancing rocks and grass.
   * `isFree(x, z, radius)` keeps them off roads and zones.
   */
  scatter(isFree) {
    const r = rng(2026);
    const barkMat = new THREE.MeshStandardMaterial({ color: COLORS.bark, roughness: 0.95, flatShading: true });
    const leafMat = new THREE.MeshStandardMaterial({ color: COLORS.leaf, roughness: 0.9, flatShading: true });
    const leafLight = new THREE.MeshStandardMaterial({ color: COLORS.leafLight, roughness: 0.9, flatShading: true });
    const rockMat = new THREE.MeshStandardMaterial({ color: COLORS.rock, roughness: 0.85, flatShading: true });

    const place = (count, radius, minD, maxD, fn) => {
      let placed = 0, tries = 0;
      while (placed < count && tries < count * 40) {
        tries++;
        const a = r() * Math.PI * 2, d = minD + r() * (maxD - minD);
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (!isFree(x, z, radius)) continue;
        fn(x, z);
        placed++;
      }
    };

    // Baobabs
    place(14, 6, 25, 165, (x, z) => {
      const s = 0.8 + r() * 0.6;
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.9 * s, 1.5 * s, 6 * s, 9), barkMat);
      trunk.position.y = 3 * s; g.add(trunk);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + r();
        const br = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.32 * s, 2.4 * s, 5), barkMat);
        br.position.set(Math.cos(a) * 0.9 * s, 6.4 * s, Math.sin(a) * 0.9 * s);
        br.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
        g.add(br);
        const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9 * s, 0), i % 2 ? leafMat : leafLight);
        leaf.position.set(Math.cos(a) * 1.9 * s, 7.4 * s, Math.sin(a) * 1.9 * s);
        leaf.scale.y = 0.6;
        g.add(leaf);
      }
      g.position.set(x, 0, z);
      g.rotation.y = r() * 6;
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.scene.add(g);
      const b = new CANNON.Body({ mass: 0 });
      b.addShape(new CANNON.Cylinder(1.0 * s, 1.5 * s, 6 * s, 8));
      b.position.set(x, 3 * s, z);
      this.world.addBody(b);
    });

    // Acacias (flat-topped)
    place(26, 4, 22, 170, (x, z) => {
      const s = 0.8 + r() * 0.5;
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * s, 0.25 * s, 4 * s, 6), barkMat);
      trunk.position.y = 2 * s; trunk.rotation.z = (r() - 0.5) * 0.3; g.add(trunk);
      const canopy = new THREE.Mesh(new THREE.CylinderGeometry(2.6 * s, 1.6 * s, 0.9 * s, 9), r() > 0.5 ? leafMat : leafLight);
      canopy.position.y = 4.3 * s; g.add(canopy);
      g.position.set(x, 0, z);
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.scene.add(g);
      const b = new CANNON.Body({ mass: 0 });
      b.addShape(new CANNON.Cylinder(0.3, 0.3, 4, 6));
      b.position.set(x, 2, z);
      this.world.addBody(b);
    });

    // Granite kopjes with balancing rocks (a nod to the Matobo / Chiremba stacks)
    place(12, 6, 30, 165, (x, z) => {
      const g = new THREE.Group();
      const base = 1.8 + r() * 1.6;
      const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(base, 0), rockMat);
      boulder.scale.set(1.3, 0.75, 1.1); boulder.position.y = base * 0.45; g.add(boulder);
      let y = base * 0.9;
      const n = 1 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const sz = base * (0.55 - i * 0.1) + r() * 0.3;
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(sz, 0), rockMat);
        rock.scale.set(1.1, 0.7, 1); rock.position.set((r() - 0.5) * 0.4, y + sz * 0.55, (r() - 0.5) * 0.4);
        rock.rotation.set(r(), r(), r());
        g.add(rock);
        y += sz * 1.15;
      }
      g.position.set(x, 0, z);
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.scene.add(g);
      const b = new CANNON.Body({ mass: 0 });
      b.addShape(new CANNON.Sphere(base * 1.15));
      b.position.set(x, 0, z);
      this.world.addBody(b);
    });

    // Grass tufts (instanced, no physics)
    const tuft = new THREE.ConeGeometry(0.18, 0.7, 4);
    tuft.translate(0, 0.35, 0);
    const grassMat = new THREE.MeshStandardMaterial({ color: '#9a8a4a', roughness: 1, flatShading: true });
    const count = 1400;
    const grass = new THREE.InstancedMesh(tuft, grassMat, count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    let n = 0;
    for (let i = 0; i < count * 3 && n < count; i++) {
      const a = r() * Math.PI * 2, d = 10 + r() * 170;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (!isFree(x, z, 1)) continue;
      q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.4, r() * 6, (r() - 0.5) * 0.4));
      const s = 0.6 + r() * 0.9;
      m.compose(p.set(x, 0, z), q, sc.set(s, s * (0.7 + r()), s));
      grass.setMatrixAt(n++, m);
    }
    grass.count = n;
    grass.receiveShadow = true;
    this.scene.add(grass);
  }
}
