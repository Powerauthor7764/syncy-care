import { sourceOf } from './data.js';
export function diffSnapshots(before, after) {
  const oldMap = new Map(before.map(x => [x.id, x]));
  const newMap = new Map(after.map(x => [x.id, x]));
  const out = [];
  for (const x of after) {
    const old = oldMap.get(x.id);
    if (!old) out.push({kind:'added', title:x.title, description:`${x.title} added (${x.status}).`, record:sourceOf(x), from:null, to:x.status});
    else if (old.status !== x.status) out.push({kind:'status', title:x.title, description:`${x.title}: ${old.status} → ${x.status}.`, record:sourceOf(x), from:old.status, to:x.status});
  }
  for (const x of before) if (!newMap.has(x.id)) out.push({kind:'removed',title:x.title,description:`${x.title} removed from today's snapshot.`,record:sourceOf(x),from:x.status,to:null});
  return out;
}
