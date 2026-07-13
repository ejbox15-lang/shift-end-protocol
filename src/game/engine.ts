import * as THREE from "three";
import { buildWorld, type AABB, type Interactable, type WorldBuild } from "./world";

export interface InvItem {
  kind: string;
  count: number;
}
export interface HudState {
  status: "intro" | "playing" | "dead" | "win";
  chapter: number;
  objective: string;
  stamina: number;
  hasFlashlight: boolean;
  flashOn: boolean;
  battery: number;
  hasGun: boolean;
  bullets: number;
  inventory: InvItem[];
  prompt: string | null;
  message: { title: string; body: string } | null;
  toast: string | null;
  hiding: boolean;
  showInv: boolean;
  vignette: number; // 0..1 danger
}

interface Objective {
  id: string;
  text: (g: Game) => string;
  done: (g: Game) => boolean;
  chapter: number;
  onComplete?: (g: Game) => void;
}

type EState = "DORMANT" | "PATROL" | "INVESTIGATE" | "CHASE" | "SEARCH";

const EYE_STAND = 1.7;
const EYE_CROUCH = 1.0;
const WALK = 3.2;
const SPRINT = 6.4;
const CROUCH_SPEED = 1.6;
const PLAYER_R = 0.45;
const ENTITY_R = 0.5;

export class Game {
  container: HTMLElement;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  world!: WorldBuild;
  onHud: (s: HudState) => void = () => {};

  // player
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  eyeH = EYE_STAND;
  stamina = 1;
  crouching = false;
  bob = 0;

  // systems
  keys: Record<string, boolean> = {};
  flags = new Set<string>();
  palletCount = 0;
  inventory: InvItem[] = [];
  hasFlashlight = false;
  flashOn = false;
  battery = 1;
  hasGun = false;
  bullets = 3;
  showInv = false;

  flashlight!: THREE.SpotLight;
  flashTarget!: THREE.Object3D;
  ambient!: THREE.AmbientLight;

  // objectives
  objectives: Objective[] = [];
  objIndex = 0;

  // interaction
  highlight: Interactable | null = null;
  hiding = false;
  hideSpot: { pos: THREE.Vector3 } | null = null;

  // entity
  entity!: THREE.Group;
  eState: EState = "DORMANT";
  ePos = new THREE.Vector3();
  eTarget = new THREE.Vector3();
  eLastKnown = new THREE.Vector3();
  eSearchTimer = 0;
  eSeesPlayer = false;
  eLostTimer = 0;
  entityActive = false;
  aggression = 1; // 1 normal, 2 aggressive

  // state
  status: HudState["status"] = "intro";
  reading = false;
  message: { title: string; body: string } | null = null;
  toast: string | null = null;
  toastTimer = 0;
  running = false;
  lastT = 0;
  vignette = 0;
  flicker = 0;
  raf = 0;
  scriptedScareTimer = 0;

