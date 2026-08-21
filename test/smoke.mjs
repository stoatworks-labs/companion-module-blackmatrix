// Drives the BlackMatrix module's real source against a fake crosspoint
// server: a real HTTP server for the REST commands and a real WebSocket pushing
// snapshots. What is checked, in order of what would actually hurt at a show:
//
//   - a route sends the crosspoint the button says it does
//   - a cross-switcher route is refused HERE, without a request, because an
//     ATEM cannot take another ATEM's source
//   - the X-Y pair routes to the selected destination and nothing else
//   - a lock toggle resolves from reported state and never guesses
//   - a full snapshot that changed nothing structural does NOT re-register
//     definitions
//   - the @companion-module/base 2.x shapes that fail silently
import http from "node:http";
import assert from "node:assert/strict";
import { WebSocketServer } from "ws";
import { readFileSync } from "node:fs";

const watchdog = setTimeout(() => {
  console.error("\nTIMED OUT — no completion within 30s.");
  process.exit(2);
}, 30000);
watchdog.unref?.();

const MOD = new URL("../src/", import.meta.url).pathname;
const UpdateActions = (await import(`${MOD}actions.js`)).default;
const UpdateFeedbacks = (await import(`${MOD}feedbacks.js`)).default;
const UpdateVariables = (await import(`${MOD}variables.js`)).default;
const { variableValues } = await import(`${MOD}variables.js`);
const UpdatePresets = (await import(`${MOD}presets.js`)).default;
const { socket } = await import(`${MOD}api.js`);
const { shapeKey } = await import(`${MOD}main.js`);
const { parseRef, safeId } = await import(`${MOD}refs.js`);

