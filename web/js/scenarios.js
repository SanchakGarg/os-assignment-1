/* Sample inputs for the menu, copied from tests/ (paths in `source`). */
(function () {
  RV.SCENARIOS = [
    {
      key: "integrated", title: "Everything together", source: "tests/a3/integrated.txt",
      about: "6 orders. O3 waits outside because O1 and O2 hold 5 of the 6 seats. O1 blocks on OVEN_1, which O2 is using. All four machines get used.",
      suggest: { scheduler: "FCFS", allocator: "FIRST_FIT", unsafe: false },
      text: "6\n2\nO1,0,2,5,NORMAL,3,1\nO2,0,1,4,VIP,2,1\nO3,1,2,3,NORMAL,2,1\nO4,2,1,2,VIP,1,0\nO5,3,3,4,NORMAL,1,1\nO6,4,2,3,NORMAL,2,0\n4\nCOFFEE_MACHINE,1\nMICROWAVE,1\nOVEN_1,1\nOVEN_2,1\n14\nO1,1,ACQUIRE,OVEN_1,1\nO1,4,RELEASE,OVEN_1,1\nO2,0,ACQUIRE,OVEN_1,1\nO2,2,RELEASE,OVEN_1,1\nO3,0,ACQUIRE,MICROWAVE,1\nO3,1,ACQUIRE,OVEN_2,1\nO3,3,RELEASE,OVEN_2,1\nO3,3,RELEASE,MICROWAVE,1\nO4,0,ACQUIRE,COFFEE_MACHINE,1\nO4,2,RELEASE,COFFEE_MACHINE,1\nO5,1,ACQUIRE,COFFEE_MACHINE,1\nO5,2,RELEASE,COFFEE_MACHINE,1\nO6,0,ACQUIRE,OVEN_2,1\nO6,3,RELEASE,OVEN_2,1\n"
    },
    {
      key: "contention", title: "Two orders, one oven", source: "tests/a3/contention_same_oven.txt",
      about: "O1 and O2 both need OVEN_1 at the same moment. One gets it. The other blocks and hands its chef back, but keeps its seat and table.",
      suggest: { scheduler: "FCFS", allocator: "FIRST_FIT", unsafe: false },
      text: "2\n2\nO1,0,1,4,NORMAL,1,1\nO2,0,2,4,NORMAL,1,1\n1\nOVEN_1,1\n4\nO1,1,ACQUIRE,OVEN_1,1\nO1,3,RELEASE,OVEN_1,1\nO2,1,ACQUIRE,OVEN_1,1\nO2,3,RELEASE,OVEN_1,1\n"
    },
    {
      key: "independent", title: "Two ovens, no waiting", source: "tests/a3/independent_ovens.txt",
      about: "O1 uses OVEN_1 and O2 uses OVEN_2 at the same time. Different resources never block each other.",
      suggest: { scheduler: "FCFS", allocator: "FIRST_FIT", unsafe: false },
      text: "2\n2\nO1,0,1,4,NORMAL,1,1\nO2,0,1,4,NORMAL,1,1\n2\nOVEN_1,1\nOVEN_2,1\n4\nO1,0,ACQUIRE,OVEN_1,1\nO1,3,RELEASE,OVEN_1,1\nO2,0,ACQUIRE,OVEN_2,1\nO2,3,RELEASE,OVEN_2,1\n"
    },
    {
      key: "deadlock", title: "Deadlock (circular wait)", source: "tests/a3/deadlock_unsafe.txt",
      about: "O1 takes MICROWAVE then OVEN_1; O2 takes OVEN_1 then MICROWAVE. With prevention OFF they deadlock and the run stops. With it ON, O2 rolls back and both finish.",
      suggest: { scheduler: "FCFS", allocator: "FIRST_FIT", unsafe: true },
      text: "2\n2\nO1,0,1,4,NORMAL,1,1\nO2,0,1,4,NORMAL,1,1\n2\nMICROWAVE,1\nOVEN_1,1\n8\nO1,0,ACQUIRE,MICROWAVE,1\nO1,1,ACQUIRE,OVEN_1,1\nO1,3,RELEASE,OVEN_1,1\nO1,4,RELEASE,MICROWAVE,1\nO2,0,ACQUIRE,OVEN_1,1\nO2,1,ACQUIRE,MICROWAVE,1\nO2,3,RELEASE,MICROWAVE,1\nO2,4,RELEASE,OVEN_1,1\n"
    },
    {
      key: "safe_order", title: "Same orders, safe order", source: "tests/a3/deadlock_safe_order.txt",
      about: "Both orders take MICROWAVE before OVEN_1 (the global rank order), so no cycle can form. O2 simply waits.",
      suggest: { scheduler: "FCFS", allocator: "FIRST_FIT", unsafe: false },
      text: "2\n2\nO1,0,1,4,NORMAL,1,1\nO2,0,1,4,NORMAL,1,1\n2\nMICROWAVE,1\nOVEN_1,1\n8\nO1,0,ACQUIRE,MICROWAVE,1\nO1,1,ACQUIRE,OVEN_1,1\nO1,3,RELEASE,OVEN_1,1\nO1,4,RELEASE,MICROWAVE,1\nO2,0,ACQUIRE,MICROWAVE,1\nO2,1,ACQUIRE,OVEN_1,1\nO2,3,RELEASE,OVEN_1,1\nO2,4,RELEASE,MICROWAVE,1\n"
    },
    {
      key: "hold_wait", title: "Hold and wait", source: "tests/a3/edge/11_blocked_while_holding.txt",
      about: "B holds the MICROWAVE while it waits for OVEN_1. Its chef is freed and starts C at once.",
      suggest: { scheduler: "FCFS", allocator: "FIRST_FIT", unsafe: false },
      text: "3\n2\nA,0,1,6,NORMAL,1,1\nB,0,1,6,NORMAL,1,1\nC,0,2,3,NORMAL,1,0\n2\nMICROWAVE,1\nOVEN_1,1\n6\nA,0,ACQUIRE,OVEN_1,1\nA,4,RELEASE,OVEN_1,1\nB,0,ACQUIRE,MICROWAVE,1\nB,1,ACQUIRE,OVEN_1,1\nB,3,RELEASE,OVEN_1,1\nB,6,RELEASE,MICROWAVE,1\n"
    },
    {
      key: "allocators", title: "First Fit vs Best Fit", source: "tests/a3/allocator_difference.txt",
      about: "Run it with FIRST_FIT, then BEST_FIT. B2 waits 7 cycles outside with First Fit and none with Best Fit, which uses the exact 1-seat gap for B1.",
      suggest: { scheduler: "FCFS", allocator: "BEST_FIT", unsafe: false },
      text: "6\n2\nA1,0,1,1,NORMAL,2,0\nA2,0,1,10,NORMAL,1,0\nA3,0,1,1,NORMAL,1,0\nA4,0,1,10,NORMAL,2,0\nB1,3,1,2,NORMAL,1,1\nB2,3,1,2,NORMAL,2,1\n"
    },
    {
      key: "rush_hour", title: "Rush hour (10 orders)", source: "tests/a2/comparison_a2.txt",
      about: "10 orders and only 6 seats, so 8 of them wait outside. At t=2, O4 (1 seat) fits but waits behind O3 at the head of the line (head-of-line blocking). Compare FCFS, PRIORITY and SJF.",
      suggest: { scheduler: "SJF", allocator: "FIRST_FIT", unsafe: false },
      text: "10\n2\nO1,0,3,8,NORMAL,3,1\nO2,0,2,4,NORMAL,2,1\nO3,1,1,6,VIP,2,1\nO4,2,3,2,NORMAL,1,0\nO5,3,2,10,NORMAL,3,2\nO6,4,1,3,VIP,1,1\nO7,5,3,1,NORMAL,1,0\nO8,6,2,5,NORMAL,2,1\nO9,7,1,7,VIP,2,1\nO10,8,3,3,NORMAL,1,0\n"
    },
  ];
})();
