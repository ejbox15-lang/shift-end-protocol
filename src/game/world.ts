import * as THREE from "three";

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export type InteractType =
  | "door"
  | "locker"
  | "note"
  | "computer"
  | "radio"
  | "scanner"
  | "generator"
  | "keycard"
  | "pickup"
  | "exit";

export interface Interactable {
  id: string;
  type: InteractType;
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  radius: number;
  prompt: string;
  used?: boolean;
  locked?: boolean;
  data?: any;
}

export interface WorldBuild {
  colliders: AABB[];
  interactables: Interactable[];
  hideSpots: { pos: THREE.Vector3; box: AABB }[];
  entitySpawn: THREE.Vector3;
  playerStart: THREE.Vector3;
  entityWaypoints: THREE.Vector3[];
}

// ---- Materials (PSX flat look) ----
const matWall = new THREE.MeshLambertMaterial({ color: 0x3a3d42 });
const matWall2 = new THREE.MeshLambertMaterial({ color: 0x2c2f34 });
const matFloor = new THREE.MeshLambertMaterial({ color: 0x24262b });
const matCeil = new THREE.MeshLambertMaterial({ color: 0x1a1c20 });
const matShelf = new THREE.MeshLambertMaterial({ color: 0x554433 });
const matBox = new THREE.MeshLambertMaterial({ color: 0x7a6a4a });
const matMetal = new THREE.MeshLambertMaterial({ color: 0x4a5157 });
const matLocker = new THREE.MeshLambertMaterial({ color: 0x395a4a });
const matFreezer = new THREE.MeshLambertMaterial({ color: 0x6a7a85 });
const matDesk = new THREE.MeshLambertMaterial({ color: 0x3a2f28 });
const matSign = new THREE.MeshLambertMaterial({ color: 0xc9a227 });
const matSignRed = new THREE.MeshLambertMaterial({ color: 0x992222 });
const matMonitor = new THREE.MeshLambertMaterial({ color: 0x111111 });
const matMonitorBroken = new THREE.MeshLambertMaterial({ color: 0x220808, emissive: 0x330000 });
const matPipe = new THREE.MeshLambertMaterial({ color: 0x1f2226 });
const matRust = new THREE.MeshLambertMaterial({ color: 0x5a2a1a });

const WALL_H = 5;

function addProp(
  scene: THREE.Scene,
  colliders: AABB[] | null,
  x: number, z: number, w: number, d: number, h: number, y: number,
  mat: THREE.Material,
) {
  return addBox(scene, colliders, x, z, w, d, h, y, mat);
}

function addSign(scene: THREE.Scene, x: number, z: number, y: number, rotY: number, red = false) {
  const g = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.4), red ? matSignRed : matSign);
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  scene.add(g);
  // dark border strip
const b = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 0.18), new THREE.MeshLambertMaterial({ color: 0x0a0a0a }));
  b.position.set(x, y - 0.55, z);
  b.rotation.y = rotY;
  scene.add(b);
}

function addCamera(scene: THREE.Scene, x: number, z: number, rotY: number) {
  // ceiling mount
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.4, 6), matMetal);
  base.position.set(x, WALL_H - 0.4, z);
  scene.add(base);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.7), matMetal);
  body.position.set(x, WALL_H - 0.7, z);
  body.rotation.y = rotY;
  scene.add(body);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.15, 6), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
  lens.rotation.z = Math.PI / 2;
  lens.position.set(x + Math.sin(rotY) * 0.4, WALL_H - 0.7, z + Math.cos(rotY) * 0.4);
  scene.add(lens);
}

function addMonitor(scene: THREE.Scene, colliders: AABB[] | null, x: number, z: number, broken = false) {
  addBox(scene, colliders, x, z, 1, 0.4, 0.8, 1.2, broken ? matMonitorBroken : matMonitor);
}

function addPipeRun(scene: THREE.Scene, x0: number, x1: number, z: number, y: number) {
  const len = Math.abs(x1 - x0);
  const g = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, len, 6), matPipe);
  g.rotation.z = Math.PI / 2;
  g.position.set((x0 + x1) / 2, y, z);
  scene.add(g);
}

function addBox(
  scene: THREE.Scene,
  colliders: AABB[] | null,
  x: number,
  z: number,
  w: number,
  d: number,
  h: number,
  y: number,
  mat: THREE.Material,
) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y + h / 2, z);
  scene.add(mesh);
  if (colliders) {
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }
  return mesh;
}

