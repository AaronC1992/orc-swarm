# Orc Swarm

[![Play Now](play-now.svg)](https://aaronc1992.github.io/orc-swarm/)

A dependency-free browser tower-defense game inspired by *Sir, We Have an Orc Problem* (Mumpitz Games).
Tens of thousands of orcs are simulated as a particle fluid: they flow down the low-ground
lanes, pile up against obstacles and each other, and spill around corners like water.

## Run

Open `index.html` in a modern browser. No build step, no server, no dependencies.
Progress is saved in `localStorage`.

## How to play

1. **Upgrades** - spend crystals, orbs and cubes on upgrade cards. Every turret and ability has its own
   tab: buy its unlock card first (some build on an earlier weapon), then upgrade its stats. The Defense
   and Economy tabs cover base health, orc debuffs and income. Orbs come from first wins, cubes from
   perfect (no-leak) first clears.
2. **Level select** - 12 levels across 6 worlds.
3. **Build phase** - place turrets anywhere on the high ground beside the lanes, aim them and set their
   firing arcs. Each turret shows its grey firing wedge (the selected one is highlighted), and the
   toolbar shows how many of each turret are placed (`placed/total`). New turrets auto-aim down the lane.
4. **Battle** - orcs stream in. Stop them reaching your base. Use abilities to clear piles.
   Most orcs take a longer route if it avoids enough turret fire; a reckless minority still charge
   straight for the nearest exit. Orcs near an incoming strike can sidestep on open ground, so
   cover both branches of a fork or aim powers where the crowd has little room to dodge.
   Explosive hits flash orcs orange, flamethrowers scorch them, and the dead leave pixel blood on the ground.
5. **Result** - crystals are paid out per kill (gold and silver orcs pay more, and later levels pay more
   per kill). Income is tight on purpose, so expect to replay levels to afford everything.

Turrets: Gunner, Cannon, Flamethrower, Mortar, Laser, Tesla, Grenade launcher.
Abilities: Missile, Strafing run, Bomb, Orbital strike, Cryo, Nuke.
The missile slot shows rounds left in its six-shot rack. Tapping and holding use the same
rack: reload upgrades shorten the gap between shots, but an empty rack takes 3.5 seconds to refill.

## Controls

| Input | Action |
| --- | --- |
| `1`-`9` | Build: pick turret. Battle: pick ability |
| Click | Place turret / fire click-abilities |
| Drag | Move or aim a turret; draw a line for line-abilities |
| Mouse wheel | Widen / narrow the selected turret's firing arc |
| Right-click | Remove turret (build) |
| `R` | Recall all turrets |
| `Space` | Start battle |
| `F` | Cycle game speed (x1 / x2 / x3) |
| `Esc` / `P` | Pause |
| `M` | Mute |
| `Enter` | Continue (title, upgrades, result) |
| `←` / `→` | Switch upgrade tab |

**Phone or tablet:** Tap a turret in the toolbar, then tap high ground to place it.
Drag the turret to move it or drag its aiming handle to turn it. Use **Arc -**, **Arc +**
and **Remove** for the selected turret. In battle, tap to fire or drag and release for
a line attack. In Upgrades, swipe the tab strip to switch weapons and tap a card's price
to buy it. Both orientations work; landscape gives a wider view.

**VR headset:** Open the [live game](https://aaronc1992.github.io/orc-swarm/) in a browser
that supports immersive WebXR with a pointing controller. Face forward and select
**Enter VR** on the title screen. Aim the dot at the virtual board and pull the trigger
to select, place, or fire; hold and drag to move a turret, aim its handle, or draw a
line attack. Menus, upgrades, and pause controls are on the board. Choose **Leave VR**
from the pause or main menu to return to the regular game. Saves stay in that browser.

## Notes

All art and audio are generated procedurally. Mechanics and numbers are an approximation,
not a copy, of the original game. This is an unofficial fan project.
