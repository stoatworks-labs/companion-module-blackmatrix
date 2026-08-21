import { safeId } from "./refs.js";

// Preset text uses `self.label` — the CONNECTION's label, not the module id.
// Companion resolves $(label:variable) against whatever the operator named the
// connection, so a hardcoded id draws raw $(...) text on any renamed connection
// or second instance.
//
// What is NOT generated here, deliberately: a preset per crosspoint. A fleet of
// three switchers is roughly 150 destinations and 90 sources, so the pairs run
// to thousands of buttons. The X-Y pair — one button per destination, one per
// source — is the same panel in a couple of hundred buttons, and it is how a
// real router panel works anyway.
//
// Lock buttons are generated for the Outputs section only. Locking an aux
// before someone re-patches it mid-show is the case worth a button; locking a
// SuperSource box is not, and generating both doubles the list.

const WHITE = 0xffffff;
const BLACK = 0x000000;
const GREY = 0x333333;
const RED = 0xcc0000;
const AMBER = 0xcc7a00;
const BLUE = 0x0066cc;
const DARKGREEN = 0x003300;
const BRIGHTGREEN = 0x00ff00;

function preset({
  name,
  text,
  size = "14",
  color = WHITE,
  bgcolor = GREY,
  actions = [],
  feedbacks = [],
}) {
  return {
    type: "simple",
    name,
    style: { text, size, color, bgcolor, show_topbar: false },
    steps: [{ down: actions, up: [] }],
    feedbacks,
  };
}

export default function UpdatePresets(self) {
  const presets = {};
  const structure = [];

  // --- Fleet ---------------------------------------------------------------
  const fleetRefs = [];
  const addFleet = (id, definition) => {
    presets[id] = definition;
    fleetRefs.push(id);
  };

  addFleet(
    "link",
    preset({
      name: "Crosspoint server: connection status",
      text: `XPT\n$(${self.label}:connection_status)`,
      size: "7",
      bgcolor: BLACK,
      feedbacks: [
        {
          feedbackId: "serviceUp",
          options: {},
          style: { bgcolor: DARKGREEN, color: BRIGHTGREEN },
        },
      ],
    }),
  );

  addFleet(
    "selected",
    preset({
      name: "X-Y: what is selected (no action)",
      text: `SEL\n$(${self.label}:selected_destination_label)\n$(${self.label}:selected_destination_source)`,
      size: "7",
      bgcolor: BLACK,
    }),
  );

  addFleet(
    "clear_selection",
    preset({
      name: "X-Y: clear the selection",
      text: "CLEAR\nSEL",
      bgcolor: BLACK,
      actions: [{ actionId: "clearSelection", options: {} }],
    }),
  );

  addFleet(
    "locked_count",
    preset({
      name: "Destinations locked, fleet-wide (no action)",
      text: `LOCKED\n$(${self.label}:locked_count)`,
      size: "7",
      bgcolor: BLACK,
    }),
  );

  for (const salvo of self.salvos) {
    const id = `salvo_${safeId(salvo.id)}`;
    addFleet(
      id,
      preset({
        name: `Salvo: ${salvo.name}`,
        text: `SALVO\n${salvo.name}`,
        size: "7",
        bgcolor: BLUE,
        actions: [{ actionId: "salvoTake", options: { salvo: salvo.id } }],
      }),
    );
  }

  structure.push({
    id: "fleet",
    name: "Fleet",
    description:
      "Salvos, the X-Y selection, and whether the crosspoint server is answering.",
    definitions: [
      { id: "fleet-main", type: "simple", name: "Fleet", presets: fleetRefs },
    ],
    keywords: ["salvo", "fleet", "status"],
  });

  // --- One group per switcher ---------------------------------------------
  for (const device of self.devices) {
    const key = safeId(device.id);
    const label = device.name ?? device.id;
    const destinations = device.matrix?.destinations ?? [];
    const sources = device.matrix?.sources ?? [];

    const destinationRefs = [];
    const sourceRefs = [];
    const lockRefs = [];

    for (const destination of destinations) {
      const id = `${key}_dst_${safeId(destination.id)}`;
      const reference = `${device.id}:${destination.id}`;
      presets[id] = preset({
        name: `${label}: select ${destination.label}`,
        text: `${destination.short}\n$(${self.label}:${key}_${safeId(destination.id)}_source)`,
        size: "7",
        bgcolor: BLACK,
        actions: [
          {
            actionId: "selectDestination",
            options: { destination: reference },
          },
        ],
        feedbacks: [
          {
            feedbackId: "destinationSelected",
            options: { destination: reference },
            style: { bgcolor: BLUE, color: WHITE },
          },
          {
            feedbackId: "locked",
            options: { destination: reference },
            style: { bgcolor: RED, color: WHITE },
          },
        ],
      });
      destinationRefs.push(id);

      if (destination.section === "outputs") {
        const lockId = `${key}_lock_${safeId(destination.id)}`;
        presets[lockId] = preset({
          name: `${label}: lock ${destination.label}`,
          text: `LOCK\n${destination.short}`,
          size: "7",
          bgcolor: BLACK,
          actions: [
            {
              actionId: "lock",
              options: { destination: reference, mode: "toggle" },
            },
          ],
          feedbacks: [
            {
              feedbackId: "locked",
              options: { destination: reference },
              style: { bgcolor: RED, color: WHITE },
            },
          ],
        });
        lockRefs.push(lockId);
      }
    }

    for (const source of sources) {
      const id = `${key}_src_${safeId(String(source.id))}`;
      const reference = `${device.id}:${source.id}`;
      presets[id] = preset({
        name: `${label}: take ${source.label} to the selected destination`,
        text: source.short || source.label,
        bgcolor: BLACK,
        actions: [{ actionId: "takeSource", options: { source: reference } }],
        feedbacks: [
          {
            feedbackId: "sourceOnSelected",
            options: { source: reference },
            style: { bgcolor: AMBER, color: BLACK },
          },
        ],
      });
      sourceRefs.push(id);
    }

    const definitions = [
      {
        id: `device-${key}-destinations`,
        type: "simple",
        name: "Destinations (press to select)",
        presets: destinationRefs,
      },
      {
        id: `device-${key}-sources`,
        type: "simple",
        name: "Sources (press to take to the selection)",
        presets: sourceRefs,
      },
    ];
    if (lockRefs.length > 0) {
      definitions.push({
        id: `device-${key}-locks`,
        type: "simple",
        name: "Locks (outputs)",
        presets: lockRefs,
      });
    }

    structure.push({
      id: `device-${key}`,
      name: label,
      description: `${device.model ?? "ATEM"} — ${destinations.length} destinations, ${sources.length} sources`,
      definitions,
      keywords: ["atem", "router", label],
    });
  }

  self.setPresetDefinitions(structure, presets);
}
