// Every action and feedback addresses a destination or a source as
// `<deviceId>:<id>` — "stage:aux.0", "studio:1".
//
// Why one combined reference instead of a switcher dropdown plus a destination
// dropdown: Companion's dropdown choices are fixed when the definition is
// registered, so a destination list cannot narrow itself to whatever switcher
// another field is set to. A flat, device-prefixed list is honest about that,
// keeps a button's meaning stable when the fleet grows, and reads correctly in
// the action list ("Studio — Aux 3").
//
// A crosspoint is only meaningful within one switcher: an ATEM cannot take
// another ATEM's source. So a route whose source and destination come from
// different switchers is rejected here rather than sent.

export function ref(deviceId, id) {
  return `${deviceId}:${id}`;
}

/** Split a reference. Destination ids contain dots but never a colon. */
export function parseRef(value) {
  const raw = String(value ?? "").trim();
  const at = raw.indexOf(":");
  if (at <= 0) return null;
  return { deviceId: raw.slice(0, at), id: raw.slice(at + 1) };
}

/** Companion variable ids allow only [a-zA-Z0-9_]; ours carry dots and dashes. */
export function safeId(id) {
  return String(id).replace(/[^a-zA-Z0-9_]/g, "_");
}

export function deviceOf(self, deviceId) {
  return self.devices.find((device) => device.id === deviceId);
}

export function destinationOf(self, deviceId, destinationId) {
  return deviceOf(self, deviceId)?.matrix?.destinations?.find(
    (d) => d.id === destinationId,
  );
}

export function sourceOf(self, deviceId, sourceId) {
  return deviceOf(self, deviceId)?.matrix?.sources?.find(
    (s) => String(s.id) === String(sourceId),
  );
}

export function deviceChoices(self) {
  return self.devices.map((device) => ({
    id: device.id,
    label: `${device.name ?? device.id}${device.model ? ` (${device.model})` : ""}`,
  }));
}

export function destinationChoices(self) {
  const choices = [];
  for (const device of self.devices) {
    for (const destination of device.matrix?.destinations ?? []) {
      choices.push({
        id: ref(device.id, destination.id),
        label: `${device.name ?? device.id} — ${destination.label}`,
      });
    }
  }
  return choices;
}

export function sourceChoices(self) {
  const choices = [];
  for (const device of self.devices) {
    for (const source of device.matrix?.sources ?? []) {
      choices.push({
        id: ref(device.id, source.id),
        label: `${device.name ?? device.id} — ${source.label}`,
      });
    }
  }
  return choices;
}

export function salvoChoices(self) {
  return self.salvos.map((salvo) => ({
    id: salvo.id,
    label: `${salvo.name} (${salvo.crosspoints?.length ?? 0} crosspoints)`,
  }));
}

/** What a destination is taking right now, as an ATEM source id, or null. */
export function routeOf(self, deviceId, destinationId) {
  const routes = deviceOf(self, deviceId)?.matrix?.routes;
  if (!routes) return null;
  const source = routes[destinationId];
  return source === undefined || source < 0 ? null : source;
}

export function lockOwner(self, deviceId, destinationId) {
  return deviceOf(self, deviceId)?.locks?.[destinationId] ?? null;
}
