# Stillwater

A dreamy 45° isometric gondola-drifting game in a single HTML file. Tap the left
or right side of the screen to pole on that side — each tap nudges you forward
and pushes the hull away from the tap. Stop tapping and you coast to a halt.

No score, no losing. Just drift.

## Play

Open `index.html` (three.js r147 is inlined, works offline), or enable GitHub
Pages on this repo (Settings → Pages → main / root) and play at
`https://pete1450.github.io/Stillwater/`.

## Build

The playable file is assembled from sources in `build/`:

```
build/
  head.html      page shell + CSS + HUD
  three.min.js   three.js r147 (inlined into the final file)
  logic.js       pure game logic: canal path, physics, segment generation (node-testable)
  music.js       generative ambient music (WebAudio, no audio files)
  game.js        three.js rendering, input, animation
  build.py       assembles index.html
  test_*.js      node test suites (logic, headless sim with THREE/DOM stubs, music)
```

Rebuild:

```sh
cd build
node test_logic.js && node test_sim.js && node test_music.js
python3 build.py ../index.html
```
