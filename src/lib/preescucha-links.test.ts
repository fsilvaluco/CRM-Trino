import { test } from "node:test";
import assert from "node:assert/strict";
import { groupTrackPlays, parseRecipientNames } from "./preescucha-links";

test("parseRecipientNames: uno por linea, sin vacios ni repetidos", () => {
  assert.deepEqual(parseRecipientNames("María Pérez (Radio Uno)\n\n  Juan   Soto \r\nmaría pérez (radio uno)\n"), [
    "María Pérez (Radio Uno)",
    "Juan Soto",
  ]);
  assert.deepEqual(parseRecipientNames("   \n\n"), []);
});

test("groupTrackPlays: reproducciones por cancion de cada enlace; sin enlace = general", () => {
  const grouped = groupTrackPlays([
    { link_id: "a", track_id: "t1", event_type: "play", total: 3 },
    { link_id: "a", track_id: "t2", event_type: "play", total: 1 },
    { link_id: "a", track_id: "t1", event_type: "download", total: 5 },
    { link_id: "a", track_id: null, event_type: "view", total: 2 },
    { link_id: null, track_id: "t1", event_type: "play", total: 7 },
  ]);
  assert.deepEqual(grouped.get("a"), { t1: 3, t2: 1 });
  assert.deepEqual(grouped.get(""), { t1: 7 });
  assert.equal(grouped.get("b"), undefined);
});
