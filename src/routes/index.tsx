import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import type { Game, HudState } from "@/game/engine";

export const Route = createFileRoute("/")({
  component: GamePage,
});

const CONTROLS: [string, string][] = [
  ["W A S D", "Move"],
  ["SHIFT", "Sprint (uses stamina)"],
  ["CTRL", "Crouch"],
  ["E", "Interact / Pick up / Hide"],
  ["F", "Toggle flashlight"],
  ["LMB", "Fire handgun"],
  ["TAB", "Inventory"],
  ["ESC", "Pause"],
  ["H", "Toggle controls guide"],
];

const ITEM_LABEL: Record<string, string> = {
  battery: "Batteries",
  keycard: "Keycard",
};

function GamePage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    let disposed = false;
    let game: Game | null = null;
    (async () => {
      const { Game } = await import("@/game/engine");
      if (disposed || !mountRef.current) return;
      game = new Game(mountRef.current);
      game.onHud = (s) => setHud(s);
      gameRef.current = game;
      setHud(game.hudSnapshot());
    })();

    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && gameRef.current) {
        const g = gameRef.current;
        if (g.status === "playing") {
          if (g.paused) g.resume();
          else g.pause();
        }
      }
    };
    window.addEventListener("keydown", onEsc);
    return () => {
      disposed = true;
      window.removeEventListener("keydown", onEsc);
      game?.dispose();
    };
  }, []);

  const begin = useCallback(() => {
    gameRef.current?.start();
    setStarted(true);
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black select-none">
      <div ref={mountRef} className="absolute inset-0" />

      {/* CRT / vignette overlays */}
      <div className="crt-scanlines absolute inset-0 pointer-events-none z-30" />
      {hud && hud.status === "playing" && (
        <div
          className="vignette-overlay transition-opacity duration-300"
          style={{ opacity: 0.35 + (hud.vignette || 0) * 0.5 }}
        />
      )}

      {/* HUD */}
      {hud && hud.status === "playing" && !hud.message && (
        <PlayHud hud={hud} />
      )}

      {/* Crosshair */}
      {hud && hud.status === "playing" && !hud.message && !hud.hiding && (
        <div className="absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2">
          <div className="h-1.5 w-1.5 rounded-full bg-foreground/60" />
        </div>
      )}

      {/* Note / computer message modal */}
      {hud?.message && (
        <MessageModal
          title={hud.message.title}
          body={hud.message.body}
          onClose={() => gameRef.current?.closeMessage()}
        />
      )}

      {/* Intro / title */}
      {(!hud || hud.status === "intro") && (
        <IntroScreen onBegin={begin} ready={!!gameRef.current} />
      )}

      {/* Pause */}
      {hud?.status === "playing" && gameRef.current?.paused && (
        <PauseScreen onResume={() => gameRef.current?.resume()} />
      )}

      {/* Death */}
      {hud?.status === "dead" && (
        <DeathScreen onReload={() => gameRef.current?.respawn()} />
      )}

      {/* Win */}
      {hud?.status === "win" && <EndingScreen />}
    </div>
  );
}

