import { deviceOf, parseRef, routeOf, safeId, sourceOf } from "./refs.js";

// Rebuilt only when the fleet's shape changes (main.js). A crosspoint move is a
// value update, not a re-registration — the server pushes a full snapshot on
// every change, and re-registering a few hundred definitions at that rate is
// how a module ends up burning a core doing nothing.
//
// The per-destination `_source` variables are the point of this module for
// anyone building a monitor wall: `$(blackmatrix:stage_aux_0_source)` on a
// button is a live label of what that output is carrying.

export default function UpdateVariableDefinitions(self) {
  const defs = {
    connection_status: { name: "Connection to BlackMatrix" },
    device_count: { name: "Switchers in the fleet" },
    online_count: { name: "Switchers connected" },
    salvo_count: { name: "Salvos defined" },
    locked_count: { name: "Destinations locked, fleet-wide" },
    selected_destination: { name: "X-Y: selected destination reference" },
    selected_destination_label: { name: "X-Y: selected destination name" },
    selected_destination_source: {
      name: "X-Y: what the selected destination is taking",
    },
  };

  for (const device of self.devices) {
    const prefix = `${safeId(device.id)}_`;
    const name = device.name ?? device.id;
    defs[`${prefix}name`] = { name: `${name}: name` };
    defs[`${prefix}model`] = { name: `${name}: model` };
    defs[`${prefix}connection`] = { name: `${name}: connection` };
    defs[`${prefix}videohub_port`] = {
      name: `${name}: Videohub port ("off" when it has none)`,
    };
    defs[`${prefix}videohub_panels`] = {
      name: `${name}: Videohub clients attached`,
    };
    defs[`${prefix}destination_count`] = { name: `${name}: destinations` };
    defs[`${prefix}source_count`] = { name: `${name}: sources` };
    defs[`${prefix}locked_count`] = { name: `${name}: destinations locked` };

    for (const destination of device.matrix?.destinations ?? []) {
      defs[`${prefix}${safeId(destination.id)}_source`] = {
        name: `${name}: ${destination.label} — source`,
      };
    }
  }

  self.setVariableDefinitions(defs);
}

export function variableValues(self) {
  const values = {
    connection_status: self.link ? "connected" : "disconnected",
    device_count: self.devices.length,
    online_count: self.devices.filter(
      (device) => device.connection === "connected",
    ).length,
    salvo_count: self.salvos.length,
  };

  let lockedFleet = 0;

  for (const device of self.devices) {
    const prefix = `${safeId(device.id)}_`;
    const destinations = device.matrix?.destinations ?? [];
    const locks = device.locks ?? {};
    const locked = Object.values(locks).filter(Boolean).length;
    lockedFleet += locked;

    values[`${prefix}name`] = device.name ?? device.id;
    values[`${prefix}model`] = device.model ?? "";
    values[`${prefix}connection`] = device.connection ?? "unknown";
    values[`${prefix}videohub_port`] = device.videohubPort ?? "off";
    values[`${prefix}videohub_panels`] = device.videohubClients ?? 0;
    values[`${prefix}destination_count`] = destinations.length;
    values[`${prefix}source_count`] = device.matrix?.sources?.length ?? 0;
    values[`${prefix}locked_count`] = locked;

    for (const destination of destinations) {
      const sourceId = routeOf(self, device.id, destination.id);
      const source =
        sourceId === null ? null : sourceOf(self, device.id, sourceId);
      // "unknown" rather than empty: a blank button label reads as a broken
      // variable, and -1 is exactly the case where the switcher has not said.
      values[`${prefix}${safeId(destination.id)}_source`] =
        source?.label ?? "unknown";
    }
  }

  values.locked_count = lockedFleet;

  const selected = parseRef(self.selected);
  if (selected) {
    const device = deviceOf(self, selected.deviceId);
    const destination = device?.matrix?.destinations?.find(
      (d) => d.id === selected.id,
    );
    const sourceId = routeOf(self, selected.deviceId, selected.id);
    const source =
      sourceId === null ? null : sourceOf(self, selected.deviceId, sourceId);
    values.selected_destination = self.selected;
    values.selected_destination_label = destination
      ? `${device?.name ?? selected.deviceId} ${destination.label}`
      : self.selected;
    values.selected_destination_source = source?.label ?? "unknown";
  } else {
    values.selected_destination = "";
    values.selected_destination_label = "none";
    values.selected_destination_source = "";
  }

  return values;
}