interface Door {
  side: "n" | "s" | "e" | "w";
  center: number;
  width: number;
}

function buildRoom(
  scene: THREE.Scene,
  colliders: AABB[],
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  doors: Door[],
  mat: THREE.Material,
  floorMat: THREE.Material = matFloor,
) {
  const t = 0.4;
  // floor
  const fw = maxX - minX;
  const fd = maxZ - minZ;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(fw, fd), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0, cz);
  scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(fw, fd), matCeil);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(cx, WALL_H, cz);
  scene.add(ceil);

  const sides: ("n" | "s" | "e" | "w")[] = ["n", "s", "e", "w"];
  for (const side of sides) {
    const sideDoors = doors.filter((dd) => dd.side === side).sort((a, b) => a.center - b.center);
    const horizontal = side === "n" || side === "s";
    const start = horizontal ? minX : minZ;
    const end = horizontal ? maxX : maxZ;
    const fixed = side === "n" ? minZ : side === "s" ? maxZ : side === "w" ? minX : maxX;
    // build wall segments between door gaps
    let cursor = start;
    const segments: [number, number][] = [];
    for (const dr of sideDoors) {
      const g0 = dr.center - dr.width / 2;
      const g1 = dr.center + dr.width / 2;
      if (g0 > cursor) segments.push([cursor, g0]);
      cursor = Math.max(cursor, g1);
    }
    if (cursor < end) segments.push([cursor, end]);
    for (const [s0, s1] of segments) {
      const len = s1 - s0;
      if (len <= 0.01) continue;
      const mid = (s0 + s1) / 2;
      if (horizontal) {
        addBox(scene, colliders, mid, fixed, len, t, WALL_H, 0, mat);
      } else {
        addBox(scene, colliders, fixed, mid, t, len, WALL_H, 0, mat);
      }
    }
  }
}

let lockerIdx = 0;
function makeLocker(
  scene: THREE.Scene,
  colliders: AABB[],
  hideSpots: WorldBuild["hideSpots"],
  interactables: Interactable[],
  x: number,
  z: number,
  facing: number,
) {
  const mesh = addBox(scene, colliders, x, z, 1, 1, 4, 0, matLocker);
  const id = `locker_${lockerIdx++}`;
  interactables.push({
    id,
    type: "locker",
    mesh,
    pos: new THREE.Vector3(x, 1.2, z),
    radius: 2.2,
    prompt: "Hide in locker",
  });
  hideSpots.push({
    pos: new THREE.Vector3(x, 1.2, z),
    box: { minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5 },
  });
}

function makeNote(
  scene: THREE.Scene,
  interactables: Interactable[],
  id: string,
  x: number,
  z: number,
  title: string,
  body: string,
) {
  const g = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.65), new THREE.MeshBasicMaterial({ color: 0xd8d2b0 }));
  g.position.set(x, 1.15, z);
  g.rotation.x = -Math.PI / 2;
  scene.add(g);
  interactables.push({
    id,
    type: "note",
    mesh: g,
    pos: new THREE.Vector3(x, 1.15, z),
    radius: 2,
    prompt: "Read note",
    data: { title, body },
  });
}

function makePickup(
  scene: THREE.Scene,
  interactables: Interactable[],
  id: string,
  kind: string,
  x: number,
  z: number,
  color: number,
  prompt: string,
) {
  const g = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.5), new THREE.MeshLambertMaterial({ color }));
  g.position.set(x, 1.05, z);
  scene.add(g);
  interactables.push({
    id,
    type: kind === "keycard" ? "keycard" : "pickup",
    mesh: g,
    pos: new THREE.Vector3(x, 1.05, z),
    radius: 2,
    prompt,
    data: { kind },
  });
}

