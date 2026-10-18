CC = gcc
CFLAGS = -Wall -Wextra -O2
restaurant: main.c input.c sim.c sched.c metrics.c restaurant.h
	$(CC) $(CFLAGS) -o $@ main.c input.c sim.c sched.c metrics.c
clean:
	rm -f restaurant
