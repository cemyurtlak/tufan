# TUFAN: Planetary Defense Mission

**NASA Space Apps Challenge 2026 · Challenge: _Space Mission Design Game_ · Team Immortal Orbit**

▶ **Play in your browser:** https://cemyurtlak.github.io/tufan/
(desktop Chrome or Edge recommended · keyboard + mouse · no install, no login)

📄 Demo slides (English, 7 slides): [docs/TUFAN_Demo.pdf](https://cemyurtlak.github.io/tufan/docs/TUFAN_Demo.pdf)  
🇹🇷 Jury presentation (Turkish, local event): [docs/TUFAN_Juri_Sunumu_TR.pdf](https://cemyurtlak.github.io/tufan/docs/TUFAN_Juri_Sunumu_TR.pdf)

A fictional 160 m asteroid, "2026 TK7 Tufan", may hit Earth in 10 years. With a US$1 billion budget the player designs the whole deflection mission, launches it, drives a rover on the asteroid to take measurements, directs the launch of the kinetic impactor and steers it in during final approach. Every decision trades off mass, money, power, data and time, and the result screen explains why the mission succeeded or failed.

> The scenario is fictional and is not a real threat.

**Languages:** English (default) and Turkish. Switch with the **EN / TR** buttons on the main menu; the choice is remembered. You can also open `?lang=tr` or `?lang=en`.

## Mission flow

| Stage | What happens |
|---|---|
| 1. Briefing | 10 years to impact; 65 % chance rubble pile, 35 % monolith |
| 2. Design | 4 launcher classes; deflection methods (kinetic impactor, anchored ion thruster, gravity tractor); rover modules (solar or RTG power, battery, instruments, antenna, fuel). Mass must fit the launcher, cost must stay under US$1,000 M. |
| 3. Launch | Cinematic that changes with the selected rocket: ignition, Max-Q, staging, fairing separation |
| 4. Surface operations | Drive the GEZGİN rover, step out for EVA: spectral scan, seismic sensors, core drill, impact beacon, ion thruster anchoring. Day/night cycle, battery, communication windows with Earth, escape velocity. |
| 5. Launch base | As flight director at LC-39: open the fuel valve, upload targeting data, run the GO/NO-GO poll, watch the wind, start the countdown |
| 6. Final approach | Steer the kinetic impactor with RCS thrusters onto the beacon; aim accuracy sets momentum transfer efficiency |
| 7. Deflection & result | Ejecta, ion thrust and tractor time-lapse; B-plane miss distance, Δv breakdown, true asteroid structure, score and "What did we learn?" |

**Presentation mode:** press **F2** anywhere (or *SELECT CHAPTER* in the main menu) to jump to any chapter; skipped chapters are filled with sample data.

## Controls

| Key | Action |
|---|---|
| W / S | Forward / back (brake) |
| A / D | Turn |
| Mouse | Camera (click the screen first) · wheel: zoom |
| Shift | Fast drive |
| Space | Thruster hop · skip cinematics |
| E (hold) | Scan / place / interact |
| F · C · H | Headlights · orbit camera · help |
| Esc | Pause |

## Science model

- **Kinetic impactor:** Δv = β·m·v / M. β depends on interior structure: rubble pile 3–4.2, monolith 1.3–2. NASA's DART mission measured β ≈ 3.6 at Dimorphos. Without the impact beacon, targeting efficiency drops from 95 % to 60 %.
- **Ion thruster:** a = n·0.25 N / M. If not anchored at the pole the thrust direction rotates and efficiency drops to 30 %.
- **Gravity tractor:** a = G·m / d². Without a mass measurement the safe hover distance grows from 1.6 R to 2.6 R.
- **Miss distance:** Δx ≈ 3·Δv·t (continuous thrust: t = T − t₀ − D/2).
- **Outcome:** ≥ 1.5 R⊕ safe, 1.1–1.5 R⊕ close call, < 1.1 R⊕ impact (gravitational focusing).
- The asteroid's real structure is random each game and is revealed only by surface measurements.

Asteroid gravity is scaled up for playability; the escape-velocity logic is physically correct. Rocket capacities and costs are approximations inspired by real vehicles.

## Data, assets and credits

- Earth day/night textures: NASA Blue Marble / Black Marble (via the three.js example textures)
- Moon texture: derived from NASA LRO data (via the three.js example textures)
- DART: Cheng et al., *Nature* 616, 457–460 (2023); https://science.nasa.gov/planetary-defense-dart/
- [three.js](https://threejs.org) r160, MIT License (vendored in `lib/`)
- Astronaut model: "Soldier.glb" from the three.js examples (Mixamo character)
- All sounds are synthesized in code; asteroid, rover, rockets and launch site are procedural.

## Use of AI

The game code was written with an AI coding assistant (Anthropic Claude) following the team's design decisions, testing and feedback. No AI-generated images, video or audio are used in the game; screenshots in the demo slides are real gameplay.

## Run locally

Double-click `TUFAN.html` (single-file build, works offline), or serve the folder: `python -m http.server 8000` → http://localhost:8000. `python paketle.py` rebuilds `TUFAN.html` from the sources.

## Files

```
index.html  css/  js/          game source (ES modules, no build step)
js/i18n.js, js/i18n_en.js     language system and English strings (source text is Turkish)
lib/                           three.js r160 + addons
assets/                        NASA textures, astronaut model
TUFAN.html                     single-file offline build
docs/                          demo slides, Turkish jury presentation
```
