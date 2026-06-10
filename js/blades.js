// The Living Blade — you choose one sword at the start of a run, and it grows
// with you. Each blade has a SIGNATURE that defines how the run feels, and it
// EVOLVES at floors 5 / 10 / 15 (you pick one of two upgrades each time).
// Effects are implemented in game.js, keyed by these ids (player.blade /
// player.bladeUp).

export const BLADE_MILESTONES = [5, 10, 15];

export const BLADES = [
  {
    id: 'ember', name: 'Emberbrand', color: '#ff7a2a', element: 'FIRE',
    style: 'AGGRESSION — light them up, watch them burn',
    pips: { fer: 5, ctl: 2, tmp: 3 },
    flavor: "Forged in a dragon's gullet; it never truly cools.",
    sig: 'Sword hits SET FOES ABLAZE, burning them over time.',
    tiers: [
      [ { id: 'ember_hotter', name: 'Stoked Flame', desc: 'Burn deals +70% damage.' },
        { id: 'ember_spread', name: 'Wildfire', desc: 'Foes slain while burning ignite those near them.' } ],
      [ { id: 'ember_pyre', name: 'Funeral Pyre', desc: 'Burning foes erupt in flame when slain.' },
        { id: 'ember_soul', name: 'Kindled Fury', desc: 'Every burn tick stokes your Fury.' } ],
      [ { id: 'ember_trail', name: 'Trail of Cinders', desc: 'Your swing leaves lingering flames on the ground.' },
        { id: 'ember_exec', name: 'Immolation', desc: 'Burning foes under 40% HP burn to ash instantly.' } ],
    ],
  },
  {
    id: 'frost', name: 'Frostfang', color: '#8fd6ff', element: 'FROST',
    style: 'CONTROL — chill, freeze, then shatter',
    pips: { fer: 3, ctl: 5, tmp: 2 },
    flavor: 'Quenched in a lake that has never thawed.',
    sig: 'Hits CHILL foes; a third hit FREEZES them solid — strike the frozen to SHATTER.',
    tiers: [
      [ { id: 'frost_brittle', name: 'Brittle', desc: 'Shatter detonates for far more damage.' },
        { id: 'frost_quick', name: 'Deep Cold', desc: 'Foes freeze in two hits instead of three.' } ],
      [ { id: 'frost_spread', name: 'Cold Snap', desc: 'Shattering a foe chills everything nearby.' },
        { id: 'frost_vuln', name: 'Frostbite', desc: 'Chilled foes take +25% damage from everything.' } ],
      [ { id: 'frost_chain', name: 'Cascade', desc: 'A shatter chains to other frozen foes nearby.' },
        { id: 'frost_aura', name: 'Permafrost', desc: 'A chilling aura slows everything around you.' } ],
    ],
  },
  {
    id: 'storm', name: 'Stormedge', color: '#b9a6ff', element: 'STORM',
    style: 'TEMPO — chains, crits, momentum',
    pips: { fer: 4, ctl: 2, tmp: 5 },
    flavor: 'A caged tempest, loosed with every swing.',
    sig: 'Sword hits ARC LIGHTNING to a nearby foe.',
    tiers: [
      [ { id: 'storm_fork', name: 'Forked Bolt', desc: 'Lightning arcs to two foes instead of one.' },
        { id: 'storm_dash', name: 'Ride the Lightning', desc: 'Dashing looses an arc at the nearest foe.' } ],
      [ { id: 'storm_stun', name: 'Concussion', desc: 'Struck foes are briefly stunned.' },
        { id: 'storm_build', name: 'Static Charge', desc: 'Every 12 hits release a shocking nova around you.' } ],
      [ { id: 'storm_tempest', name: 'Tempest', desc: 'Lightning arcs to four foes.' },
        { id: 'storm_crit', name: 'Thunderstrike', desc: 'Arcs can strike critically for triple damage.' } ],
    ],
  },
];

export function bladeById(id) { return BLADES.find((b) => b.id === id) || null; }