  audioCtx: AudioContext | null = null;
  drone: OscillatorNode | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(1);
    container.appendChild(this.renderer.domElement);
    const canvas = this.renderer.domElement;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    (canvas.style as any).imageRendering = "pixelated";

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05060a);
    this.scene.fog = new THREE.Fog(0x05060a, 3, 24);

    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 200);

    this.setupWorld();
    this.setupPlayerLights();
    this.setupEntity();
    this.setupObjectives();
    this.bindInput();
    this.resize();
    window.addEventListener("resize", this.resize);
  }

  setupWorld() {
    this.world = buildWorld(this.scene);
    this.pos.copy(this.world.playerStart);
    this.ePos.copy(this.world.entitySpawn);
    this.ambient = new THREE.AmbientLight(0x223044, 0.35);
    this.scene.add(this.ambient);
    // a few dim emergency lights
    const emg1 = new THREE.PointLight(0x3355aa, 6, 30, 2);
    emg1.position.set(0, 4.4, 8);
    this.scene.add(emg1);
    const emg2 = new THREE.PointLight(0x223355, 4, 24, 2);
    emg2.position.set(0, 4.4, 40);
    this.scene.add(emg2);
  }

  setupPlayerLights() {
    this.flashlight = new THREE.SpotLight(0xfff2d0, 0, 26, Math.PI / 6, 0.4, 1.2);
    this.flashTarget = new THREE.Object3D();
    this.scene.add(this.flashlight);
    this.scene.add(this.flashTarget);
    this.flashlight.target = this.flashTarget;
  }

  setupEntity() {
    this.entity = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1e });
    const uniform = new THREE.MeshLambertMaterial({ color: 0x2a3a2a });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.4), uniform);
    torso.position.y = 1.15;
    this.entity.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.4), bodyMat);
    head.position.y = 1.95;
    this.entity.add(head);
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.2), new THREE.MeshBasicMaterial({ color: 0xffbb33 }));
    badge.position.set(0.15, 1.3, 0.21);
    this.entity.add(badge);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.1, 0.25), bodyMat);
      leg.position.set(s * 0.18, 0.55, 0);
      this.entity.add(leg);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.0, 0.2), uniform);
      arm.position.set(s * 0.45, 1.2, 0);
      this.entity.add(arm);
    }
    this.entity.position.copy(this.ePos);
    this.entity.visible = false;
    this.scene.add(this.entity);
  }

  // ---------------- OBJECTIVES ----------------
  setupObjectives() {
    const has = (g: Game, f: string) => g.flags.has(f);
    this.objectives = [
      { id: "clockin", chapter: 1, text: () => "Clock in at the time clock", done: (g) => has(g, "clockin") },
      { id: "equip", chapter: 1, text: () => "Collect your equipment (flashlight, scanner, radio)", done: (g) => g.hasFlashlight },
      { id: "assign", chapter: 1, text: () => "Read your shift assignment (supervisor office)", done: (g) => has(g, "note_intro") },
      { id: "pallets", chapter: 2, text: (g) => `Scan pallets on the main floor: ${g.palletCount}/5`, done: (g) => g.palletCount >= 5 },
      { id: "labels", chapter: 2, text: () => "Print shipping labels at the station", done: (g) => has(g, "labels") },
      { id: "temp", chapter: 2, text: () => "Check the freezer temperature", done: (g) => has(g, "temp") },
      {
        id: "dock", chapter: 2, text: () => "Inspect the loading dock", done: (g) => has(g, "note_dock"),
        onComplete: (g) => { g.entityActive = true; g.showToast("You feel like you're being watched..."); g.scheduleScare(6); },
      },
      { id: "power", chapter: 3, text: () => "Restore partial power (maintenance panel)", done: (g) => has(g, "power") },
      { id: "cameras", chapter: 3, text: () => "Access the security cameras", done: (g) => has(g, "cameras") },
      {
        id: "records", chapter: 3, text: () => "Discover the old employee records", done: (g) => has(g, "records"),
        onComplete: (g) => { g.triggerChase(); g.showToast("SOMETHING IS COMING"); },
      },
      { id: "gun", chapter: 4, text: () => "Find the emergency handgun (security office)", done: (g) => g.hasGun },
      { id: "keycard", chapter: 4, text: () => "Find a keycard", done: (g) => g.inventory.some((i) => i.kind === "keycard") },
      {
        id: "generator", chapter: 4, text: () => "Restore the main generator", done: (g) => has(g, "generator"),
        onComplete: (g) => { g.aggression = 2; g.showToast("IT KNOWS WHERE YOU ARE"); g.setInteractLock("final_trailer", false); },
      },
      {
        id: "trailer", chapter: 5, text: () => "Open Trailer 7 and discover the truth", done: (g) => has(g, "trailer"),
        onComplete: (g) => { g.setInteractLock("exit", false); g.showToast("EMERGENCY SHUTDOWN INITIATED — ESCAPE"); },
      },
      { id: "escape", chapter: 5, text: () => "ESCAPE THE ENTITY", done: (g) => has(g, "exit") },
    ];
  }

  setInteractLock(id: string, locked: boolean) {
    const it = this.world.interactables.find((i) => i.id === id);
    if (it) it.locked = locked;
  }

  advanceObjectives() {
    while (this.objIndex < this.objectives.length && this.objectives[this.objIndex].done(this)) {
      const obj = this.objectives[this.objIndex];
      obj.onComplete?.(this);
      this.objIndex++;
      if (this.objIndex < this.objectives.length) {
        this.showToast("Objective: " + this.objectives[this.objIndex].text(this));
      }
    }
    if (this.objIndex >= this.objectives.length) {
      this.win();
    }
  }

  get currentObjective(): string {
    const o = this.objectives[this.objIndex];
    return o ? o.text(this) : "";
  }
  get chapter(): number {
    return this.objectives[this.objIndex]?.chapter ?? 5;
  }

  // ---------------- INPUT ----------------
  bindInput() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.renderer.domElement.addEventListener("click", this.onClick);
    document.addEventListener("mousemove", this.onMouseMove);
  }

  onClick = () => {
    if (this.status !== "playing" || this.reading || this.showInv) return;
    if (document.pointerLockElement !== this.renderer.domElement) {
      this.renderer.domElement.requestPointerLock?.();
      return;
    }
    // fire gun
    if (this.hasGun && this.bullets > 0) this.fireGun();
  };

  onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== this.renderer.domElement || this.reading || this.hiding) return;
    const s = 0.0022;
    this.yaw -= e.movementX * s;
    this.pitch -= e.movementY * s;
    this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch));
  };

  onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    this.keys[k] = true;
    if (this.status !== "playing") return;
    if (k === "e") this.interact();
    if (k === "f") this.toggleFlash();
    if (k === "tab") { e.preventDefault(); this.showInv = !this.showInv; this.emit(); }
    if (k === "escape") { /* pause handled by react */ }
  };
  onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.key.toLowerCase()] = false;
  };

  // ---------------- START ----------------
  start() {
    this.status = "playing";
    this.running = true;
    this.lastT = performance.now();
    this.renderer.domElement.requestPointerLock?.();
    this.initAudio();
    this.emit();
    if (!this.raf) this.loop();
  }

  initAudio() {
    try {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = 44;
      gain.gain.value = 0.04;
      osc.connect(gain).connect(this.audioCtx.destination);
      osc.start();
      this.drone = osc;
    } catch { /* ignore */ }
  }

  beep(freq: number, dur = 0.08, vol = 0.15) {
    if (!this.audioCtx) return;
    try {
      const o = this.audioCtx.createOscillator();
      const g = this.audioCtx.createGain();
      o.frequency.value = freq;
      o.type = "square";
      g.gain.value = vol;
      o.connect(g).connect(this.audioCtx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, this.audioCtx.currentTime + dur);
      o.stop(this.audioCtx.currentTime + dur);
    } catch { /* ignore */ }
  }

  showToast(t: string) {
    this.toast = t;
    this.toastTimer = 4;
    this.emit();
  }

  toggleFlash() {
    if (!this.hasFlashlight) return;
    if (this.battery <= 0) return;
    this.flashOn = !this.flashOn;
    this.beep(this.flashOn ? 600 : 300, 0.04, 0.08);
    this.emit();
  }

  scheduleScare(sec: number) {
    this.scriptedScareTimer = sec;
  }

  triggerChase() {
    this.entityActive = true;
    this.entity.visible = true;
    // place entity near but not on player
    const dir = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.ePos.copy(this.pos).addScaledVector(dir, 10);
    this.ePos.y = 0;
    this.entity.position.copy(this.ePos);
    this.eState = "CHASE";
    this.eLastKnown.copy(this.pos);
    this.beep(90, 0.5, 0.2);
  }

  fireGun() {
    this.bullets--;
    this.beep(140, 0.15, 0.3);
    this.emit();
    // check hit entity
    if (this.entity.visible) {
      const toE = new THREE.Vector3().subVectors(this.ePos, this.pos);
      const dist = toE.length();
      toE.normalize();
      const look = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)).normalize();
      // camera forward is -look convention; compute properly
      const fwd = this.forward();
      if (dist < 20 && fwd.dot(toE) > 0.93) {
        // hit: stagger
        this.eState = "SEARCH";
        this.eSearchTimer = 4;
        this.eLastKnown.copy(this.ePos).addScaledVector(toE, -6);
        this.showToast("The entity staggers back!");
        this.beep(200, 0.3, 0.2);
      }
    }
  }

  forward(): THREE.Vector3 {
    return new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    ).multiplyScalar(-1).normalize();
  }

  // ---------------- INTERACTION ----------------
  findHighlight(): Interactable | null {
    if (this.hiding) return null;
    const fwd = this.forward();
    let best: Interactable | null = null;
    let bestScore = -1;
    for (const it of this.world.interactables) {
      if (it.used && it.type !== "locker") continue;
      const to = new THREE.Vector3().subVectors(it.pos, new THREE.Vector3(this.pos.x, this.eyeH, this.pos.z));
      const d = to.length();
      if (d > it.radius) continue;
      to.normalize();
      const dot = fwd.dot(to);
      if (dot < 0.6) continue;
      const score = dot - d * 0.05;
      if (score > bestScore) { bestScore = score; best = it; }
    }
    return best;
  }

  interact() {
    if (this.hiding) { this.exitHide(); return; }
    if (this.reading) return;
    const it = this.highlight;
    if (!it) return;
    if (it.locked) { this.showToast("Locked. You need to do something else first."); this.beep(120, 0.1, 0.1); return; }

    switch (it.type) {
      case "locker":
        this.enterHide(it);
        return;
      case "note": {
        this.openMessage(it.data.title, it.data.body);
        this.flags.add(it.id);
        break;
      }
      case "radio": {
        if (this.objIndex >= this.objectives.length - 1) {
          this.openMessage("RADIO", "\"New shift begins at 11:00 PM.\"\n\nThe voice is your own.");
        } else {
          this.openMessage("RADIO", "Static... then a voice: \"...anyone on the floor tonight, do NOT go near cold storage. He's still clocked in...\"");
        }
        this.flags.add("radio");
        break;
      }
      case "computer": {
        this.handleComputer(it);
        break;
      }
      case "scanner": {
        if (it.data?.task === "clockin") {
          this.flags.add("clockin");
          this.beep(880, 0.1);
          this.showToast("Clocked in. Shift started.");
        } else if (it.data?.task === "pallet" && !it.used) {
          it.used = true;
          this.palletCount++;
          this.beep(880, 0.08);
          this.hidePickupMesh(it);
        }
        break;
      }
      case "generator": {
        it.used = true;
        this.flags.add(it.data.task);
        this.beep(160, 0.4, 0.2);
        if (it.data.task === "power") {
          this.ambient.intensity = 0.55;
          this.showToast("Partial power restored.");
        } else {
          this.ambient.intensity = 0.8;
          this.showToast("Main generator online. The lights hum back to life.");
        }
        break;
      }
      case "pickup":
        this.handlePickup(it);
        break;
      case "keycard":
        this.addInventory("keycard");
        this.showToast("Picked up keycard.");
        it.used = true;
        this.hidePickupMesh(it);
        break;
      case "exit":
        this.flags.add("exit");
        break;
    }
    this.advanceObjectives();
    this.emit();
  }

  handleComputer(it: Interactable) {
    const task = it.data?.task;
    if (task === "labels") {
      this.flags.add("labels");
      this.openMessage("LABEL PRINTER", "Printing... A label prints with a name you don't recognize: EMPLOYEE #013 — STATUS: ON SHIFT. But nobody named that works here.");
    } else if (task === "temp") {
      this.flags.add("temp");
      this.openMessage("FREEZER MONITOR", "Temp: -18C. Normal.\n\nWait — a second reading blinks: 37C, HUMAN. Motion detected in cold storage. Then it's gone.");
    } else if (task === "cameras") {
      this.flags.add("cameras");
      this.openMessage("SECURITY CAMERAS", "You flip through the feeds. Aisle 3 — empty. Freezer — empty. Break room...\n\nA figure in an old uniform stands facing the camera. It does not move. The timestamp reads 11:00 PM, three years ago.");
    } else if (task === "records") {
      this.flags.add("records");
      this.openMessage("EMPLOYEE RECORDS", "Badge #013 — [REDACTED]. Cause of separation: INCIDENT. Filed under 'transferred.' The night shift he died on was covered up.\n\nThe last log entry, added tonight: a new hire. YOUR name.");
    } else if (task === "trailer") {
      this.flags.add("trailer");
      this.openMessage("TRAILER 7", "The doors groan open. Inside: an old time clock, still running. Punch cards for every employee who never clocked out. The newest card is blank — waiting.\n\nYou slam the emergency shutdown. Alarms wail. RUN.");
    }
  }

  handlePickup(it: Interactable) {
    const kind = it.data?.kind;
    if (kind === "equipment") {
      this.hasFlashlight = true;
      this.battery = 1;
      this.showToast("Equipped: flashlight, scanner, radio. Press F for flashlight.");
    } else if (kind === "battery") {
      this.addInventory("battery");
      this.battery = Math.min(1, this.battery + 0.5);
      this.showToast("Batteries collected. Flashlight recharged.");
    } else if (kind === "gun") {
      this.hasGun = true;
      this.bullets = 3;
      this.showToast("Emergency handgun acquired. 3 rounds. LMB to fire.");
    }
    it.used = true;
    this.hidePickupMesh(it);
  }

  hidePickupMesh(it: Interactable) {
    it.mesh.visible = false;
  }

  addInventory(kind: string) {
    const stackable = kind === "battery";
    if (stackable) {
      const ex = this.inventory.find((i) => i.kind === "battery");
      if (ex) { ex.count++; return; }
    }
    if (this.inventory.length >= 4) { this.showToast("Inventory full (4 slots)."); return; }
    this.inventory.push({ kind, count: 1 });
  }

  openMessage(title: string, body: string) {
    this.message = { title, body };
    this.reading = true;
    document.exitPointerLock?.();
    this.beep(500, 0.05, 0.06);
    this.emit();
  }
  closeMessage() {
    this.message = null;
    this.reading = false;
    if (this.status === "playing") this.renderer.domElement.requestPointerLock?.();
    this.advanceObjectives();
    this.emit();
  }

  enterHide(it: Interactable) {
    this.hiding = true;
    this.hideSpot = { pos: it.pos.clone() };
    this.pos.set(it.pos.x, 0, it.pos.z);
    this.showToast("Hiding. Press E to leave.");
    // if entity saw us recently, it will come check
    if (this.eSeesPlayer || this.eState === "CHASE") {
      this.eLastKnown.copy(this.pos);
      this.eState = "SEARCH";
      this.eSearchTimer = 8;
    }
    this.emit();
  }
  exitHide() {
    this.hiding = false;
    this.hideSpot = null;
    this.emit();
  }

  // ---------------- COLLISION ----------------
  collide(x: number, z: number, r: number): boolean {
    for (const c of this.world.colliders) {
      if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return true;
    }
    return false;
  }
  resolveMove(px: number, pz: number, dx: number, dz: number, r: number): [number, number] {
    let nx = px + dx;
    if (this.collide(nx, pz, r)) nx = px;
    let nz = pz + dz;
    if (this.collide(nx, nz, r)) nz = pz;
    return [nx, nz];
  }

  // segment vs colliders (LOS). Returns true if clear.
  lineOfSightClear(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const steps = Math.ceil(a.distanceTo(b) / 0.5);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      for (const c of this.world.colliders) {
        if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) return false;
      }
    }
    return true;
  }

  // ---------------- LOOP ----------------
  loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    let dt = (now - this.lastT) / 1000;
    this.lastT = now;
    if (dt > 0.05) dt = 0.05;

    if (this.status === "playing" && !this.reading) {
      this.updatePlayer(dt);
      if (this.entityActive) this.updateEntity(dt);
      this.updateFlashlight(dt);
      this.updateTimers(dt);
    }
    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  };

  updateTimers(dt: number) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) { this.toast = null; this.emit(); }
    }
    if (this.scriptedScareTimer > 0) {
      this.scriptedScareTimer -= dt;
      if (this.scriptedScareTimer <= 0) {
        // brief scripted glimpse
        this.entity.visible = true;
        this.eState = "PATROL";
        const wp = this.world.entityWaypoints[1];
        this.ePos.copy(wp);
        this.entity.position.copy(this.ePos);
        this.flicker = 1.5;
        this.beep(70, 0.4, 0.18);
      }
    }
  }

  updatePlayer(dt: number) {
    if (this.hiding) { this.vel.set(0, 0, 0); return; }
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    let mx = 0, mz = 0;
    if (this.keys["w"]) { mx += fwd.x; mz += fwd.z; }
    if (this.keys["s"]) { mx -= fwd.x; mz -= fwd.z; }
    if (this.keys["d"]) { mx += right.x; mz += right.z; }
    if (this.keys["a"]) { mx -= right.x; mz -= right.z; }
    const moving = mx !== 0 || mz !== 0;
    const len = Math.hypot(mx, mz) || 1;
    mx /= len; mz /= len;

    this.crouching = !!this.keys["control"];
    const wantSprint = !!this.keys["shift"] && moving && !this.crouching && this.stamina > 0.02;
    let speed = WALK;
    if (this.crouching) speed = CROUCH_SPEED;
    else if (wantSprint) speed = SPRINT;

    // stamina
    if (wantSprint) {
      this.stamina = Math.max(0, this.stamina - dt / 6);
    } else {
      this.stamina = Math.min(1, this.stamina + dt / 8);
    }

    // eye height smooth
    const targetEye = this.crouching ? EYE_CROUCH : EYE_STAND;
    this.eyeH += (targetEye - this.eyeH) * Math.min(1, dt * 10);

    const dx = mx * speed * dt;
    const dz = mz * speed * dt;
    const [nx, nz] = this.resolveMove(this.pos.x, this.pos.z, dx, dz, PLAYER_R);
    this.pos.x = nx; this.pos.z = nz;

    // head bob
    if (moving) this.bob += dt * (wantSprint ? 14 : 9);
    // sprint noise attracts entity
    if (wantSprint && this.entityActive && (this.eState === "PATROL" || this.eState === "INVESTIGATE")) {
      if (this.ePos.distanceTo(this.pos) < 22) {
        this.eLastKnown.copy(this.pos);
        this.eState = "INVESTIGATE";
      }
    }
    this.emitThrottle();
  }

  updateFlashlight(dt: number) {
    if (this.flashOn && this.hasFlashlight) {
      this.battery = Math.max(0, this.battery - dt / 90);
      if (this.battery <= 0) { this.flashOn = false; this.showToast("Flashlight died. Find batteries."); }
    }
    // position
    const camPos = new THREE.Vector3(this.pos.x, this.eyeH, this.pos.z);
    this.flashlight.position.copy(camPos);
    const fwd = this.forward();
    this.flashTarget.position.copy(camPos).addScaledVector(fwd, 8);
    let base = this.flashOn ? 3.2 : 0;
    // flicker near entity / scripted
    let danger = 0;
    if (this.entity.visible) {
      const d = this.ePos.distanceTo(this.pos);
      danger = Math.max(0, 1 - d / 14);
    }
    this.flicker = Math.max(this.flicker - dt, danger > 0.5 ? 0.3 : 0);
    if (this.flicker > 0 && this.flashOn) {
      base *= Math.random() > 0.4 ? 1 : 0.15;
    }
    this.flashlight.intensity = base;
    this.vignette = danger;
  }

  updateCamera(dt: number) {
    const bobY = this.hiding ? 0 : Math.sin(this.bob) * 0.05;
    const y = this.hiding ? 1.2 : this.eyeH + bobY;
    this.camera.position.set(this.pos.x, y, this.pos.z);
    const fwd = this.forward();
    this.camera.lookAt(this.pos.x + fwd.x, y + fwd.y, this.pos.z + fwd.z);
    // update highlight occasionally
    if (this.status === "playing" && !this.reading) {
      const h = this.findHighlight();
      if (h?.id !== this.highlight?.id) { this.highlight = h; this.emit(); }
    }
  }

  // ---------------- ENTITY AI ----------------
  updateEntity(dt: number) {
    if (!this.entity.visible && this.eState === "DORMANT") return;
    const playerVec = new THREE.Vector3(this.pos.x, 0, this.pos.z);
    const eEye = this.ePos.clone(); eEye.y = 1.6;
    const pEye = playerVec.clone(); pEye.y = this.eyeH;

    // perception
    let canSee = false;
    if (!this.hiding) {
      const d = this.ePos.distanceTo(playerVec);
      if (d < 20 && this.lineOfSightClear(eEye, pEye)) {
        const toP = new THREE.Vector3().subVectors(playerVec, this.ePos).normalize();
        const facing = this.entityFacing();
        if (facing.dot(toP) > 0.4 || d < 4 || this.eState === "CHASE") canSee = true;
      }
    }
    this.eSeesPlayer = canSee;

    const speedBase = this.aggression === 2 ? 3.4 : 3.0;
    const chaseSpeed = this.aggression === 2 ? 4.9 : 4.4;

    switch (this.eState) {
      case "PATROL": {
        if (this.ePos.distanceTo(this.eTarget) < 1.5 || this.eTarget.lengthSq() === 0) {
          this.eTarget.copy(this.randomWaypoint());
        }
        this.moveEntityTo(this.eTarget, speedBase, dt);
        if (canSee) { this.eState = "CHASE"; this.beep(80, 0.4, 0.2); }
        break;
      }
      case "INVESTIGATE": {
        this.moveEntityTo(this.eLastKnown, speedBase * 1.1, dt);
        if (this.ePos.distanceTo(this.eLastKnown) < 1.5) { this.eState = "SEARCH"; this.eSearchTimer = 5; }
        if (canSee) { this.eState = "CHASE"; }
        break;
      }
      case "CHASE": {
        this.entity.visible = true;
        if (canSee) { this.eLastKnown.copy(playerVec); this.eLostTimer = 0; }
        else { this.eLostTimer += dt; }
        this.moveEntityTo(this.eLastKnown, chaseSpeed, dt);
        if (this.ePos.distanceTo(playerVec) < 1.3 && !this.hiding) { this.die(); return; }
        if (this.eLostTimer > 3.5) { this.eState = "SEARCH"; this.eSearchTimer = 6; }
        break;
      }
      case "SEARCH": {
        this.eSearchTimer -= dt;
        this.moveEntityTo(this.eLastKnown, speedBase, dt);
        // check nearby hide spots
        if (this.hiding && this.hideSpot && this.ePos.distanceTo(this.hideSpot.pos) < 1.6) {
          this.die(); return;
        }
        if (canSee) { this.eState = "CHASE"; }
        if (this.eSearchTimer <= 0) {
          if (this.aggression === 2) { this.eState = "PATROL"; }
          else { this.eState = "PATROL"; this.entity.visible = Math.random() > 0.5; }
        }
        break;
      }
      case "DORMANT":
        break;
    }
    this.entity.position.copy(this.ePos);
    // face movement direction
    this.entity.rotation.y = Math.atan2(this.ePos.x - this.prevEX, this.ePos.z - this.prevEZ);
    this.prevEX = this.ePos.x; this.prevEZ = this.ePos.z;
  }
  prevEX = 0; prevEZ = 0;

  entityFacing(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.entity.rotation.y), 0, Math.cos(this.entity.rotation.y));
  }
  randomWaypoint(): THREE.Vector3 {
    const wps = this.world.entityWaypoints;
    return wps[Math.floor(Math.random() * wps.length)].clone();
  }
  moveEntityTo(target: THREE.Vector3, speed: number, dt: number) {
    const dir = new THREE.Vector3(target.x - this.ePos.x, 0, target.z - this.ePos.z);
    const d = dir.length();
    if (d < 0.05) return;
    dir.normalize();
    let dx = dir.x * speed * dt;
    let dz = dir.z * speed * dt;
    let nx = this.ePos.x + dx;
    if (this.collide(nx, this.ePos.z, ENTITY_R)) {
      // try slide along z
      nx = this.ePos.x;
      dz = (dir.z >= 0 ? 1 : -1) * speed * dt;
    }
    let nz = this.ePos.z + dz;
    if (this.collide(nx, nz, ENTITY_R)) {
      nz = this.ePos.z;
      // try alt x
      const altx = this.ePos.x + (dir.x >= 0 ? 1 : -1) * speed * dt;
      if (!this.collide(altx, this.ePos.z, ENTITY_R)) nx = altx;
    }
    this.ePos.x = nx; this.ePos.z = nz;
  }

  // ---------------- END STATES ----------------
  die() {
    this.status = "dead";
    this.beep(60, 1.2, 0.3);
    document.exitPointerLock?.();
    this.emit();
  }
  win() {
    if (this.status === "win") return;
    this.status = "win";
    document.exitPointerLock?.();
    this.emit();
  }

  respawn() {
    // reset to before last chapter — simple: reset position, entity search
    this.status = "playing";
    this.hiding = false;
    this.stamina = 1;
    this.pos.copy(this.world.playerStart);
    if (this.entityActive) {
      this.ePos.copy(this.world.entityWaypoints[3]);
      this.entity.position.copy(this.ePos);
      this.eState = "PATROL";
      this.entity.visible = false;
    }
    this.renderer.domElement.requestPointerLock?.();
    this.emit();
  }

  // ---------------- HUD ----------------
  hudSnapshot(): HudState {
    return {
      status: this.status,
      chapter: this.chapter,
      objective: this.currentObjective,
      stamina: this.stamina,
      hasFlashlight: this.hasFlashlight,
      flashOn: this.flashOn,
      battery: this.battery,
      hasGun: this.hasGun,
      bullets: this.bullets,
      inventory: this.inventory.map((i) => ({ ...i })),
      prompt: this.highlight
        ? (this.highlight.type === "locker" && this.hiding ? "[E] Leave locker" : `[E] ${this.highlight.prompt}`)
        : (this.hiding ? "[E] Leave" : null),
      message: this.message,
      toast: this.toast,
      hiding: this.hiding,
      showInv: this.showInv,
      vignette: this.vignette,
    };
  }
  emit() { this.onHud(this.hudSnapshot()); }
  _throttle = 0;
  emitThrottle() {
    this._throttle++;
    if (this._throttle % 6 === 0) this.emit();
  }

  resize = () => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const scale = 0.5; // PSX low-res internal buffer
    this.renderer.setSize(Math.floor(w * scale), Math.floor(h * scale), false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("mousemove", this.onMouseMove);
    try { this.drone?.stop(); this.audioCtx?.close(); } catch { /* ignore */ }
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
