import { post } from "./api.js";
import {
  destinationChoices,
  destinationOf,
  lockOwner,
  parseRef,
  ref,
  salvoChoices,
  sourceChoices,
  sourceOf,
} from "./refs.js";

// Two ways to route, because a Stream Deck is not a matrix:
//
//   route            one button = one crosspoint. Explicit, no state.
//   selectDestination + takeSource
//                    the X-Y panel every router has: press a destination, then
//                    press a source. One button per destination and one per
//                    source instead of one per pair — the difference between
//                    ~150 buttons for a fleet and tens of thousands.
//
// The selection lives in this module, not on the server, so two Companions do
// not fight over one another's pending destination.

export default function UpdateActions(self) {
  const destinations = destinationChoices(self);
  const sources = sourceChoices(self);
  const salvos = salvoChoices(self);

  const destinationOption = {
    id: "destination",
    type: "dropdown",
    label: "Destination",
    choices: destinations,
    default: destinations[0]?.id ?? "",
    allowCustom: true,
    tooltip: "deviceId:destinationId — e.g. stage:aux.0",
  };

  const sourceOption = {
    id: "source",
    type: "dropdown",
    label: "Source",
    choices: sources,
    default: sources[0]?.id ?? "",
    allowCustom: true,
    tooltip: "deviceId:sourceId — e.g. stage:1",
  };

  const run = async (fn) => {
    try {
      await fn();
    } catch (e) {
      self.log("error", e.message);
    }
  };

  const resolve = async (event, field) =>
    (
      await self.parseVariablesInString(String(event.options[field] ?? ""))
    ).trim();

  self.setActionDefinitions({
    route: {
      name: "Route a source to a destination",
      options: [destinationOption, sourceOption],
      callback: async (event) =>
        run(async () => {
          const destination = parseRef(await resolve(event, "destination"));
          const source = parseRef(await resolve(event, "source"));
          if (!destination || !source) {
            throw new Error(
              "route needs both a destination and a source, as deviceId:id",
            );
          }
          if (destination.deviceId !== source.deviceId) {
            // Not a limitation of this module: an ATEM cannot take another
            // ATEM's source, so this request could only ever fail.
            throw new Error(
              `cannot route ${source.deviceId}'s source to ${destination.deviceId}'s ${destination.id} — a crosspoint lives on one switcher`,
            );
          }
          await post(self, `/api/devices/${destination.deviceId}/route`, {
            destination: destination.id,
            source: Number(source.id),
          });
        }),
    },

    selectDestination: {
      name: "X-Y panel: select a destination",
      description:
        "Arms a destination for the next 'take source'. Local to this Companion — nothing is sent to the switcher until a source is pressed.",
      options: [destinationOption],
      callback: async (event) =>
        run(async () => {
          const value = await resolve(event, "destination");
          const parsed = parseRef(value);
          if (!parsed) throw new Error(`not a destination reference: ${value}`);
          self.selectDestination(value);
        }),
    },

    takeSource: {
      name: "X-Y panel: take a source to the selected destination",
      options: [sourceOption],
      callback: async (event) =>
        run(async () => {
          const selected = parseRef(self.selected);
          if (!selected)
            throw new Error(
              "no destination selected — press a destination button first",
            );
          const source = parseRef(await resolve(event, "source"));
          if (!source)
            throw new Error("take needs a source, as deviceId:sourceId");
          if (selected.deviceId !== source.deviceId) {
            throw new Error(
              `${source.deviceId}'s sources cannot feed ${selected.deviceId} — select a destination on ${source.deviceId} first`,
            );
          }
          await post(self, `/api/devices/${selected.deviceId}/route`, {
            destination: selected.id,
            source: Number(source.id),
          });
        }),
    },

    clearSelection: {
      name: "X-Y panel: clear the selected destination",
      options: [],
      callback: async () => self.selectDestination(null),
    },

    salvoTake: {
      name: "Take a salvo",
      description:
        "Sets every crosspoint in the salvo, across every switcher in it.",
      options: [
        {
          id: "salvo",
          type: "dropdown",
          label: "Salvo",
          choices: salvos,
          default: salvos[0]?.id ?? "",
          allowCustom: true,
        },
      ],
      callback: async (event) =>
        run(async () => {
          const id = await resolve(event, "salvo");
          if (!id) throw new Error("no salvo chosen");
          // A partly-applied salvo answers 409 with the crosspoints that were
          // refused. post() turns that into a thrown, logged list — the rest of
          // the salvo did happen, so this is a warning, not a failed take.
          await post(self, `/api/salvos/${encodeURIComponent(id)}/take`);
        }),
    },

    lock: {
      name: "Lock or unlock a destination",
      options: [
        destinationOption,
        {
          id: "mode",
          type: "dropdown",
          label: "Action",
          choices: [
            { id: "lock", label: "Lock" },
            { id: "unlock", label: "Unlock (mine only)" },
            { id: "force", label: "Force unlock (takes someone else's)" },
            { id: "toggle", label: "Toggle" },
          ],
          default: "toggle",
        },
      ],
      callback: async (event) =>
        run(async () => {
          const destination = parseRef(await resolve(event, "destination"));
          if (!destination)
            throw new Error(
              "lock needs a destination, as deviceId:destinationId",
            );

          let action = event.options.mode;
          if (action === "toggle") {
            // Never guess at a toggle. A destination this module has not been
            // told about reports no owner, which would silently become "lock
            // it" — so check the destination exists rather than trusting the
            // absence of an owner to mean unlocked.
            if (!destinationOf(self, destination.deviceId, destination.id)) {
              throw new Error(
                `cannot toggle ${destination.deviceId}:${destination.id} — no such destination in the fleet`,
              );
            }
            action = lockOwner(self, destination.deviceId, destination.id)
              ? "unlock"
              : "lock";
          }

          await post(self, `/api/devices/${destination.deviceId}/lock`, {
            destination: destination.id,
            action,
          });
        }),
    },
  });

  // Re-export for the tests, which check that a reference survives the trip.
  self.refFor = ref;
  self.destinationFor = (deviceId, id) => destinationOf(self, deviceId, id);
  self.sourceFor = (deviceId, id) => sourceOf(self, deviceId, id);
}