export function buildWorld(scene: THREE.Scene): WorldBuild {
  const colliders: AABB[] = [];
  const interactables: Interactable[] = [];
  const hideSpots: WorldBuild["hideSpots"] = [];

  // ============ ROOMS ============
  // Break room (start)  z 28..46
  buildRoom(scene, colliders, -10, 10, 28, 46, [{ side: "n", center: 0, width: 3 }], matWall);
  // Main floor  z -14..28, x -26..26
  buildRoom(scene, colliders, -26, 26, -14, 28, [
    { side: "s", center: 0, width: 3 }, // to break room
    { side: "w", center: 8, width: 3 }, // to freezer
    { side: "e", center: 8, width: 3 }, // to loading dock
    { side: "n", center: -16, width: 3 }, // to maintenance
    { side: "n", center: 16, width: 3 }, // to security
  ], matWall);
  // Freezer  x -44..-26 z 0..20
  buildRoom(scene, colliders, -44, -26, 0, 20, [{ side: "e", center: 8, width: 3 }], matFreezer, matFreezer);
  // Loading dock  x 26..46 z -4..24
  buildRoom(scene, colliders, 26, 46, -4, 24, [
    { side: "w", center: 8, width: 3 },
    { side: "e", center: 10, width: 4 }, // final exit
  ], matWall2);
  // Maintenance  x -26..-6 z -32..-14
  buildRoom(scene, colliders, -26, -6, -32, -14, [{ side: "s", center: -16, width: 3 }], matWall2);
  // Security  x 6..26 z -32..-14
  buildRoom(scene, colliders, 6, 26, -32, -14, [{ side: "s", center: 16, width: 3 }], matWall2);

  // ============ BREAK ROOM CONTENT ============
  // time clock
  const clock = addBox(scene, colliders, -9.5, 30, 0.6, 1.2, 1.4, 1.1, matMetal);
  interactables.push({ id: "timeclock", type: "scanner", mesh: clock, pos: new THREE.Vector3(-9.3, 1.6, 30), radius: 2.5, prompt: "Clock in", data: { task: "clockin" } });
  // lockers
  for (let i = 0; i < 4; i++) makeLocker(scene, colliders, hideSpots, interactables, 6 + i * 1.1, 45.3, 0);
  // equipment table with flashlight/scanner/radio
  addBox(scene, colliders, -6, 44, 3, 1.2, 1, 0, matDesk);
  makePickup(scene, interactables, "equip", "equipment", -6, 44, 0xffcc33, "Take equipment (flashlight, scanner, radio)");
  // supervisor office marker (note)
  makeNote(scene, interactables, "note_intro", 8, 30, "SHIFT ASSIGNMENT", "Welcome, new hire. Clock in, grab your gear, then scan the pallets on the main floor. Check the freezer temps. Report to me when done. — Supervisor Dale");

  // ============ MAIN FLOOR SHELVES / PALLETS ============
  // shelving to form aisles
  for (let row = 0; row < 3; row++) {
    const zc = -6 + row * 12;
    for (let s = -1; s <= 1; s += 2) {
      addBox(scene, colliders, s * 12, zc, 6, 2, 4.2, 0, matShelf);
    }
  }
  // pallets to scan (5)
// Extra warehouse clutter
addBox(scene, colliders, -4, -6, 2, 2, 2, 0, matBox);
addBox(scene, colliders, 4, 8, 2, 2, 2, 0, matBox);
addBox(scene, colliders, -16, 18, 2, 2, 2, 0, matBox);
addBox(scene, colliders, 16, -2, 2, 2, 2, 0, matBox);

addBox(scene, colliders, 0, 10, 1.2, 1.2, 3, 0, matMetal);
addBox(scene, colliders, -8, 0, 1.2, 1.2, 3, 0, matMetal);
  const palletPos: [number, number][] = [
    [-6, 2], [6, 2], [-6, 14], [6, 14], [0, 22],
  ];
  palletPos.forEach(([x, z], i) => {
    const p = addBox(scene, colliders, x, z, 1.6, 1.6, 1, 0, matBox);
    interactables.push({
      id: `pallet_${i}`,
      type: "scanner",
      mesh: p,
      pos: new THREE.Vector3(x, 1.2, z),
      radius: 2.5,
      prompt: "Scan pallet",
      data: { task: "pallet" },
    });
  });
  // label printer / station
  const printer = addBox(scene, colliders, -20, 20, 1.4, 1.2, 1.3, 0, matMetal);
  interactables.push({ id: "printer", type: "computer", mesh: printer, pos: new THREE.Vector3(-20, 1.5, 20), radius: 2.5, prompt: "Print shipping labels", data: { task: "labels" } });
  makeNote(scene, interactables, "note_inv", 20, 12, "INVENTORY DISCREPANCY", "Pallet #47 logged in AND out on the same night three years ago. Same night the fire alarm went off. Records were 'corrected' the next morning.");
  makeLocker(scene, colliders, hideSpots, interactables, 22, -6, 0);
  makeLocker(scene, colliders, hideSpots, interactables, -22, -6, 0);

  // ============ FREEZER ============
  addBox(scene, null, -35, 4, 3, 0.4, 1.6, 1.2, matMetal);
  const tempMon = addBox(scene, colliders, -43, 10, 0.5, 1.5, 1.2, 1.2, matMetal);
  interactables.push({ id: "temp", type: "computer", mesh: tempMon, pos: new THREE.Vector3(-42.5, 1.8, 10), radius: 2.5, prompt: "Check freezer temperature", data: { task: "temp" } });
  makeNote(scene, interactables, "note_freezer", -30, 16, "COLD STORAGE LOG", "The old employee — badge #013 — was last seen entering cold storage. He never clocked out. The company said he 'transferred.'");
  makePickup(scene, interactables, "batt_freezer", "battery", -38, 6, 0x33ff88, "Pick up batteries");

  // ---- Cold storage inner (past freezer, north branch) ----
  buildRoom(scene, colliders, -44, -26, 20, 40, [
    { side: "s", center: -35, width: 3 },
  ], matFreezer, matFreezer);
  // meat racks / hanging shapes
  for (let i = 0; i < 4; i++) {
    addBox(scene, colliders, -40 + i * 4, 30, 0.6, 4, 0.4, 2.5, matWall2);
  }
  makeLocker(scene, colliders, hideSpots, interactables, -30, 38, 0);
  makeLocker(scene, colliders, hideSpots, interactables, -28, 38, 0);
  makeNote(scene, interactables, "note_cold", -35, 36, "SCRAWLED ON THE WALL", "HE'S STILL WORKING\nHE NEVER CLOCKED OUT\nDON'T TURN AROUND");
  makePickup(scene, interactables, "batt_cold", "battery", -40, 36, 0x33ff88, "Pick up batteries");

  // ============ LOADING DOCK ============
  addBox(scene, colliders, 40, 4, 6, 10, 3.5, 0, matMetal); // truck trailer
  const dockNote = makeNote;
  dockNote(scene, interactables, "note_dock", 30, 18, "SHIPPING MANIFEST", "Trailer 7 is not on any manifest. It has been parked at dock 3 for three years. Do not open it. — Management");
  makePickup(scene, interactables, "batt_dock", "battery", 30, -1, 0x33ff88, "Pick up batteries");
  // final trailer (ch5)
  const trailer = addBox(scene, colliders, 40, 20, 4, 4, 3.5, 0, matWall2);
  interactables.push({ id: "final_trailer", type: "computer", mesh: trailer, pos: new THREE.Vector3(38, 1.8, 20), radius: 3, prompt: "Open Trailer 7", locked: true, data: { task: "trailer" } });
  // emergency exit
  const exitDoor = addBox(scene, null, 46, 10, 0.5, 4, 4, 0, new THREE.MeshLambertMaterial({ color: 0x882222 }));
  interactables.push({ id: "exit", type: "exit", mesh: exitDoor, pos: new THREE.Vector3(45.5, 1.8, 10), radius: 3, prompt: "ESCAPE", locked: true, data: {} });

  // ============ SECURITY ROOM ============
  addBox(scene, colliders, 22, -20, 4, 1.2, 1.2, 0, matDesk);
  const cams = addBox(scene, colliders, 22, -30, 3, 0.6, 2, 1.4, matMetal);
  interactables.push({ id: "cameras", type: "computer", mesh: cams, pos: new THREE.Vector3(22, 2, -29.5), radius: 3, prompt: "View security cameras", data: { task: "cameras" } });
  const recordsPC = addBox(scene, colliders, 10, -30, 1.4, 1, 1.2, 0, matMetal);
  interactables.push({ id: "records", type: "computer", mesh: recordsPC, pos: new THREE.Vector3(10, 1.5, -29.3), radius: 2.5, prompt: "Access employee records", data: { task: "records" } });
  makePickup(scene, interactables, "gun", "gun", 22, -20, 0x222222, "Take emergency handgun");
  makePickup(scene, interactables, "keycard_a", "keycard", 16, -30, 0xffaa00, "Take security keycard");

  // ============ MAINTENANCE ============
  const gen = addBox(scene, colliders, -22, -28, 2.5, 2, 2.2, 0, matMetal);
  interactables.push({ id: "generator", type: "generator", mesh: gen, pos: new THREE.Vector3(-20, 1.5, -28), radius: 3, prompt: "Restore main generator", data: { task: "generator" } });
  const panel = addBox(scene, colliders, -25.5, -20, 0.5, 2, 1.6, 1.4, matMetal);
  interactables.push({ id: "panel", type: "generator", mesh: panel, pos: new THREE.Vector3(-25, 2, -20), radius: 2.5, prompt: "Restore partial power", data: { task: "power" } });
  makePickup(scene, interactables, "batt_maint", "battery", -10, -28, 0x33ff88, "Pick up batteries");
  makeNote(scene, interactables, "note_maint", -14, -18, "MAINTENANCE MEMO", "The generator was tampered with the night of the incident. Someone wanted the lights off. Badge #013 had generator access.");

  // ============ RADIO (in break room) ============
  const radio = addBox(scene, colliders, -9.5, 40, 0.5, 0.8, 0.7, 1.1, matMetal);
  interactables.push({ id: "radio", type: "radio", mesh: radio, pos: new THREE.Vector3(-9, 1.5, 40), radius: 2.5, prompt: "Listen to radio", data: {} });

  // ============ ENVIRONMENTAL STORYTELLING ============
  // Break room dressing
  addProp(scene, colliders, 0, 37, 3, 1.2, 0.9, 0, matDesk);
  addProp(scene, colliders, -2, 37, 0.5, 0.5, 0.9, 0, matWall2);
  addProp(scene, colliders, 2, 37, 0.5, 0.5, 0.9, 0, matWall2);
  addMonitor(scene, colliders, 0, 37, true);
  addSign(scene, 4, 45.8, 3, Math.PI, false);
  addSign(scene, -4, 45.8, 3, Math.PI, true);
  addCamera(scene, 8, 45, -Math.PI / 4);
  makeNote(scene, interactables, "note_break_1", -8, 37, "COFFEE ROTA",
    "Week 47: DALE, MARIA, TOM, — — —.\nWeek 48: DALE, MARIA, — — —.\nWeek 49: DALE, — — —.\nWeek 50: — — —.");
  makeNote(scene, interactables, "note_break_2", 4, 37, "TAPED TO THE FRIDGE",
    "IF THE LIGHTS FLICKER IN THE FREEZER,\nDO NOT GO IN.\nDO NOT ANSWER THE INTERCOM.\nJUST WAIT UNTIL 6 AM.");

  // Main floor
  addSign(scene, -12, 3.9, 3.5, 0, false);
  addSign(scene, 12, 3.9, 3.5, Math.PI, false);
  addSign(scene, -12, 15.9, 3.5, 0, true);
  addSign(scene, 12, 15.9, 3.5, Math.PI, false);
  addCamera(scene, -24, 0, Math.PI / 2);
  addCamera(scene, 24, 20, -Math.PI / 2);
  addCamera(scene, 0, 26, Math.PI);
  addPipeRun(scene, -24, 24, -10, WALL_H - 0.5);
  addPipeRun(scene, -24, 24, 24, WALL_H - 0.5);
  addProp(scene, colliders, -18, 8, 1.2, 1.2, 1.6, 0, matRust);
  addProp(scene, colliders, -18, 10, 1.2, 1.2, 1.6, 0, matRust);
  addProp(scene, colliders, 18, -10, 1.2, 1.2, 1.6, 0, matRust);
  addMonitor(scene, colliders, -20, 22, true);
  makeNote(scene, interactables, "note_aisle3", -12, -4, "AISLE 3 — HANDWRITTEN",
    "he stands here at 3:17 am\ndont look at the camera\ndont say his badge number out loud");
  makeNote(scene, interactables, "note_pallet", 6, 22, "PALLET SLIP",
    "Signed for by: E. #013\nDate: 07/14/2023 — 3:17 AM.\nToday's date is 07/14, three years later.");

  // Loading dock
  addProp(scene, colliders, 32, 8, 2.2, 3, 1.8, 0, matRust);
  addProp(scene, colliders, 32, 6.2, 2.2, 0.4, 0.6, 1.8, matMetal);
  addSign(scene, 46, 6, 3, -Math.PI / 2, true);
  addSign(scene, 46, 14, 3, -Math.PI / 2, false);
  addCamera(scene, 44, 20, -3 * Math.PI / 4);
  addPipeRun(scene, 27, 45, 0, WALL_H - 0.5);
  addMonitor(scene, colliders, 28, 22, true);
  makeNote(scene, interactables, "note_dock_2", 36, -2, "DRIVER LOGBOOK",
    "07/14/2023 — Trailer 7 backed in. Driver walked to the break room. Never came back out.\nTrailer never left the dock.");

  // Security office
  for (let i = 0; i < 3; i++) addMonitor(scene, null, 18 + i * 1.2, -30.5, i !== 1);
  addProp(scene, colliders, 24, -20, 0.4, 2, 2, 0, matMetal);
  addProp(scene, colliders, 8, -20, 0.4, 2, 2, 0, matMetal);
  addSign(scene, 6.3, -22, 3, Math.PI / 2, true);
  addCamera(scene, 24, -16, -3 * Math.PI / 4);
  makeNote(scene, interactables, "note_sec_1", 12, -20, "SECURITY LOG — 07/14/2023",
    "03:14 — Cam 4 static.\n03:16 — Cam 4 shows figure in aisle 3.\n03:17 — All cameras cut.\n03:18 — Cam 4 back. Nobody there. Blood on the floor.\n03:19 — Report filed. Report deleted.");
  makeNote(scene, interactables, "note_sec_2", 20, -22, "STICKY NOTE",
    "Do NOT give badge #013 to any new hire. If the printer prints one anyway, BURN IT.");

  // Maintenance
  addProp(scene, colliders, -10, -30, 1.5, 0.5, 1.2, 0, matDesk);
  addProp(scene, colliders, -14, -30, 0.6, 0.6, 1.5, 0, matRust);
  addProp(scene, colliders, -18, -16, 1, 1, 2, 0, matRust);
  addSign(scene, -25.7, -28, 3, Math.PI / 2, true);
  addSign(scene, -6.3, -22, 3, -Math.PI / 2, true);
  addCamera(scene, -24, -16, -Math.PI / 4);
  addPipeRun(scene, -25, -7, -22, WALL_H - 0.5);
  addMonitor(scene, colliders, -22, -22, true);
  makeNote(scene, interactables, "note_maint_2", -18, -30, "TAPED TO THE GENERATOR",
    "If you hear breathing on the intercom,\nkill the lights.\nHe can't find you without them.\n— M.");

  // Freezer + cold storage
  addSign(scene, -26.3, 4, 3, -Math.PI / 2, true);
  addSign(scene, -26.3, 12, 3, -Math.PI / 2, false);
  addCamera(scene, -42, 4, Math.PI / 4);
  addCamera(scene, -30, 38, -Math.PI / 4);
  addPipeRun(scene, -43, -27, 2, WALL_H - 0.5);
  addMonitor(scene, colliders, -42, 6, true);
  addProp(scene, colliders, -30, 6, 1.2, 1.2, 1.6, 0, matRust);
  makeNote(scene, interactables, "note_freezer_2", -40, 18, "FROZEN CLIPBOARD",
    "TEMP LOG — every entry after 07/14/2023 is written in the same handwriting.\nEven the ones from last week.\nEven the ones from tonight.");
  makeNote(scene, interactables, "note_cold_2", -40, 30, "SCRAWLED — LARGER",
    "I STILL PUNCH IN\nI STILL PUNCH IN\nI STILL PUNCH IN\nI STILL PUNCH IN");

  const entityWaypoints = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(-18, 0, -6),
    new THREE.Vector3(18, 0, -6),
    new THREE.Vector3(0, 0, 20),
    new THREE.Vector3(-18, 0, 18),
    new THREE.Vector3(18, 0, 18),
    new THREE.Vector3(0, 0, -8),
    new THREE.Vector3(-35, 0, 30),
    new THREE.Vector3(-35, 0, 10),
    new THREE.Vector3(38, 0, 10),
    new THREE.Vector3(0, 0, 34),
  ];

  return {
    colliders,
    interactables,
    hideSpots,
    entitySpawn: new THREE.Vector3(0, 0, -10),
    playerStart: new THREE.Vector3(0, 0, 40),
    entityWaypoints,
  };
}