let passed = 0;
const check = (name, fn) => {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`FAIL: ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
};

// --- a fake fleet ---------------------------------------------------------

function device(id, over = {}) {
  return {
    id,
    name: id.toUpperCase(),
    address: "10.0.0.1",
    model: "Simulated switcher",
    connection: "connected",
    videohubPort: 9990,
    videohubClients: 0,
    matrix: {
      sections: [
        { id: "outputs", label: "Outputs", hint: "" },
        { id: "buses", label: "Program / Preview", hint: "" },
      ],
      sources: [
        {
          id: 1,
          label: "Camera 1",
          short: "Cam1",
          kind: "input",
          availability: 255,
          meAvailability: 15,
        },
        {
          id: 2,
          label: "Camera 2",
          short: "Cam2",
          kind: "input",
          availability: 255,
          meAvailability: 15,
        },
        {
          id: 8001,
          label: "Aux 1",
          short: "Aux1",
          kind: "aux",
          availability: 2,
          meAvailability: 0,
        },
      ],
      destinations: [
        {
          id: "aux.0",
          kind: "aux",
          section: "outputs",
          label: "Aux 1",
          short: "AUX 1",
          address: { unit: 0 },
        },
        {
          id: "me.0.program",
          kind: "program",
          section: "buses",
          label: "Program",
          short: "PGM",
          address: { unit: 0 },
        },
      ],
      routes: { "aux.0": 1, "me.0.program": 2 },
    },
    locks: { "aux.0": null, "me.0.program": null },
    ...over,
  };
}

const salvos = [
  {
    id: "salvo-1",
    name: "House wide",
    crosspoints: [{ deviceId: "stage", destination: "aux.0", source: 2 }],
  },
];

// --- the fake server ------------------------------------------------------

const requests = [];
let nextResponse = null;

const body = (req) =>
  new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => resolve(raw));
  });

const server = http.createServer(async (req, res) => {
  const raw = await body(req);
  requests.push({
    method: req.method,
    url: req.url,
    body: raw ? JSON.parse(raw) : null,
  });
  const response = nextResponse ?? { status: 200, payload: { ok: true } };
  nextResponse = null;
  res.writeHead(response.status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(response.payload));
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const wss = new WebSocketServer({ server, path: "/ws" });

// --- a fake Companion instance -------------------------------------------

function makeSelf() {
  return {
    label: "xpt",
    config: { host: "127.0.0.1", port: String(port) },
    devices: [
      device("stage"),
      device("studio", { connection: "disconnected", videohubClients: 2 }),
    ],
    salvos,
    link: true,
    selected: null,
    logs: [],
    variableDefs: null,
    variableValues: null,
    actions: null,
    feedbacks: null,
    presetStructure: null,
    presetDefs: null,
    presetArgCount: 0,
    feedbackChecks: 0,
    log(level, message) {
      this.logs.push(`${level}: ${message}`);
    },
    updateStatus() {},
    setVariableDefinitions(defs) {
      this.variableDefs = defs;
    },
    setVariableValues(values) {
      this.variableValues = values;
    },
    setActionDefinitions(defs) {
      this.actions = defs;
    },
    setFeedbackDefinitions(defs) {
      this.feedbacks = defs;
    },
    setPresetDefinitions(...args) {
      this.presetArgCount = args.length;
      this.presetStructure = args[0];
      this.presetDefs = args[1];
    },
    checkAllFeedbacks() {
      this.feedbackChecks++;
    },
    selectDestination(reference) {
      this.selected = reference ? String(reference).trim() : null;
    },
  };
}

const self = makeSelf();
UpdateVariables(self);
UpdateActions(self);
UpdateFeedbacks(self);
UpdatePresets(self);

const run = async (id, options) => {
  requests.length = 0;
  await self.actions[id].callback({ options, actionId: id });
};

// --- registration shapes ---------------------------------------------------

check("variable definitions are an object, not an array", () => {
  // setVariableDefinitions THROWS on an array in base 2.x, killing init() with
  // no actions, no feedbacks and no cause in the log.
  assert.equal(Array.isArray(self.variableDefs), false);
  assert.ok(self.variableDefs.connection_status);
});

check("presets are registered with the 2.x two-argument call", () => {
  assert.equal(
    self.presetArgCount,
    2,
    "1.x setPresetDefinitions(defs) loads but shows nothing",
  );
  assert.ok(Array.isArray(self.presetStructure));
  assert.equal(Array.isArray(self.presetDefs), false);
});

check("every preset is type 'simple' and carries no 1.x category", () => {
  for (const [id, preset] of Object.entries(self.presetDefs)) {
    assert.equal(preset.type, "simple", `${id} is not type 'simple'`);
    assert.equal(preset.category, undefined, `${id} still has a 1.x category`);
    assert.ok(Array.isArray(preset.steps), `${id} has no steps`);
  }
});

check("every preset referenced by the structure exists", () => {
  for (const group of self.presetStructure) {
    for (const definition of group.definitions) {
      for (const id of definition.presets) {
        assert.ok(
          self.presetDefs[id],
          `${group.id} references missing preset ${id}`,
        );
      }
    }
  }
});

check(
  "preset button text uses real newlines, not an escaped backslash-n",
  () => {
    for (const [id, preset] of Object.entries(self.presetDefs)) {
      assert.ok(
        !preset.style.text.includes("\\n"),
        `${id} draws a literal \\n on the key`,
      );
    }
  },
);

check("preset variable references use the connection label", () => {
  const text = self.presetDefs.link.style.text;
  assert.ok(text.includes("$(xpt:connection_status)"), text);
});

check(
  "an X-Y panel is generated per switcher, plus locks for outputs only",
  () => {
    const group = self.presetStructure.find(
      (entry) => entry.id === "device-stage",
    );
    const names = group.definitions.map((definition) => definition.id);
    assert.deepEqual(names, [
      "device-stage-destinations",
      "device-stage-sources",
      "device-stage-locks",
    ]);
    // One lock button: aux.0 is the only Outputs destination in the fake fleet.
    assert.equal(group.definitions[2].presets.length, 1);
  },
);

check("there is a preset per salvo", () => {
  assert.ok(self.presetDefs[`salvo_${safeId("salvo-1")}`]);
});

// --- routing ---------------------------------------------------------------

await (async () => {
  await run("route", { destination: "stage:aux.0", source: "stage:2" });
  check("a route posts the crosspoint the button names", () => {
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "/api/devices/stage/route");
    assert.deepEqual(requests[0].body, { destination: "aux.0", source: 2 });
  });

  await run("route", { destination: "stage:aux.0", source: "studio:2" });
  check("a cross-switcher route is refused without a request", () => {
    assert.equal(requests.length, 0, "sent a request that could only fail");
    assert.match(self.logs.at(-1), /one switcher/);
  });

  nextResponse = {
    status: 409,
    payload: { ok: false, reason: "Aux 1 is not available on ME 1 Program" },
  };
  await run("route", { destination: "stage:me.0.program", source: "stage:1" });
  check("a refusal is logged with the server's own reason", () => {
    assert.match(self.logs.at(-1), /not available on ME 1 Program/);
  });
})();

// --- X-Y panel -------------------------------------------------------------

await (async () => {
  self.selected = null;
  await run("takeSource", { source: "stage:1" });
  check("a take with nothing selected sends nothing", () => {
    assert.equal(requests.length, 0);
    assert.match(self.logs.at(-1), /no destination selected/);
  });

  await run("selectDestination", { destination: "stage:me.0.program" });
  check("selecting a destination sends nothing to the switcher", () => {
    assert.equal(requests.length, 0);
    assert.equal(self.selected, "stage:me.0.program");
  });

  await run("takeSource", { source: "stage:1" });
  check("a take routes the selected destination", () => {
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0].body, {
      destination: "me.0.program",
      source: 1,
    });
  });

  await run("takeSource", { source: "studio:1" });
  check("a take from another switcher's source is refused", () => {
    assert.equal(requests.length, 0);
    assert.match(self.logs.at(-1), /select a destination on studio/);
  });
})();

// --- locks -----------------------------------------------------------------

await (async () => {
  await run("lock", { destination: "stage:aux.0", mode: "toggle" });
  check("toggling an unlocked destination locks it", () => {
    assert.deepEqual(requests[0].body, {
      destination: "aux.0",
      action: "lock",
    });
  });

  self.devices[0].locks["aux.0"] = "10.0.0.5";
  await run("lock", { destination: "stage:aux.0", mode: "toggle" });
  check("toggling a locked destination unlocks it", () => {
    assert.deepEqual(requests[0].body, {
      destination: "aux.0",
      action: "unlock",
    });
  });

  await run("lock", { destination: "stage:aux.0", mode: "force" });
  check("force is passed through as force", () => {
    assert.deepEqual(requests[0].body, {
      destination: "aux.0",
      action: "force",
    });
  });
  self.devices[0].locks["aux.0"] = null;

  await run("lock", { destination: "stage:nonexistent", mode: "toggle" });
  check(
    "toggling a destination the module has never heard of sends nothing",
    () => {
      // Otherwise "no owner reported" reads as "unlocked", and a typo silently
      // locks something.
      assert.equal(requests.length, 0);
      assert.match(self.logs.at(-1), /no such destination/);
    },
  );
})();

// --- salvos ----------------------------------------------------------------

await (async () => {
  await run("salvoTake", { salvo: "salvo-1" });
  check("a salvo take posts to the salvo endpoint", () => {
    assert.equal(requests[0].url, "/api/salvos/salvo-1/take");
  });

  nextResponse = {
    status: 409,
    payload: {
      ok: false,
      failures: ["studio/me.0.program: Aux 1 is not available"],
    },
  };
  await run("salvoTake", { salvo: "salvo-1" });
  check("a partly-applied salvo logs which crosspoints were refused", () => {
    assert.match(self.logs.at(-1), /studio\/me\.0\.program/);
  });
})();

// --- feedbacks -------------------------------------------------------------

const fb = (id, options) =>
  self.feedbacks[id].callback({ options, feedbackId: id });

check("crosspoint lights only for the live route", () => {
  assert.equal(
    fb("crosspoint", { destination: "stage:aux.0", source: "stage:1" }),
    true,
  );
  assert.equal(
    fb("crosspoint", { destination: "stage:aux.0", source: "stage:2" }),
    false,
  );
});

check("crosspoint never lights across switchers", () => {
  assert.equal(
    fb("crosspoint", { destination: "stage:aux.0", source: "studio:1" }),
    false,
  );
});

check("the X-Y source feedback follows the selection", () => {
  self.selected = "stage:aux.0";
  assert.equal(fb("sourceOnSelected", { source: "stage:1" }), true);
  self.selected = "stage:me.0.program";
  assert.equal(fb("sourceOnSelected", { source: "stage:1" }), false);
  assert.equal(fb("sourceOnSelected", { source: "stage:2" }), true);
});

check("destinationSelected marks the armed destination", () => {
  assert.equal(
    fb("destinationSelected", { destination: "stage:me.0.program" }),
    true,
  );
  assert.equal(
    fb("destinationSelected", { destination: "stage:aux.0" }),
    false,
  );
});

check("locked reflects an owner of any address", () => {
  assert.equal(fb("locked", { destination: "stage:aux.0" }), false);
  self.devices[0].locks["aux.0"] = "10.0.0.5";
  assert.equal(fb("locked", { destination: "stage:aux.0" }), true);
  self.devices[0].locks["aux.0"] = null;
});

check("switcher state feedbacks read the fleet", () => {
  assert.equal(fb("deviceOnline", { device: "stage" }), true);
  assert.equal(fb("deviceOnline", { device: "studio" }), false);
  assert.equal(fb("panelAttached", { device: "studio" }), true);
  assert.equal(fb("panelAttached", { device: "stage" }), false);
  assert.equal(fb("serviceUp", {}), true);
});

// --- variables -------------------------------------------------------------

check("each destination gets a live source label", () => {
  const values = variableValues(self);
  assert.equal(values.stage_aux_0_source, "Camera 1");
  assert.equal(values.stage_me_0_program_source, "Camera 2");
});

check(
  "a destination the switcher has not reported reads 'unknown', not blank",
  () => {
    const copy = makeSelf();
    copy.devices[0].matrix.routes["aux.0"] = -1;
    const values = variableValues(copy);
    assert.equal(values.stage_aux_0_source, "unknown");
  },
);

check("fleet counters count", () => {
  const values = variableValues(self);
  assert.equal(values.device_count, 2);
  assert.equal(values.online_count, 1);
  assert.equal(values.salvo_count, 1);
});

// --- snapshot handling -----------------------------------------------------

check("a moved crosspoint is not a shape change", () => {
  const before = shapeKey(self.devices, self.salvos);
  const moved = JSON.parse(JSON.stringify(self.devices));
  moved[0].matrix.routes["aux.0"] = 2;
  moved[0].locks["aux.0"] = "10.0.0.5";
  assert.equal(
    shapeKey(moved, self.salvos),
    before,
    "a route move would re-register every definition",
  );
});

check("a renamed source IS a shape change", () => {
  const before = shapeKey(self.devices, self.salvos);
  const renamed = JSON.parse(JSON.stringify(self.devices));
  renamed[0].matrix.sources[0].label = "Wide";
  assert.notEqual(
    shapeKey(renamed, self.salvos),
    before,
    "dropdown labels would go stale",
  );
});

check("a new salvo IS a shape change", () => {
  const before = shapeKey(self.devices, self.salvos);
  assert.notEqual(
    shapeKey(self.devices, [
      ...self.salvos,
      { id: "s2", name: "Second", crosspoints: [] },
    ]),
    before,
  );
});

// --- references ------------------------------------------------------------

check(
  "a reference splits on the first colon, so dotted destination ids survive",
  () => {
    assert.deepEqual(parseRef("stage:me.0.usk.1.fill"), {
      deviceId: "stage",
      id: "me.0.usk.1.fill",
    });
    assert.equal(parseRef("nonsense"), null);
    assert.equal(parseRef(""), null);
  },
);

// --- the websocket, for real ----------------------------------------------

await (async () => {
  const received = [];
  const wsSelf = makeSelf();
  wsSelf.applySnapshot = (devices, salvoList) =>
    received.push({ devices, salvos: salvoList });
  wsSelf.setLink = () => {};

  wss.on("connection", (ws) => {
    ws.send(
      JSON.stringify({ type: "snapshot", devices: wsSelf.devices, salvos }),
    );
    // Anything else must be ignored rather than mistaken for state.
    ws.send(JSON.stringify({ type: "hello", devices: [] }));
    ws.send("not json at all");
  });

  socket.connect(wsSelf);
  await new Promise((resolve) => setTimeout(resolve, 600));
  socket.close();

  check("a snapshot from the websocket reaches the module", () => {
    assert.equal(received.length, 1);
    assert.equal(received[0].devices.length, 2);
    assert.equal(received[0].salvos.length, 1);
  });
})();

// --- source scan: traps a unit test cannot see ----------------------------

check(
  "no bare checkFeedbacks() — it forwards [undefined] and checks nothing",
  () => {
    for (const file of [
      "main.js",
      "actions.js",
      "feedbacks.js",
      "api.js",
      "presets.js",
      "variables.js",
    ]) {
      const source = readFileSync(`${MOD}${file}`, "utf8");
      assert.ok(
        !/[^A-Za-z]checkFeedbacks\(\s*\)/.test(source),
        `${file} calls checkFeedbacks() with no arguments`,
      );
    }
  },
);

check(
  "no runEntrypoint — it does not exist in base 2.x and breaks packaging",
  () => {
    const source = readFileSync(`${MOD}main.js`, "utf8");
    assert.ok(
      !source.includes("runEntrypoint"),
      "main.js still uses the 1.x entrypoint",
    );
    assert.ok(
      /export default class/.test(source),
      "main.js must export its InstanceBase subclass by default",
    );
    assert.ok(
      /export \{ UpgradeScripts \}/.test(source),
      "main.js must export UpgradeScripts",
    );
  },
);

wss.close();
server.close();
clearTimeout(watchdog);

// --- the parseVariablesInString trap ----------------------------------------
// `parseVariablesInString` and `parseVariablesInField` were removed from
// @companion-module/base 2.x. Neither is on the callback context, on
// InstanceBase, or anywhere in the package. Companion expands a `useVariables` option itself before invoking the
// callback, so the option arrives already resolved: the call is redundant as
// well as fatal, throwing "... is not a function" the moment
// that one action or feedback fires. Nothing else catches it — the module
// loads, init() succeeds, every definition registers, and every path that does
// not make the call keeps working, so the suite passes with the bug live. This
// fixture no longer stubs either function, so a reintroduced call now throws
// here too; the grep is the backstop for a path the fixture never exercises. It
// matches the call form only, so prose naming the functions stays legal.
const { readdirSync: pvReadDir, readFileSync: pvReadFile } =
  await import("node:fs");
const pvOffenders = () => {
  const dir = new URL("../src/", import.meta.url).pathname;
  const bad = [];
  for (const f of pvReadDir(dir)) {
    if (!/\.(js|ts)$/.test(f)) continue;
    if (/parseVariablesIn(String|Field)\s*\(/.test(pvReadFile(dir + f, "utf8")))
      bad.push(f);
  }
  return bad;
};

check("no parseVariablesInString/Field call survives in src/", () => {
  assert.deepEqual(
    pvOffenders(),
    [],
    "read the already-resolved event.options value instead",
  );
});

console.log(`\n${passed} checks passed`);