function PlayHud({ hud }: { hud: HudState }) {
  return (
    <>
{/* Objective top-left */}
<div className="absolute left-4 top-4 z-30 max-w-sm">
  <div className="rounded-md border border-border bg-black/80 px-4 py-3">
    <div className="font-terminal text-hazard text-xs tracking-[0.3em] uppercase">
      Chapter {hud.chapter}
    </div>

    <div className="mt-2 font-terminal text-foreground/60 text-xs tracking-[0.25em] uppercase">
      Current Objective
    </div>

    <div className="mt-1 font-typewriter text-white text-lg leading-relaxed">
      {hud.objective}
    </div>

    <div className="mt-3 h-1 w-full rounded bg-foreground/10 overflow-hidden">
      <div
        className="h-full bg-hazard transition-all duration-500"
        style={{ width: `${(hud.chapter / 5) * 100}%` }}
      />
    </div>
  </div>
</div>

      {/* Toast center-top */}
      {hud.toast && (
        <div className="absolute left-1/2 top-16 z-30 -translate-x-1/2">
          <div className="font-typewriter text-blood text-lg animate-flicker-in drop-shadow-[0_2px_4px_rgba(0,0,0,1)] text-center">
            {hud.toast}
          </div>
        </div>
      )}

      {/* Bottom-left status */}
      <div className="absolute bottom-4 left-4 z-30 font-terminal text-base space-y-1">
        <StatBar label="STAMINA" value={hud.stamina} className="text-crt" />
        {hud.hasFlashlight && (
          <StatBar
            label={`LIGHT ${hud.flashOn ? "ON" : "OFF"}`}
            value={hud.battery}
            className="text-hazard"
          />
        )}
        {hud.hasGun && (
          <div className="text-blood">
            AMMO {"|".repeat(hud.bullets)}{" ".repeat(Math.max(0, 3 - hud.bullets))}{" "}
            <span className="opacity-60">({hud.bullets}/3)</span>
          </div>
        )}
      </div>

      {/* Prompt center-bottom */}
      {hud.prompt && (
        <div className="absolute bottom-24 left-1/2 z-30 -translate-x-1/2">
          <div className="font-terminal text-crt text-xl tracking-wide drop-shadow-[0_2px_3px_rgba(0,0,0,1)]">
            {hud.prompt}
          </div>
        </div>
      )}

      {/* Hiding indicator */}
      {hud.hiding && (
        <div className="absolute inset-0 z-20 bg-black/70 flex items-end justify-center pb-32 pointer-events-none">
          <div className="font-typewriter text-foreground/80 text-lg tracking-widest">
            HIDING — hold your breath
          </div>
        </div>
      )}

      {/* Inventory */}
      {hud.showInv && (
        <div className="absolute right-4 top-4 z-30 w-56 border border-border bg-black/85 p-3 font-terminal">
          <div className="text-hazard text-sm tracking-widest mb-2 uppercase">Inventory (4)</div>
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => {
              const it = hud.inventory[i];
              return (
                <div
                  key={i}
                  className="aspect-square border border-border/60 flex flex-col items-center justify-center text-center text-foreground/90 text-sm p-1"
                >
                  {it ? (
                    <>
                      <span>{ITEM_LABEL[it.kind] ?? it.kind}</span>
                      {it.count > 1 && <span className="text-hazard">x{it.count}</span>}
                    </>
                  ) : (
                    <span className="text-foreground/20">empty</span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="text-foreground/40 text-xs mt-2">TAB to close</div>
        </div>
      )}

      {/* Controls guide — top right */}
      {hud.showGuide && !hud.showInv && (
        <div className="absolute right-4 top-4 z-30 w-52 border border-border/60 bg-black/70 p-3 font-terminal text-sm backdrop-blur-sm">
          <div className="text-hazard tracking-widest uppercase mb-2 flex justify-between">
            <span>Controls</span>
            <span className="text-foreground/40 text-xs">[H] hide</span>
          </div>
          <div className="space-y-0.5">
            {CONTROLS.map(([k, d]) => (
              <div key={k} className="flex justify-between text-foreground/80">
                <span className="text-crt">{k}</span>
                <span className="text-foreground/70">{d}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {!hud.showGuide && !hud.showInv && (
        <div className="absolute right-4 top-4 z-30 font-terminal text-xs text-foreground/40">
          [H] Controls
        </div>
      )}
    </>
  );
}

function StatBar({ label, value, className }: { label: string; value: number; className?: string }) {
  const blocks = 12;
  const filled = Math.round(value * blocks);
  return (
    <div className={className}>
      <span className="tracking-widest">{label} </span>
      <span className="opacity-90">
        [{"#".repeat(filled)}
        <span className="opacity-30">{"-".repeat(blocks - filled)}</span>]
      </span>
    </div>
  );
}

function MessageModal({ title, body, onClose }: { title: string; body: string; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key.toLowerCase() === "e") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/95 p-6">
      <div className="relative max-w-2xl w-full border-2 border-crt/60 bg-black p-8 shadow-2xl">
        <div className="font-terminal text-crt text-3xl tracking-widest mb-5 uppercase border-b border-crt/40 pb-3">
          {title}
        </div>
        <div className="font-typewriter text-foreground whitespace-pre-line leading-loose text-lg">
          {body}
        </div>
        <button
          onClick={onClose}
          className="mt-8 font-terminal text-xl text-hazard tracking-widest hover:text-foreground transition-colors"
        >
          [ CLOSE — press E or ESC ]
        </button>
      </div>
    </div>
  );
}

function IntroScreen({ onBegin, ready }: { onBegin: () => void; ready: boolean }) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black px-6 text-center overflow-y-auto py-10">
      <div className="font-typewriter text-hazard text-sm tracking-[0.5em] uppercase mb-2 animate-flicker-in">
        Night Shift · Sector 7 · Food Distribution
      </div>
      <h1 className="font-typewriter text-foreground text-5xl md:text-6xl tracking-widest mb-3 drop-shadow-[0_0_12px_rgba(180,60,40,0.5)]">
        THE LAST SHIFT
      </h1>
      <p className="font-typewriter text-foreground/60 max-w-md text-sm mb-8">
        You are the new night-shift employee. Clock in. Complete your tasks.
        Something in the warehouse remembers the last one who worked here.
      </p>

      <div className="border border-border bg-black/60 p-5 mb-8 w-full max-w-md">
        <div className="font-terminal text-crt text-lg tracking-widest uppercase mb-3">Controls</div>
        <div className="grid grid-cols-1 gap-1 font-terminal text-base">
          {CONTROLS.map(([k, d]) => (
            <div key={k} className="flex justify-between text-foreground/80">
              <span className="text-hazard">{k}</span>
              <span>{d}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        disabled={!ready}
        onClick={onBegin}
        className="font-terminal text-2xl tracking-[0.3em] text-crt border-2 border-crt/50 px-10 py-3 hover:bg-crt/10 hover:text-foreground transition-colors disabled:opacity-40"
      >
        {ready ? "▶ BEGIN SHIFT" : "LOADING..."}
      </button>
      <p className="font-terminal text-foreground/40 text-sm mt-4">
        Click the screen to lock the mouse. Use headphones.
      </p>
    </div>
  );
}

function PauseScreen({ onResume }: { onResume: () => void }) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90">
      <h2 className="font-typewriter text-foreground text-4xl tracking-widest mb-8">PAUSED</h2>
      <button
        onClick={onResume}
        className="font-terminal text-2xl tracking-[0.3em] text-crt border-2 border-crt/50 px-10 py-3 hover:bg-crt/10 transition-colors"
      >
        ▶ RESUME
      </button>
      <p className="font-terminal text-foreground/40 text-sm mt-6">ESC to resume</p>
    </div>
  );
}

function DeathScreen({ onReload }: { onReload: () => void }) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black">
      <h2 className="font-typewriter text-blood text-5xl md:text-6xl tracking-[0.3em] mb-3 animate-flicker-in drop-shadow-[0_0_20px_rgba(180,30,30,0.6)]">
        SHIFT TERMINATED
      </h2>
      <p className="font-typewriter text-foreground/50 mb-10">The shadow reached you.</p>
      <button
        onClick={onReload}
        className="font-terminal text-2xl tracking-[0.3em] text-crt border-2 border-crt/50 px-10 py-3 hover:bg-crt/10 transition-colors"
      >
        ↻ RELOAD CHECKPOINT
      </button>
    </div>
  );
}

function EndingScreen() {
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black px-6 text-center">
      <div className="font-typewriter text-crt text-sm tracking-[0.4em] uppercase mb-4 animate-flicker-in">
        Emergency exit · 5:59 AM
      </div>
      <h2 className="font-typewriter text-foreground text-4xl md:text-5xl tracking-widest mb-6">
        YOU ESCAPED
      </h2>
      <div className="font-typewriter text-foreground/70 max-w-md text-sm leading-relaxed space-y-3 mb-6">
        <p>Cold air. The parking lot. You made it out.</p>
        <p>Your badge buzzes. The light turns green. ACTIVE.</p>
        <p className="text-hazard">
          The radio in your pocket crackles: <br />"New shift begins at 11:00 PM."
        </p>
        <p>Behind you, the warehouse lights flick on, one by one.</p>
        <p className="text-blood">
          On the employee record wall, a new name glows.
          <br />
          It's yours.
        </p>
      </div>
      <div className="font-typewriter text-foreground text-3xl tracking-[0.5em] mt-2">END</div>
    </div>
  );
}
