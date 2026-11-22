#ifndef FIRST_FIT_H
#define FIRST_FIT_H

/*
 * First Fit contiguous allocation (Anam).
 *
 * slots[i] == NULL means slot i is free; otherwise it holds the owner's ID.
 * Returns the index of the lowest-addressed slot that starts a run of at
 * least `size` consecutive free slots, or -1 if no such run exists.
 *
 * size == 0 (e.g. TABLE_REQ = 0) needs no slots: returns 0 and the caller
 * marks nothing. size < 0 or size > capacity returns -1.
 *
 * This function only searches; it never modifies the pool. The caller
 * (Sanchak's admission code) checks BOTH pools before committing either, so
 * a failure in one pool never leaves a partial allocation in the other.
 */
int first_fit(const char *const slots[], int capacity, int size);

#endif
