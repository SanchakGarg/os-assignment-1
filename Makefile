CC = gcc
CFLAGS = -Wall -Wextra -O2

all: restaurant gantt_chart

restaurant: main.c input.c sim.c sched.c metrics.c restaurant.h
	$(CC) $(CFLAGS) -o $@ main.c input.c sim.c sched.c metrics.c

gantt_chart: gantt_chart.c
	$(CC) $(CFLAGS) -o $@ gantt_chart.c

clean:
	rm -f restaurant gantt_chart
