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

  /* Chairs are not numbered on screen, so they are counted; tables are T1, T2, T3. */
  function chairs(pool, id) {
    const n = (pool || []).filter(o => o === id).length;
    return n ? (n === 1 ? "1 chair" : `${n} chairs side by side`) : null;
  }

  function tables(pool, id) {
    const names = [];
    (pool || []).forEach((owner, i) => owner === id && names.push(`T${i + 1}`));
    if (!names.length) return null;
    return names.length === 1 ? `table ${names[0]}` : `tables ${names.join(" + ")}`;
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
    FIRST_FIT: "first gap that fits, scanning from the left",
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
      const needs = m.table_req ? `${plural(m.space_req, "chair")} + ${plural(m.table_req, "table")}`
                                : `${plural(m.space_req, "chair")}, no table (takeaway)`;
      text = `${id} arrives: ${party} (${m.category}, P${m.priority}, ${plural(m.service, "unit")} of cooking). Needs ${needs}.`;
      tag = "NEW";
      break;
    }
    case "MEMORY_BLOCK": {
      const q = ctx.frame.queues.memory;
      const pos = q.indexOf(id);
      const seats = m.space_req === 1 ? "1 chair" : `${m.space_req} chairs side by side`;
      const tbl = m.table_req === 0 ? "" : m.table_req === 1 ? " and 1 table" : ` and ${m.table_req} tables side by side`;
      text = pos <= 0
        ? `No room for ${id}: it needs ${seats}${tbl} and no such gap is free. It waits outside, first in line.`
        : `${id} joins the line outside (#${pos + 1}). The line is first-in first-out, so it waits behind ${q[0]} even if a gap would fit it.`;
      tag = "BLOCKED_MEMORY";
      break;
    }
    case "MEMORY_ADMIT": {
      const s = chairs(ctx.frame.pools.SPACE, id);
      const t = tables(ctx.frame.pools.TABLE, id);
      text = `${id} comes in and takes ${s}${t ? ` and ${t}` : " (takeaway, no table)"}. ${pretty(ctx.run.allocator)}: ${N.allocatorRule[ctx.run.allocator]}. Its order goes up on the board.`;
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
      text = `${id} is blocked waiting for the ${res}. ${chef || "Its chef"} is free for other orders, and ${id} keeps its chairs, table and anything it already holds.`;
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
      const n = ctx.prev.pools.SPACE.filter(o => o === id).length;
      const t = tables(ctx.prev.pools.TABLE, id);
      text = t ? `${id} is served at ${t.replace("table ", "").replace("tables ", "")}! The party eats and leaves; ${plural(n, "chair")} and ${t} are free again.`
               : `${id} is ready! The party picks up its takeaway bag and leaves; ${plural(n, "chair")} ${n === 1 ? "is" : "are"} free again.`;
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
