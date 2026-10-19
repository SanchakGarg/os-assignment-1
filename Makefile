CC = gcc
CFLAGS = -Wall -Wextra -O2

all: restaurant gantt_chart

restaurant: main.c input.c sim.c sched.c metrics.c gantt.c restaurant.h gantt.h
	$(CC) $(CFLAGS) -o $@ main.c input.c sim.c sched.c metrics.c gantt.c

gantt_chart: gantt_chart.c gantt.c gantt.h
	$(CC) $(CFLAGS) -o $@ gantt_chart.c gantt.c

clean:
	rm -f restaurant gantt_chart
