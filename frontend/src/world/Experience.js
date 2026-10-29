import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Environment } from './Environment.js';
import { Zones, TELEPORTS, LAYOUT } from './Zones.js';
import { Car } from './Car.js';
import { setMaxAnisotropy } from './textures.js';

const FIXED = 1 / 60;

export class Experience {
  constructor(canvas, data, { onZone, onTick } = {}) {
    this.canvas = canvas;
    this.data = data;
    this.onZone = onZone || (() => {});
    this.onTick = onTick || (() => {});
    this.dynamic = [];
    this.zoom = 1;
    this.paused = false;
    this.clock = new THREE.Clock();
    this.time = 0;
    this.currentZone = null;

    // ---------- renderer
    const lowPower = matchMedia('(max-width: 760px)').matches || navigator.hardwareConcurrency <= 4;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowPower ? 1.5 : 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    setMaxAnisotropy(this.renderer.capabilities.getMaxAnisotropy());

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 900);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    // ---------- physics
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -15, 0) });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;
    this.world.defaultContactMaterial.friction = 0.35;
    this.world.defaultContactMaterial.restitution = 0.15;

    // ---------- content
    this.env = new Environment(this.scene, this.world);
    this.zones = new Zones(this.scene, this.world, this.env, data, this.dynamic);
    this.env.scatter((x, z, r) => this.zones.isFree(x, z, r));
    this.car = new Car(this.scene, this.world, this.envMap);
    this.car.reset(LAYOUT.spawn.x, LAYOUT.spawn.z, LAYOUT.spawn.heading);

    // camera rig
    this.camYaw = 0;
    this.camPos = new THREE.Vector3(-10, 6, 0);
    this.lookAt = new THREE.Vector3();
    this.camera.position.copy(this.camPos);

    this.onResize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', this.onResize);
    canvas.addEventListener('wheel', (e) => {
      this.zoom = THREE.MathUtils.clamp(this.zoom + Math.sign(e.deltaY) * 0.08, 0.55, 1.7);
    }, { passive: true });

    this.view = 'chase';
    this._eye = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._lookFix = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
    this.accumulator = 0;
    this.renderer.setAnimationLoop(() => this.tick());
  }

  teleport(id) {
    const t = TELEPORTS.find((p) => p.id === id);
    if (!t) return;
    this.car.reset(t.x, t.z, t.heading);
    this.camYaw = t.heading;
    const back = new THREE.Vector3(-Math.cos(t.heading), 0, Math.sin(t.heading));
    this.camPos.set(t.x + back.x * 10, 6, t.z + back.z * 10);
  }

  toggleView() {
    this.view = this.view === 'chase' ? 'cockpit' : 'chase';
    this.car.setCockpit(this.view === 'cockpit');
    return this.view;
  }

  resetCar() {
    const p = this.car.chassis.position;
    this.car.reset(p.x, p.z, this.car.heading);
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    if (this.paused) { this.renderer.render(this.scene, this.camera); return; }
    this.time += dt;

    // physics at fixed rate
    this.throttle = this.car.update(dt);
    this.world.step(FIXED, dt, 4);

    // sync meshes
    this.car.sync(dt);
    for (const d of this.dynamic) {
      if (d.body.sleepState === CANNON.Body.SLEEPING && d.synced) continue;
      d.mesh.position.copy(d.body.position);
      d.mesh.quaternion.copy(d.body.quaternion);
      d.synced = true;
    }

    // chase camera — trails the car heading with a soft lag
    const pos = this.car.chassis.position;
    const speed = this.car.speed;
    const heading = this.car.heading;
    let diff = heading - this.camYaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.camYaw += diff * Math.min(1, dt * (Math.abs(speed) > 1 ? 2.4 : 0.8));
    const portrait = this.camera.aspect < 1 ? 1.45 : 1;
    const dist = (9.5 + Math.min(Math.abs(speed) * 0.08, 3)) * this.zoom * portrait;
    const height = (3.5 + Math.min(Math.abs(speed) * 0.03, 1.2)) * this.zoom * portrait;
    const target = new THREE.Vector3(pos.x - Math.cos(this.camYaw) * dist, Math.max(1.5, pos.y + height), pos.z + Math.sin(this.camYaw) * dist);
    this.camPos.lerp(target, Math.min(1, dt * 4.5));
    this.car.updateCockpit();
    if (this.view === 'cockpit') {
      // driver's eye, locked to the car body (+X forward → camera looks down its −Z)
      this.car.body.updateWorldMatrix(true, false);
      this._eye.copy(this.car.eye);
      this.car.body.localToWorld(this._eye);
      this.camera.position.copy(this._eye);
      this.car.body.getWorldQuaternion(this._q);
      this.camera.quaternion.copy(this._q).multiply(this._lookFix);
      this.camera.rotateX(-0.09);
      this.camera.near = 0.05;
      const fovC = 68 + Math.min(Math.abs(speed), 42) * 0.18;
      if (Math.abs(this.camera.fov - fovC) > 0.05) this.camera.fov += (fovC - this.camera.fov) * dt * 3;
      this.camera.updateProjectionMatrix();
      this.env.follow(pos);
      this.env.sky.position.copy(this.camera.position);
      const zoneC = this.zones.update(this.time, pos);
      if (zoneC !== this.currentZone) { this.currentZone = zoneC; this.onZone(zoneC); }
      this.onTick(dt, { speed, throttle: this.throttle, pos, heading });
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.camera.near = 0.1;
    this.camera.position.copy(this.camPos);
    const ahead = new THREE.Vector3(pos.x + Math.cos(heading) * 3, pos.y + 1, pos.z - Math.sin(heading) * 3);
    this.lookAt.lerp(ahead, Math.min(1, dt * 8));
    this.camera.lookAt(this.lookAt);
    // a touch of FOV kick at speed
    const fov = 52 + Math.min(Math.abs(speed), 42) * 0.22;
    if (Math.abs(this.camera.fov - fov) > 0.05) { this.camera.fov += (fov - this.camera.fov) * dt * 3; this.camera.updateProjectionMatrix(); }

    this.env.follow(pos);
    this.env.sky.position.copy(this.camera.position);

    // zones
    const zone = this.zones.update(this.time, pos);
    if (zone !== this.currentZone) {
      this.currentZone = zone;
      this.onZone(zone);
    }

    this.onTick(dt, { speed, throttle: this.throttle, pos, heading });
    this.renderer.render(this.scene, this.camera);
  }

  /** Draw a small top-down map into a 2D canvas context. */
  drawMinimap(ctx, w, h) {
    const scale = w / 260;
    const cx = w / 2, cy = h / 2;
    const p = this.car.chassis.position;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, w / 2 - 1, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = 'rgba(40,24,18,0.72)'; ctx.fillRect(0, 0, w, h);
    const X = (x) => cx + x * scale;
    const Y = (z) => cy + z * scale;
    ctx.strokeStyle = 'rgba(255,220,180,0.35)'; ctx.lineWidth = 3;
    const roads = [[26, 0, 155, 0], [0, 0, 0, LAYOUT.projects.z], [0, 0, 0, LAYOUT.skills.z], [0, 0, LAYOUT.certs.x, 0], [0, 0, LAYOUT.contact.x, LAYOUT.contact.z]];
    for (const [a, b, c, d] of roads) { ctx.beginPath(); ctx.moveTo(X(a), Y(b)); ctx.lineTo(X(c), Y(d)); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(X(LAYOUT.projects.x), Y(LAYOUT.projects.z), 12 * scale, 0, Math.PI * 2); ctx.stroke();
    for (const t of this.zones.triggers) {
      if (t.kind === 'experience') ctx.fillStyle = '#ffb347';
      else ctx.fillStyle = t.payload?.color || ({ about: '#ffd166', skills: '#5ad17a', certs: '#ff5d73', contact: '#4fb3ff' })[t.kind] || '#fff';
      ctx.beginPath(); ctx.arc(X(t.x), Y(t.z), t.kind === 'project' ? 2.2 : 3.4, 0, Math.PI * 2); ctx.fill();
    }
    // car arrow
    const hd = this.car.heading;
    ctx.translate(X(p.x), Y(p.z));
    ctx.rotate(-hd);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, 4.5); ctx.lineTo(-3, 0); ctx.lineTo(-5, -4.5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
