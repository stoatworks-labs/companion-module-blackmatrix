import WebSocket from "ws";
import { InstanceStatus } from "@companion-module/base";

// BlackMatrix's two surfaces, and why this module uses both:
//
//   WebSocket  /ws  — state only. It pushes ONE message type, `snapshot`, with
//                     the whole fleet in it, coalesced to about 50ms. There is
//                     no per-device delta and no acknowledgement of anything a
//                     client sent, so it cannot be used to issue commands.
//   REST            — commands. Every one answers: 200 {ok:true}, or 409
//                     {ok:false, reason:"..."} when the route was refused —
//                     a locked destination, or a source the switcher will not
//                     accept on that bus. That reason is worth logging: "Aux 1
//                     is not available on ME 1 Program" is the difference
//                     between a broken button and a switcher doing its job.
//
// Because every push is a FULL snapshot, the expensive thing is re-registering
// definitions. main.js only rebuilds when the fleet's *shape* changes; a plain
// crosspoint move updates variables and feedbacks and nothing else.

const RECONNECT_MS = 3000;

function base(self) {
  return `http://${self.config.host}:${self.config.port}`;
}

/** POST a command. Throws with the server's own reason when it refuses. */
export async function post(self, path, body = {}) {
  const res = await fetch(`${base(self)}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = await res.json().catch(() => ({}));
  if (!res.ok || parsed.ok === false) {
    // Salvos report per-crosspoint failures rather than one reason: some of the
    // salvo may well have gone through, so this is a warning about the rest.
    const why =
      parsed.reason ||
      (Array.isArray(parsed.failures) ? parsed.failures.join("; ") : "") ||
      `HTTP ${res.status}`;
    throw new Error(`${path}: ${why}`);
  }
  return parsed;
}

export async function getJson(self, path) {
  const res = await fetch(`${base(self)}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: HTTP ${res.status}`);
  return res.json();
}

class Socket {
  constructor() {
    this.ws = null;
    this.timer = null;
    this.self = null;
    this.closing = false;
  }

  connect(self) {
    this.self = self;
    this.closing = false;
    this.open();
  }

  open() {
    const self = this.self;
    if (!self) return;

    const url = `ws://${self.config.host}:${self.config.port}/ws`;
    let ws;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      self.log("error", `websocket could not be created: ${e.message}`);
      this.retry();
      return;
    }
    this.ws = ws;

    ws.on("open", () => {
      self.log("debug", `connected to ${url}`);
      // Status stays Connecting until the first snapshot: an open socket with
      // no fleet in it cannot drive a single button.
    });

    ws.on("message", (data) => {
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (message.type === "snapshot") {
        self.applySnapshot(message.devices, message.salvos);
      }
    });

    ws.on("close", () => {
      if (this.closing) return;
      self.setLink(false);
      self.updateStatus(
        InstanceStatus.Disconnected,
        "lost the crosspoint server",
      );
      this.retry();
    });

    ws.on("error", (e) => {
      self.log("debug", `websocket error: ${e.message}`);
      // 'close' always follows, and it owns the reconnect.
    });
  }

  retry() {
    if (this.closing) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.open(), RECONNECT_MS);
  }

  close() {
    this.closing = true;
    clearTimeout(this.timer);
    this.timer = null;
    try {
      this.ws?.close();
    } catch {
      /* already gone */
    }
    this.ws = null;
  }
}

export const socket = new Socket();
