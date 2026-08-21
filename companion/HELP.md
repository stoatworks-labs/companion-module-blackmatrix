# BlackMatrix

Routes a fleet of Blackmagic ATEM switchers through **BlackMatrix**, which
presents every bus that takes one source at a time — auxes, ME program and
preview, keyer fill and key, SuperSource boxes, multiview windows — as a router
destination.

## Connection

The crosspoint server, port **8533** by default.

**There is no authentication and it binds every interface.** Anyone who can
reach that port can re-route program on a live switcher. Private production
network only.

## The X-Y panel

The generated presets are a router panel, not one button per crosspoint:

1. Press a **destination** button. It turns blue — that destination is armed,
   and nothing has been sent to the switcher.
2. Press a **source** button. That crosspoint is made.

Source buttons light amber when the armed destination is already taking them, so
the panel shows the current route before you touch it. `Fleet → X-Y: what is
selected` is a tile showing the armed destination and what it is carrying.

Destination buttons carry a live label of their current source, so they read as
a monitor wall even when nothing is armed.

## Addressing, if you are building buttons by hand

Destinations and sources are `deviceId:id` — `stage:aux.0`, `stage:me.0.usk.1.fill`,
`stage:1`. Both dropdowns accept a custom value, so a variable can drive them.

A crosspoint lives on one switcher: routing `studio`'s source to `stage`'s aux is
rejected by the module without a request, because an ATEM cannot take another
ATEM's source.

## Salvos

A salvo sets crosspoints across every switcher in it. If part of it is refused —
a locked destination, or a source the switcher will not accept on that bus — the
rest still happens and the refusals are logged by name. Salvos are defined in the
crosspoint server, not here.

## Locks

Locks are held **per IP address**, which is how a Videohub does it. A lock taken
from the browser on the same machine as Companion is the same owner as one taken
here. **Force** takes someone else's lock.

Lock presets are generated for the **Outputs** (aux) section only — that is the
case worth a button. The lock action works on any destination.

## Variables worth knowing

- `<switcher>_<destination>_source` — a live label of what that bus is carrying,
  e.g. `$(blackmatrix:stage_aux_0_source)`
- `selected_destination_label`, `selected_destination_source`
- `<switcher>_videohub_port`, `<switcher>_videohub_panels` — the Videohub port
  for that switcher and how many clients are on it
- `locked_count`, `device_count`, `online_count`, `salvo_count`
