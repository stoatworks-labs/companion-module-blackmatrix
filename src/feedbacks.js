import {
  destinationChoices,
  deviceChoices,
  deviceOf,
  lockOwner,
  parseRef,
  routeOf,
  sourceChoices,
} from "./refs.js";

// The one that matters is `crosspoint`: a router button has to show whether the
// route it makes is the route that is live, or the operator is reading the
// desk instead of the panel. Everything else here is context around it.

export default function UpdateFeedbacks(self) {
  const destinations = destinationChoices(self);
  const sources = sourceChoices(self);
  const devices = deviceChoices(self);

  const destinationOption = {
    id: "destination",
    type: "dropdown",
    label: "Destination",
    choices: destinations,
    default: destinations[0]?.id ?? "",
    allowCustom: true,
  };

  const sourceOption = {
    id: "source",
    type: "dropdown",
    label: "Source",
    choices: sources,
    default: sources[0]?.id ?? "",
    allowCustom: true,
  };

  const deviceOption = {
    id: "device",
    type: "dropdown",
    label: "Switcher",
    choices: devices,
    default: devices[0]?.id ?? "",
    allowCustom: true,
  };

  self.setFeedbackDefinitions({
    crosspoint: {
      type: "boolean",
      name: "Destination is taking this source",
      description:
        "Lit when the crosspoint this button makes is the one that is live.",
      defaultStyle: { bgcolor: 0xcc7a00, color: 0x000000 },
      options: [destinationOption, sourceOption],
      callback: (feedback) => {
        const destination = parseRef(feedback.options.destination);
        const source = parseRef(feedback.options.source);
        if (!destination || !source || destination.deviceId !== source.deviceId)
          return false;
        const live = routeOf(self, destination.deviceId, destination.id);
        return live !== null && String(live) === String(source.id);
      },
    },

    sourceOnSelected: {
      type: "boolean",
      name: "X-Y panel: selected destination is taking this source",
      description:
        "For source buttons on an X-Y panel — lights whichever source the currently selected destination is on.",
      defaultStyle: { bgcolor: 0xcc7a00, color: 0x000000 },
      options: [sourceOption],
      callback: (feedback) => {
        const selected = parseRef(self.selected);
        const source = parseRef(feedback.options.source);
        if (!selected || !source || selected.deviceId !== source.deviceId)
          return false;
        const live = routeOf(self, selected.deviceId, selected.id);
        return live !== null && String(live) === String(source.id);
      },
    },

    destinationSelected: {
      type: "boolean",
      name: "X-Y panel: this destination is selected",
      defaultStyle: { bgcolor: 0x0066cc, color: 0xffffff },
      options: [destinationOption],
      callback: (feedback) => {
        const selected = self.selected;
        return (
          Boolean(selected) &&
          selected === String(feedback.options.destination ?? "").trim()
        );
      },
    },

    locked: {
      type: "boolean",
      name: "Destination is locked",
      description:
        "Locks are held per IP address, so a lock taken in the browser on this machine reads as the same owner as one taken here.",
      defaultStyle: { bgcolor: 0xcc0000, color: 0xffffff },
      options: [destinationOption],
      callback: (feedback) => {
        const destination = parseRef(feedback.options.destination);
        if (!destination) return false;
        return Boolean(lockOwner(self, destination.deviceId, destination.id));
      },
    },

    deviceOnline: {
      type: "boolean",
      name: "Switcher is connected",
      defaultStyle: { bgcolor: 0x003300, color: 0x00ff00 },
      options: [deviceOption],
      callback: (feedback) =>
        deviceOf(self, String(feedback.options.device))?.connection ===
        "connected",
    },

    panelAttached: {
      type: "boolean",
      name: "A Videohub panel is attached to this switcher",
      description:
        "Someone else — a hardware router panel, Blackmagic's software, another Companion — is connected to this switcher's Videohub port and can route it too.",
      defaultStyle: { bgcolor: 0x0066cc, color: 0xffffff },
      options: [deviceOption],
      callback: (feedback) =>
        (deviceOf(self, String(feedback.options.device))?.videohubClients ??
          0) > 0,
    },

    serviceUp: {
      type: "boolean",
      name: "Connected to BlackMatrix",
      defaultStyle: { bgcolor: 0x003300, color: 0x00ff00 },
      options: [],
      callback: () => self.link,
    },
  });
}
