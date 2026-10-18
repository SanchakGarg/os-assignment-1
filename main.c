#include <stdio.h>
#include <string.h>
#include "restaurant.h"

int main(int argc, char **argv)
{
    static Process p[MAXP];
    int n, q;
    Picker pick;

    if (argc != 3) { fprintf(stderr, "usage: %s INPUT_FILE FCFS|PRIORITY|SJF\n", argv[0]); return 1; }
    if (!strcmp(argv[2], "FCFS")) pick = pick_fcfs;
    else if (!strcmp(argv[2], "PRIORITY")) pick = pick_priority;
    else if (!strcmp(argv[2], "SJF")) pick = pick_sjf;
    else { fprintf(stderr, "unknown algorithm: %s\n", argv[2]); return 1; }
    if (read_input(argv[1], p, &n, &q)) { fprintf(stderr, "bad input file\n"); return 1; }

    simulate(p, n, pick);
    print_results(p, n);
    return 0;
}
