# AGENTS.md — bringing an LLM up to speed on this Companion module

Orientation for an AI assistant (or a new human) picking this up cold. There is no
`CLAUDE.md` here; this is the entry point.

---

## 1. What this is

A **Bitfocus Companion connection module** for **ATEM Crosspoint**, the router matrix over a
fleet of Blackmagic ATEM switchers (`stoatworks-labs/atem-crosspoint`, private). It routes
crosspoints, fires salvos and takes locks.

JavaScript, Node 22 runtime, `@companion-module/base` 2.x.

## 2. Commands over REST, state over the WebSocket

The crosspoint server's WebSocket pushes exactly one message type — `snapshot`, the whole
fleet, coalesced to about 50ms — and acknowledges nothing a client sends. So it cannot carry
commands. REST answers 200 `{ok:true}` or 409 `{ok:false, reason}`, and **that reason is the
useful part**: "Aux 1 is not available on ME 1 Program" is a switcher doing its job, not a
broken button. It gets logged verbatim.

## 3. The thing that would otherwise burn a core

**Every push is a full snapshot.** `main.js` fingerprints the fleet's _shape_ — switcher ids
and names, destination and source ids and labels, salvo ids — and only re-registers
definitions when that changes. A crosspoint moving updates variable values and feedbacks and
nothing else. Do not "simplify" `applySnapshot` into an unconditional `rebuild()`; the test
suite has a case that fails if you do.

## 4. Why X-Y instead of a preset per crosspoint

A three-switcher fleet is roughly 150 destinations and 90 sources. One preset per pair is
tens of thousands of buttons. The X-Y pair — select a destination, then press a source — is
the same panel in a couple of hundred, and it is how a router panel works anyway. The
selection is module-local state (`self.selected`), deliberately not server state, so two
Companions do not fight over one another's pending destination.

Lock presets are generated for the Outputs section only. The lock _action_ works anywhere.

## 5. Addressing

Everything is `deviceId:id`, split on the **first** colon — destination ids contain dots
(`me.0.usk.1.fill`) but never colons. Companion dropdown choices are fixed at registration,
so a destination list cannot narrow itself to another field's switcher; the flat
device-prefixed list is the honest way to do it. A route whose source and destination are on
different switchers is rejected in the module, because an ATEM cannot take another ATEM's
source and the request could only fail.

## 6. Traps this module was written around

All of these produce a module that looks fine and quietly does nothing:

- `checkFeedbacks()` with no arguments checks **nothing** — use `checkAllFeedbacks()`. The
  test suite scans the source for it.
- `setVariableDefinitions` **throws on an array**, killing `init()` with no cause in the log.
- Presets are `setPresetDefinitions(structure, definitions)` with `type: 'simple'`. A 1.x
  `category` loads and the presets never appear.
- Preset variable references must use `self.label`, not the module id.
- `runEntrypoint` does not exist in base 2.x — `export default` the class and
  `export { UpgradeScripts }`. **`npm run package` is the only check that catches this**; a
  unit suite passes either way.
- An **escaped** `\n` in preset text draws literally on the key. Use a real newline.

## 7. Commands

```bash
npm install
npm test         # 36 checks: real source vs a fake crosspoint server (HTTP + WebSocket)
npm run package  # must pass before any release
npm run format
```

## 8. Status — be precise about it

**Never loaded into Companion, and never pointed at a real ATEM Crosspoint server** — the
harness is a fake server built to this module's understanding of the API. The app it drives
has itself never met ATEM hardware. Say so in any release note.
