# companion-module-atem-crosspoint

> **AI-assisted project.** This module was built with the help of
> [Claude](https://claude.ai), Anthropic's AI assistant — including
> implementation and documentation. Review it accordingly before relying on
> it in production. It has **never been loaded into Companion**: it is verified
> by a test harness driving its real source against a fake crosspoint server.

A [Bitfocus Companion](https://bitfocus.io/companion) connection module for
**ATEM Crosspoint** — route a fleet of Blackmagic ATEM switchers from a Stream
Deck: any source to any aux, ME bus, keyer input, SuperSource box or multiview
window, plus fleet-wide salvos and destination locks.

## What it does

- **X-Y panel presets** — press a destination, then press a source. One button
  per destination and one per source, which is a couple of hundred buttons for a
  fleet instead of the tens of thousands one-per-crosspoint would need. The
  selection lives in this Companion, so two Companions never fight over a pending
  destination.
- **Direct crosspoints** — a plain "route this source to this destination"
  action when you want one button to mean one thing.
- **Salvos** — take a named set of crosspoints across every switcher at once.
- **Locks** — lock, unlock or force-unlock a destination, with feedback. Locks
  are held per IP address, as a Videohub does it, and are shared with the
  crosspoint server's browser UI.
- **A live label per destination** — `$(atem-crosspoint:stage_aux_0_source)` is
  whatever Aux 1 is carrying right now, so a monitor-wall button says so.

## Actions

| Action                          | What it does                                      |
| ------------------------------- | ------------------------------------------------- |
| Route a source to a destination | One crosspoint, explicitly                        |
| X-Y: select a destination       | Arms a destination. Sends nothing to the switcher |
| X-Y: take a source              | Routes the armed destination                      |
| X-Y: clear the selection        | Disarms                                           |
| Take a salvo                    | Fires every crosspoint in it, fleet-wide          |
| Lock or unlock a destination    | Lock / unlock / force / toggle                    |

Destinations and sources are addressed as `deviceId:id` — `stage:aux.0`,
`stage:1`. Both dropdowns allow a custom value, so a variable can drive them.

## Feedbacks

`crosspoint` (this destination is taking this source), `sourceOnSelected`,
`destinationSelected`, `locked`, `deviceOnline`, `panelAttached` (someone else's
Videohub panel is connected to that switcher), `serviceUp`.

## Install

Not in the official Companion store. Download the `.tgz` from Releases, or clone
this repo, then point Companion at it: **Settings → Developer modules path**.

## Connection

The crosspoint server's HTTP port, **8533** by default. **There is no
authentication and it binds every interface** — anyone who can reach that port
can re-route program on a live switcher. Private production network only.

## Development

```bash
npm install
npm test        # harness: real source vs a fake crosspoint server, 36 checks
npm run package # the only check that catches a packaging break
```

## License

MIT — see [LICENSE](LICENSE).
