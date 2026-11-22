/*
 * Turns server events into plain-English sentences for the audience, each
 * tagged with the OS idea it shows ([BLOCKED_MEMORY], [ROLLBACK], ...).
 */
(function () {
  const N = (RV.Narrate = {});

  /* Category decides the colour of the line in the caption and the log. */
  const KIND = {
    ARRIVE: "memory", MEMORY_BLOCK: "memory", MEMORY_ADMIT: "memory",
    DISPATCH: "cpu", COMPLETE: "done",
    RESOURCE_ACQUIRE: "equip", RESOURCE_WAIT: "equip", RESOURCE_BLOCK: "equip",
    RESOURCE_RELEASE: "equip", RESOURCE_UNBLOCK: "equip", RESOURCE_ROLLBACK: "prevent",
  };

  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const pretty = id => (id || "").replace("_", " ");

  /* "seats 2–3" / "seat 4" from a pool array and an owner. */
  function slots(pool, id, word) {
    const idx = [];
    (pool || []).forEach((owner, i) => owner === id && idx.push(i));
    if (!idx.length) return null;
    return idx.length === 1 ? `${word} ${idx[0]}` : `${word}s ${idx[0]}–${idx[idx.length - 1]}`;
  }

  /* Why the scheduler picked this order, in its own terms. */
  N.pickReason = function (scheduler, meta) {
    if (scheduler === "PRIORITY") return `highest priority (P${meta.priority}; 1 = most urgent)`;
    if (scheduler === "SJF") return `shortest job (${plural(meta.service, "unit")} of cooking)`;
    return `arrived first (at t=${meta.arrival})`;
  };

  N.schedulerRule = {
    FCFS: "first come, first served (earliest arrival)",
    PRIORITY: "lowest priority number first (1 = VIP), then earliest arrival",
    SJF: "shortest job first (fewest cooking units), then earliest arrival",
  };

  N.allocatorRule = {
    FIRST_FIT: "first gap that fits, scanning from seat 0",
    BEST_FIT: "smallest gap that fits (least left over)",
    WORST_FIT: "largest gap (biggest left over)",
  };

  /*
   * ev: the server event. ctx: { meta (id -> started process), frame (state
   * after this time), prev (state before), run (started message), events (the
   * whole list at this time, for look-ahead) , index }.
   * Returns { text, tag, kind }.
   */
  N.describe = function (ev, ctx) {
    const id = ev.process_id;
    const m = ctx.meta[id] || {};
    const chef = ev.chef_id !== null && ev.chef_id !== undefined ? `Chef ${ev.chef_id}` : null;
    const res = pretty(ev.resource);
    const holderOf = r => {
      const found = (ctx.frame.resources || []).find(x => x.id === r);
      return found && found.holder;
    };
    let text, tag;

    switch (ev.type) {
    case "ARRIVE": {
      const party = m.space_req === 1 ? "a party of 1" : `a party of ${m.space_req}`;
      const needs = m.table_req ? `${plural(m.space_req, "seat")} + ${plural(m.table_req, "table")}`
                                : `${plural(m.space_req, "seat")}, no table (takeaway)`;
      text = `${id} arrives: ${party} (${m.category}, P${m.priority}, ${plural(m.service, "unit")} of cooking). Needs ${needs}.`;
      tag = "NEW";
      break;
    }
    case "MEMORY_BLOCK": {
      const q = ctx.frame.queues.memory;
      const pos = q.indexOf(id);
      const seats = m.space_req === 1 ? "1 seat" : `${m.space_req} adjacent seats`;
      const tables = m.table_req === 0 ? "" : m.table_req === 1 ? " and 1 table" : ` and ${m.table_req} adjacent tables`;
      text = pos <= 0
        ? `No room for ${id}: it needs ${seats}${tables} and no such gap is free. It waits outside, first in line.`
        : `${id} joins the line outside (#${pos + 1}). The line is first-in first-out, so it waits behind ${q[0]} even if a gap would fit it.`;
      tag = "BLOCKED_MEMORY";
      break;
    }
    case "MEMORY_ADMIT": {
      const s = slots(ctx.frame.pools.SPACE, id, "seat");
      const t = slots(ctx.frame.pools.TABLE, id, "table");
      text = `${id} is seated at ${s}${t ? ` with ${t}` : " (takeaway, no table)"}. ${pretty(ctx.run.allocator)}: ${N.allocatorRule[ctx.run.allocator]}. The order goes to the kitchen.`;
      tag = "READY";
      break;
    }
    case "DISPATCH":
      text = `${chef} starts cooking ${id}. ${ctx.run.scheduler} picked it: ${N.pickReason(ctx.run.scheduler, m)}.`;
      tag = "RUNNING";
      break;
    case "RESOURCE_ACQUIRE":
      text = chef ? `${chef} takes the ${res} for ${id}.`
                  : `The ${res} is handed to ${id}, which was waiting for it.`;
      tag = "ACQUIRE";
      break;
    case "RESOURCE_WAIT": {
      const h = holderOf(ev.resource);
      text = `${id} needs the ${res}, but ${h && h !== id ? h + " is using it" : "it is busy"}. ${id} joins the ${res} line.`;
      tag = "WAIT";
      break;
    }
    case "RESOURCE_BLOCK":
      text = `${id} is blocked waiting for the ${res}. ${chef || "Its chef"} is free for other orders, and ${id} keeps its seats and anything it already holds.`;
      tag = "BLOCKED_RESOURCE";
      break;
    case "RESOURCE_RELEASE":
      text = `${id} is done with the ${res}.`;
      tag = "RELEASE";
      break;
    case "RESOURCE_ROLLBACK": {
      const next = (ctx.events || []).slice(ctx.index + 1).find(
        e => e.process_id === id && (e.type === "RESOURCE_WAIT" || e.type === "RESOURCE_ACQUIRE") && e.resource !== ev.resource);
      text = `Deadlock prevention: ${id} gives back the ${res} first${next ? ` so it can take the ${pretty(next.resource)} in rank order` : ""} (never wait while holding a higher-ranked unit).`;
      tag = "ROLLBACK";
      break;
    }
    case "RESOURCE_UNBLOCK":
      text = `${id} got the ${res} and is back in the ready queue.`;
      tag = "READY";
      break;
    case "COMPLETE": {
      const s = slots(ctx.prev.pools.SPACE, id, "seat");
      const t = slots(ctx.prev.pools.TABLE, id, "table");
      text = `${id} is served! The party leaves and ${[s, t].filter(Boolean).join(" and ")} ${s && t ? "are" : "is"} free again.`;
      tag = "TERMINATED";
      break;
    }
    default:
      text = `${ev.type} ${id}`;
      tag = ev.type;
    }
    return { text, tag, kind: KIND[ev.type] || "memory" };
  };

  /* What to say in a cycle where nothing new happens. */
  N.quiet = function (frame) {
    const cooking = (frame.chefs || []).map((o, c) => (o ? `Chef ${c} cooks ${o}` : null)).filter(Boolean);
    return cooking.length ? `${cooking.join(", ")}. Nothing else changes this cycle.`
                          : "Nothing happens this cycle. The restaurant waits for the next customer.";
  };
})();
