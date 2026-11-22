#pragma once

/*
 * One browser connection. After the WebSocket handshake:
 *   server -> hello
 *   client -> start {scheduler, allocator, orders, tick_ms}
 *   server -> started, then one frame per event time (paced), results, done
 * While running the client may send pause, resume, step, speed {tick_ms} or
 * stop, and may send a new start at any time. See docs/server.md.
 */
void run_session(int fd);
