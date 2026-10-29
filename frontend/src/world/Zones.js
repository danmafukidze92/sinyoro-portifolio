import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import fontJson from 'three/examples/fonts/helvetiker_bold.typeface.json';
import { canvasTexture, groundText, roundRect, wrap, FONT_DISPLAY, FONT_MONO } from './textures.js';

const ACCENT = '#ffb347';

/** World layout. +X = east (the career road), -Z = north (projects), +Z = south (skills). */
export const LAYOUT = {
  spawn: { x: 0, z: 0, heading: 0 },
  about: { x: 4, z: -13 },
  letters: { x: 17 },
  experience: { x0: 34, step: 15, z: 0 },
  projects: { x: 0, z: -78, r: 24 },
  skills: { x: 0, z: 62 },
  certs: { x: -66, z: 0 },
  contact: { x: -44, z: -40 },
  bowling: { x: 46, z: 46 },
};

export const TELEPORTS = [
  { id: 'spawn', label: 'Start', x: 0, z: 0, heading: 0 },
  { id: 'about', label: 'About me', x: 4, z: -6, heading: Math.PI / 2 },
  { id: 'experience', label: 'Career road', x: 24, z: 0, heading: 0 },
  { id: 'projects', label: 'Projects', x: 0, z: -48, heading: Math.PI / 2 },
  { id: 'skills', label: 'Skills', x: 0, z: 40, heading: -Math.PI / 2 },
  { id: 'certs', label: 'Certifications', x: -42, z: 0, heading: Math.PI },
  { id: 'contact', label: 'Contact', x: -30, z: -28, heading: Math.PI * 0.75 },
];

export class Zones {
  constructor(scene, world, env, data, dynamic) {
    this.scene = scene;
    this.world = world;
    this.env = env;
    this.data = data;
    this.dynamic = dynamic; // [{mesh, body}] synced every frame
    this.triggers = [];     // {id, kind, x, z, r, payload}
    this.spinners = [];
    this.obstacles = [];    // {x, z, r} for scatter exclusion
    this.font = new FontLoader().parse(fontJson);

    this.mat = {
      pad: new THREE.MeshStandardMaterial({ color: '#3a2318', roughness: 0.7 }),
      post: new THREE.MeshStandardMaterial({ color: '#2b2522', roughness: 0.6, metalness: 0.3 }),
      letter: new THREE.MeshStandardMaterial({ color: '#fff3e2', roughness: 0.45 }),
      letterAccent: new THREE.MeshStandardMaterial({ color: ACCENT, roughness: 0.4 }),
      stone: new THREE.MeshStandardMaterial({ color: '#efe2cf', roughness: 0.7 }),
    };

    this.buildRoads();
    this.buildSpawn();
    this.buildLetters();
    this.buildAbout();
    this.buildExperience();
    this.buildProjects();
    this.buildSkills();
    this.buildCerts();
    this.buildContact();
    this.buildBowling();
  }

  // ---------- helpers
  addStatic(mesh, shape, pos, quat) {
    mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(mesh);
    if (shape) {
      const b = new CANNON.Body({ mass: 0 });
      b.addShape(shape);
      b.position.set(pos.x, pos.y, pos.z);
      if (quat) b.quaternion.copy(quat);
      this.world.addBody(b);
    }
  }

  addDynamic(mesh, shape, mass, pos, quat) {
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.scene.add(mesh);
    const b = new CANNON.Body({ mass, linearDamping: 0.2, angularDamping: 0.3 });
    b.addShape(shape);
    b.position.set(pos.x, pos.y, pos.z);
    if (quat) b.quaternion.copy(quat);
    b.allowSleep = true; b.sleepSpeedLimit = 0.2; b.sleepTimeLimit = 1;
    b.sleep();
    this.world.addBody(b);
    this.dynamic.push({ mesh, body: b });
    return b;
  }

