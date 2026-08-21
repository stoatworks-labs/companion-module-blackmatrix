import { InstanceBase, InstanceStatus, Regex } from "@companion-module/base";
import { UpgradeScripts } from "./upgrades.js";
import UpdateActions from "./actions.js";
import UpdateFeedbacks from "./feedbacks.js";
import UpdateVariableDefinitions, { variableValues } from "./variables.js";
import UpdatePresets from "./presets.js";
import { socket } from "./api.js";
import { aboutField } from "./about-field.js";
import { parseRef } from "./refs.js";

/**
 * A fingerprint of everything the definitions are built from: which switchers
 * exist, what buses and sources each has, and which salvos are defined.
 *
 * The server pushes a FULL snapshot on every change, roughly every 50ms under
 * load, so this is what separates "a crosspoint moved" (update values) from
 * "the fleet changed" (re-register several hundred definitions).
 */
export function shapeKey(devices, salvos) {
  return JSON.stringify([
    devices.map((device) => [
      device.id,
      device.name,
      device.matrix?.destinations?.map((destination) => [
        destination.id,
        destination.label,
      ]) ?? null,
      device.matrix?.sources?.map((source) => [source.id, source.label]) ??
        null,
    ]),
    salvos.map((salvo) => [
      salvo.id,
      salvo.name,
      salvo.crosspoints?.length ?? 0,
    ]),
  ]);
}

export default class ModuleInstance extends InstanceBase {
  constructor(internal) {
    super(internal);
    this.devices = [];
    this.salvos = [];
    this.link = false;
    /** X-Y panel selection, as `deviceId:destinationId`, or null. */
    this.selected = null;
    this.shape = "";
  }

  async init(config) {
    this.config = config;
    this.updateStatus(InstanceStatus.Connecting);
    this.rebuild();
    socket.connect(this);
  }

  async destroy() {
    socket.close();
  }

  async configUpdated(config) {
    this.config = config;
    socket.close();
    this.devices = [];
    this.salvos = [];
    this.link = false;
    this.shape = "";
    this.updateStatus(InstanceStatus.Connecting);
    this.rebuild();
    socket.connect(this);
  }

  getConfigFields() {
    return [
      {
        type: "static-text",
        id: "info",
        width: 12,
        label: "Connection",
        value:
          "ATEM Crosspoint's server, port 8533 by default. <b>There is no authentication and it binds every interface</b> — anyone who can reach that port can re-route program on a live switcher. Private production network only.",
      },
      {
        type: "textinput",
        id: "host",
        label: "Crosspoint host",
        width: 8,
        default: "127.0.0.1",
        regex: Regex.HOSTNAME,
      },
      {
        type: "textinput",
        id: "port",
        label: "Port",
        width: 4,
        default: "8533",
        regex: Regex.PORT,
      },
      {
        type: "static-text",
        id: "xyinfo",
        width: 12,
        label: "",
        value:
          "The generated presets are an <b>X-Y panel</b>: press a destination to select it, then press a source to take it. The selection lives in this Companion, so two Companions never fight over a pending destination. There are also plain one-button-one-crosspoint actions if you prefer.",
      },
      {
        type: "static-text",
        id: "lockinfo",
        width: 12,
        label: "",
        value:
          "Locks are held <b>per IP address</b>, which is how a Videohub does it. A lock taken from a browser on this machine is the same owner as one taken here, and 'force' takes someone else's.",
      },
      // Vendored from stoatworks-backend/about. A Companion module has no UI of
      // its own, so this config panel is the only surface it has.
      aboutField(),
    ];
  }

  /**
   * The only message the server sends. Definitions are re-registered when the
   * fleet's shape changed; otherwise this is values and feedbacks.
   */
  applySnapshot(devices, salvos) {
    this.devices = Array.isArray(devices) ? devices : [];
    this.salvos = Array.isArray(salvos) ? salvos : [];
    this.link = true;
    this.updateStatus(InstanceStatus.Ok);

    // A selected destination that no longer exists would leave every take
    // failing with an obscure error, so drop it as soon as it goes.
    const selected = parseRef(this.selected);
    if (selected) {
      const stillThere = this.devices
        .find((device) => device.id === selected.deviceId)
        ?.matrix?.destinations?.some(
          (destination) => destination.id === selected.id,
        );
      if (!stillThere) this.selected = null;
    }

    const shape = shapeKey(this.devices, this.salvos);
    if (shape !== this.shape) {
      this.shape = shape;
      this.rebuild();
      return;
    }

    this.refreshVariableValues();
    this.checkAllFeedbacks();
  }

  setLink(up) {
    this.link = Boolean(up);
    this.refreshVariableValues();
    this.checkAllFeedbacks();
  }

  selectDestination(reference) {
    this.selected = reference ? String(reference).trim() : null;
    this.refreshVariableValues();
    this.checkAllFeedbacks();
  }

  rebuild() {
    UpdateVariableDefinitions(this);
    UpdateActions(this);
    UpdateFeedbacks(this);
    UpdatePresets(this);
    this.refreshVariableValues();
    this.checkAllFeedbacks();
  }

  refreshVariableValues() {
    this.setVariableValues(variableValues(this));
  }
}

export { UpgradeScripts };
