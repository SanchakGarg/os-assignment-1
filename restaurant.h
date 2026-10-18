#ifndef RESTAURANT_H
#define RESTAURANT_H

#define CHEFS 2
#define MAXP 1000

typedef enum { NEW, READY, RUNNING, TERMINATED } State;

typedef struct {
    char id[32], category[32];
    int arrival, priority, service, remaining;
    int start, completion;
    State state;
} Process;

typedef int (*Picker)(Process *p, int n, int t);

int read_input(const char *file, Process *p, int *n, int *q);
void simulate(Process *p, int n, Picker pick);
void print_results(Process *p, int n);

int pick_fcfs(Process *p, int n, int t);
int pick_priority(Process *p, int n, int t);
int pick_sjf(Process *p, int n, int t);

#endif