  groundLabel(text, x, z, { w = 12, size = 120, rot = 0, color, sub, subColor } = {}) {
    const tex = groundText(text, { size, color, sub, subColor });
    const h = w * (tex.image.height / tex.image.width);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = rot;
    m.position.set(x, 0.02, z);
    m.receiveShadow = true;
    this.scene.add(m);
    return m;
  }

  /** `up` = [ux, uz]: direction the label's top should point (away from the approaching driver). */
  pad(id, kind, x, z, title, color = ACCENT, payload = null, r = 3.6, up = [0, -1]) {
    const g = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.08, 40), this.mat.pad);
    disc.position.y = 0.04; g.add(disc);
    const ringMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r - 0.25, 0.09, 8, 48), ringMat);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.1; g.add(ring);
    const tex = canvasTexture(512, 512, (ctx, w, h) => {
      ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `800 64px ${FONT_DISPLAY}`;
      const lines = wrap(ctx, title.toUpperCase(), 420);
      lines.forEach((l, i) => ctx.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * 70));
    });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(r * 1.6, r * 1.6), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    label.rotation.x = -Math.PI / 2; label.rotation.z = Math.atan2(-up[0], -up[1]); label.position.y = 0.095; g.add(label);
    g.position.set(x, 0, z);
    g.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    this.scene.add(g);
    this.triggers.push({ id, kind, x, z, r, title, payload, ring: ringMat });
    this.obstacles.push({ x, z, r: r + 2 });
    return g;
  }

  // ---------- roads
  buildRoads() {
    const e = this.env;
    e.road(26, 0, 34 + 15 * 7 + 14, 0, 8);           // career road east
    e.road(0, -6, 0, LAYOUT.projects.z + 14, 7);       // north to projects
    e.road(0, 6, 0, LAYOUT.skills.z - 10, 7);          // south to skills
    e.road(-6, 0, LAYOUT.certs.x + 14, 0, 7);         // west to certifications
    e.road(-6, -5, LAYOUT.contact.x + 5, LAYOUT.contact.z + 5, 6); // north-west to contact
    // ring road round the project plaza
    const { x, z } = LAYOUT.projects;
    const ring = new THREE.Mesh(new THREE.RingGeometry(9, 15, 64), new THREE.MeshStandardMaterial({ color: '#5b3a2a', roughness: 0.95 }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.011, z); ring.receiveShadow = true;
    this.scene.add(ring);
    this.obstacles.push(
      { line: [26, 0, 155, 0], w: 9 }, { line: [0, -6, 0, LAYOUT.projects.z], w: 8 },
      { line: [0, 6, 0, LAYOUT.skills.z], w: 8 }, { line: [-6, 0, LAYOUT.certs.x, 0], w: 8 },
      { line: [-6, -5, LAYOUT.contact.x, LAYOUT.contact.z], w: 7 }
    );
  }

  // ---------- spawn: hint text + signpost
  buildSpawn() {
    this.groundLabel('DRIVE', -6, 0, { w: 9, size: 150, rot: -Math.PI / 2, sub: 'W A S D  ·  ARROWS  ·  TOUCH' });
    this.obstacles.push({ x: 0, z: 0, r: 12 });

    // signpost
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 4.2, 8), this.mat.post);
    pole.position.y = 2.1; g.add(pole);
    // directory boards facing the start position (viewer looks toward +X)
    const signs = [
      ['↑ CAREER ROAD', '#ffb347'], ['← PROJECTS', '#4fb3ff'], ['→ SKILLS', '#5ad17a'], ['↓ CERTS · CONTACT', '#ff5d73'],
    ];
    signs.forEach(([t, c], i) => {
      const tex = canvasTexture(512, 128, (ctx, w, h) => {
        ctx.fillStyle = '#1f1714'; roundRect(ctx, 0, 0, w, h, 18); ctx.fill();
        ctx.fillStyle = c; ctx.font = `800 56px ${FONT_DISPLAY}`; ctx.textBaseline = 'middle';
        ctx.fillText(t, 30, h / 2 + 4);
      });
      const board = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 0.06), [
        this.mat.post, this.mat.post, this.mat.post, this.mat.post,
        new THREE.MeshStandardMaterial({ map: tex }), new THREE.MeshStandardMaterial({ map: tex }),
      ]);
      board.position.set(-0.12, 3.7 - i * 0.68, 0);
      board.rotation.y = -Math.PI / 2;
      g.add(board);
    });
    g.position.set(-3, 0, 7);
    this.addStatic(g, new CANNON.Cylinder(0.15, 0.15, 4.2, 6), { x: -3, y: 2.1, z: 7 });
  }

  // ---------- big physical name letters (knock them over)
  buildLetters() {
    const rows = [
      { text: 'DANIEL', size: 2.6, depth: 0.9, x: LAYOUT.letters.x, mat: this.mat.letter },
      { text: 'MAFUKIDZE', size: 1.5, depth: 0.7, x: LAYOUT.letters.x + 4.5, mat: this.mat.letterAccent },
    ];
    for (const row of rows) {
      const glyphs = [];
      let total = 0;
      for (const ch of row.text) {
        const geo = new TextGeometry(ch, { font: this.font, size: row.size, depth: row.depth, curveSegments: 4, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.04, bevelSegments: 2 });
        geo.computeBoundingBox();
        const bb = geo.boundingBox;
        const w = bb.max.x - bb.min.x, h = bb.max.y - bb.min.y, d = bb.max.z - bb.min.z;
        geo.translate(-(bb.min.x + w / 2), -(bb.min.y + h / 2), -(bb.min.z + d / 2));
        glyphs.push({ geo, w, h, d });
        total += w + row.size * 0.12;
      }
      let cursor = -total / 2;
      for (const g of glyphs) {
        const zc = cursor + g.w / 2;
        cursor += g.w + row.size * 0.12;
        const mesh = new THREE.Mesh(g.geo, row.mat);
        const quat = new CANNON.Quaternion();
        quat.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), -Math.PI / 2); // face the spawn (−X)
        this.addDynamic(mesh, new CANNON.Box(new CANNON.Vec3(g.w / 2, g.h / 2, g.d / 2)), 18 * row.size,
          { x: row.x, y: g.h / 2 + 0.02, z: zc }, quat);
      }
    }
    this.groundLabel(this.data.profile.title.toUpperCase(), LAYOUT.letters.x - 4.5, 0, { w: 22, size: 46, rot: -Math.PI / 2, color: 'rgba(80,38,14,0.6)' });
    this.obstacles.push({ x: LAYOUT.letters.x + 2, z: 0, r: 14 });
  }

  // ---------- about
  buildAbout() {
    const { x, z } = LAYOUT.about;
    this.pad('about', 'about', x, z, 'About me', '#ffd166', null, 3.6, [0, -1]);
    // plinth with a slowly turning monogram
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 2), this.mat.stone);
    plinth.position.set(x, 0.6, z - 6);
    this.addStatic(plinth, new CANNON.Box(new CANNON.Vec3(1, 0.6, 1)), { x, y: 0.6, z: z - 6 });
    const geo = new TextGeometry('DM', { font: this.font, size: 1.4, depth: 0.4, curveSegments: 4, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.03, bevelSegments: 2 });
    geo.center();
    const mono = new THREE.Mesh(geo, this.mat.letterAccent);
    mono.position.set(x, 2.4, z - 6); mono.castShadow = true;
    this.scene.add(mono);
    this.spinners.push({ mesh: mono, speed: 0.6, bob: 0.15, baseY: 2.4 });
    this.obstacles.push({ x, z: z - 6, r: 3 });
  }

  // ---------- career road: one gate per milestone (oldest first)
  buildExperience() {
    const { x0, step } = LAYOUT.experience;
    const d = this.data;
    const milestones = [
      { year: d.education.year, role: d.education.degree, company: d.education.school, period: d.education.year, points: [], education: true },
      ...[...d.experience].reverse(),
    ];
    this.groundLabel('CAREER ROAD', x0 - 8, 0, { w: 13, size: 110, rot: -Math.PI / 2, sub: '2017 → TODAY' });
    milestones.forEach((m, i) => {
      const x = x0 + i * step;
      const color = m.education ? '#4fb3ff' : i === milestones.length - 1 ? '#5ad17a' : ACCENT;
      const g = new THREE.Group();
      for (const zz of [-5.2, 5.2]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, 6, 0.7), this.mat.stone);
        p.position.set(0, 3, zz); g.add(p);
        const b = new CANNON.Body({ mass: 0 });
        b.addShape(new CANNON.Box(new CANNON.Vec3(0.35, 3, 0.35)));
        b.position.set(x, 3, zz); this.world.addBody(b);
      }
      const tex = canvasTexture(1024, 300, (ctx, w, h) => {
        ctx.fillStyle = '#1d1512'; roundRect(ctx, 0, 0, w, h, 28); ctx.fill();
        ctx.fillStyle = color; ctx.fillRect(0, h - 14, w, 14);
        ctx.fillStyle = color; ctx.font = `800 120px ${FONT_DISPLAY}`; ctx.textBaseline = 'alphabetic';
        ctx.fillText(m.year, 36, 140);
        ctx.fillStyle = '#fff3e2'; ctx.font = `700 46px ${FONT_DISPLAY}`;
        const role = wrap(ctx, m.role, 650).slice(0, 2);
        role.forEach((l, k) => ctx.fillText(l, 340, 78 + k * 52));
        ctx.fillStyle = 'rgba(255,243,226,0.7)'; ctx.font = `500 32px ${FONT_MONO}`;
        ctx.fillText(m.company, 340, 92 + role.length * 52);
        ctx.font = `500 30px ${FONT_MONO}`; ctx.fillStyle = 'rgba(255,243,226,0.5)';
        ctx.fillText(m.period, 36, 230);
      });
      const signMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.4, 11.4), [signMat, signMat, this.mat.post, this.mat.post, this.mat.post, this.mat.post]);
      sign.position.set(0, 6.8, 0);
      g.add(sign);
      g.position.set(x, 0, 0);
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.scene.add(g);
      this.triggers.push({ id: `exp-${i}`, kind: 'experience', x, z: 0, r: 5.5, title: m.role, payload: m, passive: true });
    });
    // finish banner
    this.groundLabel('TO BE CONTINUED…', x0 + milestones.length * step, 0, { w: 14, size: 90, rot: -Math.PI / 2 });
  }

  // ---------- projects plaza: billboards in a circle
  buildProjects() {
    const { x: cx, z: cz, r } = LAYOUT.projects;
    const list = this.data.projects;
    this.groundLabel('PROJECTS', cx, cz, { w: 15, size: 130, rot: 0, sub: `${list.length} THINGS I BUILT` });
    this.obstacles.push({ x: cx, z: cz, r: r + 8 });
    // leave a gap at the south side for the entrance road
    const start = Math.PI / 2 + 0.42, span = Math.PI * 2 - 0.84;
    list.forEach((p, i) => {
      const a = start + (span * i) / (list.length - 1);
      const bx = cx + Math.cos(a) * r, bz = cz + Math.sin(a) * r;
      const g = new THREE.Group();
      const tex = this.billboardTexture(p);
      const front = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 });
      const board = new THREE.Mesh(new THREE.BoxGeometry(8, 4.5, 0.3), [this.mat.post, this.mat.post, this.mat.post, this.mat.post, front, front]);
      board.position.y = 4.6; g.add(board);
      for (const px of [-2.8, 2.8]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.6, 0.3), this.mat.post);
        post.position.set(px, 1.3, -0.1); g.add(post);
      }
      g.position.set(bx, 0, bz);
      g.lookAt(cx, 0, cz);
      const quat = new CANNON.Quaternion(g.quaternion.x, g.quaternion.y, g.quaternion.z, g.quaternion.w);
      this.addStatic(g, new CANNON.Box(new CANNON.Vec3(4, 0.4, 0.4)), { x: bx, y: 4.6, z: bz }, quat);
      for (const px of [-2.8, 2.8]) {
        const off = new THREE.Vector3(px, 0, 0).applyQuaternion(g.quaternion);
        const b = new CANNON.Body({ mass: 0 }); b.addShape(new CANNON.Box(new CANNON.Vec3(0.2, 1.3, 0.2)));
        b.position.set(bx + off.x, 1.3, bz + off.z); this.world.addBody(b);
      }
      const pd = r - 6.5;
      this.pad(`proj-${p.id}`, 'project', cx + Math.cos(a) * pd, cz + Math.sin(a) * pd, p.name, p.color, p, 2.8, [Math.cos(a), Math.sin(a)]);
    });
  }

  billboardTexture(p) {
    return canvasTexture(1024, 576, (ctx, w, h) => {
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#1b1411'); grad.addColorStop(1, '#2c1f19');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = p.color; ctx.fillRect(0, 0, 18, h);
      ctx.fillStyle = p.color; ctx.font = `600 30px ${FONT_MONO}`;
      ctx.fillText(p.status.toUpperCase(), 64, 80);
      ctx.fillStyle = '#fff3e2'; ctx.font = `800 96px ${FONT_DISPLAY}`;
      const nameLines = wrap(ctx, p.name, 900);
      nameLines.forEach((l, i) => ctx.fillText(l, 60, 180 + i * 96));
      let y = 180 + nameLines.length * 96;
      ctx.fillStyle = 'rgba(255,243,226,0.75)'; ctx.font = `500 42px ${FONT_DISPLAY}`;
      wrap(ctx, p.tagline, 900).slice(0, 2).forEach((l, i) => ctx.fillText(l, 62, y + i * 50));
      // stack chips
      ctx.font = `500 26px ${FONT_MONO}`;
      let cx = 62, cy = h - 70;
      for (const s of p.stack.slice(0, 6)) {
        const tw = ctx.measureText(s).width + 32;
        if (cx + tw > w - 40) break;
        ctx.strokeStyle = p.color; ctx.lineWidth = 2;
        roundRect(ctx, cx, cy - 34, tw, 48, 24); ctx.stroke();
        ctx.fillStyle = '#fff3e2'; ctx.fillText(s, cx + 16, cy);
        cx += tw + 12;
      }
    });
  }

  // ---------- skills: crates to smash
  buildSkills() {
    const { x: cx, z: cz } = LAYOUT.skills;
    this.pad('skills', 'skills', cx, cz - 8, 'Skills', '#5ad17a', null, 3.6, [0, 1]);
    this.groundLabel('SMASH MY STACK', cx, cz + 16, { w: 14, size: 100, rot: Math.PI });
    const size = 1.4;
    const skills = this.data.crateSkills;
    const shape = new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2));
    const geo = new THREE.BoxGeometry(size, size, size);
    const palette = ['#ffb347', '#4fb3ff', '#5ad17a', '#ff5d73', '#b18cff', '#ffd166'];
    // four pyramids of 6 crates (3-2-1)
    const stacks = [[-9, 4], [-3, 6], [3, 6], [9, 4]];
    let k = 0;
    stacks.forEach(([sx, sz], si) => {
      const rows = [3, 2, 1];
      rows.forEach((n, row) => {
        for (let j = 0; j < n && k < skills.length; j++) {
          const label = skills[k++];
          const color = palette[(si + row) % palette.length];
          const tex = canvasTexture(256, 256, (ctx, w, h) => {
            ctx.fillStyle = '#f3e3cc'; ctx.fillRect(0, 0, w, h);
            ctx.strokeStyle = '#8a5a3c'; ctx.lineWidth = 14; ctx.strokeRect(7, 7, w - 14, h - 14);
            ctx.fillStyle = color; ctx.fillRect(14, h - 54, w - 28, 40);
            ctx.fillStyle = '#2a1a12'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            let fs = 64; ctx.font = `800 ${fs}px ${FONT_DISPLAY}`;
            while (ctx.measureText(label).width > 210 && fs > 28) { fs -= 4; ctx.font = `800 ${fs}px ${FONT_DISPLAY}`; }
            ctx.fillText(label, w / 2, h / 2 - 14);
          });
          const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
          const x = cx + sx + (j - (n - 1) / 2) * (size + 0.05);
          this.addDynamic(mesh, shape, 6, { x, y: size / 2 + row * size + 0.01, z: cz + sz });
        }
      });
    });
    this.obstacles.push({ x: cx, z: cz + 4, r: 18 });
  }

  // ---------- certifications: plaques in an arc + spinning medal
  buildCerts() {
    const { x: cx, z: cz } = LAYOUT.certs;
    const certs = this.data.certifications;
    this.pad('certs', 'certs', cx + 9, cz, 'Certifications', '#ff5d73', null, 3.6, [-1, 0]);
    const medal = new THREE.Group();
    const hex = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.3, 6), new THREE.MeshStandardMaterial({ color: '#ffc24a', metalness: 0.25, roughness: 0.35, emissive: '#5a3200', emissiveIntensity: 0.4 }));
    hex.rotation.x = Math.PI / 2; medal.add(hex);
    const star = new THREE.Mesh(new THREE.TorusKnotGeometry(0.45, 0.13, 60, 8), new THREE.MeshStandardMaterial({ color: '#ff5d73', metalness: 0.2, roughness: 0.35 }));
    star.position.z = 0.25; medal.add(star);
    medal.position.set(cx, 4, cz);
    medal.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(medal);
    this.spinners.push({ mesh: medal, speed: 0.8, bob: 0.25, baseY: 4 });
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 1.6, 6), this.mat.stone);
    plinth.position.set(cx, 0.8, cz);
    this.addStatic(plinth, new CANNON.Cylinder(1.4, 1.8, 1.6, 6), { x: cx, y: 0.8, z: cz });

    const R = 13;
    certs.forEach((c, i) => {
      // arc with an opening facing east, where the road arrives
      const ang = 0.6 + ((Math.PI * 2 - 1.2) * i) / (certs.length - 1);
      const px = cx + Math.cos(ang) * R, pz = cz + Math.sin(ang) * R;
      const tex = canvasTexture(512, 384, (ctx, w, h) => {
        ctx.fillStyle = '#fff6ea'; roundRect(ctx, 0, 0, w, h, 24); ctx.fill();
        ctx.fillStyle = '#ff5d73'; ctx.fillRect(0, 0, w, 16);
        ctx.fillStyle = '#9a4a2a'; ctx.font = `600 30px ${FONT_MONO}`;
        ctx.fillText(c.issuer.toUpperCase(), 32, 72);
        ctx.fillStyle = '#2a1a12'; ctx.font = `800 44px ${FONT_DISPLAY}`;
        wrap(ctx, c.name, 450).slice(0, 4).forEach((l, j) => ctx.fillText(l, 32, 140 + j * 52));
      });
      const g = new THREE.Group();
      const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
      const board = new THREE.Mesh(new THREE.BoxGeometry(3, 2.25, 0.18), [this.mat.post, this.mat.post, this.mat.post, this.mat.post, face, face]);
      board.position.y = 2.1; g.add(board);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1, 0.2), this.mat.post);
      leg.position.y = 0.5; g.add(leg);
      g.position.set(px, 0, pz);
      g.lookAt(cx, 0, cz);
      const q = new CANNON.Quaternion(g.quaternion.x, g.quaternion.y, g.quaternion.z, g.quaternion.w);
      this.addStatic(g, new CANNON.Box(new CANNON.Vec3(1.5, 1.6, 0.15)), { x: px, y: 1.6, z: pz }, q);
    });
    this.obstacles.push({ x: cx, z: cz, r: R + 4 });
  }

  // ---------- contact: mailbox
  buildContact() {
    const { x, z } = LAYOUT.contact;
    this.pad('contact', 'contact', x, z, 'Contact', '#4fb3ff', null, 3.6, [-0.74, -0.67]);
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.6, 0.3), this.mat.post);
    post.position.y = 0.8; g.add(post);
    const box = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 2, 16, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: '#4fb3ff', roughness: 0.4 }));
    box.rotation.z = Math.PI / 2; box.position.y = 1.6; g.add(box);
    const base = new THREE.Mesh(new THREE.BoxGeometry(2, 0.05, 1.4), new THREE.MeshStandardMaterial({ color: '#4fb3ff' }));
    base.position.y = 1.6; g.add(base);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.3), new THREE.MeshStandardMaterial({ color: '#ff5d73' }));
    flag.position.set(0.4, 2.3, 0.75); g.add(flag);
    g.position.set(x - 6, 0, z - 4);
    this.addStatic(g, new CANNON.Box(new CANNON.Vec3(1, 1.2, 0.8)), { x: x - 6, y: 1.2, z: z - 4 });
    this.groundLabel('SAY HELLO', x + 3, z + 5, { w: 11, size: 110, rot: 0.83 });
    this.obstacles.push({ x: x - 3, z: z - 2, r: 9 });
  }

  // ---------- bowling for fun
  buildBowling() {
    const { x: bx, z: bz } = LAYOUT.bowling;
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(6, 30), new THREE.MeshStandardMaterial({ color: '#e8c79a', roughness: 0.5 }));
    lane.rotation.x = -Math.PI / 2; lane.position.set(bx, 0.013, bz - 6); lane.receiveShadow = true;
    this.scene.add(lane);
    this.groundLabel('STRIKE?', bx, bz - 18, { w: 8, size: 120, rot: Math.PI });
    const pinGeo = new THREE.CylinderGeometry(0.16, 0.3, 1.4, 12);
    const pinMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 });
    const shape = new CANNON.Cylinder(0.16, 0.3, 1.4, 8);
    let n = 0;
    for (let row = 0; row < 4; row++) {
      for (let j = 0; j <= row; j++) {
        const x = bx + (j - row / 2) * 0.9;
        const z = bz + row * 0.8;
        const mesh = new THREE.Mesh(pinGeo, pinMat);
        this.addDynamic(mesh, shape, 1.5, { x, y: 0.71, z });
        n++;
      }
    }
    this.obstacles.push({ x: bx, z: bz - 6, r: 17 });
  }

  isFree(x, z, radius) {
    for (const o of this.obstacles) {
      if (o.line) {
        const [x1, z1, x2, z2] = o.line;
        const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz;
        const t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / l2));
        const d = Math.hypot(x - (x1 + t * dx), z - (z1 + t * dz));
        if (d < o.w / 2 + radius + 2) return false;
      } else if (Math.hypot(x - o.x, z - o.z) < o.r + radius) return false;
    }
    return true;
  }

  update(t, carPos) {
    for (const s of this.spinners) {
      s.mesh.rotation.y = t * s.speed;
      s.mesh.position.y = s.baseY + Math.sin(t * 1.6) * s.bob;
    }
    // nearest active trigger
    let best = null, bestD = Infinity;
    for (const tr of this.triggers) {
      const d = Math.hypot(carPos.x - tr.x, carPos.z - tr.z);
      if (d < tr.r && d < bestD) { best = tr; bestD = d; }
      if (tr.ring) tr.ring.emissiveIntensity = 0.6 + (d < tr.r ? 1.4 : Math.sin(t * 3 + tr.x) * 0.25);
    }
    return best;
  }
}
